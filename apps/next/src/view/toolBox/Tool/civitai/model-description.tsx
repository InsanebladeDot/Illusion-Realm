"use client";

// 模型说明只接收已经清理过的纯文字，不解释作者提供的 HTML。
// 两个来源复用六行折叠与定高滚动，资料获取仍由各自详情负责。
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "@/i18n";

/**
 * 像在一张长纸上开一个小窗口：折叠只露六行，展开后在窗口里翻阅。
 * CSS 行裁切负责最后一行的省略号，不用字符数猜中文或英文的宽度。
 * expanded 只决定当前实例的窗口高度，不修改说明原文。
 * overflow 决定短说明是否需要显示“显示全部”，避免无意义的空操作。
 * 先按折叠高度测量，再允许用户展开，隐藏详情时不会凭零宽度作结论。
 * ResizeObserver 会在右栏变宽或 details 展开后重新报告真实尺寸。
 * 这样不需要轮询，也不依赖窗口是否正在执行动画帧。
 * 展开后的高度不再受六行裁切限制，但最大高度仍为十五行。
 * 超过十五行的剩余文字由本区域滚动，不让说明把下载入口推离视口。
 * 短说明保留自然高度，不额外预留六行的空白。
 * 调用方以说明内容作为 key，切模型或换版本后恢复默认折叠。
 * key 只控制这个轻量阅读器，不会销毁外层预览或下载表单。
 * aria-controls 关联当前实例的文字区，多个详情不能共用同一个 ID。
 * 展开后文字区可获得键盘焦点，方便用方向键和 PageDown 阅读。
 * 折叠后去掉额外 Tab 停靠点，焦点仍可停留在切换按钮上。
 * 手动折叠先把内部滚动条归零，下次展开不会从说明中间开始。
 * 关闭详情时释放观察器，避免继续测量已经移除的节点。
 * 测量只读当前 DOM，不访问 Electron、用户目录或远端接口。
 * 本组件不净化 HTML，净化责任留在已有 civitaiDescription 适配层。
 * 阅读器的字号固定为项目小号正文，不随来源元数据里的字体声明变化。
 * leading-5 对应每行 20px，因此六行约 120px、十五行约 300px。
 * max-height 只是上限，七行说明展开后不会硬撑成十五行。
 * 换行符使用 pre-wrap 保留，作者分段不会在折叠时被拼成一句。
 * overflow-wrap:anywhere 处理没有空格的哈希、链接和连续字符。
 * 这里不计算字节数，因为相同字数在中英文和不同栏宽下行数不同。
 * 高度比较留出 1px 容差，避免浏览器的小数像素取整制造假溢出。
 * 测量不改元素样式，因此不会在观察器回调里反复制造布局变化。
 * expanded 改变后会先清理上一次观察，再决定是否需要建立新的观察。
 * 展开时保留原 overflow 结果，让收起入口始终可达。
 * 若窗口在展开时变宽，文字自然重排；手动收起后会重新评估是否还超长。
 * 恰好六行时不显示按钮，第七行才需要进入完整阅读模式。
 * 原生 details 的 summary 由调用方管理，阅读器不替用户打开外层分组。
 * 文字本身没有编辑能力，聚焦只服务键盘滚动，不会更改模型说明。
 * overscroll-contain 避免滚到说明底部后继续把整个详情栏意外推走。
 * 展开区没有水平滚动，长字符串仍在当前列内折行。
 * 所有链接按纯文字处理，点击说明不会自动跳到作者提供的地址。
 * 此阅读模式不保存到用户文档，下次选模型从相同的默认高度开始。
 * useId 在静态预渲染与水合间保持关联，不通过时间戳产生不稳定标识。
 * 空说明由调用方的无资料文案处理，本组件不制造第二套空态。
 * CSS 只挂在当前段落，不改变页面中其他 p、details 或下载提示的高度。
 * 按钮沿用原生焦点轮廓，不能只靠颜色告诉键盘用户当前停在哪里。
 * 不添加展开动画，避免说明变高时多层滚动容器同时缓动。
 * 该组件没有图片节点，展开不重新下载封面，也不复制图片到新浮层。
 * text 是净化后的必填字符串，不能传 React 富文本节点改变测量边界。
 * 说明正文保持同一节点，用户展开后无需重新等待远端请求返回。
 * 此处不裁剪实际字符串，复制或辅助设备访问仍能得到完整说明。
 * 外层模型区滚动与正文内部滚动拥有不同 scrollTop，不能相互复用。
 * 按钮没有固定定位，缩小窗口时仍跟随当前说明出现在正确位置。
 */
export function ModelDescription({ text }: { text: string }) {
  const { t } = useTranslation();
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  // 只在折叠状态比较裁切高度，展开后不能用扩大的窗口误判为短说明。
  // 隐藏的原生 details 初次宽度为零，需等真正展开后再测量。
  // ResizeObserver 同时覆盖容器宽度变化与原生折叠组的可见性变化。
  // 内容切换由 key 重新挂载， effect 不在内部重置调用方状态。
  // 没有订阅到有效元素时直接结束，避免预渲染期间读取布局。
  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => {
      if (element.clientWidth) setOverflow(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);
  // 归零只针对自己的文字区，不会把右栏整体滚回顶部。
  // 使用函数式更新让连续键盘激活也以最新状态切换。
  // 此操作没有网络任务，按钮无需制造虚假的加载或成功状态。
  const toggle = () => {
    if (ref.current) ref.current.scrollTop = 0;
    setExpanded(value => !value);
  };
  return <div data-model-description data-expanded={expanded}>
    {/* 模型说明：默认六行带省略号，展开后完整文字在十五行窗口内滚动。 */}
    {/* 显式行高让两种来源的折叠高度一致，不依赖外层继承的字号。 */}
    {/* 折叠使用浏览器原生行裁切，保留文字选择和屏幕阅读器读取原文的能力。 */}
    {/* 长网址同样能在容器内断行，不用横向滚动寻找“显示全部”。 */}
    <p id={id} ref={ref} tabIndex={expanded ? 0 : undefined} className={`whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-ring ${expanded ? "max-h-75 overflow-y-auto overscroll-contain" : "line-clamp-6"}`}>{text}</p>
    {/* 蓝色文字按钮紧接截断内容，不为短说明预留空白操作行。 */}
    {/* 展开后保留收起入口，用户不用切模型才能恢复默认高度。 */}
    {/* aria-expanded 与实际滚动模式使用同一状态，避免辅助描述与视觉不同步。 */}
    {overflow && <button type="button" data-model-description-toggle aria-expanded={expanded} aria-controls={id} onClick={toggle} className="mt-1 rounded text-xs text-blue-500 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t(expanded ? "toolBox.civitai.collapseDescription" : "toolBox.civitai.showAllDescription")}</button>}
  </div>;
}
