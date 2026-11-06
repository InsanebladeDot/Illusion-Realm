"use client";

// 视频导入只新增操作确认，外壳、焦点循环与按钮沿用当前画布组件。
// 选择值属于一次弹窗，卸载即清除，避免下一次不经意沿用移动模式。
// 默认复制保留原视频；移动的副作用明确放在确认按钮前，用户可先取消。
// 选项只表达意图，不在本组件读取路径或执行文件操作。
// 真正复制和移动由同一个导入 Hook 接通受校验的主进程请求。
// 素材解码仍归各节点，确认框不会制造“视频可播放”的成功反馈。
import { useState, type RefObject } from "react";
import { useTranslation } from "@/i18n";
import { CanvasOverlay } from "./canvas-overlay";
import { CanvasChip, SegmentedControl } from "./reference-ui/components";
import styles from "./canvas.module.css";

// returnFocus 来自打开前的捕获，不能等背景 inert 后才猜原来在哪个按钮。
// 两个回调由所属工作区注入，不在共享展示中抓取全局工程状态。
// mode 限定两个字面值，跨进程还有独立校验，不能将任意字符串解释为删除指令。
interface ImportChoiceProps {
  onConfirm: (mode: "copy" | "move") => void;
  onCancel: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}

// 确认框的状态边界：选中“移动”只改变选项，没有磁盘副作用。
// 用户改回复制时，说明随即回到保留来源，不需要再打开一次系统框。
// apply 读取当前 mode，而非初次渲染的默认值，防止看见移动却执行复制。
// onCancel 不接受 mode，因此取消不可能误走最后一次选中的操作。
// 窗口没有“记住我的选择”，避免未来拖入文件时隐藏危险模式。
// 被背景隔离的是画布，不是应用导航；用户仍可离开当前工具。
// 离开后 pending 随 Hook 卸载，重新进入不会自动继续之前未确认的搬运。
// 没有依靠等待秒数后自动确认，慢慢阅读说明不会触发意外删除。
// 当前确认针对整批视频，不按每个文件重复弹框而打断多选工作流。
// 单个更换视频也经过确认，不能因为操作来自卡片就绕过来源保护。
// 展示中不列绝对路径，长用户名或目录不会挤压确认按钮。
// 选项名称保留复制与剪切语义，避免“导入”掩盖原文件去向。
// role=status 只通知当前选择说明，不提前宣布文件已经完成处理。
// SegmentedControl 自带 pressed 状态，视觉选中与读屏状态来自同一 mode。
// 两项均保留可见焦点，不用仅靠鼠标悬停才能找到的操作。
// 该对话框没有 File 输入，不与原有隐藏 input 竞争系统选择框事件。
// 原 input 的值已清空，确认框取消后重新选择同一视频仍能触发 change。
// 提示中的“工程目录”指主进程已分配的资产归属，不是任意网页下载路径。
// 目录名更改规则仍在原资产服务，弹窗不会根据翻译文案拼地址。
// 默认复制保护的是磁盘原件，不表示原节点的参数变成只读。
// 后续节点拖动仍只修改画布坐标，不会再次搬动该媒体文件。
// 更换文件成功才更新节点来源，选择选项本身不占用撤销历史。
// 图的撤销不负责把已经移动的原件搬回去，文件操作和图操作保持独立。
// 图片的正常显示不用此浮层，不额外增加其导入步骤。

export function CanvasImportChoice({ onConfirm, onCancel, returnFocus }: ImportChoiceProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"copy" | "move">("copy");
  // 分段控件的通用字符串回调在此缩窄，未知值保守回到复制。
  // 不能用类型断言让错误值越过业务边界，主进程并不依赖此处的 UI 保护。
  // 控件支持原生 Tab/Enter/Space；按 Escape 和遮罩都走无磁盘副作用的取消。
  return <CanvasOverlay label={t("canvas.importMethod")} onClose={onCancel} returnFocus={returnFocus}>
    {/* 导入确认：背景工作区已 inert，节点快捷键不会删除待导入的目标。 */}
    {/* 同一个说明区域随选项更新，读屏可听到移动会删除原位置文件的差异。 */}
    {/* 取消和确认使用原 CanvasChip，不引入独立的按钮和悬停样式。 */}
    <div className={styles.dialog} data-canvas-import-choice>
      <h2>{t("canvas.importMethod")}</h2>
      <SegmentedControl label={t("canvas.importMethod")} value={mode} onChange={value => setMode(value === "move" ? "move" : "copy")} items={[{ id: "copy", label: t("canvas.copyMedia") }, { id: "move", label: t("canvas.moveMedia") }]} />
      <p role="status">{t(mode === "copy" ? "canvas.copyMediaHelp" : "canvas.moveMediaHelp")}</p>
      {/* 移动只针对视频，混合批次中的图片和音频仍保留来源；受管素材不允许搬离。 */}
      <p>{t("canvas.importMethodScope")}</p>
      <footer data-canvas-import-actions><CanvasChip onClick={onCancel}>{t("canvas.cancel")}</CanvasChip><CanvasChip onClick={() => onConfirm(mode)}>{t("canvas.apply")}</CanvasChip></footer>
    </div>
  </CanvasOverlay>;
}
