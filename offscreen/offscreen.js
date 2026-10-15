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
  return false;
});
