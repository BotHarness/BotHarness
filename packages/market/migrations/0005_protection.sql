CREATE TABLE request_events (
  source_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('challenge', 'submit', 'report')),
  created_at INTEGER NOT NULL
);

CREATE INDEX request_events_by_source ON request_events (source_hash, action, created_at);

CREATE TABLE used_challenges (
  challenge TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE TABLE repository_crawls (
  locator TEXT PRIMARY KEY,
  crawled_at INTEGER NOT NULL
);

CREATE TABLE reports (
  node_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (node_id, source_hash)
);
