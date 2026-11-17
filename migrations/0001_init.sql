-- NEXCOUNT – D1-Schema (Cloudflare)

CREATE TABLE companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  seq         INTEGER NOT NULL DEFAULT 0,   -- fortlaufende Revision für die Synchronisierung
  created_at  INTEGER NOT NULL
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_users_company ON users(company_id);

CREATE TABLE sessions (
  hash       TEXT PRIMARY KEY,               -- SHA-256 des Sitzungstokens
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Alle Geschäftsdaten (Artikel, Bewegungen, Kontakte, Belege, Buchungen, Einstellungen)
CREATE TABLE records (
  company_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT,                           -- JSON, NULL bei gelöschten Datensätzen
  deleted    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  rev        INTEGER NOT NULL,
  PRIMARY KEY (company_id, collection, id)
);
CREATE INDEX idx_records_rev ON records(company_id, rev);

CREATE TABLE rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
