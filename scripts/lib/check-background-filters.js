/**
 * 背景库真实页面回归，调用方已经打开创建页的背景弹窗。
 * 本文件只负责新增双层筛选，不替换旧的提示词应用回归。
 * 预期从页面已有原始背景数据独立计算，不调用被测过滤函数。
 * 图片仍可由已有冒烟环境拦截；本组只验证筛选、计数和选择。
 * 不请求实际生成，不写用户生产配置，结束时清空测试选择。
 */
module.exports = async function checkBackgroundFilters({ run, waitFor, check }) {
  // 整库与当前页严格分开，预期数据按原来的可用条目规则排除占位。
  // 页面只有24张卡片，侧栏计数必须仍等于全部可用记录的分类数量。
  // 结果只传ID和数字，不把完整标签库从浏览器重复复制到主进程。
  // 两个大类选自然与都市，特征选night和rainy制造明确的交叉条件。
  // 分类并集中的同一记录只在预期序列保留一次，防止按组拼接造成重复。
  // traits采用every独立生成交集，反证只满足其中一项的背景不能混入。
  // 计数对象包含全集和子集，可区分分页显示数与真正匹配总数。
  // 不把卡片预览URL或下载状态作为期望数据的一部分。
  // 数据中缺少任意标签时应出现正常空结果，不能靠网络补全过滤字段。
  // 数组源为当前构建页面，不从测试另存的数据副本取期望。
  // 因此修改数据但忘记更新构建也会先由外层构建指纹拦截。
  // 本地计算不依赖中文标签翻译，筛选值始终使用night和rainy原文。
  // 该断言只证明UI与内置数据一致，不证明上游资源服务可访问。
  // 后续原应用Tags用例继续覆盖输出，避免只看新筛选按钮的样式。
  const expected = await run(`(() => { const rows=window.backgroundData.filter(row=>!row.duplicate&&row.tags.trim()&&row.preview.trim()); const categories=['自然与户外 (Nature & Outdoors)','都市与日常 (Urban & Daily)']; const union=rows.filter(row=>row.categories.some(value=>categories.includes(value))); return {total:rows.length,nature:rows.filter(row=>row.categories.includes(categories[0])).length,union:union.length,unionIds:union.slice(0,24).map(row=>row.id),intersection:union.filter(row=>['night','rainy'].every(value=>row.traits.includes(value))).map(row=>row.id)}; })()`);
  // 使用稳定数据钩子选择真实按钮，中文展示名和数量徽标变化不影响定位。
  // 每次点击后的UI等待由主进程轮询驱动，不靠可能停摆的页面rAF。
  // 找不到控件直接抛错，不允许可选链静默跳过步骤后声称通过。
  // title保留原值，避免把翻译后的“夜晚”误传成过滤键。
  const click = (field, value) => run(`(() => { const button=Array.from(document.querySelectorAll('[data-background-filter-field]')).find(item=>item.getAttribute('data-background-filter-field')===${JSON.stringify(field)}&&item.getAttribute('data-background-filter-value')===${JSON.stringify(value)}); if(!button)throw new Error('missing background filter'); button.click(); return true; })()`);
  // 读取实际卡片序列，长度一致但内容错误同样应失败。
  // JSON比较只覆盖当前第一页，后面的分页信息另与整库数量配对。
  // 预期序列来自原始数据的独立过滤，不能仅看aria-pressed。
  const ids = () => run(`Array.from(document.querySelectorAll('[data-background-card]')).map(card=>card.getAttribute('data-background-card'))`);
  // 场景和特征都必须位于原侧栏父容器，不能覆盖卡片展示区。
  // 徽标的265来自1056条可用资料，原始1087中占位不参与统计。
  // 明确验证布局归属，防止只做出一套独立静态示例页面。
  const sidebar = await run(`(() => { const panel=document.querySelector('[data-background-filters]'), nature=panel.querySelector('[data-background-filter-value="自然与户外 (Nature & Outdoors)"]'); return {inside:!!panel.closest('[data-background-sidebar]'),nature:Number(nature.querySelector('[data-background-filter-count]').textContent)}; })()`);
  check("背景分类位于侧栏且徽标采用可用整库数量", sidebar.inside && sidebar.nature === expected.nature);
  await click("categories", "自然与户外 (Nature & Outdoors)"); await click("categories", "都市与日常 (Urban & Daily)");
  // 两大类同时激活后，任意命中其一即可，预期为并集的第一页。
  // 分页信息要显示并集总数，不能只报告24张可见卡片。
  // 点击分类应重回第一页，因此序列可以直接与独立预期比较。
  check("背景多个场景按并集筛选", await waitFor(`document.querySelector('[data-background-pagination-info]')?.textContent.includes(${JSON.stringify(expected.union.toLocaleString("zh-CN"))})`) && JSON.stringify(await ids()) === JSON.stringify(expected.unionIds));
  await click("traits", "night"); await click("traits", "rainy");
  // 加入两个特征后，每一张都需同时含night与rainy。
  // 页面更新与条件高亮不同步会由实际ID比较发现。
  // 小结果可能不足一页，不强制要求不存在的分页控件。
  check("背景多个特征与场景按交集组合", await waitFor(`JSON.stringify(Array.from(document.querySelectorAll('[data-background-card]')).map(card=>card.getAttribute('data-background-card')))===${JSON.stringify(JSON.stringify(expected.intersection.slice(0,24)))}`));
  // 清除两组条件需要恢复全集，不能只清侧栏高亮。
  // 原来的多选仍未改变，后续可继续做跨页选择测试。
  // 清除不会触发任何标签应用，提示词须留待后续旧用例确认。
  await run(`document.querySelector('[data-background-filter-clear]').click(); true`);
  check("清除背景分类恢复全部1056条", await waitFor(`document.querySelector('[data-background-pagination-info]')?.textContent.includes('1,056')`));
  // 第一页选一张再到第二页选一张，制造真实的跨页选择草稿。
  // 不直接篡改Zustand或React状态，使用卡片和分页按钮。
  // 当前页有24张，独立已选视图应准确展示两个来自不同页的对象。
  await run(`document.querySelector('[data-background-card] button').click(); document.querySelector('[data-background-page="next"]').click(); true`);
  // 下一页使用共用分页组件的数据入口，不依赖图标文字或aria-label。
  // 等页码输入实际更新后再选卡片，避免把第一页同一张卡取消掉。
  // 页码更新后React已提交同页网格，第二次选择来自不同记录。
  await waitFor(`document.querySelector('[data-background-page-input]')?.value==='2'`);
  await run(`document.querySelector('[data-background-card] button').click(); document.querySelector('[data-background-only-selected]').click(); true`);
  check("背景只看已选保留跨页的两个条目", await waitFor(`document.querySelectorAll('[data-background-card]').length===2`));
  // 结束时通过真实工具按钮清空草稿并回到全部列表。
  // 后续篝火用例仍需自己选择一张，不能继承这里两张造成假通过。
  // 分类已清空；退出已选视图后重新确认第一页，隔离其他回归步骤。
  await run(`document.querySelector('[data-background-clear-selected]').click(); document.querySelector('[data-background-only-selected]').click(); true`);
  await waitFor(`document.querySelectorAll('[data-background-card]').length===24`);
};
