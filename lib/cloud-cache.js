(function (root) {
  "use strict";

  const DB_NAME = "x-geoblock-identity";
  const STORE_NAME = "keys";
  const KEY_ID = "installation";

  function normalizeEndpoint(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:") return "";
      return url.origin;
    } catch { return ""; }
  }

  async function lookup(endpoint, usernames) {
    endpoint = normalizeEndpoint(endpoint);
    if (!endpoint) return new Map();
    const pairs = await Promise.all(usernames.map(async (username) => [username, await hashHandle(username)]));
    const response = await fetch(`${endpoint}/v1/cache/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handleHashes: pairs.map(([, hash]) => hash) })
    });
    if (!response.ok) throw new Error(`Cloud cache lookup failed: HTTP ${response.status}`);
    const data = await response.json();
    const byHash = new Map((data.results || []).map((result) => [result.handleHash, result]));
    return new Map(pairs.flatMap(([username, hash]) => byHash.has(hash) ? [[username, byHash.get(hash)]] : []));
  }

  async function report(endpoint, username, location, parserVersion) {
    endpoint = normalizeEndpoint(endpoint);
    if (!endpoint || !location) return;
    const identity = await getIdentity(endpoint);
    const path = "/v1/cache/report";
    const body = JSON.stringify({
      handleHash: await hashHandle(username),
      location,
      observedAt: Math.floor(Date.now() / 1000),
      parserVersion
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBase64Url(18);
    const bodyHash = await sha256Hex(body);
    const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, identity.privateKey, new TextEncoder().encode(canonical)
    );
    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-installation-id": identity.installationId,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": toBase64Url(signature)
      },
      body
    });
    if (response.status === 401) {
      await deleteIdentity();
      throw new Error("Cloud cache installation identity was rejected");
    }
    if (!response.ok) throw new Error(`Cloud cache report failed: HTTP ${response.status}`);
  }

  async function getIdentity(endpoint) {
    const existing = await readIdentity();
    if (existing?.endpoint === endpoint && existing.privateKey && existing.installationId) return existing;
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]
    );
    const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const response = await fetch(`${endpoint}/v1/installations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publicKey })
    });
    if (!response.ok) throw new Error(`Cloud cache registration failed: HTTP ${response.status}`);
    const { installationId } = await response.json();
    const identity = { endpoint, installationId, privateKey: keyPair.privateKey };
    await writeIdentity(identity);
    return identity;
  }

  async function hashHandle(username) {
    return sha256Hex(String(username).trim().toLowerCase());
  }
  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function randomBase64Url(length) { return toBase64Url(crypto.getRandomValues(new Uint8Array(length))); }
  function toBase64Url(value) {
    return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transaction(mode, operation) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, mode);
        const request = operation(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }
  function readIdentity() { return transaction("readonly", (store) => store.get(KEY_ID)); }
  function writeIdentity(value) { return transaction("readwrite", (store) => store.put(value, KEY_ID)); }
  function deleteIdentity() { return transaction("readwrite", (store) => store.delete(KEY_ID)); }

  const api = { normalizeEndpoint, lookup, report, hashHandle };
  root.XGeoCloud = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
