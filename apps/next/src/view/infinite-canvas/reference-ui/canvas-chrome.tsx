"use client";

// 画布名称、菜单、视口和底栏直接沿用资料包的结构，动作仍由同一编辑会话执行。
// 不显示资料中的模型广告或 Beta 标记；不能执行的服务入口以 disabled 解释原因。
import { useTranslation } from "@/i18n";
import { NODE_KINDS, NODE_LABELS, type NodeKind } from "../canvas-model";
import { CanvasIcon, IconButton, type CanvasAction } from "./components";

export function AddNodeMenu({ onSelect, onClose, onImport }: { onSelect: (kind: NodeKind) => void; onClose: () => void; onImport: () => void }) {
  // 节点类型用稳定英文值，中文标题只供展示；翻译变化不会改变被创建的节点类型。
  // 没有模型和文件桥接的条目继续显示禁用原因，不发送无接收方的空动作。
  const { t } = useTranslation();
  const icons = { text: "text", image: "image", video: "video", audio: "audio", composition: "composition", note: "comment" } as const;
  const unavailable = [{ icon: "layers", key: "canvas.director" }, { icon: "world", key: "canvas.world" }, { icon: "video", key: "canvas.batchVideo" }, { icon: "image", key: "canvas.batchImage" }, { icon: "layers", key: "canvas.layerEdit" }] as const;
  return <div className="hy-add-menu" data-canvas-menu role="menu" aria-label={t("canvas.add")} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    // 每次从当前 DOM 读取可用条目，不能缓存首次索引后误把禁用条目当作键盘目标。
    // 焦点来自菜单外时向下从首项进入、向上从末项进入，避免负索引跳过入口。
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus(); return; }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && buttons.length) {
      event.preventDefault();
      const next = index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next]?.focus();
    }
  }}>
    <div className="hy-menu-heading">{t("canvas.add")}</div>
    {NODE_KINDS.map(kind => <button type="button" role="menuitem" key={kind} data-node-kind={kind} onClick={() => onSelect(kind)}><CanvasIcon name={icons[kind]} /><span>{t(NODE_LABELS[kind])}</span></button>)}
    {unavailable.map(item => <button type="button" role="menuitem" key={item.key} disabled title={t("canvas.unavailable")}><CanvasIcon name={item.icon} /><span>{t(item.key)}</span></button>)}
    <div className="hy-menu-heading">{t("canvas.temporaryAssets")}</div>
    {/* 添加菜单：本地导入是真实文件入口，与尚未接通的 Blender 服务分别控制。 */}
    {/* 导入名称明确说“本地”，不复用“上传”承诺发生了云端传输。 */}
    {/* 条目继续是原生 button 和 menuitem，方向键、Home 与 End 会自动包含新入口。 */}
    {/* 回调先交给宿主，不在公共菜单里查询路径或创建私有节点数组。 */}
    {/* Blender 仍是独立能力，开放本地文件不能顺带把它标成可用。 */}
    <button type="button" role="menuitem" data-canvas-import onClick={onImport}><CanvasIcon name="upload" /><span>{t("canvas.importMedia")}</span></button>
    <button type="button" role="menuitem" disabled title={t("canvas.unavailable")}><CanvasIcon name="cube" /><span>{t("canvas.blender")}</span></button>
  </div>;
}

export function CanvasDock({ onAction, hand, canUndo, canRedo }: { onAction: CanvasAction; hand: boolean; canUndo: boolean; canRedo: boolean }) {
  // 撤销和重做的可用性来自当前会话历史；工具条不单独统计点击次数。
  // 手掌模式的按下外观依 hand 保持，失焦或移开不会把模式偷偷切回选择。
  const { t } = useTranslation();
  return <div className="hy-canvas-dock" data-canvas-toolbar aria-label={t("canvas.title")}>
    <IconButton icon="plus" label={t("canvas.add")} className="hy-dock-add" onClick={() => onAction("add")} />
    <IconButton icon="panel" label={t(hand ? "canvas.select" : "canvas.pan")} pressed={hand} onClick={() => onAction("hand")} />
    <IconButton icon="undo" label={t("canvas.undo")} disabled={!canUndo} onClick={() => onAction("undo")} />
    <IconButton icon="redo" label={t("canvas.redo")} disabled={!canRedo} onClick={() => onAction("redo")} />
    {/* 底栏：仍复用资料包的文件夹图标，但名称说明实际是导入，不冒充已经有素材管理器。 */}
    {/* 图标按钮的 hover 和键盘态来自 IconButton，深浅主题都接同一份样式。 */}
    {/* onAction 使用稳定的 import 意图，不能把翻译文字当作分支条件。 */}
    {/* 单击只打开系统选择框，取消不会导致工具条自己增加节点计数。 */}
    {/* 撤销按钮仍由 editor 历史控制，不因为打开过选择框就变成可用。 */}
    <IconButton icon="folder" label={t("canvas.importMedia")} onClick={() => onAction("import")} />
    <IconButton icon="target" label={t("canvas.fit")} onClick={() => onAction("target")} />
    <IconButton icon="settings" label={t("canvas.canvasSettings")} onClick={() => onAction("settings")} />
    <IconButton icon="tack" label={t("canvas.pin")} disabled reason={t("canvas.unavailable")} />
  </div>;
}

// 视图开关的高亮读取实际状态，不以按钮是否仍聚焦判断开关是否打开。
// 镜头倍率、点阵和小地图都由所属画布注入；公共控件不建立第二份默认值。
export function ViewControls({ zoom, grid, minimap, onZoomChange, onFit, onGridToggle, onMiniMapToggle, onHelp }: { zoom: number; grid: boolean; minimap: boolean; onZoomChange: (value: number) => void; onFit: () => void; onGridToggle: () => void; onMiniMapToggle: () => void; onHelp: () => void }) {
  const { t } = useTranslation();
  return <div className="hy-view-cluster" data-canvas-viewport><div className="hy-view-controls">
    <IconButton icon="grid" label={t("canvas.grid")} className="hy-grid-button" pressed={grid} onClick={onGridToggle} />
    <IconButton icon="minimap" label={t("canvas.fit")} onClick={onFit} />
    <button type="button" className="hy-zoom-value" aria-label={t("canvas.reset")} onClick={() => onZoomChange(1)}><CanvasIcon name="search" size={12} />{Math.round(zoom * 100)}%</button>
  </div><IconButton icon="panel" label={t("canvas.minimap")} className="hy-round-button" pressed={minimap} onClick={onMiniMapToggle} /><IconButton icon="help" label={t("canvas.help")} className="hy-round-button" onClick={onHelp} /></div>;
}

// 项目头增加文件夹与下载意图，继续使用同一个 IconButton。
// 文件夹表示打开工程，不是媒体批量导入。
// 下载表示打包工程，不是画布截图或视频导出。
// 两项通过 onAction 注入，参考组件不直接调用磁盘接口。
// 保存图标仍对应统一用户草稿，保留现有状态提示。
// 处理中 editable=false，图标禁用原因来自页面真实操作状态。
// 保存期间也禁用工程替换，避免两种文档事务竞争。
// 品牌下拉仍因没有工程列表而禁用，不以工程交换冒充多工程管理。
// 标题按钮只打开改名草稿，完整长名放在 title 中保留。
// 图标标签走双语词条，不能靠形状让读屏用户猜功能。
// 悬停和按下沿用资料库，不给新入口叠一圈粗边框。
// 旧调用方仍以 action 回调装配，不因这个扩展绑定到 Node API。
export function ProjectHeader({ name, status, saving, editable, onAction }: { name: string; status: string; saving: boolean; editable: boolean; onAction: CanvasAction }) {
  // 状态文案来自真实持久化适配器，不能沿用参考截图里固定的“已自动保存”。
  // 保存时先禁用重复提交；读取失败也不允许改名后覆盖尚未成功恢复的作品。
  // 单草稿暂没有画布列表，所以品牌下拉禁用，不弹一个空菜单冒充多工程管理。
  const { t } = useTranslation();
  return <div className="hy-project-header"><button type="button" disabled title={t("canvas.singleDraft")}><span className="hy-neutral-mark">{t("canvas.brandMark")}</span><span className="hy-down-chevron">⌄</span></button><button type="button" className="hy-project-name" title={name} disabled={!editable} onClick={() => onAction("rename")}><strong>{name}</strong><span className="hy-down-chevron">⌄</span></button><IconButton icon="folder" label={t("canvas.openProject")} disabled={!editable || saving} onClick={() => onAction("open")} /><IconButton icon="download" label={t("canvas.exportProject")} disabled={!editable || saving} onClick={() => onAction("export")} /><IconButton icon={saving ? "history" : "checkcircle"} label={t("canvas.save")} reason={status} disabled={!editable || saving} onClick={() => onAction("save")} /><IconButton icon="refresh" label={t("canvas.reload")} disabled={saving} onClick={() => onAction("refresh")} /></div>;
}

export function CanvasCounters({ nodes, edges }: { nodes: number; edges: number }) {
  // 数量直接来自当前作品，复制、删除关联边及恢复后都自动同步，不维护第二个计数器。
  const { t } = useTranslation();
  return <div className="hy-counters" aria-label={t("canvas.count", { nodes, edges })}><CanvasIcon name="arrow" size={12} style={{ transform: "rotate(90deg)" }} /><span>{edges}</span><CanvasIcon name="grid" size={12} /><span>{nodes}</span><CanvasIcon name="warning" size={12} /></div>;
}
