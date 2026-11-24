/**
 * 用随应用的 Electron 初始化本机 SQLite 结构，不迁移用户 JSON 或启动窗口。
 * Electron 自带 SQLite，命令不下载另一份数据库程序，也不触发 native 模块重编译。
 * 路径由现有用户文档定位器决定，自定义 JSON 位置不会被静默回退到软件安装目录。
 * 开库、版本检查或目录权限失败时必须非零退出，不能把创建文件当成结构安装成功。
 * 此命令会创建或核对真正的数据库文件，不是返回固定版本号的演示接口。
 * 如果库已经存在，只核对应用标记和迁移摘要，不清空表，也不覆盖旧 JSON。
 * 输出只含引擎版本和结构状态，不记录用户路径、提示词、API 密钥或目录内容。
 * 最后 await close，退出前释放连接和后台线程，避免下一次启动仍被文件锁阻挡。
 */
const { app } = require('electron');
const { openBusinessDatabase } = require('../apps/electron/src/main/storage/sqlite/client');

/**
 * 第一条 status 等待真实工作线程完成开库和迁移，不能凭 Worker 创建成功就报告可用。
 * finally 兼顾查询失败的资源释放，close 失败同样进入外层错误退出边界。
 * 不使用 app.exit 逃过仍在等待的保存；本命令关闭自有客户端后才结束进程。
 * 运行成功仅表示数据库基础可用，不表示旧下载、生成历史或工程已经迁入。
 * 现有业务仍以旧存储为准，本命令不会为它们生成空历史回执。
 * 命令没有 BrowserWindow，所以不声称验证了界面、键盘或人工安装向导。
 * 数据库状态来自实际 PRAGMA，机器上的 SQLite CLI 版本不参与判断。
 * 因为只有一个自有连接，无需终止用户正在使用的幻域实例。
 */
async function main() {
  // 不接收 --path 任意外部参数，防止初始化命令变成覆盖陌生数据库的入口。
  // 文件位置遵从主进程服务，命令不会另建一个仅供演示使用的旁路目录。
  // Worker 在第一条状态请求前完成结构事务，状态回执就是可查询的真实结果。
  // status 不返回完整表内容，初始化日志不会变成用户历史泄露渠道。
  // openBusinessDatabase 会读取现有 JSON 的位置，但从不保存或清空它。
  // 已有文件匹配 v1 时不重复执行 CREATE，也不重置主键和现有记录。
  // 新建空表之后仍保留旧业务权威来源，不修改创建页或画布的读取顺序。
  // 如果 close 抛错，外层失败出口仍会非零结束，而不是打印成功后吞掉收尾异常。
  // CLI 输出的 ready 指数据库基础已就绪，不代表所有规划表都有业务调用方。
  // 用户可重复执行核对结构，但不应把它用作数据库修复或旧数据导入命令。
  const { client } = openBusinessDatabase();
  try {
    console.log('SQLite foundation ready:', JSON.stringify(await client.request('status')));
  } finally {
    await client.close();
  }
}

// app.ready 后才使用用户数据路径，避免打包态 exe 目录尚未可用时误选工作目录。
// 成功出口与错误出口明确分开，原生异常堆栈不会被打印到用户日志。
// 不打印原始 error.message，SQLite 或 Node 文件错误可能包含本机路径。
// 固定错误说明供 CLI 判断失败，详细诊断由隔离回归提供。
// 本命令不接 IPC，也不为渲染进程暴露 openBusinessDatabase 的路径结果。
// 退出码零只能由主过程与关闭过程都完成后产生。
app.whenReady().then(main).then(() => app.exit(0)).catch(() => {
  console.error('SQLite initialization failed; existing user data retained.');
  app.exit(1);
});
