(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    blacklist: [],
    showPlaceholder: false
  });

  const COUNTRY_ALIASES = Object.freeze({
    "russian federation": "russia",
    "people's republic of china": "china",
    "iran, islamic republic of": "iran",
    "democratic people's republic of korea": "north korea",
    "dprk": "north korea",
    "republic of korea": "south korea",
    "united states of america": "united states",
    "u.s.": "united states",
    "usa": "united states",
    "uk": "united kingdom",
    "viet nam": "vietnam",
    "bolivia, plurinational state of": "bolivia",
    "venezuela, bolivarian republic of": "venezuela",
    "tanzania, united republic of": "tanzania",
    "syrian arab republic": "syria",
    "lao people's democratic republic": "laos",
    "moldova, republic of": "moldova",
    "brunei darussalam": "brunei",
    "czechia": "czech republic",
    "turkiye": "turkey",
    "cote d’ivoire": "ivory coast",
    "cote d'ivoire": "ivory coast"
  });

  function normalizeCountry(value) {
    const normalized = String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    return COUNTRY_ALIASES[normalized] || normalized;
  }

  function isBlacklisted(country, blacklist) {
    const candidate = normalizeCountry(country);
    return Boolean(candidate) && (blacklist || []).some(
      (entry) => normalizeCountry(entry) === candidate
    );
  }

  const api = { DEFAULT_SETTINGS, normalizeCountry, isBlacklisted };
  root.XGeoConfig = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
