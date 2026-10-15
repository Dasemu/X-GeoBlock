const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");
const parser = require("../lib/parser.js");

const contentSource = fs.readFileSync(require.resolve("../content.js"), "utf8");

function createContext(html, pathname, sendMessage) {
  const { window, document } = parseHTML(html);
  const runtimeListeners = [];
  const context = {
    document,
    location: { pathname, href: `https://x.com${pathname}`, origin: "https://x.com" },
    chrome: {
      storage: {
        sync: { get: async (defaults) => ({ ...defaults, enabled: true, blacklist: ["United States"] }) },
        onChanged: { addListener() {} }
      },
      runtime: {
        sendMessage,
        onMessage: { addListener(listener) { runtimeListeners.push(listener); } }
      }
    },
    XGeoParser: parser,
    MutationObserver: window.MutationObserver,
    Event: window.Event,
    Element: window.Element,
    Node: window.Node,
    URL,
    CSS: { escape: (value) => value },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => setTimeout(callback, 0)
  };
  context.window = context;
  context.window.top = context.window;
  context.globalThis = context;
  vm.runInNewContext(contentSource, context, { filename: "content.js" });
  return { document, runtimeListeners };
}

test("manifest injects the About-page reporter into child frames", () => {
  const manifest = require("../manifest.json");
  const isolatedScript = manifest.content_scripts.find((entry) => entry.js.includes("content.js"));
  assert.equal(isolatedScript.all_frames, true);
  assert.equal(manifest.permissions.includes("declarativeNetRequestWithHostAccess"), true);
  const rules = require("../rules/about-frame.json");
  assert.deepEqual(rules[0].condition.resourceTypes, ["sub_frame"]);
  assert.equal(rules[0].condition.urlFilter, "||x.com/*/about");
});

test("rendered About page reports the account country", async () => {
  const messages = [];
  createContext(`
    <div role="tab" data-testid="pivot">
      <svg><path d="M12 7c-1.93 0-3.5 1.57-3.5 3.5S10.07 14 12 14"></path></svg>
      <span>Account based in</span><span>United States</span>
    </div>`, "/ShitskinBlud/about", async (message) => messages.push(message));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
    type: "about-page-result",
    username: "ShitskinBlud",
    country: "United States",
    following: null,
    profileLocation: null
  });
});

test("blacklisted profile owner post is hidden", async () => {
  const { document } = createContext(`
    <main data-testid="primaryColumn">
      <button data-testid="ShitskinBlud-follow">Follow</button>
      <div data-testid="cellInnerDiv"><article>
        <a href="/ShitskinBlud/status/2110603064012918829">post</a>
      </article></div>
    </main>`, "/ShitskinBlud/with_replies", async (message) => {
      assert.equal(message.type, "lookup-user");
      assert.equal(message.username, "ShitskinBlud");
      assert.equal(message.followingHint, false);
      return { ok: true, country: "United States", following: false, blocked: true };
    });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const article = document.querySelector("article");
  assert.equal(article.dataset.xGeoBlockState, "blocked");
  assert.equal(article.dataset.xGeoBlockCountry, "United States");
  assert.equal(article.closest('[data-testid="cellInnerDiv"]').classList.contains("x-geoblock-hidden"), true);
});
