"use client";

/** 模板弹窗只管理显隐和焦点，不持有编辑器、素材目录或文档历史。 */
// 打开时记住来源按钮，关闭时把焦点还给它，键盘用户不会丢在body上。
// 搜索框直接获得焦点，用户无需先Tab穿过窗口标题栏和应用导航。
// 这些行为只作用于本工具的模板弹窗，不改变共享外壳的其他调用方。
// 使用固定titleId定位自己这一个实例，不查询任意第一个role=dialog。
// ResourceDialogShell负责实际显示与Escape关闭，这里不复制遮罩或几何。
// 子菜单通过Portal显示时暂不限制其Tab，否则会抢走SimpleSelect自己的焦点。
// 模板筛选只是局部UI，关闭后可以丢弃；画布内容由外层编辑器保留。
// 监听只在弹窗打开期间存在，返回页面或关闭后统一清理。
// 记住来源元素不等于持久化DOM，ref随当前页面卸载自然释放。
// 本hook不读File、不调用IPC、不对用户数据文件产生写入。
// 聚焦失败不作为业务成功，素材真正添加仍由点击回调执行。
// 操作均发生在effect或事件中，不在渲染阶段读取document.activeElement。
// 焦点夹取像让人在当前房间内选书，关门后再回到原来站的位置。
// 真实机制是Tab边界循环与清理阶段的来源focus，而不是全局键盘拦截。
import { useCallback, useEffect, useRef, useState } from "react";

// 控件列表每次按键重新读取，筛选后的卡片减少时不会指向已经卸载的节点。
// hidden与disabled内容不参与顺序，不能把焦点送到看不见的选项。
// 搜索框、分类、素材和关闭按钮都在同一资源弹窗内。
// 导航与背后的属性栏退出这一轮Tab循环，减少误删或误改画布的机会。
// Shift+Tab在第一个控件处返回最后一个控件，反向路径同样完整。
// 只有边界被拦截，内部普通Tab仍保留浏览器自然顺序。
// 焦点意外落在弹窗外时回到第一个可见控件，避免停留在背后的旧卡片上。
// 选择下拉的Portal列表优先处理自己的键盘，不被本边界强行收回。
// 路由卸载后的对话框不存在时直接返回，不创建轮询等待。
// 防止SVG气泡在弹窗打开期间继续接收画布快捷键由编辑器hook负责。
// 因此焦点保护与Delete保护是两道独立边界，不能只靠一层视觉遮罩。
function containTab(event: KeyboardEvent) {
  // 下拉列表通过Portal放到body，若硬把焦点夹回dialog会破坏菜单键盘选择。
  // 因此listbox存在时让SimpleSelect先拥有自己的Tab和方向键边界。
  // dialog只按本工具固定titleId定位，不会把另一个资源窗误当当前模板库。
  // querySelectorAll不缓存卡片，搜索无结果后节点数量变化也能正确计算首尾。
  // getClientRects过滤隐藏节点，disabled通过选择器排除，二者缺一不可。
  // 只筛选tabindex=0的自定义控件，负tabindex节点不应被主动纳入自然顺序。
  // first通常是关闭或返回按钮，不保证永远是搜索框。
  // outside处理来自背后画布的焦点，Tab后直接回到可见首控件。
  // 内部普通Tab没有被preventDefault，浏览器仍能遵循控件在DOM中的自然次序。
  // Shift+Tab只在first处回到last，正向只在last处回到first。
  // nodes为空时target也是空，不调用undefined.focus制造键盘异常。
  // 不把role=dialog本体设为tabindex=0，避免在内容开始前多出一个无操作停靠点。
  // focus不创建新状态，也不修改query，循环不会清除用户正在寻找的关键词。
  // 这是模态资源页的局部边界，不替代整个应用导航的键盘设计。
  if (event.key !== "Tab" || document.querySelector("[role=listbox]")) return;
  const dialog = document.querySelector<HTMLElement>('[data-resource-dialog="dialogue-template-title"]');
  const nodes = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []).filter(node => node.getClientRects().length);
  const first = nodes[0], last = nodes[nodes.length - 1];
  const outside = !dialog?.contains(document.activeElement);
  const target = outside ? first : event.shiftKey ? document.activeElement === first ? last : null : document.activeElement === last ? first : null;
  if (target) { event.preventDefault(); target.focus(); }
}

// open与onOpenChange直接符合资源外壳契约，不把内部setState传给模板数据层。
// openPicker只由真实点击调用，记住的activeElement就是触发按钮。
// effect在资源外壳挂载后聚焦搜索，React的被动副作用保证节点已经提交。
// 没有定时器和异步回调，关窗不会留下下一次focus抢走用户操作。
// 关闭时仅当来源仍在文档中才归还，页面卸载不聚焦已经断开的旧节点。
// 捕获监听只负责Tab，不消费Escape，公共外壳仍能按原有逻辑关闭。
// 状态在页面内独立，另一资源弹窗不使用本titleId时不会被选中。
// 若真实选模板触发关闭，焦点回到入口后仍可继续打开或导出。
// 选择取消不会调用新增函数，因此历史长度与选中项都保持原样。
// 新增模板之后关闭，用户可以直接Tab到属性栏继续改字。
// effect的清理不清空编辑器，焦点与文档生命周期明确分开。
// 使用稳定openPicker避免属性组件每次收到一份新的打开逻辑。
export function useDialogueTemplatePicker() {
  // trigger保存打开之前的元素，而不是事后从已聚焦的搜索框猜来源。
  // 真实按钮点击会聚焦入口，脚本HTMLElement.click并不保证产生同样焦点行为。
  // 因此回归使用真实指针点击检查归还，不能用一个不聚焦的脚本点击误判产品。
  // openPicker与onOpenChange分工不同：前者登记来源，后者符合外壳关闭回调契约。
  // 不用setTimeout延迟聚焦，避免关闭后计时器还把焦点拉回已消失的搜索框。
  // effect在打开状态注册捕获监听，可以在背后控件收到Tab之前纠正越界焦点。
  // effect cleanup先移除捕获，再归还来源，防止归还动作再次被本边界拦截。
  // isConnected防止路由已离开时聚焦旧DOM，不需要清空应用导航或window焦点。
  // 来源若已卸载就不归还，不随意选择别的同名按钮冒充来源。
  // ref只保持单个元素，不积累每次打开过的按钮数组。
  // 取消关闭不会触发onAdd，选择与历史仍保持在打开前状态。
  // 真正选中模板时，宿主先add再关闭，属性由新UUID自动映射。
  // open状态属于本页面实例，工具箱另一个资源弹窗不共享它。
  // hook不注册Escape，因此不会与ResourceDialogShell重复关窗两次。
  const [open, onOpenChange] = useState(false), trigger = useRef<HTMLElement | null>(null);
  const openPicker = useCallback(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onOpenChange(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.querySelector<HTMLInputElement>("[data-dialogue-search]")?.focus();
    document.addEventListener("keydown", containTab, true);
    return () => {
      document.removeEventListener("keydown", containTab, true);
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [open]);
  return { open, onOpenChange, openPicker };
}
