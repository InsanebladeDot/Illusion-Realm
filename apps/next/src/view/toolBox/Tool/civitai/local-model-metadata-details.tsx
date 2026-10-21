"use client";

import { useState } from "react";
import type { LocalModelMetadata } from "@illusion-realm/shared";
import type { LocalModelVersion } from "@/types/localModel";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useLocalModelMetadata } from "@/hooks/use-local-model-metadata";
import { useTranslation } from "@/i18n";
import { civitaiDescription } from "@/utils/civitai";

function MetadataContent({ data }: { data: LocalModelMetadata }) {
  const { t } = useTranslation();
  const link = data.modelPageUrl || data.sourceUrl;
  return <div className="space-y-3 text-xs" data-local-metadata-content>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 break-words">
      <dt className="text-muted-foreground">{t("toolBox.civitai.metadata.source")}</dt>
      <dd>{link ? <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">{data.source || link}</a> : data.source || "—"}</dd>
      {data.sourceTitle && <><dt className="text-muted-foreground">{t("toolBox.civitai.metadata.title")}</dt><dd>{data.sourceTitle}</dd></>}
      {data.creator && <><dt className="text-muted-foreground">{t("toolBox.civitai.metadata.creator")}</dt><dd>{data.creator}</dd></>}
      {data.versionName && <><dt className="text-muted-foreground">{t("toolBox.civitai.version")}</dt><dd>{data.versionName}</dd></>}
      {data.baseModel && <><dt className="text-muted-foreground">{t("toolBox.civitai.base")}</dt><dd>{data.baseModel}</dd></>}
    </dl>
    {!!data.trainedWords.length && <section><h5 className="mb-2 font-medium">{t("toolBox.civitai.words")}</h5><div className="flex flex-wrap gap-1" data-local-trigger-words>{data.trainedWords.map(word => <span key={word} className="break-all rounded bg-primary/10 px-2 py-1 text-primary">{word}</span>)}</div></section>}
    {/* 界面：来源 JSON 的说明始终作为纯文字显示，不执行作者提供的 HTML。 */}
    {(data.description || data.versionDescription) && <section><h5 className="mb-2 font-medium">{t("toolBox.civitai.about")}</h5>{[data.description, data.versionDescription].filter(Boolean).map((value, index) => <p key={index} className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{civitaiDescription(value)}</p>)}</section>}
    {data.sha256 && <details className="text-muted-foreground"><summary className="cursor-pointer">SHA256</summary><p className="mt-2 break-all font-mono text-[10px]">{data.sha256}</p><p className="mt-2 leading-relaxed">{t("toolBox.civitai.metadata.hashHint")}</p></details>}
  </div>;
}

export function LocalModelMetadataDetails({ versions, revision }: { versions: LocalModelVersion[]; revision: number }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const filePath = versions.find(version => version.filePath === selected)?.filePath || versions[0]?.filePath || "";
  const { entries, loading, failed } = useLocalModelMetadata(filePath ? [filePath] : [], revision);
  const entry = entries[0];
  const message = loading ? "loading" : failed ? "unavailable" : entry?.status || "missing";
  return <section className="space-y-3 border-t border-border pt-4" data-local-model-metadata data-status={message}>
    <h4 className="text-xs font-semibold">{t("toolBox.civitai.metadata.heading")}</h4>
    {versions.length > 1 && <SimpleSelect value={filePath} onChange={setSelected} ariaLabel={t("toolBox.civitai.version")} options={versions.map(version => ({ value: version.filePath, label: version.name }))} />}
    {entry?.metadata ? <MetadataContent data={entry.metadata} /> : <p role="status" className="text-xs leading-relaxed text-muted-foreground">{t(`toolBox.civitai.metadata.${message === "ready" ? "missing" : message}`)}</p>}
  </section>;
}
