/**
 * 文字改图队列适配：冻结素材、参数与目标，交给已有图片 FIFO 调度。
 * 本模块只组合执行器与现有任务展示，不创建第二个 pending 或 drain。
 * 同一队列内，普通图片的批量任务结束后才会轮到文字编辑任务。
 * 编辑页面是否挂载不影响上传、推理、保存与完成通知。
 * 调用者消费返回 promise，将最终结果写回常驻编辑草稿。
 * 任务缩略图与编辑画布分别拥有 URL，清空草稿不影响公共任务历史。
 */
import { enqueueGenerationTask, snapshotGeneration, generationSaveTarget } from "@/utils/image-generation-queue";
import { runAnimaEdit } from "@/utils/comfy/run-anima-edit";
import { buildAnimaEditPrompt, type AnimaEditSettings } from "@/utils/comfy/anima-edit-workflow";
import { useGenerationTaskStore } from "@/stores/useGenerationTaskStore";
import { useGenerationNoticeStore } from "@/stores/useGenerationNoticeStore";
import type { EditPhase, EditSource } from "@/stores/use-anima-edit-store";
// 控制图复用同一队列适配器，不绕过共享 FIFO 和取消身份。
// 普通图片参数只在明确打开边缘检测后转换，其他图片流完全保持原路径。
// File 冻结边缘检测结果的 PNG 字节，后续改阈值不改变已排队任务。

/**
 * 只在明确提交时调用，File 是已完成本地校验和解码的输入素材。
 * value 来自标准模型选择快照，包含当前 UNet 与全部 LoRA 权重。
 * buildAnimaEditPrompt 先做纯参数校验，无效 seed 等不会进入远端副作用。
 * source 的 File 不可变；settings 深克隆后不再跟踪用户后续修改。
 * 服务器、输出设置与目标目录沿用普通图片任务的快照入口。
 * 输出默认路径在执行时解析，传入的是提交时设置而不是当前设置。
 * initial dimensions 是按源比例估算值，保存完成后用真实解码宽高覆盖。
 * 当前编辑契约固定一张，不能偷偷读取普通图片页的批量数量。
 * 阶段通知同时更新表单与卡片，卡片状态沿用已有生成/保存枚举。
 * checking/uploading 在全局卡片归入活动生成，表单保留更具体的阶段文字。
 */
export function enqueueAnimaEdit(source: EditSource, value: AnimaEditSettings, onPhase: (phase: EditPhase) => void) {
  // 深克隆保证等待期间 LoRA 数组也不再变化，不能只复制最外层对象。
  // 纯构建先验证长度、范围和 seed；服务端模型存在性仍在执行时刷新。
  // 本机原文件名只用于预校验，最终 prompt 使用上传服务确认的名称。
  const settings = structuredClone(value); buildAnimaEditPrompt(settings, source.file.name);
  // 这里只取通用队列的运行上下文，不把编辑当成一次文生图来构建。
  // 模型摘要用于卡片，实际推理图仍完全由 runAnimaEdit 构建。
  // 源尺寸用于排队前估算，不能把 0×0 的占位值当成已知结果。
  const input = snapshotGeneration({ positivePrompt: settings.instruction, checkpointName: settings.checkpointName });
  // LLLite 模板从源图读取宽高，不能用旧参考链的 MP 缩放预估任务尺寸。
  // 普通文字编辑保持原缩放规则，两类任务最终都由实际结果解码修正。
  // 蒙版保留原尺寸可避免笔迹与图像错位，边缘图也不在上传前再次缩放。
  const scale = settings.controlMode ? 1 : Math.sqrt(settings.megapixels * 1e6 / (source.width * source.height));
  // phase 在模块闭包中同步更新，取消不依赖 React 是否完成下一帧提交。
  // 队列等待期间没有远端会话，因此初始值必须是 queued。
  // onPhase 不保存组件 setter，调用者使用常驻 store 的 patch。
  // 同一个编辑任务只拥有一个槽位，不能在 LoRA 切换时拆成多个并发请求。
  // 终态由公共队列统一管理，表单只订阅更细的当前阶段。
  // 后端取消确认失败会经过统一 finishFailure，必要时终止后续排队项。
  // 普通模型或参数失败不应清掉其他合法任务，继续沿用已有队列策略。
  // 这些规则位于公共调度器，编辑适配层不自行吞掉错误或改写退出状态。
  let phase: EditPhase = "queued";
  // 任务元数据是提交摘要，不包含 File 字节、用户绝对路径或凭据。
  // source.file 由执行闭包保留，离开页面后仍能完成尚未开始的上传。
  // pending 任务撤回后整个闭包释放，不产生额外的上传缓存。
  return enqueueGenerationTask({ prompt: settings.instruction, model: settings.checkpointName, width: Math.max(8, Math.round(source.width * scale / 8) * 8), height: Math.max(8, Math.round(source.height * scale / 8) * 8), total: 1, folderId: input.folderId }, async (id, signal) => {
    // 执行器被调用意味着 FIFO 已放行，排队时绝不提前开始目录解析或上传。
    // 通知与任务卡片此时才切为活动，不能覆盖前一任务的运行提示。
    // 目录解析可能跨 IPC 等待，返回后先判断期间有没有显式取消。
    const update = useGenerationTaskStore.getState().update;
    phase = "checking"; onPhase(phase); update(id, { status: "generating" }); useGenerationNoticeStore.getState().start();
    const target = await generationSaveTarget(input); signal.throwIfAborted(); update(id, { folderId: target.folderId });
    // onPhase 的真实边界来自执行器，不能用固定 timer 猜测正在上传或保存。
    // 保存阶段同时锁住公共卡片的取消路径，避免已经写盘却显示已撤回。
    // generating 标记在安全生成 IPC 前同步设置，使停止总能定位 requestId。
    // signal 由公共队列持有，页面卸载不触发 abort。
    // 上传回包或模型刷新等待结束后，执行器仍会检查 signal。
    const result = await runAnimaEdit(source.file, settings, { id, signal, server: input.server, output: target.path, onPhase: (next) => { phase = next; onPhase(next); update(id, { status: next === "saving" ? "saving" : "generating" }); } });
    // 成功返回已经包含落盘确认，只有此时可以增加完成数量并展示保存路径。
    // 全局任务保留原 URL；编辑画布另建 URL，任务历史裁剪不能破坏当前结果。
    // Blob 字节本身可复用，创建另一个 URL 不重新下载或重编码图片。
    // 完成通知使用冻结后的真实目标，不能跳到用户刚切换浏览的目录。
    // 不在成功后再检查 signal：保存开始即不可撤回，完整落盘应如实报告成功。
    // 编辑同样在创建预览中展示，沿用文生图的精确文件身份。
    // 当前编辑结果只取首图，与 image.objectUrl 的来源一致。
    // 编辑画布仍拥有独立 URL，图库去重不会清理画布或源素材。
    update(id, { status: "completed", completed: 1, savedPaths: result.savedPaths, previewUrl: result.image.objectUrl, previewFilePath: result.savedPaths[0] ?? null, width: result.width, height: result.height });
    useGenerationNoticeStore.getState().succeed({ filePath: result.savedPaths[0] ?? null, folderId: target.folderId });
    return { ...result, image: { ...result.image, objectUrl: URL.createObjectURL(result.image.blob) } };
  // 仅远端生成阶段发送后端取消；检查和上传阶段只阻止后续操作。
  // phase 是每次回调最新写入的值，不能捕获提交时 queued 的旧快照。
  // 保存阶段的保护由公共取消入口统一执行，表单与卡片遵守同一边界。
  }, () => phase === "generating");
}
