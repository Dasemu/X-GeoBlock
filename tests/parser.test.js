const test = require("node:test");
const assert = require("node:assert/strict");
const { findUserRecord } = require("../lib/parser.js");
const config = require("../lib/config.js");
const { normalizeCountry, isBlacklisted } = config;
const { COUNTRIES, LOCATIONS } = require("../lib/countries.js");
const { normalizeEndpoint, hashHandle } = require("../lib/cloud-cache.js");

test("finds following state in nested X user data", () => {
  const source = { data: { user: { result: { legacy: { screen_name: "Alice", following: true, location: "Berlin" } } } } };
  assert.deepEqual(findUserRecord(source, "alice"), { following: true, location: "Berlin" });
});
test("does not confuse another user record", () => {
  assert.equal(findUserRecord({ legacy: { screen_name: "Bob", following: false } }, "alice"), null);
});
test("finds following state in the current X user schema", () => {
  const source = {
    result: {
      core: { screen_name: "Alice" },
      relationship_perspectives: { following: false, followed_by: true },
      location: "United States"
    }
  };
  assert.deepEqual(findUserRecord(source, "alice"), { following: false, location: "United States" });
});
test("normalizes country aliases", () => {
  assert.equal(normalizeCountry(" Russian Federation "), "russia");
  assert.equal(isBlacklisted("Russian Federation", ["Russia"]), true);
  assert.equal(isBlacklisted("Germany", ["Russia"]), false);
});
test("uses the production collaborative cache endpoint", () => {
  assert.equal(config.CLOUD_CACHE_ENDPOINT, "https://x-geoblock-cache.dariosevilla.es");
  assert.equal(config.DEFAULT_SETTINGS.cloudCacheEndpoint, config.CLOUD_CACHE_ENDPOINT);
  assert.equal(config.DEFAULT_SETTINGS.contributeCloudCache, true);
  assert.equal(config.DEFAULT_SETTINGS.showPlaceholder, true);
});
test("followed-account exemption is configurable", () => {
  assert.equal(config.shouldBlock("Lebanon", ["Lebanon"], true, true), false);
  assert.equal(config.shouldBlock("Lebanon", ["Lebanon"], true, false), true);
  assert.equal(config.shouldBlock("Lebanon", ["Lebanon"], false, true), true);
});
test("offers the full country checklist with unique values", () => {
  assert.equal(COUNTRIES.length, 250);
  assert.equal(new Set(COUNTRIES.map((country) => country.code)).size, 250);
  assert.ok(COUNTRIES.some((country) => country.name === "Germany" && country.flag === "🇩🇪"));
  assert.ok(LOCATIONS.some((location) => location.name === "West Asia"));
  assert.ok(LOCATIONS.some((location) => location.name === "United Kingdom" && location.flag === "🇬🇧"));
});
test("accepts only HTTPS cloud cache endpoints", () => {
  assert.equal(normalizeEndpoint("https://cache.example.com/path"), "https://cache.example.com");
  assert.equal(normalizeEndpoint("http://cache.example.com"), "");
  assert.equal(normalizeEndpoint("not a URL"), "");
});
test("hashes handles case-insensitively before cloud lookup", async () => {
  assert.equal(await hashHandle("Alice"), await hashHandle("alice"));
  assert.match(await hashHandle("alice"), /^[a-f0-9]{64}$/);
});
