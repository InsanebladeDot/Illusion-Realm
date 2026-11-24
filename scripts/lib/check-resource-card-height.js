// 在正式资源分类与版本页读取卡片几何，不另建静态样板代替实际调用方。
// 当前窗口和模型数据仍由创建页冒烟提供，测量不会修改组件属性或真实用户模型。
// 两个入口使用同一组件，分类可能有计数，版本可能没有副标题，底部都应固定。
// 封面高度随当前列宽按4:5变化，本例不把固定文字区误写成固定整个卡片像素高。
// 三档文字区分别112、128、144像素；卡片总高还需要加封面与原边框。
// footer 读取真实矩形，不能仅凭 className 包含 mt-auto 就推断按钮已经贴底。
// 外壳底部十二像素为原 pb-3，测到的是内容区内边距，不应把 footer 强行贴边框。
// 同一组内的每个卡片均应成立，不能只核对列表第一项掩盖缺少副标题的卡。
// 主标题要求单行省略，保留 title 完整名供鼠标核对，不把原数据截断保存。
// 元信息区也需禁止换行，长路径不能撑高卡片或挤压下面的选择按钮。
// getComputedStyle 读取浏览器最终规则，可以发现宿主覆盖了公共卡片的约束。
// 分类和版本的选择状态仍由后面的原测试检查，这里不代替业务回调验证。
// 小数像素只允许一像素取整，不能放宽几十像素来迁就不一致的按钮基线。
// 标签中注明当前入口，失败能区分分类卡还是内层版本卡，而非一个总通过。
// 属于自动 DOM 几何证据，实体鼠标、读屏与 Windows 系统缩放仍需单独实测。
// 截图由宿主同一 Electron 窗口生成，测试不把资料参考图贴回当前产品页面。
module.exports = async ({ run, check }, label) => {
  const valid = await run("(()=>{const cards=[...document.querySelectorAll('[data-resource-card]')].filter(e=>e.getBoundingClientRect().height>0);return cards.length>0&&cards.every(e=>{const b=e.querySelector('[data-resource-card-body]'),f=e.querySelector('[data-resource-card-footer]'),h=e.querySelector('h3'),m=h.nextElementSibling,r=b.getBoundingClientRect(),q=f.getBoundingClientRect();return r.height===({24:112,28:128,32:144}[parseFloat(getComputedStyle(h).lineHeight)])&&Math.abs(r.bottom-q.bottom-12)<=1&&getComputedStyle(h).textOverflow==='ellipsis'&&getComputedStyle(m).whiteSpace==='nowrap'})})()");
  check(`Resource card has fixed text area and aligned footer: ${label}`, valid);
};
