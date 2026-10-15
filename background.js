if (typeof XGeoConfig === "undefined") importScripts("lib/config.js");

const extensionApi = globalThis.browser || chrome;

const CACHE_KEY = "userCache";
const activeRequests = new Map();
const pendingTabLookups = new Map();
let queueTail = Promise.resolve();
let lastRequestAt = 0;

extensionApi.runtime.onInstalled.addListener(async () => {
  const current = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  await extensionApi.storage.sync.set(current);
});

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  if (message?.type === "about-page-result" && Number.isInteger(sender?.tab?.id)) {
    finishTabLookup(sender.tab.id, message);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

extensionApi.tabs.onRemoved.addListener((tabId) => {
  const pending = pendingTabLookups.get(tabId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingTabLookups.delete(tabId);
  pending.reject(new Error("The background About tab closed before X loaded the account data"));
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
  if (cached && (cached.country || cached.following === true)) {
    return decision(cached, settings, true);
  }

  const result = await enqueue(() => fetchAbout(username));
  const record = { ...result, checkedAt: Date.now() };
  if (record.country || record.following === true) {
    cache[key] = record;
    await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
  } else if (cached) {
    delete cache[key];
    await extensionApi.storage.local.set({ [CACHE_KEY]: cache });
  }
  return decision(record, settings, false);
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
  try {
    const response = await fetch(`https://x.com/${encodeURIComponent(username)}/about`, {
      credentials: "include",
      headers: { "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow"
    });
    if (response.ok && !/\/i\/flow\/login/i.test(response.url)) {
      const parsed = await parseFetchedHtml(await response.text(), username);
      if (parsed?.country) return parsed;
    }
  } catch (_) {
    // X frequently serves an incomplete SPA shell to extension fetches.
  }
  return lookupViaBackgroundTab(username);
}

async function parseFetchedHtml(html, username) {
  if (typeof DOMParser !== "undefined" && typeof XGeoParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    return XGeoParser.parseAboutDocument(document, username);
  }
  await ensureOffscreenDocument();
  return extensionApi.runtime.sendMessage({ type: "parse-about-html", html, username });
}

async function lookupViaBackgroundTab(username) {
  const tab = await extensionApi.tabs.create({
    url: `https://x.com/${encodeURIComponent(username)}/about`,
    active: false
  });
  if (!Number.isInteger(tab.id)) throw new Error("The browser did not create the background About tab");

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTabLookups.delete(tab.id);
      extensionApi.tabs.remove(tab.id).catch(() => {});
      reject(new Error(`Timed out while loading @${username}'s About page`));
    }, 25000);
    pendingTabLookups.set(tab.id, { username: username.toLowerCase(), resolve, reject, timer });
  });
}

function finishTabLookup(tabId, message) {
  const pending = pendingTabLookups.get(tabId);
  if (!pending || String(message.username).toLowerCase() !== pending.username) return;
  clearTimeout(pending.timer);
  pendingTabLookups.delete(tabId);
  pending.resolve({
    country: message.country || null,
    following: message.following === true,
    profileLocation: message.profileLocation || null
  });
  extensionApi.tabs.remove(tabId).catch(() => {});
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
