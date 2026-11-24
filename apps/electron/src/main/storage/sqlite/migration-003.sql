-- 工程库的分类只改变归档关系，不移动媒体文件，避免大文件搬家与引用失效。
CREATE TABLE canvas_library_folder (
  folder_id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80)
) STRICT;
CREATE TABLE canvas_library_entry (
  entry_id TEXT PRIMARY KEY,
  directory TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  folder_id TEXT REFERENCES canvas_library_folder(folder_id) ON DELETE RESTRICT,
  updated_at INTEGER NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
) STRICT;
CREATE INDEX canvas_library_folder_updated ON canvas_library_entry(deleted,folder_id,updated_at DESC);
ALTER TABLE canvas_state ADD COLUMN fixed_size INTEGER CHECK(fixed_size IN (0,1));
ALTER TABLE canvas_node_detail ADD COLUMN resize_locked INTEGER CHECK(resize_locked IN (0,1));
