"use strict";

const extensionApi = globalThis.browser || chrome;
const processed = new WeakSet();
const hiddenByUser = new Map();
let settings = { enabled: true, showPlaceholder: false };
let scanQueued = false;

initialize();

async function initialize() {
  const aboutMatch = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/about\/?$/);
  if (aboutMatch) {
    reportRenderedAboutPage(aboutMatch[1]);
    return;
  }
  if (window.top !== window) return;
  settings = await extensionApi.storage.sync.get({ enabled: true, showPlaceholder: false });
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
  restoreAll();
  document.querySelectorAll("article").forEach((article) => processed.delete(article));
  if (settings.enabled) scheduleScan();
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
  processed.add(article);
  article.dataset.xGeoBlockState = "checking";

  try {
    const result = await extensionApi.runtime.sendMessage({ type: "lookup-user", username: identity.username });
    if (!article.isConnected || !result?.ok) {
      delete article.dataset.xGeoBlockState;
      return;
    }
    article.dataset.xGeoBlockCountry = result.country || "unknown";
    if (result.blocked) hideArticle(article, identity.username, result.country);
    else article.dataset.xGeoBlockState = result.following ? "followed" : "allowed";
  } catch (_) {
    delete article.dataset.xGeoBlockState;
  }
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

function restoreAll() {
  document.querySelectorAll(".x-geoblock-hidden").forEach((node) => {
    node.classList.remove("x-geoblock-hidden", "x-geoblock-revealed");
    node.querySelector(":scope > .x-geoblock-placeholder")?.remove();
  });
  hiddenByUser.clear();
}
