/**
 * 浏览器端安装步骤控制器，不引用 Node 或 Electron 模块。
 * 所有磁盘、目录选择和执行动作经过 window.installer 固定桥接。
 * 状态仅存活于本次向导，退出前不把安装选择写到创作账户或配置。
 * 与设计原型不同，本文件没有模拟安装、预览跳步或虚构容量。
 * 六步顺序为欢迎、许可、目录、确认、真实安装、完成。
 * 返回设置保留输入，失败保留可见错误，不自动递归重试写入。
 */
const $ = id => document.getElementById(id), labels = ['欢迎', '使用条款', '安装设置', '确认安装', '正在安装', '完成'];
let page = 0, pending = false, info = null, checkedPath = '', detection = null, repairMode = false;
/**
 * checkedPath 与可编辑输入分开保存，摘要不能替代主进程预检结果。
 * pending 在 await 前设置，防止同一事件循环中的第二次点击进入流程。
 * info 为空时仅保留取消入口，按钮加载态不意味着正在写入磁盘。
 * 页面没有安装完成的持久化开关，刷新不能恢复一个虚假的成功结果。
 * 每个系统结果都经过 call 展开，不能把 success:false 当普通数据使用。
 * 接口名称只由固定代码调用，页面不提供通道名输入框。
 * UI 线程不读文件，不扫描目录，也不直接创建 Windows 子进程。
 */
/**
 * 原生调用返回统一结果，只有 success 为 true 才视为操作完成。
 * invoke 自身拒绝也由调用方 catch，不能留下无人处理的 Promise。
 * 主进程提供中文业务错误，页面不展示底层路径、命令或堆栈。
 * info、browse 等读操作同样受失败处理约束，不能默默使用假值。
 * @param {string} name preload 已暴露的固定动作。
 * @param {unknown} value 动作参数，不包含 channel 或命令字符串。
 * @returns {Promise<unknown>} 通过主进程校验后的业务数据。
 */
async function call(name, value) { const result = await window.installer[name](value); if (!result.success) throw new Error(result.error); return result.data; }
/**
 * 错误使用 textContent 插入，服务返回文本不能变成可执行 HTML。
 * 空字符串用于清理先前错误，不移除控件或重置输入路径。
 * 错误区域一直存在并带 role=alert，异步操作后也有反馈。
 * 页面只显示用户可以处理的失败，不把 console 当作错误交付。
 */
function showError(error) { $('pathError').textContent = error instanceof Error ? error.message : String(error); $('pathError').hidden = !error; }
/**
 * 容量采用二进制单位 GiB，与字节统计一致，避免 GB/GiB 混用。
 * 只用于展示，是否允许安装仍由主进程的字节级比较决定。
 * 原型固定空间数字不参与任何生产判断。
 */
function size(bytes) { return `${(bytes / 1024 ** 3).toFixed(2)} GiB`; }
/**
 * 当前步骤只由状态机推进，步骤条不是可点击跳转入口。
 * 步骤 HTML 来自固定 labels 与数字，不插入路径或服务返回内容。
 * 同一阶段同时更新按钮、摘要和 aria-current，视觉与可访问状态一致。
 * 安装页隐藏返回和取消，不显示无效的“立刻终止”操作。
 * 完成页根据用户勾选调整主按钮文字，不提前启动程序。
 * pending 覆盖预检与安装等待，避免双击产生重复目录检查或进程。
 * info 尚未加载时禁用继续，缺少资源不能靠操作顺序跳过。
 * 路径与快捷方式始终使用文本节点回填，不依赖模板字符串注入 HTML。
 */
function render() {
  // hidden 同时影响布局与聚焦，不单用透明度隐藏其他步骤。
  // 固定步骤标记没有用户数据，innerHTML 的输入不包含外部内容。
  // 标签连接线随可用宽度伸缩，不额外添加占位列影响内容区域。
  // 上一步仅在许可、设置和确认页出现，完成不能退回正在写入。
  // pending 时按钮整体禁用，但目录输入变化仍由 checkPath 防旧结果。
  // 主按钮的完成文字跟随 launchAfter，不假设用户总想立即打开客户端。
  // desktop/startMenu 均为 false 时摘要明确写不创建，不偷偷恢复默认项。
  // 已进入安装页时 next 隐藏，禁止用完成动作绕过等待中的安装。
  // 阅读提示不包含预计秒数，无法从包大小可靠推算用户机器安装时间。
  // 不依赖动画 callback 更新状态，隐藏窗口也能完成逻辑推进。
  document.querySelectorAll('[data-page]').forEach((node, index) => { node.hidden = index !== page; });
  $('steps').innerHTML = labels.map((label, index) => `${index ? '<span class="connector"></span>' : ''}<span class="step ${index === page ? 'current' : index < page ? 'done' : ''}" ${index === page ? 'aria-current="step"' : ''}><b>${index < page ? '✓' : index + 1}</b>${label}</span>`).join('');
  $('back').hidden = page === 0 || page >= 4; $('cancel').hidden = page >= 4; $('next').hidden = page === 4;
  $('next').textContent = ['开始设置 →', '同意并继续 →', '下一步 →', '开始安装 →', '', $('launchAfter').checked ? '完成并启动 ↗' : '完成'][page];
  if (repairMode && page === 3) $('next').textContent = '一键修复安装 →';
  $('next').disabled = (page === 2 && detection?.state === 'blocked') || !info || pending || (page === 1 && !$('consent').checked); $('back').disabled = pending;
  $('summaryPath').textContent = $('installPath').value; $('summaryShortcuts').textContent = [$('desktop').checked && '桌面', $('startMenu').checked && '开始菜单'].filter(Boolean).join('、') || '不创建';
  $('repair').disabled = pending || !detection || !['ready', 'repair'].includes(detection.state); $('rescan').disabled = pending;
  $('footerHint').textContent = page === 4 ? '请保持安装窗口开启' : '一个属于你的创作小世界';
}
/**
 * 目录页的继续必须等待操作系统预检，不能只用浏览器正则放行。
 * 等待前捕获当前输入，检查返回后再次比较，避免输入变化使用旧结果。
 * 每次输入会清空 checkedPath，因此确认页只能提交本次核验过的目录。
 * 空间显示来自引擎包文件清单与真实目标卷，不包含后续下载的模型。
 * 目录错误通过外层 catch 就地呈现，用户可直接修正或重新浏览。
 * @returns {Promise<boolean>} 输入在检查期间是否保持不变。
 */
async function checkPath() {
  // 捕获的是本次点击时的完整字符串，不从输入中截取或拼接盘符。
  // 主进程返回规范化路径之后再回填，避免摘要显示与实际执行不同。
  // 校验期间输入改变则不进入下一步，用户需要再次确认最新路径。
  // requiredBytes 由应用容量和余量组成，不由浏览器猜测。
  // freeBytes 只展示当前卷快照，安装阶段仍再次检查。
  // checkedPath 只在成功且输入未变时赋值，失败不保留上次成功结果。
  // 此函数不触发安装，因此目录页反复修改不会产生多个文件副本。
  const input = $('installPath').value, result = await call('validate', { path: input, repair: repairMode });
  if ($('installPath').value !== input) return false;
  checkedPath = result.path; $('installPath').value = result.path;
  $('capacity').textContent = `所需空间：${size(result.requiredBytes)}（含安装余量） · 可用：${size(result.freeBytes)}`; $('required').textContent = size(result.requiredBytes); return true;
}
/**
 * 安装调用前展示真实等待页，不使用定时器模拟文件复制或百分比。
 * 只有主进程返回成功才进入完成页；失败回到目录设置供用户处理。
 * 已写入一部分时不自动删除目标，不掩盖需要检查残留的事实。
 * consent 与两个快捷方式明确传布尔值，主进程再次验证数据形状。
 * 完成路径取自主进程结果，避免把未落盘的输入路径当作成功凭据。
 * restart 只显示系统要求，不自动触发操作系统重启。
 * @returns {Promise<void>} 成功显示完成页，异常交给 next 统一呈现。
 */
async function startInstall() {
  // 第四步先 render，再等待长调用，用户能立刻看到操作已经开始。
  // 没有 percentage 字段，不用 elapsed 时间推导虚假的复制完成度。
  // 真正开始前主进程仍核对条款、参数、权限、空间与内嵌引擎。
  // 失败页保留错误和原路径，用户可以识别失败目录而不是猜测。
  // 失败返回设置不代表所有新建文件被清除，文案已明确此限制。
  // 只有 result.path 显示到完成摘要，不继续使用未经验证的输入值。
  // 需要重启只提示，finish 仍遵循用户是否启动应用的选择。
  page = 4; render();
  try { const result = await call('install', { path: checkedPath, consent: $('consent').checked, desktop: $('desktop').checked, startMenu: $('startMenu').checked, repair: repairMode }); $('completePath').textContent = result.path; $('reboot').hidden = !result.rebootRequired; page = 5; }
  catch (error) { page = 2; throw error; }
}
/**
 * next 是唯一推进状态的入口，pending 在第一个 await 之前设定。
 * 许可页未同意即返回，不能通过重复点击或直接触发事件绕过。
 * 目录页核验成功才进确认；确认页路径变化则要求返回重新检查。
 * 完成页仅向主进程发送是否启动，不接收可执行文件路径。
 * finally 统一恢复按钮状态，包括 invoke 拒绝与安装失败路径。
 * catch 保留当前有效步骤，提供错误而不是把失败强行推进到完成。
 * 取消和最小化不在此推进流程内，由原生窗口控制器负责。
 */
async function next() {
  // page 为 0 或 1 时只移动一步，不能通过传参直接跳至安装页。
  // 完成页的调用失败保持完成页，避免把启动失败误判为安装失败。
  // 确认页发现目录被改写会要求返回，不能执行过期的 checkedPath。
  // finally 在每个分支执行，失败不会让返回按钮永久禁用。
  // showError 在开始一次新动作时清理旧提示，避免错误和成功摘要并存。
  // 页脚可见性由 render 统一决定，不让多个分支各自改不同按钮。
  // 安装忙碌状态也在主进程维护，即使页面事件被重放也不能并行写入。
  // 修复仍经过许可与确认，不把自动检测等同于自动执行写操作。
  if (pending || !info || (page === 1 && !$('consent').checked)) return;
  pending = true; showError(''); render();
  try {
    if (page === 2) { if (await checkPath()) page = 3; }
    else if (page === 3) { if (!checkedPath || checkedPath !== $('installPath').value) throw new Error('安装目录已改变，请返回上一步重新检查。'); await startInstall(); }
    else if (page === 5) await call('finish', $('launchAfter').checked);
    else page += 1;
  } catch (error) { showError(error); }
  finally { pending = false; render(); }
}
/**
 * 控件注册集中进行，不把 onclick 字符串放到页面，因此 CSP 无需放开内联脚本。
 * 浏览返回 null 表示用户取消，保留现有路径和快捷方式。
 * 返回步骤不会清空协议确认，但重新输入目录使先前检查结果失效。
 * 标题栏关闭、取消、最小化都捕获原生错误，避免未处理拒绝。
 * 输入变化后清掉旧容量提示，防止用户误认为新目录已经验证。
 * 事件只影响当前页面，既无跨窗口订阅，也无需要释放的轮询定时器。
 * 待安装期间不允许返回步骤，主进程还会独立阻止重复执行。
 */
function bind() {
  // 事件注册只运行一次，页面 render 不重复绑定导致一次点击执行多次。
  // change 事件读取实际 checkbox 状态，不维护第二份可能漂移的选中值。
  // reset 只恢复目录，不清除用户的许可确认和快捷方式偏好。
  // browse 成功后标记容量未验证，原生选择不绕过目录安全检查。
  // browse 用户取消时不报错，因为取消不是系统故障。
  // 输入改变不立刻扫描磁盘，只在继续时执行一次预检。
  // 不自动聚焦并滚动整个窗口，表单位置由固定正文容器控制。
  // 关闭原生确认由主进程控制，页面不会自行删除安装残留。
  $('repair').addEventListener('click', chooseRepair); $('rescan').addEventListener('click', rescan);
  $('next').addEventListener('click', next); $('back').addEventListener('click', () => { if (!pending) { page -= 1; showError(''); render(); } });
  $('consent').addEventListener('change', render); $('launchAfter').addEventListener('change', render);
  $('installPath').addEventListener('input', () => { checkedPath = ''; $('capacity').textContent = '继续后将检查此目录的权限与空间'; showError(''); });
  $('reset').addEventListener('click', () => { if (info) { $('installPath').value = info.defaultPath; checkedPath = ''; $('capacity').textContent = '继续后将检查此目录的权限与空间'; } });
  $('browse').addEventListener('click', async () => { try { const target = await call('browse'); if (target) { $('installPath').value = target; checkedPath = ''; $('capacity').textContent = '继续后将检查此目录的权限与空间'; } } catch (error) { showError(error); } });
  for (const [id, action] of [['close', 'close'], ['cancel', 'close'], ['minimize', 'minimize']]) $(id).addEventListener('click', () => { call(action).catch(showError); });
}
/**
 * 首帧只绑定控件并读取随包清单，缺失资源时保留禁用按钮与错误。
 * 法律内容从实际 LICENSE 与 NOTICE 合并，不复制模板占位法律文案。
 * textContent 展示任意许可符号，文档内容不能插入脚本或元素。
 * 推荐路径与版本只读主进程结果，不依赖浏览器环境猜测用户目录。
 * 初始化的 Promise 显式捕获，启动失败不会留在可点击的欢迎状态。
 * render 只在拿到信息后放开继续；读取失败仍可通过标题栏退出。
 */
/**
 * 自动检测只展示检查单，不在欢迎页悄悄写入系统。
 * 重新检测复用同一动作，磁盘重新接上后用户无需重开向导。
 * pending 防止连续点击堆积请求，finally 保证失败也恢复按钮。
 * 每次检测先清掉旧的核验目录，避免复用上一次的容量通过结果。
 * 失败清空 detection 并显示错误，不把未知故障当成未安装。
 * 原安装路径回填时使用 textContent/value，不把路径作为 HTML。
 * 正常安装只读状态，已有记录时提示主动选择修复入口。
 * ready 和 repair 都能修复，存在基本文件不能证明全部内容完好。
 * @returns {Promise<void>} 等待本次检测结果显示。
 */
async function rescan() {
  if (pending) return;
  pending = true; checkedPath = ''; repairMode = false; detection = null; render();
  try {
    detection = await call('diagnose');
    $('diagnosis').textContent = detection.message;
    $('diagnosis').setAttribute('role', detection.state === 'blocked' ? 'alert' : 'status');
    if (detection.path) $('installPath').value = detection.path;
    $('installPath').readOnly = detection.state !== 'fresh';
    $('browse').disabled = detection.state !== 'fresh'; $('reset').disabled = detection.state !== 'fresh';
  } catch (error) { detection = { state: 'blocked' }; showError(error); }
  finally { pending = false; render(); }
}
// 检测面板是状态展示，不把“自动检测”理解为后台自动修改注册表。
// pending 与安装流程复用，因此检测中不能同时继续或再次提交预检。
// 检测开始先清空 checkedPath，原容量结果不得沿用到新的登记状态。
// repairMode 每次重新检测归零，用户需要看到新结果后再选择修复。
// detection 暂置空，按钮渲染不能在新请求返回前继续使用旧的 ready。
// blocked 使用 alert，保证重新检测发现的新故障可以被辅助阅读器感知。
// fresh 时路径输入恢复可编辑，用户仍可以选择普通安装位置。
// 已有记录时把输入设为只读，而非把注册位置当作仅供参考的建议值。
// browse 与 reset 同步禁用，不能通过其他入口改变锁定的修复目标。
// 诊断消息用 textContent，不允许注册值中的字符变成 HTML。
// 输入的 value 可以保留空格和中文，主进程仍负责目录语法校验。
// 网络不参与检测，离线也可以判断安装记录与必要文件是否存在。
// 页面不维护注册键名，固定产品身份由主进程清单决定。
// 系统查询失败显示操作错误，不自动进入首次安装来绕过未知残留。
// finally 恢复 pending，让用户接回磁盘或修好权限后能重新检测。
// rescan 的按钮可以多次使用，但同一时刻只允许一份诊断请求。
// 诊断本身不创建目录，因此取消向导没有“删除检测文件”的清理工作。
// 只读检查结果仍可能过期，真正执行前还必须再检查一次原位置。
// 本函数没有定时轮询，向导打开后不会持续访问用户硬盘。
// 错误文本与操作按钮都留在当前设置页，不强迫用户重新走完欢迎页。
/**
 * 一键修复沿用已同意的条款和快捷方式选项，不添加第二套安装表单。
 * 此按钮只做原位置预检并进入确认页，用户最后确认才执行写入。
 * 重新诊断由主进程 prepareTarget 负责，UI 上的状态不是授权凭据。
 * 磁盘在检测后被拔掉时，checkPath 会拒绝并显示原因。
 * checkedPath 成功前保持为空，不能提交检测阶段旧的容量结果。
 * 不自动更换路径，不清空 AppData 或任何模型、作品目录。
 * 即使校验失败也保留修复选择，让用户看完原因后可以重新检测。
 * 外层 catch 和 finally 同时处理失败反馈与按钮恢复。
 */
async function chooseRepair() {
  if (pending || !['ready', 'repair'].includes(detection?.state)) return;
  pending = true; repairMode = true; checkedPath = ''; showError(''); render();
  try { if (await checkPath()) page = 3; }
  catch (error) { showError(error); }
  finally { pending = false; render(); }
}
// 一键修复先进入同一确认页，避免已有条款、目录和快捷方式形成两套表单。
// 点击仅代表选择修复方案，不在尚未确认时释放程序文件。
// ready 的用户也能主动修复，因为必要文件存在不代表每个文件内容完好。
// repair 的用户看到缺件后可直接沿原安装位置补回，不需要卸载器仍在磁盘上。
// blocked 时按钮不可用，调用函数内部也检查状态以防重复或合成点击。
// detection 为空意味着还没有确定结果，不能默认当作可修复。
// 修复标志只和本次 checkedPath 一起提交，不持久保存在浏览器。
// 容量或权限检查失败不切确认页，用户能在当前位置看到明确原因。
// checkPath 通过后才推进 page，不能先换画面再后台发现目录无效。
// 主进程接到 repair 仍重读系统记录，因此页面不能自行认领陌生目录。
// 原安装盘被拔下时，预检失败而非创建同名本地文件夹冒充旧盘。
// 同一 pending 保护涵盖重新检测，避免两个结果按返回快慢互相覆盖。
// 无论成功失败 finally 都恢复按钮状态，不会让一次错误永久锁住向导。
// 用户返回目录页时仍保留已选择修复的含义，继续操作采用同样预检。
// 完成后的客户端启动仍归原完成页，不在修复按钮中提前执行。
// 这里没有 AppData 清理，也没有把用户作品迁移到另一位置的隐式动作。
// 若目录已被用户整个删除，允许重建程序，但不能承诺恢复其个人文件。
// 未接通全用户修复的原因由诊断解释，不用管理员重启掩盖范围差异。
// 修复失败保留现有文件作为下一次检查现场，不自动递归删除原目录。
// 安装完成以主进程结果为准，页面不根据等待时长跳转成功页。

bind();
call('info').then(data => { info = data; $('legal').textContent = data.legal; $('installPath').value = data.defaultPath; $('version').textContent = `v${data.version}`; render(); return rescan(); }).catch(showError);
