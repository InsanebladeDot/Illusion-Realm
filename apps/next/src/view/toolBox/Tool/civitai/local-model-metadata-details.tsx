"use client";

import { useState } from "react";
import type { LocalModelMetadata } from "@illusion-realm/shared";
import type { LocalModelVersion } from "@/types/localModel";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
// 补全状态独立于只读详情，失败不会清空已经存在的来源内容。
// hook 按实际文件路径隔离响应，避免多个版本之间串用结果。
// revision 用于写成功后重新读取同名 sidecar。
import { useLocalModelRecovery } from "@/hooks/use-local-model-recovery";
import { useTranslation } from "@/i18n";
import { civitaiDescription } from "@/utils/civitai";
// 本地与在线共享阅读和复制规则，不改变 sidecar 资料本身。
// 说明先经原有净化器转成纯文字，阅读组件不接收作者 HTML。
// 两种说明按原顺序合并，空字段不产生多余分隔。
import { ModelDescription } from "./model-description";
import { ModelTriggerWords } from "./model-trigger-words";

function MetadataContent({ data }: { data: LocalModelMetadata }) {
  const { t } = useTranslation();
  const link = data.modelPageUrl || data.sourceUrl;
  // 作者总说明在前、当前版本说明在后，中间空行保留原有两段的阅读边界。
  // 对每段分别净化后再合并，不能让一段未闭合的 HTML 改写另一段文字。
  // 该值不进入持久化，只用于当前详情；sidecar 中的原始内容保持不变。
  const description = [data.description, data.versionDescription].map(civitaiDescription).filter(Boolean).join("\n\n");
  return <div className="space-y-3 text-xs" data-local-metadata-content>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 break-words">
      <dt className="text-muted-foreground">{t("toolBox.civitai.metadata.source")}</dt>
      <dd>{link ? <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">{data.source || link}</a> : data.source || "—"}</dd>
      {data.sourceTitle && <><dt className="text-muted-foreground">{t("toolBox.civitai.metadata.title")}</dt><dd>{data.sourceTitle}</dd></>}
      {data.creator && <><dt className="text-muted-foreground">{t("toolBox.civitai.metadata.creator")}</dt><dd>{data.creator}</dd></>}
      {data.versionName && <><dt className="text-muted-foreground">{t("toolBox.civitai.version")}</dt><dd>{data.versionName}</dd></>}
      {data.baseModel && <><dt className="text-muted-foreground">{t("toolBox.civitai.base")}</dt><dd>{data.baseModel}</dd></>}
    </dl>
    {/* 本地触发词：与在线详情共用逗号拆分、单词复制和整组复制。 */}
    {/* 仅展示数据不自动插入提示词，用户可以自由选择复制哪些标签。 */}
    <ModelTriggerWords words={data.trainedWords} />
    {/* 本地模型说明：净化后的两段文字共用一个受限高度，不让版本说明另占一整屏。 */}
    {/* 内容变化仅重置阅读器，模型选择、补全状态和版本下拉仍由原组件维护。 */}
    {/* 来源说明继续只读，不使用 dangerouslySetInnerHTML 执行作者内容。 */}
    {description && <section><h5 className="mb-2 font-medium">{t("toolBox.civitai.about")}</h5><ModelDescription key={description} text={description} /></section>}
    {data.sha256 && <details className="text-muted-foreground"><summary className="cursor-pointer">SHA256</summary><p className="mt-2 break-all font-mono text-[10px]">{data.sha256}</p><p className="mt-2 leading-relaxed">{t("toolBox.civitai.metadata.hashHint")}</p></details>}
  </div>;
}

// 本地模型库把文件信息与来源分组展示，其他消费处保留原始标题。
// sourceHeading 只注入显示差异，不改变按版本读取、恢复或缓存失效机制。
// 缺省为 false，创建页和其他既有调用方无需迁移。
// 调用方不能通过标题参数绕过实际文件身份，versions 仍是唯一读取来源。
// 同一个文件在宽屏与弹窗里采用相同分组，避免两种形态文案互不一致。
export function LocalModelMetadataDetails({ versions, revision, sourceHeading = false }: { versions: LocalModelVersion[]; revision: number; sourceHeading?: boolean }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const filePath = versions.find(version => version.filePath === selected)?.filePath || versions[0]?.filePath || "";
  // 界面：当前选中版本的 SHA-256 资料补全入口。
  // 路径必须来自版本文件，不能将模型目录本身交给主进程。
  // 本地递增值与外部扫描版本共同触发原有只读 hook 刷新。
  // 补全后的触发词与说明继续经过既有字段过滤和纯文字显示。
  // 切页不会丢失主进程已提交的来源文件。
  const recovery = useLocalModelRecovery(filePath);
  const { entries, loading, failed } = useLocalModelMetadata(filePath ? [filePath] : [], revision + recovery.revision);
  const entry = entries[0];
  const message = loading ? "loading" : failed ? "unavailable" : entry?.status || "missing";
  return <section className="space-y-3 border-t border-border pt-4" data-local-model-metadata data-status={message}>
    <h4 className="text-xs font-semibold">{t(sourceHeading ? "toolBox.civitai.sourceHeading" : "toolBox.civitai.metadata.heading")}</h4>
    {versions.length > 1 && <SimpleSelect value={filePath} onChange={setSelected} ariaLabel={t("toolBox.civitai.version")} options={versions.map(version => ({ value: version.filePath, label: version.name }))} />}
    {/* 界面：手动补全与结果。按钮放在版本选择之后，保持原有选择交互。 */}
    {/* 目录扫描只列模型，不会自动对整个模型库发起摘要读取。 */}
    {/* 已有来源保留；点击会得到 existing 状态，不覆盖手工修改。 */}
    {/* 摘要在失败提示下也可检查，便于对照外部校验工具。 */}
    {/* 未获取预览单独提示，不把文本已保存描述成整体失败。 */}
    {/* 异步错误由 hook 捕获，组件不直接调用 Electron API。 */}
    {/* 单项进度只跟随此次手动请求，批量占用单独解释禁用原因。 */}
    {/* 按钮和 hook 同时保留互斥，避免 UI 更新前连续点击产生重复读取。 */}
    {/* 没有点击时只读来源，不自动计算 SHA-256 或查询网站。 */}
    <button data-recover-model-metadata type="button" disabled={!filePath || loading || recovery.busy || recovery.batchRunning} onClick={() => { void recovery.recover(); }} className="w-full rounded-lg border border-border px-3 py-2 text-xs text-primary hover:bg-primary/5 disabled:opacity-50">{t(recovery.busy ? "toolBox.civitai.metadata.recovering" : "toolBox.civitai.metadata.recover")}</button>
    {/* 批量占用提示不覆盖原有来源信息；当前版本资料仍然可以阅读。 */}
    {/* 它只说明入口被占用，不声称当前文件属于正在执行的批量快照。 */}
    {/* 批量结束后订阅自然移除此提示，不需要靠切卡片触发界面刷新。 */}
    {/* 单项自己的 busy 优先显示真实进度，避免同一按钮同时出现两个解释。 */}
    {recovery.batchRunning && !recovery.busy && <p role="status" className="text-xs text-muted-foreground">{t("toolBox.civitai.metadata.batchOccupied")}</p>}
    {recovery.result && <div role="status" data-model-recovery-status={recovery.result.status} className="space-y-2 text-xs leading-relaxed text-muted-foreground"><p>{t(`toolBox.civitai.metadata.recovery.${recovery.result.status}`)}</p>{recovery.result.cover === "unavailable" && <p>{t("toolBox.civitai.metadata.coverUnavailable")}</p>}{recovery.result.sha256 && <p className="break-all font-mono text-[10px]">SHA256: {recovery.result.sha256}</p>}</div>}
    {entry?.metadata ? <MetadataContent data={entry.metadata} /> : <p role="status" className="text-xs leading-relaxed text-muted-foreground">{t(`toolBox.civitai.metadata.${message === "ready" ? "missing" : message}`)}</p>}
  </section>;
}
