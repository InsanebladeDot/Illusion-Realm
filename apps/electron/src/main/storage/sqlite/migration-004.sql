-- 资源台账只登记软件实际创建的副本，不扫描目录给旧文件补删权。
-- 路径与身份分开：文件被用户替换时，旧台账不能获得删除新文件的权限。
CREATE TABLE canvas_resource (
  resource_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_folder TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('image','video','audio')),
  origin TEXT NOT NULL CHECK(origin IN ('imported','generated','archive')),
  identity TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','moving','trashed','restoring','purging','deleted','blocked')),
  entered_at INTEGER,
  expires_at INTEGER,
  retained INTEGER NOT NULL DEFAULT 0 CHECK(retained IN (0,1)),
  UNIQUE(workspace_id,relative_path)
) STRICT;
CREATE INDEX canvas_resource_state ON canvas_resource(state,expires_at);
CREATE INDEX canvas_resource_workspace ON canvas_resource(workspace_id);
-- 只有明确保存并关闭才授权回收；重开立即撤销，崩溃不等于保存成功。
CREATE TABLE canvas_resource_release (
  workspace_id TEXT PRIMARY KEY,
  workspace_folder TEXT NOT NULL
) STRICT;
