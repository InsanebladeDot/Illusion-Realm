/**
 * 更新日志先查分发资源，再查开发构建和 public，保留原读取优先级。
 * 这些资源路径随模块深度校正，但返回的日志文本不作格式变换。
 * 用户数据 IPC 和更新日志读取都是 storage 边界，不向 preload 暴露文件系统模块。
 */
/**
 * ipc-channels：主进程和 preload 消费同一份 CommonJS 通道常量。
 * result：沿用统一 IPC 结果和参数校验入口。
 * ipc-channels：通道值必须与 shared 的类型表一致，路径调整不能重命名通道。
 * result：注册时先移除同名 handler，返回值仍为 IpcResult。
 * ipc-channels：避免新旧通道混用造成 invoke 找不到 handler。
 * result：业务错误不跨进程抛出，目录迁移不能改变失败形状。
 */
const fs = require("fs");
const path = require("path");

const { IPC_CHANNELS } = require("../../common/ipc-channels");
const { registerHandle } = require("../ipc/result");
const { readUserData, writeUserData, getDefaultUserDataPath } = require("./user-data");

/**
 * 本地 JSON 持久化：读取 / 写入 / 取默认路径
 * @returns {void}
 */
function registerUserDataHandlers() {
  registerHandle(IPC_CHANNELS.USER_DATA_READ, async () => readUserData());

  registerHandle(
    IPC_CHANNELS.USER_DATA_WRITE,
    /**
     * @param {Electron.IpcMainInvokeEvent} _event
     * @param {unknown} data 持久化文档（运行期未校验，需在此窄化）
     * @returns {Promise<{ filePath: string, data: Record<string, unknown> }>}
     */
    async (_event, data) => {
      const payload = /** @type {Record<string, unknown>} */ (data);
      return writeUserData(payload);
    },
    /** @param {unknown[]} args @returns {string | null} */
    (args) => {
      const [data] = args;
      if (!data || typeof data !== "object") return "无效的用户数据";
      return null;
    }
  );

  registerHandle(IPC_CHANNELS.USER_DATA_GET_DEFAULT_PATH, async () =>
    getDefaultUserDataPath()
  );
}

/**
 * 改动日志：打包后读 resources/next-out，dev 下读 apps/next/out 或 public
 * @returns {void}
 */
function registerChangelogHandlers() {
  registerHandle(IPC_CHANNELS.CHANGELOG_READ, async () => {
    /** @type {string[]} */
    const candidates = [
      path.join(process.resourcesPath || "", "next-out", "changelog.md"),
      path.join(__dirname, "../../../../next/out/changelog.md"),
      path.join(__dirname, "../../../../next/public/changelog.md"),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return fs.readFileSync(candidate, "utf8");
        }
      } catch {
        // 试下一个候选
      }
    }
    return null;
  });
}

module.exports = { registerUserDataHandlers, registerChangelogHandlers };
