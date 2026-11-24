-- 安装清单已覆盖多个工作流；编号身份仍由业务白名单校验，库只约束稳定的编号格式。
-- 重建一对一附表并复制旧行，保留原Anima任务和断点，不改下载主表。
CREATE TABLE download_setup_asset_next (
  download_id TEXT PRIMARY KEY REFERENCES download_job(download_id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL CHECK(length(asset_id) BETWEEN 1 AND 80 AND asset_id NOT GLOB '*[^a-z0-9-]*'),
  queued INTEGER NOT NULL DEFAULT 0 CHECK(queued IN (0,1))
) STRICT;
INSERT INTO download_setup_asset_next SELECT download_id,asset_id,queued FROM download_setup_asset;
DROP TABLE download_setup_asset;
ALTER TABLE download_setup_asset_next RENAME TO download_setup_asset;
