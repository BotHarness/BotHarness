ALTER TABLE indexed_repositories ADD COLUMN display_name TEXT;
ALTER TABLE indexed_repositories ADD COLUMN roles TEXT NOT NULL DEFAULT '[]';
UPDATE indexed_repositories SET readme_pushed_at = NULL;
