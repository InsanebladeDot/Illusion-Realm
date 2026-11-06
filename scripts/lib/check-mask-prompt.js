/**
 * 蒙版正向词的组装集成检查，使用正式页面和原工具弹窗。
 * 不绕过 React 修改 store；推理服务仍由外层 IPC 夹具替代。
 * 返回实际合并正文，供外层沿 KSampler 连线验证最终提交字段。
 * 标签库数据来自正式打包资源，图片和下载请求由外层隔离环境管理。
 * 生成前保留高级打开，以便后续检查运行中字段的真实 disabled 状态。
 * 本模块不证明 GPU 推理效果，也不改写用户已有的分类或模板文件。
 */
// 每个选择器限定蒙版面板，普通图片的隐藏编辑器只作为污染对照。
// 先准备非空普通正文，才能发现开启高级时意外清空输入的回归。
// 输入辅助由外层提供，走 contenteditable 的正式 input 事件。
// 图像文档和像素工具状态不在本模块修改，后续生成继续用相同素材。
// 最初质量分类应接收原正文，不尝试猜测自然语言的角色和背景语义。
// 高级必须替换右侧内容，左侧下方不能出现第二份分类面板。
// 记录画布高度作为配对对照，打开高级不能再从画布抢走空间。
// 公共生成 footer 应仍然存在，高级组装不应阻断正常提交入口。
// 主输入在高级模式只读，用户应通过分类编辑而不是写两份冲突文本。
// 本模块没有调用外部翻译、助手或 GPU 服务。
module.exports = async function checkMaskPrompt(ctx, field) {
  const {run,click,wait,smoke,shot}=ctx, scope='[data-mask-assembly] ', text=()=>run("document.querySelector('#mask-positive').textContent");
  const imageBefore=await run("document.querySelector('#prompt-editor')?.textContent??null"), canvasHeight=await run("document.querySelector('[data-mask-stage]').clientHeight"); await field(ctx,'#mask-positive','repaint selected region');await click('[data-mask-advanced]');await wait("document.querySelector('[data-mask-assembly] [data-prompt-tab-input]')");
  smoke.check('Mask advanced preserves ordinary text and makes merged input read only',await run("document.querySelector('[data-mask-assembly] [data-prompt-tab-input]').value==='repaint selected region'&&!document.querySelector('#mask-positive').isContentEditable"));
  smoke.check('Mask advanced replaces side parameters without taking canvas space',await run("!document.querySelector('[data-mask-prompt] [data-prompt-assembly]')&&!!document.querySelector('[data-control-form=inpaint] [data-mask-assembly]')&&!document.querySelector('#inpaint-negative')&&!!document.querySelector('[data-control-form=inpaint] [data-control-run]')&&document.querySelector('[data-mask-stage]').clientHeight==="+canvasHeight));
  // 快捷词进入当前质量分类，必须同步出现在公共 instruction 的可见输入。
  // 只检查分类本身会遗漏组装订阅没有写回生成参数的故障。
  // 两段明确文本构成精确期望，不从产品合并函数生成预期字符串。
  // 进入动作分类后打开已有库，选择第一项以避开固定条目版本依赖。
  // 动作库必须真正提供可选卡片，空弹窗不能被认作能力已接入。
  // 选择和确认都走正式按钮，返回后读取分类 textarea 的真实值。
  // 这是本地静态标签库，不使用服务端假响应填充正文。
  await click(scope+'[data-prompt-quick-word=masterpiece]');smoke.check('Mask quick words synchronously update positive text',await text()==='repaint selected region, masterpiece');
  for(const tool of ['pose','background']) {
    // 两个库走同一复用组件，分别操作能发现工具映射写错分类的问题。
    // 切换类别后再打开工具，确保发起路径是默认绑定而非自定义落点。
    // 选择卡片内的选择按钮，不能用点击图片预览代替选择状态。
    // 确认后该库必须关闭，分类值必须非空且存在于最终正文。
    // 当前测试不规定每个库首项的固定标签，数据整理不会改变契约。
    // 外层的显式提示词会与这些结果一起进入实际生成 IPC。
    // 等待均由外层有界轮询执行，不依赖页面可见性下的 rAF。
    await click(scope+'[data-prompt-tab='+tool+']');await click(scope+'[data-prompt-tool='+tool+']');await wait("document.querySelector('[data-resource-dialog="+tool+"-library-dialog-title] [data-"+tool+"-card]')");
    await click('[data-resource-dialog='+tool+'-library-dialog-title] [data-'+tool+'-card] button[aria-label^=选择]');await click('[data-'+tool+'-apply]');await wait("!document.querySelector('[data-resource-dialog="+tool+"-library-dialog-title]')");
    const category=await run("document.querySelector('[data-mask-assembly] [data-prompt-tab-input]').value");smoke.check('Mask '+tool+' dialog writes its category into merged text',Boolean(category)&&(await text()).includes(category));
  }
  // 3D 使用原视角生成器，确认文字来自其相机状态，不由测试伪造。
  // 这里无需加载用户模型，原内置场景即可产生镜头标签。
  // 读取确认前的实际结果，返回分类必须逐字一致。
  // 保留既有质量、动作、背景，镜头工具不能覆盖整段正文。
  // 普通图片的 DOM 文本在本模块结束时独立比对，防止工具误写全局目标。
  // 动作库与 3D 都经过 Portal，能覆盖内嵌面板外的结果回写边界。
  // 不将 3D 画布存在解释为任意外部模型加载兼容性已经通过。
  await click(scope+'[data-prompt-tab=shot]');await click(scope+'[data-prompt-tool="3d"]');await wait("document.querySelector('[data-view3d-confirm]')");
  const camera=await run("document.querySelector('[data-view3d-prompt]').textContent.trim()");await click('[data-view3d-confirm]');await wait("!document.querySelector('[data-view3d-confirm]')");smoke.check('Mask 3D writes camera tags to shot category',Boolean(camera)&&(await text()).includes(camera));
  // 角色库沿用原入口；数据由用户库决定，空库也应能正常打开和返回。
  // 本测试只验证打开和关闭，角色选择的详细数据行为由原专项负责。
  // Escape 通过已有弹窗事件处理关闭，不删除 Portal 节点伪装返回。
  // 关闭角色库不得清空已合并的内容，下面模板使用同一份正文。
  // 保存模板时使用当前全部分类，随后清空镜头以制造有意义的恢复对照。
  // textarea 使用自己的原生 setter，不能借用 input 原型导致非法调用。
  // 模板恢复后的合并正文必须逐字等于快照，不能只检查模板下拉框存在。
  await click(scope+'[data-prompt-tab=character]');await click(scope+'[data-prompt-tool=character]');await wait("document.querySelector('[data-resource-dialog=character-picker-dialog-title]')");await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await wait("!document.querySelector('[data-resource-dialog=character-picker-dialog-title]')");
  const assembled=await text();await field(ctx,scope+'[data-prompt-template-name]','Mask smoke');await click(scope+'[data-prompt-template-save]');await click(scope+'[data-prompt-tab=shot]');
  await run("(()=>{const e=document.querySelector('[data-mask-assembly] [data-prompt-tab-input]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}))})()");smoke.check('Mask category edit changes merged draft before template restore',await text()!==assembled);
  // 保存不会替用户选择模板，显式选择首个有效 option 后才执行恢复。
  // 选项点击进入正式受控菜单，不能直接调用 applyPromptTemplate。
  // 确认按钮应从禁用转为可用，否则“恢复”实际没有执行。
  await click(scope+'[data-prompt-template-select]');await run("[...document.querySelectorAll('[data-simple-select-option]')].find(option=>option.dataset.simpleSelectOption).click()");await click(scope+'[data-prompt-template-apply]');smoke.check('Mask template restores the complete independent draft',await text()===assembled);
  // 模板只保存在当前会话，本检查不声称客户端重启后仍能恢复。
  // 关闭高级保留合并文本，再开启必须恢复原分类而不是重复追加。
  // 窄屏用与实际工作区相同的尺寸切换，检查内部面板没有横向撑宽。
  // 窄屏前保持画布栏，参数栏是否可达仍由外层既有回归负责。
  // 截图只供人工复核，关键结论来自尺寸和完整正文比较。
  // 最终回到桌面并返回生成参数，外层调参后重新开启以检查忙碌禁用状态。
  // 原图片 DOM 不存在时 null 也必须保持 null，不能创建替代输入偷偷写入。
  // 返回正文供真正提交的正负连线核对，不在测试里重新构造工作流。
  await click('[data-mask-advanced]');smoke.check('Closing mask advanced preserves assembled positive prompt',await text()===assembled);await click('[data-mask-advanced]');await wait("document.querySelector('[data-mask-assembly]')");
  smoke.check('Reopening mask advanced restores categories without duplicating text',await text()===assembled);await shot('mask-prompt-advanced');await ctx.metrics(390,900);
  smoke.check('Narrow mask assembly stays within its content width',await run("(()=>{const e=document.querySelector('[data-mask-assembly]');return e.scrollWidth<=e.clientWidth+1})()"));await shot('mask-prompt-advanced-narrow');await ctx.metrics(1440,900);
  // 使用面板自己的返回按钮检查原位恢复，不靠重新进入页面重建整个工作区。
  // 正负正文都由领域草稿提供，恢复参数时不能重新填入默认负面预设。
  // 这里要求输入和面板互斥存在，不能仅用另一浮层挡住旧内容。
  await click(scope+'[data-prompt-assembly-close]');smoke.check('Returning from mask assembly restores original side settings',await run("!!document.querySelector('#inpaint-negative')&&!document.querySelector('[data-mask-assembly]')"));
  smoke.check('Mask assembly leaves ordinary image prompt untouched',imageBefore===await run("document.querySelector('#prompt-editor')?.textContent??null"));return assembled;
};
