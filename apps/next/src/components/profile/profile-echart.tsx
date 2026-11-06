"use client";

/**
 * 私密统计的 ECharts 宿主：只管理浏览器图表生命周期，不查询或保存账户数据。
 * 图表配置由调用方提供，周期、样例开关与语言仍属于个人主页的 React 状态。
 * 按需注册折线、柱形、环形三个系列，避免为了四张小图引入所有图表类型。
 * SVGRenderer 由 ECharts 生成路径与文字，不再维护手写 SVG 的坐标计算。
 * SVG 在桌面缩放时保持文字清晰，也便于无障碍与真实渲染回归检查。
 * 配置函数读取当前主题色，不能在模块加载时把浅色值永久缓存下来。
 * 模块可以参与静态导出；初始化必须等 React effect，不能顶层访问 document。
 * 私密标签通常初始隐藏，挂载时宽高可能都是零，不能立即创建零尺寸图表。
 * 明细 dialog 也可能在子组件 effect 后才显示，使用相同的非零尺寸入口处理。
 * 只订阅浏览器布局与主题信号，不向 window 暴露 ECharts 或测试专用接口。
 */
import { useEffect, useRef, useState } from "react";
import { init, use as registerECharts, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, GraphicComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { useTranslation } from "@/i18n";

/**
 * 只注册本面板配置实际使用的组件，后续添加系列时必须同时声明对应注册项。
 * Grid 服务折线与柱形坐标轴；Graphic 服务环图中央的总数和单位。
 * Tooltip 负责鼠标位置对应的数据读数，分布文字图例仍由上层提供。
 * 这里不使用 echarts-for-react，避免额外封装与 React 版本兼容依赖。
 * 注册本身不创建实例，也不依赖宿主窗口是否可见。
 */
registerECharts([BarChart, LineChart, PieChart, GridComponent, GraphicComponent, TooltipComponent, SVGRenderer]);

/**
 * text 用于主要读数，muted 用于坐标与图例，border 用于网格线。
 * surface 用于提示框背景，font 直接继承应用实际字体，避免图表换用默认字体。
 * 强调系列色由各图统一指定，这些主题字段只描述应用表面和文字。
 * 字段使用普通字符串，让配置生成器保持纯函数，不依赖 DOM 或 Electron。
 * 这份契约也适用于明细图，防止弹窗和卡片使用两套主题实现。
 */
export interface ChartPalette { text: string; muted: string; border: string; surface: string; font: string }
// height 仅改变宿主几何，用于真实模型较多时给每行保留可读高度。
// 默认不传时完全沿用原样式，趋势、小时、分布图调用方不受影响。
// ResizeObserver 仍读取实际容器，不能靠固定 SVG 尺寸掩盖布局变化。
/**
 * 可选高度参数的使用边界：
 * 模型使用榜的行数来自实际记录，不再固定只有三个样例模型。
 * 每一行留出足够高度后，长榜单可以在卡片内滚动查看。
 * 图表宿主高度由 React style 注入，ECharts 仍通过 ResizeObserver 适应真实几何。
 * 未传 height 时不生成覆盖样式，原趋势、小时和分布调用方沿用 CSS 高度。
 * 图表颜色、坐标与数据仍由 option 函数负责，高度不参与统计计算。
 * 外层负责最大可见高度与滚动，宿主负责实际 SVG 绘制高度。
 * 这避免为“完整榜单”复制另一套 ECharts 初始化和释放逻辑。
 * 多个明细与卡片实例仍分别持有 ref，修改高度不会共享某一张图的 DOM。
 * 父级隐藏后恢复时，既有尺寸检查和 observer 仍是唯一重绘入口。
 * height 不落盘，也不会改变用户的窗口大小或全局缩放。
 */
interface ProfileEChartProps { height?: number; label: string; kind: string; option: (palette: ChartPalette) => EChartsCoreOption }

/**
 * 从已应用 CSS 重新取色；MutationObserver 的事件载荷不代表最终色值。
 * 读取宿主的继承变量，能够同时覆盖深浅色与自定义配色预设。
 * 前景直接使用计算后的 color，其余 token 由现有主题定义保证存在。
 * 主题切换可能先改 DOM 再通过 IPC 改媒体查询，因此后面还订阅媒体变化。
 * 该函数只在客户端的绘制入口调用，不参与服务端预渲染。
 * 读出的颜色仅用于本次 setOption，不写回应用主题或持久化设置。
 */
function paletteFor(host: HTMLElement): ChartPalette {
  const style = getComputedStyle(host), token = (name: string) => style.getPropertyValue(name).trim();
  return { text: style.color, muted: token("--muted-foreground"), border: token("--border"), surface: token("--background"), font: style.fontFamily };
}

/**
 * 每个可见宿主最多持有一个实例；隐藏时保留实例，重新显示时重新测量。
 * label 是当前语言下的图表名称，错误时仍保留可访问的容器和缺失提示。
 * kind 只标识图表语义以便样式选择，不把样例数据伪装成实际服务返回。
 * option 更新通过 ref 交给已有实例，标签父组件重渲染不销毁图表。
 * 配置使用 notMerge，实际模式的空数组必须彻底替换样例数据。
 * 所有实例均关闭动效，周期切换直接呈现确定读数，不等待隐藏页面的 rAF。
 * ResizeObserver 观察宿主实际宽高，覆盖 nav 展开、容器变窄和标签重新显示。
 * window resize 作为补充通知，回调仍读取真实 clientWidth/clientHeight。
 * visibilitychange 在窗口重新可见时补测，错过媒体事件不会永久保留旧尺寸。
 * 媒体订阅覆盖 Electron nativeTheme 落地后 CSS 才切换的情况。
 * MutationObserver 限定根主题属性，不观察图表内部 SVG，避免重绘触发自身。
 * 三种通知最终调用同一绘制入口，不根据事件对象猜测当前颜色或几何。
 * 绘制全程同步，返回前完成 setOption 和 resize，不挂无上限异步等待。
 * 宽高为零只延迟绘制，不设为错误，因为隐藏面板是正常状态。
 * ECharts 初始化或配置异常显示现有本地化提示，并输出不含用户数据的警告。
 * 失败时释放半初始化实例；后续真实布局或主题变化可以重新尝试。
 * observer 与监听器在 cleanup 中先解绑，再释放图表，防止回调访问失效实例。
 * Strict Mode 的挂载清理重演也走相同路径，不依赖一次性全局标记。
 * 卸载明细弹窗后实例被 dispose，不保留脱离 DOM 的 SVG 或鼠标监听器。
 * 没有网络请求、文件操作或账户写入；样例与实际数据边界由上层配置决定。
 * 几何与通知的约束：
 * clientWidth/clientHeight 是内容与 padding 的布局尺寸，宿主本身不设置 padding。
 * 因而传给 ECharts 的默认尺寸与 CSS 定义的图表绘图区一致。
 * 外层统计卡的 border 和 padding 不计入图表像素，避免轴标签压在卡片外框上。
 * ResizeObserver 的第一次通知负责初始可见布局，draw 的立即调用缩短已可见图的空白。
 * 对隐藏标签的第一次立即调用会直接返回，不能把这一分支记录为统计加载失败。
 * 一旦标签移除 hidden，浏览器会报告新尺寸，由同一个闭包继续完成初始化。
 * 隐藏期间主题也可能改变，但 draw 返回不会缓存旧色，下次显示仍读取最新 CSS。
 * 只监听根属性而不监听整个子树，语言或统计读数变化不会造成额外主题回调。
 * 属性列表包含 style，因为自定义调色会直接改写根元素的主题变量。
 * 没有监听主题 preference 字段；实际 data-theme 和媒体查询才决定最终表面。
 * 显式监听媒体变化还能覆盖系统主题驱动，而不是假设所有切换都来自应用菜单。
 * 生命周期与状态的约束：
 * chart 变量属于本次 effect，cleanup 只能释放自己创建的那个实例。
 * props 更新只重设配置；组件真正卸载时才移除回调并释放当前实例。
 * setOption 的同步异常被局部捕获，不让一张图的失败打断整个个人主页。
 * 警告文字固定，不打印配置中的分类、文件名或账户标识。
 * failed 只控制同级提示，不进入 option 的数据契约，也不向父级请求样例回退。
 * 初始化成功后清除 failed，让临时尺寸或配置故障恢复时提示能够消失。
 * 图表错误不能回退到旧手写图，避免看似成功却未满足 ECharts 迁移要求。
 * 释放通过 ECharts 的 dispose，不能只删 SVG，因为库还管理命中与事件资源。
 * observer 先 disconnect，避免 dispose 引起的 DOM 变化再次排入本宿主的绘制。
 * 监听器解绑使用原闭包引用，不能创建一个同名但不同身份的回调。
 * 不订阅账户 store，图表重绘不会触发读盘、水合或任何写操作。
 * 错误提示和可访问名称分别保留语义，读屏无需读取 SVG 中的装饰性网格线。
 * SVG 不依赖高分屏 backing buffer，所以无需额外复制应用的 DPR 状态。
 * 窗口缩放后由 CSS 布局确定目标尺寸，再调用 resize，避免反向改写宿主宽高。
 * 当前使用同步配置函数，未来若引入动态请求，应在数据层处理取消和过期响应。
 * 配置更新与实例初始化分离，避免父页切标签就生成新的库实例标识。
 * optionRef 只在 effect 写入，不在渲染过程中修改 ref，也不引入全局缓存。
 * redrawRef 让配置 effect 调用当前绘制入口，避免另注册一组布局监听器。
 * 首次挂载两个 effect 的执行顺序保证 draw 已就绪再提交当前配置。
 * 隐藏时配置 effect 仍更新 ref，重新显示时会使用最新样例开关和周期。
 * cleanup 把绘制入口设为空操作，严格模式重演之间也不能命中已释放的图表。
 * notMerge 仍作用于每次配置更新，实例复用不等于保留上一组系列数据。
 * palette 也在每次绘制重新读取，复用实例不会使主题颜色固定在首次初始化。
 */
export function ProfileEChart({ label, kind, option, height }: ProfileEChartProps) {
  const ref = useRef<HTMLDivElement>(null), [failed, setFailed] = useState(false), { t } = useTranslation();
  const optionRef = useRef(option), redrawRef = useRef<() => void>(() => {});
  useEffect(() => {
    const host = ref.current; if (!host) return;
    let chart: EChartsType | undefined;
    const draw = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      try {
        chart ??= init(host, undefined, { renderer: "svg" });
        chart.setOption({ ...optionRef.current(paletteFor(host)), animation: false }, { notMerge: true }); chart.resize(); setFailed(false);
      } catch { chart?.dispose(); chart = undefined; setFailed(true); console.warn("[profile-chart] render failed"); }
    };
    const size = new ResizeObserver(draw), theme = new MutationObserver(draw), media = matchMedia("(prefers-color-scheme: dark)");
    size.observe(host); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-color-preset", "style"] });
    window.addEventListener("resize", draw); document.addEventListener("visibilitychange", draw); media.addEventListener("change", draw); redrawRef.current = draw; draw();
    return () => { redrawRef.current = () => {}; size.disconnect(); theme.disconnect(); window.removeEventListener("resize", draw); document.removeEventListener("visibilitychange", draw); media.removeEventListener("change", draw); chart?.dispose(); };
  }, []);
  useEffect(() => { optionRef.current = option; redrawRef.current(); }, [option]);
  // 界面：图表失败提示作为宿主同级显示，不让 ECharts 清理 DOM 时误删 React 子节点。
  // 正常宿主保持空 JSX 内容，SVG 和 tooltip 的创建与清理由同一个 ECharts 实例拥有。
  // role 与名称由 React 提供，图表不可见或加载失败时也不丢失语义。
  // 错误提示沿用已有词条，不能把原始异常或堆栈作为界面文字。
  // 同级状态不会改变图表固定高度，避免错误恢复过程产生尺寸循环。
  return <><div ref={ref} style={height === undefined ? undefined : { height }} className="pr-echart" data-chart-kind={kind} role="img" aria-label={label} />{failed && <p role="status">{t("profile.ui.unavailable")}</p>}</>;
}
