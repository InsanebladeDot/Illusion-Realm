"use client";

/**
 * 界面：画布下方正向提示词，普通输入与高级分类共用原有组件。
 * 高级开关通知父容器把右侧参数替换为原组装面板，不在下方追加内容。
 * 收起只隐藏内容，画布接收释放的高度；草稿和生成任务不随之销毁。
 * 布局顺序只有标题和正文，右侧在参数与分类两种视图之间切换。
 * 此组件不渲染第二个负面预设入口，防止用户误把分类视为负向设置。
 * 普通正文和高级结果使用同一个受控值，切换模式无需复制输入节点内容。
 * 不使用原图片页面的 prompt-editor id，两个工作区可以同时挂载。
 * 仅折叠状态保存在组件内；路由返回后重新展开，但文本草稿仍存在。
 * 模型和 LoRA 草稿不属于本组件，右侧切回参数时由原领域状态恢复。
 * 原组装面板负责弹窗呈现断点，本组件不复制另一套视口逻辑。
 * 短视口点击高级由父容器切至参数栏，避免新增整个下方工具区。
 * 下方高度只取决于正文折叠状态，高级开关不会减少画布空间。
 * 不在界面上提供“确认组装”，每次分类修改立即成为当前生成正文。
 */
import { useState } from 'react';
import { useTranslation } from '@/i18n';
import type { AnimaEditState } from '@/hooks/use-anima-edit';
import { useMaskPromptStore } from '@/stores/use-mask-prompt-store';
import { PromptInput } from '@/components/prompt-input';
import { CollapsiblePanel } from '@/components/CollapsiblePanel';
import { PromptCollapseButton } from '@/view/create/PromptCollapseButton';

// 父组件传入当前蒙版会话，正文始终对应 settings.instruction。
// 右侧 negative 由原负向组件负责，两者不交换字段或迁移已有文本。
// locked 同时覆盖画布导入和公共任务，contentEditable 不依赖 fieldset 禁用。
// 普通输入保留助手与限长，高级分类助手由原组装面板各自提供。
// 指令长度按字符数显示，不将其解释为模型 token 或推理预算。
// 高级开关恢复本工具分类，不读图片页面的高级模式偏好。
// 开关由常驻 store 保存，返回页面不会出现标签开着而分类丢失的状态。
export function MaskPositivePrompt({ editor, locked, onAdvancedChange }: { editor: AnimaEditState; locked: boolean; onAdvancedChange: (enabled: boolean) => void }) {
  const { t } = useTranslation(), [collapsed, setCollapsed] = useState(false), advanced = useMaskPromptStore(state => state.advanced);
  // 在两个模式下正文都保留同一 id，助手撤销与标签关联保持稳定。
  // 高级模式主输入只读并隐藏重复助手，实际修改在分类编辑器完成。
  // 三千字符约束同时在高级草稿入口执行，避免预览和提交被不同步截断。
  // 固定 72px 输入高度不随长文增长，保持已有画布与提示词的高度契约。
  // 组装在右侧独立滚动，开关只改变此处正文是否允许手动输入。
  // 父 fieldset 处理原生按钮，显式 locked 继续约束输入和 Portal 回写。
  // 关闭组装面板等价于关闭高级，当前拼接文本保留供继续手动修改。
  // 合并结果由 store 同步写入 instruction，点击生成无需等待动画完成。
  return <div data-mask-positive className="min-w-0 space-y-1.5">
    {/* 界面：正向标题、独立高级开关、字数和原有折叠按钮。 */}
    {/* 开关不使用图片页固定 id，多个工具常驻时不会出现重复关联。 */}
    {/* 操作期间禁止切换输入模式，已有任务始终使用冻结的参数。 */}
    <div className="flex flex-wrap items-center gap-2"><label htmlFor="mask-positive" className="text-sm font-medium">{t('create.maskStudio.positivePrompt')}</label><button data-mask-advanced type="button" role="switch" aria-checked={advanced} disabled={locked} onClick={() => onAdvancedChange(!advanced)} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground aria-checked:bg-accent aria-checked:text-accent-foreground disabled:opacity-40">{t('promptAssembly.editor.advanced')}</button><span className="ml-auto text-[11px] text-muted-foreground">{editor.settings.instruction.length} / 3000</span><PromptCollapseButton collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} label={t('create.maskStudio.positivePrompt')} /></div>
    {/* 折叠提示与正文分别使用既有过渡容器，不用固定占位伪装收起。 */}
    {/* 提示可点击恢复正文，收起期间 DOM 与当前草稿仍保留。 */}
    {/* 展开收起不改模型、图片、蒙版或正负提示词的实际值。 */}
    <CollapsiblePanel open={collapsed} durationMs={260}><button type="button" onClick={() => setCollapsed(false)} className="w-full rounded-lg bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground">{t('promptAssembly.editor.collapsedHint')}</button></CollapsiblePanel>
    {/* 界面：普通正向正文；高级结果也通过相同受控输入显示。 */}
    {/* 开启高级后正文只读，分类编辑入口由父容器放在右侧。 */}
    {/* 本区域不挂载组装面板，高级开启前后的画布可用高度一致。 */}
    {/* 组装关闭后保留合并正文，不把普通输入恢复成启用前的旧快照。 */}
    {/* 右侧分类 store 同步正文，标签库与 3D 不插入隐藏文生图输入。 */}
    {/* 显式 locked 禁用 contenteditable，不能只依靠父 fieldset 禁用。 */}
    <CollapsiblePanel open={!collapsed} stateAttribute="data-mask-positive-panel"><PromptInput id="mask-positive" data-anima-instruction value={editor.settings.instruction} onValueChange={instruction => editor.setSettings(previous => ({ ...previous, instruction }))} disabled={locked || advanced} assistant={!advanced} maxLength={3000} minHeight="min-h-[72px]" className="h-[72px]" data-placeholder={t('create.maskStudio.positivePlaceholder')} /></CollapsiblePanel>
  </div>;
}
