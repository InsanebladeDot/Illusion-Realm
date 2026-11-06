/**
 * 音频传输和保存：复用现有 ComfyUI IPC，不在渲染进程直接访问文件系统。
 * 主进程把非图片历史文件放在 videos 数组；此处按 audio 输出类别筛选。
 * 这个历史字段名不代表内容一定为视频，不能给音频默认添加 mp4 后缀。
 * 不创建播放 URL，URL 所有权由常驻音频草稿负责，避免失败后泄漏。
 */
import { uploadImageToComfy } from '@/api/comfyui';
import type { ComfyApiPrompt } from '@/types/comfy';
import { unwrapIpc } from '@/utils/ipcResult';
import { t } from '@/i18n';

// filename 仅用于展示与保留真实扩展名，不包含服务端绝对路径。
// dataUrl 为主进程从 /view 下载的真实字节，不是浏览器可跨域访问的远端 URL。
// 解码后的 Blob 复用于播放，无需再次下载临时输出。
// 保存成功之前不能把本接口返回值视作已完成的用户文件。
// 播放 Blob 的类型来自 HTTP content-type，不能由原参考音频格式推测。
// 参考输入和生成输出可能采用不同编码，二者分别判断扩展名。
// dataUrl 在保存完成后只作为当前调用临时值，不被写进 Zustand 结果列表。
// 结果 store 仅保留 object URL 与已保存路径，避免重复持有大段 base64。
// 单个生成任务允许多项音频输出，保存端不无声截断到第一项。
// 主进程返回的 nodeId 属于输出定位信息，本展示层不依赖固定数字 id。
// 文件已经由主进程下载，本模块不向远端 /view 再发浏览器跨域请求。
// 接口中的 blob 不跨 IPC，Blob 仅在浏览器进程为播放器创建。
// 跨 IPC 继续使用已有纯 JSON 的 IpcResult，没有扩张 preload API 面。
export interface AudioOutput { filename: string; dataUrl: string; blob: Blob }

// 接受项目上传控件可选择的常用格式；无法识别时明确拒绝而不是伪装成 wav。
// MIME 映射补足无扩展名的音频文件，编码字节不会在本地被转码。
// 英文随机名称避免中文 multipart 名称差异，也避免覆盖另一任务的同名参考。
// 不记录原文件名或音频字节，用户的私人内容不进入日志。
const AUDIO_EXTENSIONS = /\.(wav|mp3|flac|ogg|m4a|aac|opus|aiff|aif|webm)$/i;
const MIME_EXT: Record<string, string> = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/flac': 'flac', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm' };

// 扩展名只从白名单中产生，不把路径分隔符或用户文本拼进远端路径。
// 0 字节音频无法作为参考使用，前端应在排队前报告它。
// 500 MiB 上限避免把过大媒体一次转成 base64 占用渲染进程内存。
// 后端仍有自己的校验，本地检查并不代替 IPC 安全边界。
// 有合法扩展名时保留其编码后缀，不因 MIME 不精确而强制改名。
// 没有合法后缀时仅接受明确已知的音频 MIME，不使用任意用户尾缀。
// 文件名中的非 ASCII 字符被忽略，提取的只是白名单中的 ASCII 后缀。
// MIME 为 audio/mpeg 的无后缀文件可得到 mp3，避免用户必须手工改名。
// MIME 无法识别且扩展名不受支持时，提示重新选择，不猜测真实编码。
// 空文件被拒绝是因为 LoadAudio 无法解码，不表示模型目录或网络故障。
// 上限按 File.size 原始字节计算，未把 base64 长度误当作文件大小。
// 大小校验在读取 arrayBuffer 之前执行，拒绝不需要先把大文件加载进内存。
// 该边界不检测声道数或采样率，实际格式合法性由 ComfyUI 解码器确认。
// 仅扩展名有效不能证明文件真实可解码，本地校验不宣称完成媒体内容检测。
export function audioExtension(file: File) {
  const extension = AUDIO_EXTENSIONS.exec(file.name)?.[1].toLowerCase() ?? MIME_EXT[file.type];
  if (!extension || !file.size || file.size > 500 * 1024 * 1024) throw new Error(t('create.audio.invalidReference'));
  return extension;
}

// 上传通道沿用官方 /upload/image，该端点会原样把音频文件写入 input。
// 服务端若因重名改变文件名，以响应名称为准，不根据本地随机名猜测。
// subfolder 与 name 共同构成 LoadAudio 接受的相对路径。
// AbortSignal 由队列在 await 返回后检查，取消时绝不继续提交 prompt。
// 同一个 File 在每次提交中生成不同远端名称，避免前后任务互相覆盖。
// File 包装复用原始 Blob 字节，不将 FLAC 或 MP3 转码为未经请求的格式。
// 包装保留 MIME，主进程仍根据文件后缀设置 multipart 的标准类型。
// 唯一名称不含用户名、角色名或提示词，服务端文件列表不会暴露这些字段。
// LoadAudio 消费的是服务端输入相对名，不是浏览器 blob: 地址。
// 服务器增加 subfolder 时必须保留，否则 LoadAudio 可能找不到已上传文件。
// 服务端返回名称而不是本地名称决定最终 prompt，兼容服务端重命名策略。
// 本函数不捕捉并伪造成功结果，上传失败直接交给公共队列终止当前项。
// 上传无法撤回远端文件时，队列仍能在下一步骤前阻止 prompt 提交。
// 远端上传资源的删除不属于停止推理契约，不能通过全局清目录补偿。
export async function uploadReferenceAudio(file: File, server: string) {
  const named = new File([file], `ir_audio_${crypto.randomUUID()}.${audioExtension(file)}`, { type: file.type });
  const uploaded = await uploadImageToComfy(named, server);
  return [uploaded.subfolder, uploaded.name].filter(Boolean).join('/');
}

// MIME 来自主进程的真实 /view 响应；字节以 base64 跨 IPC 传递。
// 只接受音频历史输出，避免误把 MiniMax 视频结果交给 audio 标签播放。
// PreviewAudio 可能写入 temp，主进程已经按其 type/subfolder 下载，无需另调 SaveAudio。
// 空输出明确失败，不能给队列返回一个看似成功的空数组。
// requestId 必须贯穿现有 IPC，统一的停止入口才能找到这次远端任务。
// 页面卸载不会中断此调用；它由公共 FIFO 持有而不是 useEffect 持有。
// 网络与 ComfyUI 节点异常由 unwrapIpc 保留错误码，供队列分类处理。
// 无桌面桥时给出可见错误，不尝试从普通网页绕过安全通道。
// electronAPI 的 comfyGenerate 已由 preload 暴露，渲染层不 import ipcRenderer。
// 传递的 server 是入队时冻结地址，不在请求中重新读取设置 store。
// 传递的 id 是公共队列 UUID，与 task.id 完全相同。
// 不同任务的 id 不能共用，否则主进程会拒绝重复会话。
// 结果筛选同时兼容 audio 和 audios 两种历史字段名。
// 非音频输出被忽略，避免在某节点同时输出图像时把图片当成声音。
// 没有可用音频即使存在其他文件也报告 noOutput，不能进入完成状态。
// base64 解码使用浏览器 atob 和 Uint8Array，不依赖 Node Buffer。
// 传输内容不被解释为 HTML，播放器只能接收构建出的 Blob。
// 解码异常与非法数据同样抛出，不能生成一个永久无法播放的假链接。
// Blob 由调用方在保存后转为 URL，错误路径没有需要释放的 URL。
// 本函数不维护组件状态，离开 Role TTS 面板不会提前结束正在等待的 IPC。
// dataUrl 只有通过主进程成功回包才可到达这里，失败对象不参与媒体映射。
// ComfyUI 输出列表存在但没有 audio 类别时也必须给出可解释的失败。
export async function generateAudio(graph: ComfyApiPrompt, server: string, id: string): Promise<AudioOutput[]> {
  if (!window.electronAPI?.comfyGenerate) throw new Error(t('create.audio.desktopOnly'));
  const result = unwrapIpc(await window.electronAPI.comfyGenerate(graph, server, id));
  const outputs = result.videos.filter(item => /^audios?$/i.test(item.kind));
  if (!outputs.length) throw new Error(t('create.audio.noOutput'));
  return outputs.map(item => {
    const [header, encoded] = item.dataUrl.split(',');
    const mime = /^data:([^;]+);base64$/.exec(header)?.[1] ?? 'audio/wav';
    return { filename: item.filename, dataUrl: item.dataUrl, blob: new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: mime }) };
  });
}

// 保存名称使用英文 UUID，不使用对白、角色名或参考文件名。
// 优先保留历史文件的实际音频后缀，防止 FLAC 字节被保存成 WAV。
// 如果服务端未返回常规后缀，使用响应 MIME 映射；未知格式不能伪报成功。
// 复用已有 basename 清洗和输出目录限制，不另开放任意写文件通道。
// unwrapIpc 抛出的保存失败会被统一队列记为 failed。
// 保存结果数量必须与输出数量一致，部分落盘不能报告全部完成。
// 返回的是实际写入路径，通知和文件管理按钮不能用推测路径。
// 音频从 ComfyUI 临时目录复制到用户输出目录后才算任务完成。
// 写盘接口沿用项目现有 IpcResult 返回值，类型和错误码不另起一套契约。
// 文件命名每项独立取 UUID，批次内多音频不会共用同一路径。
// 路径组装由主进程负责，renderer 只提供文件 basename 与目录选择。
// filename 的扩展名仅从白名单提取，远端文件名不直接作为本地写盘名称。
// 保存实际使用 dataUrl 中的 base64 主体，不能把头部 MIME 一起当作文件内容。
// blob.type 用于后缀兜底，不对生成音频做再次采样或字节变换。
// 用户输出目录可包含中文，本模块不通过重命名用户目录处理编码问题。
// 保存接口返回的路径顺序与 files 顺序一致，播放器逐项关联正确结果。
// 部分成功时文件可能已经存在，错误状态不能承诺回滚已写入的文件。
// 保存错误交给任务中心显示，调用者仍可以检查已生成的 ComfyUI 临时文件。
// 这里不调用图片 Meta 写入器，不能向 WAV/FLAC 附加 PNG tEXt 块。
// 音频不会被注入图片图库索引，避免媒体类型不匹配导致详情解析错误。
export async function saveAudio(outputs: AudioOutput[], outputPath: string): Promise<string[]> {
  if (!window.electronAPI?.saveGeneratedImages) throw new Error(t('create.audio.desktopOnly'));
  const files = outputs.map(item => {
    const extension = AUDIO_EXTENSIONS.exec(item.filename)?.[1].toLowerCase() ?? MIME_EXT[item.blob.type];
    if (!extension) throw new Error(t('create.audio.noOutput'));
    return { filename: `IR_audio_${crypto.randomUUID()}.${extension}`, dataBase64: item.dataUrl.slice(item.dataUrl.indexOf(',') + 1) };
  });
  const saved = unwrapIpc(await window.electronAPI.saveGeneratedImages(outputPath, files));
  if (saved.length !== files.length) throw new Error(t('create.page.saveFailed'));
  return saved;
}
