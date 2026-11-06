"use client";

/**
 * 资料库唯一卡片表面：角色、画师、动作、背景和表情通过参数映射使用。
 * 主题只认 background/muted/border 与强调色变量，不按库复制颜色。
 * 预览、标题、分类徽标和右侧指标共享同一DOM层级与4:5几何。
 * 业务包装器负责把源资料转换为这些展示字段，不在卡片内识别库类型。
 */
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Check, Heart, Info } from "lucide-react";
import { useTranslation } from "@/i18n";
import { cn } from "@/utils/cn";
import { ACCENT_SELECTED_OUTLINE_CLASS, PRIMARY_BUTTON_CLASS } from "@/utils/layout";
import { LibraryTextItem } from "./library-text-item";
import type { LibraryDisplayMode } from "./library-display-switch";

/**
 * prefix/id只生成既有测试入口，避免调用方依赖显示名定位。
 * title为卡片主标题，subtitle仅供需要双语名称的资料使用。
 * badge和metric是展示节点，数据计数或Tag数量不由组件猜测。
 * onSelect只负责选择，详情与收藏分别是独立按钮而非嵌套按钮。
 * 未提供收藏或详情回调时不显示相应入口，不能渲染无效按钮。
 * selected与favorite均受控，不保留第二份业务选择状态。
 * preview只接受应用已有的资源地址，不在此请求资料服务。
 * 图片读取失败时回退无预览，不会因此移除可选的本地记录。
 */
export interface LibraryCardProps {
  // 素材气泡需要完整轮廓，人物封面继续默认裁切填充，差异显式通过参数表达。
  // contain不会改变共同卡片的4:5几何，也不会隐藏素材名称与选择行为。
  // 不按prefix猜业务类型，同一张卡片在不同资料库中都能选择适合的图片呈现。
  previewFit?: "cover" | "contain";
  // 布局差异用参数注入，角色和普通资料都走同一个文字表面。
  // text 是纯文字触发词预览，不能以 React 节点替代实际生成提示词。
  displayMode?: LibraryDisplayMode;
  text?: string;
  colorKey?: string;
  prefix: string; id: string; title: string; subtitle?: string; preview: string;
  badge: ReactNode; metric?: ReactNode; selected: boolean; favorite?: boolean;
  onSelect: () => void; onDetail?: () => void; onFavorite?: () => void;
}

/**
 * 错误地址与当前preview比较，切换资源后允许新地址正常加载。
 * 不启动无限重试或占用加载队列，离线状态仍可查看名称与选择。
 * 三个操作都有可访问名称，原生button提供键盘支持。
 * article上的selected标记与描边读取同一个参数。
 * 角标绝对定位，不改变图片比例和底部文字高度。
 * 同一资料的不同展示包装器不会产生不同的主题切换行为。
 * Next静态导出使用现有unoptimized配置，不依赖图片优化服务器。
 * 指标区域允许收缩和截断，长Tags不再把分类与卡片撑宽。
 * title保留完整文本，可核对被视觉截断的名称。
 * 收藏操作不会触发onSelect，避免收藏时顺便改变生成提示词草稿。
 * 详情操作同理；业务层继续负责弹窗或插入提示词。
 * 数据值作为React属性与文本传入，不解释为HTML。
 */
/**
 * 预览失败状态只记录失败地址，不把网络错误写回源资料。
 * 当同一组件收到不同preview时旧失败地址不会屏蔽新资源。
 * 无图片与图片失败共用同一可访问文本，卡片身份始终可见。
 * 选择的aria名称复用原角色词条，画师和动作只替换其中的name。
 * 底部subtitle为可选字段，未提供时不生成一行空文本占高度。
 * 徽标宽度最多65%，其余空间交给可收缩指标，避免长标签溢出。
 * 未知作品回退由角色适配器完成，共用组件不会把背景误标为作品。
 * metric可以是热度图标或普通文字，不定义缺乏来源的统一评分。
 * favorite缺省false仅用于视觉状态，未传回调时整个收藏入口省略。
 * onDetail存在才显示信息按钮，静态库不产生不能打开的空详情。
 * 支持收藏的卡片保留原data-character-favorite等动态前缀属性。
 * 选中角标的data属性保留布尔存在语义，与原冒烟入口一致。
 * 主图按钮与角标为兄弟节点，不产生HTML禁止的嵌套交互控件。
 * 点击信息按钮不会冒泡到主图按钮，因为两者不在同一按钮树下。
 * 图片对齐使用object-cover，比例完全由共同的aspect容器控制。
 * 不设置卡片固定像素宽度，列数继续由父级网格和窗口宽度决定。
 * h-full只填满网格行，不会强行把modal高度传给每张卡片。
 * 图片alt来自实际主标题，不复用上一页的名称或远端文件名。
 * 主题颜色不写到style属性，保留CSS变量在主题切换时的实时能力。
 * 强调色类来自创建页已有常量，卡片选中描边跟随用户外观方案。
 * 初始无图也可以直接选择，本地角色不应因为没有封面失去应用能力。
 * 图片的onError只更新本卡片，不触发整库重新请求或改变分页。
 * 组件没有全局事件监听，切页卸载后不留下滚轮或键盘订阅。
 * 共享data-library-card标记使多库回归可验证确实使用了这一表面。
 * id只用于属性值，不拼成选择器字符串或执行脚本。
 * 回调参数由包装器闭包保存完整源对象，卡片无需重新查找资料。
 * source对象本身没有传入，避免共用层随新库继续膨胀业务分支。
 * 预览的sizes沿用角色卡各断点值，静态导出不引入额外图片服务。
 * 标签类文字以ReactNode渲染，不使用dangerouslySetInnerHTML。
 * 选中与未选中使用相同border厚度，改变选择不会移动相邻卡片。
 */
export function LibraryCard(props: LibraryCardProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState("");
  const { prefix, id, title, subtitle, preview, badge, metric, selected, favorite, onSelect, onDetail, onFavorite } = props;
  // 钩子仍在条件分支之前执行，切换展示模式不会改变 Hook 的调用次序。
  // 仅文本分支不渲染 Image，真实选择回调继续来自同一份源记录。
  if (props.displayMode === "text") return <LibraryTextItem {...props} />;
  return <article data-library-card {...{ [`data-${prefix}-card`]: id, [`data-${prefix}-selected`]: String(selected) }} className={cn("group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-background shadow-sm transition-shadow hover:shadow-md", selected ? ACCENT_SELECTED_OUTLINE_CLASS : "border-border")}>
    {/* 界面：统一4:5预览，缺图和加载失败都保留可选择的卡片。 */}
    <button type="button" onClick={onSelect} aria-label={t("characters.card.select", { name: title })} aria-pressed={selected} className="relative block aspect-[4/5] w-full overflow-hidden bg-muted">
      {preview && failed !== preview ? <Image key={preview} src={preview} alt={title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" onError={() => setFailed(preview)} className={cn(props.previewFit === "contain" ? "object-contain" : "object-cover", "transition-transform duration-300 group-hover:scale-[1.03]")} /> : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">{t("characters.card.noPreview")}</span>}
    </button>
    {/* 界面：名称、可选双语副标题、分类与指标沿用角色卡的排布。 */}
    {/* 分割线与正文底色均使用主题变量，暗色切换不再残留白色块。 */}
    <div className="h-px w-full bg-border" />
    <div className="flex flex-1 flex-col gap-2 px-3 py-2.5"><h3 title={title} className="truncate text-sm font-semibold text-foreground">{title}</h3>{subtitle && <p title={subtitle} className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}<div className="flex items-end justify-between gap-2"><span className="max-w-[65%] truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{badge}</span><span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">{metric}</span></div></div>
    {/* 界面：收藏是独立的角标；只有实际支持收藏的库传入操作。 */}
    {/* 收藏状态不根据颜色反推，aria-pressed和图标填充共用favorite。 */}
    {onFavorite && <button type="button" {...{ [`data-${prefix}-favorite`]: id }} aria-pressed={!!favorite} aria-label={t(favorite ? "characters.card.unfavorite" : "characters.card.favorite", { name: title })} onClick={onFavorite} className="absolute right-2 top-2 rounded-full bg-background/85 p-1.5 shadow-sm backdrop-blur hover:bg-background"><Heart className={cn("h-4 w-4", favorite ? "fill-accent-fill text-accent-fill" : "text-muted-foreground group-hover:text-foreground")} /></button>}
    {/* 左上角保留角色卡的选择标记与详情入口，缺少详情不会留下空按钮。 */}
    {/* 角标只覆盖图片的一角，不截获主图其余区域的选择点击。 */}
    <div className="absolute left-2 top-2 flex items-center gap-1">{selected && <span {...{ [`data-${prefix}-checked`]: true }} className={cn("flex h-5 w-5 items-center justify-center rounded-full shadow", PRIMARY_BUTTON_CLASS)}><Check className="h-3.5 w-3.5" /></span>}{onDetail && <button type="button" {...{ [`data-${prefix}-detail`]: id }} aria-label={t("characters.card.viewDetail", { name: title })} onClick={onDetail} className="rounded-full bg-background/85 p-1.5 text-muted-foreground shadow-sm backdrop-blur hover:bg-background hover:text-foreground"><Info className="h-4 w-4" /></button>}</div>
  </article>;
}
