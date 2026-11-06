"use client";

// Canny 业务状态：校验本地原图，防止旧上传覆盖新上传，检测计算交给独立 Worker。
import { useEffect, useRef, useState } from "react";
import type { RangeInterval } from "@/components/range-interval-slider";
import { useTranslation } from "@/i18n";
import { loadMaskImage, type MaskSource } from "@/utils/mask-image";
import { CANNY_MAX_PIXELS, CANNY_MAX_SIDE } from "@/utils/canny-types";
import { useEdgeEditorStore } from "@/stores/use-edge-editor-store";
import { useCannyConversion } from "./use-canny-conversion";

export interface CannySource extends MaskSource { file: File }

function useCannySource() {
  const { t } = useTranslation(), revision = useRef(0);
  // 源图由进程内草稿持有，路由卸载不销毁素材。
  // 替换 URL 时才释放旧资源，避免返回页面时引用失效。
  // 只有成功解码才写入，坏文件保留上一张可用图片。
  // 清除源图也释放 URL，空草稿不会保留已删除素材的预览引用。
  // 当前 hook 卸载只终止尚未接管的读取，不释放已经保存在 store 的素材。
  // File 与 URL 成对替换，预览和实际 Worker 输入不能对应两张图。
  const source = useEdgeEditorStore(state => state.source);
  const setSource = (next: CannySource | null) => { const old = useEdgeEditorStore.getState().source; if (old) URL.revokeObjectURL(old.url); useEdgeEditorStore.getState().patch({ source: next }); };
  const [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => () => { revision.current++; }, []);
  const select = async (file: File) => {
    const current = ++revision.current;
    setError(""); setLoading(false);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError(t("create.canny.invalidImage")); return; }
    const url = URL.createObjectURL(file); setLoading(true);
    try {
      const image = await loadMaskImage(url);
      if (current !== revision.current) { URL.revokeObjectURL(url); return; }
      if (image.naturalWidth * image.naturalHeight > CANNY_MAX_PIXELS || Math.max(image.naturalWidth, image.naturalHeight) > CANNY_MAX_SIDE) throw new Error(t("create.canny.tooLarge"));
      setSource({ file, url, name: file.name, width: image.naturalWidth, height: image.naturalHeight });
    } catch (reason) {
      URL.revokeObjectURL(url);
      if (current === revision.current) setError(reason instanceof Error ? reason.message : t("create.canny.loadFailed"));
    } finally { if (current === revision.current) setLoading(false); }
  };
  const remove = () => { revision.current++; setSource(null); setError(""); setLoading(false); };
  return { source, error, loading, select, remove };
}

export function useCannyPreview() {
  // 草稿恢复后转换按当前源图和参数重新启动，不复用旧 Worker 结果。
  // 默认反转在 store 初始化，用户关闭后的选择也跨路由保留。
  // setter 保持原组件接口，阈值滑块和反转按钮无需复制。
  // 暂停检测保留源图、阈值和反转设置，重新启用以同一输入重新计算。
  // 结果属于转换 hook 的生命周期，不将临时输出 URL 永久保存在草稿。
  // 参数只在用户事件中写 store，不在 effect 中来回同步两份状态。
  // RangeInterval 保持既有类型，不能允许上下阈值跨越产生无意义检测。
  // 初始 inverted=true 在领域 store 定义，页面每次重挂不会覆盖用户选择。
  const { enabled, inverted, thresholds, patch } = useEdgeEditorStore();
  const setEnabled = (value: boolean) => patch({ enabled: value }), setInverted = (value: boolean) => patch({ inverted: value });
  const setThresholds = (value: RangeInterval) => patch({ thresholds: value });
  const media = useCannySource();
  const conversion = useCannyConversion(media.source, enabled, { ...thresholds, inverted });
  return { ...media, ...conversion, error: media.error || conversion.processingError, enabled, setEnabled, inverted, setInverted, thresholds, setThresholds };
}

export type CannyPreviewState = ReturnType<typeof useCannyPreview>;
