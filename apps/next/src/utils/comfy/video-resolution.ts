/**
 * MiniMax H3 的尺寸约束：选择器和提交节点使用相同的 32 像素对齐。
 * VAE 的空间压缩为 16，后续还要拆成 2×2 的 latent patch。
 * 因此 400 像素这样的输入不能仅按图片生成的 8 像素规则放行。
 * 本模块只处理生成尺寸；参考图片仍由官方节点在编码前调整。
 */
import type { ComfyApiPrompt } from "@/types/comfy";
import { findImageSizePresetBySize } from "@/data/imageSizes";
// 只复用预设和缩放计算，不再从图片模块导入视频的上下界。
// 图片开放大尺寸后，H3 仍需保留已有范围与 32 像素对齐。
// 两个适配层因此共用结构，但不会互相改变合法输入集合。
import { clampSizeScale, createSizeSelection, type ImageSizeInput, type ImageSizeSelection } from "@/utils/imageSize";
import { t } from "@/i18n";
import { findMinimaxVideoNode } from "./minimax-video-node";

// 保留当前创作表单的最小尺寸，避免视频控件突然允许过小的画面。
// 上限必须向下取整：把 1500 四舍五入会得到超出表单上限的 1504。
// 1472 是当前表单范围内最大的合法 H3 边长，不代表模型的绝对上限。
// 不使用固定分辨率白名单，横竖比例仍允许用户自由搭配。
export const VIDEO_SIZE_STEP = 32;
// 视频历史范围保持 64–1500，避免图片放开后误放行有问题的 H3 参数。
// INPUT_MAX 用于兼容旧草稿中的 1500，界面上限则向下对齐为 1472。
// 不将它导回图片模块，避免重新引入双向耦合。
const VIDEO_INPUT_MAX = 1500;
// 最小 64 是保留的视频兼容范围，不跟随图片的新最小对齐单元变化。
// 1472 是界面最大值，提交兼容范围与界面范围分别命名避免混淆。
export const VIDEO_SIZE_MIN = 64;
export const VIDEO_SIZE_MAX = Math.floor(VIDEO_INPUT_MAX / VIDEO_SIZE_STEP) * VIDEO_SIZE_STEP;
export type VideoResolutionSettings = ImageSizeSelection;

/**
 * 把单条边取到最近的 32 倍数；恰好位于中点时向上取整。
 * 先后均受合法上下界约束，最大值不会再次取整到越界的 1504。
 * 非有限输入回落最小值，避免空输入或异常草稿把 NaN 写进受控组件。
 * 这里返回实际像素数，不修改用户选择的宽高比标签。
 */
export function clampVideoSide(value: number) {
  if (!Number.isFinite(value)) return VIDEO_SIZE_MIN;
  return Math.min(VIDEO_SIZE_MAX, Math.max(VIDEO_SIZE_MIN, Math.round(value / VIDEO_SIZE_STEP) * VIDEO_SIZE_STEP));
}

/**
 * 保留图片选择器的返回契约，但用 H3 规则计算最终宽高。
 * 自定义原始边长先对齐，保证后续反复缩放不会累计舍入误差。
 * 预设仍从原始分桶尺寸开始，不能拿上次对齐后的结果继续缩放。
 * 缩放直接作用于基准尺寸，避免先对齐 8 再对齐 32 的双重舍入。
 * 例如 1344×0.2 应取 256；先按 8 取成 272 再按 32 取会误得 288。
 * scale 保存用户选定的倍率；像素对齐可能轻微改变实际宽高比。
 * UI 展示和 onChange 返回的 width/height 都取最终值。
 * 图片生成继续使用 createSizeSelection，不受此视频规则影响。
 */
export function createVideoSizeSelection(input: ImageSizeInput): VideoResolutionSettings {
  const base = createSizeSelection({ ...input, scale: 1,
    customWidth: clampVideoSide(input.customWidth), customHeight: clampVideoSide(input.customHeight) });
  // 图片开放放大倍率，视频仍保留 0.1–1.0 的已有合法范围。
  // 像两种不同尺寸的画框，共用调节旋钮不代表允许相同的放大范围。
  // 这里显式传上限，不能仅靠滑条阻止旧草稿或其他调用者越界。
  const scale = clampSizeScale(input.scale, 1);
  return { ...base, scale, width: clampVideoSide(base.width * scale), height: clampVideoSide(base.height * scale) };
}

/**
 * 默认宽高读取真实工作流节点，不用 UI 预设覆盖模板自带尺寸。
 * 模板恰好匹配预设时保留比例选中状态，否则按自定义显示。
 * 旧模板即便保存了未对齐值，也先按当前规则呈现合法像素。
 * 缺节点或非数值模板属于配置错误，不能静默生成另一种画面尺寸。
 */
export function getVideoResolutionDefaults(prompt: ComfyApiPrompt): VideoResolutionSettings {
  const video = findMinimaxVideoNode(prompt);
  if (!video) throw new Error(t("create.videoModels.missingNode", { name: "MiniMaxH3ImageToVideo" }));
  const { width, height } = video.inputs;
  if (typeof width !== "number" || typeof height !== "number") throw new Error(t("create.videoSettings.invalid"));
  const preset = findImageSizePresetBySize(width, height);
  return createVideoSizeSelection({ mode: preset ? "preset" : "custom", aspectRatio: preset?.id ?? "1:1", customWidth: width, customHeight: height, scale: 1 });
}

/**
 * 提交层独立兜底，不能假设每个调用者都经过当前版本的选择器。
 * 旧草稿中的 400 或 1500 仍可提交，但会变成 416 或 1472。
 * 非整数和超出原表单范围的值继续拒绝，避免把损坏数据当正常尺寸。
 * 校验完成后才写节点，失败时原工作流保持不变。
 * 只替换 width/height；时长、采样设置与首尾帧连接不受影响。
 * 此处消费已计算的最终像素，不再乘 scale，避免缩放执行两次。
 * width/height 是跨模块使用的最终像素契约，不能在这里按比例标签重算。
 * 用户可能传入自定义矩形，所以宽度和高度必须分别验证及对齐。
 * Number.isInteger 同时拒绝 NaN 和 Infinity，不把异常值夹成有效请求。
 * 历史范围仍接受到 1500，是为了兼容此前已经保存的最终尺寸。
 * 当前选择器的输入上限则为 1472，新增草稿不会再保存这段尾部范围。
 * 对旧草稿的规范化只影响本次 prompt，不会重写用户落盘设置。
 * 未操作尺寸控件的 H3 任务也规范化模板，避免旧模板绕过新约束。
 * 不传尺寸的其他视频工作流直接返回，保持原有的模板默认行为。
 */
export function applyVideoResolution(prompt: ComfyApiPrompt, settings?: VideoResolutionSettings) {
  const video = findMinimaxVideoNode(prompt);
  if (!video && !settings) return;
  if (!video) throw new Error(t("create.videoModels.missingNode", { name: "MiniMaxH3ImageToVideo" }));
  const dimensions = settings ?? getVideoResolutionDefaults(prompt);
  const valid = [dimensions.width, dimensions.height].every((value) =>
    // 提交仍核对视频自己的范围，不受图片宽高策略调整影响。
    // 旧草稿允许到 1500，再由 clampVideoSide 对齐为 1472。
    // 非整数和非有限值继续拒绝，不把错误参数送进 latent reshape。
    Number.isInteger(value) && value >= VIDEO_SIZE_MIN && value <= VIDEO_INPUT_MAX);
  if (!valid) throw new Error(t("create.videoSettings.invalidResolution", { min: VIDEO_SIZE_MIN, max: VIDEO_SIZE_MAX, step: VIDEO_SIZE_STEP }));
  Object.assign(video.inputs, { width: clampVideoSide(dimensions.width), height: clampVideoSide(dimensions.height) });
}
