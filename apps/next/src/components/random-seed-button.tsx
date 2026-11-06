"use client";
/**
 * 生成按钮右侧共用的骰子入口，只切换随机模式，不提交生成任务。
 * 值在每次实际提交时产生，点击反馈来自真实受控 seedMode。
 * 文字编辑、蒙版、边缘和普通图片共用相同主题及可访问状态。
 */
import { Dices } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { cn } from '@/utils/cn';

// 外部传入模式和动作，不将某个页面的 store 隐藏耦合进按钮。
// busy 时禁用，防止任务开始以后误以为改了当前运行种子。
// aria-pressed 表达随机模式是否启用，悬浮提示由现有词条提供。
// type=button 防止处于 form 内时默认触发 submit。
// 按钮宽高一致，固定窄宽度与渐变主按钮形成参考图的并列布局。
// 固定 SVG 离线可用，主题变化不会依赖图标字体重新加载。
// 已是随机模式时点击仍保持随机，不暗中切回旧的自定义数值。
// UI 不显示本次随机值，因为它尚未在提交边界产生。
// 回调由宿主决定写入哪个领域store，本组件不导入图片或编辑store。
// 启用状态由真实参数回传，不能在按钮内部自行猜测已经开启。
// 控件只表示模式，不显示或缓存某次任务的实际随机值。
// 外部disabled包含导入与生成阶段，禁用时原生button不会触发回调。
// 图标为固定SVG，离线环境和主题切换都无需重新请求字体资源。
// 固定44px目标与主生成按钮同高，不能因为短标签而缩成难以点击的小点。
// 选中时的细边和颜色只作为辅助，读屏仍能通过aria-pressed识别。
// 使用title和aria-label提供相同动作名称，不把骰子图案当作唯一说明。
export function RandomSeedButton({ random, disabled = false, onEnable }: { random: boolean; disabled?: boolean; onEnable: () => void }) {
  const { t } = useTranslation(), label = t('create.animaEdit.randomSeed');
  return <button type="button" data-random-seed aria-label={label} title={label} aria-pressed={random} disabled={disabled} onClick={onEnable} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40', random && 'border-primary/40 text-accent-text')}><Dices className="h-5 w-5" /></button>;
}
