"use client";

/** 权重摘要与待确认的双槽选择分开，取消时不写回节点。 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AudioLines } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { ResourceSelectionCard } from "@/view/create/resource-selection-card";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { getResourceDialogTypography } from "@/utils/resourceDialogFontSize";
import { GPT_SOVITS_NAME } from "@/utils/comfy/gpt-sovits-workflow";
import { unwrapIpc } from "@/utils/ipcResult";
import { PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { useTranslation } from "@/i18n";
import type { GptSovitsWeights } from "@illusion-realm/shared";

interface WeightPair { gpt: string; sovits: string }
interface Props { value: WeightPair; onConfirm: (value: WeightPair) => void }
const basename = (name: string) => name.split(/[\\/]/).at(-1);

export function CanvasGptSovitsWeightSelect({ value, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return <>
    {/* 参数侧栏：确定后保留一行模型名和两行权重，点摘要重新选择。 */}
    <button ref={trigger} type="button" data-gsv-weight-summary aria-haspopup="dialog" aria-label={t("canvas.gptSovits.chooseWeights")} onClick={() => setOpen(true)} className="flex w-full min-w-0 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:outline-1 focus-visible:outline-muted-foreground active:bg-muted/70">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted" aria-hidden><AudioLines size={20} /></span>
      <span className="min-w-0 text-sm"><span className="block font-medium">{GPT_SOVITS_NAME}</span>
        {[value.gpt, value.sovits].map(weight => <span key={weight} title={weight} className="block truncate text-xs text-muted-foreground">{basename(weight)}</span>)}
      </span>
    </button>
    {open && <WeightDialog value={value} onClose={close} onConfirm={pair => { onConfirm(pair); close(); }} />}
  </>;
}

function useWeightCatalog() {
  const server = useSettingsStore(state => state.comfyServerUrl) || "127.0.0.1:8188";
  const [result, setResult] = useState<{ server: string; weights: GptSovitsWeights | null }>();
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const weights = unwrapIpc(await window.electronAPI!.comfyGptSovitsWeights(server));
        if (active) setResult({ server, weights });
      } catch { if (active) setResult({ server, weights: null }); }
    }
    void load();
    // 像换到另一家仓库，旧服务器迟到的库存单不能覆盖眼前的选项。
    return () => { active = false; };
  }, [server]);
  return result?.server === server ? result.weights : undefined;
}

function WeightDialog({ value, onConfirm, onClose }: Props & { onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [slot, setSlot] = useState<keyof WeightPair>("gpt");
  const sizes = useCreateFormStore(state => state.resourceDialogFontSize);
  const weights = useWeightCatalog();
  const labels = { gpt: t("canvas.gptSovits.gptWeight"), sovits: t("canvas.gptSovits.sovitsWeight") };
  // 公共弹窗挂载后把焦点交给第一个权重分组，后续更新列表不抢焦点。
  const firstSlotRef = useCallback((element: HTMLButtonElement | null) => { element?.focus(); }, []);
  const ready = weights?.gpt.includes(draft.gpt) && weights.sovits.includes(draft.sovits);
  return <ResourceDialogShell open tone="neutral" title={t("canvas.gptSovits.chooseWeights")} titleId={id} onOpenChange={next => { if (!next) onClose(); }}
    toolbar={<div className="flex flex-wrap gap-2 py-2" role="group" aria-label={t("canvas.gptSovits.chooseWeights")}>
      {(["gpt", "sovits"] as const).map(key => <button key={key} type="button" data-gsv-slot={key} ref={key === "gpt" ? firstSlotRef : undefined} aria-pressed={slot === key} onClick={() => setSlot(key)} className="rounded-lg border border-border px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted aria-pressed:bg-muted"><span className="block font-medium">{labels[key]}</span><span className="block max-w-48 truncate text-xs text-muted-foreground" title={draft[key]}>{basename(draft[key])}</span></button>)}
    </div>}
    footer={<button type="button" data-gsv-confirm disabled={!ready} onClick={() => onConfirm(draft)} className={`ml-auto rounded-lg px-4 py-2 text-sm disabled:opacity-40 ${PRIMARY_BUTTON_CLASS}`}>{t("common.confirm")}</button>}>
    {!weights?.[slot].length && <p role="status" className="py-6 text-center text-sm text-muted-foreground">{weights === undefined ? t("common.loading") : weights === null ? t("canvas.gptSovits.weightsUnavailable") : t("canvas.gptSovits.weightsEmpty")}</p>}
    {/* 模型选择页：沿用图片模型卡片，权重完整相对路径作为选项身份。 */}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {weights?.[slot].map(name => {
        const pick = () => setDraft(current => ({ ...current, [slot]: name }));
        return <ResourceSelectionCard key={name} optionId={name} name={basename(name) ?? name} cover="" tag={labels[slot]} typography={getResourceDialogTypography(sizes)} selected={draft[slot] === name} meta={<span title={name}>{name}</span>} onPick={pick}>
          <button type="button" aria-pressed={draft[slot] === name} onClick={event => { event.stopPropagation(); pick(); }} className="h-8 w-full rounded-lg border border-border px-2 text-xs transition-colors hover:bg-muted aria-pressed:bg-muted">{draft[slot] === name ? t("create.extensionSelectDialog.selected") : t("canvas.gptSovits.selectWeight")}</button>
        </ResourceSelectionCard>;
      })}
    </div>
  </ResourceDialogShell>;
}
