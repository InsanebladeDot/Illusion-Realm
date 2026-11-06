"use client";

// 资料包的合成器外壳仅展示已证实的空工程布局，不把静态标尺当成媒体引擎。
// 真正的视频编辑继续走项目现有编辑器；这里没有重复创建剪切、导出或播放状态机。
// 节点可独立播放本地文件，但合成器未消费这些引用，合成播放、添加和导出仍禁用。
import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/i18n";
import { CanvasIcon, IconButton, SegmentedControl } from "./components";

export function CompositionEditor({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("all");
  const [zoom, setZoom] = useState(25);
  const reason = t("canvas.composerUnavailable");
  return <section className="hy-composer" aria-label={t("canvas.composition")}>
    <header><IconButton icon="panel" label={t("canvas.assetLibrary")} disabled reason={reason} /><strong>{t("canvas.composition")}</strong><span>00:00</span><small>{t("canvas.uiOnly")}</small><div className="hy-composer-header-right"><Link href="/tools/video/editor" title={t("canvas.editorHint")}>{t("canvas.editor")}</Link><button type="button" className="hy-export" disabled title={reason}><CanvasIcon name="download" />{t("canvas.export")}</button><IconButton icon="close" label={t("canvas.close")} onClick={onClose} /></div></header>
    <div className="hy-composer-main"><aside className="hy-materials"><div className="hy-materials-title"><b>{t("canvas.materials")}</b><span>0</span></div><SegmentedControl label={t("canvas.assetType")} items={[{ id: "all", label: t("canvas.all") }, { id: "video", label: t("canvas.video") }, { id: "image", label: t("canvas.image") }, { id: "audio", label: t("canvas.audio") }]} value={tab} onChange={setTab} /><div className="hy-material-empty">{reason}</div><button type="button" className="hy-library-button" disabled title={reason}><CanvasIcon name="library" size={14} />{t("canvas.fromLibrary")}</button></aside>
    <div className="hy-preview"><div className="hy-preview-empty"><CanvasIcon name="clapper" size={32} /><b>{t("canvas.emptyTimeline")}</b></div><footer><span><b>00:00</b> / 00:00</span><button type="button" className="hy-preview-play" aria-label={t("canvas.play")} disabled title={reason}><CanvasIcon name="play" size={18} /></button><button type="button" className="hy-preview-ratio" disabled title={reason}><CanvasIcon name="video" size={13} />{t("canvas.ratio")}</button></footer></div>
    <aside className="hy-properties"><b>{t("canvas.properties")}</b><div className="hy-material-empty">{t("canvas.selectClip")}</div>{[{ text: t("canvas.play"), key: "Space" }, { text: t("canvas.remove"), key: "Delete" }, { text: t("canvas.undo"), key: "Ctrl+Z" }].map(item => <div className="hy-shortcut" key={item.key}><span>{item.text}</span><kbd>{item.key}</kbd></div>)}</aside></div>
    <div className="hy-timeline"><div className="hy-timeline-tools">{(["undo", "redo", "scissors", "trash"] as const).map(icon => <IconButton key={icon} icon={icon} label={t("canvas.uiOnly")} disabled reason={reason} />)}<div /><CanvasIcon name="minus" size={14} /><input type="range" min="0" max="100" value={zoom} aria-label={t("canvas.timelineZoom")} onChange={event => setZoom(Number(event.target.value))} /><CanvasIcon name="plus" size={14} /><IconButton icon="expand" label={t("canvas.fit")} onClick={() => setZoom(25)} /></div><div className="hy-timeline-scroll" style={{ minWidth: 100 + zoom * 10 }}><div className="hy-ruler"><span />{Array.from({ length: 18 }, (_,index) => <span key={index}>{index}s</span>)}</div>{(["video", "headphones"] as const).map(icon => <div className="hy-track" key={icon}><div><CanvasIcon name={icon} size={13} /><CanvasIcon name="volume" size={13} /></div><section /></div>)}<div className="hy-playhead" /></div></div>
  </section>;
}
