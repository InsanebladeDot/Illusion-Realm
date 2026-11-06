/** UI-08正式入口集成反证；复用LIVE窗口和真实文件，不复制启动、导入或播放器。 */
const fs = require("node:fs"), path = require("node:path");
// 本helper只借用外层公开DOM驱动，没有访问React私有状态或替换工程数组。
// 视频先由外层生产ffprobe读取，搜索结果里的文件名来自真实磁盘文件。
// 系统选择框另由LIVE-01验证；本组选择结果仍是路径夹具，不能冒称人工多选。
// 事件使用DOM公开入口，菜单、焦点、搜索和锁最终都交给产品自己的处理器。
// 像检查同一张订单的货架、收据和配送记录，必须同时核对多个区域才发现串单。
// 截图保留当前正式实例，不切去静态样板或用DEMO文件充当已导入视频。
// 主进程有界等待由原套件提供，helper不会新增无限轮询或计时器假进度。
// 每项断言汇入原harness，新增检查失败不能被最后正常退出掩盖。
// 用户前台应用保持不动；离屏图和自动事件不替代资源管理器人工拖入。

// 空工程必须在导入前检查，才能发现残留演示文件名或初始固定片段。
// frame要有面积、纯黑背景且没有可见占位子节点，不能靠隐藏文字颜色蒙混过去。
// 项目时钟仍显示零，黑画布并不意味着从DOM删除整个节目区。
// 保存、导出和效果编辑继续禁用，空工程也不能出现可点击的假动作。
// 图像文件是实际Electron像素，非设计稿；临时目录由外层统一归档。
// 这里不对屏幕色彩或系统缩放作结论，计算颜色只证明浏览器样式的来源。
// 没有媒体时也不挂空src播放器，避免无意义的解码请求或旧音频残留。
// 只检查正式host中的内容，不把独立样板路由里的演示数据当作污染。
// children检查针对frame，不检查整个R03：标题和走带区本来就应该继续存在。
// 仅断言innerText为空会漏掉无文字图标，所以这里要求画布没有任何子元素。
// 只检查背景黑色也不够，旧封面可能仍盖在黑色背景上，二者必须一起满足。
// 面积大于零防止display:none或塌陷后“看不见提示”被错误算作修复。
// 无片段是正式空工程的事实，不能预放一段黑色演示片段来实现黑屏。
// 无媒体元素保护零源生命周期，不把暂停中的隐藏播放器当成空画布。
// 本组未检查真实节目空隙的连续播放，当前播放器没有自动接播能力。
// 真实素材解码失败由LIVE-01另行保留错误，安静空画布不能覆盖该分支。
async function checkIntegrationEmpty(ctx) {
  ctx.smoke.check("UI08: empty formal canvas is black without placeholder or media", await ctx.run("(()=>{const f=document.querySelector('[data-editor-preview-frame]');return f.children.length===0&&getComputedStyle(f).backgroundColor==='rgb(0, 0, 0)'&&f.getBoundingClientRect().width>0&&!document.querySelector('[data-live-video-session] video,[data-live-video-session] audio')&&!document.querySelector('[data-editor-clip]')})()"));
  fs.writeFileSync(path.join(ctx.root, "ui-08-empty-black.png"), (await ctx.win.webContents.capturePage()).toPNG());
}

// 搜索先造一个不存在的名字，再搜真实竖屏文件，排除“任意输入都显示全部”的假接线。
// 输入用原生value setter和input事件通知React，不直接改结果DOM来制造成功。
// 搜索前两份视频均已成功导入，随后仅改变本面板query，不能改变工程数组。
// 搜索失配有恢复入口，清除后原两份素材ID应继续存在，不重新探测或生成新身份。
// 音频类型目前没有独立导入，所以筛到零结果是正常UI状态，不是素材丢失。
// 恢复全部后点击竖屏素材，只应打开源预览，不能隐式建时间线片段。
// 源播放器真实加载是否成功仍由原套件验证，这里主要核对选择归属与类型筛选。
// 属性面板不能跟素材高亮走，空工程选择素材后仍没有片段属性目标。
// 素材选中ID从真实按钮读取，不按文件名推导一个假UUID。
// 返回节目必须卸载源，最终黑画布不能残留上一段的封面或播放器。
// helper结束恢复全部筛选和节目模式，原LIVE后续入轨沿用同一素材会话。
// 若搜索错误地清空assets，原两行恢复检查会失败，而不是依赖后续重新导入修好。
// “视频”与“音频”按钮标签使用当前中文测试环境，产品本身仍按i18n取文案。
// 测试不通过改主题或重载页面恢复状态，状态切换必须在同一实例内完成。
// 只把自动事件记为自动验证，未宣称实际按键顺序或输入法已人工验收。
async function checkIntegrationMedia(ctx) {
  const query = async value => { await ctx.run(`(()=>{const e=document.querySelector('[data-editor-region=R02] input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`); await ctx.delay(80); };
  // 输入前setter来自原生prototype，避免绕过React受控字段的变化检测。
  // 只发input不发键盘快捷键，本组不能证明输入法或人工Tab路径。
  // 80ms只给状态提交一个有限间隔，不伪造探测进度或替代媒体ready事件。
  // 未匹配断言同时检查片段数，防止搜索被误接到时间线删除命令。
  // 未匹配文案从真实列表读取，不由测试额外插入一条status节点。
  // 精确关键词只命中第二份真实文件，能识别第一份结果缓存没有更新的问题。
  // 清空query后再切音频，确保类型条件本身有作用，不被残留搜索词替代。
  // 类型按钮的pressed状态由产品kind控制，测试不手动改aria-pressed。
  // 恢复全部用公开按钮，没有调用组件setKind或重载整个会话。
  // 两份原视频都仍应存在，重复身份和临时新ID也会让后续片段引用检查失败。
  // 素材点击发生在空时间线，故任何新片段都属于意外业务副作用。
  // 源查看只拥有素材时钟，属性空选择的断言能发现两个选择被绑成一个。
  // 返回后通过empty状态等待React切换，不仅等待按钮点击函数返回。
  // 播放资源释放检查真实video/audio节点，不把按钮文案变了当作清理完成。
  // 返回后素材高亮允许保留，这与退出源查看是两个不同用户意图。
  await query("does-not-exist-ui08");
  ctx.smoke.check("UI08: unmatched search shows zero rows without creating clips", await ctx.run("!document.querySelector('[data-editor-asset]')&&!document.querySelector('[data-editor-clip]')&&document.querySelector('[data-editor-media-results]').textContent.includes('没有符合搜索')"));
  await query("portrait-silent");
  ctx.smoke.check("UI08: exact search returns only the real portrait filename", await ctx.run("document.querySelectorAll('[data-editor-asset]').length===1&&document.querySelector('[data-editor-asset]').title==='portrait-silent.mp4'"));
  await query("");
  await ctx.run("document.querySelector('[data-editor-region=R02] button[aria-label=音频]').click()");
  ctx.smoke.check("UI08: audio filter does not relabel imported videos", await ctx.run("!document.querySelector('[data-editor-asset]')&&!document.querySelector('[data-editor-clip]')"));
  // React筛选更新不是同步DOM替换，先等两行恢复才点第二行，避免驱动抢在提交前。
  await ctx.run("document.querySelector('[data-editor-region=R02] button[aria-label=全部]').click()");
  await ctx.wait("document.querySelectorAll('[data-editor-asset]').length===2");
  await ctx.run("document.querySelectorAll('[data-editor-asset]')[1].click()");
  await ctx.wait("document.querySelector('[data-editor-preview-mode=source]')");
  ctx.smoke.check("UI08: asset viewing keeps the inspector and timeline unselected", await ctx.run("document.querySelectorAll('[data-editor-asset]').length===2&&!document.querySelector('[data-editor-clip]')&&!document.querySelector('[data-editor-inspector-clip]')&&document.querySelector('[data-editor-asset][aria-current=true]').title==='portrait-silent.mp4'"));
  await ctx.run("document.querySelector('[data-editor-region=R03] button[aria-label=返回节目预览]').click()");
  await ctx.wait("document.querySelector('[data-editor-preview-state=empty]')");
  ctx.smoke.check("UI08: return to empty program releases source and restores plain black", await ctx.run("!document.querySelector('video,audio')&&document.querySelector('[data-editor-preview-frame]').children.length===0"));
}

// 两个真实V1实例已入轨，本组锁空闲A1/A2，使失败只能来自锁而不是轨道占用。
// 保留完整片段快照，拒绝时数量相同仍不够，还要保护起止、身份及选中值。
// 先点目标片段再保存快照，避免菜单打开时合法选中切换被误判为修改工程。
// 分离仍点击真实公共菜单，能发现纯函数已修但正式会话忘传锁表的断层。
// 两条目标锁住不应消除源预览或素材高亮，错误消息只留在时间线状态栏。
// 解锁后原正常分离套件会再次执行成功路径，因此不能用永久禁用分离来过关。
// 源轨随后锁定，向disabled片段投递Delete、方向键和右键事件属于负向绕过测试。
// 合成事件故意绕过正常鼠标命中限制，产品处理器仍必须守住同一个源锁门槛。
// 没有用隐藏菜单或禁用测试事件掩盖问题，检查的是最终工程快照和菜单是否生成。
// 鼠标创建/拖动锁门槛由原时间轴回归同时覆盖，本组重点补菜单与键盘入口。
// 属性实际效果仍禁用，锁检查不是宣称变换或音量参数已经接入工程。
// 整体只改变锁表和查看目标，没有产生音频文件或对磁盘视频进行任何编辑。
// 结束恢复所有锁，后续LIVE横滚、复制和分离继续在同一工程运行。
// 这组测试是自动行为反证，不代表人在真实窗口按过完整快捷键路径。
// 正式检查器现在开放五个构图字段，所以不能继续要求所有input都禁用。
// 片段速度已接通；仍禁用两个淡入淡出，精确数量反证未接通效果被误开放。
// 只看导出禁用不足以判断字段能力，因此两类断言分别保留。
// 构图真实值与画面同步由专门helper覆盖，本组关心正式装配能力边界。
// 未接通效果不能通过传一个空回调把按钮变成可点击。
// 轨道锁另需让五个构图字段也禁用，不能与“未接通所以禁用”混为一谈。
// 目标轨锁反例仍用空闲目标轨，排除碰撞碰巧导致拒绝的假通过。
// 这一调整是新增真实能力后的期望更新，没有放松保存和导出的原限制。
// 样板仍可演示速度草稿，这不改变正式工作区能力清单。
// 自动集成通过不修改UI08既有人工待验项目的状态。
// 扩展多轨后，“锁住A1/A2就没有目标”不再天然成立，因为还可以合法申请A3。
// 因此先在正式设置把audio上限确认为二，再检验两条目标都锁的原子拒绝。
// 这保留原测试的业务前提，而不是要求新功能错误地忽略可用新增名额。
// 前置用真实输入事件提交，不能直接在测试里篡改内部limits状态。
// 如果设置没有接通，分离会新增A3，本测试仍失败，能够发现配置与命令脱节。
// 两个目标锁与源轨锁分别测试，避免源锁提前拦截掩盖目标锁门槛。
// 目标锁用例结束恢复原五条默认，后面的正常分离与多轨专项仍按真实新规则运行。
// 改回五条不是删除任何轨道，只恢复分配名额，所以现有clips应不变。
// 保存before时没有新音轨，拒绝后仍没有A1/A2片段，不能只核对V1数量。
// sourceLocked测试发送Delete和ArrowRight，验证键盘不能绕过原生disabled保护。
// 右键也向同一锁定节点发公开事件，菜单不可出现更不能执行修改。
// 程序化事件属于越权反证，不代表人工鼠标确实能点击disabled按钮。
// 这个区别应保留在交付报告，不能把合成拒绝当作完整键盘路径验收。
// 恢复五条后关闭设置面板，避免它占时间线高度改变后续抓取前置。
// 所有操作仍使用同一窗口和同一工程，不以重载清空损坏数据掩盖失败。
// 本用例不触碰用户真实设置文档，隔离会话结束后不会留下上限二的副作用。
async function checkIntegrationLocks(ctx) {
  const id = (await ctx.clips())[0].id;
  await ctx.click(`[data-editor-clip="${id}"]`);
  // before包含当前selected标记，后续失败不能顺便清掉检查器目标。
  // 两条音轨最初均为空，因此无音频安排不是占用导致分离失败的巧合。
  // 锁按钮用各自轨道头限定，不能误点V1的同名锁而提前阻断源操作。
  // 菜单目标用独立clipId，多个同源片段不会因文件名相同而被混为一条。
  // 分离菜单关闭不等于成功，状态栏必须明确轨道已锁定。
  // 不检查“已完成”通用文案，因为那会把一个失败动作错误记录成成功。
  // 拒绝后A1和A2都没有新增片段，不能只比较V1数量来判断原子性。
  // 锁状态测试后逐一解锁，不用清空工程来恢复前置，避免掩盖数据损坏。
  // 锁V1时发送ArrowRight也不能移动一帧，尤其不能由键盘绕过disabled按钮。
  // Delete合成事件即使送达React冒泡链，提交边界仍应拒绝。
  // 右键合成事件不要求实际鼠标能点中disabled元素，目的正是反证越过UI保护。
  // 菜单没有生成是辅助证据，完整片段快照不变才是业务保护的最终证据。
  // 解锁恢复后再截图，两段仍是原来的时间与身份，便于人工对照。
  // 后续正常分离会验证原视频的audioDetached标记与真实音频播放，不在此读取私有状态。
  // 元数据hasAudio来自真实探测，不能用.mp4后缀判断一定可以分离声音。
  // 本组未提取wav，磁盘源完整保留，因此不存在假音频导入成功的提示。
  // 未测试多轨同步播放，A1/A2在这里仅是可独立安排的音频通道。
  // 如最终截图中预览还在加载，原媒体事件断言仍会单独决定是否可播放。
  // 多轨默认可继续创建A3；本反证先明确限制到两轨，才有“目标全部锁定”的前提。
  // 这不是降低默认产品上限，测试结束恢复五轨，后续扩轨仍走正式设置入口。
  await ctx.click('[data-track-settings] > span button');
  await ctx.run("(()=>{const e=document.querySelectorAll('[data-track-settings] input')[1];e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await ctx.delay(70);
  await ctx.run("document.querySelectorAll('[data-track-settings] input')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await ctx.click('[data-track-settings] > span button');
  const before = JSON.stringify(await ctx.clips());
  await ctx.click('[data-editor-track-head=A1] button[aria-label=锁定]');
  await ctx.click('[data-editor-track-head=A2] button[aria-label=锁定]');
  await ctx.openLiveMenu(id);
  await ctx.click('[data-live-clip-menu] button[aria-label=分离音频到音频轨]');
  ctx.smoke.check("UI08: formal detach into two locked targets refuses without a partial edit", JSON.stringify(await ctx.clips()) === before && await ctx.run("document.querySelector('[data-timeline-notice]').textContent.includes('轨道已锁定')&&!document.querySelector('[data-editor-track-lane=A1] [data-editor-clip],[data-editor-track-lane=A2] [data-editor-clip]')"));
  await ctx.click('[data-editor-track-head=A1] button[aria-label=锁定]');
  await ctx.click('[data-editor-track-head=A2] button[aria-label=锁定]');
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  await ctx.run(`(()=>{const e=document.querySelector('[data-editor-clip="${id}"]');for(const key of ['Delete','ArrowRight'])e.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:500,clientY:500}))})()`);
  ctx.smoke.check("UI08: locked source rejects keyboard and context-menu bypass", JSON.stringify(await ctx.clips()) === before && await ctx.run("!document.querySelector('[data-live-clip-menu]')&&[...document.querySelectorAll('[data-editor-track-lane=V1] [data-editor-clip]')].every(e=>e.disabled&&!e.draggable)"));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  await ctx.click('[data-track-settings] > span button');
  await ctx.run("(()=>{const e=document.querySelectorAll('[data-track-settings] input')[1];e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'5');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await ctx.delay(70);
  await ctx.run("document.querySelectorAll('[data-track-settings] input')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await ctx.click('[data-track-settings] > span button');
  // 正式工作区只应该出现真实导入文件名，样板名称不能随默认参数漏进来。
  // 当前仍只有视频安排，未分离前不应出现任何波形示意路径。
  // 禁用能力从实际button.disabled核对，视觉变灰不算真正阻止操作。
  // 未传入效果提交回调时属性数值保持只读，不能把样板草稿伪装成实际变换。
  // 这里只扫描正式host，独立samples继续允许演示波形、固定项目与草稿编辑。
  // 未检查的未来动作不因此算通过，能力清单仍逐项标注已实现、仅UI或未接通。
  // 用户文件名可能任意，当前已知真实测试文件不含这些样板标识，反证没有歧义。
  // 按钮断言限定项目栏与属性栏，避免把源播放器真实播放按钮误当未接通功能。
  ctx.smoke.check("UI08: formal project excludes demo names and keeps unavailable effects/export disabled", await ctx.run("(()=>{const h=document.querySelector('[data-live-video-session]');return !/scene_0[12]|bg_01|voice_01|春日短片/.test(h.textContent)&&h.querySelector('[data-editor-region=R01] button[aria-label=导出]').disabled&&[...h.querySelectorAll('[data-editor-region=R04] input')].filter(e=>e.disabled).length===2})()"));
  fs.writeFileSync(path.join(ctx.root, "ui-08-integrated-real-project.png"), (await ctx.win.webContents.capturePage()).toPNG());
}

// 媒体节点清理观测不等于底层解码器内存已量化释放，未测显存占用不作结论。
// 横竖视频与不同帧率来自两份真实编码文件，不能外推所有容器和编解码器。
// 系统缩放需要Windows实际环境，CDP容器尺寸矩阵只证明布局响应。
// 扬声器试听需人工确认，本helper既不打开系统音量也不把timeupdate当听到声音。
// 三个阶段由原串行流程调用，避免空工程、导入后和入轨后互相污染前置条件。
// 仅导出测试入口，不增加产品window或preload能力，也不制造另一套运行状态。
module.exports = { checkIntegrationEmpty, checkIntegrationMedia, checkIntegrationLocks };
