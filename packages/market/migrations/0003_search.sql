CREATE INDEX indexed_repositories_listed_by_stars
  ON indexed_repositories (visibility, stars DESC, node_id DESC);

CREATE VIRTUAL TABLE indexed_repositories_fts USING fts5(
  name,
  description,
  topics,
  readme,
  content = 'indexed_repositories',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);

CREATE TRIGGER indexed_repositories_fts_insert AFTER INSERT ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (rowid, name, description, topics, readme)
  VALUES (new.rowid, new.name, new.description, new.topics, new.readme);
END;

CREATE TRIGGER indexed_repositories_fts_delete AFTER DELETE ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (indexed_repositories_fts, rowid, name, description, topics, readme)
  VALUES ('delete', old.rowid, old.name, old.description, old.topics, old.readme);
END;

CREATE TRIGGER indexed_repositories_fts_update AFTER UPDATE ON indexed_repositories BEGIN
  INSERT INTO indexed_repositories_fts (indexed_repositories_fts, rowid, name, description, topics, readme)
  VALUES ('delete', old.rowid, old.name, old.description, old.topics, old.readme);
  INSERT INTO indexed_repositories_fts (rowid, name, description, topics, readme)
  VALUES (new.rowid, new.name, new.description, new.topics, new.readme);
END;

INSERT INTO indexed_repositories_fts (indexed_repositories_fts) VALUES ('rebuild');
