CREATE TABLE indexed_repositories (
  node_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  html_url TEXT NOT NULL,
  clone_url TEXT NOT NULL,
  description TEXT,
  topics TEXT NOT NULL DEFAULT '[]',
  stars INTEGER NOT NULL DEFAULT 0,
  pushed_at TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  head_sha TEXT,
  head_committed_at TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('listed', 'hidden_missing', 'hidden_reported', 'blocked')),
  first_seen_at TEXT NOT NULL,
  last_refreshed_at TEXT NOT NULL
);

CREATE INDEX indexed_repositories_listed_by_push
  ON indexed_repositories (visibility, pushed_at DESC, node_id DESC);
