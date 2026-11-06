"use client";

// 只编辑展示几何，不改变源图片像素、视频分辨率或生成参数 ratio。
// 原生表单先验证草稿，再把完整数值一次提交给原 updateNodeData 事务。
import type { FormEvent } from "react";
import { useTranslation } from "@/i18n";
import type { CanvasData } from "./canvas-model";
import { CanvasChip } from "./reference-ui/components";

// 三种方案共享节点外壳，不创建三套媒体卡片组件。
// square 的宽高相同，适合方形内容的展示区域。
// rectangle 沿用视频卡原有横向尺寸。
// custom 使用用户确认的宽高，不改变媒体原始分辨率。
// 预设值处于 schema 与主进程共同允许的范围内。
// 方案名与尺寸一起保存，不从宽高是否相等反推用户意图。
// 画布缩放只影响屏幕显示，预设数字仍代表世界单位。
// 标题、端口、参数面板继续沿用共享组件。
// 改变外壳不会改图片比例生成参数 ratio。
// 相同媒体可以有不同卡片尺寸，保存后也分别恢复。
export const CARD_PRESETS = { square: { style: "square", width: 284, height: 284 }, rectangle: { style: "rectangle", width: 502, height: 284 } } as const;

// 表单只保存这次打开的临时草稿。
// 默认值取已确认 card，旧卡没有配置时回落到长方形。
// 没有每敲一个字符就回写作品，因此中间空值不污染节点。
// 宽高都是 required，删除输入后不能提交 NaN。
// 原生 min/max/step 同时约束范围与整数精度。
// reportValidity 把错误留在字段旁，不弹假的保存成功。
// 确认前没有 updateNodeData，取消关闭就丢弃草稿。
// 确认时构造完整 card 对象，避免只改宽度留下不一致方案名。
// 数值转换发生在原生有效性检查之后。
// 父层 onApply 负责选择集与历史，表单不知道节点存在哪个 store。
// onClose 只负责浮层关闭，不清空工程或改变媒体。
// 同一表单可服务任何节点类型，差异只有当前尺寸与回调。
// 宽度上限与高度上限不同，不能把二者复用成一个错误常量。
// 自动焦点进入宽字段，键盘用户不需要先穿过背景工作区。
// 背景 inert 由现有浮层外壳管理，表单不另建全局焦点监听。
// Escape 和 Tab 路径继续复用 CanvasOverlay。
// 关闭后焦点由外壳返回触发器，不在此猜测菜单按钮是否还挂载。
// 取消按钮 type 由 CanvasChip 保持为普通按钮，不会误提交表单。
// 确定按钮使用 submit，Enter 与点击走同一个验证入口。
// 两个 input 的 name 是 FormData 的协议字段，不使用翻译字符串当键。
// 单位写在双语标签中，保存值仍是纯数字。
// 长标签允许布局自然容纳，不将 UI 文案写回 card.style。
// 此组件不请求磁盘权限，不探测媒体，也不触发生成队列。
// 缺图卡同样可以改尺寸，错误恢复和展示几何互不影响。
export function CanvasCardSize({ card, onApply, onClose }: { card?: CanvasData["card"]; onApply: (card: NonNullable<CanvasData["card"]>) => void; onClose: () => void }) {
  const { t } = useTranslation();
// 提交边界示例：用户清空宽度后按 Enter，原卡不变。
// 输入小于一百六十的值也只停留在草稿中。
// 带小数的宽高会被 step=1 拒绝，不能靠四舍五入偷偷改意图。
// 合法值确认后才赋 style=custom，取消不改变原预设标签。
// 高宽互不推导，custom 允许横长、竖长和正方形。
// 没有按媒体自然比例自动改另一字段，避免用户输入被覆盖。
// 如果用户想恢复标准尺寸，可以再次选 square 或 rectangle。
// 表单不保存最后一次其他节点的草稿，每次打开从本节点已确认值开始。
// 因此 A 卡的非法输入不会在打开 B 卡时污染默认值。
// 共享组件只接 card 和回调，不拿全局当前选中 id。
// 选择集的解释由调用层决定，不在字段里藏业务选择逻辑。
// 表单提交一次 onApply，内部不按宽高各发一次历史命令。
// 关闭函数在确认后执行，界面不会保留一个已经失效的输入层。
// 这里没有“尺寸已导出”提示，因为调整外壳不是媒体处理任务。
// 确认值通过原保存器持久化，不在表单里直接写 localStorage。
// 错误反馈沿用浏览器有效性提示，不伪造一条成功 toast。
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const data = new FormData(event.currentTarget);
    onApply({ style: "custom", width: Number(data.get("width")), height: Number(data.get("height")) });
    onClose();
  };
  return <form onSubmit={submit} data-canvas-card-form>
    {/* 尺寸弹窗：不同节点沿用同一表单，取消不回写未确认草稿。 */}
    <h2>{t("canvas.cardCustom")}</h2>
    <label>{t("canvas.cardWidth")}<input autoFocus type="number" name="width" min={160} max={1200} step={1} required defaultValue={card?.width ?? 502} /></label>
    <label>{t("canvas.cardHeight")}<input type="number" name="height" min={100} max={900} step={1} required defaultValue={card?.height ?? 284} /></label>
    <footer><CanvasChip onClick={onClose}>{t("canvas.cancel")}</CanvasChip><button type="submit" className="hy-chip">{t("canvas.apply")}</button></footer>
  </form>;
}
