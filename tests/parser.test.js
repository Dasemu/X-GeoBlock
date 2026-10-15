const test = require("node:test");
const assert = require("node:assert/strict");
const { findUserRecord } = require("../lib/parser.js");
const { normalizeCountry, isBlacklisted } = require("../lib/config.js");

test("finds following state in nested X user data", () => {
  const source = { data: { user: { result: { legacy: { screen_name: "Alice", following: true, location: "Berlin" } } } } };
  assert.deepEqual(findUserRecord(source, "alice"), { following: true, location: "Berlin" });
});
test("does not confuse another user record", () => {
  assert.equal(findUserRecord({ legacy: { screen_name: "Bob", following: false } }, "alice"), null);
});
test("normalizes country aliases", () => {
  assert.equal(normalizeCountry(" Russian Federation "), "russia");
  assert.equal(isBlacklisted("Russian Federation", ["Russia"]), true);
  assert.equal(isBlacklisted("Germany", ["Russia"]), false);
});
