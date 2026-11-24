/** 画布沿用原文档契约；图和媒体关系分表，外嵌场景保持各自版本化协议。 */
const { randomUUID } = require('node:crypto');
const { put, statement } = require('./store-helpers');
const { saveMedia } = require('./canvas-media-store');
/** @typedef {import('node:sqlite').DatabaseSync} Database */
/** @typedef {import('@illusion-realm/shared').UserDataInfiniteCanvas} Canvas */
/** @typedef {Canvas['nodes'][number]} Node */
const PROJECT = 'canvas:active';
// 工程前缀隔离其他项目，原节点编号另存，不能因迁移改断已有连接。
const nodeKey = (/** @type {string} */ id) => `${PROJECT}:${id}`;
// 音频参数同样进入版本化附表，避免写后反读丢字段；媒体字节仍留在工程目录。
const CONFIGURATION_KEYS = ['promptConversion', 'promptReferenceLabels', 'upscale', 'workflowLoras', 'imageParameters', 'audioParameters', 'videoModelOverrides', 'videoSteps', 'videoFps', 'videoMegapixels', 'videoDuration', 'videoOutput', 'remoteImage', 'batchSize', 'noteAppearance', 'annotations'];

/** @param {Node['data']} data */
function configuration(data) {
  // 参数附表是独立契约例外；不把整个节点或用户文档塞进一个 JSON 列。
  return JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key]) => CONFIGURATION_KEYS.includes(key))));
}

/** @param {Database} db @param {Node} node @param {number} ordinal @param {string} revision */
function saveNode(db, node, ordinal, revision) {
  const id = nodeKey(node.id), data = node.data;
  put(db, 'canvas_node', {
    node_id: id, project_id: PROJECT, kind: data.kind === 'note' ? 'text' : data.kind,
    title: data.title, x: node.position.x, y: node.position.y,
    card_width: data.card?.width ?? 320, card_height: data.card?.height ?? 180,
  }, 'node_id');
  // v1 的 note 没在节点枚举里；真实种类独立保留，读取时恢复，不能变成文本节点。
  put(db, 'canvas_node_detail', {
    node_id: id, original_id: node.id, revision, ordinal, original_kind: data.kind,
    prompt: data.prompt, content: data.content, ratio: data.ratio, mode: data.mode ?? null,
    workflow: data.workflow ?? null, created_at: data.createdAt ?? null,
    resize_locked: data.resizeLocked === undefined ? null : Number(data.resizeLocked),
    has_card: Number(Boolean(data.card)), card_style: data.card?.style ?? null,
    has_inputs: Number(data.inputImages !== undefined), configuration_version: 1, configuration: configuration(data),
  }, 'node_id');
  saveReferences(db, id, data);
}

/** @param {Database} db @param {string} id @param {Node['data']} data */
function saveReferences(db, id, data) {
  // 清的是当前节点的关系行；共享资产和原媒体字节始终保留。
  statement(db, 'DELETE FROM canvas_media_reference WHERE node_id=?').run(id);
  statement(db, 'DELETE FROM project_document WHERE node_id=?').run(id);
  if (data.media) saveMedia(db, id, 'display', 0, data.media);
  data.inputImages?.forEach((media, ordinal) => saveMedia(db, id, 'input', ordinal, media));
  for (const [kind, document] of [['director', data.scene], ['composition', data.composition]]) {
    if (document) put(db, 'project_document', {
      node_id: id, document_kind: String(kind), schema_version: 1, body: JSON.stringify(document),
    });
  }
}

/** @param {Database} db @param {Canvas['edges'][number]} edge @param {number} ordinal */
function saveEdge(db, edge, ordinal) {
  const id = `${PROJECT}:${edge.id}`;
  put(db, 'canvas_edge', {
    edge_id: id, project_id: PROJECT, source_node_id: nodeKey(edge.source), target_node_id: nodeKey(edge.target),
    source_port: 'out', target_port: 'in',
  });
  put(db, 'canvas_edge_detail', {
    edge_id: id, original_id: edge.id, ordinal,
    has_source_handle: Number(edge.sourceHandle !== undefined), has_target_handle: Number(edge.targetHandle !== undefined),
  });
}

/** @param {Database} db @param {Canvas} canvas */
function saveCanvas(db, canvas) {
  const revision = randomUUID(), now = Date.now();
  // 只更新当前草稿，保留 v1 基础接口建立的其他工程及其业务关系。
  statement(db, `INSERT INTO canvas_project(project_id,name,schema_version,created_at,updated_at)
    VALUES(?,?,1,?,?) ON CONFLICT(project_id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at`)
    .run(PROJECT, canvas.name ?? '', now, now);
  put(db, 'canvas_state', {
    fixed_size: canvas.fixedSize === undefined ? null : Number(canvas.fixedSize),
    slot: 1, project_id: PROJECT, has_name: Number(canvas.name !== undefined),
    workspace_id: canvas.workspace?.id ?? null, workspace_folder: canvas.workspace?.folder ?? null,
  }, 'slot');
  statement(db, 'DELETE FROM canvas_edge WHERE project_id=?').run(PROJECT);
  canvas.nodes.forEach((node, ordinal) => saveNode(db, node, ordinal, revision));
  // 本次修订号像重新点名：没出现的旧节点才删除，不靠数组索引猜身份。
  statement(db, `DELETE FROM canvas_node WHERE project_id=? AND node_id NOT IN
    (SELECT node_id FROM canvas_node_detail WHERE revision=?)`).run(PROJECT, revision);
  canvas.edges.forEach((edge, ordinal) => saveEdge(db, edge, ordinal));
}

module.exports = { saveCanvas, PROJECT, CONFIGURATION_KEYS };
