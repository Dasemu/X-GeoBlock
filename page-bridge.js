(function () {
  "use strict";

  const ABOUT_QUERY_ID = "TzOG2twZEfhr9KmClvVVqA";
  const PUBLIC_BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  document.addEventListener("x-geoblock-following-request", (event) => {
    const article = event.target;
    if (!(article instanceof Element)) return;
    const username = article.dataset.xGeoBlockRequestUser || "";
    const following = findFollowing(article, username);
    article.dataset.xGeoBlockFollowing = following === null ? "unknown" : String(following);
    article.dispatchEvent(new Event("x-geoblock-following-response"));
  });

  document.addEventListener("x-geoblock-about-api-request", async (event) => {
    const request = event.target;
    if (!(request instanceof Element)) return;
    const username = request.dataset.xGeoBlockUsername || "";
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1];
      if (!csrf) throw new Error("X session CSRF cookie is unavailable");
      const variables = encodeURIComponent(JSON.stringify({ screenName: username }));
      const response = await fetch(`/i/api/graphql/${ABOUT_QUERY_ID}/AboutAccountQuery?variables=${variables}`, {
        credentials: "include",
        headers: {
          authorization: `Bearer ${PUBLIC_BEARER_TOKEN}`,
          "x-csrf-token": decodeURIComponent(csrf),
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-client-language": document.documentElement.lang || "en"
        }
      });
      if (!response.ok) throw new Error(`AboutAccountQuery returned HTTP ${response.status}`);
      const payload = await response.json();
      const result = payload?.data?.user_result_by_screen_name?.result;
      request.dataset.xGeoBlockResult = JSON.stringify({
        country: result?.about_profile?.account_based_in || null,
        screenName: result?.core?.screen_name || null
      });
    } catch (error) {
      request.dataset.xGeoBlockError = error?.message || String(error);
    }
    request.dispatchEvent(new Event("x-geoblock-about-api-response"));
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
      const screenName = legacy.screen_name || value.screen_name || value.core?.screen_name;
      const following = legacy.following ?? value.following ?? value.relationship_perspectives?.following;
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
