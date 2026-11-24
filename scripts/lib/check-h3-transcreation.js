/** 复用正式菜单、IPC 和持久化；外部模型用现有 HTTP 替身，不把格式断言当成推理质量证明。 */
exports.checkH3Presets = async ctx => {
  for (const [id, fields] of [
    ['minimax-h3-base', ['integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music']],
    ['minimax-h3-reference', ['subject_definitions', 'summary', 'retention_analysis', 'detailed_description', 'overall_soundscape', 'non_diegetic_music']],
  ]) {
    await ctx.options(); await ctx.item('presets'); await ctx.item('presets-minimax');
    ctx.check('Two H3 choices use the existing shared preset menu', await ctx.run("['minimax-h3-base','minimax-h3-reference'].every(id=>document.querySelector('[data-assistant-item='+id+']'))"));
    await ctx.capture('h3-preset-menu');
    await ctx.item(id);
    // 刷新检验真实设置回填，不能只看到菜单打勾就宣称已保存。
    await ctx.reload();
    await ctx.options(); await ctx.item('presets'); await ctx.item('presets-minimax');
    ctx.check('H3 preset choice survives renderer reload', await ctx.run(`!!document.querySelector('[data-assistant-item=${id}] svg')`));
    await ctx.item(id);
    await ctx.text('人物静止，相机从脚底环绕上升到面部，时长5秒。');
    const before = ctx.requestCount();
    await ctx.translation(); await ctx.fixtureRequest(before);
    const instruction = ctx.request(before).messages[0].content;
    ctx.check('Selected H3 format reaches the actual transform request', fields.every(field => instruction.includes(field)) && instruction.includes('[Shot 1]') && instruction.includes('<d>'));
    ctx.complete(fields.map(field => `${field}: fixture`).join('\n'));
    await ctx.wait(`document.querySelector('#prompt-editor').textContent.includes('${fields[0]}: fixture')`);
    await ctx.undo();
    ctx.check('H3 transcreation uses the original undo action', await ctx.run("document.querySelector('#prompt-editor').textContent==='人物静止，相机从脚底环绕上升到面部，时长5秒。'"));
  }
  await ctx.options(); await ctx.item('presets'); await ctx.item('presets-general'); await ctx.item('translate');
};
