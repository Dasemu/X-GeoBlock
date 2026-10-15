# Collaborative cloud cache

The cloud cache uses the Cloudflare Worker and D1 schema in `worker/`. Extension builds use `https://x-geoblock-cache.dariosevilla.es` for reads. Contributing observations is enabled by default and can be disabled in settings.

## Data flow

1. Local cache results always win.
2. When the page's own React data confirms that an author is not followed, the extension asks the Worker for a confirmed location using a SHA-256 username hash.
3. A confirmed cloud hit can be used immediately. Pending, conflicting, stale, unavailable, or malformed results fall back to a direct X lookup.
4. A direct successful lookup is stored locally. If contribution is enabled, the extension signs and submits the username hash, location, observation time, and parser version.

Following relationships, blacklist entries, post contents, URLs visited, and raw usernames are not uploaded. Username hashing reduces accidental disclosure but is not anonymity because public handles can be enumerated and hashed.

## Cryptographic boundary

Each installation creates an ECDSA P-256 key pair with a non-exportable private key in IndexedDB. Reports include a timestamp and one-time nonce and are signed over the HTTP method, path, timestamp, nonce, and body hash. D1 rejects replayed nonces.

This proves continuity of an installation and prevents report tampering. It cannot prove that a request came from the official extension: an attacker can reproduce public extension behavior and register another key. Embedded API keys, extension origins, user-agent strings, and CORS are not authentication. Consensus and rate limits provide the actual abuse resistance.

## Freshness and consensus

- Three distinct installations must agree within seven days.
- Tied observations become `conflict` and are never returned for blocking.
- Confirmed entries are served for 30 days.
- Raw observations are retained for 90 days.
- Local cache entries expire after 30 days or when the user clears them.

These values are configured in `worker/wrangler.toml`.
