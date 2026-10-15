const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_CLOCK_SKEW_SECONDS = 300;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request, env);
    try {
      const url = new URL(request.url);
      let response;
      if (request.method === "GET" && url.pathname === "/health") {
        response = json({ ok: true });
      } else if (request.method === "POST" && url.pathname === "/v1/installations") {
        response = await registerInstallation(request, env);
      } else if (request.method === "POST" && url.pathname === "/v1/cache/lookup") {
        response = await lookup(request, env);
      } else if (request.method === "POST" && url.pathname === "/v1/cache/report") {
        response = await report(request, env, ctx);
      } else {
        response = json({ error: "not_found" }, 404);
      }
      return cors(response, request, env);
    } catch (error) {
      console.error(error);
      return cors(json({ error: "internal_error" }, 500), request, env);
    }
  }
};

async function registerInstallation(request, env) {
  if (!(await rateLimit(request, env, "register", 20))) return json({ error: "rate_limited" }, 429);
  const body = await readJson(request);
  if (!validPublicKey(body.publicKey)) return json({ error: "invalid_public_key" }, 400);
  const id = crypto.randomUUID();
  const now = epochSeconds();
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const networkHash = await hmacHex(env.ABUSE_HMAC_KEY, `installation:${ip}`);
  await env.DB.prepare("INSERT INTO installations (id, public_key_jwk, network_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)")
    .bind(id, JSON.stringify(body.publicKey), networkHash, now, now).run();
  return json({ installationId: id }, 201);
}

async function lookup(request, env) {
  if (!(await rateLimit(request, env, "lookup", 500))) return json({ error: "rate_limited" }, 429);
  const body = await readJson(request);
  const hashes = Array.from(new Set(Array.isArray(body.handleHashes) ? body.handleHashes : []));
  if (!hashes.length || hashes.length > 50 || hashes.some((value) => !validHash(value))) {
    return json({ error: "invalid_handle_hashes" }, 400);
  }
  const placeholders = hashes.map(() => "?").join(",");
  const now = epochSeconds();
  const query = `SELECT handle_hash, location, confidence, confirmations, last_seen, expires_at, version
    FROM canonical_cache WHERE status = 'confirmed' AND expires_at > ? AND handle_hash IN (${placeholders})`;
  const result = await env.DB.prepare(query).bind(now, ...hashes).all();
  return json({
    results: result.results.map((row) => ({
      handleHash: row.handle_hash,
      location: row.location,
      status: "confirmed",
      confidence: row.confidence,
      confirmations: row.confirmations,
      lastSeen: row.last_seen,
      expiresAt: row.expires_at,
      version: row.version
    }))
  });
}

async function report(request, env, ctx) {
  const rawBody = await request.text();
  const auth = await authenticate(request, rawBody, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await rateLimit(request, env, `report:${auth.installationId}`, 200))) {
    return json({ error: "rate_limited" }, 429);
  }
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "invalid_json" }, 400); }
  if (!validHash(body.handleHash) || !validLocation(body.location) || !validParserVersion(body.parserVersion)) {
    return json({ error: "invalid_report" }, 400);
  }
  const now = epochSeconds();
  const observedAt = Number.isInteger(body.observedAt) && Math.abs(now - body.observedAt) < 86400
    ? body.observedAt : now;
  await env.DB.prepare(`INSERT INTO observations
      (handle_hash, installation_id, location, observed_at, received_at, parser_version)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(handle_hash, installation_id) DO UPDATE SET
        location = excluded.location, observed_at = excluded.observed_at,
        received_at = excluded.received_at, parser_version = excluded.parser_version`)
    .bind(body.handleHash, auth.installationId, body.location.trim(), observedAt, now, body.parserVersion).run();
  const consensus = await updateConsensus(body.handleHash, env, now);
  ctx.waitUntil(cleanup(env, now));
  return json(consensus, 202);
}

async function updateConsensus(handleHash, env, now) {
  const pendingDays = numberSetting(env.PENDING_RETENTION_DAYS, 7);
  const threshold = numberSetting(env.CONFIRMATION_THRESHOLD, 3);
  const cutoff = now - pendingDays * 86400;
  const grouped = await env.DB.prepare(`SELECT o.location, COUNT(DISTINCT i.network_hash) AS votes
    FROM observations o JOIN installations i ON i.id = o.installation_id
    WHERE o.handle_hash = ? AND o.received_at >= ?
    GROUP BY o.location ORDER BY votes DESC, o.location ASC`).bind(handleHash, cutoff).all();
  const first = grouped.results[0];
  const second = grouped.results[1];
  let status = "pending";
  let location = first?.location || null;
  let confirmations = first?.votes || 0;
  if (first && first.votes >= threshold && (!second || first.votes > second.votes)) status = "confirmed";
  else if (second && first.votes === second.votes) status = "conflict";
  const total = grouped.results.reduce((sum, row) => sum + row.votes, 0);
  const confidence = total ? confirmations / total : 0;
  const expiresAt = status === "confirmed"
    ? now + numberSetting(env.CONFIRMED_TTL_DAYS, 30) * 86400 : null;
  await env.DB.prepare(`INSERT INTO canonical_cache
      (handle_hash, location, status, confirmations, confidence, first_seen, last_seen, expires_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(handle_hash) DO UPDATE SET location = excluded.location, status = excluded.status,
        confirmations = excluded.confirmations, confidence = excluded.confidence,
        last_seen = excluded.last_seen, expires_at = excluded.expires_at, version = version + 1`)
    .bind(handleHash, location, status, confirmations, confidence, now, now, expiresAt).run();
  return { status, confirmations, confidence };
}

async function authenticate(request, rawBody, env) {
  const installationId = request.headers.get("x-installation-id") || "";
  const timestamp = request.headers.get("x-timestamp") || "";
  const nonce = request.headers.get("x-nonce") || "";
  const signature = request.headers.get("x-signature") || "";
  if (!/^[0-9a-f-]{36}$/.test(installationId) || !/^\d{10}$/.test(timestamp) ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !signature) {
    return { ok: false, error: "missing_signature", status: 401 };
  }
  const now = epochSeconds();
  if (Math.abs(now - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, error: "stale_signature", status: 401 };
  }
  const row = await env.DB.prepare("SELECT public_key_jwk FROM installations WHERE id = ?")
    .bind(installationId).first();
  if (!row) return { ok: false, error: "unknown_installation", status: 401 };
  const bodyHash = await sha256Hex(rawBody);
  const url = new URL(request.url);
  const signed = `${request.method}\n${url.pathname}\n${timestamp}\n${nonce}\n${bodyHash}`;
  try {
    const key = await crypto.subtle.importKey("jwk", JSON.parse(row.public_key_jwk),
      { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key,
      fromBase64Url(signature), new TextEncoder().encode(signed));
    if (!valid) return { ok: false, error: "invalid_signature", status: 401 };
    await env.DB.prepare("INSERT INTO request_nonces (installation_id, nonce, created_at) VALUES (?, ?, ?)")
      .bind(installationId, nonce, now).run();
    await env.DB.prepare("UPDATE installations SET last_seen = ? WHERE id = ?").bind(now, installationId).run();
    return { ok: true, installationId };
  } catch {
    return { ok: false, error: "invalid_or_replayed_signature", status: 401 };
  }
}

async function rateLimit(request, env, kind, limit) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const secret = env.ABUSE_HMAC_KEY;
  if (!secret) throw new Error("ABUSE_HMAC_KEY is required");
  const day = new Date().toISOString().slice(0, 10);
  const bucket = await hmacHex(secret, `${day}:${ip}`);
  const period = `${kind}:${day}`;
  const expiresAt = epochSeconds() + 2 * 86400;
  await env.DB.prepare(`INSERT INTO rate_limits (bucket, period, count, expires_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket, period) DO UPDATE SET count = count + 1`)
    .bind(bucket, period, expiresAt).run();
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ? AND period = ?")
    .bind(bucket, period).first();
  return row.count <= limit;
}

async function cleanup(env, now) {
  const retention = numberSetting(env.OBSERVATION_RETENTION_DAYS, 90) * 86400;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM request_nonces WHERE created_at < ?").bind(now - MAX_CLOCK_SKEW_SECONDS),
    env.DB.prepare("DELETE FROM observations WHERE received_at < ?").bind(now - retention),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now)
  ]);
}

function cors(response, request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://") ||
    (env.ADMIN_ORIGIN && origin === env.ADMIN_ORIGIN);
  const headers = new Headers(response.headers);
  if (allowed) headers.set("access-control-allow-origin", origin);
  headers.set("vary", "origin");
  headers.set("access-control-allow-headers", "content-type,x-installation-id,x-timestamp,x-nonce,x-signature");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  return new Response(response.body, { status: response.status, headers });
}

async function readJson(request) {
  if (Number(request.headers.get("content-length") || 0) > 16384) throw new Error("body_too_large");
  return request.json();
}
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }); }
function validPublicKey(key) { return key?.kty === "EC" && key?.crv === "P-256" && typeof key.x === "string" && typeof key.y === "string"; }
function validHash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validLocation(value) { return typeof value === "string" && value.trim().length >= 2 && value.trim().length <= 80 && !/[\u0000-\u001f]/.test(value); }
function validParserVersion(value) { return typeof value === "string" && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(value); }
function numberSetting(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function epochSeconds() { return Math.floor(Date.now() / 1000); }
async function sha256Hex(value) { return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
function toHex(buffer) { return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function fromBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
