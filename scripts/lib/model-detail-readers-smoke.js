/**
 * 两种模型详情共同验证文字阅读和复制，页面仍使用生产组件。
 * 测试夹具包含多颗触发词，至少一个来源数组项包含逗号。
 * 说明至少二十五行，能实际超过默认六行和展开后的十五行窗口。
 * 断言使用 DOM 尺寸与滚动位置，不把按钮存在当作功能通过。
 * 复制只替换浏览器剪贴板边界，不覆盖用户系统剪贴板中的任何内容。
 * 产品 copyText 和按钮事件仍真实执行，捕获的是它实际提交的文字。
 * 这能发现标签未拆分、单词复制带入其他词或整组漏掉尾逗号。
 * 不据此宣称所有系统的剪贴板权限都可用；拒绝分支另有明确断言。
 * 原有 navigator 属性在 finally 恢复，不能影响后续创建页触发词回归。
 * 一个入口完成后不保留文字区状态，另一个脚本使用自己的独立窗口。
 * run、click、wait 和 check 由原冒烟宿主注入，不启动第二个 Electron。
 * 固定 CSS 尺寸期望来自需求，不从生产常量导出后互相证明正确。
 * 所有等待沿用宿主有界轮询，失败保留为非零退出而不是静默跳过。
 * 两组 fixture 的词语不同，能发现公共组件意外复用上一个实例的数据。
 * expected[0] 故意是带空格的短语，空格分词的错误也会失败。
 * 全组期望不含空格分隔符，明确区分 foo,bar, 与 foo, bar。
 * 末尾逗号独立保留，不能把常见的 join 结果直接当成合规格式。
 * 标签个数由调用方固定给定，数组长度为一不能被错误地拿来当标签数。
 * 这里只验证当前详情区域；测试窗口中不存在第二个选中模型。
 * 来源适配器和浏览器渲染真实运行，不直接调用公共组件的内部方法。
 * 数据保存是否保留原词组由宿主原有下载断言独立验证。
 * 两类断言结合才能发现“看起来拆好了，却把原数据也覆盖”的回归。
 * 剪贴板替身返回 Promise，保留生产复制的异步调度顺序。
 * 检查必须等待回执，不能在 click 结束时假设复制一定已经完成。
 * 第一项复制后再复制全部，能发现按钮错误复用第一次输入的闭包。
 * 拒绝用 Error 生成，模拟浏览器权限不足而非向组件直接塞失败文案。
 * Toast 必须经过原有封装出现，不通过测试代码主动调用提示仓库。
 * finally 不论断言是否通过都执行，防止替身泄漏影响后续页面。
 * 恢复 own descriptor 或删除覆盖，保留浏览器原生原型链中的实现。
 * 测试临时属性不参与应用持久化，关闭窗口时随会话一起销毁。
 * 该测试不会读系统剪贴板，也不收集用户之前复制的文本。
 * 真实系统权限弹窗和跨应用粘贴属于尚未覆盖的人工验证项。
 * 数据标记用于定位按钮，不依赖中文“复制”在当前语言里的拼写。
 * 失败提示断言使用夹具固定的 zh-CN，会话语言由宿主文档明确设置。
 * 没有通过鼠标模拟选中文字，因此不会误把浏览器默认复制当作按钮能力。
 * 标签和整组按钮都是 type=button，测试不调用任何 form 提交流程。
 * 此 helper 不验证标签的语义是否适合某个模型，只验证文本操作契约。
 */
async function verifyTriggerCopies({ run, click, wait, check }, expected) {
  // 覆盖实例属性而非全局 Clipboard 原型，恢复时保留原有 getter 的语义。
  // 临时槽仅存在于冒烟窗口，正式页面不提供该旁路或测试分支。
  // 第一条检查先独立核对分词，避免错误的整组输出碰巧与错误按钮一致。
  // 固定词组期望由调用方提供，不拿页面自身拆分结果当期望值。
  // 连续逗号和尾逗号应被过滤，不能产生一颗看不见的空按钮。
  // 词内空格应保留，多词短语不可以再按空格拆成多颗按钮。
  check("trigger words split comma groups into individual tags", await run(`JSON.stringify([...document.querySelectorAll('[data-copy-trigger-word]')].map(el=>el.textContent))===${JSON.stringify(JSON.stringify(expected))}`));
  await run("window.__clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__triggerCopy=text}}})");
  try {
    await click('[data-copy-trigger-word]');
    await wait(`window.__triggerCopy===${JSON.stringify(expected[0])}`);
    check("single tag copies only its own phrase", await run(`window.__triggerCopy===${JSON.stringify(expected[0])}`));
    await click('[data-copy-trigger-words]');
    await wait(`window.__triggerCopy===${JSON.stringify(expected.join(",") + ",")}`);
    check("copy all joins tags with commas and a trailing comma", await run(`window.__triggerCopy===${JSON.stringify(expected.join(",") + ",")}`));
    // 复制拒绝必须由产品公共封装接住，不能产生未处理 Promise 或虚假成功。
    // 成功与失败经过同一个按钮回调，不单独调用一个未被使用的错误处理方法。
    // 只检查本次明确的失败提示，前面留下的成功 Toast 不能冒充它。
    await run("void(navigator.clipboard.writeText=async()=>{throw new Error('Fixture permission denied')})");
    await click('[data-copy-trigger-word]');
    await wait("document.body.innerText.includes('复制失败')");
    check("clipboard rejection is reported to the user", true);
  } finally {
    await run("if(window.__clipboardDescriptor)Object.defineProperty(navigator,'clipboard',window.__clipboardDescriptor);else delete navigator.clipboard;delete window.__clipboardDescriptor;delete window.__triggerCopy");
  }
}

/**
 * 前置为包含长说明的已选模型，在线说明的原生 details 可仍然关闭。
 * 先由真实 summary 点击展开分组，验证隐藏时零宽度不会丢掉展开按钮。
 * 默认高度应不超过六行、约 120px，同时原文仍能被浏览器识别为溢出。
 * 展开时去掉行裁切，十五行窗口约 300px，所有原文仍保留在同一节点。
 * 设置 scrollTop 后读回正数，证明用户真的可以滚动到后文。
 * 收起后必须回到顶部，不能让六行窗口停在说明中段。
 * aria-expanded 也要同步变化，键盘与辅助设备得到同一个状态。
 * 按钮检查使用真实 click，不直接写入组件的 React 状态。
 * 展开不会改变模型身份或触发网络操作，本 helper 不处理下载和资料补全。
 * 宿主可在 helper 返回后截图，此时说明为用户主动展开后的滚动模式。
 * 失败会继续由原 harness 记录，不吞掉几何或事件异常。
 * 使用真实 scrollHeight 与 clientHeight，可发现 CSS 类未打入静态导出的情况。
 * 六行高度允许 1px 取整误差，不能宽松到任意固定高度都算通过。
 * webkitLineClamp 检查省略机制，只有 overflow:hidden 没有末尾省略不符合要求。
 * 初始断言发生在点击展开前，不能用展开后的高度反推默认状态。
 * 展开后的段落必须能获得 Tab 焦点，鼠标滚动并非唯一阅读路径。
 * 原文是可识别的固定句子，宿主同时保留模型与版本说明内容断言。
 * 展开后没有凭截图推测滚动可用，而是写入并读回真实 scrollTop。
 * scrollTop 选 80px，足够跨过数行又不会超过这个长夹具的最大滚动范围。
 * 300px 是上限而非强制固定值，较短的说明自然高度可以更低。
 * 收起断言同时检查滚动位置和 aria-expanded，不只匹配按钮文案。
 * 紧接着再次展开，为截图保留用户可见的完整阅读形态。
 * scrollIntoView 只把操作按钮带入视口，不删除或隐藏应用外壳。
 * 先等待真实几何包含关系，避免截到离屏窗口尚未更新的中间绘制帧。
 * 截图前短暂等待只用于合成器刷新，功能就绪仍靠尺寸和 DOM 条件判断。
 * 若文字画到下一块文件信息上，容器包含断言会报错而不是靠截图主观放过。
 * 模型说明仍在原生详情分组内，外层折叠是用户点击，不由测试伪造状态。
 * 本地短模型的重置回归在宿主执行，因为只有宿主知道实际文件与目录身份。
 * 两个来源共享测试方法，但各自的模型读取、版本选择和错误处理仍独立。
 * 浏览器字体变化会触发重新排版，这项断言根据行高上限而不是字符个数判断。
 * 超长无空格说明的断行由产品 CSS 保证，本夹具主要验证分段长文。
 * 本次没有冒充屏幕阅读器端到端测试，只检查其依赖的可访问属性。
 * 同样没有据此宣称所有浏览器都支持行裁切，实际目标是随包的 Electron。
 * 不把调用方日志里的 PASS 次数当唯一依据，最终仍由 harness 汇总失败情况。
 * helper 返回时没有活动观察器之外的测试轮询，后续脚本继续使用同一个页面。
 */
async function verifyDescriptionReader({ run, click, wait, check }) {
  // 原生折叠区保留产品点击行为，不用设置 open 属性绕过实际事件。
  // 本地说明没有外层 details，这一分支自然不会产生额外点击。
  // 等待溢出按钮也覆盖了 ResizeObserver 在显示后重新测量的生命周期。
  await run("(()=>{const group=document.querySelector('[data-model-description]')?.closest('details');if(group&&!group.open)group.querySelector('summary').click()})()");
  await wait("document.querySelector('[data-model-description-toggle]')");
  check("long description defaults to six clamped lines", await run("(()=>{const el=document.querySelector('[data-model-description] p');return el.clientHeight<=121&&el.scrollHeight>el.clientHeight&&getComputedStyle(el).webkitLineClamp==='6'})()"));
  await click('[data-model-description-toggle]');
  check("expanded description scrolls within a bounded region", await run("(()=>{const el=document.querySelector('[data-model-description] p');el.scrollTop=80;return el.clientHeight<=301&&el.scrollTop>0&&el.tabIndex===0&&document.querySelector('[data-model-description-toggle]').getAttribute('aria-expanded')==='true'})()"));
  await click('[data-model-description-toggle]');
  check("collapsing restores the top of the six-line excerpt", await run("document.querySelector('[data-model-description] p').scrollTop===0&&document.querySelector('[data-model-description-toggle]').getAttribute('aria-expanded')==='false'"));
  await click('[data-model-description-toggle]');
  await run("document.querySelector('[data-model-description-toggle]').scrollIntoView({block:'nearest'})");
  // 外层 details 的底边必须包含正文；否则下一块文件信息会画到正文中间。
  // 这个条件读取同一时刻的两个 DOMRect，不拿固定延时假定布局已经完成。
  // 本地没有该原生分组，因此包含条件仅适用于保留折叠分组的在线入口。
  // 断言的 1px 容差只处理取整，无法把一整行文字溢出当成正常误差。
  // 若条件不成立，宿主 wait 会给出确切表达式，不靠截图肉眼猜问题。
  // 页面实际 max-height 和行高仍来自生产 CSS，不在测试中覆盖高度求通过。
  // 此处不检查屏幕坐标为正，外层滚动后的正常裁切与内部越界需要区分。
  await wait("(()=>{const el=document.querySelector('[data-model-description]'),group=el.closest('details');return !group||group.getBoundingClientRect().bottom>=el.getBoundingClientRect().bottom-1})()");
  // 复制拒绝已经被独立断言，截图等待 Toast 自然消失，不删除它的 DOM。
  // 该等待同时给异步公告读取留出机会，公告可能晚于页面首帧才出现。
  // 关闭公告使用它自己的真实按钮，不能靠 CSS 隐藏遮罩美化截图。
  // 最后再确认弹窗已卸载，避免关按钮的事件还未更新 React 就进行捕获。
  // 公告偏好只写入脚本的临时用户文档，真实用户的已读记录不会改变。
  // 公共 helper 负责清理这两个瞬时遮挡，本地和线上截图采用相同条件。
  // 两种关闭动作都不触碰模型详情，因此阅读器的展开状态应原样保留。
  // 不等待远端图片请求结束，因为此处的长文与复制检查不依赖公网资源。
  // wait 仍有宿主时限，Toast 不消失或公告关不掉会明确失败。
  // 截图展示生产界面当前状态，不裁掉导航或覆盖真实控件的浮层。
  await wait("!document.body.innerText.includes('复制失败')");
  await run("document.querySelector('[aria-labelledby=update-announcement-title] button')?.click()");
  await wait("!document.querySelector('[aria-labelledby=update-announcement-title]')");
}

module.exports = { verifyTriggerCopies, verifyDescriptionReader };
