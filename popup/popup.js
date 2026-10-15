"use strict";
const extensionApi = globalThis.browser || chrome;
const enabled = document.querySelector("#enabled");
const summary = document.querySelector("#summary");
extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS).then((value) => {
  enabled.checked = value.enabled;
  summary.textContent = `${value.blacklist.length} ${value.blacklist.length === 1 ? "country" : "countries"} blocked.`;
});
enabled.addEventListener("change", () => extensionApi.storage.sync.set({ enabled: enabled.checked }));
document.querySelector("#settings").addEventListener("click", () => extensionApi.runtime.openOptionsPage());
