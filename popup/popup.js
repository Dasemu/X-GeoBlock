"use strict";
const extensionApi = globalThis.browser || chrome;
const enabled = document.querySelector("#enabled");
const summary = document.querySelector("#summary");
const engineStatus = document.querySelector("#engine-status");
document.querySelector("#version").textContent = `v${extensionApi.runtime.getManifest().version}`;
extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS).then((value) => {
  enabled.checked = value.enabled;
  summary.textContent = `${value.blacklist.length} locations`;
  engineStatus.textContent = value.enabled ? "Online" : "Paused";
  document.body.dataset.enabled = String(value.enabled);
});
enabled.addEventListener("change", () => {
  extensionApi.storage.sync.set({ enabled: enabled.checked });
  engineStatus.textContent = enabled.checked ? "Online" : "Paused";
  document.body.dataset.enabled = String(enabled.checked);
});
document.querySelector("#settings").addEventListener("click", () => extensionApi.runtime.openOptionsPage());
