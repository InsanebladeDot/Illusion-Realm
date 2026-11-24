// 导演台场景是画布节点的一部分，不是第二份用户文档。
// 坐标以米为单位，右手坐标系中 Y 向上；旋转以角度保存，到渲染器才转弧度。
// 数据像舞台调度表：演员、机位和动画写在纸上，WebGL 对象、选择框和播放钟不写进去。
// 所有数值在入口拒绝非有限值，避免一次错误输入让整台相机消失。
import { z } from "zod";

const Id = z.string().min(1).max(200);
const Scalar = z.number().finite().min(-10000).max(10000);
export const LegacyDirectorVecSchema = z.object({ x: Scalar, y: Scalar, z: Scalar });
const Scale = z.object({ x: z.number().min(.01).max(50), y: z.number().min(.01).max(50), z: z.number().min(.01).max(50) });
const Color = z.string().regex(/^#[0-9a-f]{6}$/i);
const Posture = z.record(z.string().max(40), z.record(z.string().max(40), z.number().finite().min(-180).max(180)));
const Ik = z.object({ l_hand: LegacyDirectorVecSchema.optional(), r_hand: LegacyDirectorVecSchema.optional(), l_foot: LegacyDirectorVecSchema.optional(), r_foot: LegacyDirectorVecSchema.optional() });

// 所有可编辑对象采用同一身份和变换字段，锁定与机位跟踪绝不共用一个布尔值。
// visible 只控制显示，locked 只控制编辑；隐藏对象仍保留位置和动画。
// 姿势是关节角，不是第三方模型文件，因此工程可离线恢复。
// IK 目标在人物自己的局部坐标中，移动整个人时不会把手留在世界原点。
export const LegacyDirectorObjectSchema = z.object({
  id: Id, label: z.string().min(1).max(80), kind: z.enum(["character", "prop", "camera"]),
  position: LegacyDirectorVecSchema, rotation: LegacyDirectorVecSchema, scale: Scale,
  visible: z.boolean(), locked: z.boolean(), color: Color,
  assetId: z.string().max(80), bodyType: z.string().max(40), posture: Posture,
  ik: Ik, lookAt: LegacyDirectorVecSchema, lookAtTarget: z.string().max(200),
  fov: z.number().finite().min(10).max(120),
});
const Key = z.object({
  id: Id, frame: z.number().int().min(0).max(180000),
  interp: z.enum(["linear", "spline"]), easing: z.enum(["linear", "easeInOut", "easeIn", "easeOut"]),
  position: LegacyDirectorVecSchema, rotation: LegacyDirectorVecSchema, scale: Scale,
  lookAt: LegacyDirectorVecSchema, fov: z.number().finite().min(10).max(120), posture: Posture,
  bezier: z.object({ x1: z.number().min(0).max(1), y1: z.number().min(0).max(1), x2: z.number().min(0).max(1), y2: z.number().min(0).max(1) }),
});
// 关键帧只记录能插值的属性，不记录名称、锁定或图层身份。
// 一个对象有一条轨道，关键帧按整数帧编号，编辑和播放共用相同时间坐标。
// 静音轨道保留数据却不参与求值；轨道锁定禁止关键帧增删改。
// 预览求值产生临时副本，不把每个播放帧塞进历史或自动保存。
const Track = z.object({ id: Id, targetId: Id, muted: z.boolean(), locked: z.boolean(), keyframes: z.array(Key).max(2000) });
export const LegacyDirectorAnimationSchema = z.object({
  id: Id, label: z.string().min(1).max(80), fps: z.number().int().min(1).max(120),
  durationFrames: z.number().int().min(1).max(180000),
  playMode: z.enum(["once", "loop", "pingpong"]), playbackSpeed: z.number().min(.25).max(2),
  tracks: z.array(Track).max(200),
});
export const LegacyDirectorSceneSchema = z.object({
  version: z.literal(1), objects: z.array(LegacyDirectorObjectSchema).max(500),
  groups: z.array(z.object({ id: Id, label: z.string().min(1).max(80), memberIds: z.array(Id).max(500) })).max(100),
  activeCamera: Id.nullable(), aspectRatio: z.number().finite().min(.3).max(3),
  skyColor: Color, groundOpacity: z.number().finite().min(0).max(1), groundHeight: Scalar,
  showLabels: z.boolean(), labelFontSize: z.number().int().min(8).max(40), showBaseMarker: z.boolean(),
  editorCameraPose: z.object({ position: LegacyDirectorVecSchema, target: LegacyDirectorVecSchema, fov: z.number().finite().min(10).max(120) }),
  animations: z.array(LegacyDirectorAnimationSchema).max(20),
  previewPath: z.string().max(32767).optional(),
}).superRefine((scene, context) => {
  const ids = new Set(scene.objects.map(object => object.id));
  const groups = new Set(scene.groups.map(group => group.id));
  const invalid = ids.size !== scene.objects.length || groups.size !== scene.groups.length;
  const members = scene.groups.flatMap(group => group.memberIds);
  const missing = members.some(id => !ids.has(id)) || new Set(members).size !== members.length;
  const camera = scene.activeCamera === null || scene.objects.some(object => object.id === scene.activeCamera && object.kind === "camera");
  const targets = scene.objects.every(object => !object.lookAtTarget || object.lookAtTarget === "__none__" || ids.has(object.lookAtTarget));
  const animations = new Set(scene.animations.map(animation => animation.id)).size === scene.animations.length;
  const tracks = scene.animations.every(animation => validTracks(animation, ids));
  if (invalid || missing || !camera || !targets || !tracks || !animations) context.addIssue({ code: "custom", message: "director-invalid-reference" });
});

// 相同身份不能被后来的轨道悄悄盖掉；每个对象在一段动画中只允许一条归属轨道。
// 帧号和关键帧身份都唯一，否则拖动一个菱形可能同时改变另一枚菱形。
function validTracks(animation: z.infer<typeof LegacyDirectorAnimationSchema>, ids: Set<string>) {
  if (new Set(animation.tracks.map(track => track.id)).size !== animation.tracks.length) return false;
  if (new Set(animation.tracks.map(track => track.targetId)).size !== animation.tracks.length) return false;
  return animation.tracks.every(track => ids.has(track.targetId)
    && new Set(track.keyframes.map(key => key.id)).size === track.keyframes.length
    && new Set(track.keyframes.map(key => key.frame)).size === track.keyframes.length
    && track.keyframes.every(key => key.frame <= animation.durationFrames));
}

export type LegacyDirectorVec = z.infer<typeof LegacyDirectorVecSchema>;
export type LegacyDirectorObject = z.infer<typeof LegacyDirectorObjectSchema>;
export type LegacyDirectorScene = z.infer<typeof LegacyDirectorSceneSchema>;
export type LegacyDirectorAnimation = z.infer<typeof LegacyDirectorAnimationSchema>;
export type LegacyDirectorKeyframe = z.infer<typeof Key>;
