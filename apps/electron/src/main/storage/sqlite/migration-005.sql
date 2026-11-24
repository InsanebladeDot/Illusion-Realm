-- 一键安装只附加内置资源编号和等候状态，不重复保存下载地址、进度或模型字节。
-- 旧下载没有这一行，读取时继续返回原请求；外键使扩展记录跟随原下载身份。
CREATE TABLE download_setup_asset (
  download_id TEXT PRIMARY KEY REFERENCES download_job(download_id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL CHECK(asset_id IN ('anima-model','anima-text','anima-vae')),
  queued INTEGER NOT NULL DEFAULT 0 CHECK(queued IN (0,1))
) STRICT;
