/** 标题栏的内容槽：只管理分隔线、收缩和拖窗区域，业务通过 children 注入。 */
// 就像同一块门牌框可以放房号或工作室名称，框架不负责解释牌上的业务。
// 本地模型库继续提供目录，漫画工具提供名称和说明，两者不共享业务状态。
// 文字保留在原生拖窗区，不把不可点击的说明伪装成导航按钮。
// 最大宽度为系统控制按钮留出空间，长目录与说明都在槽内省略。
// 窄窗沿用原模型库的隐藏策略，不挤压品牌、账户和关闭按钮。
// children 只承载这段门牌，不能把整页工作区塞入窗口标题栏。
// title 为完整说明，视觉截断之后鼠标仍能查看原文。
// marker 用于区分两个真实使用处，不改变共同的外观规则。
// 组件不订阅路由、不发布状态，离开页面是否显示由调用方决定。
// 语义颜色来自现有主题，浅色与深色不需要另一套槽位样式。
// ReactNode 允许注入图标和分段文字，不存储编辑器或扫描结果对象。
// 本外壳没有点击事件，不会拦截标题栏拖动，也不需要额外 no-drag。
import type { ReactNode } from "react";

export function WindowTitlebarContent({ children, title, marker }: { children: ReactNode; title: string; marker: string }) {
  // 该组件没有usePathname，能够放目录或说明的差异完全由调用方注入。
  // marker只生成data属性，不参与分支选择，所以新增使用处不会继续膨胀共享逻辑。
  // min-w-0允许flex子项收缩；没有它时长目录可能挤走右侧窗口关闭按钮。
  // max-w限制整段门牌，而不是只限制某个词，图标和分隔线也计入可用宽度。
  // hidden与min-[1101px]:flex配合已有标题栏策略，小窗口优先保留必要系统操作。
  // 这里不渲染固定占位宽度，返回无门牌页面后品牌与按钮之间不会留一段空白。
  // children可使用truncate控制自己内部哪段文字优先保留，外壳不猜目录最后一级。
  // title位于公共容器，截断后仍能查看调用方提供的完整说明或完整相对目录。
  // 不附加role=button，普通说明文字不应出现在键盘操作顺序中。
  // 没有事件订阅，因此生命周期只由React树决定，不需要清理路由监听或扫描订阅。
  // 图标和文本都继承主题变量，不把用户图片或编辑画布作为标题栏背景。
  // 本地库消费会话位置store、漫画消费固定词条，数据获取职责留在两个业务调用方。
  return <div data-window-titlebar-content={marker} title={title} className="ml-3 hidden min-w-0 max-w-[38vw] items-center gap-2 border-l border-border pl-4 text-xs min-[1101px]:flex">{children}</div>;
}
