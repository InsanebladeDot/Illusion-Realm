"use client";

import { RandomSeedButton } from "@/components/random-seed-button";
import { useCreateFormStore } from "@/stores/useCreateFormStore";
import { useState } from "react";
import { DEFAULT_IMAGE_COUNT } from "@/data/createForm";
import { useTranslation } from "@/i18n";
import { ImageCountDropdown } from "@/view/create/ImageCountDropdown";
import { cn } from "@/utils/cn";
import { Sparkles } from "lucide-react";

type GenerateFooterProps = {
  generating?: boolean;
  onGenerate?: (imageCount: number) => void;
  // 受控种子用于音频等模式，省略时保持图片 store 原有行为。
  // 模式隔离在回调边界，音频点击骰子不能修改图片的随机开关。
  // 数量控件沿用同一实现，quantityLabel 仅更换读屏所用的媒介名称。
  seedControl?: { random: boolean; onEnable: () => void };
  quantityLabel?: string;
};

/**
 * rail：底部生成控件由主操作和数量选择两块组成，共用连续渐变与圆角。
 * 两块是兄弟按钮，避免把下拉菜单嵌进生成按钮后误触任务提交。
 * 数量状态仍由本组件持有，默认值与可选范围继续使用原来的配置。
 * onGenerate 只从左侧按钮触发，并读取点击当时的 imageCount。
 * 打开、选择或关闭右侧菜单都不会调用 onGenerate。
 * 正在生成时沿用“添加到队列”，不因本次样式改动禁用排队入口。
 * 渐变放到共同容器而非两个按钮，分隔线两侧不会出现颜色断层。
 * 保留 create-generate-button 主题类，既有自选配色仍控制整个按钮组。
 * 左侧保留 data-generate-button，快捷操作与原有生成回归无需改变入口。
 * group 用当前操作文案命名，两个子按钮各有独立可访问名称与焦点。
 * 图标为装饰，实际操作名由 i18n 提供，读屏不会重复朗读星形图标。
 * 长排队文案允许截断，title 保留全文，数量入口始终保留可用宽度。
 * 外容器不裁剪溢出，右侧菜单向上展开时不被按钮圆角切掉。
 * 阴影、明亮悬停与圆角由组统一提供，子按钮只负责自身点击反馈。
 * 数量下拉仍复用 ImageCountDropdown，选项和传参没有复制到另一处。
 * footer 的移动安全区与原有 padding 继续保留，不改变创建栏高度计算。
 * 取消旧的横向独立数量胶囊，两块控件在任意宽度下保持同一行。
 * 原有模式切换仍由父页面决定挂载，本组件不持久化另一份生成参数。
 * 提交回调由宿主处理验证、排队和错误反馈，展示层不直连主进程。
 */
// 图片默认骰子写 useCreateFormStore；音频等宿主可提供自己 store 的受控入口。
// 点击骰子不调用onGenerate，数量菜单选择也不触发推理。
// 随机值由宿主提交逻辑采样，本展示组件不提前消耗一次随机数。
// 并列小按钮固定宽度，主生成按钮使用剩余空间并保留数量分隔区。
// 多次开启保持random，不把第二次点击解释为切回自定义。
// 种子模式与生成数量独立，开启随机不会重置用户当前批次数量。
// 公共队列允许添加任务，骰子仅影响后续提交不会修改已冻结任务。
// 按键焦点由原生button处理，不依赖点击区域上的伪元素。
// 主题配色沿用主按钮已有类，小骰子复用公共主题token。
// 文案长时截断主操作文字，图标按钮仍保留可见和可点击尺寸。
// 普通图片与编辑共享同一个骰子组件，反馈语义和aria-pressed保持一致。
// 一份视觉实现服务图片与音频：主按钮、数量菜单、骰子均不再复制。
// seedControl 同时提供当前值和写入口，不能只换显示而仍写回图片 store。
// 无新 props 的所有调用保持原默认值，避免修改普通图片生成行为。
export function GenerateFooter({ generating = false, onGenerate, seedControl, quantityLabel }: GenerateFooterProps) {
  const { t } = useTranslation();
  const seedMode = useCreateFormStore(state => state.seedMode), setAdvancedSettings = useCreateFormStore(state => state.setAdvancedSettings);
  const [imageCount, setImageCount] = useState(DEFAULT_IMAGE_COUNT);
  const label = generating ? t("create.generationTasks.add") : t("create.generateButton.label");
  return <div className={cn("create-generate-footer z-20 flex shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-3 sm:px-4", "max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]")}>
    {/* 界面：「图标 生成 | × N」共用渐变，左右按钮分别处理提交与数量选择。 */}
    <div data-generate-control role="group" aria-label={label} className="create-generate-button flex flex-1 min-w-0 items-stretch rounded-xl text-white shadow-sm transition-[filter] hover:brightness-110">
      <button type="button" data-generate-button title={label} onClick={() => onGenerate?.(imageCount)} className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-l-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white active:scale-[0.99]">
        <Sparkles className="h-6 w-6 shrink-0" aria-hidden /><span className="truncate">{label}</span>
      </button>
      {/* 数量菜单仍真实回传 N，音频宿主也必须消费该值而非只改变外观。 */}
      {/* quantityLabel 是可选可访问名称，不影响数量范围或菜单定位。 */}
      {/* 不在这个展示组件中提交批量任务，执行和快照留给宿主。 */}
      <ImageCountDropdown value={imageCount} onChange={setImageCount} quantityLabel={quantityLabel} />
    </div>
    {/* 界面：骰子开启当前宿主随机模式，数量和排队仍由主按钮处理。 */}
    {/* aria-pressed 反馈真实状态，重复点击不会切回自定义。 */}
    {/* 共用编辑页的按钮组件，主题样式和禁用反馈不再分别维护。 */}
    {/* 音频受控值优先；图片保留原来 store 中的随机模式和写入口。 */}
    {/* 回调不会生成任务，也不提前采样下一次随机数。 */}
    {/* 单独点击骰子与生成按钮在两种模式下都保持相同的交互语义。 */}
    <RandomSeedButton random={seedControl?.random ?? seedMode === 'random'} onEnable={seedControl?.onEnable ?? (() => setAdvancedSettings({ seedMode: 'random' }))} />
  </div>;
}
