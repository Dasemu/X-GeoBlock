(function (root) {
  "use strict";

  const LOCATION_PATH_PREFIX = "M12 7c-1.93 0-3.5 1.57-3.5 3.5";
  const BASED_IN_LABELS = [
    "account based in", "cuenta con sede en", "compte basé en", "konto mit sitz in",
    "account gevestigd in", "conta sediada em", "account con sede in"
  ];
  const FOLLOWING_LABELS = ["following", "siguiendo", "abonné", "abonniert", "seguindo", "seguiti"];

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findUserRecord(value, username, seen = new Set(), depth = 0) {
    if (!value || typeof value !== "object" || depth > 14 || seen.has(value)) return null;
    seen.add(value);

    const legacy = value.legacy && typeof value.legacy === "object" ? value.legacy : value;
    const screenName = legacy.screen_name || value.screen_name || value.core?.screen_name || value.username;
    if (screenName && String(screenName).toLowerCase() === username.toLowerCase()) {
      const following = legacy.following ?? value.following ?? value.relationship_perspectives?.following;
      const location = legacy.location || value.location;
      return {
        following: typeof following === "boolean" ? following : null,
        location: typeof location === "string" ? clean(location) : null
      };
    }

    for (const child of Object.values(value)) {
      const found = findUserRecord(child, username, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function extractEmbeddedUser(document, username) {
    for (const script of document.querySelectorAll("script")) {
      const text = script.textContent && script.textContent.trim();
      if (!text || text.length < 2 || (text[0] !== "{" && text[0] !== "[")) continue;
      try {
        const found = findUserRecord(JSON.parse(text), username);
        if (found) return found;
      } catch (_) {
        // Most scripts are JavaScript, not JSON.
      }
    }
    return null;
  }

  function extractCountryFromDom(document) {
    const paths = Array.from(document.querySelectorAll("svg path"));
    const locationPath = paths.find((path) => (path.getAttribute("d") || "").startsWith(LOCATION_PATH_PREFIX));
    if (locationPath) {
      const row = locationPath.closest('[data-testid="pivot"]') || locationPath.closest('[role="tab"]');
      if (row) {
        const values = Array.from(row.querySelectorAll("span"))
          .map((span) => clean(span.textContent))
          .filter(Boolean);
        if (values.length >= 2) return values[values.length - 1];
      }
    }

    for (const element of document.querySelectorAll("span, div")) {
      const label = clean(element.textContent).toLowerCase();
      if (!BASED_IN_LABELS.includes(label)) continue;
      const row = element.closest('[data-testid="pivot"]') || element.parentElement?.parentElement;
      const values = row ? Array.from(row.querySelectorAll("span")).map((node) => clean(node.textContent)).filter(Boolean) : [];
      const index = values.findIndex((value) => BASED_IN_LABELS.includes(value.toLowerCase()));
      if (index >= 0 && values[index + 1]) return values[index + 1];
    }
    return null;
  }

  function extractFollowingFromDom(document) {
    const button = document.querySelector('[data-testid$="-unfollow"]');
    if (button) return true;
    const labels = Array.from(document.querySelectorAll("button, [role=button]"))
      .map((node) => clean(node.textContent).toLowerCase());
    if (labels.some((label) => FOLLOWING_LABELS.includes(label))) return true;
    return null;
  }

  function parseAboutDocument(document, username) {
    const embedded = extractEmbeddedUser(document, username) || {};
    return {
      country: extractCountryFromDom(document),
      following: embedded.following ?? extractFollowingFromDom(document),
      profileLocation: embedded.location || null
    };
  }

  const api = { clean, findUserRecord, extractCountryFromDom, parseAboutDocument };
  root.XGeoParser = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
