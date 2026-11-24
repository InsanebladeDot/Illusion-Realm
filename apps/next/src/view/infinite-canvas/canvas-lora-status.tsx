"use client";

/** 只核对 ComfyUI 可见的默认扩展名；不会下载权重，也不把清单命中当作推理成功。 */
import { useEffect, useState } from "react";
import { fetchComfyModelLists } from "@/api/comfyui";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranslation } from "@/i18n";
import { defaultLoraIssues } from "./canvas-lora-validation";

export function CanvasLoraStatus({ names, inherited }: { names: string[]; inherited: boolean }) {
  const { t } = useTranslation();
  const server = useSettingsStore(state => state.comfyServerUrl);
  const namesKey = JSON.stringify(names), key = JSON.stringify([server, namesKey]);
  const [result, setResult] = useState<{ key: string; issues: string[] } | null>(null);
  useEffect(() => {
    const expected: string[] = JSON.parse(namesKey);
    if (!inherited || !expected.length) return;
    let active = true;
    // 像查仓库目录：缺货和同名多份分开说明，不能悄悄删掉订单上的默认扩展。
    void fetchComfyModelLists(server).then(lists => {
      if (active) setResult({ key, issues: defaultLoraIssues(expected, lists.loras) });
    }).catch(() => {
      if (active) setResult({ key, issues: [t("canvas.defaultLoraListFailed")] });
    });
    return () => { active = false; };
    // key 包含所有模型名和服务地址，切节点或服务后旧回包不能覆盖新结果。
  }, [key, namesKey, server, inherited, t]);
  if (!inherited || !names.length) return null;
  const current = result?.key === key ? result.issues : null;
  return <div data-canvas-default-loras className="px-3 py-2 text-xs text-muted-foreground">
    <p role="status">{t(current === null ? "canvas.defaultLoraChecking" : "canvas.defaultLoraInherited")}</p>
    {current?.map(issue => <p role="alert" key={issue}>{issue}</p>)}
  </div>;
}
