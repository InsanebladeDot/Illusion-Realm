"use client";

// 采用资料包设置页的双栏布局。开关只对已经绑定的图引擎参数开放。
// 未知页不是凭空设计的设置能力，保留资料中的未验证说明并禁止伪操作。
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { CanvasChip, CanvasSwitch, IconButton, SegmentedControl } from "./components";

export interface CanvasPreferences { snap: boolean; panSpeed: number; wheel: "pan" | "zoom"; blank: "right" | "double"; selectOnDrag: boolean }
// 默认值只描述已绑定的图引擎能力；恢复默认通过整体参数替换，不修改节点作品。
export const DEFAULT_PREFERENCES: CanvasPreferences = { snap: false, panSpeed: 1.5, wheel: "pan", blank: "right", selectOnDrag: true };

export function CanvasSettings({ value, onChange, onClose }: { value: CanvasPreferences; onChange: (value: CanvasPreferences) => void; onClose: () => void }) {
  // tab 只决定当前页；value 仍归工作区，关窗重开不会丢掉已经确认的交互设置。
  // 没有参考内部证据的标签显示明确说明，不根据名称编造通知、背景上传等功能。
  // 每次 onChange 展开原对象保留其他设置，防止调灵敏度时把吸附开关重置掉。
  const { t } = useTranslation();
  const [tab, setTab] = useState("interaction");
  const tabs = [{ id: "interaction", label: t("canvas.settingsInteraction") }, { id: "notifications", label: t("canvas.settingsNotifications") }, { id: "edges", label: t("canvas.settingsEdges") }, { id: "grid", label: t("canvas.settingsGrid") }, { id: "nodes", label: t("canvas.settingsNodes") }, { id: "background", label: t("canvas.settingsBackground") }, { id: "theme", label: t("canvas.settingsTheme") }, { id: "colors", label: t("canvas.settingsColors") }, { id: "simple", label: t("canvas.settingsSimple") }];
  return <section className="hy-settings" aria-label={t("canvas.canvasSettings")}><header><strong>{t("canvas.canvasSettings")}</strong><div><CanvasChip onClick={() => onChange({ ...DEFAULT_PREFERENCES })}>{t("canvas.restoreDefaults")}</CanvasChip><IconButton icon="expand" label={t("canvas.expand")} disabled reason={t("canvas.unavailable")} /><IconButton icon="close" label={t("canvas.closeSettings")} onClick={onClose} /></div></header><div className="hy-settings-body"><nav>{tabs.map(item => <button type="button" className={item.id === tab ? "is-active" : ""} aria-pressed={item.id === tab} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="hy-settings-content"><strong>{tabs.find(item => item.id === tab)?.label}</strong>{tab === "interaction" ? <div className="hy-settings-grid">
    <label className="hy-setting-control"><span>{t("canvas.panSpeed")}</span><input aria-label={t("canvas.panSpeed")} type="range" min="0.1" max="5" step="0.1" value={value.panSpeed} onChange={event => onChange({ ...value, panSpeed: Number(event.target.value) })} /><small>{value.panSpeed}x</small></label>
    <label className="hy-setting-control"><span>{t("canvas.animationLimit")}</span><input aria-label={t("canvas.animationLimit")} type="range" value="100" readOnly disabled /><small>100</small></label>
    <label className="hy-setting-control"><span>{t("canvas.blankAction")}</span><SegmentedControl label={t("canvas.blankAction")} items={[{ id: "right", label: t("canvas.rightMenu") }, { id: "double", label: t("canvas.doubleMenu") }]} value={value.blank} onChange={blank => onChange({ ...value, blank: blank === "double" ? "double" : "right" })} /></label>
    <label className="hy-setting-control"><span>{t("canvas.wheelAction")}</span><SegmentedControl label={t("canvas.wheelAction")} items={[{ id: "pan", label: t("canvas.pan") }, { id: "zoom", label: t("canvas.zoom") }]} value={value.wheel} onChange={wheel => onChange({ ...value, wheel: wheel === "zoom" ? "zoom" : "pan" })} /></label>
    <label className="hy-setting-control"><span>{t("canvas.snap")}</span><CanvasSwitch label={t("canvas.snap")} checked={value.snap} onChange={snap => onChange({ ...value, snap })} /></label>
    <label className="hy-setting-control"><span>{t("canvas.dragFocus")}</span><CanvasSwitch label={t("canvas.dragFocus")} checked={value.selectOnDrag} onChange={selectOnDrag => onChange({ ...value, selectOnDrag })} /></label>
    {[t("canvas.guides"), t("canvas.linkedPreview"), t("canvas.hoverAutoplay"), t("canvas.delaySubmit")].map(label => <label className="hy-setting-control" key={label} title={t("canvas.unavailable")}><span>{label}</span><CanvasSwitch label={label} checked={false} onChange={() => undefined} disabled /></label>)}
    </div> : <div className="hy-unverified-panel">{t("canvas.settingsUnverified")}</div>}</div></div></section>;
}
