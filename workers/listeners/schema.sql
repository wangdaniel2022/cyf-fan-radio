CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_last_seen ON live_sessions(last_seen);

CREATE TABLE IF NOT EXISTS monthly_listeners (
  month TEXT NOT NULL,
  id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  PRIMARY KEY (month, id)
);
