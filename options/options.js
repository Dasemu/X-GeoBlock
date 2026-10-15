"use strict";
const extensionApi = globalThis.browser || chrome;
const form = document.querySelector("#settings");
const enabled = document.querySelector("#enabled");
const blacklist = document.querySelector("#blacklist");
const ttl = document.querySelector("#ttl");
const placeholder = document.querySelector("#placeholder");
const status = document.querySelector("#status");

load();
async function load() {
  const value = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  enabled.checked = value.enabled;
  blacklist.value = value.blacklist.join("\n");
  ttl.value = value.cacheTtlHours;
  placeholder.checked = value.showPlaceholder;
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await extensionApi.storage.sync.set({
    enabled: enabled.checked,
    blacklist: Array.from(new Set(blacklist.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))),
    cacheTtlHours: Math.max(1, Number(ttl.value) || 168),
    showPlaceholder: placeholder.checked
  });
  status.textContent = "Settings saved.";
  setTimeout(() => status.textContent = "", 2000);
});
document.querySelector("#clear").addEventListener("click", async () => {
  await extensionApi.runtime.sendMessage({ type: "clear-cache" });
  status.textContent = "User cache cleared.";
  setTimeout(() => status.textContent = "", 2000);
});
