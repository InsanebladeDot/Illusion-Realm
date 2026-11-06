"use client";

/** 合成台的本地编辑会话：内容历史、选择和手势分开，不产生第二套用户文档。 */
// 内容像一叠画稿，撤销取回上一张；选中的笔不写在纸上，所以选择不进历史。
// 指针拖动先保留手势起点，松手才把起点放进历史，避免一次拖动需要撤销几十次。
// 真实机制是gesture保存起始文档，移动只替换present，结束统一压入past。
// 静态模板不是用户草稿，返回工具箱后本轮内存会话自然释放。
// 不沿用旧localStorage工程，避免把旧六张PNG的失效id当成当前模板。
// 页面内存状态属于单个编辑器实例，不需要全局Context或跨工具选中store。
// 历史上限50步，图片data URL作为不可变字符串共享，不为每步复制解码像素。
// 导入失败发生在提交之前，因此不会破坏已经编辑的气泡和背景。
import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogueDocument, DialogueLayer } from "./dialogue-types";
import { createDialogueLayer, type DialogueTemplate } from "./dialogue-data";

import { changeHistory, travelHistory, patchDialogue, INITIAL_DOCUMENT, type DialogueHistory } from "./dialogue-history";

// 历史hook只持有内容与手势起点，选择由外层编辑器单独持有。
// 函数式setState保证连续pointermove始终基于最近的实际文档。
// endGesture从ref取起点后立刻清空，lostpointercapture再次到达不会重复压历史。
// 没移动过时present与起点是同一对象，因此不创建无意义的撤销步骤。
// undo与redo共同使用纯历史助手，组件中没有第二套分支算法。
// 手势开始只读当前快照，不提前压历史，取消选择不会留下空步骤。
// 所有ref读取发生在事件回调内，不把ref当作渲染数据。
// 页面卸载后该hook随实例释放，不对其他工作区广播历史变化。
function useDialogueHistory() {
  // React state负责当前可见文档，ref只登记尚未完成的一次手势起点。
  // 不能把present只放ref，否则位置改变不会通知画布重新渲染。
  // 也不能把每次move起点放state，否则触发额外渲染且容易错用上一次事件值。
  // change把转换函数交给setHistory，React排队执行时仍读取最新current。
  // 这像流水账按上一笔余额结算，不能每笔都照最初余额计算覆盖。
  // 真实机制是函数式状态更新，不是把history对象放入事件闭包后直接替换。
  // remember在transform之后统一处理，所有字段修改共享相同分支清理规则。
  // undo和redo的useCallback只依赖稳定setHistory，不随文字输入反复改变身份。
  // startGesture读取此刻present引用，图片和旧图层都仍包含在这份起点里。
  // 拖动时不可变更新确保present变为新对象，才能用引用判断是否真的发生过移动。
  // endGesture立刻清空ref，即使lostpointercapture再调用一次也不产生第二份记录。
  // 最终入栈使用current.present，不能把终点覆盖成start导致松手时跳回原位。
  // future在完成手势后清空，旧重做分支不能覆盖用户的新位置。
  // slice(-50)丢弃的是最久之前的历史，和当前layers数量没有关系。
  // 普通编辑不经过gesture，输入和数值确认仍使用remember=true记录自己的起点。
  // 各编辑器调用一次hook就有一套独立history，不写到模块级可变数组。
  // 此处只暴露方法和历史事实，不负责显示通知或把所有变化保存到磁盘。
  // 卸载释放手势ref后，页面不会保留一个后台“仍在拖动”的全局状态。
  const [history, setHistory] = useState<DialogueHistory>({ present: INITIAL_DOCUMENT, past: [], future: [] });
  const gesture = useRef<DialogueDocument | null>(null);
  const change = useCallback((transform: (doc: DialogueDocument) => DialogueDocument, remember = true) => {
    setHistory(current => changeHistory(current, transform, remember));
  }, []);
  const undo = useCallback(() => setHistory(current => travelHistory(current, "undo")), []);
  const redo = useCallback(() => setHistory(current => travelHistory(current, "redo")), []);
  const startGesture = () => { gesture.current = history.present; };
  const endGesture = () => {
    const start = gesture.current;
    gesture.current = null;
    if (start) setHistory(current => current.present === start ? current : { ...current, past: [...current.past, start].slice(-50), future: [] });
  };
  return { history, change, undo, redo, startGesture, endGesture };
}

// 编辑器组合层负责选择与用户意图，历史细节由上面的hook承担。
// add每次创建新UUID，选中两份相同模板时文字仍各自独立。
// 删除只认selectedId；空白画布没有选择时Delete不会删除最后一个气泡。
// 删除后清空选择，撤销能恢复内容，但不会擅自把焦点跳回旧控件。
// patch显式传remember，拖动过程与字段确认共用相同图层更新边界。
// 选中层从当前文档派生，历史里没有该id时立即显示属性空态。
// 通过回调暴露意图，不向UI泄露past数组让按钮直接修改历史。
// clear使用稳定回调，文字输入不会导致全局键盘监听无意义反复注册。
// canUndo与canRedo只来自实际历史长度，不用定时器猜测按钮是否可用。
// 图层中心由当前自然画布尺寸决定，竖版或背景导入后仍放在可见中央。
// 不因为资源搜索为空而清空已经画好的气泡，两个状态生命周期不同。
// 模板目录只读，新增气泡不会把用户修改写回内置示例文字。
// 此hook是局部会话，不把内容写入全局状态影响其他工具。
// 纯UI筛选与弹窗显隐由各自组件持有，不进入撤销历史。
export function useDialogueEditor() {
  // selectedId表示当前操作对象，不能直接保存某个旧layer对象作为长期选择。
  // 否则patch产生新对象后，属性栏仍会读到修改前的旧文字和位置。
  // 每次从present.layers查找当前id，因此撤销恢复的字段也能立即回填。
  // 当撤销删除了刚新增的对象时，find返回空，属性显示空态而不是幽灵对象。
  // add先建立新层，再把UUID设为选择，下一次渲染即可显示对应属性。
  // new UUID与templateId各司其职，保证同款样式能重复添加而不共享内容。
  // append把新气泡放到数组末尾，SVG同样按数组顺序画在最上方。
  // 删除使用filter创建新数组，旧历史快照中的层仍存在，可被撤销恢复。
  // clear不修改doc，所以Escape取消选择不消耗一次撤销机会。
  // remove是useCallback且依赖selectedId，键盘监听拿到的是最新删除目标。
  // 如果没有选择，remove直接返回，不把空操作压进past。
  // patch的remember缺省true，只有画布拖动明确传false跳过中间历史。
  // 其他调用方不需要理解gesture ref，使用同一个patch入口即可。
  // change向UI暴露文档级转换，用于背景和画布尺寸这类不属于某一层的动作。
  // 不向UI暴露setHistory，避免某个按钮只更新present却忘了处理future。
  // canUndo与canRedo是布尔派生，不能从“上次点击过按钮”推测可否撤销。
  // 不把用户文字写回静态DIALOGUE_TEMPLATES，库里下次添加仍使用自己的样例。
  // 选择状态不需要持久化，因为当前作品也是本地会话，重进页面明确从新作品开始。
  // 自定义资源恢复只影响templates查找，不调用此hook的add来自动恢复旧图层。
  // 返回值中selected为null时，props消费者必须走空态而非断言成一个假层。
  const { history, change, undo, redo, startGesture, endGesture } = useDialogueHistory();
  // 选中是调整样式，编辑是允许改字，像先点选便签、再打开便签正文。
  // 两个id只属于界面，不进内容历史，因此解锁输入不会增加撤销步骤。
  // 每次单击重新选择都会锁回正文，防止切换对象仍沿用上一层编辑权限。
  // editingId保留原层身份，撤销删除该层时派生editing自然变为false。
  // 不给未选中图层隐式解锁，快捷键删除和属性修改始终有明确对象。
  // rawSelect只在这两个入口内使用，添加模板也走select恢复锁定状态。
  const [selectedId, rawSelect] = useState<string | null>(null), [editingId, edit] = useState<string | null>(null);
  // select集中锁定规则，模板新增、画布单击和图层列表单击不会各写一套分支。
  // 单击已选中的同一层也会结束正文编辑，这是明确从输入回到对象选择的动作。
  // editText只在双击或键盘解锁入口调用，不因读取属性组件而自动执行。
  // 编辑许可不随undo/redo移动，内容历史只保存用户作品，不保存鼠标的阅读模式。
  // 删除当前层后select(null)同步失效许可，撤销恢复内容也不会自动开始打字。
  // 同款模板的UUID不同，解锁一份不能让另一份的textarea也变为可写。
  // clear使用稳定select回调，窗口级快捷键不必为每次编辑许可变化重装监听。
  // selectedId等于editingId还要求非空，不能因两个null相等就把空态误判为编辑中。
  // 图层被撤销移除时selected派生为空，属性区不会渲染一个悬空正文输入。
  // 完成文字编辑走select(currentId)，保留选择但立即锁定正文。
  // 这不等于保存文件；离开页面仍遵守当前会话需导出PNG的边界。
  // 字体选择与编辑许可完全独立，加载字体不会调用editText或夺取输入焦点。
  // remove的useCallback依赖select，确保实际删除继续走同一锁定规则。
  // 选中与编辑状态都是局部React状态，不新增Zustand段或用户JSON字段。
  const select = useCallback((id: string | null) => { rawSelect(id); edit(null); }, []);
  const editText = (id: string) => { rawSelect(id); edit(id); };
  const clear = useCallback(() => select(null), [select]);
  const patch = (id: string, values: Partial<DialogueLayer>, remember = true) => change(doc => patchDialogue(doc, id, values), remember);
  const add = (template: DialogueTemplate) => {
    const layer = createDialogueLayer(template, history.present.width / 2, history.present.height / 2);
    change(doc => ({ ...doc, layers: [...doc.layers, layer] }));
    select(layer.id);
  };
  const remove = useCallback(() => {
    if (!selectedId) return;
    change(doc => ({ ...doc, layers: doc.layers.filter(layer => layer.id !== selectedId) }));
    select(null);
  }, [change, selectedId, select]);
  useDialogueKeys(undo, redo, remove, clear);
  return {
    doc: history.present, selected: history.present.layers.find(layer => layer.id === selectedId) ?? null,
    select, editText, editing: selectedId === editingId && selectedId !== null,
    change, patch, add, remove, undo, redo, startGesture, endGesture,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
  };
}

// 键盘只管理本页的内容操作，文字输入框里的Delete和Ctrl+Z交给原生编辑。
// Escape取消选择，不删除图层；Delete仅在选中真实气泡时生效。
// 修饰键兼容Windows Ctrl与Mac Command，不在编辑文字时抢撤销。
// Tab与其他按键不被拦截，用户仍能走完按钮、搜索和属性字段。
// 每次依赖变化注销旧监听，避免闭包读到上一次选中的图层。
// 监听绑定在页面生命周期，不写到整个应用的键盘注册表。
// contenteditable同样视作编辑区，未来使用输入控件不会误删图层。
// Shift+Ctrl+Z与Ctrl+Y都用于重做，不要求用户知道两种系统差异。
// 快捷键只在页面实际挂载时存在，返回工具箱后清理。
// 不对未命中的普通按键preventDefault，方向键与浏览器访问能力保留。
// 实际undo/redo检查历史是否存在，不制造空步骤或成功反馈。
// 元素类型判断发生在浏览器事件中，不影响服务端静态预渲染。
// 搜索框即使没有选中文字也受保护，按Backspace不会删除气泡。
// 下拉菜单的内部按钮由菜单处理键盘，不把选择文本当画布命令。
// 点击色板时焦点留在交互元素，删除操作仅在普通画布焦点时可用。
// 不从键盘事件读取文件路径或触发图片导入。
function useDialogueKeys(undo: () => void, redo: () => void, remove: () => void, clear: () => void) {
  // 键盘目标判断先于preventDefault，输入框原生Delete与撤销不会被抢走。
  // 资源弹窗检查使用data标记，也覆盖没有aria-modal的主区资源页形态。
  // 只挡住当前页面的内容快捷键，弹窗自己的Escape仍由公共外壳处理。
  // textarea是输入正文的地方；input也包含字号、宽度和搜索草稿。
  // select与role=listbox的内部导航由选择控件负责，不解释成画布命令。
  // contenteditable为未来富文本控件保留编辑边界，不因为不是textarea就删整层。
  // SVG的g不是HTMLElement，仍可作为画布目标收到Delete，不能只接受HTML按钮。
  // 全局监听存在是为了列表选择后也可删除，但操作仍只针对本编辑器selectedId。
  // Delete没有选择时不会移除任何层；remove内部是最终无选中边界。
  // Ctrl与Command共享内容命令，普通z键不触发撤销。
  // 以toLowerCase兼容大小写事件值，Shift加Z不能漏掉而变成普通字符。
  // Ctrl加Y即使没有Shift也表示重做，Ctrl加Shift加Z保持相同结果。
  // 拦截命令时调用preventDefault，避免浏览器对页面再执行另一份撤销动作。
  // Escape只清选择，不阻止默认传播，让其他已存在的页面级关闭逻辑继续处理。
  // 监听清理使用同一个key函数，不能新建匿名函数试图remove旧监听。
  // 依赖变化会先清旧后挂新，删除目标不会因闭包缓存停留在前一个实例。
  // 代码不监听keyup，所以按键释放时不会再删除一次下一层。
  // 长按Delete可以产生重复keydown，但第一次删除后选择为空，后续不会连删全画布。
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // 弹窗打开时暂停画布快捷键，避免在模板库按Delete误删背后的气泡。
      // Element同时覆盖HTML与SVG；SVG图层获得焦点后也能安全识别编辑区域。
      // 窄窗资源页同样由data-resource-dialog标记，不能只检查aria-modal。
      if (document.querySelector("[data-resource-dialog]")) return;
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=listbox]")) return;
      if (event.key === "Escape") clear();
      else if (event.key === "Delete") { event.preventDefault(); remove(); }
      else if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
        event.preventDefault(); if (event.shiftKey || event.key.toLowerCase() === "y") redo(); else undo();
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [undo, redo, remove, clear]);
}
