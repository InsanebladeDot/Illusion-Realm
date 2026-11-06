"use client";

// 本地权重与在线模型共享封面比例、标题和选中样式，资源读取仍由各自适配器负责。
// 卡片点击只报告查看或选择意图，不把下载和删除塞进公共展示组件。
import type { ReactNode } from "react";
import styles from "./local-model-library.module.css";

/**
 * Card 只接收展示需要的最小数据：
 * name 是当前卡片的标题，本地传精确文件名，在线传网站模型名。
 * 本地文件扩展名属于文件名的一部分，这里不会替用户截成无后缀标识。
 * subtitle 可选；不传时不会渲染副标题，也不预留空白。
 * overlay 注入来源特有资料，图片比例、叠层背景和点击动作仍由本组件统一。
 * 在线保留作者统计的第二行是来源资料差异，不要把它改成本地磁盘路径。
 * cover 是渲染组件插槽，本地 IPC 图片读取和在线来源图片限制不会混进公共层。
 * 封面失败或尚未读取时依旧占同一比例，不靠加载完成时再撑开卡片。
 * badges 只覆盖封面左上角，小标签不增加标题下面的行数。
 * 用户要求去掉的是重复格式行，官方模型类型角标仍用于区分权重用途。
 * selected 只决定边框视觉，不能从这个布尔值推断模型已经安装或可用于生成。
 * pressed 由业务明确传入，在线查看对象和本地多选不能被强行解释成同一操作。
 * 本地浏览态不声明多选 pressed，进入管理模式后才用它表达勾选。
 * onSelect 是打开或选择意图，公共层不主动调用任何扫描、删除或下载 API。
 * selectionControl 可放独立复选框，业务用同一受控 selected 保持同步。
 * 复选框放在主按钮后面，点击它不需要用 stopPropagation 修补按钮嵌套。
 * 整张封面与名称都是同一个主按钮，不再要求用户寻找第二个“查看详情”入口。
 * 图像 DOM 不在公共卡片再包一套图片加载器，避免改变原缓存与错误回退。
 * attributes 用于挂稳定的文件 ID 或网站 ID，网格排序不能拿数组下标代替身份。
 * 本地相对路径只属于业务数据，标题省略不能成为传给 ComfyUI 的模型参数。
 * 缺少 label 时以完整 name 作为辅助名称，不能只读出被 CSS 裁切的几个字符。
 * 标题和副标题分别有 title，鼠标悬停仍可核对完整名字或统计。
 * 样式从同一个模块读取，修改图片比例会同时作用到本地和在线入口。
 * 列表密度也复用这颗主按钮，不能出现网格能打开而列表点击没有反应。
 * 选中样式只修改既有边框颜色，不通过加宽边界让相邻卡片跳位。
 * 同名模型由外部 key 区分，公共层不会把名称当成文件唯一标识。
 * 此组件没有长期状态与订阅，卸载时无需取消网络或释放模型句柄。
 * 业务详情可以独立关闭，卡片渲染不应以详情是否挂载作为封面读取条件。
 * 如果新来源需要更多操作，应传入明确插槽或回调，不按标题关键词猜测业务。
 */
interface CardProps {
  // 列表摘要只接受已核实的基础模型、分类和体积；来源适配器决定哪些字段可用。
  // 公共层只负责两行排版，不根据文件名推断 LoRA 能否与某个主模型搭配。
  // 缺失项在适配器省略，不能用 0 B 冒充没有扫描过的文件大小。
  // 同一张卡片共用封面和点击回调，切换密度不会额外加载一份图片。
  // 网格保留来源资料叠层，列表使用明确的两行摘要，避免长介绍挤占高度。
  // listAttributes 的顺序由调用方固定为基础系列、官方分类、当前文件体积。
  // 名称仍使用 displayName；网站名称和本地文件名称不混成一个业务字段。
  // 该字段是纯文本，来源介绍中即使包含 HTML 也不会进入列表解释执行。
  // 它没有写入或缓存职责；资料补全后父级重渲染即可更新显示。
  // 未传该字段仍保留第二行位置，扫描期间不会让结果列表逐行跳动。
  // 列表完整文本保留在 small 的 title，省略号只影响视觉宽度。
  // name 继续承担模型身份的辅助说明，不从省略后的文本还原实际文件路径。
  // 资料名称按钮与图片按钮保持兄弟关系，避免嵌套按钮破坏键盘操作。
  // 屏幕上的基础系列是参考信息，真正生成前的兼容性校验仍归生成业务。
  // 单行截断适用于超长中文和英文文件名，不把连续英文单词挤到面板外。
  // 列表属性没有触发词复制动作；复制仍由详情里的独立标签负责。
  // 多选控件继续由 selectionControl 注入，不因为列表排版而重置 checked。
  listAttributes?: string;
  name: string; displayName?: string; subtitle?: string; cover: ReactNode; badges?: ReactNode; overlay?: ReactNode; selected: boolean;
  onSelect: () => void; label?: string; pressed?: boolean; selectionControl?: ReactNode;
  attributes: Record<`data-${string}`, string | number>;
}
// 文件类型后缀已在文件名里，移除重复格式行和额外的“查看详情”按钮。
// 本地卡片只显示文件名；在线可注入作者和统计，不为缺少副标题保留空行。
// 文件名单行截断，完整内容保留 title，长名字不会抬高某一张卡。
// checkbox 是主按钮的同级节点，不能嵌套到按钮内破坏键盘激活语义。
// 公共卡片不再接收图片画廊；两个来源的详情各自把图片交给已有共享预览。
// onSelect 仍只报告用户意图，由本地适配器决定浏览或批量勾选。
// 在线适配器继续按 model.id 选中资料，不在此处执行下载或任何网络请求。
// 收窄参数不会改变原封面比例或主题样式，网格与列表继续共享同一结构。
// 卡片内没有预览订阅后，预取与画廊索引由用户明确打开的详情负责。
export function ModelLibraryCard({ name, displayName = name, subtitle, cover, badges, overlay, listAttributes, selected, onSelect, label, pressed, selectionControl, attributes }: CardProps) {
  return <div className={`${styles.modelCard} ${selected ? styles.selectedCard : ""}`}>
    {/* 模型卡片：封面与资料文字都通知同一个选择回调，详情图片才负责放大。 */}
    {/* 本地和在线都遵守此规则，删除已无调用方的卡片预览参数与分支。 */}
    {/* 不在整个容器上监听冒泡点击，避免多选复选框的一次操作被执行两遍。 */}
    {/* 封面按钮与文字按钮并列，列表中的空白封面区域也能打开同一份资料。 */}
    {/* 图片自身的加载与错误回退仍在插槽内，不为选择模型新增图片状态。 */}
    {/* 读取本地封面和在线图片的状态由传入组件处理，公共卡片不缓存第二份图。 */}
    <div className={styles.cardCover} data-model-library-card>
      <button type="button" aria-label={label || displayName} onClick={onSelect} className={styles.cardImagePreview}>{cover}</button>
      <div className="pointer-events-none absolute left-2 top-2 z-[1] flex max-w-[calc(100%-1rem)] flex-wrap gap-1">{badges}</div>
      {/* 列表资料：完整名称保留悬停提示，两行都省略长文本而不改变行高。 */}
      {/* 两种密度的文字共用一个按钮，屏幕上隐藏的排版也从辅助树中隐藏。 */}
      <button {...attributes} type="button" onClick={onSelect} aria-label={label || displayName} aria-pressed={pressed} className={styles.cardOverlay} title={subtitle || displayName}>
        <div className={styles.cardGridContent}>{overlay || <p>{displayName}</p>}{!overlay && subtitle && <small>{subtitle}</small>}</div>
        <div className={styles.cardListContent} data-model-list-summary><p title={displayName}>{displayName}</p><small title={listAttributes}>{listAttributes}</small></div>
      </button>
    </div>{selectionControl}
  </div>;
}
