/**
 * 点状画布与选区真实交互回归：通过生产 DOM 操作并独立解码 PNG。
 * 复用外层隔离 Electron 窗口、512×320 测试素材与既有下载拦截。
 * 不读取产品 store，不复制产品几何算法计算预期结果。
 * 当前文档已存在 RGB 笔迹，因此 alpha 检查选择远离边界的内部点。
 * 每个破坏性操作都用原 UI 撤销，结束时后续工具回归可继续运行。
 * 服务端仍为模拟 IPC，本组不验证真实 ComfyUI GPU 推理。
 */

// 通过当前图像矩形换算输入，图像 zoom、pan 与 DPR 不改变比例语义。
// 原生鼠标发送给 Chromium，不能用调用 store 直接创建选区冒充交互。
// 逐点等待避免浏览器把套索多次 move 合并为一个终点。
// 捕获期间尺寸保持同一版本，松开后再等待完成选择与工具栏提交。
// 首尾允许相同，套索直线闭合仍要包含中间多个非共线顶点。
// 入口恢复适应图像，后续测试单独覆盖放大后坐标映射。
// 选择工具切换通过按钮，不依赖默认上一次停在哪支工具。
// 每条完成手势重新聚焦画布，Delete 因此走实际局部键盘处理。
async function select(ctx, tool, points, fit=true) {
  // fit=false 专供观察矩阵测试；其他用例复位，避免依赖前一个测试留下的倍率。
  // 工具按钮还负责切回 painting，不能只假定当前显示的是可写通道。
  await ctx.click('[data-mask-mode='+tool+']'); if(fit) await ctx.click('[data-mask-fit]');
  // 读取 canvas 的 CSS 矩形而非 width 属性，输入坐标必须属于 Chromium 视口。
  // 512×320 的自然尺寸留给独立解码断言，不在此对产品输出做逆向修正。
  const r=await ctx.run("(()=>{const r=document.querySelector('[data-mask-surface]').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()");
  // 比例输入让不同 DPR 和布局共用相同图片位置；舍入只用于原生鼠标事件。
  // 此函数不求选区覆盖率，预期内部点在各场景中直接写明。
  const at=p=>({x:Math.round(r.x+p[0]*r.w),y:Math.round(r.y+p[1]*r.h)});
  // 使用主键，右键应打开上下文菜单而不能顺便建立新选择。
  // 首个输入启动真实 pointer capture，后续移动可越过原按下位置。
  ctx.input({type:'mouseDown',button:'left',clickCount:1,...at(points[0])});
  // 输入间隔只避免同步事件合并，捕获是否有效由实际pointer事件观察。
  // mouseMove须声明仍按住左键，否则Electron会模拟没有按键的悬停。
  // 等待不绕过产品捕获实现，也不主动分发带指定目标的DOM事件。
  await new Promise(resolve=>setTimeout(resolve,35));
  // 等待放在主进程，窗口偶然遮挡时不依赖页面 requestAnimationFrame。
  // 最后一笔仍由 mouseUp 补终点，可发现只处理 move 却漏结束提交的错误。
  for(const point of points.slice(1)) {ctx.input({type:'mouseMove',button:'left',modifiers:['leftButtonDown'],...at(point)});await new Promise(resolve=>setTimeout(resolve,35));}
  // 返回前留出 React 提交时间；后续按钮断言观察的是完整选区而非开放草稿。
  // 不把超时当成功，按钮未出现时既有 click/wait 会明确失败。
  ctx.input({type:'mouseUp',button:'left',clickCount:1,...at(points.at(-1))}); await new Promise(resolve=>setTimeout(resolve,140));
}

// 单击与直线不包含面积，不能启用任何选择删除入口。
// 开放手势被 Escape 中断后不再提交，原像素仍完整保留。
// pointerup 前只有开放轨迹，Delete 不得把临时点当成已选区域。
// Escape 中断后发送迟到 pointerup，确保旧手势不会复活选区。
// 退化手势仅验证无操作，越界范围由后续独立边界用例验证。
// 自交套索用上下两个三角区域验证奇偶含义，不按总有向面积拒绝。
// 前后输出读取正式 PNG，未操作区域不会由测试常量替代。
// 只需要 DOM 输入注入的边界用例，不声称覆盖真实触屏驱动取消事件。
async function degenerateAndDraft(ctx,helpers) {
  // baseline 来自现有文档，包括基础套件留下的绘画，不能用空白 PNG 代替。
  // painting 不带重绘蒙版，适合检查工具是否意外修改用户图片。
  const {run,click,smoke}=ctx,{output,decode}=helpers,baseline=await output(ctx,'painting');
  // 矩形单击、水平椭圆和共线套索分别触发三种工具的退化路径。
  // 同时要求操作组不存在和 PNG 相同，防止仅隐藏按钮却已经写入像素。
  // 直线套索包含三个不同点，专门排除仅靠点数判定有效面积的实现。
  for(const [tool,points] of [['rectangle',[[.4,.4],[.4,.4]]],['ellipse',[[.2,.4],[.8,.4]]],['lasso',[[.2,.4],[.5,.4],[.8,.4]]]]) {await select(ctx,tool,points);smoke.check(tool+' zero-area gesture creates no actionable selection',!await run("Boolean(document.querySelector('[data-mask-selection-actions]'))")&&await output(ctx,'painting')===baseline);}
  // 原生输入需要确定起点；临时窗口字段仅缓存坐标，不访问产品 store。
  // 坐标在最后一次 fit 之后取值，避免用上一张图或旧视口的矩形。
  await click('[data-mask-mode=lasso]');await run("(()=>{const e=document.querySelector('[data-mask-surface]'),r=e.getBoundingClientRect();window.__draftPoint={x:r.x+r.width*.3,y:r.y+r.height*.3}})()");
  // 故意不发送 mouseUp；此时用户仍拖动，不应得到可删除的已完成轮廓。
  // 这里仅检验动作守卫，轨迹的视觉样式由截图检查，不冒充逐像素虚线断言。
  const point=await run('window.__draftPoint');ctx.input({type:'mouseDown',button:'left',clickCount:1,...point});ctx.input({type:'mouseMove',x:point.x+40,y:point.y+20});await new Promise(resolve=>setTimeout(resolve,70));
  smoke.check('An unfinished lasso cannot enable selection actions',!await run("Boolean(document.querySelector('[data-mask-selection-actions]'))"));
  // 物理按键走 stage 冒泡处理；不直接调用取消函数跳过焦点边界。
  // 迟到抬起模拟用户按 Escape 时仍按住鼠标，不能重新提交已经取消的手势。
  // keyUp 配对释放，避免剩余按键状态影响之后的快捷键测试。
  ctx.input({type:'keyDown',keyCode:'Escape'});ctx.input({type:'keyUp',keyCode:'Escape'});ctx.input({type:'mouseUp',button:'left',clickCount:1,x:point.x+50,y:point.y+40});await new Promise(resolve=>setTimeout(resolve,100));
  smoke.check('Escape cancels a drawing and late pointerup cannot restore it',!await run("Boolean(document.querySelector('[data-mask-selection-actions]'))")&&await output(ctx,'painting')===baseline);
  // 蝴蝶结有向面积相抵，但上下两瓣仍有奇偶填充面积，应允许提交。
  // 独立采样上瓣内部和侧边空区，不能由包围矩形删除冒充套索。
  await select(ctx,'lasso',[[.2,.2],[.8,.8],[.2,.8],[.8,.2],[.2,.2]]);await click('[data-mask-delete-selection]');const crossed=decode(await output(ctx,'painting'));
  // 撤销发生在取样之后，确保下一组不是在已经透明的图片上重复“删除成功”。
  // 此组不比较交叉边界的抗锯齿值，避免浏览器采样细节造成脆弱断言。
  smoke.check('Self-crossing lasso uses even-odd filled lobes',crossed.pixel(256,90)[3]===0&&crossed.pixel(110,160)[3]===255);await click('[data-mask-action=undo]');
}
// 图片导出调用真实下载入口，并用既有独立 PNG filter-0 解码器读 alpha。
// 对比字节和尺寸，不把屏幕棋盘的颜色当成透明证据。
// 每次动作前后都从正式 Blob 获取结果，不读取展示 canvas 的虚线像素。
// 破坏性操作结束撤销，后续分组不会继承已经删除的底图。
// 三种形状内部选点一致，外部角点提供独立的保留对照。
// 套索是非对称三角形，能够发现路径只取了矩形包围框的错误。
// Delete 触发局部原生 key 事件，独立于顶部按钮的 onClick。
// 空选区测试必须比较完整 PNG，不能只看按钮处于禁用样式。
async function shapes(ctx, helpers) {
  // smoke 累计失败并由外层退出码护栏处理，不因后一条成功覆盖先前失败。
  // decode 属于测试辅助，未复用 selectionCoverage 等产品路径。
  const {smoke,run,click}=ctx, {output,decode}=helpers;
  // 对照在第一种形状之前导出，三种工具都必须恢复同一版本。
  // 字节相等比仅检查一个角点更能发现撤销遗漏 RGB 或另一通道的情况。
  const baseline=await output(ctx,'painting');
  // 三角套索中心与矩形/椭圆中心共享内部样本，侧角始终是未选对照。
  // 闭合终点重复起点，覆盖常见手绘回到起点的输入。
  for(const [tool,points] of [['rectangle',[[.2,.2],[.8,.8]]],['ellipse',[[.2,.2],[.8,.8]]],['lasso',[[.2,.2],[.8,.2],[.5,.8],[.2,.2]]]]) {
    // 显式聚焦 stage，排除焦点还停留在工具按钮或导出控件上的干扰。
    // 原生 Delete 与下一组顶部删除入口形成独立的调用通道。
    await select(ctx,tool,points); await run("document.querySelector('[data-mask-stage]').focus()"); ctx.input({type:'keyDown',keyCode:'Delete'});ctx.input({type:'keyUp',keyCode:'Delete'});await new Promise(resolve=>setTimeout(resolve,100));
    // 512×320 未变证明是透明删除；中心0与角点255证明不是整图清空。
    // 远离边界的像素应完全透明，不能接受仅降低图像整体 opacity。
    const image=decode(await output(ctx,'painting')); smoke.check(tool+' Delete makes selected alpha transparent without resizing',image.width===512&&image.height===320&&image.pixel(256,130)[3]===0&&image.pixel(10,10)[3]===255);
    // undo 使用现有工具栏历史入口，未通过再次导入素材重置测试。
    // 这一对照同时验证新增删除动作确实进入公共文档历史。
    await click('[data-mask-action=undo]'); smoke.check(tool+' Delete undo restores exact exported pixels',await output(ctx,'painting')===baseline);
  }
  // 撤销会清选区；再按 Delete 可发现把 null 解释为全图范围的危险默认值。
  // 无操作不应依赖按钮 disabled，因为本场景没有经过顶部删除按钮。
  await run("document.querySelector('[data-mask-stage]').focus()");ctx.input({type:'keyDown',keyCode:'Delete'});ctx.input({type:'keyUp',keyCode:'Delete'});
  smoke.check('Delete without a selection leaves all pixels unchanged',await output(ctx,'painting')===baseline);
}

// 反选只换区域，不翻转图像；先核对像素未变化再进行 Delete。
// 删除外围应保留中心并保持原尺寸，不能把它误实现成裁剪。
// PNG 的 image 通道也要透明，防止工作流编码把 alpha 重新覆盖成 255。
// 文本焦点用现有正向词输入，按键不应传播到画布删除图片。
// 提示词草稿先保存并恢复，避免污染后续生成工作流断言。
// 右键菜单从窗口底角打开，实测矩形必须留在可视区域内。
// 菜单取消动作必须和顶部共享，而不是关闭菜单却保留错误选择。
// 菜单角色和 disabled 是可访问契约，检查真实 DOM 而非类名。
async function inverseAndFocus(ctx, helpers) {
  // image 原有 mask 已让部分像素透明，保留对照应读取原实际 alpha。
  // painting 与 image 是不同通道，不把 painting 的不透明性强加给工作流输入。
  // 反选删除必须保持未选区原值，而不是把其强制写成 255。
  const {run,click,smoke}=ctx,{output,decode}=helpers,baseline=await output(ctx,'painting'),beforeImage=decode(await output(ctx,'image'));
  // 此处通过按钮反选，测试的结果应只改变后续操作范围。
  // 原图通道预先读取实际 alpha，已有重绘蒙版可能让内部样本并非不透明。
  await select(ctx,'rectangle',[[.2,.2],[.8,.8]]);await click('[data-mask-invert-selection]');
  smoke.check('Inverting a selection does not alter image bytes',await output(ctx,'painting')===baseline);
  // 改查工作流使用的 image，而不是仅验证用户下载用 painting。
  // Delete 后保留中心必须延续原 alpha，不能错误地补回已有透明区域。
  await click('[data-mask-delete-selection]');const image=decode(await output(ctx,'image'));
  smoke.check('Inverted Delete keeps the subject and exports transparent outside',image.width===512&&image.height===320&&image.pixel(150,130)[3]===beforeImage.pixel(150,130)[3]&&image.pixel(10,10)[3]===0);
  // 在输入框测试前仍留有效选区，才能证明焦点过滤而非“无区自然无操作”。
  // 椭圆替换矩形也验证工具切换不会把先前反选标志泄漏到新选择。
  await click('[data-mask-action=undo]');await select(ctx,'ellipse',[[.2,.2],[.8,.8]]);
  // 正向提示词是实际 contenteditable，覆盖普通 textarea 之外的文本目标。
  // 保存草稿避免测试删除一个字符后污染后续工作流预期。
  await run("window.__selectionPositive=document.getElementById('mask-positive').textContent;document.getElementById('mask-positive').focus()");ctx.input({type:'keyDown',keyCode:'Delete'});ctx.input({type:'keyUp',keyCode:'Delete'});
  smoke.check('Delete in positive text never deletes image pixels',await output(ctx,'painting')===baseline);
  // 恢复输入也发送 input 通知受控状态，避免只改 DOM 却保留旧草稿。
  // 菜单落点故意距视口右下仅2px，默认固定定位会明显超出窗口。
  // 这个合成事件只测试 contextmenu 处理与定位，不宣称已覆盖操作系统原生菜单。
  await run("(()=>{const e=document.getElementById('mask-positive');e.textContent=window.__selectionPositive;e.dispatchEvent(new Event('input',{bubbles:true}));delete window.__selectionPositive;document.querySelector('[data-mask-stage]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2}))})()");await ctx.wait("document.querySelector('[role=menu] [data-mask-invert-selection]')");
  smoke.check('Selection context menu stays within the viewport',await run("(()=>{const r=document.querySelector('[role=menu]').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));
  // 从 menu 作用域寻找按钮，防止误点击同名顶部动作导致菜单分支根本没运行。
  // 轮廓动作不改像素，完整 PNG 对照排除意外执行 cancel(saved) 的实现。
  await click('[role=menu] [data-mask-deselect]');smoke.check('Context deselect clears selection without changing pixels',!await run("Boolean(document.querySelector('[data-mask-selection-actions]'))")&&await output(ctx,'painting')===baseline);
}

// 椭圆裁剪应改宽高且四角透明，矩形位图格式本身不会变成圆形文件。
// 进入裁剪先预览，未确认时像素尺寸与完整字节不能提前改变。
// 取消只丢预览，选区仍可用于重新进入同一个裁剪入口。
// 水平镜像同步移动非对称选区，实际 Delete 验证映射而非查 state。
// 整图翻转后撤销必须恢复原字节，不能用第二次翻转代替历史验证。
// 形状外透明由 alpha 表达，不使用黑/白填充来伪装裁剪成功。
// 测试所有像素点远离抗锯齿边缘，允许浏览器合法边缘覆盖差异。
// 三层都走已有 history，撤销一次恢复完整输入而非逐通道撤回。
async function cropAndFlip(ctx,helpers) {
  // 裁剪依赖原有历史和导出，不创建另一张仅用于显示的缩略图。
  // 本组保持初始512×320，非矩形框预期可直接独立估算。
  const {click,smoke}=ctx,{output,decode}=helpers,baseline=await output(ctx,'painting');
  // 不拖动裁剪工具，直接复用椭圆；若入口重置选区，这里无法出现确认按钮。
  // 进入预览仍须输出原字节，不能为了显示框就先破坏原文档。
  await select(ctx,'ellipse',[[.2,.2],[.8,.8]]);await click('[data-mask-mode=crop]');
  smoke.check('Crop reuses existing ellipse without changing pixels before confirmation',await output(ctx,'painting')===baseline&&await ctx.run("Boolean(document.querySelector('[data-mask-apply-crop]'))"));
  // 取消只退出待确认状态，保留轮廓以便立即重新进入同一个裁剪工具。
  // 若实现先裁后回滚，后面的历史对照也会暴露多余撤销条目。
  await click('[data-mask-cancel-crop]');smoke.check('Cancelling crop preserves original dimensions and bytes',await output(ctx,'painting')===baseline);
  // 60%宽高对应约307.2×192，允许输入坐标取整和边缘抗锯齿的数像素差。
  // 中央保持不透明、角点透明，排除仅裁出矩形包围框的伪非矩形实现。
  await click('[data-mask-mode=crop]');await click('[data-mask-apply-crop]');const cropped=decode(await output(ctx,'painting'));
  smoke.check('Ellipse crop outputs its bounds with transparent corners',Math.abs(cropped.width-308)<=3&&Math.abs(cropped.height-192)<=3&&cropped.pixel(0,0)[3]===0&&cropped.pixel(Math.floor(cropped.width/2),Math.floor(cropped.height/2))[3]===255);
  await click('[data-mask-action=undo]');smoke.check('One undo restores the entire shaped crop',await output(ctx,'painting')===baseline);
  // 矩形故意位于左上，不用居中选择，否则错误地不映射也可能通过。
  // 镜像后删除右上，左上仍存在，证明像素与选区共同翻转。
  await select(ctx,'rectangle',[[.1,.1],[.35,.4]]);await click('[data-mask-action=flipX]');await click('[data-mask-delete-selection]');const flipped=decode(await output(ctx,'painting'));
  smoke.check('Horizontal flip maps the selection with image pixels',flipped.pixel(400,70)[3]===0&&flipped.pixel(100,70)[3]===255);
  // 删除与镜像是两次明确动作，因此连续两次 undo 才应回到本组起点。
  // 不检查仅屏幕尺寸恢复，完整 PNG 还能暴露被漏回滚的透明像素。
  await click('[data-mask-action=undo]');await click('[data-mask-action=undo]');smoke.check('Flip and delete history restore original output',await output(ctx,'painting')===baseline);
}

// 缩放只改屏幕矩形，同一相对位置必须仍对应原图相同像素。
// 平移通过实际 Hand 工具拖动，不直接修改 CSS transform 或组件 offset。
// 两次选择之间不执行 fit，防止测试主动清掉待验证的缩放和平移状态。
// 只选图像中央，放大后矩形仍落在 stage 可见范围，避免点在裁切外。
// 提交 Delete 后独立查 PNG 的中心与边角，排除虚线看似正确但像素错位。
// redo 对比第一次删除的完整 PNG，不通过再次调用 Delete 替代历史导航。
// 最后恢复 fit 和 draw，像素与视图状态都不泄漏到后续滤镜用例。
// 原图 RGB 和 mask 仍由同一历史记录恢复，不能让 redo 只恢复展示层。
async function zoomAndHistory(ctx,helpers) {
  // 本组不改变文档尺寸，倍率变化只作用于显示与指针换算。
  // baseline 也验证前一组已经撤销干净，不能沿用另一个裁剪后的预期。
  const {run,click,smoke}=ctx,{output,decode}=helpers,baseline=await output(ctx,'painting');
  // 先fit再放大，避免累计上一轮使用者视图造成目标落在可视边界外。
  // 随后使用平移工具，验证一次选择同时经历 scale 与 offset 两部分换算。
  await click('[data-mask-fit]');await click('[data-mask-stage] button[aria-label=放大]');await click('[data-mask-mode=pan]');
  const p=await run("(()=>{const r=document.querySelector('[data-mask-stage]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");ctx.input({type:'mouseDown',button:'left',clickCount:1,...p});ctx.input({type:'mouseMove',x:p.x+18,y:p.y+12});ctx.input({type:'mouseUp',button:'left',clickCount:1,x:p.x+18,y:p.y+12});await new Promise(resolve=>setTimeout(resolve,100));
  // false 保留刚完成的 zoom/pan，辅助函数不能为了方便点击而悄悄复位。
  // 选择中央20%区域，保证图片放大后仍在固定视口内，可实际接收鼠标。
  await select(ctx,'rectangle',[[.4,.4],[.6,.6]],false);await click('[data-mask-delete-selection]');const removed=await output(ctx,'painting'),image=decode(removed);
  smoke.check('Zoom and pan preserve selection original-pixel mapping',image.pixel(256,160)[3]===0&&image.pixel(10,10)[3]===255);
  // redo 比较此前保存的 removed 字节，不能重新生成同样的选区来替代历史操作。
  // 最后一条undo还原图像，而fit仅还原观察矩阵，两者职责分别检查。
  await click('[data-mask-action=undo]');smoke.check('Selection delete undo restores original after zoom and pan',await output(ctx,'painting')===baseline);await click('[data-mask-action=redo]');smoke.check('Selection delete redo restores exact transparent PNG',await output(ctx,'painting')===removed);await click('[data-mask-action=undo]');await click('[data-mask-fit]');
}

// 背景与透明格读取实际计算样式，导出字节必须不受主题切换影响。
// 鼠标悬停使用真实输入，名称在工具栏右侧且不造成 stage 变窄。
// 正向词收起高度由既有独立回归覆盖，本组不重复同一实现断言。
// DPR 用系统仿真1.25与1.5，比例落点仍删除相同原图像素。
// 放大图像后在同一原图比例建区，屏幕坐标不能当自然坐标使用。
// 每档删除后立即撤销，主题和视口恢复为后续工具组的原前置。
// 测试不宣称触屏设备压感或操作系统所有缩放配置均已覆盖。
// 深浅截图记录真实静态导出页面，不使用需求模板生成假预览。
async function appearanceAndScale(ctx,helpers) {
  // 这里检查实际 computed style，源码里出现 radial-gradient 不足以证明被正确应用。
  // 隔离夹具初始theme为light，所以第一个颜色是可复现的浅色参照。
  const {run,click,metrics,smoke,shot}=ctx,{output,decode}=helpers,baseline=await output(ctx,'painting');
  // rail宽48与按钮36分别代表布局和点击目标，不能只校验图标SVG大小。
  // 单一crop计数防止复用时又在顶部创建一套重复主要工具。
  // 检查每个按钮实际offset尺寸，避免大容器包裹过小的命中区域。
  // 栏宽必须固定48，文字提示不能使它随名称长度膨胀。
  smoke.check('Local tool rail has one crop and only real tools with 36px targets',await run("(()=>{const rail=document.querySelector('[data-mask-tool-rail]'),r=rail.getBoundingClientRect();return r.width===48&&rail.querySelectorAll('[data-mask-mode=crop]').length===1&&[...rail.querySelectorAll('button')].every(e=>e.offsetWidth>=36&&e.offsetHeight>=36)})()"));
  // 悬停用真实鼠标输入，不能调用组件显示函数绕过 hover 延迟。
  // 目标选靠顶部的矩形工具，短视口滚动不参与这次名称位置检查。
  // 提示位于按钮右边，stage 宽度前后完全一致，排除用正常流插入文字。
  // 目标提示必须 visible，不能把先挂载的透明 Portal 当成已经出现。
  // 420ms覆盖出现延迟与动画，位置断言观察稳定后的几何。
  // 提示挂在Portal中，必须从document搜索，不能限定为rail子节点。
  // stage宽度使用CSS像素，不能把DPR导致的绘制缓冲差异当成布局变化。
  const target=await run("(()=>{const r=document.querySelector('[data-mask-mode=rectangle]').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),right:r.right,stage:document.querySelector('[data-mask-stage]').getBoundingClientRect().width}})()");ctx.input({type:'mouseMove',x:target.x,y:target.y});await new Promise(resolve=>setTimeout(resolve,420));
  smoke.check('Tool name appears to the right without shrinking the canvas',await run("(()=>{const e=[...document.querySelectorAll('[data-mask-tool-tip]')].find(e=>e.dataset.visible==='true'&&e.textContent==='矩形选区');return !!e&&e.getBoundingClientRect().left>="+target.right+"&&document.querySelector('[data-mask-stage]').getBoundingClientRect().width==="+target.stage+"})()"));
  ctx.input({type:'mouseMove',x:target.x+140,y:target.y});await new Promise(resolve=>setTimeout(resolve,180));
  smoke.check('Leaving a tool fades its name without changing the selected mode',await run("![...document.querySelectorAll('[data-mask-tool-tip]')].some(e=>e.dataset.visible==='true')"));
  // 使用产品真实主题菜单，不只给根节点手工加类制造局部假深色。
  // 等待 view transition 结束，截图反映完整应用最终配色。
  // 选区与 PNG 不因主题切换而重建或重置。
  // 全局主题事实来源为data-theme；手加dark类会掩盖产品真正不跟随主题的错误。
  // 浅色参照读取完整computed值，测试不复制产品两种背景色常量。
  // 只检查点阵存在会漏掉始终停在浅色的问题，因此还要求实际底色改变。
  // 截图在菜单关闭后取得，避免外观设置挡住工作区。
  // 菜单关闭后再截图，避免外观面板遮住待核对画布。
  const light=await run("getComputedStyle(document.querySelector('[data-mask-stage]')).backgroundColor");await click('[data-theme-trigger]');await click('[data-theme-option=dark]');await require('./sidebar-menu-fixture').closeAppearance(run);await ctx.wait("document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('theme-ripple')");await shot('mask-selection-dark');
  smoke.check('Both themes keep dotted workspace and separate transparency checker',await run("getComputedStyle(document.querySelector('[data-mask-stage]')).backgroundImage.includes('radial-gradient')&&getComputedStyle(document.querySelector('[data-mask-surface]')).backgroundImage.includes('conic-gradient')&&getComputedStyle(document.querySelector('[data-mask-stage]')).backgroundColor!=="+JSON.stringify(light)));
  smoke.check('Theme and editor decorations never change exported pixels',await output(ctx,'painting')===baseline);await click('[data-theme-trigger]');await click('[data-theme-option=light]');await require('./sidebar-menu-fixture').closeAppearance(run);await ctx.wait("!document.documentElement.classList.contains('theme-ripple')");await shot('mask-selection-light');
  // 系统缩放仿真改变deviceScaleFactor，未改源图片自然宽高。
  // 像素样本在每档操作后独立读取，不用屏幕颜色判断源图片透明度。
  // 本仿真覆盖Chromium坐标，不宣称验证全部系统驱动和真实触屏。
  // 同一中央和边角样本在每档均保持原语义，避免产品重复乘以DPR。
  // 每档先撤销再换档，不能让上一档透明中心掩盖本档完全未执行的删除。
  for(const dpr of [1.25,1.5]) {await metrics(1440,900,dpr);await select(ctx,'rectangle',[[.2,.2],[.8,.8]]);await click('[data-mask-delete-selection]');const image=decode(await output(ctx,'painting'));smoke.check('Selection uses original pixels at DPR '+dpr,image.pixel(256,130)[3]===0&&image.pixel(10,10)[3]===255);await click('[data-mask-action=undo]');}
  await metrics(1440,900,1);await click('[data-mask-mode=draw]');
}

// 反选裁剪通常仍保留整图包围框，不能套用原中心轮廓的小框。
// 用原生组合键触发反选，覆盖按钮路径以外的局部键盘入口。
// 只删除中心的反选裁剪应保留四角，而椭圆正选裁剪则让四角透明。
// 三角套索的透明角检验可发现裁剪丢弃真实轮廓只取 bounding box。
// 输出仍通过真实下载读取，未把测试点手工写进产品位图。
// 本组每种裁剪均撤销，不能让上一种形状的透明区掩盖下一种失效。
// 镜像使用不居中的选择，保证未映射选择一定会被像素对照发现。
// 图像尺寸不改变时也须映射选区，不能只靠宽高互换触发更新。
async function inverseCropAndVertical(ctx,helpers) {
  // baseline属于本组之前的完整像素，而非把工作流image误当作painting。
  // cropped导出的尺寸由PNG解码读取，未采信UI尺寸标签。
  const {run,click,smoke,shot}=ctx,{output,decode}=helpers,baseline=await output(ctx,'painting');
  // stage重新聚焦后发带修饰键的真实按键，Portal菜单不参与此次快捷键。
  // Ctrl+Shift+I仅改变选择含义，尚未确认裁剪时不允许改像素。
  await select(ctx,'rectangle',[[.2,.2],[.8,.8]]);await run("document.querySelector('[data-mask-stage]').focus()");ctx.input({type:'keyDown',keyCode:'I',modifiers:['control','shift']});ctx.input({type:'keyUp',keyCode:'I',modifiers:['control','shift']});await new Promise(resolve=>setTimeout(resolve,80));await click('[data-mask-mode=crop]');await click('[data-mask-apply-crop]');const inverse=decode(await output(ctx,'painting'));
  // 中心透明、原角点不透明、宽高不变共同区分反选裁剪与普通矩形裁剪。
  // 中心样本远离轮廓，所以不接受抗锯齿半透明作为正确结果。
  smoke.check('Keyboard inversion crops the outside selection at full image bounds',inverse.width===512&&inverse.height===320&&inverse.pixel(256,160)[3]===0&&inverse.pixel(10,10)[3]===255);await click('[data-mask-action=undo]');
  // 套索不对称，顶边宽、底部尖；包围框左下角必须在真实形状以外。
  // screenshot保留非矩形透明预览的实际证据，后面再撤销。
  await select(ctx,'lasso',[[.2,.2],[.8,.2],[.5,.8],[.2,.2]]);await click('[data-mask-mode=crop]');await click('[data-mask-apply-crop]');const lasso=decode(await output(ctx,'painting'));await shot('mask-selection-shaped-crop');
  // 选区内样本用裁剪后坐标，不能继续按512×320原点读取。
  // 原点变化后中心仍存在，证明裁剪移动了图层而非仅改变导出宽高字段。
  // 不比较边界抗锯齿细节，内部与外部样本都具有明确透明语义。
  // 产品截图与独立PNG解码互为补充，不以测试生成的图替代实际页面。
  smoke.check('Lasso crop retains its shape and clears bounding-box corners',Math.abs(lasso.width-308)<=3&&Math.abs(lasso.height-192)<=3&&lasso.pixel(2,lasso.height-3)[3]===0&&lasso.pixel(Math.floor(lasso.width/2),Math.floor(lasso.height/2))[3]===255);await click('[data-mask-action=undo]');
  // 上方选择经垂直翻转落在下方，水平翻转的实现无法误通过这条断言。
  // 连续两个undo分别撤销Delete和flipY，不能让下一组从翻转后的文档开始。
  await select(ctx,'rectangle',[[.1,.1],[.35,.4]]);await click('[data-mask-action=flipY]');await click('[data-mask-delete-selection]');const vertical=decode(await output(ctx,'painting'));
  // 下面透明、上面不透明分别提供正负对照，尺寸相同不足以证明方向正确。
  // 检查的是透明操作位置，不依赖测试素材本身具有明显上下色彩差异。
  smoke.check('Vertical flip maps selection to the opposite image edge',vertical.pixel(100,250)[3]===0&&vertical.pixel(100,70)[3]===255);await click('[data-mask-action=undo]');await click('[data-mask-action=undo]');
  // 完整字节恢复避免仅凭先前两个样本忽略角落或蒙版内容的损失。
  // 像素历史动作与选区动作分离，各次裁剪不应留下额外空历史条目。
  smoke.check('Shaped crop and vertical flip history restore the original document',await output(ctx,'painting')===baseline);
}

// 窗口变窄会改变图片适应倍率，选区仍必须定位到同一自然像素。
// 390px代表实际紧凑UI，320px的布局可达性另由原工具套件覆盖。
// 越界拖动依赖pointer capture，不允许把点阵外空间当作新增像素。
// 先在左上内部按下再向左越界，可检查夹取同时保证按下确实命中图片。
// 这里不模拟操作系统触控取消，不声称覆盖真实多点触屏硬件。
// 窄屏测试结束恢复原视口，完整创建页后续回归复用同一窗口。
async function boundsAndNarrow(ctx,helpers) {
  // 仅删除一次又撤销，后面的视口断言从未变更像素开始。
  // 截图保留已选状态，便于核查虚线是否在图片边界正确收口。
  const {click,smoke,metrics,shot}=ctx,{output,decode}=helpers;
  // 终点x=-0.1穿过左边界，预期只会影响原图左上小块。
  // 0.05,0.3是内部对照；0.5,0.5在选区外仍必须保留。
  // 开始点避开左上设置按钮，记录结果以区分输入未命中和像素算法错误。
  // 缺少有效选择直接报告实际页面状态，不能用通用null.click掩盖失败位置。
  // screenshot在删除前留下指针捕获与边界预览证据，供回归失败定位。
  await select(ctx,'rectangle',[[.3,.2],[-.1,.6]]);await shot('mask-selection-boundary');if(!await ctx.run("Boolean(document.querySelector('[data-mask-delete-selection]'))")) throw new Error('Boundary gesture did not create a completed selection');await click('[data-mask-delete-selection]');const clipped=decode(await output(ctx,'painting'));
  // 不允许为越界手势扩容文件，也不能因负坐标把另一侧图片误删。
  // 输出尺寸与原尺寸严格相同，边界合法性不依赖CSS overflow遮盖。
  // 起点始终在图内，防止越界测试根本没开始手势却被误判通过。
  // 一内一外两点也可发现负坐标错误地从图片右侧取样的情况。
  smoke.check('Dragging beyond image bounds clips selection without expanding output',clipped.width===512&&clipped.height===320&&clipped.pixel(20,100)[3]===0&&clipped.pixel(256,160)[3]===255);await click('[data-mask-action=undo]');
  // 调整的是Electron仿真视口，产品自己的响应布局与ResizeObserver仍正常执行。
  // 不能给canvas强设宽度来伪造窄屏，也不直接修改scale或selection状态。
  // 视口变化由metrics等待生效，随后fit读取产品测得的实际容器。
  // 输出仍应512×320，而非用窄屏缩略图像素充当文档本身。
  await metrics(390,844,1);await select(ctx,'ellipse',[[.2,.2],[.8,.8]]);await shot('mask-selection-narrow');await click('[data-mask-delete-selection]');const narrow=decode(await output(ctx,'painting'));
  // 中心与角点不依赖屏幕剩余宽度；输出始终保持512×320自然尺寸。
  // 窄屏常见双列转单列导致坐标换算误用父main宽度，这两个点能发现偏移。
  smoke.check('Narrow workspace preserves selection pixel coordinates',narrow.width===512&&narrow.height===320&&narrow.pixel(256,130)[3]===0&&narrow.pixel(10,10)[3]===255);await click('[data-mask-action=undo]');await metrics(1440,900,1);await click('[data-mask-fit]');
}

// 模块按依赖串行执行，所有组共享同一文档，不并发点击同一个窗口。
// 每组在返回前恢复原像素，输出变更必须来自本组明确操作。
// 最后清除选择，后面的像素工具会自行选择需要的画笔或几何模式。
// helpers 只提供 PNG 独立解码和真实导出入口，不暴露产品内部状态。
// 等待失败由外层截图并非零退出，提前中断不能算作剩余用例通过。
// focused和普通全套调用同一模块，专项没有更宽松的产品实现分支。
// 实际模型输出质量不在本模块内，上传字节由原有工作流组独立验证。
// 各组均编辑内存测试文档，不改导入源文件和用户正式图库。
module.exports=async function checkMaskSelection(ctx,helpers) {await shapes(ctx,helpers);await degenerateAndDraft(ctx,helpers);await inverseAndFocus(ctx,helpers);await cropAndFlip(ctx,helpers);await zoomAndHistory(ctx,helpers);await appearanceAndScale(ctx,helpers);await inverseCropAndVertical(ctx,helpers);await boundsAndNarrow(ctx,helpers);};
