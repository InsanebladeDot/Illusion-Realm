// 导演台工程采用交付包的轨道、通道、片段与关键帧结构。
// 像拍摄通告单一样先核对每页的形状，再核对人物和机位的名字是否真的存在。
// 旧格式仅作为输入保留，打开后由迁移器转换；保存始终写新格式。
import { z } from "zod";
import { isDirectorJson } from "../data/director-json";
import { LegacyDirectorSceneSchema } from "./director-v1-input.schema";


const Id = z.string().min(1).max(200);
const Text = z.string().max(200);
const Scalar = z.number().finite().min(-10000).max(10000);
const Frame = z.number().int().min(0).max(180000);
// 向量允许原组件追加字段，但 XYZ 仍必须有限且在既有工程范围内。
// 不自动夹取非法坐标，否则用户以为保存了原位置，重开却已经被移动。
export const DirectorVecSchema = z.object({ x: Scalar, y: Scalar, z: Scalar }).passthrough();
const Scale = z.object({
  x: z.number().min(0.001).max(100),
  y: z.number().min(0.001).max(100),
  z: z.number().min(0.001).max(100),
}).passthrough();
const Color = z.string().regex(/^#[0-9a-f]{6}$/i);
const Posture = z.record(
  z.string().max(40),
  z.record(z.string().max(40), Scalar),
);
const Url = z.string().max(32767);
// 本地图片刚选中时仍是预览正文，写入工程前由宿主换成真实路径。
// 两种形态各设上限，不能为了预览方便把任意长字符串放开。
const ImageUrl = z.union([
  Url,
  z
    .string()
    .max(16000000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
]);
// 人物、机位、道具共用基础字段；具体身份取决于所在数组，不由 category 决定。
// 原道具把 category 用作资产分类，强制它等于 prop 会拒绝合法的原组件快照。
// posture 为 null 也是原组件有效状态，不能误判成缺少一份必须补齐的姿势表。
// passthrough 保留供应版本的扩展参数，前置纯 JSON 检查负责其安全与总量边界。
// 这里不注入旧模型默认参数；省略的字段交由原组件按自己的模板解释。
export const DirectorObjectSchema = z.object({
  id: Id,
  label: Text,
  category: Text.optional(),
  position: DirectorVecSchema,
  rotation: z.union([DirectorVecSchema, Scalar]).optional(),
  scale: Scale.optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  color: Color.optional(),
  bodyType: Text.optional(),
  posture: Posture.nullable().optional(),
  poseId: Text.optional(),
  assetId: Text.optional(),
  imageUrl: ImageUrl.optional(),
  fov: z.number().min(10).max(120).optional(),
  roll: Scalar.optional(),
  lookAt: DirectorVecSchema.optional(),
  lookAtTarget: Text.optional(),
  cameraRotation: DirectorVecSchema.optional(),
  // targets 保存世界坐标下的手脚目标，point 为 null 表示未指定目标。
  // enabled 是肢体目标开关，与人物的编辑锁定、机位的跟踪锁定分别独立。
  // 平坦手腕/脚踝字段仅用于读取旧格式，迁移器会在副本上转换成 targets。
  ik: z
    .object({
      targets: z.record(z.string().max(100), z.object({ enabled: z.boolean(), point: DirectorVecSchema.nullable() }).passthrough()).optional(),
      l_wrist: DirectorVecSchema.optional(),
      r_wrist: DirectorVecSchema.optional(),
      l_ankle: DirectorVecSchema.optional(),
      r_ankle: DirectorVecSchema.optional(),
    }).passthrough()
    .optional(),
}).passthrough();
// 帧号是动画时间轴上的整数，不是视频秒数，也不能从对象在数组中的序号推算。
// 曲线、切线与姿态字段只做数据校验，实际插值继续使用供应动画模块。
// 保留未知关键帧字段，避免导入后再保存丢掉新版原组件的曲线设置。
const Key = z.object({
  id: Id,
  frame: Frame,
  interp: z.enum(["linear", "spline", "hold"]),
  easing: Text.optional(),
  position: DirectorVecSchema.optional(),
  rotation: DirectorVecSchema.optional(),
  scale: Scale.optional(),
  lookAt: DirectorVecSchema.optional(),
  fov: z.number().min(10).max(120).optional(),
  roll: Scalar.optional(),
  posture: Posture.nullable().optional(),
  bezier: z
    .object({
      x1: z.number().min(0).max(1),
      y1: Scalar,
      x2: z.number().min(0).max(1),
      y2: Scalar,
    }).passthrough()
    .optional(),
  speedCurve: z
    .array(
      z.object({ x: z.number().min(0).max(1), v: z.number().min(0).max(100) }).passthrough(),
    )
    .max(1000)
    .optional(),
  handleType: Text.optional(),
  tangentIn: DirectorVecSchema.nullable().optional(),
  tangentOut: DirectorVecSchema.nullable().optional(),
}).passthrough();
// 形状检查不能表达所有时间关系：起止顺序和关键帧范围在 validClips 中统一核对。
// 允许只有一帧的记录片段，因此 startFrame 等于 endFrame 不直接拒绝。
const Clip = z.object({
  id: Id,
  startFrame: Frame,
  endFrame: Frame,
  keyframes: z.array(Key).max(2000),
}).passthrough();
const Channel = z.object({
  id: Id,
  kind: z.enum(["camera", "transform", "posture"]),
  clips: z.array(Clip).max(500),
}).passthrough();
// 暂未绑定对象的空轨道可以存在；绑定以后目标身份与类型必须同时正确。
// muted 与 locked 只描述播放/编辑状态，不使其中的坏引用免于校验。
const Track = z.object({
  id: Id,
  targetId: Id.nullable(),
  targetType: z.enum(["character", "camera", "prop"]),
  collapsed: z.boolean(),
  muted: z.boolean(),
  locked: z.boolean(),
  channels: z.array(Channel).max(3),
  aim: z
    .object({
      mode: z.enum(["keyframes", "target", "tangent"]),
      target: z.object({ objectId: Id.nullable(), point: DirectorVecSchema }).passthrough(),
    }).passthrough()
    .optional(),
}).passthrough();
// 此处 schemaVersion 是原动画结构版本，不等于外层宿主工程的 version。
// 宿主把工程标成 version 3 后，不能顺手把动画结构也改成版本 3。
// 动画时长、帧率、速度保留原值，不能靠缩短动画来迁就范围校验。
export const DirectorAnimationSchema = z.object({
  schemaVersion: z.literal(2),
  id: Id,
  label: Text,
  fps: z.number().int().min(1).max(120),
  durationFrames: z.number().int().min(1).max(180000),
  playMode: z.enum(["once", "loop", "pingpong"]),
  playRange: z.object({ startFrame: Frame, endFrame: Frame }).passthrough().nullable(),
  playbackSpeed: z.number().min(0.1).max(10),
  defaultInterp: z.enum(["spline", "linear"]),
  tracks: z.array(Track).max(500),
}).passthrough();
// 原组件发来的快照可能没有宿主版本号，保存适配器最终写入 version 3。
// previewPath 是宿主图片引用；previewImageUrl 是本次确认或退出附带的临时正文。
// 原组件只负责场景，不能要求它知道幻域内部的媒体路径或节点身份。
const Snapshot = z.object({
  version: z.union([z.literal(2), z.literal(3)]).optional(),
  characters: z.array(DirectorObjectSchema).max(500),
  cameras: z.array(DirectorObjectSchema).max(500),
  props: z.array(DirectorObjectSchema).max(500),
  groups: z
    .array(z.object({ id: Id, label: Text, memberIds: z.array(Id).max(500) }).passthrough())
    .max(100),
  cameraAnimations: z.array(DirectorAnimationSchema).max(20),
  activeCamera: Id.nullable(),
  panoramaUrl: ImageUrl,
  skyColor: Color,
  groundOpacity: z.number().min(0).max(1),
  groundHeight: Scalar,
  aspectRatio: z.number().min(0.1).max(10),
  showLabels: z.boolean(),
  labelFontSize: z.number().int().min(8).max(60),
  showBaseMarker: z.boolean(),
  editorCameraPose: z
    .object({
      position: DirectorVecSchema,
      target: DirectorVecSchema,
      fov: z.number().min(10).max(120).optional(),
    }).passthrough()
    .optional(),
  previewPath: Url.optional(),
  previewImageUrl: z.string().max(16000000).nullable().optional(),
}).passthrough();

// 编号检查同时覆盖嵌套片段，避免两个菱形共用 ID 而一起被修改。
// 相邻片段可以共用边界帧，真正重叠的区间则拒绝保存。
export function validDirectorReferences(scene: z.infer<typeof Snapshot>): boolean {
  const objects = [...scene.characters, ...scene.props, ...scene.cameras];
  const ids = new Set(objects.map(item => item.id));
  const members = scene.groups.flatMap(group => group.memberIds);
  const kinds = new Map([
    ...scene.characters.map(item => [item.id, "character"] as const),
    ...scene.cameras.map(item => [item.id, "camera"] as const),
    ...scene.props.map(item => [item.id, "prop"] as const),
  ]);
  // 三类对象共享身份空间，跨数组重号也会使跟踪与动画找错目标。
  // 单数组限额之外再查总数，防止三类分别达到上限而绕过场景预算。
  if (ids.size !== objects.length || objects.length > 500) return false;
  if (!unique(scene.groups) || new Set(members).size !== members.length) return false;
  if (members.some(id => !ids.has(id))) return false;
  if (scene.activeCamera !== null && kinds.get(scene.activeCamera) !== "camera") return false;
  if (objects.some(item => item.lookAtTarget && item.lookAtTarget !== "__none__" && !ids.has(item.lookAtTarget))) return false;
  return unique(scene.cameraAnimations) && scene.cameraAnimations.every(animation => validAnimation(animation, kinds));
}
function unique(items: { id: string }[]) {
  return new Set(items.map((item) => item.id)).size === items.length;
}
// 身份来自所在数组而不是 category，原道具的 category 表示资产分类。
// 相机跟踪与动画目标分别检查，不能因为某个 ID 存在就把人物当成机位。
// 一个动画中同一对象只归一条轨道；静音和锁定不会删除轨道数据。
function validAnimation(animation: z.infer<typeof DirectorAnimationSchema>, kinds: Map<string, string>): boolean {
  const range = animation.playRange;
  if (range && (range.startFrame >= range.endFrame || range.endFrame > animation.durationFrames)) return false;
  if (!unique(animation.tracks)) return false;
  const targets = animation.tracks.map(track => track.targetId).filter(id => id !== null);
  if (new Set(targets).size !== targets.length) return false;
  return animation.tracks.every(track => validTrack(track, kinds, animation.durationFrames));
}
// 通道种类与目标 ID 各自保持唯一，缺失目标不靠默认对象悄悄补上。
// clips 的时间合法性由同一方法检查，模板、自动保存和手动确认共享此约束。
function validTrack(track: z.infer<typeof Track>, kinds: Map<string, string>, duration: number): boolean {
  if (track.targetId && kinds.get(track.targetId) !== track.targetType) return false;
  if (track.aim?.target.objectId && !kinds.has(track.aim.target.objectId)) return false;
  if (!unique(track.channels) || new Set(track.channels.map(channel => channel.kind)).size !== track.channels.length) return false;
  return track.channels.every(channel => validClips(channel.clips, duration));
}
// 先排序副本再比较邻居，输入数组顺序不应决定是否允许保存。
// 像把预约按开始时间排好：相邻预约可以接在一起，前一段结束不能晚于后一段开始。
// 排序不改原数组，原组件保存的展示顺序与撤销记录不会被校验器改变。
// 同片段的关键帧既要编号唯一，也要帧号唯一，防止同一时刻出现两个互相覆盖的值。
// 这里只判断当前通道，其他通道或其他对象在同一时间运动属于正常动画。
function validClips(clips: z.infer<typeof Clip>[], duration: number): boolean {
  if (!unique(clips)) return false;
  const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
  return sorted.every(
    (clip, index) =>
      clip.endFrame >= clip.startFrame &&
      clip.endFrame <= duration &&
      (index === 0 || sorted[index - 1].endFrame <= clip.startFrame) &&
      unique(clip.keyframes) &&
      new Set(clip.keyframes.map((key) => key.frame)).size ===
        clip.keyframes.length &&
      clip.keyframes.every(
        (key) => key.frame >= clip.startFrame && key.frame <= clip.endFrame,
      ),
  );
}
// 先查原始树再解析字段，不能先 strip 掉危险键后误判输入安全。
// 类似入库先看整箱货，再核对清单；未知字段也受到同一大小和深度限制。
const JsonInput = z.unknown().refine(isDirectorJson, "director-invalid-json");
export const DirectorDocumentSchema = JsonInput.pipe(Snapshot.superRefine((scene, context) => {
  if (!validDirectorReferences(scene)) context.addIssue({ code: "custom", message: "director-invalid-reference" });
}));
export const DirectorSceneSchema = z.union([
  DirectorDocumentSchema,
  LegacyDirectorSceneSchema,
]);
export type DirectorScene = z.infer<typeof DirectorSceneSchema>;
export type DirectorVec = z.infer<typeof DirectorVecSchema>;
export type DirectorObject = z.infer<typeof DirectorObjectSchema>;
export type DirectorAnimation = z.infer<typeof DirectorAnimationSchema>;
export type DirectorKeyframe = z.infer<typeof Key>;
