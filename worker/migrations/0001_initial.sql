CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  public_key_jwk TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE request_nonces (
  installation_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (installation_id, nonce),
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE
);

CREATE TABLE observations (
  handle_hash TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  location TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  parser_version TEXT NOT NULL,
  PRIMARY KEY (handle_hash, installation_id),
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE
);
CREATE INDEX observations_handle_received ON observations(handle_hash, received_at);

CREATE TABLE canonical_cache (
  handle_hash TEXT PRIMARY KEY,
  location TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'conflict')),
  confirmations INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX canonical_status_expiry ON canonical_cache(status, expires_at);

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,
  period TEXT NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, period)
);
