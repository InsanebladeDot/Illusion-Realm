/**
 * ComfyUI 模型内存释放：向固定 /free 端点提交卸载与缓存清理标志。
 * 像给仓库送一张腾空工作台的工单，收件成功不等于工作台已经清空。
 * ComfyUI 的执行线程读取这些标志，正在运行时会等当前任务结束。
 * 因此返回值只能表示接受请求，不能让界面宣称已经释放多少显存。
 * unload_models 卸载驻留模型，free_memory 同时请求执行器缓存清理。
 * 两个标志都要发送；只清设备缓存不一定能卸载仍被引用的模型。
 * 这里只影响当前 ComfyUI 服务内存，不读写模型文件和生成结果。
 * 不调用 /interrupt 或 /queue，保留其他客户端与当前用户的任务。
 * HTTP 复用 comfy-request 的超时和错误码，离线时不会无限挂起。
 * /free 官方成功响应没有 JSON；读取 JSON 会把真成功误报为失败。
 * 响应体不参与业务判断，及时取消读取，避免占用连接资源。
 * 失败状态只报告状态码，不把远端错误页面或用户地址写进日志。
 */
const { comfyError, requestComfy } = require("./comfy-request");
// 服务只需要 fetch 响应状态，没有 reason、模型名称或用户文件路径参数。
// 不枚举当前加载模型；/free 的卸载标志由 ComfyUI 应用于它自己的驻留模型集合。
// 未配置的远端鉴权不是本接口新增的能力，地址仍使用项目已有 host:port 形式。
// HTTP 连接成功但返回非 2xx 时，同样需要报告操作失败。
// 收到响应头以后无需下载响应体，错误页面也不必缓存到客户端。
// requestComfy 的 AbortSignal 同时传给 fetch，不依赖窗口的可见性或动画帧。
// 此模块没有创建定时任务，重复点击不会留下定时卸载模型的后台策略。
// 内存释放不会重建 ComfyUI 进程，已经排队的 prompt 仍由远端继续执行。
// 下个任务如需同一模型，ComfyUI 可以重新从磁盘加载，文件本身保持存在。
// 接口没有确认执行完成的任务 ID，因此不能用生成 history 来轮询释放结果。
// 两个 true 标志随每次请求一起提交，保证不会出现只清执行器却遗漏模型的分叉。
// 保留当前共用错误分类，避免把同一次网络故障在不同按钮显示成不同业务结果。

/**
 * 校验形状与共享 ComfyFreeMemoryArgsSchema 保持一致。
 * 拒绝协议、路径和凭据，防止地址覆盖后面固定的 /free 路由。
 * IPv6 必须带方括号，避免地址内部的冒号与端口混淆。
 * 端口范围与连接有效性由 HTTP 层判定，校验器不尝试联网。
 * 先判断类型再使用字符串方法，任意畸形 IPC 输入都不能抛错。
 * 参数个数也属于契约，不能静默忽略额外参数导致调用方误解。
 * 不把收到的地址拼入错误消息，避免错误日志保存用户网络信息。
 * @param {unknown[]} args IPC 原始参数数组，校验阶段尚无可信类型。
 */
function validateFreeMemory(args) {
  const server = args[0];
  return args.length === 1 && typeof server === "string" && server.length <= 255
    && /^(?:[A-Za-z0-9.-]+|\[[A-Fa-f0-9:]+\])(?::[0-9]{1,5})?$/.test(server)
    ? null : "Invalid ComfyUI server address";
}

/**
 * 发出释放请求；只在收到 2xx 后返回接受标记。
 * 主进程 handler 是异常边界，网络拒绝不会被替换成 true。
 * timeout 由共用请求器控制，不另设可能遗留的计时器。
 * POST 请求带 JSON 类型，符合 ComfyUI 对 request.json 的读取方式。
 * 请求字段固定，前端不能关闭其中一个标志或夹带其他命令。
 * 响应即使为空也可成功，不检查输出文件或等待新生成结果。
 * 取消响应体后再检查状态，失败路径同样释放连接资源。
 * 返回布尔值而非 IPC 包装，由 registerHandle 统一封装成功结果。
 * @param {string} server 已通过参数校验的 ComfyUI 主机地址。
 */
async function freeComfyMemory(server) {
  const response = await requestComfy(server, "/free", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  });
  await response.body?.cancel();
  if (!response.ok) throw comfyError("COMFY_EXECUTION_FAILED", `ComfyUI memory request rejected (${response.status})`);
  return true;
}

module.exports = { freeComfyMemory, validateFreeMemory };
