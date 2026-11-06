/**
 * 在真实 Chromium 页面发送鼠标输入，验证共用拖拽容器真正改动提示词队列。
 * 不直接调用 store，也不把点击箭头当成拖拽成功的证据。
 * 测试窗口由调用方隔离，输入不会发送到用户桌面或当前前台程序。
 */

// 坐标来自手柄和整组实际矩形，分类换行后仍按真实布局命中目标。
// 起点选择手柄，终点选择目标组中心，避免将标签点击误认为拖动。
// 先滚动到可见位置，再取矩形，不使用页面首次加载时的过期坐标。
// 坐标夹具的前提：
// 调用方已经打开高级组装并开启排序，页面应该存在真实手柄。
// 两个传入值来自页面实际读取的默认分类 id，不用显示名称拼路径。
// 默认 id 是应用内部固定身份，不接受用户提供的任意选择器片段。
// 这里没有跨进程文件操作，也不会把用户本地路径写到测试输出。
// 测试使用现有已构建的静态页面，不临时注入另一套分类栏。
// 起点取按钮中心，可以避开一像素描边造成的边界命中误差。
// 终点取目标整组中心，与库用完整分类矩形做碰撞的方式对应。
// 如果终点也取手柄中心，宽标签可能被库判断成仍在邻居一侧。
// 滚动行为是浏览器原生 scrollIntoView，不偷偷改页面 fixed 布局。
// 只滚到最近位置，避免把整个应用滚动到与用户操作无关的页面顶部。
// 读取坐标发生在输入之前，而不是把截图中的坐标硬编码进脚本。
// 因此面板宽度、主题字体或分类折行变化都会重新参与命中计算。
// 找不到节点时应让本步骤失败，不用默认坐标点击页面左上角掩盖缺控件。
// 元数据或正文的值不参与坐标计算，长文本不会改变拖拽身份。
// 坐标从 renderer 返回为普通对象，测试不获取 DOM 节点的跨进程引用。
// 调用方的 run 有当前窗口边界，不能误取另一个已打开应用的元素。
async function coordinates(run, source, target) {
  return run(`(() => {
    const from = document.querySelector('[data-prompt-drag-handle="${source}"]');
    const to = document.querySelector('[data-prompt-drag-handle="${target}"]');
    from.scrollIntoView({ block: 'nearest' });
    const a = from.getBoundingClientRect();
    const b = to.parentElement.getBoundingClientRect();
    return { x: a.x + a.width / 2, y: a.y + a.height / 2,
      endX: b.x + b.width / 2, endY: b.y + b.height / 2 };
  })()`);
}

// 统一鼠标消息格式，抬起时清空 buttons，其他步骤保持左键按住。
// 这层只发送输入，不读写生产队列，也不把一次协议回执当成业务成功。
// 坐标由实际页面提供，消息不会越过传入 webContents 发到系统桌面。
// button 描述此次输入涉及的键，buttons 描述当前仍然按住的键，两者不能混用。
// 移动消息维持 buttons=1，PointerSensor 才能把这些步骤视为同一次拖动。
// 抬起后 buttons=0，下一次抓取不会沿用上一项的激活状态。
// clickCount 不用来判断排序成功；成功只由页面队列与生成文本判定。
async function pointer(win, type, x, y) {
  await win.webContents.debugger.sendCommand("Input.dispatchMouseEvent", {
    type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
  });
}

// 取消需要按下和松开完整配对，后续场景才能继续收到正常输入。
// 不用 renderer 内 dispatchEvent 冒充这个浏览器键盘事件。
// 错误向上传播，由主套件统一报告，不在这里吞成成功取消。
async function escape(win) {
  const key = { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 };
  await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { ...key, type: "keyDown" });
  await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", { ...key, type: "keyUp" });
}

// 分段移动跨过既有四像素激活阈值，再进入目标组，不瞬移触发测试旁路。
// 每步有限等待让 React 接收原生事件，不依赖窗口是否有可见动画帧。
// Escape 通过同一 Chromium 输入通道发出，取消路径不会补一次成功落点。
// 释放鼠标放在 finally，即便中间报错也不会给后面的测试留下按住状态。
// 输入链路的证明范围：
// Input.dispatchMouseEvent 由 Chromium 接收，经过实际指针传感器和页面监听。
// 它不是给生产组件额外暴露一个测试专用的 reorder 入口。
// 按下事件声明 left 和 buttons=1，后续移动保持按住左键的状态。
// clickCount 按原生输入格式给出，不伪造一次双击或右键菜单动作。
// 八步移动先越过激活阈值，再接近终点，覆盖真正的拖起和让位过程。
// 每步等待很短且总次数固定，测试不会无上限地依赖动画是否结束。
// 等待发生在测试主进程，离屏页面没有绘制帧也能继续推进步骤。
// 生产代码没有借用这段等待来伪造进度或制造用户可见成功。
// 移动过程中没有 click 目标组，避免把选中变化冒充数组排序变化。
// 最后释放位置使用与移动终点相同坐标，防止落点在释放时突然跳回。
// 取消路径先按 Esc 再松鼠标，确认撤销不依赖把指针移出窗口。
// 按键的 key 和 code 都声明 Escape，不使用一个无关字符去触发浏览器快捷键。
// 同时发送 keyUp，避免后面的场景仍被浏览器认为 Esc 按着。
// finally 只负责释放鼠标，不吞掉之前的输入通道错误。
// 若协议调用失败，异常继续上交主套件，不能靠 check(true) 标成成功。
// 工具在调用方已有 debugger 会话里工作，不重复 attach 抢占连接。
// 不 detach 调用方连接，后续浅深主题和窄屏仿真还要继续使用它。
// 该 helper 不创建 Electron 窗口，因此不会另开并发冒烟或抢单实例锁。
// 所有操作仅针对传入窗口，不使用系统全局鼠标，也不要求用户切回桌面。
// 这证明的是 Chromium 指针交互，不等同于人工实测触屏和手写笔。
// 触屏命中区域与手柄布局仍可以从真实截图人工检查。
// 本例不宣称验证了键盘方向排序，Esc 只覆盖取消这一项键盘输入。
// 取消是业务不应变更的路径，不能为了便于断言主动恢复一个旧数组。
// 被测页面应自己保留原队列，测试只读取其实际结果。
// helper 不持有分类对象快照，不会通过回写状态替页面补救失败。
// 释放输入后由外层 wait 检查真实 UI，固定小等待不能代替结果断言。
// 多个拖动严格串行完成，避免两个手柄同时处于按下状态。
// 后续若用于其他共用容器，应先提供它自己的坐标定位，不复用提示词选择器。
async function drag(win, run, source, target, cancel = false) {
  const point = await coordinates(run, source, target);
  await pointer(win, "mousePressed", point.x, point.y);
  try {
    for (let step = 1; step <= 8; step += 1) {
      await pointer(win, "mouseMoved", point.x + (point.endX - point.x) * step / 8,
        point.y + (point.endY - point.y) * step / 8);
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    if (cancel) await escape(win);
  } finally {
    await pointer(win, "mouseReleased", point.endX, point.endY);
    // 释放后库还有归位过渡；下一次取矩形必须等它结束，否则取到的是途中的坐标。
    // 这里等待大于库默认的 200ms 过渡，只用于测试连续拖动的前置稳定。
    // 真实队列结果仍由外层 wait 和正文断言决定，不因为等过时间就算成功。
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

module.exports = { drag };
