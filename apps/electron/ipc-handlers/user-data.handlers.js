const fs = require("fs");
const path = require("path");

const { IPC_CHANNELS } = require("../ipcChannels");
const { registerHandle } = require("../ipcHandlers");
const { readUserData, writeUserData, getDefaultUserDataPath } = require("../userData");

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
      path.join(__dirname, "..", "..", "next", "out", "changelog.md"),
      path.join(__dirname, "..", "..", "next", "public", "changelog.md"),
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
