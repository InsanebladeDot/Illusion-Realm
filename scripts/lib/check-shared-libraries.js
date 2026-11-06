/**
 * 资料库共用组件回归：真实点击画师、动作、背景和表情入口。
 * 使用现有冒烟的临时用户文档与生产preload，不请求生成或聊天模型。
 * 主题通过应用外观按钮切换，检查真实CSS而非只查class名称。
 * 收藏分组通过UI写盘后重新加载页面，验证完整持久化链路。
 * 预览图在外层fixture拦截为本地像素，不声明线上图片服务可用。
 */
module.exports = async function checkSharedLibraries({ run, waitFor, check, click, setInput, readDocument, reload, screenshot }) {
  // 各库先验证共享卡片标记，避免只改颜色却继续保留多套内部结构。
  // 暗色和浅色都逐个打开，顺序不是单次初始化的偶然配色。
  // computedStyle从真实卡片、侧栏、工具栏和主区采样。
  // muted与background允许不同，逐个与同一页面主题变量对照。
  // 色板probe由页面创建且立即删除，仅解析CSS变量，不篡改被测组件。
  // 硬编码白色在暗色下将与bg-background预期不同，从而明确失败。
  // 遍历含表情库，保证新共用组件覆盖全部静态库而非只修截图两处。
  // 每次关闭后重新打开下一库，不让多层modal遮住真实组件。
  // 参数配置决定数据源，所有展示都应生成相同data-library-card。
  // 仅当前24张挂载；不为了测试一次性加载全部四万条卡片。
  // helper只读页面样式，不注入Zustand或修改CSS来让断言通过。
  // 软件渲染启动参数仅属于测试环境，产品参数不在这里修改。
// 本专项验证静态资料库的共享结构，角色另外由原角色冒烟回归。
// 卡片DOM标记必须同时存在库前缀与共享标记，防止查到错误浮层。
// 预期当前页24张来自正式分页配置，不渲染整个库来回避分页问题。
// 打开入口使用创建页真实button，不直接调用内部组件函数。
// 主题使用真实UI修改偏好，覆盖已保存偏好优先于系统值的情况。
// 减少动效参数只隔离已知动画停顿，不能把本结果视作主题动画已修复。
// GPU测试参数由启动命令提供，不写入生产启动配置。
// 读颜色之前等待主题标记改变，避免在旧主题下比较两个同样的旧值。
// 两套主题都重新打开四个库，覆盖初始化与切换后的布局。
// 关闭按钮限定具体dialog标题，避免误关最底层创建页。
// 截图名称包含库名和主题，深浅结果不会互相覆盖。
// 没有图片网络时仍验证空预览卡片的底色和交互。
// 图片fixture只覆盖展示图片，不拦截收藏文档写入。
// 主区预期是muted而卡片预期是background，不能把两层颜色错误合并。
// 边框比较真实计算颜色，可发现类名正确但被其他规则覆盖的问题。
// 工具栏输入背景也单独比较，避免只修卡片遗漏白色搜索框。
  for (const theme of ["dark", "light"]) {
    // 通过真实外观按钮改变应用偏好与系统媒体查询，不能只改nativeTheme。
    // 否则已保存的light偏好会把系统dark立刻纠正，测试实际仍在浅色。
    // 选择后等根主题标记翻转，颜色采样再分别确认CSS确实跟随。
    await click('[data-theme-trigger]'); await click(`[data-theme-option="${theme}"]`);
    check(`系统主题切到${theme}`, await waitFor(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`));
    await require("./sidebar-menu-fixture").closeAppearance(run);
    for (const library of ["artist", "pose", "background", "expression"]) {
      await click(`[data-${library}-library-trigger]`);
      check(`${theme}/${library}通过公共卡片与布局渲染`, await waitFor(`document.querySelectorAll('[data-${library}-card][data-library-card]').length===24&&Boolean(document.querySelector('[data-library-results]'))&&Boolean(document.querySelector('[data-library-sidebar]'))`));
      // 主图、文字和空态的底色来自共用卡片，侧栏和输入框也必须同步。
      // border只比较实际颜色，不能仅以border-border类存在当作通过。
      // theme变量由一次性隐藏节点求值，支持色彩方案产生的color-mix值。
      // 每个theme都采样新值，不拿上一次主题的缓存作为预期。
      // background与muted分别新建节点，避免修改同一probe触发背景色过渡。
      // 否则第二次读取会得到过渡首帧的旧颜色，制造与真正白块相似的假失败。
      // 两个probe均只读取初始计算样式，既不关闭被测组件动画也不改其颜色。
      const colors = await run(`(() => {const probe=document.createElement('div');probe.className='bg-background border border-border text-foreground';document.body.append(probe);const style=getComputedStyle(probe),expected={background:style.backgroundColor,border:style.borderColor};const card=document.querySelector('[data-library-card]'),side=document.querySelector('[data-library-sidebar]'),input=document.querySelector('[data-${library}-toolbar] input'),main=document.querySelector('[data-library-results]');const values={card:getComputedStyle(card).backgroundColor,side:getComputedStyle(side).backgroundColor,input:getComputedStyle(input).backgroundColor,border:getComputedStyle(card).borderColor,main:getComputedStyle(main).backgroundColor};const muted=document.createElement('div');muted.className='bg-muted';document.body.append(muted);expected.muted=getComputedStyle(muted).backgroundColor;muted.remove();probe.remove();return {expected,values};})()`);
      check(`${theme}/${library}卡片侧栏输入及主区遵循主题`, colors.values.card === colors.expected.background && colors.values.side === colors.expected.background && colors.values.input === colors.expected.muted && colors.values.main === colors.expected.muted && colors.values.border === colors.expected.border, JSON.stringify(colors));
      await screenshot(`${library}-${theme}`);
      await click(`[data-resource-dialog="${library}-library-dialog-title"] button[aria-label="关闭"]`);
    }
  }
  // 画师默认排序需作品数最高的dairi，后续测试用明确id避免同名猜测。
  // 源数据共40600条，分页只显示24条，标题不能把当前页数量当全集。
  // 收藏按钮独立于选择；先收藏不应直接向生成提示词追加文字。
  // 分组选中后再批量加入，成员来自实际卡片选择的完整草稿。
  // 使用源ID87540与129952，固定数据损坏时测试应失败而非换别的样例。
  // 每个输入通过原生value setter加input事件，沿用React真实受控链路。
  // 不直接调用store.action，因此覆盖了按钮接线与持久化的集成路径。
  // 待机写盘使用有界轮询，不能凭一次短sleep断言已经保存。
  // 重新加载会销毁所有旧组件状态，从同一临时JSON重新水合。
  // 这能区分“本页看起来还在”与“重新启动仍可恢复”的不同命题。
  // 本测试没有重装exe，不把页面重载夸大为完整安装包回归。
  await click('[data-artist-library-trigger]');
  check("画师清单包含40600条且默认按作品数排序", await waitFor(`document.querySelector('[data-artist-card]')?.getAttribute('data-artist-card')==='87540'&&document.querySelector('[data-artist-pagination-info]')?.textContent.includes('40,600')`));
  await click('[data-artist-favorite="87540"]');
  await click('[data-artist-card="87540"] button');
  await click('[data-artist-group-new]'); await setInput('[data-artist-group-name]', "Smoke collection"); await click('[data-artist-group-save]');
  // 默认收藏和用户分组是两个独立入口，空组起初必须确实没有成员。
  // 从页面读取刚创建的组ID，不假定UUID格式或系统时钟。
  // 选择组只改变浏览条件，不清除之前选择的画师草稿。
  const group = await run(`Array.from(document.querySelectorAll('[data-artist-filter-field="group"]')).find(button=>button.textContent.includes('Smoke collection')).getAttribute('data-artist-filter-value')`);
  await click(`[data-artist-filter-value="${group}"]`); await click('[data-artist-group-add]');
  check("批量加入分组后保留源画师", await waitFor(`document.querySelectorAll('[data-artist-card]').length===1&&document.querySelector('[data-artist-card]')?.getAttribute('data-artist-card')==='87540'`));
  // 重命名只改label，ID和成员必须不变，编辑操作不能重新创建第二组。
  // persisted文档在页面重载前独立检查，不靠UI自己的高亮证明写盘。
  // readDocument返回测试临时文件，不读取真实用户数据或账号信息。
  await click(`[data-artist-group-rename="${group}"]`); await setInput('[data-artist-group-name]', "Renamed collection"); await click('[data-artist-group-save]');
  check("收藏和分组写入版本化用户段", await readDocument(doc => doc.artistLibrary?.version === 1 && doc.artistLibrary.favorites.includes("87540") && doc.artistLibrary.groups.some(item => item.id === group && item.name === "Renamed collection" && item.artistIds.includes("87540"))));
// 重载前先等待JSON包含版本、组id、名称和成员四项。
// 只等文件存在不足以证明最新更名已写入，因此检查最终值。
// 同一临时文档跨reload复用，旧组件和store内存会被销毁。
// 组id从UI读取，不依赖UUID的随机具体值。
// 重载后既看心形状态也看组名，防止只恢复其中一个字段。
// 后续删除操作针对恢复出来的组，能发现持久化后的事件绑定问题。
// 删除后进入默认收藏，以实际卡片而非提示toast证明成员保留。
// 搜索另一个画师，避免收藏的旧条目一直显示造成假命中。
// 名称搜索使用唯一固定名称，结果数量和id都必须相符。
// 选择后切换只看已选再输入不命中名称，验证草稿独立性。
// 应用通过真实按钮完成，最终检查创建页提示词内容。
// 弹窗消失与文本写入同时检查，避免只关闭却没有传回标签。
// 当前测试未覆盖重装安装包，真实启动恢复另属打包验证。
// 远端缩略图未实际联网验证，截图中的占位不能冒充线上图片成功。
  await reload(); await click('[data-artist-library-trigger]');
  check("重新加载后恢复收藏与分组", await waitFor(`document.querySelector('[data-artist-favorite="87540"]')?.getAttribute('aria-pressed')==='true'&&Array.from(document.querySelectorAll('[data-artist-filter-field="group"]')).some(button=>button.textContent.includes('Renamed collection'))`));
  // 删除组只删关系，默认收藏必须仍含87540；不能删源资料。
  // 删除后列表回到全部，随后搜索另外一个明确画师测试选择与标签应用。
  // 这条验证前先重载，删除的是持久化恢复的真实组而非新建草稿。
  // 默认收藏的aria-pressed和实际网格数量同时核对，排除只改按钮文字。
  await click(`[data-artist-group-delete="${group}"]`); await click('[data-artist-filter-value="favorites"]');
  check("删除组保留默认收藏画师", await waitFor(`document.querySelectorAll('[data-artist-card]').length===1&&document.querySelector('[data-artist-card]')?.getAttribute('data-artist-card')==='87540'`));
  await click('[data-artist-filter-value=""]'); await setInput('[data-artist-toolbar] input', "ebifurya");
  check("画师名称搜索覆盖本地全集", await waitFor(`document.querySelectorAll('[data-artist-card]').length===1&&document.querySelector('[data-artist-card]')?.getAttribute('data-artist-card')==='129952'`));
  await click('[data-artist-card="129952"] button'); await click('[data-artist-only-selected]'); await setInput('[data-artist-toolbar] input', "no such artist 000");
  // 只看已选必须绕过不可能命中的名称条件，完整草稿仍可应用。
  // 应用后检查原提示词DOM内容，而非仅检查关闭状态。
  // 单个画师输出原名，不改写成模型路径或附加不存在的风格标签。
  // 前面收藏操作未被当作选择，最终生成文本应只新增ebifurya。
  check("画师已选视图独立于搜索", await waitFor(`document.querySelectorAll('[data-artist-card]').length===1`));
  await click('[data-artist-apply]');
  check("画师原名写入创建页提示词", await waitFor(`document.getElementById('prompt-editor')?.textContent.includes('ebifurya')&&!document.querySelector('[data-artist-filters]')`));
};
