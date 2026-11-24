/** 资源查询仅供主进程固定服务使用；媒体正文和用户任意 SQL 不进入数据库。 */
const read = (/** @type {string} */ sql, /** @type {number} */ arity) => ({ sql, arity, write: false });
const write = (/** @type {string} */ sql, /** @type {number} */ arity) => ({ sql, arity, write: true });

module.exports = {
  // 只收新创建文件的登记；重试同路径不覆盖旧身份，避免接管用户替换后的文件。
  'resource.add': write('INSERT INTO canvas_resource(resource_id,workspace_id,workspace_folder,relative_path,media_kind,origin,identity) VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,relative_path) DO NOTHING', 7),
  'resource.all': read('SELECT * FROM canvas_resource WHERE state<>\'deleted\'', 0),
  // 工程/全局库列表使用既有workspace索引，不因加入全局素材而每次遍历全部工程。
  'resource.workspace': read('SELECT * FROM canvas_resource WHERE workspace_id=? AND state<>\'deleted\'', 1),
  'resource.releaseList': read('SELECT workspace_id,workspace_folder FROM canvas_resource_release', 0),
  'resource.release': write('INSERT INTO canvas_resource_release VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET workspace_folder=excluded.workspace_folder', 2),
  'resource.hold': write('DELETE FROM canvas_resource_release WHERE workspace_id=?', 1),
  // 状态先落盘再移动文件，重启据此续接；进入时间在恢复后清空，下次重新计满24小时。
  'resource.state': write('UPDATE canvas_resource SET state=?,entered_at=?,expires_at=? WHERE resource_id=?', 4),
  'resource.path': write('UPDATE canvas_resource SET relative_path=? WHERE resource_id=? AND state=\'active\'', 2),
  'resource.retain': write('UPDATE canvas_resource SET retained=? WHERE resource_id=?', 2),
};
