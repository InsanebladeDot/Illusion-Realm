/** 主进程持有工作区租约；挂起继续保护，崩溃只释放租约，不冒充保存成功。 */
const ledger = require('./resource-ledger');
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {import('../../storage/sqlite/client').SqliteClient} Client */
/** @typedef {{owner:number,saved:boolean,workspaces:Map<string,string>}} Lease */

function createResourceSessions() {
  /** @type {Map<string,Lease>} */
  const leases = new Map();

  /** 读到作品后先保护素材，恢复失败也不启动回收。 @param {Client} client @param {number} owner @param {string} id @param {Canvas} canvas */
  async function open(client, owner, id, canvas) {
    const lease = leases.get(key(owner, id)) ?? { owner, saved: false, workspaces: new Map() };
    lease.saved = false;
    if (canvas.workspace) lease.workspaces.set(canvas.workspace.id, canvas.workspace.folder);
    leases.set(key(owner, id), lease);
    if (canvas.workspace) await ledger.write(client, 'resource.hold', [canvas.workspace.id]);
  }

  /** 断线不提交未保存图，也不把上次保存前的删除动作算作确认。 @param {number} owner */
  function disconnect(owner) {
    for (const [id, lease] of leases) if (lease.owner === owner) leases.delete(id);
  }

  // 其他挂起工作簿可能尚未保存引用，不能凭磁盘旧稿确认其素材可删。
  const hasOthers = (/** @type {number} */ owner, /** @type {string} */ id) => [...leases.keys()].some(value => value !== key(owner, id));

  return { open, hasOthers, saved: (/** @type {number} */ owner, /** @type {string} */ id, /** @type {Canvas} */ canvas) => markSaved(leases, owner, id, canvas), close: (/** @type {Client} */ client, /** @type {number} */ owner, /** @type {string} */ id, /** @type {Canvas} */ canvas) => closeLease(leases, client, owner, id, canvas), disconnect, busy: () => leases.size > 0 };
}

/** @param {number} owner @param {string} id */
const key = (owner, id) => `${owner}:${id}`;

/** @param {Map<string,Lease>} leases @param {Client} client @param {number} owner @param {string} id @param {Canvas} canvas */
async function closeLease(leases, client, owner, id, canvas) {
  const lease = leases.get(key(owner, id));
  if (!lease) return;
  if (!lease.saved) throw Error('canvas-resource-save-required');
  // 导入工程包会换素材抽屉，关闭时一起释放本会话曾用过的归属，避免旧抽屉永远保活。
  if (canvas.workspace) lease.workspaces.set(canvas.workspace.id, canvas.workspace.folder);
  await client.request('batch', [...lease.workspaces].map(([workspaceId, folder]) => ({ name: 'resource.release', params: [workspaceId, folder] })));
  leases.delete(key(owner, id));
}


/** 保存确认才可关闭；普通保存不授予回收资格。 @param {Map<string,Lease>} leases @param {number} owner @param {string} id @param {Canvas} canvas */
function markSaved(leases, owner, id, canvas) {
  const lease = leases.get(key(owner, id));
  if (lease) {
    lease.saved = true;
    if (canvas.workspace) lease.workspaces.set(canvas.workspace.id, canvas.workspace.folder);
  }
}



module.exports = { createResourceSessions };
