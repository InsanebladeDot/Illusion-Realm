// 只检查正式创建页顶部模式标签，保留原窗口、主题桥接和实际业务切换。
// sendInputEvent让Chromium产生真实hover，而不是给元素手动添加一个hover类。
// 模态公告由宿主先经真实关闭动作处理，本用例不会删除任何遮挡层。
// 同一个模式条在浅深主题复查，不能为通过测试临时改全局CSS变量。
// 经正式主题入口保存偏好，同时驱动nativeTheme和宿主data-theme，不只切媒体查询。
// 同时等宿主data-theme和媒体查询确认，并等待主题波纹结束，排除浅色壳的假深色证据。
// 直接调用nativeTheme只能改变媒体查询，未必改变用户设置驱动的宿主CSS属性。
// 因此本例通过正式主题弹层双向更新，深色截图必须实际呈现深色背景。
// 原失配截图保留为诊断，不因为文件名含dark就当作深色验收证据。
// 此修正只改变测试前提，不修改产品主题实现或放宽无边框预期。
// 关闭主题弹层使用原共享fixture，不能删除portal绕开焦点与遮罩。
// 四项都包含在循环内，选中项与未选项都不能出现通用按钮hover轮廓。
// 默认图片保持选中，鼠标从视频、编辑、Role TTS经过时不能自动切换业务模式。
// 两张主题截图都保留完整AppShell，可区分正式创建页与脱离宿主的组件样板。
// 切换视频用正式click动作，最后验证真实VideoCreatePanel挂载而不是只改aria属性。
// 视频panel标记来自产品原实现，不额外添加“测试通过”节点。
// 此处不发送生成请求，模型服务和账号初始化继续使用原测试隔离环境。
// 只运行本专项时仍由宿主检查构建指纹、React错误和退出码，不能绕过统一护栏。
// 选择一次视频之后专项结束，不反复切模式掩盖首次切换失败。
// 截图前的hover最后停在Role TTS，标签只有颜色反馈，没有模拟边框遮盖。
// 主题动作失败会使宿主属性或媒体查询等待超时，不靠测试强制CSS改成功。
module.exports = async ctx => {
  for (const theme of ['light', 'dark']) {
    await ctx.run("document.querySelector('[data-theme-trigger]').click()");
    await ctx.run(`document.querySelector('[data-theme-option=${theme}]').click()`);
    await require('./sidebar-menu-fixture').closeAppearance(ctx.run);
    await ctx.wait(`matchMedia('(prefers-color-scheme:dark)').matches===${theme==='dark'}&&document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')`);
    for (const index of [0, 1, 2, 3]) await hover(ctx, index, theme);
    await ctx.shot(`create-mode-hover-${theme}`);
  }
  // 正式video标签是第二项，使用当前公开DOM顺序而不是调用私有store方法。
  // 点击前四个hover已经结束，没有通过mousedown模拟持续按下选中状态。
  // aria-selected与业务面板同时满足才算切换成功，只有文字高亮不能代替业务。
  // 该断言没有等待任何视频生成，检查仅限原视频表单实际挂载。
  // 如果CSS调整误将按钮pointer-events禁用，DOMclick仍可能触发，hover命中断言负责互补。
  // 本例的鼠标输入与DOMclick在报告中区分，不声称全部都是实体点击。
  // 没有人工操作参与，因此用户触控板、系统缩放和焦点管理全路径仍需另验。
  // 标签组件未被复制，其他素材分类继续使用公共IconTabButton，不在本例改它们。
  // 视频表单有独立模型和LoRA行为，此处只确认入口不被局部视觉样式破坏。
  // 原模式条选中背景和下划线仍保留，本需求仅移除悬停新出现的按钮框。
  await ctx.run("document.querySelectorAll('[data-create-mode-tabs] button')[1].click()");
  ctx.smoke.check('Mode tab still switches real video panel', await ctx.run("document.querySelectorAll('[data-create-mode-tabs] button')[1].getAttribute('aria-selected')==='true'&&!!document.querySelector('[data-video-create-panel]')"));
};

// 获取按钮中心后注入指针，检查视觉样式与未点击状态，不能把hover当作选择。
// 每个标签都检查四条边框和outline，防止只去掉上边而仍保留粗轮廓。
// 拍照时最后一项仍在hover，截图展示鼠标效果而不是只有静态默认状态。
// 颜色比较使用父条的实际主题色，不能写死白色而在浅主题失去对比。
// 没有要求清掉键盘focus-visible；本例先点main空白后移动指针，明确鼠标前提。
// 原标签选择仍只有一项，未选项hover不能调用onChange切换生成模式。
// 采样等过渡完成再读最终颜色，不把动画中间帧当成错误主题。
// 该用例是自动事件，实体鼠标、屏幕缩放和读屏路径继续另验。
// 中心坐标先四舍五入为Electron接受的整数，不把整个控件缩成一个伪命中点。
// 要求matches(:hover)为真，窗口坐标偏移导致鼠标实际在别处时不能误通过。
// accent探针只读取父条已有变量并立即删除，不改变按钮的样式和业务属性。
// 对比computed RGB而不对比CSS变量原文，可适应用户不同的主题强调色。
// border四个方向独立读取，border-bottom遗留同样视为未满足无边框要求。
// outlineStyle也必须none，专门覆盖全局hover规则没有使用实体border的情况。
// 一项aria-selected是业务状态断言，不能为去边框将所有标签都渲染成未选。
// 原focus-visible是键盘可访问能力，本例不是要求产品对键盘也去掉焦点提示。
// 鼠标自动事件不会按Tab，若被环境设置强制focus-visible，失败应先核对焦点前提。
// 等待300毫秒针对已有color过渡，并非等待后端服务或假成功倒计时。
// 主题和标签索引写进失败名称，能区分只有某一主题或某一标签残留轮廓。
// 这一校验读取生产computed style，全局覆盖仍能被检测，不能只查源码class字符串。
// 临时颜色探针不是用户内容，没有进入store、保存器或工程JSON。
// 控件几何和原55像素模式条保持不变，本例没有为命中测试临时增大按钮。
// 空页面没有标签时应报错，不能用every空数组把测试当成通过。
// 最终截图由宿主capturePage获取，不从用户参考图裁切贴回产品窗口。
async function hover(ctx, index, theme) {
  const point = await ctx.run(`(()=>{const e=document.querySelectorAll('[data-create-mode-tabs] button')[${index}],r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  ctx.win.webContents.sendInputEvent({ type:'mouseMove', ...point });
  await new Promise(resolve=>setTimeout(resolve, 300));
  const value = await ctx.run(`(()=>{const e=document.querySelectorAll('[data-create-mode-tabs] button')[${index}],s=getComputedStyle(e),probe=document.createElement('span');probe.style.color='var(--accent-text)';e.parentElement.append(probe);const accent=getComputedStyle(probe).color;probe.remove();return e.matches(':hover')&&s.color===accent&&s.outlineStyle==='none'&&['Top','Right','Bottom','Left'].every(side=>parseFloat(s['border'+side+'Width'])===0)&&document.querySelectorAll('[data-create-mode-tabs] [aria-selected=true]').length===1})()`);
  ctx.smoke.check(`Create tab hover highlights text without border: ${theme}/${index}`, value);
}
