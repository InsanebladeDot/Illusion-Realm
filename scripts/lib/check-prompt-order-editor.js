/** 提示词分组排序模式回归：使用真实拖拽和键盘输入，草稿与最终生成分开断言。 */
// 复用原 prompt-assistant 的静态页、窗口和隔离文档，不另起 Electron 实例。
// 普通输入与蒙版共享 UI，但每一处最终提交仍由自己的 store 负责。
// 本模块不调用任何 renderer 私有 state setter，所有修改都经产品按钮与手柄。
// 指针输入沿用 check-prompt-drag 的 CDP helper，不能用数组换位桩代替真实操作。
// 初始两组文本由旧翻译回归建立，本模块不清空内容或重新制造默认分组。
// 生成读取的 #prompt-editor 是已确认顺序的观察点，不用排序行视觉位置冒充生效。
// userData 回执同时作为持久化观察点，拖动未确认时不应改变已保存队列。
// 取消和 Escape 分开验证：前者放弃整个会话，后者只中止这一次指针拖动。
// 首次截图保留普通模式，完成后再拍普通模式，可以人工核对返回时的标签顺序。
// 主题通过原产品外观入口切换，不用修改 document 的颜色属性伪造结果。
// 窄屏通过真实尺寸仿真触发 inline 面板，不另外绘制一套手机排序页。
// 页面隐藏着的普通编辑 DOM 应保留，已完成翻译的撤销等状态不能因此丢失。
// 所有等待沿用原套件有界主进程轮询，窗口没有动画帧也不会永久卡住。
// 这不是公网模型、文件导入或安装包升级的验证，场景只涉及当前 UI 与文档状态。
const { drag } = require("./check-prompt-drag");
const rowIds = "[...document.querySelectorAll('[data-prompt-sort-row]')].map(row=>row.dataset.promptSortRow)";

/** 原生键盘走公共 SortableList 的 KeyboardSensor，不手工交换 DOM。 */
// 第一项手柄获取焦点后，空格提起、向下移动、空格放下。
// key 与 code 同时声明，保留浏览器对 Space 和 ArrowDown 的实际识别。
// 每次按下后配套松开，不能让下一次模式操作继承仍被按住的按键。
// 小等待只让库处理当前位置通知，不替代后面的实际草稿顺序断言。
// 当前是纵向列表，向下代表最终提示词顺序中靠后一位。
// 坐标由库测量真实行矩形，测试不会传入一个强行指定的最终下标。
// 拖动结束后依然只改变草稿，真正生成文本必须等待用户点完成。
async function moveWithKeyboard({ win, run, delay }, id) {
  await run(`document.querySelector('[data-prompt-drag-handle="${id}"]').focus()`);
  for (const [key, code, windowsVirtualKeyCode] of [[" ", "Space", 32], ["ArrowDown", "ArrowDown", 40], [" ", "Space", 32]]) {
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    await delay(100);
  }
}

/** 指针草稿、取消、键盘草稿及确认形成一个完整交互闭环。 */
// 首先给原 300ms 文档合并保存留出时间，确保比较对象包含进入排序前的最新输入。
// 草稿拖动后比较整个保存 id 列表，而非只比首项，避免空组移动时漏检。
// 普通区域通过 inert 和 display 隐藏；仍保留 textarea 节点用于检查输入没有丢失。
// 活动分类在本套件一直是第一组，拖动它不能改变编辑目标的身份。
// 取消后的原文必须逐字相同，不能凭“两个组还有字”判断没有丢数据。
// 第一次拖动使用 Escape 取消，保证不会提交连草稿都不应该变化的动作。
// 第二次正常释放确实改变草稿，不能把取消按钮恢复原顺序当成唯一拖拽证据。
// 完成路径改用键盘，可以同时保护复用传感器的两种输入方式。
// 首行编号由 UI 计算，最终断言按业务 id 比较，防止仅改数字而没有改变实际顺序。
// 确认后常规分类栏、真正正文及活动输入三处同时核对，避免只改标签外观。
// 焦点应回到明确的调整顺序按钮，不能留在被卸载的完成按钮上。
// 最后重载检查仍由原主套件执行，这里只需保留它期待的最终队列。
// 原值快照不包含文本复制操作，不会意外覆盖用户系统剪贴板。
// 本轮两个有内容组的字符串是独立写死的预期，不调用生产 assemblePrompt 来算答案。
// 因此拼接公式若出错，测试不能因为复用同一错误公式而一起误判通过。
// 等待 savedIds 的循环有固定上限，失败后精确比较仍会标红，不会空返回当成功。
async function checkSession(context) {
  const { run, wait, click, ids, win, check, capture, delay, savedIds } = context;
  // savedIds 来自隔离文档的写入回执，不是再次从 DOM 读到同一个草稿。
  // 像核对账本与桌上便签，必须分别取值，才能发现便签是否提前写进账本。
  // 300ms 是既有保存合并窗口，这里多留 50ms 让上一条输入先完成保存。
  // 若跳过稳定前置，上一条输入的正常保存会被误认为拖拽引起的写入。
  await delay(350);
  const saved = JSON.stringify(savedIds());
  // 普通态截图在进入模式前取，方便对比原工具栏与最后返回的工具栏。
  // 不在测试里补入示例样式，截图来自静态导出的同一业务页面。
  await capture("prompt-order-browse-before");
  // 从正式入口进入，不能直接挂载子组件绕过父层模式切换。
  // 等待新模式出现后才找手柄，避免对旧普通标签栏发送拖拽。
  await click("[data-prompt-sort-toggle]");
  await wait("document.querySelector('[data-prompt-order-editor]')");
  // 这里同时要求“看不到旧区”和“旧输入还存在”，两者少一项都不够。
  // 仅卸载旧区虽能隐藏，却会丢掉输入工具内部的撤销与请求状态。
  // 仅保留旧区却没隐藏，会把两套交互一起挤在同一面板里。
  // 完成和取消必须同时可达，不能只有一个没有退出路径的拖拽列表。
  check("Order mode replaces normal controls and keeps the input DOM", await run("document.querySelector('[data-prompt-tab-input]').value==='first category description'&&getComputedStyle(document.querySelector('[data-prompt-tab-bar]').parentElement).display==='none'&&!!document.querySelector('[data-prompt-sort-done]')&&!!document.querySelector('[data-prompt-sort-cancel]')"));
  // 从质量组开始向下一项拖动，先覆盖库的撤销路径。
  // Esc 要发生在释放前，否则测到的可能是一次已提交后的普通按键。
  // helper 的 cancel 参数只发送按键，不负责替页面恢复数组。
  await drag(win, run, ids[0], ids[1], true);
  // 验证的是草稿首项，不是已确认标签栏；后者本来就不该发生改变。
  // 如果取消拖动仍更改了草稿，这个读数会直接暴露传感器回调问题。
  check("Escape cancels a pointer drag within the order draft", await run(`${rowIds}[0]===${JSON.stringify(ids[0])}`));
  // 相同起终点再来一次正常放手，区分“不能拖”和“正确取消”。
  // 两次动作之间的归位等待在公共 helper 内，不能沿用半途的矩形。
  // 当前两组正文都非空，后续能用真实拼接字符串识别先后变化。
  await drag(win, run, ids[0], ids[1]);
  await wait(`${rowIds}[0]===${JSON.stringify(ids[1])}`);
  // 账本队列和生成输入都保持旧值，说明草稿没有通过任何一条旁路生效。
  // 只检查持久化不够，错误实现可能先改内存生成词、稍后才落盘。
  // 只检查生成词也不够，空组换位可能已经被悄悄写入文档。
  // 保存快照按完整 id 序列比较，包括后面没有正文的默认分组。
  check("Pointer sorting changes only the draft before confirmation", JSON.stringify(savedIds()) === saved && await run("document.querySelector('#prompt-editor').textContent==='first category description, other category description'"));
  // 使用产品取消按钮退出，而不是关闭窗口或直接取消测试上下文。
  // 这一步检验父层 onCancel 是否结束模式，不能只测子组件本地排序。
  await click("[data-prompt-sort-cancel]");
  // 模式节点消失、原首组回来、正文仍属于原组，三处共同确认返回正确。
  // 不主动给原输入赋值，否则正文丢失会被测试自己修好。
  // 原组身份来自之前真实读取的 ids，不依赖中文显示名的相同拼写。
  check("Cancel returns to the original group order and text", await run(`!document.querySelector('[data-prompt-order-editor]')&&document.querySelector('[data-prompt-tab]').dataset.promptTab===${JSON.stringify(ids[0])}&&document.querySelector('[data-prompt-tab-input]').value==='first category description'`));
  // 新会话必须从旧确认顺序起步，而不是复活刚刚取消的草稿。
  // 键盘帮助方法只移动一个位置，因此后续到达第二组首位也验证了这个前提。
  await click("[data-prompt-sort-toggle]");
  await moveWithKeyboard(context, ids[0]);
  await wait(`${rowIds}[0]===${JSON.stringify(ids[1])}`);
  // 键盘与鼠标应共享草稿提交边界，不能其中一个传感器绕过确认直接保存。
  // 此时草稿已经换位，生成正文还要保持旧序；两份不同读数是必要对照。
  check("Keyboard sorting also keeps generation uncommitted", await run("document.querySelector('#prompt-editor').textContent==='first category description, other category description'"));
  // 放下键盘拖动后再截图，避免把浮动中的位置当作最终排序态。
  // 模式栏和行序号都从真实界面捕获，后期不添加完成按钮或文字。
  await capture("prompt-order-edit-keyboard");
  // 完成是唯一应改变生成顺序的操作，后面等待两个条件同时成立。
  // 如果只退出模式没更新 store，正文断言会失败；反之模式节点断言会失败。
  // 不以一个成功提示代替正文读数，因为当前操作本来就不显示网络保存回执。
  await click("[data-prompt-sort-done]");
  await wait("!document.querySelector('[data-prompt-order-editor]')&&document.querySelector('#prompt-editor').textContent==='other category description, first category description'");
  // 排在首位的组和当前编辑的组故意不同，才能发现按下标误切换的错误。
  // aria-pressed 检查活动身份，textarea 检查身份对应的实际内容。
  // activeElement 则检验键盘用户退出后的起点，没有用手工 focus 补救。
  // 如果 focus 留在 body，下一次 Tab 可能回到页面最前面，这里会明确失败。
  check("Done returns to the arranged browse state and restores focus", await run(`document.querySelector('[data-prompt-tab]').dataset.promptTab===${JSON.stringify(ids[1])}&&document.querySelector('[data-prompt-tab="${ids[0]}"]').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-prompt-tab-input]').value==='first category description'&&document.activeElement===document.querySelector('[data-prompt-sort-toggle]')`));
  // 最终普通态和首次截图采用同一尺寸，能直接查看标签位置是否交换。
  // 截图仅补充视觉证据，不能替代上面严格的身份、正文和焦点断言。
  await capture("prompt-order-browse-after");
}

/** 已确认顺序跨宽窄布局保留，未确认会话不在面板重建时自动提交。 */
// 宽屏与 inline 是既有挂载分支，切换时局部排序会话可以取消，但持久队列不能重置。
// 每次进入都从当前已确认队列开始，新的排序实例不复活上一实例的临时便签。
// 浅色与深色采用相同操作流和真实组件，截图不能用不同代码路径拼接。
// 截图前打开编辑态，让模式栏、拖拽行和固定动作都在可见区域。
// 窄屏检查实际 editor 的 scrollWidth，不能只在根元素设置 overflow-hidden 蒙混过关。
// 单个列表和模式栏是结构要求，不允许 inline 迁移后残留两套拖拽操作。
// 点击取消后再清除设备仿真，避免对正在卸载的排序 DOM 继续发送输入。
// 深色截图后返回浏览态，后续原凭据和预设删除回归不应被排序模式遮住。
// 实机触屏、读屏和任意高度窗口仍不由这些程序输入与截图推断为通过。
// 这里不验证将草稿带到别的页面编辑，那不属于当前局部模式的保存承诺。
async function checkAppearance(context) {
  const { win, click, wait, capture, setTheme, run, check, ids } = context;
  // 主题入口会经过项目原有偏好与 nativeTheme 链路，不注入第二套 dark 类。
  // 先切主题再进入模式，避免把主题菜单本身截进排序截图。
  // 上一个流程已完成保存，后面的外观操作不得改变已确认队列。
  await setTheme("light");
  await click("[data-prompt-sort-toggle]");
  // 浅色截图包含原应用导航，用于核对新组件与现有页面的颜色关系。
  // 浏览器截图仍是本地页面证据，不是设计稿或手工绘制的参考图。
  await capture("prompt-order-edit-light");
  // 仿真改变的是实际 CSS 视口；布局仍通过原创建容器测量得到。
  // 900px 是本套件可进入 inline 分支的尺寸，不向业务代码加入测试断点。
  // deviceScaleFactor 固定为一，避免截图尺度变化干扰本轮横向溢出判断。
  // 这不是触控设备模拟，mobile=false 不声称已经验证手机输入法或触屏。
  await win.webContents.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width: 900, height: 1000, deviceScaleFactor: 1, mobile: false });
  // 等待真实 variant 切换，旧排序组件理应因宿主迁移卸载。
  // 不存在排序节点才代表未确认会话已丢弃，不能把旧草稿迁到新容器冒充保存。
  // 普通确认队列仍由全局业务 store 持有，不依赖刚卸载的局部状态。
  await wait("document.querySelector('[data-prompt-assembly]')?.dataset.promptAssemblyVariant==='inline'&&!document.querySelector('[data-prompt-order-editor]')");
  // 窄屏重新点击入口，检验的是新宿主里的完整模式生命周期。
  // 不直接让旧编辑器变窄，因为那样无法保护 remount 的草稿边界。
  await click("[data-prompt-sort-toggle]");
  // list 的数量防止旧面板和新面板同时留下一套可操作排序区域。
  // scrollWidth 与 clientWidth 都读编辑器本身，检测行内容是否挤出容器。
  // 一像素容差只处理浮点布局取整，不允许用大容差吞掉长文本溢出。
  // 固定模式栏的可视位置还需结合截图人工核查，结构数量不能证明全部几何。
  check("Narrow ordering has one fixed mode bar and no horizontal overflow", await run("document.querySelectorAll('[data-prompt-sort-list]').length===1&&document.querySelector('[data-prompt-order-editor]').scrollWidth<=document.querySelector('[data-prompt-order-editor]').clientWidth+1"));
  // 窄窗口截图保留真实行列表与取消/完成，检查按钮没有被说明文字挤走。
  // 此处不截一个脱离宿主的组件画布，滚动归属继续由真实父区域决定。
  // inline 面板位于输入框下方，进入模式不会自动把整张创建表单滚走。
  // 截图前模拟用户把面板滚到中央，才能看到全部行，而不是仅截到第一行。
  // 只用原生滚动，不把面板改成 fixed 或缩放内容来让截图好看。
  await run("document.querySelector('[data-prompt-order-editor]').scrollIntoView({block:'center'})");
  await capture("prompt-order-edit-narrow");
  // 先显式取消再恢复尺寸，不让环境清理意外变成产品的确认动作。
  // clearDeviceMetricsOverride 只恢复仿真，不修改窗口里任何分组内容。
  await click("[data-prompt-sort-cancel]");
  await win.webContents.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
  // 回到 panel 后才找产品主题菜单，避免点击仍在迁移中的旧 DOM。
  // 轮询继承主套件的超时，无法恢复宽屏时必须失败并保留诊断。
  await wait("document.querySelector('[data-prompt-assembly]')?.dataset.promptAssemblyVariant==='panel'");
  // 深色也通过同一正式入口，不在已有排序节点上强改颜色变量。
  // 两张主题截图使用相同业务内容，差异只来自真实主题信号。
  await setTheme("dark");
  await click("[data-prompt-sort-toggle]");
  // 深色图用于核查轻边框、灰字和活动标记，不把截图存在等同对比度达标。
  // 需要打开图片人工检查文字，而不是只看 capture 没抛异常就通过视觉验收。
  await capture("prompt-order-edit-dark");
  // 最后一轮没有拖动，取消应只结束查看模式，不产生新的正文顺序。
  // 返回普通态后再读标签栏，避免误读仍留在隐藏区域中的旧节点。
  await click("[data-prompt-sort-cancel]");
  // 经过两次宿主迁移与两次主题切换，首次确认的第二组仍应排首位。
  // 精确文本一并检查，防止仅保存标签位置却在正文恢复时退回默认顺序。
  // 后续主套件还会重载文档；这里关注的是同一页面内的响应式生命周期。
  check("Closing ordering after responsive changes keeps the confirmed queue", await run(`document.querySelector('[data-prompt-tab]').dataset.promptTab===${JSON.stringify(ids[1])}&&document.querySelector('#prompt-editor').textContent==='other category description, first category description'`));
}

// 子流程按顺序执行，共用同一个隔离文档，但不共享产品的临时排序状态。
// 上一步有失败就交给原套件异常边界，不通过恢复旧数组掩盖失败。
module.exports = async context => {
  await checkSession(context);
  await checkAppearance(context);
};
