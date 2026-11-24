"use client";

import { useEffect, useId, useState } from "react";
import type { LocalModelBatchResult, LocalModelCategoryTarget } from "@illusion-realm/shared";
import { ModelCategorySchema } from "@illusion-realm/shared";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { getLocalModelCategoryTarget, modelCategoryError, operateLocalModels } from "@/utils/model-categories";
import { openPathInExplorer } from "@/utils/electronBridge";
import { useToastStore } from "@/stores/useToastStore";
import { ModelCategoryPicker } from "./model-category-picker";

interface BatchModel { filePath: string; name: string }
interface BatchProps {
  action: "move" | "delete"; models: BatchModel[];
  onClose: () => void; onFinished: (result: LocalModelBatchResult) => Promise<void>;
}
function useBatchTargets(models: BatchModel[]) {
  const [targets, setTargets] = useState<LocalModelCategoryTarget[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all(models.map((model) => getLocalModelCategoryTarget(model.filePath)))
      .then((value) => { if (active) setTargets(value); })
      .catch((reason: unknown) => { if (active) setError(modelCategoryError(reason)); });
    return () => { active = false; };
  }, [models]);
  return { targets, error };
}
function useBatchOperation(props: BatchProps, root: string, category: string) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LocalModelBatchResult | null>(null);
  const [error, setError] = useState("");
  async function run() {
    if (busy || result) return;
    setBusy(true); setError("");
    try {
      const common = { folderPaths: props.models.map((model) => model.filePath), acknowledged: true as const };
      const value = await operateLocalModels(props.action === "move" ? { ...common, action: "move", targetRootPath: root, category } : { ...common, action: "delete" });
      setResult(value);
      const failed = value.items.filter((item) => !item.success).length;
      useToastStore.getState().show(t("toolBox.civitai.batch.result", { success: value.items.length - failed, failed }), failed ? "error" : "success");
      await props.onFinished(value).catch(() => useToastStore.getState().show(t("toolBox.civitai.batch.refreshFailed"), "error"));
      if (!failed) props.onClose();
    } catch (reason) { setError(modelCategoryError(reason)); }
    finally { setBusy(false); }
  }
  return { busy, result, error, run };
}
function BatchDestinations({ models, targets, category }: { models: BatchModel[]; targets: LocalModelCategoryTarget[]; category: string }) {
  const { t } = useTranslation();
  return <ul className="max-h-56 space-y-2 overflow-auto rounded-lg border border-border p-3">{models.map((model, index) => <li key={model.filePath} className="space-y-1 text-xs">
    <p className="font-medium">{model.name}</p><p className="break-all text-[10px] text-muted-foreground">{model.filePath}</p>
    {targets[index] && <p className="break-all text-[10px] text-muted-foreground">{t("toolBox.civitai.categoryMove.destination")}：{targets[index].categoryRootPath}/{category.trim() || "Uncategorized"}/{model.filePath.split(/[/\\]/).pop()}</p>}
  </li>)}</ul>;
}
function BatchExplorer({ models, root }: { models: BatchModel[]; root: string }) {
  const { t } = useTranslation();
  async function open(folder: string) {
    if (!await openPathInExplorer(folder)) useToastStore.getState().show(t("toolBox.civitai.categoryMove.openFailed"), "error");
  }
  return <div className="flex flex-wrap gap-2">{models.map((model) => <button key={model.filePath} type="button" onClick={() => { void open(model.filePath); }} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.categoryMove.openSource")} · {model.name}</button>)}{root && <button type="button" onClick={() => { void open(root); }} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">{t("toolBox.civitai.categoryMove.openTarget")}</button>}</div>;
}
function useBatchDialog(props: BatchProps) {
  const id = useId();
  const { targets, error: targetError } = useBatchTargets(props.models);
  const [chosenRoot, setChosenRoot] = useState("");
  const [category, setCategory] = useState("Uncategorized");
  const [custom, setCustom] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const root = chosenRoot || targets[0]?.rootPath || "";
  const mixed = targets.some((target) => target.rootPath !== targets[0]?.rootPath);
  const crossRoot = targets.some((target) => target.rootPath !== root);
  const valid = ModelCategorySchema.safeParse(category).success;
  return { id, targets, targetError, root, setChosenRoot, category, setCategory, custom, setCustom, acknowledged, setAcknowledged, mixed, crossRoot, valid };
}
export function LocalModelBatchDialog(props: BatchProps) {
  return props.action === "delete"
    ? <LocalModelDeleteDialog {...props} />
    : <LocalModelMoveDialog {...props} />;
}

function LocalModelDeleteDialog(props: BatchProps) {
  const { t } = useTranslation();
  const { targets, error: targetError } = useBatchTargets(props.models);
  const [acknowledged, setAcknowledged] = useState(false);
  const operation = useBatchOperation(props, "", "");
  const overLimit = props.models.length > 200;
  const ready = !overLimit && !targetError && targets.length === props.models.length;
  const error = targetError || operation.error;
  return (
    <ConfirmActionDialog
      title={t("toolBox.civitai.batch.deleteTitle")}
      description={t("toolBox.civitai.batch.deleteHint")}
      cancelLabel={t("common.cancel")}
      closeLabel={t("common.close")}
      confirmLabel={t(operation.busy ? "toolBox.civitai.batch.working" : "toolBox.civitai.batch.confirmDelete")}
      confirmButtonId="local-model-delete-confirm"
      confirmDisabled={!ready || !acknowledged || !!operation.result}
      busy={operation.busy}
      onCancel={props.onClose}
      onConfirm={() => { void operation.run(); }}
    >
      {/* 删除确认卡片：名单按需展开，文件夹路径用于区分同名模型。 */}
      <div data-local-batch-dialog="delete" className="min-w-0 space-y-3">
        <details className="text-xs text-muted-foreground">
          <summary className="mb-2 cursor-pointer">{t("toolBox.civitai.batch.selected", { count: props.models.length })}</summary>
          <BatchDestinations models={props.models} targets={[]} category="" />
        </details>
        {overLimit && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t("toolBox.civitai.batch.limit")}</p>}
        {error && <p role="alert" className="break-all text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!ready && !error && !overLimit && <p role="status" className="text-xs text-muted-foreground">{t("common.loading")}</p>}
        {targetError && <BatchExplorer models={props.models} root="" />}
        <BatchFailures result={operation.result} />
        <label className="flex items-start gap-2 text-xs leading-relaxed">
          <input data-local-batch-acknowledge type="checkbox" disabled={!ready || operation.busy || !!operation.result} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 accent-sky-600" />
          {t("toolBox.civitai.batch.acknowledgeDelete")}
        </label>
      </div>
    </ConfirmActionDialog>
  );
}

// 显示逐项失败的原因，用户关闭后可以只重新处理失败的模型。
function BatchFailures({ result }: { result: LocalModelBatchResult | null }) {
  return result?.items.filter((item) => !item.success).map((item) => (
    <p key={item.folderPath} role="alert" className="break-all text-xs text-red-600 dark:text-red-400">
      {item.folderPath} · {modelCategoryError(item.error)}
    </p>
  ));
}

function LocalModelMoveDialog(props: BatchProps) {
  const { t } = useTranslation();
  const { id, targets, targetError, root, setChosenRoot, category, setCategory, custom, setCustom, acknowledged, setAcknowledged, mixed, crossRoot, valid } = useBatchDialog(props);
  const operation = useBatchOperation(props, root, category);
  const ready = props.models.length <= 200 && targets.length === props.models.length && !targetError && !mixed && !crossRoot && valid;
  function changeCategory(value: string) { setCategory(value); setAcknowledged(false); }
  return <ResourceDialogShell open title={t("toolBox.civitai.batch.moveTitle")} titleId={id} onOpenChange={(open) => { if (!open && !operation.busy) props.onClose(); }} footer={<div className="flex justify-end gap-2 p-4"><button type="button" disabled={operation.busy} onClick={props.onClose} className="rounded-lg border border-border px-4 py-2 text-xs hover:bg-muted disabled:opacity-50">{t("common.cancel")}</button><button data-local-batch-confirm type="button" disabled={!ready || !acknowledged || operation.busy || !!operation.result} onClick={() => { if (ready && acknowledged) void operation.run(); }} className="rounded-lg bg-sky-600 px-4 py-2 text-xs text-white hover:bg-sky-700 disabled:opacity-50">{t(operation.busy ? "toolBox.civitai.batch.working" : "toolBox.civitai.batch.confirmMove")}</button></div>}>
    {/* 弹窗：批量文件操作，先查看范围并明确知晓后才执行 */}
    <fieldset disabled={operation.busy || !!operation.result} data-local-batch-dialog="move" className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm">{t("toolBox.civitai.batch.moveHint")}</p>
      <p className="text-xs text-muted-foreground">{t("toolBox.civitai.batch.selected", { count: props.models.length })}</p>
      {targets[0] && <><SimpleSelect value={root} options={targets[0].roots.map((item) => ({ value: item.path, label: item.name }))} ariaLabel={t("toolBox.civitai.localType")} portal onChange={(value) => { setChosenRoot(value); setAcknowledged(false); }} />{mixed || crossRoot ? <><p role="alert" className="text-xs text-muted-foreground">{t(mixed ? "toolBox.civitai.batch.mixedRoots" : "toolBox.civitai.categoryMove.crossRoot")}</p><BatchExplorer models={props.models} root={root} /></> : <ModelCategoryPicker id={`${id}-category`} category={category} custom={custom} categories={[...new Set(targets.flatMap((target) => target.categories))].sort()} valid={valid} onSelect={(value) => { setCustom(value === "/custom"); changeCategory(value === "/custom" ? "" : value); }} onInput={changeCategory} />}</>}
      <BatchDestinations models={props.models} targets={!crossRoot ? targets : []} category={category} />
      {(targetError || operation.error) && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{targetError || operation.error}</p>}
      {props.models.length > 200 && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t("toolBox.civitai.batch.limit")}</p>}
      {!targets.length && !targetError && <p role="status" className="text-xs text-muted-foreground">{t("common.loading")}</p>}
      {targetError && <BatchExplorer models={props.models} root="" />}
      <BatchFailures result={operation.result} />
      <label className="flex items-start gap-2 text-xs leading-relaxed"><input data-local-batch-acknowledge type="checkbox" disabled={!ready} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 accent-sky-600" />{t("toolBox.civitai.batch.acknowledgeMove")}</label>
    </fieldset>
  </ResourceDialogShell>;
}
