"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  RADIUS_MAX,
  SERIES_DEFAULT_RADIUS,
  type ViewSeries,
} from "@/utils/view3d/promptMapping";
import { loadCharacterModel } from "@/utils/view3d/modelLoader";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";

export type View3DSceneProps = {
  series: ViewSeries;
  /** 相机球坐标变化（每帧节流后回调） */
  onViewChange: (view: { azimuth: number; elevation: number; radius: number }) => void;
  /** 外部要求把相机放到指定角度（快捷视角 / 距离滑块） */
  request?: { azimuth: number; elevation: number; radius?: number; nonce: number } | null;
  /** 用户替换的角色模型（为空则使用内置程序化模特） */
  characterSource?: { fileName: string; data: ArrayBuffer } | null;
  /** 朝向修正角度 */
  facingOffset?: number;
  /** 模型加载结果回调（名称 / 归一化高度 / 面数 / 错误） */
  onModelInfo?: (info: {
    fileName: string;
    height: number;
    triangles: number;
    error?: string;
  }) => void;
  /** 布局标识（如全屏模式）：变化时强制重新测量画布尺寸 */
  layoutKey?: string;
  className?: string;
};

/**
 * 同步 WebGL 画布：**CSS 尺寸交给布局、绘制缓冲按当前 dpr**。
 *
 * 这里必须成对出现（`style` 由调用方设成铺满宿主）：
 * `setSize(w, h, false)` 的第三个参数是 `updateStyle` —— 传 `false` 时 Three.js
 * **只改绘制缓冲**（`canvas.width = w × dpr`），不写 `style.width/height`。
 * 于是 canvas 的 CSS 尺寸会退化成「属性像素」= `容器 × dpr`：
 * Windows 显示缩放 100% 时 dpr=1 恰好相等（所以本地一直看不见），
 * 125% / 150% 时它比容器大一圈 —— 画布是**不透明**的，会直接盖住右侧控制栏
 * （2026-09-26 在 2K @150% 上实测：canvas 932×747 / 容器 769×616）。
 * 回归网：`SMOKE_DPR=1.25 npx electron scripts/smoke-view3d.js`。
 */
function syncCanvasSize(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number
): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
}

/**
 * 3D 视角场景：原点人物（图元拼装的模特）+ 半透明线框轨道球 + 坐标轴 + 地面网格，
 * 使用 OrbitControls 支持左键环绕、滚轮缩放与触屏操作。
 * 每帧由 THREE.Spherical 反算方位角 / 俯仰角 / 半径并回传。
 */
export function View3DScene({
  series,
  onViewChange,
  request,
  characterSource = null,
  facingOffset = 0,
  onModelInfo,
  layoutKey,
  className,
}: View3DSceneProps) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const characterRef = useRef<THREE.Object3D | null>(null);
  const builtinMannequinRef = useRef<THREE.Object3D | null>(null);
  /**
   * WebGL 可用性在 useState 惰性初始化阶段探测一次（首帧即可知），
   * 避免在 effect 内 setState 标记失败（react-hooks/set-state-in-effect）。
   * 探测失败一律回退为 true（不标记失败），与原先 try/catch 的保守语义一致。
   */
  const [webglFailed] = useState(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      const context =
        canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!context) return true;
      // 立即释放探测用的上下文，避免占用 WebGL 上下文配额
      context.getExtension("WEBGL_lose_context")?.loseContext();
      return false;
    } catch {
      return false;
    }
  });
  const onViewChangeRef = useRef(onViewChange);

  // 同步最新的回调（放在 effect 里，避免渲染期写 ref）
  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  // 初始化场景（只做一次）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = host.clientWidth || 640;
    const height = host.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0f);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200);
    camera.position.set(0, 0, SERIES_DEFAULT_RADIUS.anima);

    const renderer = (() => {
      try {
        return new THREE.WebGLRenderer({ antialias: true, alpha: false });
      } catch {
        return null;
      }
    })();

    if (!renderer) {
      // 极少数环境没有可用的 WebGL：保留面板功能，仅提示无法预览。
      // 此时 webglFailed 由上面的惰性初始化负责标记（探测走同一个 API）。
      return;
    }
    syncCanvasSize(renderer, width, height);
    /**
     * CSS 尺寸必须由**布局**给（铺满宿主）：否则 canvas 会按属性像素渲染，
     * 在 dpr ≠ 1 时撑破容器盖住右栏 —— 见 `syncCanvasSize` 的注释。
     */
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 光照
    scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);

    // 地面网格 + 坐标轴
    const grid = new THREE.GridHelper(24, 24, 0x4b5563, 0x1f2937);
    scene.add(grid);
    const axes = new THREE.AxesHelper(3);
    axes.position.y = 0.001;
    scene.add(axes);

    // 半透明线框轨道球（半径随系列 R 变化）
    const orbitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(SERIES_DEFAULT_RADIUS.anima, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      })
    );
    orbitSphere.name = "orbit-sphere";
    scene.add(orbitSphere);

    // 原点人物：图元拼装的模特（无需外部模型资源）
    const mannequin = new THREE.Group();
    mannequin.name = "mannequin";
    const skin = new THREE.MeshStandardMaterial({
      color: 0xe5e7eb,
      roughness: 0.6,
      metalness: 0.05,
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 8, 16), skin);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), skin);
    head.position.y = 1.78;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 8, 16), skin);
    legs.position.y = 0.5;
    const arms = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.62, 6, 12),
      skin
    );
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 1.32;
    // 朝向标记：胸前一个小块，方便分辨正/背面
    const facing = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.4 })
    );
    facing.position.set(0, 1.25, 0.3);
    mannequin.add(torso, head, legs, arms, facing);
    scene.add(mannequin);
    builtinMannequinRef.current = mannequin;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 12;
    // 允许一直转到正下方（-90°，垂直仰视），留极小余量避免万向锁
    controls.maxPolarAngle = Math.PI * 0.9995;
    controls.update();
    controlsRef.current = controls;
    cameraRef.current = camera;

    // 每帧反算球坐标（仅在生成的提示词变化时回调，避免无意义重渲染）
    const spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();
    let frameId = 0;
    let lastSignature = "";

    const renderFrame = () => {
      frameId = window.requestAnimationFrame(renderFrame);
      controls.update();

      offset.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(offset);

      const azimuth = ((THREE.MathUtils.radToDeg(spherical.theta) % 360) + 360) % 360;
      // Spherical.phi 是与 +Y 轴的夹角：0° 在正上方 → 俯仰角 = 90 - phi
      const elevation = 90 - THREE.MathUtils.radToDeg(spherical.phi);
      const radius = spherical.radius;
      const signature = `${azimuth.toFixed(1)}|${elevation.toFixed(1)}|${radius.toFixed(2)}`;

      if (signature !== lastSignature) {
        lastSignature = signature;
        onViewChangeRef.current({ azimuth, elevation, radius });
      }

      renderer.render(scene, camera);
    };
    renderFrame();

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = host.clientWidth || width;
      const nextHeight = host.clientHeight || height;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      // 也重算像素比：窗口被拖到另一块缩放不同的显示器上时 dpr 会变
      syncCanvasSize(renderer, nextWidth, nextHeight);
    });
    resizeObserver.observe(host);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
      host.removeChild(renderer.domElement);
      controlsRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // 系列切换：轨道球半径与默认距离跟随 R 值
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const defaultRadius = SERIES_DEFAULT_RADIUS[series];
    controls.maxDistance = Math.max(RADIUS_MAX, defaultRadius);

    const orbitSphere = sceneRef.current?.getObjectByName("orbit-sphere") as
      | THREE.Mesh
      | undefined;
    if (orbitSphere) {
      orbitSphere.geometry.dispose();
      orbitSphere.geometry = new THREE.SphereGeometry(defaultRadius, 24, 16);
    }
  }, [series]);

  // 外部请求（快捷视角 / 距离滑块）
  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera || !request) return;

    const radius = request.radius ?? camera.position.distanceTo(controls.target);
    const polar = THREE.MathUtils.degToRad(90 - request.elevation);
    const theta = THREE.MathUtils.degToRad(request.azimuth);
    const spherical = new THREE.Spherical(radius, polar, theta);
    const offset = new THREE.Vector3().setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }, [request]);

  /**
   * 角色模型：提供了 glb/gltf 就加载并归一化后替换内置模特；
   * 未提供（或加载失败）时继续用程序化模特，保证场景始终可看。
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;

    const showBuiltin = () => {
      if (builtinMannequinRef.current) builtinMannequinRef.current.visible = true;
      if (characterRef.current) {
        scene.remove(characterRef.current);
        characterRef.current = null;
      }
    };

    if (!characterSource) {
      showBuiltin();
      onModelInfo?.({ fileName: t("view3d.model.builtin"), height: 1.98, triangles: 0 });
      return;
    }

    void (async () => {
      try {
        const character = await loadCharacterModel(characterSource, facingOffset);
        if (cancelled) return;

        if (builtinMannequinRef.current) builtinMannequinRef.current.visible = false;
        if (characterRef.current) scene.remove(characterRef.current);
        characterRef.current = character.object;
        scene.add(character.object);

        onModelInfo?.({
          fileName: characterSource.fileName,
          height: character.height,
          triangles: character.triangles,
        });
      } catch (error) {
        if (cancelled) return;
        showBuiltin();
        onModelInfo?.({
          fileName: characterSource.fileName,
          height: 0,
          triangles: 0,
          error: error instanceof Error ? error.message : t("view3d.model.loadFailed"),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterSource, facingOffset, onModelInfo, t]);

  /**
   * 布局切换（例如 3D 区域进入 / 退出全屏）后强制重新测量一次画布：
   * ResizeObserver 偶尔会与动画同帧竞态，这里再补一帧确保画面不被拉伸。
   */
  useEffect(() => {
    const host = hostRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!host || !camera || !renderer) return;

    const frame = window.requestAnimationFrame(() => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      syncCanvasSize(renderer, width, height);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [layoutKey]);

  return (
    <div className={cn("relative", className)}>
      <div ref={hostRef} className="h-full w-full" data-view3d-canvas />
      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60 px-4 text-center text-xs text-muted-foreground">
          {t("view3d.model.webglFailed")}
        </div>
      )}
    </div>
  );
}
