/** 从同一数据库快照恢复原画布文档；选中态、DOM 与播放器状态不入库。 */
const { loadMedia } = require('./canvas-media-store');
const { PROJECT } = require('./canvas-store');
const validation = require('../../modules/canvas/project-validation');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {Record<string,import('node:sqlite').SQLOutputValue>} Row */
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */

/** @param {Database} db @param {Row} row */
function loadNode(db, row) {
  const id = String(row.node_id);
  /** @type {Record<string,unknown>} */
  const data = { ...JSON.parse(String(row.configuration)), kind: row.original_kind, title: row.title,
    prompt: row.prompt, content: row.content, ratio: row.ratio };
  if (row.mode !== null) data.mode = row.mode;
  if (row.workflow !== null) data.workflow = row.workflow;
  if (row.created_at !== null) data.createdAt = row.created_at;
  if (row.resize_locked !== null) data.resizeLocked = Boolean(row.resize_locked);
  if (row.has_card) data.card = { style: row.card_style, width: row.card_width, height: row.card_height };
  const media = loadMedia(db, id, 'display')[0];
  if (media) data.media = media;
  if (row.has_inputs) data.inputImages = loadMedia(db, id, 'input');
  for (const document of db.prepare('SELECT * FROM project_document WHERE node_id=?').all(id)) {
    data[document.document_kind === 'director' ? 'scene' : 'composition'] = JSON.parse(String(document.body));
  }
  return { id: row.original_id, position: { x: row.x, y: row.y }, data };
}

/** @param {Database} db @returns {Canvas} */
function loadCanvas(db) {
  // ordinal 保留原数组顺序；has_* 区分未配置、显式空数组和空名称。
  const state = db.prepare('SELECT s.*,p.name FROM canvas_state s JOIN canvas_project p USING(project_id) WHERE slot=1').get();
  if (!state) throw new Error('SQLITE_INVALID_STORED_DATA');
  const nodes = db.prepare(`SELECT n.*,d.* FROM canvas_node n JOIN canvas_node_detail d USING(node_id)
    WHERE n.project_id=? ORDER BY d.ordinal`).all(PROJECT).map(row => loadNode(db, row));
  const edges = db.prepare(`SELECT e.*,d.*,s.original_id AS original_source,t.original_id AS original_target
    FROM canvas_edge e JOIN canvas_edge_detail d USING(edge_id)
    JOIN canvas_node_detail s ON s.node_id=e.source_node_id JOIN canvas_node_detail t ON t.node_id=e.target_node_id
    WHERE project_id=? ORDER BY d.ordinal`).all(PROJECT).map(row => ({
      id: row.original_id, source: row.original_source, target: row.original_target,
      ...(row.has_source_handle ? { sourceHandle: 'out' } : {}), ...(row.has_target_handle ? { targetHandle: 'in' } : {}),
    }));
  const result = { ...(state.fixed_size !== null ? { fixedSize: Boolean(state.fixed_size) } : {}), version: 1, nodes, edges, ...(state.has_name ? { name: state.name } : {}),
    ...(state.workspace_id !== null ? { workspace: { id: state.workspace_id, folder: state.workspace_folder } } : {}) };
  // 恢复后再过原工程校验，坏库不能直接流进 React 节点或被当成空工程保存。
  if (!validation.document(result)) throw new Error('SQLITE_INVALID_STORED_DATA');
  return /** @type {Canvas} */ (result);
}

module.exports = { loadCanvas };
