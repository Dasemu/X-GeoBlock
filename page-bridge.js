(function () {
  "use strict";

  document.addEventListener("x-geoblock-following-request", (event) => {
    const article = event.target;
    if (!(article instanceof Element)) return;
    const username = article.dataset.xGeoBlockRequestUser || "";
    const following = findFollowing(article, username);
    article.dataset.xGeoBlockFollowing = following === null ? "unknown" : String(following);
    article.dispatchEvent(new Event("x-geoblock-following-response"));
  });

  function findFollowing(article, username) {
    const roots = [article, ...article.querySelectorAll("[data-testid='User-Name'], a[href]")];
    for (const element of roots) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (!key.startsWith("__reactProps$") && !key.startsWith("__reactFiber$")) continue;
        const result = searchReactData(element[key], username);
        if (result !== null) return result;
      }
    }
    return null;
  }

  function searchReactData(root, username) {
    const queue = [{ value: root, depth: 0 }];
    const seen = new Set();
    let inspected = 0;
    while (queue.length && inspected++ < 8000) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== "object" || seen.has(value) || depth > 12) continue;
      seen.add(value);
      const legacy = value.legacy && typeof value.legacy === "object" ? value.legacy : value;
      const screenName = legacy.screen_name || value.screen_name;
      const following = legacy.following ?? value.following;
      if (typeof screenName === "string" && screenName.toLowerCase() === username.toLowerCase() &&
          typeof following === "boolean") return following;
      for (const key of Object.keys(value)) {
        if (key === "stateNode" || key === "return" || key === "sibling") continue;
        try {
          const child = value[key];
          if (child && typeof child === "object" && !(child instanceof Node)) queue.push({ value: child, depth: depth + 1 });
        } catch (_) {}
      }
    }
    return null;
  }
})();
