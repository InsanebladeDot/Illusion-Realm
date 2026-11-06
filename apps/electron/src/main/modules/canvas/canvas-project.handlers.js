// 工程能力通过三个窄接口开放：收素材、导出当前画布、选择并导入工程。
// 路径根由主进程确定，系统框取消返回 null，错误交给 registerHandle 统一包装。
const { dialog, BrowserWindow } = require("electron");
const path = require("node:path");
const { IPC_CHANNELS } = require("../../../common/ipc-channels");
const { registerHandle } = require("../../ipc/result");
const { getDefaultUserDataPath } = require("../../storage/user-data-paths");
const validation = require("./project-validation");
const { importAssets } = require("./project-assets");
const { writeArchive, readArchive } = require("./project-archive");

// 文件异常通常带完整路径；跨边界只返回稳定业务错误，日志不输出用户目录。
// 取消是正常 null，不经过这个异常分支；真正失败不能吞掉变成成功。
/** @template T @param {() => Promise<T>} action @returns {Promise<T>} */
// 文件服务的原始异常可能带源路径、目标路径与系统堆栈。
// 这里把它们换成稳定业务错误，再交给统一 IpcResult 包装。
// 不会把错误转成 null，null 专门表示用户取消。
// 不会在错误分支返回空图，避免调用者误把失败当成新工程。
// 不记录原始异常内容，因为本服务处理的是用户私有目录。
// 界面展示固定可操作提示，仍保留当前图供用户重试。
// 此边界覆盖实际复制、写包、读包操作的异步拒绝。
// 参数形状校验仍由 registerHandle 在服务执行前完成。
// 模板参数只用于保持返回类型，不改变运行期载荷。
// 不能在这里再次套 success，否则会变成两层 IpcResult。
async function projectBoundary(action) {
  try { return await action(); }
  catch { throw new Error("canvas-project-operation-failed"); }
}

// 不使用渲染层传来的窗口编号，选择框始终归真正的调用窗口。
// 测试只注入资产根目录，不把任意根目录字段加入产品 IPC。
/** @param {{ root?: string }} [options] */
// 这组接口只开放三种明确意图，不提供任意文件管理器。
// 导入素材请求携带来源描述，目录根不在请求字段中。
// 导出工程请求携带稳定文档，不携带浏览器播放器状态。
// 打开工程不接路径参数，必须从所属窗口的系统框选择。
// 测试注入 root 是主进程函数参数，不是产品 preload 能力。
// 默认根沿用现有 user 目录，不新增第二套用户设置路径。
// 注册通过统一助手，异常返回遵守现有错误封装。
// 合法媒体请求只校验一份完整请求对象。
// 额外位置参数会被拒绝，避免未来出现模糊签名。
// 导出前也验图，渲染层校验不能成为唯一防线。
// 保存框 owner 从 event.sender 查找，不能让请求控制其他窗口。
// 找不到 owner 就失败，不弹无归属系统框干扰用户。
// 默认输出文件名来自作品标题，但系统框负责最终路径选择。
// 过滤器只帮助选择，不代替后续文件格式与权限校验。
// 用户取消保存框时还没有启动打包，不产生成功文件。
// 选择的文件名没有后缀时补 ircanvas，不要求用户记住格式。
// 已存在后缀大小写不敏感，避免生成双重 .ircanvas。
// 实际写包等待完成后才回目标路径。
// 返回目标路径供请求结果使用，界面不把完整路径铺到公开画布。
// 打开框只允许单选，一次工程替换不能混进多份工程。
// 取消打开框不会调用 readArchive，也不会触发新目录分配。
// 选择框成功但文件损坏时仍返回失败，不能只看系统框结果。
// 读取返回的文档已经经过主进程结构、关系和摘要检查。
// 渲染收到后再次规范化，保证正式恢复仍使用原 schema。
// 打开接口不接受额外参数，不能借它指定未经选择的文件。
// 服务不自动保存当前画布，未保存确认属于页面交互边界。
// 服务也不上传工程，不把媒体传到 Agent 或生成接口。
// 旧用户文档通道仍负责草稿，这三个接口不替换账户和设置存储。
// 系统框取消与磁盘错误分别在界面显示，不共用成功提示。
// 所有注册只发生一次，页面多次进入不重复添加 IPC handler。
function registerCanvasProjectHandlers(options = {}) {
// 这组服务的取消矩阵与错误矩阵不同。
// 保存框 canceled=true 返回 null，不创建临时包。
// 保存框没有 filePath 也按取消，不拼一个空输出地址。
// 打开框 canceled=true 不调用 readArchive。
// 打开框没有首个路径同样返回 null。
// 有效打开框但文件损坏时抛固定业务错误。
// 有效保存框但源缺失时也是失败，不返回目标名装作完成。
// 合法空画布可以导出，包内没有媒体并不算失败。
// 非法文档在打开系统保存框之前就被 validator 拒绝。
// 非法媒体请求同样在创建任何目录前返回 INVALID_ARGUMENT。
// 没有 owner 的调用不能弹窗，避免后台无归属交互。
// 文件系统错误不会把 Node Error 对象直接跨 IPC 暴露。
// 接口的成功 data 不再自己套 success，封装只有注册助手一层。
// 本轮没有更改 registerHandle 的全仓异常规范。
// 因此既有服务的错误契约不因新增画布域被重写。
// 通道名双端必须同值，但主进程源码保留双引号以通过现有静态审计。
// 不能只看运行时正常就忽略门禁对通道表的明确格式要求。
// 新增通道接入汇总注册后，preload 才能实际 invoke 到 handler。
// 仅添加类型声明不能算系统能力已经接通。
// 最终回归必须使用生产 preload、生产协议和静态导出页面。
  const root = options.root || path.dirname(getDefaultUserDataPath());
  registerHandle(IPC_CHANNELS.CANVAS_IMPORT_MEDIA, (_event, request) => projectBoundary(() => importAssets(root, request)), args => args.length === 1 && validation.importRequest(args[0]) ? null : "canvas-invalid-import");
  registerHandle(IPC_CHANNELS.CANVAS_EXPORT_PROJECT, async (event, document) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error("canvas-window-unavailable");
    const result = await dialog.showSaveDialog(owner, { defaultPath: `${document.name || "Canvas"}.ircanvas`, filters: [{ name: "Illusion Realm Canvas", extensions: ["ircanvas"] }] });
    if (result.canceled || !result.filePath) return null;
    const target = result.filePath.toLowerCase().endsWith(".ircanvas") ? result.filePath : `${result.filePath}.ircanvas`;
    await projectBoundary(() => writeArchive(target, document));
    return target;
  }, args => args.length === 1 && validation.document(args[0]) ? null : "canvas-invalid-document");
  registerHandle(IPC_CHANNELS.CANVAS_OPEN_PROJECT, async event => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error("canvas-window-unavailable");
    const result = await dialog.showOpenDialog(owner, { properties: ["openFile"], filters: [{ name: "Illusion Realm Canvas", extensions: ["ircanvas"] }] });
    return result.canceled || !result.filePaths[0] ? null : projectBoundary(() => readArchive(result.filePaths[0], root));
  }, args => args.length === 0 ? null : "canvas-invalid-open");
}
module.exports = { registerCanvasProjectHandlers };
