/**
 * 编辑资源快速加载的真实页面回归，使用隔离扫描夹具和嵌入参数的真实 PNG。
 * 通过正式按钮、文件 input 和选择器执行，不注入产品 store 或 React 内部状态。
 * IPC 仅模拟模型扫描/服务回包，不运行实际 GPU 模型，也不接触用户模型文件。
 * 本模块由创建页冒烟顺序调用，不能独立启动第二个 Electron 冒烟进程。
 */

/**
 * 独立构造 PNG 文本块，不调用产品元数据写入器，避免写读共用错误形成恒真测试。
 * 测试图片来自已有 64×32 素材，只在 IEND 前加入工作流和独立版本块。
 * CRC 按 PNG 标准计算，不能靠损坏块被解析器意外容忍来通过用例。
 * 所有内容是 ASCII 测试数据，Latin-1 tEXt 编码不涉及中文转义差异。
 * prompt 块原样保存 JSON，版本单独存于 illusionRealmMeta。
 * 这同时验证新格式版本标记不会污染工作流字段分档。
 * 构造的节点只供参数解析，不作为可运行工作流提交给 ComfyUI。
 */
function withWorkflow(source, workflow, version = 1) {
  // 长度字段只包含数据，不含 chunk 类型和 CRC，遵守 PNG 的原始二进制约定。
  // 各个块独立计算 CRC，不能用整个 PNG 的摘要替代单块校验。
  // 保留原签名与图像数据，因此产品导入仍需实际解码这张图片。
  // IEND 固定为十二字节，输入明确由 nativeImage 生成，不解析任意用户文件。
  // 夹具不会写回磁盘，只经浏览器 FileList 输入给真实上传控件。
  // 两个块均可被公共解析器读取，版本块不得被当作第二条生成参数。
  // 未调用产品 embed 函数，读出的节点名和强度必须来自这些独立字节。
  // CRC 使用无符号结果，避免 JavaScript 位运算的有符号整数写入报错。
  const chunks = Object.entries({ prompt: workflow, illusionRealmMeta: { version } }).map(([name, value]) => {
    const body = Buffer.from(`tEXt${name}\0${JSON.stringify(value)}`); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const chunk = Buffer.alloc(body.length + 8); chunk.writeUInt32BE(body.length - 4); body.copy(chunk, 4); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4); return chunk;
  });
  return Buffer.concat([source.subarray(0, -12), ...chunks, source.subarray(-12)]);
}

/**
 * 从正式 DOM 读取资源身份和当前显示权重，失败前后比较完全相同的可见草稿。
 * 主模型名称参与比较，避免只测 LoRA 不变而漏过主模型已被部分更新。
 * 行 id 保留完整版本身份，不把同名封面或文本当成相同模型的证据。
 * 使用纯表达式返回 JSON，不访问 React fiber 或测试专用产品接口。
 * 空文本与零行都保留，删除全部扩展的用例不能被默认值掩盖。
 * 不抓取整个表单 HTML，避免无关动画或提示文字变化造成误报。
 */
const selection = "JSON.stringify({model:document.querySelector('[data-anima-models] [data-model-cover-select]').textContent,rows:[...document.querySelectorAll('[data-anima-models] [data-selected-extension]')].map(e=>[e.dataset.selectedExtension,e.textContent])})";

/**
 * 两种模式通过原顶层标签切换，组件卸载后资源仍应留在各自领域 store。
 * 显式等待目标标记，避免把退出中的旧节点误当作已经切换成功。
 * 标签中文来自当前测试固定 zh-CN 环境，不注入产品 locale 状态。
 * 选择模式不等同于发起生成，后面的 IPC 计数会检查没有额外副作用。
 */
async function mode(ctx, label) {
  // 原模式按钮控制实际父组件分支，不能直接更改 hidden CSS 来模拟切换。
  // label 按 JSON 字面量编码，不能把测试值解释成脚本代码。
  // 编辑入口等待真实运行按钮，图片入口等待真实生成按钮。
  // 等待使用外层主进程 timer，窗口遮挡不影响测试节拍。
  await ctx.run(`[...document.querySelectorAll('[data-create-mode-tabs] button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
  await ctx.wait(label === '编辑' ? "document.querySelector('[data-anima-sync-models]')" : "document.querySelector('[data-generate-button]')");
}

/**
 * 成功用例读取真正的 PNG 工作流，再核对模型、LoRA 强度与保留的编辑项。
 * 失败矩阵包含无元数据、缺失扩展、不支持的主模型、多个 UNet 和未来版本。
 * 每次失败都对照原选择，而不只要求出现某个错误文字。
 * 读取过程中不应上传或生成，所有用例最后统一核对 IPC 增量为零。
 * 本地扫描夹具只有一个 Custom Anima 和两个风格 LoRA，模型路径匹配必须唯一。
 * 这里没有真实模型权重，不将成功回填描述成 GPU 推理已经验证。
 * 原指令与 seed 也作为前后对照，确保快速加载未变成整份参数二创回填。
 * 测试先当前格式成功、再旧格式与失败格式，避免兼容分支没有触发也误报绿。
 */
async function checkEmbedded(ctx, source, importFile) {
  // 使用与扫描绝对路径不同的相对名，证明 basename 唯一回退真实工作。
  // b.safetensors 不同于此前手选 a，能发现按钮实际上未改变扩展列表。
  // 强度 0.35 不等于默认一或旧权重，避免错误复用旧值也能通过断言。
  // 版本标记置于独立块，原图仍保持真实六十四像素宽的可解码输入。
  // 当前编辑 LoRA 权重已由前序真实控件调整为 0.8，必须原样保留。
  // UNETLoader 和 LoraLoaderModelOnly 共同走生产解析器的字段定位分支。
  // 不包含提示词编码节点，资源读取不能因此覆盖当前编辑指令为空。
  // 节点编号确定，公共解析器保留读取到的模型与原始强度。
  const { run, click, wait, smoke } = ctx, workflow = { 1: { class_type: 'UNETLoader', inputs: { unet_name: 'remote/custom_unet.safetensors' } }, 2: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'remote/b.safetensors', strength_model: 0.35 } } };
  const instruction = await run("document.querySelector('[data-anima-instruction]').textContent"), seed = await run("document.querySelector('[data-anima-seed]').value");
  await importFile(ctx, withWorkflow(source, workflow)); await wait("!document.querySelector('[data-anima-read-models]').disabled"); await click('[data-anima-read-models]'); await wait("document.querySelector('[data-anima-resource-message]').textContent.includes('已加载')");
  // 断言检查实际 id 结尾与可见权重，不从成功提示推断资源已经加载。
  // 默认编辑项和风格项精确两行，重复加载不能产生第三行重复编辑资源。
  // 主模型文本也应对应本地扫描的 Custom Anima，不保留模板 aesthetic 名称。
  // 字符串 JSON 由主进程读取，比对的是产品导入后真实渲染出来的状态。
  smoke.check('Source metadata loads the real UNet and LoRA weight while preserving the edit LoRA', await run("(()=>{const rows=[...document.querySelectorAll('[data-anima-models] [data-selected-extension]')];return rows.length===2&&rows.some(e=>e.dataset.selectedExtension.endsWith('b.safetensors')&&e.textContent.includes('0.35'))&&rows.some(e=>e.dataset.selectedExtension.endsWith('AnimeEditV2.safetensors')&&e.textContent.includes('0.8'))&&document.querySelector('[data-anima-models] [data-model-cover-select]').textContent.includes('Custom Anima')})()"));
  const before = await run(selection);
  // 当前格式已通过后才删掉版本块，确认无标记旧图继续按既有兼容约定读取。
  // 每块移除十二字节元信息与数据部分，不能留下损坏 PNG 影响图片导入。
  // 这里的旧图保留完整 prompt，兼容测试的唯一变量是版本标记是否存在。
  // 断言与前一张图资源完全一致，避免“旧图不读但保留旧状态”形成假通过。
  // 因此先同步一次后续用例会单独检查实际改变，旧格式成功文字也须出现。
  const current = withWorkflow(source, workflow), markerLength = Buffer.byteLength(JSON.stringify({ version: 1 })) + Buffer.byteLength('illusionRealmMeta\0') + 12;
  const legacy = Buffer.concat([current.subarray(0, current.length - 12 - markerLength), current.subarray(-12)]);
  // 先移除已加载的 b，保证旧图必须真正恢复资源才能通过选择对照。
  // 仅看到成功文字但不更新资源的假实现会在该断言失败。
  // 通过真实移除按钮执行，不直接修改编辑领域 store。
  await run("[...document.querySelectorAll('[data-anima-models] [data-selected-extension]')].find(e=>e.dataset.selectedExtension.endsWith('b.safetensors')).querySelector('button[aria-label^=移除]').click()");
  await importFile(ctx, legacy); await wait("!document.querySelector('[data-anima-read-models]').disabled"); await click('[data-anima-read-models]'); await wait("document.querySelector('[data-anima-resource-message]').textContent.includes('已加载')");
  smoke.check('Unmarked legacy PNG metadata remains readable', await run(selection) === before);
  // 负向数据只改变一个关键条件，其余源像素仍然合法，拒绝应来自模型读取边界。
  // missing LoRA 必须在主模型写入前失败，不能部分套用模型后才提示扩展不存在。
  // 多 UNet 工作流故意包含合法名字，证明拒绝的是歧义结构而非文件不存在。
  // 未来版本仍带合法当前工作流，只有独立版本门禁能阻止错误读取。
  // 原图无文本时必须明确提示，没有参数不能当成成功加载零个 LoRA。
  // 每轮导入等待按钮解除禁用，避免在解码期间点击禁用按钮制造假拒绝。
  // 错误文字按分类检查，不能沿用上一轮资源成功提示充当本轮反馈。
  // 原指令与 seed 独立保留，导入素材本身也不能修改用户编辑设置。
  // 混入 null 节点但保留合法 UNet，验证共享 schema 会拒绝整个损坏字典。
  // 历史解析器只验证至少一项，因此不能让这个负向对照被普通“无工作流”检查代替。
  // 用户应得到参数不可读提示，不能看到底层 TypeError 或被部分加载。
  const cases = [['no metadata', source, '未包含'], ['missing LoRA', withWorkflow(source, { ...workflow, 2: { ...workflow[2], inputs: { ...workflow[2].inputs, lora_name: 'missing.safetensors' } } }), '本地未扫描'], ['checkpoint workflow', withWorkflow(source, { 1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'custom_unet.safetensors' } } }), '仅支持'], ['multiple UNets', withWorkflow(source, { ...workflow, 3: workflow[1] }), '仅支持'], ['malformed node', withWorkflow(source, { ...workflow, broken: null }), '未包含'], ['future metadata', withWorkflow(source, workflow, 999), '版本']];
  for (const [label, bytes, text] of cases) {
    await importFile(ctx, bytes); await wait("!document.querySelector('[data-anima-read-models]').disabled"); await click('[data-anima-read-models]'); await wait(`document.querySelector('[data-anima-resource-message]').textContent.includes(${JSON.stringify(text)})`);
    smoke.check(`Rejected ${label} preserves all model choices`, await run(selection) === before);
  }
  smoke.check('Quick resource loading preserves the instruction and sampling seed', instruction === await run("document.querySelector('[data-anima-instruction]').textContent") && seed === await run("document.querySelector('[data-anima-seed]').value"));
}

/**
 * 同步来源通过普通图片模式的正式选择器准备，不能在测试里直接写入 store。
 * 先选一个风格 LoRA，再修改其强度，证明同步包含实际权重而不是默认值。
 * 编辑已有 b 风格应被来源 a 替换，同时保留一行编辑项。
 * 第二次同步必须幂等，反复点击不能叠加重复模型或编辑项。
 * 最后手动移除编辑项再同步，验证快速加载不会恢复用户明确删除的资源。
 * 图片模式资源应不受编辑侧删除影响，两侧必须拥有独立对象。
 * 此用例结束保持合法 Anima 图片模式，避免污染后续原创建页测试的系列前提。
 */
async function checkSync(ctx) {
  // 普通图片模式保持此前 Custom Anima 主模型，测试不依赖显示中的演示模型。
  // 清空原有风格列表后再选择，排除完整套件之前可能残留的扩展选择。
  // 删除通过真实行按钮处理，不直接篡改组件数组或全局资源状态。
  // 分类和版本分别确认，沿用共享资源选择器的两层提交规则。
  // a 是分类中第一个版本，与前面导入的 b 明确不同。
  // 失焦或 Enter 才提交权重，测试明确触发 Enter 避免后续点击偶然代提交。
  const { run, click, wait, smoke } = ctx;
  await mode(ctx, '图片'); await run("document.querySelectorAll('[data-create-rail] [data-selected-extension] button[aria-label^=移除]').forEach(e=>e.click())");
  await click('[data-create-rail] [data-extension-picker-trigger]'); await wait("document.querySelector('[aria-labelledby=extension-select-dialog-title] [data-resource-confirm]')"); await click('[aria-labelledby=extension-select-dialog-title] [data-resource-model-picker]'); await wait("document.querySelector('[data-resource-model-select]')"); await click('[data-resource-model-select]'); await wait("!document.querySelector('[data-resource-model-select]')"); await click('[aria-labelledby=extension-select-dialog-title] [data-resource-confirm]');
  await run("document.querySelector('[data-create-rail] [data-selected-extension] p span').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ctx.fill(ctx, '[data-create-rail] [data-selected-extension] input', '0.42'); await run("document.querySelector('[data-create-rail] [data-selected-extension] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  // 来回切换会卸载工具，但图片资源 store 与编辑领域 store 都应保留各自数据。
  // 同步后读实际扩展 id 与权重，成功提示本身不能证明拷贝了正确来源。
  // b 风格必须消失，防止错误使用追加策略让两个来源的风格叠加。
  // 编辑项只允许一条，默认预载与同步合并不能各自注入一次。
  // 连续同步后比较完整选择对象，覆盖幂等与权重不重置的要求。
  // 第一次同步没有原图元数据也应成功，证明两个入口来源独立。
  await mode(ctx, '编辑'); await click('[data-anima-sync-models]'); await wait("document.querySelector('[data-anima-resource-message]').textContent.includes('已加载')");
  smoke.check('Sync copies the image-mode LoRA weight and replaces old style selections', await run("(()=>{const rows=[...document.querySelectorAll('[data-anima-models] [data-selected-extension]')];return rows.length===2&&rows.some(e=>e.dataset.selectedExtension.endsWith('a.safetensors')&&e.textContent.includes('0.42'))&&!rows.some(e=>e.dataset.selectedExtension.endsWith('b.safetensors'))})()"));
  const first = await run(selection); await click('[data-anima-sync-models]'); await wait("!document.querySelector('[data-anima-sync-models]').disabled");
  smoke.check('Repeated sync does not duplicate the edit LoRA or reset weights', await run(selection) === first);
  // 用户移除预载项后仍允许继续同步风格，不能用保留策略强制恢复默认编辑文件。
  // 原图导入不参与该操作，所以继续使用刚才合法的源对象与修改指令。
  // 只删除匹配编辑文件名的实际行，不依赖它刚好位于列表第一项。
  // 同步后的精确行数为一，避免编辑项被以模板别名偷偷重新加入。
  // 随后回普通图片模式核对 a 的权重，确认编辑删除没有反写源数组。
  // 该断言对比的是实际 DOM，不以 store 对象引用相等充当用户可见行为证据。
  await run("[...document.querySelectorAll('[data-anima-models] [data-selected-extension]')].find(e=>e.dataset.selectedExtension.endsWith('AnimeEditV2.safetensors')).querySelector('button[aria-label^=移除]').click()"); await click('[data-anima-sync-models]'); await wait("!document.querySelector('[data-anima-sync-models]').disabled");
  smoke.check('Sync respects an explicitly removed edit LoRA', await run("document.querySelectorAll('[data-anima-models] [data-selected-extension]').length===1&&!document.querySelector('[data-anima-models]').textContent.includes('AnimeEditV2')"));
  await mode(ctx, '图片'); smoke.check('Editing resource changes do not modify the source image-mode weight', await run("document.querySelector('[data-create-rail] [data-selected-extension]').textContent.includes('0.42')")); await mode(ctx, '编辑');
}

/**
 * 前后快照采用真实 IPC 记录，而非生成按钮是否显示 loading。
 * 快速加载不应上传源图、提交生成或保存图片，资源选择只是准备草稿。
 * 所有素材只在本地临时内存构造，本模块不改写仓库图片或用户数据。
 * 截图用于核对入口排布，行为通过上面的独立断言判断。
 * 测试完成仍留在编辑模式，交给原冒烟继续验证蒙版与响应式布局。
 * 公共 timeout 和退出码护栏由外层安装，任何失败必须影响最终运行结果。
 * importFile 与 fill 来自原编辑回归，同一真实输入机制覆盖两组用例。
 * 测试没有自动下载模型，缺文件场景只能经明确拒绝或手动选择恢复。
 * 版本 999 是受控未来版本，不依赖实际应用下一版格式的任何猜测。
 * 无元数据图与有元数据图像素相同，避免把解码差异误判为模型识别结果。
 * 元数据错误与生成错误分开读取，旧生成失败不能掩盖当前加载反馈。
 * 每次导入会清理编辑结果，这是原素材替换行为，不是快速加载的副作用。
 * 因此保存计数只比较实际 IPC，没有把清空预览当成写盘操作。
 * 图片模式资源通过现有版本窗口选择，本测试仍覆盖该窗口正常确认链路。
 * 源图片模式使用非默认强度 0.42，能发现复制时重置权重的错误。
 * 原图读取使用另一个非默认强度 0.35，两个来源不能彼此混淆。
 * 两个入口均需在 UI 上展示真实版本，不能只写入隐藏生成参数。
 * 去重检查要求精确行数，既不能少掉编辑项，也不能多出重复项。
 * 手动删除后继续同步用于验证用户选择优先于模板预载策略。
 * 返回编辑后再由原用例检查输入节点与蒙版，不在本模块伪造恢复结果。
 */
module.exports = async function checkAnimaEditResources(ctx, source, importFile, fill) {
  // 提供填值 helper 只复用 DOM 操作，不给产品增加任何测试接口。
  // 记录三类副作用，防止“没有生成请求但已经偷偷上传”的遗漏。
  // 当前格式正向先运行，之后再跑所有失败与同步操作。
  // 资源错误不能中断后续手动同步，验证用户无需刷新即可恢复。
  // 拍摄的都是隔离夹具界面，不把它作为真实模型联调成功证据。
  const before = [ctx.requests.length, ctx.uploads.length, ctx.savedPayloads.length];
  // 前序执行测试明确删除了全部 LoRA，本组通过正式选择器重新添加编辑项。
  // 这样保留策略测试有明确前置，不能假定组件重新挂载会偷偷恢复默认项。
  // 首个单版本卡片是编辑 hook 提供的 AnimeEditV2 回退入口。
  // 使用标题定位所属卡片，避免排序变化后误选普通风格分类。
  // 仍经外层确认才提交，打开选择器不应直接改写资源。
  // 添加后修改其权重为 0.8，源图读取必须保留这个非默认值。
  // 这只是手动选择回退项，不把它描述成本地扫描已经安装成功。
  // 后续不运行模型，所以此夹具不需要真实 safetensors 文件。
  // 权重通过 Enter 提交，避免下一次点击意外充当失焦提交步骤。
  // 新增回退项只存在编辑侧，不污染普通图片模式的资源列表。
  // 原图资源读取随后加载普通 b 风格，可同时验证两种路径 id 的合并。
  // 页面模式不改变，准备期间依旧使用当前已导入源图与用户修改指令。
  await ctx.click('[data-anima-models] [data-extension-picker-trigger]'); await ctx.wait("document.querySelector('[aria-labelledby=extension-select-dialog-title] [data-resource-confirm]')");
  await ctx.run("[...document.querySelectorAll('[aria-labelledby=extension-select-dialog-title] h3')].find(e=>e.textContent==='AnimeEditV2').parentElement.querySelector('button').click()"); await ctx.click('[aria-labelledby=extension-select-dialog-title] [data-resource-confirm]');
  await ctx.run("document.querySelector('[data-anima-models] [data-selected-extension] p span').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))"); await fill(ctx, '[data-anima-models] [data-selected-extension] input', '0.8'); await ctx.run("document.querySelector('[data-anima-models] [data-selected-extension] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await checkEmbedded(ctx, source, importFile); await checkSync({ ...ctx, fill });
  ctx.smoke.check('Resource quick loading never uploads, generates or saves an image', JSON.stringify(before) === JSON.stringify([ctx.requests.length, ctx.uploads.length, ctx.savedPayloads.length]));
  await ctx.shot('anima-edit-resource-loading');
};
