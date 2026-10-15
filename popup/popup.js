"use strict";
const extensionApi = globalThis.browser || chrome;
const enabled = document.querySelector("#enabled");
const summary = document.querySelector("#summary");
const engineStatus = document.querySelector("#engine-status");
document.querySelector("#version").textContent = `v${extensionApi.runtime.getManifest().version}`;
extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS).then((value) => {
  enabled.checked = value.enabled;
  summary.textContent = `${String(value.blacklist.length).padStart(2, "0")} LOCATIONS`;
  engineStatus.textContent = value.enabled ? "ONLINE" : "PAUSED";
  document.body.dataset.enabled = String(value.enabled);
});
enabled.addEventListener("change", () => {
  extensionApi.storage.sync.set({ enabled: enabled.checked });
  engineStatus.textContent = enabled.checked ? "ONLINE" : "PAUSED";
  document.body.dataset.enabled = String(enabled.checked);
});
document.querySelector("#settings").addEventListener("click", () => extensionApi.runtime.openOptionsPage());
