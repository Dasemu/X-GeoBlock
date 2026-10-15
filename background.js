if (typeof XGeoConfig === "undefined") importScripts("lib/config.js");

const extensionApi = globalThis.browser || chrome;

const CACHE_KEY = "userCache";
const FRAME_RULE_ID = 1;
const activeRequests = new Map();
const pendingFrameLookups = new Map();
let queueTail = Promise.resolve();
let lastRequestAt = 0;

extensionApi.runtime.onInstalled.addListener(async () => {
  const current = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  await extensionApi.storage.sync.set(current);
  await ensureFrameRule();
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
  if (message?.type === "about-page-result") {
    finishFrameLookup(message);
    sendResponse({ ok: true });
    return false;
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
  return lookupViaBackgroundFrame(username);
}

async function parseFetchedHtml(html, username) {
  if (typeof DOMParser !== "undefined" && typeof XGeoParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    return XGeoParser.parseAboutDocument(document, username);
  }
  await ensureOffscreenDocument();
  return extensionApi.runtime.sendMessage({ type: "parse-about-html", html, username });
}

async function lookupViaBackgroundFrame(username) {
  const key = username.toLowerCase();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFrameLookups.delete(key);
      removeBackgroundFrame(key);
      reject(new Error(`Timed out while rendering @${username}'s About page in the background`));
    }, 25000);
    pendingFrameLookups.set(key, { resolve, reject, timer });
    createBackgroundFrame(username).catch((error) => {
      clearTimeout(timer);
      pendingFrameLookups.delete(key);
      reject(error);
    });
  });
}

function finishFrameLookup(message) {
  const key = String(message.username).toLowerCase();
  const pending = pendingFrameLookups.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingFrameLookups.delete(key);
  pending.resolve({
    country: message.country || null,
    following: message.following === true,
    profileLocation: message.profileLocation || null
  });
  removeBackgroundFrame(key);
}

async function createBackgroundFrame(username) {
  await ensureFrameRule();
  if (typeof document !== "undefined") {
    const frame = document.createElement("iframe");
    frame.dataset.xGeoBlockUser = username.toLowerCase();
    frame.hidden = true;
    frame.src = `https://x.com/${encodeURIComponent(username)}/about`;
    document.body.append(frame);
    return;
  }
  await ensureOffscreenDocument();
  await extensionApi.runtime.sendMessage({ type: "create-about-frame", username });
}

let frameRulePromise;
function ensureFrameRule() {
  if (!frameRulePromise) {
    frameRulePromise = extensionApi.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [FRAME_RULE_ID],
      addRules: [{
        id: FRAME_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          responseHeaders: [
            { header: "x-frame-options", operation: "remove" },
            { header: "content-security-policy", operation: "remove" }
          ]
        },
        condition: {
          urlFilter: "||x.com/",
          resourceTypes: ["sub_frame"],
          tabIds: [-1]
        }
      }]
    }).catch((error) => {
      frameRulePromise = null;
      throw error;
    });
  }
  return frameRulePromise;
}

function removeBackgroundFrame(username) {
  if (typeof document !== "undefined") {
    document.querySelector(`iframe[data-x-geo-block-user="${CSS.escape(username)}"]`)?.remove();
    return;
  }
  extensionApi.runtime.sendMessage({ type: "remove-about-frame", username }).catch(() => {});
}

async function ensureOffscreenDocument() {
  const url = extensionApi.runtime.getURL("offscreen/offscreen.html");
  const clients = await self.clients.matchAll();
  if (clients.some((client) => client.url === url)) return;
  await extensionApi.offscreen.createDocument({
    url: "offscreen/offscreen.html",
    reasons: ["DOM_PARSER", "IFRAME_SCRIPTING"],
    justification: "Parse and render account About pages entirely in the extension background."
  });
}
