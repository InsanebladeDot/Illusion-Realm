"use client";

// 模型库侧栏按官方类别和实际目录树导航，不执行移动、创建或删除文件。
// 每个分支自管开合，展开 LoRA 不会改变 Checkpoint 或另一个实例。
// 目录路径由扫描索引提供，点击只通知父级改变浏览位置。
// 普通列表加原生按钮保留完整键盘操作，不假装实现 ARIA tree 的全部方向键。
import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { modelFolderTree, type LocalLibraryFile, type ModelFolderNode } from "@/utils/local-model-tree";
import { modelRootLabel } from "./model-library-labels";
import { useTranslation } from "@/i18n";
import { ModelLibraryChoices, ModelLibrarySection } from "./model-library-controls";

// 导航按钮和分支按钮职责分离：前者进入目录，后者仅展开后代。
// 避免点击箭头同时切换目录，也不把 button 嵌进另一颗 button。
// 目录显示名称可重复，稳定 key 使用完整相对路径。
// 计数是索引文件数，未扫描的空目录不虚构数字。
// 长文件夹名单行省略，完整路径保留 title，避免图标随换行上下错位。
// 子节点缩进只表达层级，不限制最大目录深度。
// 分支收起时子节点卸载，不让不可见按钮继续出现在 Tab 顺序。
// 展开状态不进入用户文档，本轮不新增持久化目录偏好。
function FolderBranch({ node, current, onOpen }: { node: ModelFolderNode; current: string; onOpen: (path: string) => void }) {
  // 默认展开当前路径的祖先，中心文件夹导航后侧栏也能看见所在位置。
  // 用户显式开合后尊重本分支选择，不让自动定位阻止手动收起。
  // null 表示还没有手动覆盖，false 与它有不同语义。
  const [override, setOpen] = useState<boolean | null>(null), { t } = useTranslation();
  const open = override ?? (current === node.value || current.startsWith(node.value + "/"));
  const Icon = current === node.value ? FolderOpen : Folder;
  return <li className="min-w-0"><div className="flex min-w-0 items-center gap-1">{node.children.length > 0 && <button type="button" aria-expanded={open} aria-label={t("toolBox.civitai.toggleFolder", { name: node.name })} onClick={() => setOpen(!open)} className="shrink-0 rounded p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>}<button type="button" data-model-tree-folder={node.value} aria-current={current === node.value ? "page" : undefined} title={node.value} onClick={() => onOpen(node.value)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary ${current === node.value ? "bg-primary/10 text-primary" : ""}`}><Icon size={14} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{node.name}</span><small className="shrink-0 text-muted-foreground">{node.count}</small></button></div>{open && <ul className="ml-3 border-l border-border pl-1">{node.children.map(child => <FolderBranch key={child.value} node={child} current={current} onOpen={onOpen} />)}</ul>}</li>;
}
// 进入目录与展开树是两个操作，选中深层文件夹不会自动打开另一个分支。
// 当前目录高亮使用完整 value，兄弟同名节点不会同时显示 aria-current。
// 展开按钮只有存在后代才出现，叶目录不画不能展开的空箭头。
// children 递归沿用相同组件，因此任意层的焦点和悬停样式一致。
// 外层 ul/li 表达目录层次，原生按钮保留 Tab、空格和 Enter 支持。
// 本轮没有实现 ARIA tree 所需的方向键漫游，所以不声明 role=tree。
// 点击箭头不会触发进入目录回调，父级过滤结果保持不变。
// 用户关闭分支时后代卸载，隐藏项不会继续留在键盘顺序中。
// 再展开后按当前目录属性恢复高亮，不需要缓存旧 DOM 节点。
// 根分类作为 key 的一部分，换根后同名目录也不会继承错误的展开。
// 文件夹文字与图标垂直居中，窄栏只省略文本，不缩小图标和数量。
// count 仅是索引快照，重新扫描前不会声称知道外部新文件的数量。

// 官方分类与“我的分类”都从本地索引生成，不维护另一份硬编码分类树。
// onRoot 重置下级目录由父级负责，侧栏不修改扫描器或主模型加载规则。
// 自动识别的官方目录包含 VAE、CLIP、model_patches 等所有有模型的目录。
// 非官方的额外目录也原样可见，不能因为白名单漏掉而隐藏已扫描文件。
// 侧栏始终在工作区网格内自己滚动，不用定位覆盖应用导航。
// 没有索引的目录不画节点，不画无效加号假装支持创建分类。
// 官方按钮与工具栏分类选择通知同一个回调，二者不会各存一份选择。
// 此导航组件可复用到其他本地浏览视图，动作仍由调用方决定。
// 全部范围下保留官方根分组，是为了区分 LoRA/Anima 与主模型/Anima。
// 这两个目录可以有相同名字，但选中回调必须带着所属官方根一起更新。
// 先调用 onRoot 再调用 onFolder，React 在一次点击内提交最终的完整范围。
// 不以原生磁盘路径作标题，树里只展示根类别和用户实际相对目录。
// 数量来自当前索引快照，外部新下载完成后仍由原扫描刷新提供最新结果。
// 同一个模型文件只有一个 ID，目录计数不会把同组双版本折成一份。
// type 的旧三项枚举不决定导航范围，VAE 和新增辅助类别仍可浏览。
// 额外类别没有可读别名时原样展示，新增目录不要求每次修改代码。
interface NavigationProps {
  roots: string[]; models: LocalLibraryFile[]; root: string; folder: string; tree: ModelFolderNode[];
  onRoot: (root: string) => void; onFolder: (folder: string) => void;
}
/**
 * 分组折叠与目录递归是两层独立状态：
 * 官方分类标题收起后仍保留当前根条件，中心列表不应变成全库。
 * “我的分类”标题收起后不清理 FolderBranch 的 override，展开时恢复原有分支状态。
 * 两组标题复用 ModelLibrarySection，同一个开合动画不会绑定到两份全局布尔值。
 * 目录箭头依旧只负责后代分支，不能和整个“我的分类”标题共用回调。
 * 收起整个分组时 CollapsiblePanel 保留子树，隐藏子按钮由 inert 排除键盘访问。
 * 原目录分支自身关闭时仍按已有方式卸载后代，两种生命周期各有职责。
 * 文字省略需要 span、主按钮和外层行都允许收缩，否则 nowrap 仍会撑开侧栏。
 * 计数位于独立 small 节点，不能和名字一起被 ellipsis 裁掉。
 * 完整目录保留在主按钮 title，省略文字不影响点击传回的 node.value。
 * 同一目录名出现在两个官方根下时，完整 key 保持两个分支互不借用展开状态。
 * 全部根范围下的分支点击先指定根再指定路径，不能仅凭路径名去另一个根找文件。
 * 折叠标题是 h2 内的 button，既保留文档层级也能用原生键盘恢复。
 * 折叠不会启动文件操作，读取位置只通过原有 onRoot/onFolder 回调更新。
 * 分组动画只改变侧栏内部高度，中间模型区不会因为动画被当作另一个页面卸载。
 * 侧栏的滚动位置由原生容器保留，不为动画绑定全局滚轮监听。
 * 修改标题与箭头样式时要核对在线类型区，因为它实际引用相同的公共分组。
 * 如果需要记住跨会话折叠偏好，应单独设计用户文档字段，本轮仅保留会话内状态。
 */
export function ModelFolderNavigation({ roots, models, root, folder, tree, onRoot, onFolder }: NavigationProps) {
  const { t } = useTranslation();
  return <aside data-model-folder-navigation className="min-h-0 min-w-0 flex-1 overflow-auto px-3 py-4"><ModelLibraryChoices label={t("toolBox.civitai.officialModels")} current={root} onChange={onRoot} dataKey="local-model-root" items={[{ value: "", label: t("toolBox.civitai.all"), count: models.length }, ...roots.map(value => ({ value, label: modelRootLabel(value), count: models.filter(model => model.rootCategory === value).length }))]} /><div className="mt-4 border-t border-border pt-4"><ModelLibrarySection label={t("toolBox.civitai.myFolders")} marker="local-folders">{root ? <ul>{tree.map(node => <FolderBranch key={`${root}/${node.value}`} node={node} current={folder} onOpen={onFolder} />)}</ul> : <ul>{roots.map(value => <li key={value}><button type="button" onClick={() => onRoot(value)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted"><Folder size={14} /><span className="truncate">{modelRootLabel(value)}</span></button><ul className="ml-2">{modelFolderTree(models.filter(model => model.rootCategory === value)).map(node => <FolderBranch key={`${value}/${node.value}`} node={node} current="" onOpen={path => {onRoot(value); onFolder(path);}} />)}</ul></li>)}</ul>}</ModelLibrarySection></div></aside>;
}
// 官方分类按钮属于过滤器，使用 aria-pressed 表示当前根选择。
// 子目录属于浏览位置，使用 aria-current 表示正在查看的位置。
// “全部”展示全部权重；中间不再用文件夹卡片代替模型。
// 全部范围下按官方根分组显示目录，路径同名也不会混用所属类别。
// 这里只读 roots/tree，不把用户在 UI 上的点击作为创建磁盘目录的命令。
// 未收录空文件夹是扫描契约边界，不能靠前端合成一个存在的目录。
// 边框和背景沿用全局语义色，深色时不留下写死的白色侧栏。
// 根名来自真实目录，不翻译成另一种名字后再拿翻译文本拼路径。
// onFolder 只接收索引相对值，真实文件操作仍由模型管理服务决定。
// 如果目录被外部删除，重新扫描后树节点消失，面包屑仍可返回父级。
