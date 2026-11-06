/**
 * 蒙版左右分栏的高度回归，使用隔离 Electron 窗口中的真实布局。
 * 测试只操作页面，不读取组件内部 flex 类名来证明布局正确。
 * 窗口和 IPC 由外层冒烟提供，本模块不启动第二个应用实例。
 * 所有尺寸均为 CSS 像素，允许一像素的浏览器取整误差。
 * 使用现有导入图片，不依赖用户素材或真实 ComfyUI 推理。
 * 先建立展开基线，再写长文，避免以默认短文掩盖输入自增长。
 * 文本经真实 input 事件写入受控状态，不直接修改应用 store。
 * 长文包含换行，确保即使宽屏也有内部滚动需求。
 * 原草稿先保存，结束恢复，后续工作流回归仍读取正常参数。
 * 字节导出由既有工具回归覆盖，本组不验证真实模型推理。
 * 短窗口滚动仅属于左编辑栏，不要求右侧模型表单与它同步滚动。
 * 宽度检查覆盖并排和切栏两种形态，读取的是当前可见 canvas 页面。
 * 不断言图片占满视口，纵横比保持和查看留边仍由原缩放能力负责。
 * 不模拟 ResizeObserver，视口变化必须由产品的真实观察器接收。
 * 几何截图包含正向词和主图，便于独立核对断言没有选错容器。
 * 长文不会超过编辑器字符上限，失败不能归因于输入被正常截断。
 * 测试重用现有词条按钮语义，断点切换不会换一套产品测试入口。
 */
module.exports = async function checkMaskHeight(ctx) {
  // 每次读取新矩形，不能沿用收起动画之前的 DOMRect。
  // stage 和 fieldset 共用左栏，底边对照能发现用户指出的底部空白。
  // 输入 scrollHeight 与 clientHeight 分开读，证明内容可在内部滚动。
  // left 的高度来自外层 grid，不假定截图分辨率等于实际工作区高度。
  // 额外读取画布图像宽度，确认缩放改变的是图像而非视口。
  const { run, click, smoke, metrics, shot } = ctx;
  const measure = () => run("(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{h:r.height,b:r.bottom,t:r.top,w:r.width}},e=document.getElementById('mask-positive');return{stage:rect('[data-mask-stage]'),positive:rect('[data-mask-prompt]'),left:rect('[data-mask-grid] section'),image:rect('[data-mask-surface]'),input:rect('#mask-positive'),scroll:e.scrollHeight>e.clientHeight}})()");
  // 展开高度以初次测量为准，不在测试中复制产品的 72px 常量。
  // 长文前后相同的输入高度和画布高度，才能证明布局被正确隔离。
  // 不能只检查输入存在 overflow 样式，实际内容必须超过可见高度。
  // 底边相等排除旧版固定 42vh 后留下的空区，而非要求图片像素填满。
  const expanded = await measure();
  await run("(()=>{window.__maskHeightDraft=document.getElementById('mask-positive').textContent;const e=document.getElementById('mask-positive');e.textContent=('mask layout positive'+String.fromCharCode(10)).repeat(70);e.dispatchEvent(new Event('input',{bubbles:true}));window.__maskHeightLong=e.textContent})()");
  const long = await measure();
  smoke.check('Long positive prompt scrolls inside its unchanged compact height', Math.abs(long.input.h-expanded.input.h)<1 && long.scroll && Math.abs(long.stage.h-expanded.stage.h)<1);
  // 折叠按钮仅改变正向词显示，不关闭整个编辑页或重建导入文档。
  // 等待覆盖公共 300ms 高度过渡，由主进程计时避免页面 rAF 停摆。
  // 比较释放高度与新增画布高度，可发现仅隐藏文字但保留占位的错误。
  // 同时要求 stage 真的变高，避免零差值让相等式成为恒真断言。
  // 正向词底边保持原位，证明释放的是内部高度而非整个工作区移动。
  // 图像允许重新适应新的视口；输出像素尺寸不属于本次布局修改。
  await shot('mask-height-expanded'); await click('[data-mask-prompt] button[aria-expanded]'); await new Promise(resolve=>setTimeout(resolve,360));
  const collapsed = await measure();
  smoke.check('Collapsing positive prompt transfers its freed height to canvas', collapsed.stage.h>long.stage.h+30 && Math.abs((collapsed.stage.h-long.stage.h)-(long.positive.h-collapsed.positive.h))<1 && Math.abs(collapsed.positive.b-collapsed.left.b)<1);
  // 收起状态仍要验证放大镜，不因新版扩容重新让图片反推父容器尺寸。
  // 原图宽度必须改变，才能排除把缩放按钮禁用来保持视口不变。
  // 正向词占位和画布高度都保持，不能只检查整个编辑页高度没有变化。
  // 适应按钮收尾，避免放大后的图片影响后续套索坐标与截图观察。
  await click('[data-mask-stage] button[aria-label=放大]'); const zoomed = await measure();
  smoke.check('Collapsed viewport stays fixed when image zoom changes', zoomed.image.w>collapsed.image.w && Math.abs(zoomed.stage.h-collapsed.stage.h)<1 && Math.abs(zoomed.positive.h-collapsed.positive.h)<1);
  // 保留收起截图，人工可核对底部空间是否确实转交给画布。
  // 展开后回到同一高度，同时核对完整长文仍保留在同一个输入节点中。
  // 此检查不会把重置到默认预设误认为折叠后恢复成功。
  // 使用原生文本恢复并派发 input，使公共受控参数也恢复原草稿。
  await click('[data-mask-fit]'); await shot('mask-height-collapsed'); await click('[data-mask-prompt] button[aria-expanded]'); await new Promise(resolve=>setTimeout(resolve,360));
  const restored = await measure();
  smoke.check('Expanding restores allocation and retains the complete positive draft', Math.abs(restored.stage.h-expanded.stage.h)<1 && Math.abs(restored.positive.h-expanded.positive.h)<1 && await run("document.getElementById('mask-positive').textContent===window.__maskHeightLong"));
  await run("(()=>{const e=document.getElementById('mask-positive');e.textContent=window.__maskHeightDraft;e.dispatchEvent(new Event('input',{bubbles:true}));delete window.__maskHeightDraft;delete window.__maskHeightLong})()");
  // 桌面、紧凑栏和窄屏都要消除左栏底部死区，不能只修截图对应宽度。
  // 窄屏按钮占据自身高度，grid 应使用剩余高度而非再占父级完整高度。
  // 每档同时检查 stage 与正向词不重叠，避免靠溢出覆盖消除视觉空白。
  // 最小画布不要求强行适应极矮窗口，后面另测滚动可访问性。
  // 回到桌面再继续原工具回归，不把断点状态泄漏给下个模块。
  // 截图仅用于审阅，不用固定像素金图代替浏览器几何断言。
  // 失败时附上实际几何，区分底部留白、区域重叠与最小高度触发的内部滚动。
  // 这些数据来自浏览器当前布局，不用源样式字符串作为验证依据。
  // 诊断不改变判据；确实需要滚动时仍应由单独的短视口用例解释。
  for (const width of [1440,900,390]) { await metrics(width,900); const m=await measure(); smoke.check('Canvas fills remaining left area at '+width+'px', Math.abs(m.positive.b-m.left.b)<1 && m.stage.b<=m.positive.t && m.stage.h>160,JSON.stringify(m)); await shot('mask-height-'+width); }
  // 极矮窗口允许左栏内部滚动，工具和正向词必须仍可抵达。
  // 滚到底后正向词底边进入左栏视口，排除 overflow-hidden 直接裁掉。
  // 左栏不必强行变高撑开 main，固定视口边界继续由应用外壳负责。
  // 恢复尺寸后将滚动位置归零，下一项真实画笔输入才能命中图像。
  await metrics(390,480); await run("(()=>{const e=document.querySelector('[data-mask-grid] section');e.scrollTop=e.scrollHeight})()");
  const short = await measure(); smoke.check('Short viewport keeps positive controls reachable by internal scrolling', short.stage.h>=160 && short.positive.b<=short.left.b+1);
  await metrics(1440,900); await run("document.querySelector('[data-mask-grid] section').scrollTop=0"); await click('[data-mask-fit]');
};
