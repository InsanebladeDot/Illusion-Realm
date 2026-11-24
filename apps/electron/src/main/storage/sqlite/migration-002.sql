-- v2 接管已有账本、画布、快捷词和下载恢复；v1 脚本及其摘要保持不变。
-- 旧小票缺少提示词和产物路径，单独存数量证据，不能补造 generation_output。
CREATE TABLE migration_import (
  source_key TEXT PRIMARY KEY,
  source_sha256 TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  record_count INTEGER NOT NULL CHECK(record_count>=0)
) STRICT;
CREATE TABLE document_section (
  section TEXT PRIMARY KEY CHECK(section IN ('generationHistory','infiniteCanvas','quickPhrases')),
  version INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK(record_count>=0)
) STRICT;
CREATE TABLE generation_receipt (
  receipt_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('completed','failed','cancelled')),
  created_at REAL NOT NULL CHECK(created_at>=0),
  started_at REAL CHECK(started_at>=created_at),
  finished_at REAL NOT NULL CHECK(finished_at>=coalesce(started_at,created_at)),
  reported_images INTEGER NOT NULL CHECK(reported_images>=0)
) STRICT;
CREATE TABLE receipt_model (
  receipt_id TEXT NOT NULL REFERENCES generation_receipt ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('main','lora')),
  loader TEXT NOT NULL CHECK(loader IN ('unet','diffusion_models','checkpoints','loras')),
  submitted_name TEXT NOT NULL,
  PRIMARY KEY(receipt_id,ordinal)
) STRICT;
CREATE INDEX idx_receipt_finished ON generation_receipt(finished_at,receipt_id);
CREATE TABLE quick_phrase (
  phrase_id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE,
  keyword TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  has_image_path INTEGER NOT NULL CHECK(has_image_path IN (0,1)),
  image_path TEXT
) STRICT;
-- 编辑中的唯一草稿沿用原工程身份；导入工程仍由原 .ircanvas 协议负责。
CREATE TABLE canvas_state (
  slot INTEGER PRIMARY KEY CHECK(slot=1),
  project_id TEXT NOT NULL UNIQUE REFERENCES canvas_project ON DELETE RESTRICT,
  has_name INTEGER NOT NULL CHECK(has_name IN (0,1)),
  workspace_id TEXT,
  workspace_folder TEXT,
  CHECK((workspace_id IS NULL)=(workspace_folder IS NULL))
) STRICT;
CREATE TABLE canvas_node_detail (
  node_id TEXT PRIMARY KEY REFERENCES canvas_node ON DELETE CASCADE,
  original_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  original_kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  ratio TEXT NOT NULL,
  mode TEXT,
  workflow TEXT,
  created_at REAL,
  has_card INTEGER NOT NULL CHECK(has_card IN (0,1)),
  card_style TEXT,
  has_inputs INTEGER NOT NULL CHECK(has_inputs IN (0,1)),
  configuration_version INTEGER NOT NULL CHECK(configuration_version=1),
  configuration TEXT NOT NULL CHECK(json_valid(configuration))
) STRICT;
-- configuration 仅保留现有版本化工作流表单附表，核心图和媒体关系均在独立表。
-- 它不是整份用户文档备份，也不含 scene、composition、媒体字节或服务密钥。
CREATE TABLE canvas_edge_detail (
  edge_id TEXT PRIMARY KEY REFERENCES canvas_edge ON DELETE CASCADE,
  original_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  has_source_handle INTEGER NOT NULL CHECK(has_source_handle IN (0,1)),
  has_target_handle INTEGER NOT NULL CHECK(has_target_handle IN (0,1))
) STRICT;
CREATE TABLE canvas_media_reference (
  node_id TEXT NOT NULL REFERENCES canvas_node ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('display','input')),
  ordinal INTEGER NOT NULL,
  asset_id TEXT NOT NULL REFERENCES asset ON DELETE RESTRICT,
  original_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  original_size INTEGER NOT NULL CHECK(original_size>=0),
  PRIMARY KEY(node_id,role,ordinal)
) STRICT;
CREATE INDEX idx_canvas_media_asset ON canvas_media_reference(asset_id);
-- 下载任务由主进程持有，恢复表不能与渲染层用户文档一起覆盖。
CREATE TABLE download_resume (
  download_id TEXT PRIMARY KEY REFERENCES download_job ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  model_name TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  real_folder TEXT NOT NULL,
  logo_warning INTEGER NOT NULL CHECK(logo_warning IN (0,1)),
  reported_received INTEGER NOT NULL CHECK(reported_received>=0),
  reported_total INTEGER NOT NULL CHECK(reported_total>=0),
  error_code TEXT,
  validator TEXT NOT NULL,
  model_type TEXT NOT NULL,
  base_model TEXT NOT NULL,
  download_url TEXT NOT NULL,
  category TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  cover_file TEXT,
  cover_prefix TEXT,
  source_model_id INTEGER,
  source_version_id INTEGER,
  source_version_name TEXT,
  source_creator TEXT,
  source_description TEXT,
  source_version_description TEXT
) STRICT;
CREATE INDEX idx_download_resume_active ON download_resume(active,ordinal);
CREATE TABLE download_owned_file (
  download_id TEXT NOT NULL REFERENCES download_resume ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_identity TEXT NOT NULL,
  PRIMARY KEY(download_id,ordinal)
) STRICT;
CREATE TABLE download_source_word (
  download_id TEXT NOT NULL REFERENCES download_resume ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  word TEXT NOT NULL,
  PRIMARY KEY(download_id,ordinal)
) STRICT;
