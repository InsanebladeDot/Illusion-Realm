"use client";

/** 数值拖动只预览草稿，松手才通知既有属性提交；取消不改工程确认值。 */
import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

// 数值输入仍由EditorFloatField解析文字，拖动只接收已经确认的有限数字。
// min/max/precision沿用原字段配置，不为X、旋转或轨道数量单独写拖动规则。
// enabled同时表达字段可提交和非混合值，禁用字段不能靠拖动绕过业务权限。
// 混合值没有唯一的起点，必须先通过明确输入确认一个共同值才适合拖动。
// 候选只保存一个数字，不把整个片段、视频元素或源文件放进局部状态。
// setCandidate负责立即显示手势预览，onCommit只在有效松手后调用一次。
// 数值框可被多个编辑器使用，ref和state属于每个Hook实例，不建立全局共享手势。
// 元素引用用于指针捕获清理，不能把它序列化到用户JSON。
interface ScrubOptions { value: number; min: number; max: number; precision: number; enabled: boolean; onCommit?: (value: number) => void; }
interface ScrubGesture { pointer: number; element: HTMLInputElement; y: number; value: number; current: number; active: boolean; }
interface ScrubContext { options: ScrubOptions; gesture: RefObject<ScrubGesture | null>; setCandidate: (value: number | null) => void; }

// 类似轻轻拧旋钮：起点值固定，累计位移决定候选，不累加每次事件误差。
// 先清gesture再释放捕获，lostpointercapture回调即使同步发生也只会看到空手势。
// 候选清空后输入框重新显示正式值，取消无需发送一个反向业务补丁。
// 必须检查hasPointerCapture再release，尚未超过阈值的单击并没有捕获可释放。
// 取消函数只依赖稳定ref和state setter，不读取挂载时的旧值或旧onCommit。
// 因此窗口blur监听可以长期绑定同一个取消回调，不必每次移动都重新订阅。
// 卸载时也走该边界，不能让旧输入元素继续占有指针。
function cancelScrub(context: Pick<ScrubContext, "gesture" | "setCandidate">) {
  const current = context.gesture.current;
  context.gesture.current = null;
  context.setCandidate(null);
  if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
}
// 左键按下只是记录原点，不立即preventDefault，普通单击仍能把光标放进文字。
// 右键继续保留系统上下文菜单，不把它当成反向拖动或编辑提交。
// 双击沿用已有输入解锁能力，不能因为第二次按下建立另一个数值拖动。
// 按下时复制value，随后每次位移都从同一个原值算，不累加事件频率带来的误差。
// y是客户区CSS像素，系统缩放已经由浏览器投影，不能再乘屏幕DPR。
// active初始false表示尚未跨过拖动阈值，click不应该提交相同数值。
// pointerId用于区分这只指针，其他触摸或鼠标设备的移动不能接管当前手势。
// 字段没有提交能力时提前退出，不创建一个看起来可拖却永远无法确认的候选。
function startScrub(context: ScrubContext, event: PointerEvent<HTMLInputElement>) {
  if (!context.options.enabled || event.button !== 0 || event.detail > 1) return;
  context.gesture.current = { pointer: event.pointerId, element: event.currentTarget, y: event.clientY, value: context.options.value, current: context.options.value, active: false };
  event.currentTarget.setPointerCapture(event.pointerId);
}
// 四像素阈值过滤按下时的小抖动，避免用户想选中文字却无意改了参数。
// 一旦进入拖动就保持active，回到起点也不会变回普通文本选择。
// 按下即捕获，第一帧直接越出输入框也能收到后续移动和松手。
// move只有同pointerId才执行，不用全局mouseY覆盖其他实例。
// 上移用originY减currentY得到正数，因此自然增加；下移得到负数减少。
// 小数属性默认每像素0.1，Shift加速到10，Alt精调到0.01。
// 整数属性每像素一步，避免轨道数在小数中来回取整导致难以控制。
// 先用上下界夹限，再按字段精度舍入，显示值和最后提交值使用同一数值。
// X/Y允许负值，缩放和不透明度各有自己的范围，不能统一夹成零到一百。
// 仅在活跃拖动时preventDefault，防止浏览器文字选择与拖数同时发生。
// 候选数字由React渲染，不能直接改input.value却让工程仍保持旧值。
// 原值不随候选更新，因此事件被合并或鼠标移动很快也不会累计漂移。
// min/max是字段边界，不是项目画布边界，画面移出画布仍是合法构图。
// 候选不调用onCommit，Escape才可以完整撤销本次手势而不制造一串工程写入。
// 捕获需要在down就建立，因为浏览器把第一次move发给鼠标当前命中节点。
// 如果等待阈值后才捕获，快速上移第一步已经越出input，move根本到不了这里。
// 提前捕获不等于提前修改数值：active仍等待四像素位移，单击仍只设置文本焦点。
// 如果设备取消pointer，字段的onPointerCancel调用cancel，不应发送onCommit。
// lostpointercapture也取消，除非正常up已经先清ref，此时只是安全空操作。
// 事件detail用于排除双击第二次按下，用户双击编辑不会无意开始另一段拖数。
// 如果按下后没有任何移动，up读取active为false，不会把相同值重复写进工程。
// 如果移动后正好回到原点，候选等于原值，但手势仍按一次确认结束。
// 拖动用当前options的precision，字段切换目标时清理会取消旧手势而不是换精度续拖。
// Shift和Alt每次移动读取，可在保持按下时改变微调速度。
// 这种速度切换仍以按下原点为基准，切换按键可能改变累计位移倍率，不是惯性滚动。
// 没有时间加速度或长按定时器，数值变化只由用户实际位移决定。
// 因此保持鼠标不动不会一直增长，符合旋钮式输入而不是自动连发按钮。
// 最小/最大边界夹限不会越界后反弹，也不会给用户弹出假成功提示。
// 输出保留字段精度，位置两位和透明度一位不会被统一截成整数。
// 非有限范围允许Infinity作为边界，Number.isFinite检查仍由字段/工程提交约束候选来源。
// options.value本来是确认数值，非法字符串没有进入这个Hook的入口。
// 普通文字编辑中的负号、小数点仍由字段draft保存，不会被拖值计算动态矫正。
// 若拖动时父层确认值被外部改写，依赖清理取消当前候选，而非覆盖新值。
// 这相当于订单已换版就丢掉旧铅笔草稿，不能用旧报价最后强行结算。
function moveScrub(context: ScrubContext, event: PointerEvent<HTMLInputElement>) {
  const current = context.gesture.current, options = context.options;
  if (!current || current.pointer !== event.pointerId || !options.enabled || (!current.active && Math.abs(event.clientY - current.y) < 4)) return;
  if (!current.active) { current.active = true; event.currentTarget.setPointerCapture(event.pointerId); }
  event.preventDefault();
  const step = options.precision === 0 ? 1 : event.shiftKey ? 10 : event.altKey ? .01 : .1;
  current.current = Number(Math.min(options.max, Math.max(options.min, current.value + (current.y - event.clientY) * step)).toFixed(options.precision));
  context.setCandidate(current.current);
}
// 松手位置可能比最后一个move更远，提交前先读取这次最终坐标。
// 未激活的单击只清临时记录，不触发属性提交，原输入焦点照常保留。
// 取消先清候选和捕获，随后才调用提交回调，避免回调导致卸载时留下捕获。
// 读取的是本次手势对象，即使cancel将ref清空仍保留最终数值用于这一次确认。
// 再次检查enabled，字段在拖动中被锁定时不能迟到写回。
// 提交仍走原属性模型，Hook的范围夹限不能替代工程层权限和数值校验。
// 未匹配pointerId的松手不结束本手势，其他设备抬起不会确认错误值。
function endScrub(context: ScrubContext, event: PointerEvent<HTMLInputElement>) {
  const current = context.gesture.current;
  if (!current || current.pointer !== event.pointerId) return;
  if (current.active) moveScrub(context, event);
  cancelScrub(context);
  if (current.active && context.options.enabled) context.options.onCommit?.(current.current);
}

// 事件适配只把当前参数和稳定ref交给纯手势助手，不复制属性业务。
// 局部candidate只控制输入框中的临时显示，不成为另一份工程参数。
// Escape在捕获阶段接住活跃拖动，避免同时触发上层弹窗关闭。
// 尚未激活的普通文字编辑不拦截Escape，原字段负责恢复自己的字符串草稿。
// 窗口失焦取消手势，返回应用后不继续用失焦前的鼠标原点修改参数。
// 事件订阅在卸载时成对移除，多个字段不会留下重复全局监听。
// 外部确认值变化表示别人已更新工程，清掉旧候选，避免松手覆盖新值。
// 可编辑能力改变同样取消，锁轨或切换目标后不保留旧指针授权。
// 依赖清理只负责撤销旧手势，不在effect执行体同步写状态造成渲染循环。
// active查询只用于失焦处理，不在render中读取ref来决定布局。
// 真实数值更新由父层传回value，输入框不能把候选当作已经持久化成功。
// 该Hook不安装播放定时器，也不接管时间线拖动，两种指针生命周期独立。
// 拖值是数值字段的一种输入方式，确认仍通过已有onCommit，不直接改DOM形成假状态。
// 按住左键后先记录原值和指针位置，松手前仅显示候选数。
// 上下移动与左右时间修剪属于不同手势，不能复用错误的轴向坐标。
// 四像素阈值区分普通点击与实际拖动，单击复制数值不会无故提交变化。
// 先捕获指针再判断阈值，第一帧移到输入框外也能继续收到移动。
// Shift和Alt改变步长，最终仍受当前字段精度与范围约束。
// 鼠标松开只提交一次，连续move不反复触发工程seek或碰撞校验。
// Escape丢掉候选，不能通过反向加减一串数字去猜原值。
// 窗口失焦和pointercancel都结束当前手势，返回窗口不会带着旧左键状态继续调值。
// 外部值或锁权限改变使原始候选失效，旧手势不能覆盖新确认数据。
// 字段卸载清理监听与捕获，不影响其他字段自己的独立草稿。
// 仅调用方明确传scrub才启用，漫画双击编辑等原有使用处不被强行改变交互。
export function useNumberScrub(options: ScrubOptions) {
  const gesture = useRef<ScrubGesture | null>(null), [candidate, setCandidate] = useState<number | null>(null);
  const context = { options, gesture, setCandidate };
  const cancel = useCallback(() => cancelScrub({ gesture, setCandidate }), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && gesture.current?.active) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("keydown", key, true); window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("blur", cancel); cancel(); };
  }, [cancel]);
  useEffect(() => () => { cancel(); }, [options.value, options.enabled, cancel]);
  return { candidate, down: (event: PointerEvent<HTMLInputElement>) => startScrub(context, event), move: (event: PointerEvent<HTMLInputElement>) => moveScrub(context, event), up: (event: PointerEvent<HTMLInputElement>) => endScrub(context, event), cancel, active: () => !!gesture.current?.active };
}
