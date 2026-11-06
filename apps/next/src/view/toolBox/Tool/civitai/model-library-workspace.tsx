"use client";

// 在线与本地库共用几何和滚动边界，数据、选择和写操作留在各自页面。
// 类比三格书架：关掉右边资料格后，中间书架直接使用空出来的宽度。
// 关闭并不发出取消下载或删除文件命令，组件只通知父级关闭阅读区域。
// 真实媒体查询沿用项目 hook，初始渲染不直接访问浏览器窗口。
import { useRef, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAppMainInset } from "@/hooks/use-app-main-inset";
import { useTranslation } from "@/i18n";
// 导航、应用主区和模型库使用同一时长与曲线，只注入需要过渡的布局属性。
// 动画由浏览器接续，快速反复点击不会创建过期的收尾定时器。
// 减少动效沿用全局媒体查询，不增加另一套动画偏好。
import { PANEL_RESIZE_MOTION } from "@/utils/panel-resize-motion";
import styles from "./local-model-library.module.css";

// 调用方传真实详情内容，公共外壳不按来源猜测应该调用哪个下载或扫描接口。
// 有内容才在窄屏打开弹窗，空详情区域只在宽屏占第三列。
// visible 与 hasSelection 不等价：空面板的关闭按钮也必须可用。
// 数据属性用于现有冒烟定位，不能作为业务权限或磁盘访问的依据。
/**
 * 共享宿主的接入约定：
 * sidebar 放类别导航与来源入口，不把模型结果放进这一列。
 * children 放固定页头、可滚动目录和固定计数条，三者共享中间列高度。
 * details 放单个模型的阅读或下载内容，外壳不会根据文件名查询第二份资料。
 * 父级需要把当前模型映射成 details，而不是让公共宿主自己读取全局选中项。
 * visible 是用户是否保留详情列，hasSelection 是当前是否有可读对象。
 * 例如首次打开时 visible=true、hasSelection=false，右边是可关闭的空态。
 * 关闭后的 visible=false 即使搜索产生新结果也不应被改成 true。
 * 只有用户重新点模型才由父级恢复 visible，因此宽度不会随着请求进度跳动。
 * 宽屏下空态占第三列，方便用户理解点卡片后资料出现的位置。
 * 窄屏下空态不弹窗，避免刚进页面就被一个没有内容的弹层挡住。
 * 1280px 对应模块样式中的第三列断点，改断点时必须同时核对 CSS。
 * 详情插槽只在一个展示位置挂载，模型下载表单不会同时出现两个独立草稿。
 * 跨断点时详情内容会改变宿主，不能把此组件当成永久保活容器。
 * 下载任务保存在原业务队列，表单卸载不等于取消已经开始的传输。
 * 本地资料读取也归详情组件管理，外壳关闭不直接调用文件或网络接口。
 * local 参数保留两种内容的滚动差异，不决定它们的权限或可下载性。
 * 本地详情是自然高度的资料块，窄屏由资源外壳提供滚动。
 * 在线详情自带固定下载底栏和内部滚动，所以弹窗外壳不能再加一层正文滚动。
 * 宽屏第三列的 detailsScroll 限制长介绍，不允许文字撑高整个 AppShell。
 * 侧栏的滚动和目录的滚动由各插槽原组件定义，不与详情共享 scrollTop。
 * 关闭只是阅读意图，和下载队列里的删除任务按钮有不同语义。
 * 空态按钮仍有 close 辅助名称，不能通过是否有选中对象来禁用。
 * onClose 不接收模型 ID，因为它关闭的是区域，清理选择由拥有选择状态的父级做。
 * 父级应同时清除当前阅读对象，防止缩窗后旧对象又自动打开弹窗。
 * ResourceDialogShell 接管 Escape 和弹窗焦点，本组件不再安装第二个键盘监听。
 * 宽屏按钮通过原生 click 发出同一个关闭回调，两种外观不会走不同清理分支。
 * compactLeft 是真实 main 左边缘，导航宽度变化后不需要维护额外偏移常量。
 * 测量值只影响窄屏资源宿主，不把左侧应用导航也纳入详情遮罩。
 * 媒体查询在客户端水合后读取，静态导出阶段不会访问 window。
 * 公共宿主没有扫描订阅，因此用在在线页面时不会额外扫描用户硬盘。
 * 测试数据属性区分公共外壳与业务详情，不能按正文里有没有“详情”二字定位。
 * 同一个页面只能给一份当前 details，不把多个模型的详情数组塞进第三列。
 * 工具栏不归宿主管理，在线搜索提交与本地即时过滤可以维持各自节奏。
 * 修改列宽时应同时验证空态关闭与有内容关闭，后者通过不代表前者也可关闭。
 * 关闭时详情轨道连同旁边间隔归零，中心列接收让出的全部空间。
 * 新的库来源接入时先适配这三个插槽，不复制第二份工作区 CSS。
 * 左栏收起与官方分类分组的上下收起是两层独立操作。
 * 左栏恢复后，内部两个分类组仍保持各自原先的展开状态。
 * 左侧面板与间隔完全收起，恢复入口固定在中心模型区底部，不额外占一列。
 * 底部唯一按钮用双箭头表达方向，展开为向左收起、收起后为向右展开。
 * 图标与标题的鼠标提示使用既有双语导航词条，业务内容不随界面语言更改。
 * 当前开合不持久化，下次重新进入模型库仍从完整分类面板开始。
 * 同一会话中普通组件重渲染不会重置 useState，搜索或扫描完成不应自动展开左栏。
 * 左栏插槽始终挂载，因此本地目录树无需通过额外全局状态保存自己的开合记录。
 * 这与右栏的生命周期不同：右栏关闭后原调用方继续清除选中对象。
 * 不能为了动画保留已选对象，否则切到窄屏时旧详情可能再次弹出。
 * 空轨道只保留阅读外框，不继续读取已关闭模型的来源 JSON。
 * inert 作用在分类面板，恢复按钮留在中心模型区，不能把恢复入口也禁用掉。
 * 屏幕阅读器的隐藏状态与 inert 同时更新，避免读到不可操作的旧内容。
 * 关闭 X 后焦点转移仅发生于宽屏按钮，窄屏弹窗仍走资源外壳自己的焦点返回。
 * 动画期间中心卡片保持原身份，不能把布局伸缩误当作重新请求或重新扫描。
 * 真实宽度仍由父 main 提供，应用 nav 开合时本宿主自然重新分配剩余空间。
 * 不按窗口截图坐标写固定左偏移，避免有标题栏与无标题栏两种环境错位。
 * 窄屏详情弹窗保持原实现，新增伸缩只调整宽屏网格的轨道数值。
 * 同样的布局在在线入口只接收查询结果，不增加本地扫描器依赖。
 * CSS 动画可以在任意中间宽度反向，组件没有需要手动取消的动画 Promise。
 * 因此卸载时也没有排队的定时器会再修改旧页面的展开状态。
 * 根节点只声明 grid-template-columns 参与过渡，卡片边框和主题颜色不被拉进动画。
 * 左栏透明度属于内容可见性辅助，实际腾出的宽度必须来自根网格布局。
 * 右栏外框宽度为零时隐藏视觉，避免其一像素边框残留到中间卡片上。
 * 右栏重新打开时根据同一 visible 值恢复，不额外维护一个可能不同步的 shown 状态。
 */
interface WorkspaceProps {
  sidebar: ReactNode; children: ReactNode; details: ReactNode; footer: ReactNode; visible: boolean;
  hasSelection: boolean; onClose: () => void; local?: boolean;
}
export function ModelLibraryWorkspace({ sidebar, children, details, footer, visible, hasSelection, onClose, local = false }: WorkspaceProps) {
  const { t } = useTranslation(), wide = useMediaQuery("(min-width: 1280px)");
  const compactLeft = useAppMainInset();
  // 左栏的开合属于当前工作区，与窗口 nav 的 Zustand 状态互不影响。
  // 内容保留挂载，就像合上资料夹不会打乱里面已经翻到的目录页。
  // 隐藏后加 inert，避免 Tab 走进已经看不见的文件夹或扫描按钮。
  // 收起按钮留在中心底部，左栏完全隐藏时鼠标和键盘仍可恢复展开。
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const catalogRef = useRef<HTMLElement>(null);
  const sidebarLabel = t(sidebarExpanded ? "nav.sidebar.collapse" : "nav.sidebar.expand");
  // X 关闭后焦点先交给中心模型区，避免落在已经 inert 的关闭按钮上。
  // preventScroll 保持用户浏览位置，不因焦点迁移把卡片滚回开头。
  // 数据清理由原调用方的 onClose 完成，宿主不取消下载或改写筛选条件。
  const closeDetails = () => {
    catalogRef.current?.focus({ preventScroll: true });
    onClose();
  };
  return <section data-model-library-workspace data-local-model-library={local || undefined} data-civitai-page={!local || undefined} data-details-visible={visible} data-model-sidebar-expanded={sidebarExpanded} className={`${styles.workspace} transition-[grid-template-columns] ${PANEL_RESIZE_MOTION}`}>
    {/* 模型工作区：左栏、间隔、中心、间隔、右栏保持同样五条轨道，零宽轨道也不删除。 */}
    {/* 轨道就像可推拉的书架隔板，中间格随着左右占用变化连续伸缩，避免突然跳到终点。 */}
    {/* 分类面板：原库切换仍在第一行，移除额外标题与右上角收起按钮。 */}
    {/* 两个来源使用同一个底部开合入口，不在侧栏再放第二颗重复按钮。 */}
    <div className={styles.sidebar} data-model-library-sidebar inert={!sidebarExpanded} aria-hidden={!sidebarExpanded}>
      {/* 左栏内容：固定展开宽度再裁切，防止动画途中目录和底部操作反复换行。 */}
      {/* 隐藏只改变可见性与键盘可达性，不清空已经选中的分类或文件夹。 */}
      {/* 透明度也使用 nav 的同一节奏，恢复展开时不会突然闪出整块内容。 */}
      <div className={`${styles.sidebarContent} transition-opacity ${PANEL_RESIZE_MOTION}`} inert={!sidebarExpanded} aria-hidden={!sidebarExpanded} style={{ opacity: sidebarExpanded ? 1 : 0 }}>{sidebar}</div>
    </div>
    {/* 中心模型区：不更换 key、不复制列表，伸缩期间仍是同一份卡片与滚动容器。 */}
    {/* 底栏由宿主统一维护：左边唯一开合按钮，右边注入实际模型数量与来源状态。 */}
    {/* 状态内容保留 role=status，整个底栏不作为 live 区，避免开合按钮触发多余朗读。 */}
    <section ref={catalogRef} tabIndex={-1} className={styles.catalog} data-model-library-catalog data-local-model-catalog={local || undefined}>
      {children}
      <footer className={styles.catalogFooter} data-model-library-footer>
        <button type="button" data-model-sidebar-toggle aria-label={sidebarLabel} title={sidebarLabel} aria-expanded={sidebarExpanded} onClick={() => setSidebarExpanded(value => !value)} className={styles.sidebarToggle}>{sidebarExpanded ? <ChevronsLeft size={15} aria-hidden="true" /> : <ChevronsRight size={15} aria-hidden="true" />}</button>
        <span role="status" className="min-w-0 truncate text-right">{footer}</span>
      </footer>
    </section>
    {/* 详情轨道：外框保留，关闭时轨道宽度归零，浏览器才有连续可插值的起点与终点。 */}
    {/* 业务详情仍在关闭时卸载，避免把这一动画扩展成永久保活所有资料页。 */}
    {/* 隐藏外框既 inert 又 aria-hidden，已经离开的 X 和旧字段不占键盘顺序。 */}
    {/* data-model-library-details 只标可见详情，沿用调用方与现有回归的显隐语义。 */}
    <aside className={styles.details} data-local-details-panel={local && visible || undefined} data-model-library-details={visible || undefined} inert={!visible} aria-hidden={!visible}>
      <header><h2>{t("toolBox.civitai.details")}</h2><button type="button" data-model-details-close aria-label={t("common.close")} onClick={closeDetails}><X size={16} /></button></header>
      <div className={styles.detailsScroll}>{visible && wide && details}</div>
    </aside>
    {/* 窄屏资料：按真实 main 边界显示，关闭只影响当前阅读对象。 */}
    {/* 宽屏和弹窗采用同一个内容插槽，不能同时挂载两套模型下载表单。 */}
    {!wide && visible && hasSelection && <ResourceDialogShell open compactLeft={compactLeft} title={t("toolBox.civitai.details")} titleId={local ? "local-model-details-title" : "civitai-details-title"} onOpenChange={open => { if (!open) onClose(); }} bodyPadded={false} bodyScroll={local}>{details}</ResourceDialogShell>}
  </section>;
}
