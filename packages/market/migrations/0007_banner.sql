ALTER TABLE indexed_repositories ADD COLUMN banner TEXT;
UPDATE indexed_repositories SET readme_pushed_at = NULL;
