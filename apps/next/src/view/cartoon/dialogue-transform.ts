/** 气泡四角缩放：把画稿位移转回未旋转方向，固定对角并保持640:400轮廓比例。 */
// 旧版placementTransform也先逆旋转再计算尺寸；此处适配当前自然像素width契约。
// 不恢复旧版scaleX/scaleY或画布百分比限制，避免和右栏80至3000的宽度范围冲突。
// 如同拉照片一角，另一角留在桌面原处，照片不会随着手柄一起平移。
// 真实机制是将增量投影到对角线，再按新旧尺寸差移动中心半个增量。
// 算法只接收数据，不订阅指针事件，拖动生命周期和撤销仍由现有画布持有。
import type { DialogueLayer } from "./dialogue-types";

// 四个角共用符号配置，不能把右下角公式不变地套给左上角。
// x/y是局部方向，画面中的实际方向还受图层rotation影响。
// ratio来自模板画片比例，透明尾巴区也包含在画片中。
// 用id作为稳定命中标记，不用翻译后的名称推测拖的是哪个角。
// cursor为局部角的提示，旋转后的真正增量仍通过数学变换处理。
// 只有已选中图层渲染这些控件，未选中层不能抢走上层手柄的点击。
export const DIALOGUE_CORNERS = [
  { id: "nw", x: -1, y: -1, cursor: "nwse-resize" },
  { id: "ne", x: 1, y: -1, cursor: "nesw-resize" },
  { id: "sw", x: -1, y: 1, cursor: "nesw-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
] as const;

// start是手势按下那一刻的层，不能每帧用已经变大的width再次累加。
// dx/dy来自根SVG自然坐标，已包含窗口缩放，不再乘devicePixelRatio。
// 逆旋转复用旧交互的坐标思路，使转过角度的气泡仍沿自己的局部对角线缩放。
// 将位移投影到对角线后，任意轻微偏离拖动方向都不会把轮廓横向拉扁。
// 与旧右下角平均增量不同，四角符号分别参与计算，往外拖四个角都应放大。
// 长宽比平方出现在投影分母中，不能简单平均像素dx与dy而忽略400:640比例。
// 先夹取最终width再计算中心，因此达到边界后对角仍固定，不会继续漂移。
// 最小80、最大3000与已有宽度字段一致，拖过对角不翻转为负宽或镜像图。
// 中心只移动尺寸差的一半，剩下一半向被拖手柄方向扩展。
// 该移动向量再旋回画稿方向，旋转45度时对角锚点仍不跳动。
// 不夹取中心到画稿内；否则靠边缩放会破坏对角固定，作品外部分由SVG裁切。
// 返回值仅修改位置与宽度，字号、行高、旋转、颜色和透明度原样保留。
// 当前字号是自然像素，底框变大只扩大排版容量，不强制同步放大字体。
// 同款模板的其他实例不在输入中，是否更新正确UUID由画布patch负责。
// 结果是普通补丁，可用于实时预览，松手后仍只产生一个历史步骤。
// 未知corner不生成宽度更新，防止非手柄DOM被误解释成左上角。
export function resizeDialogue(start: DialogueLayer, corner: string, dx: number, dy: number): Partial<DialogueLayer> {
  // se对应(1,1)，nw对应(-1,-1)，所以左上向外的负位移也得到正的放大增量。
  // 符号只影响局部方向，不能先根据屏幕左右决定正负再重复逆旋转。
  // 旋转用弧度传给sin/cos，SVG的rotate仍接收角度，两个单位只在这里换一次。
  // localX与localY单位相同，都是作品像素，不是图片比例或视口百分比。
  // 投影意味着仅沿一条轴移动也能缩放，但垂直对角线的位移基本不改变尺寸。
  // 这比直接取鼠标距离稳定，手柄越过原中心时不会突然从缩小变回放大。
  // 当width夹到80之后继续向内拖，shift也保持边界值，不会把层中心继续拉走。
  // 初始宽度460的气泡放大到600，中心局部移动70像素，另一角仍停在原处。
  // 局部垂直中心同时移动70乘0.625，这保证素材高宽比不在某个角被悄悄修改。
  // 函数不返回rotation，拖动缩放角不会把用户设定的30度还原成零。
  // 位置用浮点数保存，窗口缩小后亚像素拖动不被整数截断积累误差。
  // 无需为se之外再创建三套缩放算法，同一投影与中心换算覆盖四组符号。
  // 参数范围由现有宽度字段定义，手柄和键盘入口不会产生互相无法显示的值。
  // start未被原地修改，因此撤销栈持有的旧稿仍可恢复缩放之前的尺寸和位置。
  // 这里没有加载或异步资源，异常边界仍在实际读取图片与导出流程，不增加假busy。
  const handle = DIALOGUE_CORNERS.find(item => item.id === corner);
  if (!handle) return {};
  const angle = start.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos, ratio = 400 / 640;
  const delta = (handle.x * localX + handle.y * ratio * localY) / (1 + ratio * ratio);
  const width = Math.max(80, Math.min(3000, start.width + delta));
  const shiftX = handle.x * (width - start.width) / 2, shiftY = handle.y * ratio * (width - start.width) / 2;
  return { width, x: start.x + shiftX * cos - shiftY * sin, y: start.y + shiftX * sin + shiftY * cos };
}

// 顶部旋转沿用旧rotationFromPointerDrag的“当前指针角减起始指针角”计算。
// 如同转动钟表指针，中心不动，只比较两个方向之间转过了多少角度。
// 先后两个向量都用作品坐标，因此窗口缩放与DPR不会改变角度。
// atan2同时区分四个象限，不能用atan(y/x)，否则左半边会反向跳转。
// 弧度只在三角函数处使用，最终仍按现有rotation字段保存角度。
// 归一到[-180,180)，跨过钟表左侧时不会超出右栏输入允许的范围。
// 保留按下时的偏移，点击手柄边缘也不会瞬间吸附到某个绝对角度。
// 只返回角度补丁，中心、宽度和文字属性均由现有图层保留。
// 手势起点与撤销仍由stage管理，本函数不注册任何全局监听。
// 起点恰在中心的异常输入也只会产生有限角度，不产生除零或NaN。
export function rotateDialogue(start: DialogueLayer, originX: number, originY: number, x: number, y: number): Partial<DialogueLayer> {
  // 起始层旋转不是起始指针角，二者必须相加减而不是用指针角直接覆盖图层角度。
  // 例如用户从30度继续转10度，结果应是40度，而非回到10度。
  // 两次取角都减去相同中心，平移后的气泡也不会绕画稿原点旋转。
  // 归一时先加360再取余，避免JavaScript对负数取余仍得到负余数。
  // 180与-180视觉相同，统一保存-180使属性范围和撤销快照可预测。
  // 跨越一整圈时可能换成等价角，不允许积累几万度污染右侧精确输入。
  // 这里没有15度吸附；精确整数角度仍通过已有属性字段输入。
  // 转角不会改变文字横竖排，direction控制排版而rotation控制整层朝向。
  const before = Math.atan2(originY - start.y, originX - start.x);
  const after = Math.atan2(y - start.y, x - start.x);
  const angle = start.rotation + (after - before) * 180 / Math.PI;
  return { rotation: ((angle + 180) % 360 + 360) % 360 - 180 };
}
