/**
 * 3D 视角角色模型加载（three.js）
 *
 * - 支持 .glb / .gltf（GLTFLoader），用户通过拖拽或文件选择替换内置程序化模特
 * - 加载后统一**归一化**：按包围盒缩放到目标身高、水平居中、脚底贴地（y=0），
 *   这样不论模型原始单位是米还是厘米，景别（半径）映射都保持正确
 * - 朝向修正：模型通常朝 -Z，而本场景约定 +Z 为「正面」，用角度修正对齐
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { t } from "@/i18n";
import { unwrapIpc } from "@/utils/ipcResult";

/** 角色目标身高（场景尺度基准：约 1.8 单位） */
export const CHARACTER_TARGET_HEIGHT = 1.8;

export type LoadedCharacter = {
  object: THREE.Object3D;
  /** 归一化后的实际高度（用于界面展示与验证） */
  height: number;
  /** 三角面数量（用于提示性能） */
  triangles: number;
};

export type ModelFileSource = {
  fileName: string;
  data: ArrayBuffer;
  /** 来自磁盘时的绝对路径（用于持久化） */
  path?: string | null;
};

const SUPPORTED_EXTENSIONS = [".glb", ".gltf"];

export function isSupportedModelFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 通过 IPC 读取本地模型文件为 ArrayBuffer */
export async function readModelFileFromDisk(
  filePath: string
): Promise<{ fileName: string; data: ArrayBuffer }> {
  const api = typeof window === "undefined" ? undefined : window.electronAPI;
  if (!api?.view3dReadModelFile) {
    throw new Error(t("view3d.model.readUnavailable"));
  }
  const result = unwrapIpc(await api.view3dReadModelFile(filePath));
  if (!result?.data) {
    throw new Error(t("view3d.model.readFileFailed", { filePath }));
  }
  const bytes = result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
  // 复制到独立的 ArrayBuffer，避免共享底层缓冲
  return { fileName: result.fileName, data: bytes.slice().buffer };
}

async function parseModel(data: ArrayBuffer, fileName: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const isGltfJson =
    fileName.toLowerCase().endsWith(".gltf") && looksLikeJson(data);

  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    if (isGltfJson) {
      const text = new TextDecoder().decode(new Uint8Array(data));
      loader.parse(text, "", (result) => resolve(result as { scene: THREE.Group }), reject);
      return;
    }
    loader.parse(data, "", (result) => resolve(result as { scene: THREE.Group }), reject);
  });

  return gltf.scene;
}

function looksLikeJson(data: ArrayBuffer): boolean {
  const head = new Uint8Array(data, 0, Math.min(4, data.byteLength));
  return head[0] === 0x7b || head[0] === 0xef; // '{' 或 BOM
}

/**
 * 归一化：缩放到目标身高、水平居中、脚底贴地，并按 facingOffset 旋转朝向。
 * 返回归一化后的高度与三角面数量。
 */
export function normalizeCharacter(
  object: THREE.Object3D,
  facingOffset = 0
): LoadedCharacter {
  object.updateWorldMatrix(true, true);

  // 朝向修正（先转朝向再测量，包围盒以旋转后的结果为准）
  object.rotation.y = THREE.MathUtils.degToRad(facingOffset);
  object.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const rawHeight = size.y > 1e-6 ? size.y : 1;
  const scale = CHARACTER_TARGET_HEIGHT / rawHeight;
  object.scale.multiplyScalar(scale);
  object.updateWorldMatrix(true, true);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

  // 水平居中 + 脚底贴地
  object.position.x -= scaledCenter.x;
  object.position.z -= scaledCenter.z;
  object.position.y -= scaledBox.min.y;
  object.updateWorldMatrix(true, true);

  const finalBox = new THREE.Box3().setFromObject(object);
  let triangles = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) return;
    if (geometry.index) triangles += geometry.index.count / 3;
    else if (geometry.attributes?.position) {
      triangles += geometry.attributes.position.count / 3;
    }
  });

  return {
    object,
    height: finalBox.getSize(new THREE.Vector3()).y,
    triangles: Math.round(triangles),
  };
}

/** 加载并归一化一个模型文件 */
export async function loadCharacterModel(
  source: ModelFileSource,
  facingOffset = 0
): Promise<LoadedCharacter> {
  const raw = await parseModel(source.data, source.fileName);
  const character = normalizeCharacter(raw, facingOffset);
  character.object.name = "character-model";
  return character;
}
