"use strict";

const extensionApi = globalThis.browser || chrome;

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "parse-about-html") {
    try {
      const document = new DOMParser().parseFromString(message.html, "text/html");
      sendResponse(XGeoParser.parseAboutDocument(document, message.username));
    } catch (error) {
      sendResponse({ country: null, following: null, error: error.message });
    }
    return false;
  }
  if (message?.type === "create-about-frame") {
    removeFrame(message.username);
    const frame = document.createElement("iframe");
    frame.dataset.xGeoBlockUser = message.username.toLowerCase();
    frame.hidden = true;
    frame.src = `https://x.com/${encodeURIComponent(message.username)}/about`;
    document.querySelector("#frames").append(frame);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "remove-about-frame") {
    removeFrame(message.username);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

function removeFrame(username) {
  const key = String(username).toLowerCase();
  document.querySelector(`iframe[data-x-geo-block-user="${CSS.escape(key)}"]`)?.remove();
}
