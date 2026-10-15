# Collaborative cache worker

This Cloudflare Worker stores privacy-conscious, consensus-based account location observations in D1. A single report never becomes a blocking result. Three distinct installations must submit the same location within seven days before the cache returns it as `confirmed`.

## Deploy

1. From the repository root, authenticate: `npx wrangler login`.
2. Create the database: `npx wrangler d1 create x-geoblock-cache`.
3. Put the returned database ID in `worker/wrangler.toml`.
4. Store a long random secret: `npx wrangler secret put ABUSE_HMAC_KEY --config worker/wrangler.toml`.
5. Apply migrations: `npm run worker:migrate`.
6. Deploy the code into the Worker: `npm run worker:deploy`.
7. Verify `https://<your-worker>.workers.dev/health` returns `{"ok":true}`.
8. Enter the resulting HTTPS Worker URL in the extension settings.

If you created an empty Worker in the Cloudflare dashboard already, keep the same `name` in `worker/wrangler.toml`; `npm run worker:deploy` replaces its code. You still need a D1 database bound under the exact name `DB`, the migration, and `ABUSE_HMAC_KEY`.

For live server diagnostics run `npm run worker:tail`. Extension debug logs appear in the `x.com` page console after enabling debug mode in settings.

The Worker Free and D1 Free plans are normally sufficient for an initial deployment, but Cloudflare can change quotas. Check the current Workers and D1 pricing pages before making capacity assumptions.

## Trust model

Each installation generates a non-exportable ECDSA P-256 private key. Signed reports are bound to that installation and include a timestamp and nonce. This prevents report modification and replay, but it cannot prove that the sender is an official extension: any public client can register its own key. No client-side cryptography can solve that because extension code and embedded credentials are public.

The service therefore relies on independent-network consensus, per-IP and per-installation quotas, conflict-safe behavior, and Cloudflare edge protections. IP addresses are stored only as keyed HMACs; three different installation-network hashes must agree. Only `confirmed` entries are returned. Handles are sent as SHA-256 hashes; this reduces accidental disclosure but does not anonymize enumerable public usernames.

The Worker never receives following relationships, the user's blacklist, browsing history, or post contents.
