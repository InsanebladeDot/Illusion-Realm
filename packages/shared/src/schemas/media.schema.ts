import { z } from 'zod';

import { nonEmptyPathSchema } from './common.schema';

const trimSchema = z.object({ start: z.number(), end: z.number() });

/** 每个剪切区间独立的效果；未传字段保持原速、原音量、正放。 */
export const VideoClipEffectsSchema = z.object({
  speed: z.number().finite().min(0.1).max(16).optional(),
  volume: z.number().finite().min(0).max(4).optional(),
  muted: z.boolean().optional(),
  reverse: z.boolean().optional(),
});

const cropSchema = z.object({
  enabled: z.boolean(),
  width: z.number(),
  height: z.number(),
  x: z.number(),
  y: z.number(),
});

const clipInputSchema = z.object({
  inputPath: nonEmptyPathSchema,
  duration: z.number(),
  hasAudio: z.boolean(),
  trim: trimSchema.optional(),
  effects: VideoClipEffectsSchema.optional(),
});

/** VideoEditJob：single（默认）/ concat / gif / frame */
export const VideoEditJobSchema = z.object({
  mode: z.enum(['single', 'concat', 'gif', 'frame', 'reframe']).optional(),
  inputPath: nonEmptyPathSchema.optional(),
  clips: z.array(clipInputSchema).optional(),
  outputPath: nonEmptyPathSchema,
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  sourceDuration: z.number().optional(),
  frameTime: z.number().finite().nonnegative().optional(),
  trim: trimSchema.optional(),
  speed: z.number().optional(),
  effects: VideoClipEffectsSchema.optional(),
  crop: cropSchema.optional(),
  accurateCut: z.boolean().optional(),
  gif: z
    .object({
      fps: z.number().min(1).max(120),
      width: z.number().min(1),
      loop: z.boolean().optional(),
    })
    .optional(),
}).refine((job) => job.mode !== 'frame' || (job.inputPath !== undefined && job.frameTime !== undefined && /\.png$/i.test(job.outputPath)))
  .refine((job) => job.mode !== 'reframe' || (job.inputPath !== undefined &&
    Number.isInteger(job.fps) && Number(job.fps) >= 1 && Number(job.fps) <= 120 && /\.(mp4|mkv)$/i.test(job.outputPath)));

/** video:ffmpegStatus */
export const VideoFfmpegStatusArgsSchema = z.tuple([nonEmptyPathSchema.nullable()]);

/** video:pickOutputFolder */
export const VideoPickOutputFolderArgsSchema = z.tuple([z.string().max(255).optional()]);

/** video:pickOutput */
export const VideoPickOutputArgsSchema = z.tuple([
  z.string().max(255).optional(),
  z.enum(['video', 'gif', 'image']).optional(),
]);

/** video:probe */
export const VideoProbeArgsSchema = z.tuple([
  z.object({
    inputPath: nonEmptyPathSchema,
    manualFfmpegPath: nonEmptyPathSchema.nullable().optional(),
  }),
]);

/** video:run */
export const VideoRunArgsSchema = z.tuple([
  z.object({
    job: VideoEditJobSchema,
    manualFfmpegPath: nonEmptyPathSchema.nullable().optional(),
  }),
]);

/** video:cancel */
export const VideoCancelArgsSchema = z.tuple([z.string().min(1)]);

// 波形读取只接收本地源与请求身份；采样规格由主进程固定，不能注入FFmpeg参数。
// 取消只携带同一请求身份，不必再提交源路径，也不能取消另一个窗口的任务。
// 身份限制为短ASCII，避免把路径或大段用户文本作为任务键长期保存。
// 路径长度和空白约束与主进程手写校验一致；实际文件存在性仍由主进程核对。
// Windows盘符与UNC绝对路径都支持，不接受网页URL或相对路径。
// 两个strict对象都拒绝多余字段，不能把拼错cancel默默当成读取。
// 类型由schema推导；渲染和preload不复制一份请求形状。
// 请求不包含源时长，避免伪造时长导致峰值映射错位或分配无界数组。
// 无音轨返回null与读取失败不同，失败由原IpcResult边界表达。
// 取消是控制消息，不写工程数据，也不表示素材被删除或音轨被分离。
const waveformRequestId = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
export const VideoWaveformRequestSchema = z.union([
  z.object({ requestId: waveformRequestId, inputPath: z.string().min(1).max(4096).refine(value => value.trim().length > 0 && /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(value) && !value.includes("\0")) }).strict(),
  z.object({ requestId: waveformRequestId, cancel: z.literal(true) }).strict(),
]);
export type VideoWaveformRequest = z.infer<typeof VideoWaveformRequestSchema>;

/** view3d:pickModel */
export const View3dPickModelArgsSchema = z.tuple([z.string().max(4096).optional()]);

/** view3d:readModelFile */
export const View3dReadModelFileArgsSchema = z.tuple([nonEmptyPathSchema]);

/** animadex:search */
export const AnimadexSearchArgsSchema = z.tuple([
  z.object({
    // 来源必须显式枚举，不接受模型指定 URL 或本机文件。
    // 缺省保留在线 API 兼容行为，调用端自行选择 local。
    // 以下分类与主进程手写校验保持相同长度上限。
    source: z.enum(['local', 'online']).optional(),
    // 分类可以为空以便清除；未知分类合法但搜索无结果。
    // 不把未知分类强行纠正成相近颜色，避免静默改变意图。
    // 四个属性共同筛选，结果中保留资料的原始文本。
    gender: z.string().max(200).optional(),
    // 发色与瞳色分开声明，不接受对象形式的自由提示词。
    // 长度限制避免异常模型输出扩大 IPC 载荷。
    // 主进程在访问数据前验证字符串，而非强制 String 转型。
    hair: z.string().max(200).optional(),
    // eye 只表示瞳色，不按名称或作品推断未知值。
    // 本地没有该值时返回零匹配；不会转向在线搜索补猜。
    // 显式 online 配合这些筛选时由主进程拒绝不支持的组合。
    eye: z.string().max(200).optional(),
    // 姓名长度同主进程校验一致，避免边界两侧接受范围不同。
    // strict 拒绝拼错字段，防止意外丢掉过滤后扩大候选范围。
    // 正整数分页仍沿旧契约，实际结果最多返回六十项。
    // 本地库无最新时间，UI 改用已有 az；保留 recent 供在线使用。
    q: z.string().max(200).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    copyright: z.string().max(200).optional(),
    sort: z.enum(['recent', 'az']).optional(),
  }).strict(),
]);
