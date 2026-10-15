if (typeof XGeoConfig === "undefined") importScripts("lib/config.js", "lib/cloud-cache.js");

const extensionApi = globalThis.browser || chrome;

const CACHE_KEY = "userCache";
const LOCAL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const activeRequests = new Map();
const pendingFrameLookups = new Map();
const requestQueue = [];
let runningRequests = 0;
let lastRequestAt = 0;
const MAX_CONCURRENT_REQUESTS = 3;

extensionApi.runtime.onInstalled.addListener(async () => {
  const current = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  await extensionApi.storage.sync.set(current);
});

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "lookup-user") {
    lookupUser(message.username, message.followingHint, sender?.tab?.id).then(sendResponse).catch(async (error) => {
      const { debugMode } = await extensionApi.storage.sync.get({ debugMode: false });
      emitDebug(sender?.tab?.id, debugMode, "Lookup failed", { username: message.username, error: error.message });
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }
  if (message?.type === "clear-cache") {
    extensionApi.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "about-page-result") {
    finishFrameLookup(message, sender?.tab?.id);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

function validUsername(username) {
  return typeof username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(username);
}

async function lookupUser(username, followingHint = null, tabId = null) {
  if (!validUsername(username)) return { ok: false, error: "Invalid username" };
  const key = username.toLowerCase();
  if (activeRequests.has(key)) return activeRequests.get(key);

  const promise = lookupUserInternal(username, key, followingHint, tabId).finally(() => activeRequests.delete(key));
  activeRequests.set(key, promise);
  return promise;
}

async function lookupUserInternal(username, key, followingHint, tabId) {
  const settings = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  emitDebug(tabId, settings.debugMode, "Lookup started", { username, followingHint });
  const stored = await extensionApi.storage.local.get(CACHE_KEY);
  const cache = stored[CACHE_KEY] || {};
  const cached = cache[key];
  const cacheFresh = cached && Date.now() - Number(cached.checkedAt || 0) < LOCAL_CACHE_TTL_MS;
  if (cacheFresh && (cached.country || cached.following === true)) {
    emitDebug(tabId, settings.debugMode, "Local cache hit", { username, country: cached.country, following: cached.following, source: cached.source || "direct" });
    return decision(cached, settings, true);
  }
  if (cached) {
    emitDebug(tabId, settings.debugMode, "Local cache expired or invalid", { username, checkedAt: cached.checkedAt || null });
    delete cache[key];
    await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
  } else emitDebug(tabId, settings.debugMode, "Local cache miss", { username });

  if (followingHint === true) {
    emitDebug(tabId, settings.debugMode, "Author is followed; allowing post", { username });
    return decision({ country: null, following: true }, settings, false);
  }
  if (followingHint === false && settings.cloudCacheEndpoint) {
    try {
      emitDebug(tabId, settings.debugMode, "Cloud cache lookup", { username, endpoint: settings.cloudCacheEndpoint });
      const cloud = await XGeoCloud.lookup(settings.cloudCacheEndpoint, [key]);
      const hit = cloud.get(key);
      if (hit?.status === "confirmed" && hit.location) {
        emitDebug(tabId, settings.debugMode, "Cloud cache hit", { username, country: hit.location, confidence: hit.confidence, confirmations: hit.confirmations });
        const record = { country: hit.location, following: false, checkedAt: Date.now(), source: "cloud" };
        cache[key] = record;
        await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
        return decision(record, settings, false);
      }
      emitDebug(tabId, settings.debugMode, "Cloud cache miss", { username });
    } catch (error) {
      emitDebug(tabId, settings.debugMode, "Cloud cache error; falling back to X", { username, error: error.message });
      // Cloud cache failure must never prevent the direct X lookup.
    }
  }

  emitDebug(tabId, settings.debugMode, "Direct X lookup started", { username });
  const lookupLog = (event, data = {}) => emitDebug(tabId, settings.debugMode, event, { username, ...data });
  const result = await enqueue(() => fetchAbout(username, lookupLog, tabId));
  const record = { ...result, checkedAt: Date.now() };
  emitDebug(tabId, settings.debugMode, "Direct X lookup completed", { username, country: record.country, following: record.following });
  if (record.country || record.following === true) {
    cache[key] = record;
    await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
  } else if (cached) {
    delete cache[key];
    await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
  }
  if (record.country && settings.contributeCloudCache && settings.cloudCacheEndpoint) {
    emitDebug(tabId, settings.debugMode, "Cloud contribution queued", { username, country: record.country });
    XGeoCloud.report(settings.cloudCacheEndpoint, key, record.country, extensionApi.runtime.getManifest().version)
      .then(() => emitDebug(tabId, settings.debugMode, "Cloud contribution accepted", { username }))
      .catch((error) => emitDebug(tabId, settings.debugMode, "Cloud contribution failed", { username, error: error.message }));
  }
  const finalDecision = decision(record, settings, false);
  emitDebug(tabId, settings.debugMode, "Decision", { username, country: finalDecision.country, following: finalDecision.following, blocked: finalDecision.blocked });
  return finalDecision;
}

function emitDebug(tabId, enabled, event, data = {}) {
  if (!enabled) return;
  console.info("[X GeoBlock]", event, data);
  if (Number.isInteger(tabId)) {
    extensionApi.tabs.sendMessage(tabId, { type: "debug-event", event, data }).catch(() => {});
  }
}

function decision(record, settings, cached) {
  return {
    ok: true,
    country: record.country,
    following: record.following === true,
    blocked: record.following !== true && XGeoConfig.isBlacklisted(record.country, settings.blacklist),
    cached
  };
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ task, resolve, reject });
    drainQueue();
  });
}

function drainQueue() {
  while (runningRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length) {
    const entry = requestQueue.shift();
    runningRequests += 1;
    const scheduledAt = Math.max(Date.now(), lastRequestAt + 350);
    lastRequestAt = scheduledAt;
    const delay = scheduledAt - Date.now();
    setTimeout(async () => {
      try { entry.resolve(await entry.task()); }
      catch (error) { entry.reject(error); }
      finally {
        runningRequests -= 1;
        drainQueue();
      }
    }, delay);
  }
}

async function fetchAbout(username, log = () => {}, tabId = null) {
  try {
    const response = await fetch(`https://x.com/${encodeURIComponent(username)}/about`, {
      credentials: "include",
      headers: { "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow"
    });
    log("Background HTTP response", { status: response.status, finalUrl: response.url });
    if (response.ok && !/\/i\/flow\/login/i.test(response.url)) {
      const parsed = await parseFetchedHtml(await response.text(), username);
      log("Background HTML parsed", { country: parsed?.country || null, following: parsed?.following ?? null });
      if (parsed?.country) return parsed;
    }
  } catch (error) {
    log("Background HTTP lookup failed", { error: error.message });
    // X frequently serves an incomplete SPA shell to extension fetches.
  }
  log("Falling back to same-origin hidden frame");
  return lookupViaPageFrame(username, tabId, log);
}

async function parseFetchedHtml(html, username) {
  if (typeof DOMParser !== "undefined" && typeof XGeoParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    return XGeoParser.parseAboutDocument(document, username);
  }
  await ensureOffscreenDocument();
  return extensionApi.runtime.sendMessage({ type: "parse-about-html", html, username });
}

async function lookupViaPageFrame(username, tabId, log = () => {}) {
  if (!Number.isInteger(tabId)) throw new Error("No X tab is available for the rendered About lookup");
  const key = username.toLowerCase();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFrameLookups.delete(key);
      removePageFrame(tabId, key);
      log("Same-origin hidden frame timed out");
      reject(new Error(`Timed out while rendering @${username}'s About page`));
    }, 25000);
    pendingFrameLookups.set(key, { resolve, reject, timer, log, tabId });
    extensionApi.tabs.sendMessage(tabId, { type: "create-about-frame", username })
      .then(() => log("Same-origin hidden frame created")).catch((error) => {
      clearTimeout(timer);
      pendingFrameLookups.delete(key);
      reject(error);
    });
  });
}

function finishFrameLookup(message, tabId) {
  const key = String(message.username).toLowerCase();
  const pending = pendingFrameLookups.get(key);
  if (!pending || pending.tabId !== tabId) return;
  pending.log("Rendered About page reported a result", { country: message.country || null, following: message.following ?? null });
  clearTimeout(pending.timer);
  pendingFrameLookups.delete(key);
  pending.resolve({
    country: message.country || null,
    following: message.following === true,
    profileLocation: message.profileLocation || null
  });
  removePageFrame(tabId, key);
}

function removePageFrame(tabId, username) {
  extensionApi.tabs.sendMessage(tabId, { type: "remove-about-frame", username }).catch(() => {});
}

async function ensureOffscreenDocument() {
  const url = extensionApi.runtime.getURL("offscreen/offscreen.html");
  const clients = await self.clients.matchAll();
  if (clients.some((client) => client.url === url)) return;
  await extensionApi.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["DOM_PARSER"],
    justification: "Parse account About HTML without opening a visible page."
  });
}
