/** 按按钮的 aria-controls 找所属列表，兼容悬浮层，不误选另一张表单的选项。 */
exports.workflowList = async (ctx, trigger) => {
  const id = await ctx.run(`document.querySelector(${JSON.stringify(trigger)}).getAttribute('aria-controls')`);
  return `[id=${JSON.stringify(id)}]`;
};

exports.selectWorkflowOption = async (ctx, trigger, value) => {
  await ctx.click(trigger);
  const list = await exports.workflowList(ctx, trigger);
  await ctx.click(`${list} [data-simple-select-option=${JSON.stringify(value)}]`);
};

// 不只确认 DOM 存在：最后一项滚到可见位置后，中心点必须确实能点到它。
// 这能抓住父容器裁切、菜单出窗以及被其他层盖住三种回归。
exports.checkWorkflowOptionVisible = async (ctx, list, value) => ctx.run(`(()=>{
  const panel=document.querySelector(${JSON.stringify(list)});
  const option=panel.querySelector('[data-simple-select-option='+${JSON.stringify(JSON.stringify(value))}+']');
  option.scrollIntoView({block:'nearest'});
  const r=option.getBoundingClientRect(),p=panel.getBoundingClientRect();
  return r.width>0&&r.top>=p.top&&r.bottom<=p.bottom&&p.top>=0&&p.bottom<=innerHeight
    &&option.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
})()`);
