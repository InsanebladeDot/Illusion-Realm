"use client";

/**
 * 界面：紧凑蒙版工具条，所有操作带可访问名称和选中状态。
 * 图标来自既有 lucide 库，离线或更换主题不会丢失工具标识。
 */
import { Undo2, Redo2, Contrast, Trash2, RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2, Check, X, Upload, Download } from 'lucide-react';
import { useMaskWorkspaceStore } from '@/stores/use-mask-workspace-store';
import { useTranslation } from '@/i18n';
import { exportMaskDocument } from '@/utils/mask-document';
import { downloadMaskImage } from '@/utils/mask-image';
import { cn } from '@/utils/cn';
// 主要工具移至左栏，顶部只保留真实图像操作和共享选区动作。
// 单张位图没有多对象对齐语义，不提供截图中尚无实际作用的对齐入口。
// 镜像仍作用整张图，反向选择在独立操作组表达。
import { MaskSelectionActions } from './mask-selection-actions';

// 工具名称与像素处理动作一一对应，不以按钮文案推断业务分支。
// 擦除使用当前层，画笔和蒙版笔则自动选择自己的目标层。
// 平移是视图操作，与画布绘制互斥，避免拖动画布同时留下笔迹。
// 保存建立检查点，取消恢复检查点；两者不等于下载或生成。
// clear 仅清当前层，invert 仅翻转 mask，几何变换同步所有层。
// 无撤销记录时禁用按钮，不用无效点击让用户猜测发生了什么。
const ACTIONS = [{ name: 'undo', Icon: Undo2 }, { name: 'redo', Icon: Redo2 }, { name: 'invert', Icon: Contrast }, { name: 'clear', Icon: Trash2 }, { name: 'rotateLeft', Icon: RotateCcw }, { name: 'rotate', Icon: RotateCw }, { name: 'flipX', Icon: FlipHorizontal2 }, { name: 'flipY', Icon: FlipVertical2 }, { name: 'save', Icon: Check }, { name: 'cancel', Icon: X }] as const;

/**
 * 外部任务锁与文档忙碌合并，生成输入准备时工具不能继续改同一张图。
 * 工具条允许换行，窄屏不靠水平溢出隐藏最后几个操作。
 * 当前工具通过 aria-pressed 表达，键盘和辅助技术能读取选中状态。
 * 设置目标层时同步显示它，避免在隐藏层绘画看起来像没反应。
 * 按钮只调 store 动作，不复制 undo/redo 或像素变换实现。
 */
// 导入入口始终可见，无文档时仍能开始单张素材编辑。
// 文件选择不设置multiple，新图片替换当前文档而非叠加第二份素材。
// 导入后清input值，同一个文件修改后可以再次选择。
// 工具名为类型union，图标和词条通过稳定键绑定，不能根据中文文本分派。
// 工具分组只负责视觉组织，不建立第二套画笔状态。
// 颜色选择固定进入mask层，RGB画笔固定进入painted，擦除沿用当前层。
// 切工具回到painting通道，避免仍停在只读预览却以为正在绘画。
// 旋转和镜像作用完整三层，不能只旋转stage的CSS。
// 动作按钮复用store入口，确认和取消与撤销栈共享一致语义。
// 单独导出使用当前通道键，用户查看mask时不会下载另一个合成图。
// 每次导出重新编码当前revision，旧Blob不作为新内容的下载源。
// 导出失败写可读错误，不能静默下载一张空PNG。
// 本地下载不上传、不验证服务端，也不创建公共生成任务。
// 所有内容工具原生禁用，任务锁定时不能从键盘绕过。
// 导入标签单独禁用，未有图片这一条件不会锁死唯一导入入口。
// 按钮允许换行，极窄窗口的最后几个工具仍可见。
export function MaskToolbar({ locked }: { locked: boolean }) {
  // fieldset 统一禁止任务期间的内容操作，停止按钮留在右侧生成栏。
  // 工具切换通过 store，画布事件会读取最新 tool，避免旧闭包继续使用前一工具。
  // undo/redo 单独检查历史长度，既有文档不等于存在可撤销步骤。
  // disabled 不仅改变外观，原生按钮也退出可点击路径。
  // title 用于紧凑图标悬浮提示，aria-label 用于键盘和读屏名称。
  // 当前模式用 aria-pressed，颜色不是唯一的状态信号。
  // 两个旋转按钮都按 90 度操作，保证原像素与蒙版边界可以精确对齐。
  // 逆时针实现内部虽有三次变换，但 store 只记录一条历史。
  // 保存图标仅建立编辑检查点，下载使用本工具条独立的导出按钮。
  // 取消图标不会关闭页面，恢复最近保存点后允许继续绘制。
  // 水平和垂直镜像使用明确名称，避免仅凭类似图标猜测方向。
  // clearCanvas 保留旧测试属性名称，但业务动作仍清当前编辑层。
  const state = useMaskWorkspaceStore(), { t } = useTranslation();
  const button = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30';
  return <div data-mask-toolbar className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-background/80 p-1.5">
    {/* 顶部：历史、蒙版反转与整图镜像；不重复绘制工具。 */}
    {/* 选区变换与像素同时提交，避免仅翻图不翻虚线。 */}
    {/* 当前位图不存在多对象对齐能力，不用无效按钮占位。 */}
    <fieldset disabled={locked || state.busy || !state.doc} aria-label={t('create.maskStudio.historyGroup')} className="flex flex-wrap items-center gap-0.5">
    {/* 工具组与文档操作间的短分隔线只用于视觉分组，不充当布局边框。 */}
    {/* flex-wrap 保留所有操作，窄屏不会将后半工具裁掉或隐藏。 */}
    {/* 没有导入时整组禁用，但按钮依旧存在，用户知道编辑器提供哪些能力。 */}
    {/* 文档回滚统一在 store 中完成，按钮不自行操作 Canvas。 */}
    {/* 界面：文档级操作使用同一个历史栈。 */}
    {ACTIONS.map(({ name, Icon }) => <button key={name} type="button" data-mask-action={name === 'clear' ? 'clearCanvas' : name} title={t(`create.maskStudio.${name}`)} aria-label={t(`create.maskStudio.${name}`)} disabled={name === 'undo' ? !state.doc?.past.length : name === 'redo' ? !state.doc?.future.length : false} onClick={() => state.action(name)} className={button}><Icon className="h-3.5 w-3.5" /></button>)}
    </fieldset>
    {/* 顶部共享选区操作：触屏和无右键用户使用同等入口。 */}
    {/* 菜单与此处共用 store 动作，没有另一套 Delete 实现。 */}
    {/* 几何手势尚未闭合时操作组不可提交。 */}
    <MaskSelectionActions locked={locked} />
    {/* 界面：导入旁统一导出当前通道，卡片不再各自附带下载按钮。 */}
    {/* 每次点击重新编码当前文档，不能下载上一笔之前的旧结果。 */}
    {/* Blob 仍交给既有下载器管理 URL，下载失败通过本地错误提示。 */}
    {/* ml-auto 将导出与后续导入靠右组成一组，窄屏允许自然换行。 */}
    {/* 生成仍使用内部 composite，不会因当前观察黑白蒙版而换错输入。 */}
    {/* 无文档时导出禁用，导入保持可用；不增加第二个文件选择器。 */}
    <button type="button" data-mask-export disabled={locked || state.busy || !state.doc} className={cn(button, 'ml-auto')} title={t('create.maskStudio.exportCurrent')} aria-label={t('create.maskStudio.exportCurrent')} onClick={() => { try { if (!state.doc) return; const exports = exportMaskDocument(state.doc); state.patch({ exports }); downloadMaskImage(exports[state.channel], 'mask_' + state.channel + '.png'); } catch { state.patch({ error: t('create.maskEditor.exportFailed') }); } }}><Download className="h-4 w-4" />{t('create.maskStudio.exportCurrent')}</button>
    {/* 界面：导入始终位于工具条末端，空文档时仍可选择单张图片。 */}
    {/* input 不设置 multiple，选图后清值允许重新导入同一个文件。 */}
    {/* 导入与文档操作分开禁用，不能因尚无图片而锁死唯一入口。 */}
    <label className={cn(button, 'shrink-0 border border-border', locked || state.busy ? 'pointer-events-none opacity-40' : 'cursor-pointer')}><Upload className="h-4 w-4" />{t('create.maskEditor.import')}<input data-mask-import type="file" className="hidden" accept="image/png,image/jpeg,image/webp" disabled={locked || state.busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void state.importFile(file); }} /></label>
  </div>;
}
