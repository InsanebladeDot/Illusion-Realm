// 迁移只转换拍摄数据，不带回旧引擎、旧人偶或旧动画求值器。
// 像把旧通告单重新分成演员页和机位页：身份与时间不能因为换纸张而改变。
// 先完整校验旧单，再生成新副本；任何一步失败都不会就地修改用户原文档。
import {
  LegacyDirectorSceneSchema,
  type LegacyDirectorObject,
  type LegacyDirectorScene,
} from "@illusion-realm/shared/schemas/director-v1-input.schema";
import { DirectorDocumentSchema } from "@illusion-realm/shared/schemas/director.schema";
import type { DirectorDocument, DirectorObject, Vec3 } from "@illusion-realm/shared/types/director";

// 老版 IK 保存的是人物身上的局部点，新骨架需要舞台世界坐标。
// 类似把演员手里的尺子读数换成舞台地面坐标，必须先缩放、再旋转、最后平移。
// 旋转次序与 Three.js 的 Euler XYZ 一致，不能把三个角当成依次平移。
export function localToWorld(point: Vec3, object: LegacyDirectorObject): Vec3 {
  const scaled = { x: point.x * object.scale.x, y: point.y * object.scale.y, z: point.z * object.scale.z };
  const rotated = rotateXYZ(scaled, rotationRadians(object.rotation));
  return { x: rotated.x + object.position.x, y: rotated.y + object.position.y, z: rotated.z + object.position.z };
}
// Euler XYZ 对应 Rz 先作用于点，再 Ry、Rx；这里只换旧场景的局部目标。
// 所有中间值保留浮点精度，不用界面的两位小数截断用户姿势位置。
// 不引入 Three.js 运行时，迁移本身不会加载第二套模型或骨架。
function rotateXYZ(point: Vec3, angles: Vec3): Vec3 {
  const sx = Math.sin(angles.x), cx = Math.cos(angles.x);
  const sy = Math.sin(angles.y), cy = Math.cos(angles.y);
  const sz = Math.sin(angles.z), cz = Math.cos(angles.z);
  const zRotated = { x: cz * point.x - sz * point.y, y: sz * point.x + cz * point.y, z: point.z };
  const yRotated = { x: cy * zRotated.x + sy * point.z, y: zRotated.y, z: -sy * zRotated.x + cy * point.z };
  return { x: yRotated.x, y: cx * yRotated.y - sx * yRotated.z, z: sx * yRotated.y + cx * yRotated.z };
}
// 角度只在迁移计算时换成弧度，持久化中的旋转单位仍保持度。
function rotationRadians(rotation: Vec3): Vec3 {
  const factor = Math.PI / 180;
  return {
    x: rotation.x * factor,
    y: rotation.y * factor,
    z: rotation.z * factor,
  };
}
function migrateObject(object: LegacyDirectorObject): DirectorObject {
  const { kind, ik, ...fields } = structuredClone(object);
  const names: Record<string, string> = {
    l_hand: "l_wrist",
    r_hand: "r_wrist",
    l_foot: "l_ankle",
    r_foot: "r_ankle",
  };
  return {
    ...fields,
    category: kind,
    ...(kind === "camera" ? { cameraRotation: fields.rotation } : {}),
    ik: Object.fromEntries(
      Object.entries(ik)
        .filter((entry): entry is [string, Vec3] => !!entry[1])
        .map(([name, point]) => [names[name], localToWorld(point, object)]),
    ),
  };
}
function migrateAnimation(
  animation: LegacyDirectorScene["animations"][number],
  scene: LegacyDirectorScene,
): DirectorDocument["cameraAnimations"][number] {
  return {
    ...structuredClone(animation),
    schemaVersion: 2,
    playRange: null,
    defaultInterp: "spline",
    tracks: animation.tracks.map((track) => migrateTrack(track, scene)),
  };
}
// 旧版每轨只有一串关键帧，新版放到独立通道的一个片段中。
// ID 和帧号原样保留，边界从原关键帧得出，不为通过碰撞校验挪动时间。
function migrateTrack(
  track: LegacyDirectorScene["animations"][number]["tracks"][number],
  scene: LegacyDirectorScene,
): DirectorDocument["cameraAnimations"][number]["tracks"][number] {
  const object = scene.objects.find((object) => object.id === track.targetId)!;
  const keys = structuredClone(track.keyframes);
  return {
    id: track.id,
    targetId: track.targetId,
    targetType: object.kind,
    collapsed: false,
    muted: track.muted,
    locked: track.locked,
    channels: [
      {
        id: `${track.id}-channel`,
        kind: object.kind === "camera" ? "camera" : "transform",
        clips: legacyClips(track.id, keys),
      },
    ],
  };
}
function legacyClips(
  id: string,
  keys: LegacyDirectorScene["animations"][number]["tracks"][number]["keyframes"],
) {
  return keys.length
    ? [
        {
          id: `${id}-clip`,
          startFrame: Math.min(...keys.map((key) => key.frame)),
          endFrame: Math.max(...keys.map((key) => key.frame)),
          keyframes: keys,
        },
      ]
    : [];
}
function migrateLegacyScene(input: unknown): DirectorDocument {
  if (
    !input ||
    typeof input !== "object" ||
    !("version" in input) ||
    input.version !== 1
  )
    return DirectorDocumentSchema.parse(input);
  const old = LegacyDirectorSceneSchema.parse(input);
  const objects = old.objects.map(migrateObject);
  const {
    objects: _objects,
    animations: _animations,
    version: _version,
    ...settings
  } = old;
  return DirectorDocumentSchema.parse({
    ...settings,
    version: 2,
    panoramaUrl: "",
    characters: objects.filter((object) => object.category === "character"),
    cameras: objects.filter((object) => object.category === "camera"),
    props: objects.filter((object) => object.category === "prop"),
    cameraAnimations: old.animations.map((animation) =>
      migrateAnimation(animation, old),
    ),
  });
}

// 原组件的锁定目标也是世界坐标，但字段名属于肢体而不是手腕骨骼。
// v2 重写版只保存了世界点，因此只换包装，不再做一次坐标变换。
// v1 先经过上面的局部到世界变换，不能把局部点误认成世界点。
// 原生快照已经有 targets 时不改任何数值；未知字段随副本保留。
// 这里只是打开时的数据搬运，不保留旧引擎、模型或动画求值器。
// 保存成功前原画布仍保有旧场景，迁移失败不会清空作品。
export function migrateScene(input: unknown): DirectorDocument {
  const scene = migrateLegacyScene(input);
  const names: Record<string, string> = { l_wrist: "l_arm", r_wrist: "r_arm", l_ankle: "l_leg", r_ankle: "r_leg" };
  for (const character of scene.characters) {
    const ik = character.ik;
    if (!ik || ik.targets) continue;
    character.ik = { targets: Object.fromEntries(Object.entries(ik)
      .filter((entry): entry is [string, Vec3] => !!entry[1] && entry[0] in names)
      .map(([name, point]) => [names[name], { enabled: true, point }])) };
  }
  scene.version = 3;
  return DirectorDocumentSchema.parse(scene);
}
