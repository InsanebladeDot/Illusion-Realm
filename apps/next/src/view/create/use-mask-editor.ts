"use client";

// 蒙版业务状态：图片生命周期、原尺寸导出和现有 ComfyUI 上传；画布组件只负责展示。
import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import type { ReactSketchCanvasRef } from "react-sketch-canvas";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { uploadImageToComfy } from "@/api/comfyui";
import { exportMaskImages, loadMaskImage, type MaskExports, type MaskSource } from "@/utils/mask-image";

function useMaskSource(reset: () => void, setError: (message: string) => void) {
  const { t } = useTranslation(), version = useRef(0);
  const [source, setSource] = useState<MaskSource | null>(null);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => () => { version.current++; }, []);
  const importImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const current = ++version.current, url = URL.createObjectURL(file);
    setError("");
    try {
      const image = await loadMaskImage(url);
      if (image.naturalWidth * image.naturalHeight > 16777216 || Math.max(image.naturalWidth, image.naturalHeight) > 8192) throw new Error(t("create.maskEditor.tooLarge"));
      if (current !== version.current) { URL.revokeObjectURL(url); return; }
      reset(); setSource({ url, name: file.name, width: image.naturalWidth, height: image.naturalHeight });
    } catch (reason) { URL.revokeObjectURL(url); if (current === version.current) setError(reason instanceof Error ? reason.message : t("create.maskEditor.loadFailed")); }
  };
  return { source, importImage };
}

async function uploadMask(image: Blob, server: string): Promise<string> {
  const response = await uploadImageToComfy(new File([image], `mask_${Date.now()}.png`, { type: "image/png" }), server);
  const name = [response.subfolder, response.name].filter(Boolean).join("/");
  return JSON.stringify({ maskInput: { class_type: "LoadImage", inputs: { image: name } }, IMAGE: ["maskInput", 0], MASK: ["maskInput", 1] }, null, 2);
}

function useMaskExport(source: MaskSource | null, sketch: RefObject<ReactSketchCanvasRef | null>, setError: (message: string) => void) {
  const { t } = useTranslation(), server = useSettingsStore((state) => state.comfyServerUrl);
  const [exports, setExports] = useState<MaskExports | null>(null), [busy, setBusy] = useState(false);
  const [uploadJson, setUploadJson] = useState("");
  const changed = () => { setExports(null); setUploadJson(""); };
  const generate = async (upload: boolean) => {
    if (!source || !sketch.current || busy) return;
    setBusy(true); setError(""); setUploadJson("");
    try {
      const overlay = await sketch.current.exportImage("png", { width: source.width, height: source.height });
      const result = await exportMaskImages(source, overlay); setExports(result);
      if (upload) setUploadJson(await uploadMask(result.image, server));
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("create.maskEditor.exportFailed")); }
    finally { setBusy(false); }
  };
  return { exports, busy, uploadJson, changed, generate };
}

export function useMaskEditor() {
  const sketch = useRef<ReactSketchCanvasRef>(null);
  const [color, setColor] = useState("#38bdf8"), [brush, setBrush] = useState(40), [erasing, setErasing] = useState(false);
  const [error, setError] = useState("");
  // 图片导入只调用最新的重置动作，异步读取不绑定旧一轮画布。
  const reset = useRef(() => {});
  const source = useMaskSource(() => reset.current(), setError);
  const exporter = useMaskExport(source.source, sketch, setError);
  useEffect(() => { reset.current = () => { exporter.changed(); setErasing(false); }; }, [exporter]);
  const setErase = (value: boolean) => { setErasing(value); sketch.current?.eraseMode(value); };
  return { ...source, ...exporter, sketch, color, setColor, brush, setBrush, erasing, setErase, error };
}

export type MaskEditorState = ReturnType<typeof useMaskEditor>;
