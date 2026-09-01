CREATE TABLE sites (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    NOT NULL,
  base_url            TEXT    NOT NULL UNIQUE,
  sitemap_url         TEXT,
  max_pages           INTEGER NOT NULL DEFAULT 200,
  lighthouse_mode     TEXT    NOT NULL DEFAULT 'sample',
  lighthouse_strategy TEXT    NOT NULL DEFAULT 'mobile',
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE runs (
  id          INTEGER PRIMARY KEY,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'queued',
  trigger     TEXT    NOT NULL DEFAULT 'manual',
  started_at  TEXT,
  finished_at TEXT,
  error       TEXT,
  ai_status   TEXT    NOT NULL DEFAULT 'not_needed',
  ai_error    TEXT,
  ai_model    TEXT
);

CREATE INDEX idx_runs_site ON runs(site_id, id DESC);

CREATE TABLE pages (
  id           INTEGER PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url          TEXT    NOT NULL,
  status_code  INTEGER,
  load_ms      INTEGER,
  last_seen_at TEXT,
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(site_id, url)
);

CREATE TABLE findings (
  id             INTEGER PRIMARY KEY,
  site_id        INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  page_id        INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  category       TEXT    NOT NULL,
  severity       TEXT    NOT NULL,
  rule           TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  detail_json    TEXT    NOT NULL DEFAULT '{}',
  fingerprint    TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'open',
  first_seen_run INTEGER NOT NULL,
  last_seen_run  INTEGER NOT NULL,
  UNIQUE(site_id, category, fingerprint)
);

CREATE INDEX idx_findings_lookup ON findings(site_id, category, status);

CREATE TABLE lighthouse (
  id             INTEGER PRIMARY KEY,
  run_id         INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  strategy       TEXT    NOT NULL,
  perf           INTEGER,
  a11y           INTEGER,
  best_practices INTEGER,
  seo            INTEGER,
  raw_json       TEXT
);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  format      TEXT    NOT NULL DEFAULT 'markdown',
  content     TEXT    NOT NULL,
  model_used  TEXT,
  tokens_est  INTEGER
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE jobs (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL,
  payload_json TEXT    NOT NULL DEFAULT '{}',
  status       TEXT    NOT NULL DEFAULT 'queued',
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  started_at   TEXT,
  finished_at  TEXT
);

CREATE INDEX idx_jobs_queued ON jobs(status, id);
