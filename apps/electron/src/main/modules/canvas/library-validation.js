/** 与 shared 的固定工程库请求等价；任何输入只返回真假，不在校验阶段访问磁盘。 */
const validation = require('./project-validation');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (/** @type {unknown} */ value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
// Zod uuid 同时接受 RFC 的 NIL/MAX 特殊值；此处只校验形状，存在性仍由目录表确认。
const id = (/** @type {unknown} */ value) => typeof value === 'string' && (UUID.test(value) || /^(?:0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i.test(value));
const name = (/** @type {unknown} */ value) => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 80;

/** @param {unknown} input */
function request(input) {
  if (!object(input)) return false;
  const value = /** @type {Record<string,unknown>} */ (input);
  const fields = { list: [], purgeDeleted: [], libraryResources: [], importLibraryResources: ['files'], deleteResources: ['id', 'scope', 'document', 'resources'], create: ['name', 'folderId'], folder: ['name'], removeFolder: ['id'],
    move: ['ids', 'folderId'], remove: ['ids'], load: ['id'], close: ['id'], save: ['id', 'document'],
    resources: ['id', 'workspace'], restoreResource: ['id', 'resourceId', 'workspace'], retainResource: ['id', 'resourceId', 'retained', 'workspace'] };
  if (typeof value.operation !== 'string' || !Object.hasOwn(fields, value.operation)) return false;
  const keys = /** @type {string[]} */ (fields[/** @type {keyof fields} */ (value.operation)]);
  if (Object.keys(value).some(key => key !== 'operation' && !keys.includes(key))) return false;
  if ('name' in value && !name(value.name) || keys.includes('name') && !name(value.name)) return false;
  if (keys.includes('id') && !id(value.id)) return false;
  if ('workspace' in value && value.workspace !== undefined && !validation.workspace(value.workspace)) return false;
  if (keys.includes('resourceId') && !id(value.resourceId)) return false;
  if (keys.includes('retained') && typeof value.retained !== 'boolean') return false;
  if (keys.includes('folderId') && value.folderId !== null && !id(value.folderId)) return false;
  if (keys.includes('ids') && (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > 200 || !value.ids.every(id))) return false;
  if (value.operation === 'importLibraryResources') return Array.isArray(value.files) && value.files.length > 0 && value.files.length <= 200 && value.files.every(validation.media);
  if (value.operation === 'deleteResources') return (value.scope === 'project' || value.scope === 'library') && validation.document(value.document) && resourceTargets(value.resources);
  return value.operation !== 'save' || validation.document(value.document);
}

/** 文件快照不授权任意路径；这里只校验形状，服务随后核对真实归属和文件身份。 @param {unknown} value */
function resourceTargets(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 2000 && value.every(item => {
    if (!object(item)) return false;
    return Object.keys(item).length === 2 && typeof item.path === 'string' && item.path.length > 0 && item.path.length <= 32768
      && typeof item.identity === 'string' && item.identity.length > 0 && item.identity.length <= 1024;
  });
}

module.exports = { request };
