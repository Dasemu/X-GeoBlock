"use strict";

const extensionApi = globalThis.browser || chrome;
const processed = new WeakSet();
const hiddenByUser = new Map();
let settings = { enabled: true, showPlaceholder: false, debugMode: false };
let scanQueued = false;

initialize();

async function initialize() {
  const aboutMatch = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/about\/?$/);
  if (aboutMatch) {
    reportRenderedAboutPage(aboutMatch[1]);
    return;
  }
  if (window.top !== window) return;
  settings = await extensionApi.storage.sync.get({ enabled: true, showPlaceholder: false, debugMode: false });
  debug("Content script initialized", { url: location.href });
  scan(document);
  new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) scheduleScan();
  }).observe(document.documentElement, { childList: true, subtree: true });
}

function reportRenderedAboutPage(username) {
  const startedAt = Date.now();
  const inspect = () => {
    const result = XGeoParser.parseAboutDocument(document, username);
    if (result.country) {
      extensionApi.runtime.sendMessage({ type: "about-page-result", username, ...result }).catch(() => {});
      return true;
    }
    return Date.now() - startedAt >= 24000;
  };
  if (inspect()) return;
  const observer = new MutationObserver(() => {
    if (inspect()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setTimeout(() => observer.disconnect(), 24500);
}

extensionApi.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled) settings.enabled = changes.enabled.newValue;
  if (changes.showPlaceholder) settings.showPlaceholder = changes.showPlaceholder.newValue;
  if (changes.debugMode) settings.debugMode = changes.debugMode.newValue;
  restoreAll();
  document.querySelectorAll("article").forEach((article) => processed.delete(article));
  if (settings.enabled) scheduleScan();
});

extensionApi.runtime.onMessage.addListener((message) => {
  if (message?.type === "debug-event" && settings.debugMode) {
    console.debug("[X GeoBlock]", message.event, message.data || {});
  }
});

function scheduleScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scan(document);
  });
}

function scan(root) {
  if (!settings.enabled) return;
  const articles = root.matches?.("article") ? [root] : root.querySelectorAll?.("article") || [];
  for (const article of articles) processArticle(article);
}

async function processArticle(article) {
  if (processed.has(article)) return;
  const identity = getTweetIdentity(article);
  if (!identity) return;
  debug("Post author detected", identity);
  processed.add(article);
  article.dataset.xGeoBlockState = "checking";

  try {
    const followingHint = await getFollowingHint(article, identity.username);
    debug("Following hint resolved", { username: identity.username, followingHint });
    const result = await extensionApi.runtime.sendMessage({ type: "lookup-user", username: identity.username, followingHint });
    if (!article.isConnected || !result?.ok) {
      delete article.dataset.xGeoBlockState;
      return;
    }
    article.dataset.xGeoBlockCountry = result.country || "unknown";
    if (result.blocked) hideArticle(article, identity.username, result.country);
    else article.dataset.xGeoBlockState = result.following ? "followed" : "allowed";
    debug("Post decision applied", { username: identity.username, ...result });
  } catch (error) {
    debug("Post lookup failed", { username: identity.username, error: error.message });
    delete article.dataset.xGeoBlockState;
  }
}

function getFollowingHint(article, username) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      article.removeEventListener("x-geoblock-following-response", finish);
      const value = article.dataset.xGeoBlockFollowing;
      resolve(value === "true" ? true : value === "false" ? false : null);
    };
    article.dataset.xGeoBlockRequestUser = username;
    article.addEventListener("x-geoblock-following-response", finish, { once: true });
    article.dispatchEvent(new Event("x-geoblock-following-request"));
    setTimeout(finish, 150);
  });
}

function getTweetIdentity(article) {
  const links = article.querySelectorAll('a[href*="/status/"]');
  for (const link of links) {
    const match = new URL(link.href, location.origin).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
    if (match) return { username: match[1], statusId: match[2] };
  }
  return null;
}

function hideArticle(article, username, country) {
  debug("Hiding post", { username, country });
  article.dataset.xGeoBlockState = "blocked";
  const container = article.closest('[data-testid="cellInnerDiv"]') || article;
  container.classList.add("x-geoblock-hidden");
  let entries = hiddenByUser.get(username.toLowerCase());
  if (!entries) hiddenByUser.set(username.toLowerCase(), entries = new Set());
  entries.add(container);

  if (settings.showPlaceholder && !container.querySelector(":scope > .x-geoblock-placeholder")) {
    const placeholder = document.createElement("button");
    placeholder.className = "x-geoblock-placeholder";
    placeholder.type = "button";
    placeholder.textContent = `Post hidden by X GeoBlock · @${username} · ${country}`;
    placeholder.addEventListener("click", () => container.classList.toggle("x-geoblock-revealed"));
    container.prepend(placeholder);
  }
}

function debug(event, data = {}) {
  if (settings.debugMode) console.debug("[X GeoBlock]", event, data);
}

function restoreAll() {
  document.querySelectorAll(".x-geoblock-hidden").forEach((node) => {
    node.classList.remove("x-geoblock-hidden", "x-geoblock-revealed");
    node.querySelector(":scope > .x-geoblock-placeholder")?.remove();
  });
  hiddenByUser.clear();
}
