"use strict";
const extensionApi = globalThis.browser || chrome;
const form = document.querySelector("#settings");
const enabled = document.querySelector("#enabled");
const placeholder = document.querySelector("#placeholder");
const status = document.querySelector("#status");
const countryList = document.querySelector("#country-list");
const countrySearch = document.querySelector("#country-search");
const selectionCount = document.querySelector("#selection-count");

renderCountries();

load();
async function load() {
  const value = await extensionApi.storage.sync.get(XGeoConfig.DEFAULT_SETTINGS);
  enabled.checked = value.enabled;
  placeholder.checked = value.showPlaceholder;
  const selected = new Set(value.blacklist.map(XGeoConfig.normalizeCountry));
  countryList.querySelectorAll("input").forEach((input) => {
    input.checked = selected.has(XGeoConfig.normalizeCountry(input.value));
  });
  updateSelectionCount();
}

function renderCountries() {
  const fragment = document.createDocumentFragment();
  for (const country of XGeoCountries.LOCATIONS) {
    const label = document.createElement("label");
    label.className = "country-option";
    label.dataset.search = `${country.name} ${country.code}`.toLowerCase();
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = country.name;
    const flag = document.createElement("span");
    flag.className = "country-flag";
    flag.textContent = country.flag;
    flag.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "country-name";
    name.textContent = country.name;
    label.append(input, flag, name);
    fragment.append(label);
  }
  countryList.append(fragment);
  countryList.addEventListener("change", updateSelectionCount);
}

function updateSelectionCount() {
  const count = countryList.querySelectorAll("input:checked").length;
  selectionCount.textContent = `${count} ${count === 1 ? "location" : "locations"} selected`;
}

countrySearch.addEventListener("input", () => {
  const query = countrySearch.value.trim().toLowerCase();
  countryList.querySelectorAll(".country-option").forEach((option) => {
    option.hidden = Boolean(query) && !option.dataset.search.includes(query);
  });
});

document.querySelector("#clear-selection").addEventListener("click", () => {
  countryList.querySelectorAll("input:checked").forEach((input) => input.checked = false);
  updateSelectionCount();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await extensionApi.storage.sync.set({
    enabled: enabled.checked,
    blacklist: Array.from(countryList.querySelectorAll("input:checked"), (input) => input.value),
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
