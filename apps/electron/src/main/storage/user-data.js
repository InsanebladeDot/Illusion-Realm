/**
 * 用户文档的路径规则与 JSON 读写分开维护，路径实现仍在同一 storage 目录。
 * 保留 resolveUserDataPath 的旧返回约定，避免分类后回落到另一份空文档。
 * 此依赖不参与 schema 迁移，未知字段仍由原读写链路保留。
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  getDefaultUserDataPath,
  resolveUserDataPath,
} = require("./user-data-paths");

// 所有窗口共用一条写入队列，后到的文档不能被更晚完成的旧文档覆盖。
// 像账本按交付顺序逐本装订，异步写盘不代表允许同时修改同一本账。
// 失败只解除队列阻塞，原调用方仍收到拒绝并可以提示或重试。
// 读取接口保留同步启动行为；调用方需要新数据时应先等待写入 Promise。
// 不新增数据库、文档格式或默认目录，也不按模块拆成多个用户文件。
/** @type {Promise<void>} */
let writeQueue = Promise.resolve();

/**
 * 主进程只做 JSON 读写与路径解析，不掌握 schema 细节，因此产物类型用宽泛形状描述。
 * 默认值 / 合并 / 迁移全部由渲染进程负责（types/userData.ts + userDataDocument.ts）。
 *
 * @typedef {Record<string, unknown>} UserDataPayload
 * @typedef {{ filePath: string, data: UserDataPayload | null, isNew: boolean }} UserDataReadResult
 */

/**
 * 读取并解析 JSON 文件
 * @param {string} filePath
 * @returns {UserDataPayload | null} 不存在或解析失败返回 null
 */
function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 写入 JSON（自动建目录，带结尾换行）
 * @param {string} filePath
 * @param {UserDataPayload} data
 * 临时文件与目标在同一目录，完成后再替换，写入失败保留原文件。
 * 临时名带独立编号，其他进程或上次异常退出的文件不会被误复用。
 * writeFile 与 rename 都使用异步文件接口，不在主事件循环等待磁盘。
 * JSON 的缩进和结尾换行保持原样，旧版本和外部工具仍可读取。
 * 序列化失败发生在写临时文件之前，不会破坏已存在的用户文档。
 * catch 只清理自己创建的临时目标，不递归删除目录或其他用户数据。
 * 删除临时文件失败不能掩盖原来的写入错误，异常仍交给 IPC 收敛。
 * rename 成功才允许向界面报告写入完成，不把开始写盘当成成功。
 * 不返回系统异常堆栈，外层 registerHandle 继续负责原错误边界。
 * 不输出用户内容、文件名、路径或密钥到日志。
 * 替换是单文件可见性保证，不宣称断电后已 fsync 到物理硬盘。
 * 这是原保存接口内部机制，preload 与 shared 返回形状均保持不变。
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, data) {
  // 同目录临时文件避免跨卷 rename 退化为整份复制。
  // mkdir 只补缺失目录，不预先截断或删除旧目标文件。
  // 其他读取者只能看到旧完整文件或替换后的新完整文件。
  // 未知 schema 字段全部保留，主进程不按当前界面重建缩水文档。
  // text 在写前固定，后续引用变动不会影响正在写入的后半段内容。
  // 临时编号不含用户名、提示词或模型名，不把业务数据放进文件名。
  // 序列化失败时尚未触碰目标，循环对象不能把旧文件变成空文件。
  // unlink 使用本次生成的精确文件名，不模糊匹配删除其他临时文件。
  // 临时文件可能尚未创建，清理失败不能覆盖原有写入错误。
  // rename 权限失败保留旧文件，下次操作可以重新创建独立临时文件。
  // 错误继续交统一 IPC 边界，renderer 的 pending 恢复机制仍可重试。
  // 失败不自动无限重试，避免磁盘不可用时形成后台任务积压。
  // 原来的一份 JSON 格式不变，外部备份无需认识额外数据库或日志。
  // 默认值和版本迁移仍由 renderer 处理，写盘层不擅自删改设置。
  // 同步启动读取保持原样，不为优化保存顺便引入过期读缓存。
  // 写入队列只登记待完成 Promise，不长期保存已经落盘的历史版本。
  // operation 完成后局部字符串与 data 可随调用释放。
  // data 返回值暂时保留，精简跨进程字段需另行核对所有消费者。
  // 此处只保证单文件替换可见性，不能据此承诺断电后绝对不丢数据。
  // 多窗口的顺序由主进程协调，不要求各窗口复制一套相同锁机制。
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(temporary, text, "utf8");
    await fs.promises.rename(temporary, filePath);
  } catch (error) {
    await fs.promises.unlink(temporary).catch(() => {});
    throw error;
  }
}

/**
 * 读取用户数据：优先用户配置的路径，回落到默认路径
 * @param {string | null} [customPath] 渲染进程传入的自定义路径
 * @returns {UserDataReadResult}
 */
function readUserData(customPath) {
  const defaultPath = getDefaultUserDataPath();
  const defaultExists = fs.existsSync(defaultPath);
  const defaultDoc = readJsonFile(defaultPath);
  const defaultSettings = /** @type {{ userDataPath?: unknown } | undefined} */ (
    defaultDoc?.settings
  );
  const seededPath =
    customPath ||
    (typeof defaultSettings?.userDataPath === "string" ? defaultSettings.userDataPath : "") ||
    (typeof defaultDoc?.userDataPath === "string" ? defaultDoc.userDataPath : "");
  const configuredPath = resolveUserDataPath(seededPath);

  if (configuredPath === defaultPath) {
    return {
      filePath: defaultPath,
      data: defaultDoc,
      isNew: !defaultExists,
    };
  }

  const customExists = fs.existsSync(configuredPath);
  const customDoc = readJsonFile(configuredPath);
  if (customDoc) {
    return {
      filePath: configuredPath,
      data: customDoc,
      isNew: !customExists,
    };
  }

  if (defaultDoc) {
    return {
      filePath: defaultPath,
      data: defaultDoc,
      isNew: false,
    };
  }

  // 自定义路径文件尚不存在：仅回传路径种子，由渲染侧合并出完整文档
  return {
    filePath: configuredPath,
    data: {
      userDataPath: configuredPath,
      settings: { userDataPath: configuredPath },
    },
    isNew: !customExists && !defaultExists,
  };
}

/**
 * 写入用户数据到其自身声明的路径
 * @param {UserDataPayload} data
 * @returns {Promise<{ filePath: string, data: UserDataPayload }>}
 */
async function writeUserData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("无效的用户数据");
  }

  const settings = /** @type {{ userDataPath?: unknown } | undefined} */ (data.settings);
  const seededPath =
    (typeof settings?.userDataPath === "string" ? settings.userDataPath : "") ||
    (typeof data.userDataPath === "string" ? data.userDataPath : "");
  const targetPath = resolveUserDataPath(seededPath);
  // 顺序在接收请求时登记，不能等 mkdir 结束才决定谁先保存。
  // 每个操作等待上一项无论成功或失败，失败文档不会永久堵住后续保存。
  // operation 的异常原样交回本次调用，队列的 catch 只用于维持通道可用。
  // 返回的完整文档暂时保留，避免未经迁移就改变已有 IPC 消费方契约。
  // 自定义目标路径仍由原解析器决定，队列不能悄悄回退到默认空文件。
  // 两个路径的请求也按提交顺序完成，移动设置时不会产生乱序成功反馈。
  const operation = writeQueue.then(() => writeJsonFile(targetPath, data));
  // Promise 回调中的 stringify 在轮到本次保存时执行，避免预先堆积全部大字符串。
  // IPC 在接收参数时已有结构化克隆，renderer 后续编辑不会突变这份主进程参数。
  // 主进程内部调用者也应传本次保存的快照，而不是之后还会原地改写的共享对象。
  // 本队列保证提交顺序，不能自动合并两个窗口各自基于旧数据生成的文档。
  // 跨窗口的字段合并仍需业务遵守现有共享文档机制，不能把串行写盘当数据库事务。
  // 大量独立调用仍会全部执行，普通设置的合并节流继续由 renderer 负责。
  // 保存队列不主动丢弃中间请求，避免显式保存的回执对应到另一份文件内容。
  // 一个路径失败后另一路径仍可继续，错误不会把整个应用保存能力永久锁死。
  // 操作返回前 await 完成替换，导航前主动 flush 可以等待真实落盘边界。
  // 不把 temporary 名称回传 renderer，调用方始终看到最终 targetPath。
  writeQueue = operation.catch(() => {});
  await operation;
  return { filePath: targetPath, data };
}

module.exports = {
  readUserData,
  writeUserData,
  getDefaultUserDataPath,
};
