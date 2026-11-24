/** 独立整理的幻域接入边界；非完整原 SDK/解析器。未知遗留字段应查样例和证据。 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export type TargetType = "camera" | "character" | "prop";
export type Posture = Record<string, Record<string, number>>;
export interface SceneObject {
  id: string;
  label: string;
  position: Vec3;
  rotation?: Vec3 | number;
  scale?: Vec3;
  visible?: boolean;
  locked?: boolean;
}
export interface Character extends SceneObject {
  bodyType: string;
  color?: string;
  posture?: Posture | null;
}
export interface Camera extends SceneObject {
  lookAt: Vec3;
  /** __none__:不锁定；空串/缺省:手动；人物ID:跟踪 */
  lookAtTarget?: string;
  fov: number;
}
export interface Prop extends SceneObject {
  assetId: string;
  color?: string;
  imageUrl?: string;
}
export interface SceneGroup {
  id: string;
  label: string;
  memberIds: string[];
}
export interface Keyframe {
  id: string;
  frame: number;
  interp: "linear" | "spline" | "hold";
  easing?: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  lookAt?: Vec3;
  fov?: number;
  roll?: number;
  posture?: Posture | null;
  bezier?: { x1: number; y1: number; x2: number; y2: number };
  speedCurve?: Array<{ x: number; v: number }>;
  handleType?: string;
  tangentIn?: Vec3 | null;
  tangentOut?: Vec3 | null;
}
export interface AnimationClip {
  id: string;
  startFrame: number;
  endFrame: number;
  keyframes: Keyframe[];
}
export interface AnimationChannel {
  id: string;
  kind: "camera" | "transform" | "posture";
  clips: AnimationClip[];
}
export interface AnimationTrack {
  id: string;
  targetId: string | null;
  targetType: TargetType;
  collapsed: boolean;
  muted: boolean;
  locked: boolean;
  channels: AnimationChannel[];
  aim?: {
    mode: "keyframes" | "target" | "tangent";
    target: { objectId: string | null; point: Vec3 };
  };
}
export interface AnimationDocument {
  schemaVersion: 2;
  id: string;
  label: string;
  fps: number;
  durationFrames: number;
  playMode: "once" | "loop" | "pingpong";
  playRange: { startFrame: number; endFrame: number } | null;
  playbackSpeed: number;
  defaultInterp: "spline" | "linear";
  tracks: AnimationTrack[];
}
export interface Composition {
  characters: Character[];
  cameras: Camera[];
  props: Prop[];
  groups: SceneGroup[];
  cameraAnimations: AnimationDocument[];
  activeCamera: string | null;
  panoramaUrl: string;
  skyColor: string;
  groundOpacity: number;
  groundHeight: number;
}
export interface DirectorSnapshot extends Composition {
  aspectRatio: number;
  showLabels: boolean;
  labelFontSize: number;
  showBaseMarker: boolean;
  editorCameraPose?: { position: Vec3; target: Vec3; [extra: string]: unknown };
  previewImageUrl?: string | null;
}
/** 模板输入与保存快照不同；这是独立建议类型，不代替原弱校验的行为说明。 */
export interface TemplateInput {
  id?: string;
  label?: string;
  characters: Array<{
    role?: string;
    offset: { x: number; y?: number; z: number };
    rotation?: number;
    pose?: string;
    mirrorPose?: boolean;
    bodyType?: string;
    color?: string;
  }>;
  cameras: Array<{
    label?: string;
    position: Vec3;
    lookAt: Vec3;
    fov?: number;
  }>;
  props?: Array<{
    assetId: string;
    position: Vec3;
    rotation?: number;
    scale?: number;
    color?: string;
  }>;
}
export interface ConnectedMedia {
  url: string;
  label?: string;
  nodeId?: string;
  type?: "image" | "video";
}
/** 幻域建议适配接口：实现时对接已有 store、媒体和持久化服务。 */
export interface DirectorHost {
  save(snapshot: DirectorSnapshot): void | Promise<void>;
  confirm(snapshot: DirectorSnapshot): void | Promise<void>;
  cancel(): void;
  exportVideo?(blob: Blob): void | Promise<void>;
}

// 保存对象只带纯数据；渲染树、几何和选中状态不能进入工程。
// 原组件快照保留扩展字段；这里只说明宿主确实要读取的部分。
// 三维对象、贴图和函数不能跨工程边界；运行时另做纯 JSON 限额检查。
export interface DirectorObject extends SceneObject {
  [extra: string]: unknown;
  category?: string;
  color?: string;
  bodyType?: string;
  posture?: Posture | null;
  poseId?: string;
  assetId?: string;
  imageUrl?: string;
  fov?: number;
  roll?: number;
  lookAt?: Vec3;
  lookAtTarget?: string;
  cameraRotation?: Vec3;
  ik?: { targets?: Record<string, { enabled: boolean; point: Vec3 | null }>; l_wrist?: Vec3; r_wrist?: Vec3; l_ankle?: Vec3; r_ankle?: Vec3 };
}
export interface DirectorDocument extends Omit<
  DirectorSnapshot,
  "characters" | "cameras" | "props"
> {
  version?: 2 | 3;
  characters: DirectorObject[];
  cameras: DirectorObject[];
  props: DirectorObject[];
  previewPath?: string;
  [extra: string]: unknown;
}
