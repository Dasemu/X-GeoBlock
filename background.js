if (typeof XGeoConfig === "undefined") importScripts("lib/config.js");

const extensionApi = globalThis.browser || chrome;

const CACHE_KEY = "userCache";
const activeRequests = new Map();
let queueTail = Promise.resolve();
let lastRequestAt = 0;

extensionApi.runtime.onInstalled.addListener(async () => {
  const current = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  await extensionApi.storage.sync.set(current);
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "lookup-user") {
    lookupUser(message.username).then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }
  if (message?.type === "clear-cache") {
    extensionApi.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

function validUsername(username) {
  return typeof username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(username);
}

async function lookupUser(username) {
  if (!validUsername(username)) return { ok: false, error: "Invalid username" };
  const key = username.toLowerCase();
  if (activeRequests.has(key)) return activeRequests.get(key);

  const promise = lookupUserInternal(username, key).finally(() => activeRequests.delete(key));
  activeRequests.set(key, promise);
  return promise;
}

async function lookupUserInternal(username, key) {
  const settings = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  const stored = await extensionApi.storage.local.get(CACHE_KEY);
  const cache = stored[CACHE_KEY] || {};
  const cached = cache[key];
  const ttl = Math.max(1, Number(settings.cacheTtlHours) || 168) * 60 * 60 * 1000;
  if (cached && Date.now() - cached.checkedAt < ttl) {
    return decision(cached, settings, true);
  }

  const result = await enqueue(() => fetchAbout(username));
  cache[key] = { ...result, checkedAt: Date.now() };
  pruneCache(cache);
  await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
  return decision(cache[key], settings, false);
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
  const run = queueTail.then(async () => {
    const delay = Math.max(0, 350 - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
    return task();
  });
  queueTail = run.catch(() => {});
  return run;
}

async function fetchAbout(username) {
  const response = await fetch(`https://x.com/${encodeURIComponent(username)}/about`, {
    credentials: "include",
    headers: { "Accept-Language": "en-US,en;q=0.9" },
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`X returned HTTP ${response.status}`);
  const html = await response.text();
  if (/\/i\/flow\/login/i.test(response.url)) throw new Error("X authentication is required");
  if (typeof DOMParser !== "undefined" && typeof XGeoParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    return XGeoParser.parseAboutDocument(document, username);
  }
  await ensureOffscreenDocument();
  return extensionApi.runtime.sendMessage({ type: "parse-about-html", html, username });
}

async function ensureOffscreenDocument() {
  const url = extensionApi.runtime.getURL("offscreen/offscreen.html");
  const clients = await self.clients.matchAll();
  if (clients.some((client) => client.url === url)) return;
  await extensionApi.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["DOM_PARSER"],
    justification: "Parse the account About page without opening a visible tab."
  });
}

function pruneCache(cache) {
  const entries = Object.entries(cache);
  if (entries.length <= 2000) return;
  entries.sort((a, b) => (b[1].checkedAt || 0) - (a[1].checkedAt || 0));
  for (const [key] of entries.slice(1500)) delete cache[key];
}
