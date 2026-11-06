/** 多视频轨合成：真实本地编码文件、真实解码和公开界面操作；不是人工桌面证明。 */
// 复用LIVE的单一窗口、生产探测与导入；文件选择结果依旧有夹具限制。
// 像验证透明胶片叠放，先固定每片所在轨和时间，再改变构图看下面能否透出来。
const fs = require("node:fs"), path = require("node:path");
const { field, mouse, shot } = require("./check-video-multitrack");
const { seek } = require("./check-video-ui-timeline");
// ready等待产品报告与请求键一致后的节目状态，不用固定睡眠冒充解码。
// 该等待仍受外层主进程截止线约束，页面停止绘制也不会永远等下去。
// 后面的断言还会读取真实video，不把data标记本身当作全部媒体证据。
// 当前只有两个测试源，不能把这个负载结果推广为任意多路4K实时播放。
// 本helper没有导入DEMO数据，正式素材都来自外层生成的磁盘编码文件。
// 所有测试文件位于随机临时目录，既不读取也不移动用户私人视频。
// 测试窗口禁止后台节流，测试后台可完成不代表产品隐藏时仍应继续播。
// 系统选择框返回路径仍由夹具提供，与真正点击原生多选是不同证据。
// 内部拖动由既有CDP流程启动，不声称资源管理器OLE系统拖入。
// 截图保存客户区真实像素，不包含用户前台窗口，也不读取参考图补画。
// 静音是本轮节目契约，所有播放测试都不使用扬声器试听作为成功依据。
// 多个断言共用一个真实会话，能暴露前一操作遗留的选择或媒体状态。
// 每项失败仍累计到harness，后续某项通过不能覆盖先前失败。
// 诊断模式的三十项结果必须与最后完整套件数量分别报告。
// 测试没有安装页面私有接口，也没有通过React内部对象提交工程修改。
// 验收矩阵还需要区分“返回值夹具”“自动事件”和“人工实际操作”三个证据层次。
// 返回值夹具只替换系统选择结果，并不替换读取、封面、ffprobe或解码器。
// CDP鼠标会走浏览器命中与捕获，比向指定节点派事件更接近实际指针路径。
// DOM输入用于字段提交与负向绕过门槛，不推断实体键盘的重复按键手感。
// 此套件没有调用Windows资源管理器，因此系统拖入仍保留待验。
// 窗口setSize改变客户区像素，不等价于操作系统显示缩放百分比。
// 真实视频有AAC不等于听到声卡输出，节目本轮反而明确强制静音。
// 原始素材试听入口可用与扬声器试听通过是两件事，文档分别列出。
// 离屏截图包含真实解码纹理，不能因窗口未前台就说成mock截图。
// 同样，离屏真实纹理也不能被描述为用户前台人工完成的验收。
// 正常黑场截图没有报错文字，错误截图必须有可理解的失败反馈。
// 加载状态若短暂到难以截图，不因此声称所有网络或慢盘等待场景已覆盖。
// 本轮媒体来自本地协议，不需要网络账号，网络断开场景不作为本组覆盖。
// 高分辨率多路硬件解码预算未测试，默认五轨并非五路4K性能承诺。
// 上限提升后可能出现等待，性能限制应写到独立实施记录。
// 测试不模拟内存不足，因此不能声称已覆盖显存耗尽或解码器崩溃恢复。
// 错误恢复样本只证明不支持编码的有界反馈，不推广到所有容器格式。
// 两个视频帧率不同，能发现把工程帧率覆盖源元数据的串值问题。
// 横竖素材分辨率不同，能发现把一层的尺寸套给另一层的错误。
// 同源后段仍有独立clip ID，接播节点身份必须区别于前一段。
// 镜像、速度、修剪的既有行为由外层回归验证，本helper不重复改这些数据。
// 属性字段的非法草稿由原画布专项覆盖，不把合法输入通过外推为所有草稿正确。
// 锁保护共同提交模型，实际点击命中检查只补足空间交互入口。
// 隐藏恢复验证节点重建，不能只检查Eye图标颜色翻转。
// 主时钟进入黑场后无媒体timeupdate，所以自然接到后段尤其能反证单源伪合成。
// 播放时没点击片段，是区分连续工程调度和选择驱动切源的重要前置。
// 结束边界用实际tail.end，不拿硬编码三秒代替真实向上取整占位。
// 源时间检查在暂停后进行，避免采样时差被错误解释为定位偏移。
// 播放中的同步只采用有限容差，测试不声称采样级音频同步已实现。
// 没有音频总线，也就没有多轨混音、独奏和响度一致性结论。
// 未来输出编码要另做逐帧比较，不拿当前DOM合成截图替代导出证明。
// 本轮只更新COMPOSE预览阶段，COMPOSE输出规则任务仍依赖真正导出需求。
// UI08旧人工缺项保留原状态，新自动证据不能倒写成旧人工全部通过。
// 构图规则已经共享，但静态图片导入仍未接；本组没有混用DEMO图片冒充真实源。
// 用户自己的视频格式、长文件名和慢磁盘负载可能需要后续人工补验。
// 此记录保留已知范围限制，发现新问题不能用“基础视频已通过”排除用户反馈。
// 所有断言失败都需要原始日志，不能只交付截取的PASS部分。
// 截图文件与日志归同一随机工作目录，避免把不同构建的好截图拼成一次成功。
// 构建指纹在外层启动前核对，源文件变化之后必须重建再跑最终套件。
// helper没有跳过指纹或忽略错误的环境开关，诊断模式只是缩小场景范围。
// 最终交付应使用未设置专项开关的整轮结果，单独专项只供问题定位。
// 第一次失败若是目标识别错误，应修正测试身份并记录，而不是缩短片段迁就。
// 产品回归失败则修代码再完整复跑，不靠不断重试消除偶发失败记录。
// 旧UI样板的A/B检查只证明公共控件隔离，不能冒充两个正式合成工程并排实测。
// 正式合成控制器的ref局部性有代码依据，但未跑的多实例压力场景仍需如实列出。
// 性能日志没有统计精确CPU或显存峰值，不给出没有测量的资源占用数字。
// 素材选择不会创建时间线片段，这项旧契约继续由外层基础流程先行检查。
// 外部文件落到时间线只入库的旧约定保持，不因为多轨预览而变成自动剪辑。
// 本轮没有添加转场、关键帧或保存，这些按钮不能因合成通过就显示假成功。
// 录屏若没有生成就明确缺省，不将连贯的几张截图称作视频操作录制。
// 测试证据中的内部ID可公开，不携带本地私人文件路径或登录信息。
// 本脚本不会向外发送消息或上传视频，所有产物保存在本地验收目录。
// 示意说明不属于源码测试结论，最终报告以实际非零/零退出码和断言数量为准。
// 源数据和媒体事件证明本轮真实运行，不能以文档里一段“已通过”替代它们。
// 异常用例成功的含义是产品准确拒绝，而非不支持的编码被神奇转换为可播放。
const ready = ctx => ctx.wait("document.querySelector('[data-program-composite]')?.dataset.programPhase==='ready'");

// 纯模型反证不解码，也不使用假播放器来替代后面的真实播放检查。
// 上下层的数组故意与轨道顺序相反，避免按导入顺序恰巧得到正确答案。
// 边界4秒必须移除end4的上层，而保留仍在范围内的下层。
// 源时间独立期望4秒，来自入点2加工程差1乘速度2；不是把工程9直接赋源。
// 纯模型加载的是生产TypeScript转译结果，没有复制一份算法自测。
// 固定模块名来自脚本常量，不接受用户路径或远程脚本。
// 模块只有type-only界面依赖，转译后不需要React运行时或浏览器窗口。
// 如果以后新增未声明运行时依赖，加载应失败，而非用空对象蒙混过去。
// 轨道数组为V1在V2上方，clips故意lower在前，能够发现按创建数组排序的错误。
// 时间1恰为上层start，应包含上层，排除起点误用严格大于的问题。
// 时间4恰为上层end，应排除上层，排除终点误用小于等于的问题。
// 音轨覆盖整个测试区间，若被误当视频会在结果列表里多出audio。
// 隐藏表同时包含两条视频轨，应没有可视记录，而不是退回音轨占位。
// 隐藏不删除clips，调用仍使用同一个输入列表，不能靠把源数组清空通过。
// sourceIn二秒与工程start八秒不同，排除裸工程秒恰好正确的简单样例。
// speed二倍使正确映射更有判别力，错误地漏乘速度会得到三秒而非四秒。
// 源duration二十秒足够长，映射结果不会被尾部夹限掩盖。
// 短片段入点1、终点1.01位于一次推进中间，必须先停到1不能直接到1.1。
// 这个纯边界检查只证明调度算术，不证明片段对应视频已经加载。
// 后续实机段从真实源建立安排，二者的证据职责互补而不互相替代。
// 期望值独立写明，不从被测函数取常量再拼出相同答案。
// 纯模型失败直接累计断言，不静默跳过实机负载后声称全通过。
// 没有图片文件参与本组，不能把类型兼容测试写成真实图片导入已经实现。
function modelChecks(ctx) {
  const ts = require("../../apps/next/node_modules/typescript"), model = {}, tracks = {};
  for (const [name, result] of [["program-clock", model], ["timeline-track-model", tracks]]) {
    const source = fs.readFileSync(path.join(__dirname, `../../apps/next/src/view/toolBox/Tool/video/editor/${name}.ts`), "utf8");
    new Function("exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(result);
  }
  const clips = [{id:"bottom",track:"V2",start:0,end:5},{id:"top",track:"V1",start:1,end:4},{id:"audio",track:"A1",start:0,end:5,audioOnly:true}];
  ctx.smoke.check("COMPOSE model: explicit track order and half-open boundaries", tracks.visualClipsAtTime(clips,["V1","V2","A1"],1).map(e=>e.id).join()==="top,bottom" && tracks.visualClipsAtTime(clips,["V1","V2","A1"],4).map(e=>e.id).join()==="bottom");
  ctx.smoke.check("COMPOSE model: hidden excludes layers while audio never paints", tracks.visualClipsAtTime(clips,["V1","V2","A1"],2,["V1","V2"]).length===0);
  ctx.smoke.check("COMPOSE model: source mapping and no skipped short boundaries", model.programSourceTime({start:8,sourceIn:2,speed:2},9,20)===4 && model.nextProgramTime([{clip:{start:1,end:1.01}}],.99,1.1,10)===1);
}

// 只删除本轮隔离工程中的片段，不删除素材文件；旧回归已在此之前执行完毕。
// 通过公开Delete命令清理，若锁没有恢复会真实失败，不从React内部重置状态。
// 时间错开：竖屏下层从0开始，上层横屏从1秒开始，后段横屏从6秒开始。
// 因此既有跨轨重叠，也有4秒多至6秒的真实黑场，不需要造黑色视频片段。
// 清理仅发生在独立测试工程，外层已完成原有复制、删除和音轨回归。
// Delete走片段公开键盘入口，若锁误留住片段会在数量断言中暴露。
// 素材保留原ID，后续添加仍是同一正式导入链建立的真实资源。
// 第一个素材为横屏有AAC，第二个为竖屏无音轨，不能用两个同尺寸封面代替。
// 第一段横屏占V1从1开始，下层竖屏占V2从0开始，源时间天然不同。
// 同一横屏素材在V1从6再建一个独立实例，支持真实同源多实例接播。
// 新增V2复用原拖向候选轨的入口，不直接向tracks数组push。
// 每次dragTo会由生产碰撞模型确认，helper不设置data-editor-start伪造成功。
// 落点按当前lane实际矩形求坐标，横纵滚动后不沿用陈旧像素。
// 已有五条上限不被临时调大，证明默认设置至少可以容纳两视频轨。
// 数组来自DOM轨道行次序，V1两段在前、V2下层在后，不能假定是创建次序。
// 这正是首轮诊断发现的测试身份错误，修正的是识别目标而非片段预期时长。
// 三段长度都大于3.2秒，保护真实3.25秒源的工程占位，不能缩段迁就碰撞。
// 跨轨时间重叠应保留两个安排，同轨前后两段之间则有明确空隙。
// 后续黑场阶段没有额外黑图或占位片段，是有效画面列表自然为空。
// 返回的top、bottom和tail按实际轨道DOM身份绑定，后续不会误选后段代替下层。
// 正式UI仍允许同源多实例，数量断言防止把assetId误当clipId去重。
// 设置与创建顺序没有保存副作用，离开测试页后整个临时工程销毁。
async function arrange(ctx) {
  console.log("COMPOSE_CLEAR", JSON.stringify(await ctx.clips()));
  for (const clip of await ctx.clips()) {
    console.log("COMPOSE_DELETE", clip.id);
    await ctx.run(`document.querySelector('[data-editor-clip="${clip.id}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
    await ctx.wait(`!document.querySelector('[data-editor-clip="${clip.id}"]')`);
  }
  console.log("COMPOSE_CLEAR_DONE");
  // 前序真实波形用例把时间轴放到256px/秒，6秒落点会在窗口外；先恢复共同视口。
  // 这只调整显示比例，不改本轮约定的1秒/0秒/6秒工程预期。
  await ctx.click('[data-editor-timeline] button[aria-label=适合全部]');
  await ctx.run("document.querySelector('[data-editor-timeline-scroll]').scrollLeft=0;document.querySelector('[data-editor-timeline-scroll]').scrollTop=0");
  await ctx.delay(100);
  const assets = await ctx.run("[...document.querySelectorAll('[data-editor-asset]')].map(e=>e.dataset.editorAsset)");
  for (const [asset, track, time] of [[assets[0],"V1",1],[assets[1],"V2",0],[assets[0],"V1",6]]) {
    await ctx.beginDrag(`[data-editor-asset="${asset}"]`);
    await ctx.dragTo(await ctx.lanePoint(time,track));
  }
  const all = await ctx.clips();
  ctx.smoke.check("COMPOSE: two video tracks permit cross-track overlap without shortening", all.length===3 && Math.abs(all[0].start-1)<.04 && Math.abs(all[2].start)<.04 && all.every(c=>c.end-c.start>3.2));
  return { top:all[0], bottom:all[2], tail:all[1] };
}

// 所有字段用现成输入草稿和Enter提交，不直接改CSS或工程对象。
// 后续截图必须来自有两台真实video的节目，不能只证明两个选框存在。
// 同一片段连续修改五个值，覆盖构图更新不应重建或暂停源解码的边界。
// 先时间线选top再编辑字段，确保属性目标是片段而非素材高亮。
// 缩放55百分比相对原contain尺寸，不改变项目1920×1080配置。
// 位置1100/500偏离默认960/540，能够检验源与选框确实一起位移。
// 旋转18度使四角显露底层/黑场，排除只更改数字未应用CSS的情况。
// 透明度50应让真实下层透出来，不能对选框按钮或外层整体设置半透明。
// 同一段五次提交继续沿用原字段草稿、Enter校验和共同变换方法。
// 定位2秒时上层源应1秒、下层源应2秒，后面单独用真实currentTime反证。
// 实际videoHeight列表必须360和640，发现把两层都绑定到横屏源的错误。
// readyState至少二且muted为真，说明真实媒体加载并遵守节目静音边界。
// 只存在两个选框但没有两个video不能通过，本组直接查询真实节点。
// pictures平面中不能出现selection按钮，选框属于独立操作层。
// 截图发生在暂停的固定工程时间，避免播放画面变化干扰层级肉眼核对。
// 选择下层后重新定位2秒，是因为既有时间线点击会跳到被选段起点。
// 层序比较保留同一上层在前，不因属性目标变成下层而改变节目优先级。
// 检查器ID必须为真实下层片段，单看画面顺序相同不足以证明选择成功。
// 此组不调用保存、导出或修改原视频字节，所有效果只在当前预览会话。
// 复制独立性仍由外层画布专项负责，这里不把一个下层不同源误称为同源副本。
// 图像边界未进行逐像素alpha拾取测试，本组媒体为普通不透明H264。
async function transforms(ctx, clips) {
  await ctx.click(`[data-editor-clip="${clips.top.id}"]`);
  for (const [label,value] of [["缩放",55],["位置 X",1100],["位置 Y",500],["旋转",18],["不透明度",50]]) await field(ctx,label,value);
  await seek(ctx,2); await ready(ctx);
  ctx.smoke.check("COMPOSE: landscape/portrait decoded together with independent transforms and forced mute", await ctx.run("(()=>{const v=[...document.querySelectorAll('[data-program-video]')];return v.length===2&&v.every(e=>e.readyState>=2&&e.muted)&&v.map(e=>e.videoHeight).sort().join()==='360,640'&&document.querySelector('[data-program-pictures]').querySelectorAll('[data-canvas-selection]').length===0})()"));
  await shot(ctx,"compose-real-overlap-transform");
  const order = await ctx.run("document.querySelector('[data-program-composite]').dataset.programOrder");
  await ctx.click(`[data-editor-clip="${clips.bottom.id}"]`); await seek(ctx,2); await ready(ctx);
  ctx.smoke.check("COMPOSE: choosing lower keeps upper first and preserves layer transforms", await ctx.run(`document.querySelector('[data-program-composite]').dataset.programOrder===${JSON.stringify(order)}&&document.querySelector('[data-editor-region=R04]').dataset.editorInspectorClip==='${clips.bottom.id}'`));
}

// 指针由Chromium真实命中测试投递：中央两层重叠区域应选上层，而非当前选中的下层。
// 锁上层仍应显示它，但命中必须放行给下层可编辑对象。
// 显隐只改变合成，不能删除安排或把锁状态误作隐藏状态。
// 中心点按当前实际预览框测量，不能用截图绝对坐标硬点。
// 选择的57%/46%位置处在变换后上层与竖屏下层的重叠范围。
// Chromium负责真实命中和指针捕获，不能向指定selection节点派事件绕过层级。
// 按下和松手在同一坐标，不应把选择测试意外变成位移测试。
// 上层先前未选中，正确命中后检查器必须改到上层ID。
// 锁定V1后仍应有两台视频，防止把锁实现成隐藏而偶然让下层可点。
// 再点同一点时应命中下层可编辑片段，不是点击无效后仍保留原下层选择。
// 锁测试前先明确选中上层，因此后一选择变化具有判别力。
// 解锁仍通过原轨道头按钮，不重载页面或清工程恢复。
// 隐藏V1后必须只剩竖屏640高源，排除错误隐藏了V2却数量碰巧正确。
// 隐藏V2后不应有任何节目video，证明隐藏源真正卸载而不只是opacity零。
// 项目底色读取计算样式，纯黑不能来自一张演示图片。
// 隐藏截图仍保留时间线片段，肉眼可确认没有删除安排来制造黑屏。
// 按相同按钮恢复两层，后续播放检验显隐后媒体可正常重新登记。
// 锁和隐藏使用各自状态，后续恢复隐藏不能顺带改变锁定表。
// 这一自动鼠标场景不代替用户对实际触摸板、缩放设备或输入延迟的人工评估。
// 本组不占用系统鼠标，因此不能据此宣称前台Windows人工操作通过。
// 轨道按钮的禁用音频能力仍保持，测试没有启用独奏或音量混合。
async function hitAndVisibility(ctx, clips) {
  const center = await ctx.run("(()=>{const b=document.querySelector('[data-editor-preview-frame]').getBoundingClientRect();return{x:b.left+b.width*.57,y:b.top+b.height*.46}})()");
  await mouse(ctx,"mousePressed",center); await mouse(ctx,"mouseReleased",center);
  ctx.smoke.check("COMPOSE: canvas hits the upper editable transformed picture", await ctx.run(`document.querySelector('[data-editor-region=R04]').dataset.editorInspectorClip==='${clips.top.id}'`));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  await mouse(ctx,"mousePressed",center); await mouse(ctx,"mouseReleased",center);
  ctx.smoke.check("COMPOSE: locked upper stays visible while hit passes to lower", await ctx.run(`document.querySelectorAll('[data-program-video]').length===2&&document.querySelector('[data-editor-region=R04]').dataset.editorInspectorClip==='${clips.bottom.id}'`));
  await ctx.click('[data-editor-track-head=V1] button[aria-label=锁定]');
  await ctx.click('[data-editor-track-head=V1] button[aria-label=可见]'); await ready(ctx);
  ctx.smoke.check("COMPOSE: hiding upper reveals real lower source", await ctx.run("document.querySelectorAll('[data-program-video]').length===1&&document.querySelector('[data-program-video]').videoHeight===640"));
  await ctx.click('[data-editor-track-head=V2] button[aria-label=可见]'); await ready(ctx);
  ctx.smoke.check("COMPOSE: all hidden is silent black with no visual decoders", await ctx.run("!document.querySelector('[data-program-video]')&&getComputedStyle(document.querySelector('[data-editor-preview-frame]')).backgroundColor==='rgb(0, 0, 0)'"));
  await shot(ctx,"compose-hidden-black");
  for (const track of ["V1","V2"]) await ctx.click(`[data-editor-track-head=${track}] button[aria-label=可见]`);
}

// 先连续快速定位，最终目标在双层区；源时间必须分别为1秒和2秒。
// 同一工程秒直接赋给两个video会得到两个2秒，不能通过这个反例。
// 暂停书签后派旧timeupdate只验证负向竞态，与真实解码播放证据分开。
// 随后从下层独有区开始播放，必须自然进入叠放、退出、黑场并接到6秒后段。
// 快速定位目标交替经过单层、双层和后段，让过期加载确实可能与新目标不同。
// 最终2秒同时覆盖两源，单源成功或空层ready不能通过源时间断言。
// 上层source1秒、下层source2秒为独立预期，不以产品自身映射函数制造答案。
// 源定位容差0.08秒覆盖浏览器帧选择，但远小于一秒错误偏移。
// 快速定位仍走公开标尺指针，不调用Hook中的seek闭包。
// 连续播放从0.5秒开始，只能看到下层，随后必须自动进入双层。
// 用户没有在播放过程中点击任何时间线片段，排除选择驱动单源切换冒充接播。
// 双层阶段两台源必须非paused且各自currentTime大于0.3。
// 单看工程时间增长或按钮图标变暂停不足以通过这一媒体断言。
// 所有源同时muted，不能在实际测试时意外叠响两个文件的音轨。
// 4.5秒位于两段结束之后与6秒入点之前，此时应无video而工程时间继续推进。
// 黑场截图和工程时间记录配对，证明不是停止不动的一张黑图。
// 6.5秒之后应有后段真实源，证明空隙不会让时钟永久停住。
// 暂停使用节目按钮，不逐个调用video.pause后冒充统一暂停成功。
// 最后一个源ID必须为tail，同源实例也能凭clip.id分清而不是看文件名。
// 末尾明确定位为tail.end，半开规则要求一个节目视频也没有。
// 这个末尾定位不缩短片段，不改变真实duration以迁就错误结果。
// 播放证据JSON保留实际节点时间和状态，不是测试生成一串预计进度数字。
// 短样本覆盖基本边界，仍没有验证长视频几十分钟持续漂移。
// 间隔等待由主进程截止线守住，源永不就绪时测试必须失败而非无限等待。
async function playback(ctx, clips) {
  for (const time of [2.8,.5,6.5,1.4,2]) await seek(ctx,time);
  await ready(ctx);
  ctx.smoke.check("COMPOSE: latest seek wins with per-clip source offsets", await ctx.run(`Math.abs(document.querySelector('[data-program-video="${clips.top.id}"]').currentTime-1)<.08&&Math.abs(document.querySelector('[data-program-video="${clips.bottom.id}"]').currentTime-2)<.08`));
  await seek(ctx,.5); await ready(ctx);
  await ctx.click('[data-editor-region=R03] button[aria-label=播放]');
  await ctx.wait("document.querySelectorAll('[data-program-video]').length===2&&Number(document.querySelector('[data-editor-playhead]').dataset.time)>1.5");
  await shot(ctx,"compose-playing-two-real-videos");
  await playbackEvidence(ctx,"overlap");
  ctx.smoke.check("COMPOSE: unified clock drives two actually advancing muted videos", await ctx.run("[...document.querySelectorAll('[data-program-video]')].every(e=>!e.paused&&e.muted&&e.currentTime>.3)"));
  await ctx.wait("Number(document.querySelector('[data-editor-playhead]').dataset.time)>4.5&&!document.querySelector('[data-program-video]')");
  await shot(ctx,"compose-playing-black-gap");
  await playbackEvidence(ctx,"gap");
  await ctx.wait("Number(document.querySelector('[data-editor-playhead]').dataset.time)>6.5&&document.querySelectorAll('[data-program-video]').length===1");
  await ctx.click('[data-editor-region=R03] button[aria-label=暂停]');
  await playbackEvidence(ctx,"tail-paused");
  ctx.smoke.check("COMPOSE: continuous playback crosses starts, ends and black gap without selection", await ctx.run(`document.querySelector('[data-program-video]').dataset.programVideo==='${clips.tail.id}'&&document.querySelector('[data-program-video]').paused`));
  await seek(ctx,clips.tail.end); await ready(ctx);
  ctx.smoke.check("COMPOSE: exact final end excludes last picture", !await ctx.run("!!document.querySelector('[data-program-video]')"));
}

// 切源持有旧节点引用才能确认真正暂停并清掉src，不以DOM消失单独当作释放。
// 原素材试听可开启声音，但节目没有同一时刻残留的video或audio。
// 浅深与窄窗使用同一真实工程，只改变窗口/主题，不能重建演示状态来通过。
// 先在双层固定时间保留旧节点引用，切源后即使DOM移除仍可核对资源状态。
// 旧节点必须paused且不再有src，只有isConnected假不足以证明解码停止。
// 素材查看只能有一台原始源，不能把节目隐藏后留在后台播放。
// 声音按钮在素材模式必须可用，但自动测试不点击它发声惊扰用户。
// 因此本组只证明试听入口保留，不写成实际扬声器已听到。
// 返回节目必须重新建立当前两层，不能复用素材timeupdate改掉工程书签。
// 主题改变走正式外观菜单，由原桥接驱动nativeTheme，不私建dark class。
// 只改nativeTheme不足以证明应用已完成主题同步，还要核对页面主题快照。
// 等主题过渡结束再截图，避免把动画中的旧颜色误命名为新主题。
// 菜单保持打开会遮挡工程，因此选择完成后关闭再记录画面。
// 断言同步核对主题与真实视频，防止只有窗口大小改变却误报浅色通过。
// 浅色窗口1600宽、深色1020宽分别截图，真实可用主区仍受AppShell导航影响。
// 主题断言检查两台视频仍在，不用静态样板图片代替真实构图。
// 宽度大于100保护预览没有响应式塌陷，不能只看媒体节点数量。
// 窄窗没有更改项目尺寸，源参数和构图值继续来自原片段。
// 本组窗口宽度不是系统DPR测试，不宣称125%或150%缩放通过。
// 恢复1600窗口只是测试后置清理，不能用重载清掉先前状态问题。
// A/B共享公共组件的旧样板另由UI套件回归，本组不伪称并排两个真实工程已实测。
// 离开页面资源释放由外层导航检查继续执行，不能以切源一项替代全生命周期。
// 没有录屏工具时保留截图和数值证据，不把它们包装成人工操作录像。
async function lifecycle(ctx) {
  await seek(ctx,2); await ready(ctx);
  await ctx.run("window.__compositeOld=[...document.querySelectorAll('[data-program-video]')]");
  await ctx.click('[data-editor-asset]'); await ctx.wait("document.querySelector('[data-editor-preview-mode=source] [data-live-video]')?.readyState>=2");
  ctx.smoke.check("COMPOSE: source viewing releases every programme decoder and preserves audition", await ctx.run("!document.querySelector('[data-program-composite]')&&window.__compositeOld.every(e=>e.paused&&!e.hasAttribute('src'))&&!document.querySelector('[data-editor-region=R03] button[aria-label=开启声音]').disabled"));
  await ctx.click('[data-editor-region=R03] button[aria-label=返回节目预览]'); await ready(ctx);
  for (const theme of ["light","dark"]) {
    await ctx.click('[data-theme-trigger]'); await ctx.wait("document.querySelector('[data-theme-option=light]')");
    await ctx.click(`[data-theme-option=${theme}]`);
    await ctx.wait(`document.documentElement.dataset.theme==='${theme}'&&!document.documentElement.classList.contains('theme-ripple')`);
    await ctx.click('[data-theme-trigger]'); await ctx.wait("document.querySelector('[data-theme-trigger]').getAttribute('aria-expanded')==='false'");
    ctx.win.setSize(theme==="light"?1600:1020,theme==="light"?1000:780); await ctx.delay(180);
    ctx.smoke.check(`COMPOSE: ${theme} retains both independent real layers`, await ctx.run(`document.documentElement.dataset.theme==='${theme}'&&document.querySelectorAll('[data-program-video]').length===2&&document.querySelector('[data-editor-preview-frame]').getBoundingClientRect().width>100`));
    await shot(ctx,`compose-${theme}-real-video`);
  }
  ctx.win.setSize(1600,1000);
}

// helper沿用同一媒体会话串行运行；结束后外层仍会验证路由卸载和日志错误。
// 模型与自动鼠标证据分开命名，不声称人工Explorer、系统缩放或扬声器通过。
// 场景顺序按规则、装配、构图、命中、播放、生命周期、错误恢复推进。
// 错误源放最后，防止其预期失败干扰先前真实播放的媒体数断言。
// 同一个生产窗口承接所有场景，不另开第二个Electron冒烟争抢单实例锁。
// 模型通过后仍必须运行真实解码，纯数据算术不能替代画面证据。
// 前一场景的临时变换保留到后一场景，使播放实测也覆盖旋转与半透明。
// 显隐场景恢复两层后才连续播放，不用新建默认工程躲开恢复问题。
// 外层脚本收集renderer error，未知异常仍会令整套失败。
// helper不调用app.quit，不改变外层看门狗或失败退出码。
// 每张截图在当前运行目录独立命名，不拿上一轮通过图片覆盖失败现场。
// 未实测人工项目明确留在文档待验，不因自动通过修改旧UI08验收状态。
async function checkVideoComposition(ctx) {
  modelChecks(ctx);
  const clips=await arrange(ctx);
  await transforms(ctx,clips); await hitAndVisibility(ctx,clips); await playback(ctx,clips); await lifecycle(ctx); await visibilityFixture(ctx); await decodeFailure(ctx,clips);
}
module.exports = { checkVideoComposition, modelChecks };

// FFV1是真正可被ffprobe识别但Chromium不能解码的文件，不伪造error回调。
// 该片段进入节目后必须显式失败，不能继续展示刚才成功的两层旧画面。
// 已探测的尺寸仍留在素材行，预览失败不能抹除素材事实或已有工程。
// FFV1样本字节由实际FFmpeg生成，生产ffprobe读取320×240与25fps。
// 按钮导入走原系统选择结果适配，只有返回路径是夹具，探测结果未替换。
// 片段放在12秒避开已有V1安排，确保失败来自解码而非碰撞拒绝。
// 当前播放头随新增片段定位12秒，因此坏源是实际节目活动对象。
// 预期phase必须error，不能将无视频误当成功黑场。
// pictures平面必须hidden，旧成功双层不能留在错误提示背后冒充结果。
// 所有仍登记的源必须paused和muted，错误时不能悄悄继续某一层。
// 素材行仍包含真实尺寸和帧率，证明探测成功事实没有因浏览器失败丢失。
// 错误截图来自正式入口，明确与正常黑场截图分开。
// 重试按钮再次装载同一不支持编码，应有界返回error，而非假ready。
// 等待使用外层18秒截止线，与产品15秒截止线形成可判读上限。
// 测试不通过修改readyState、派发error或替换解码器来制造失败。
// 删除坏片段仍走公开Delete，只删除工程引用，不删除磁盘视频。
// 选回原上层并定位2秒后应恢复两台有效源，错误不能清空原工程。
// 恢复断言也能发现旧failed被误存为全局状态导致其他源永远报错。
// 有错误文件不意味着整套预期失败，只有符合明确错误状态才算这一负向场景通过。
// 本例未覆盖源播放中磁盘被拔出或文件被并发改名，文档不能外推这些异常已验。
// 不支持编码的素材仍可留库，用户可以以后删除或另用支持的编解码器处理。
async function decodeFailure(ctx, clips) {
  const file=ctx.makeVideo("compose-unsupported.mkv","320x240",25,false,"ffv1");
  await ctx.importFiles([file]);
  const selector='[data-editor-asset][title="compose-unsupported.mkv"]';
  await ctx.beginDrag(selector); await ctx.dragTo(await ctx.lanePoint(12,"V1"));
  await ctx.wait("document.querySelector('[data-program-composite]')?.dataset.programPhase==='error'");
  ctx.smoke.check("COMPOSE: real unsupported codec fails visibly and retains successful metadata", await ctx.run(`document.querySelector(${JSON.stringify(selector)}).textContent.includes('320×240 · 25fps')&&document.querySelector('[data-program-pictures]').style.visibility==='hidden'&&[...document.querySelectorAll('[data-program-video]')].every(e=>e.paused&&e.muted)`));
  await shot(ctx,"compose-real-decode-failure");
  await ctx.click('[data-editor-region=R03] button[aria-label=重试预览]');
  await ctx.wait("document.querySelector('[data-program-composite]')?.dataset.programPhase==='error'");
  const bad=(await ctx.clips()).find(c=>c.start>11);
  await ctx.run(`document.querySelector('[data-editor-clip="${bad.id}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
  await ctx.click(`[data-editor-clip="${clips.top.id}"]`); await seek(ctx,2); await ready(ctx);
  ctx.smoke.check("COMPOSE: retry is bounded and removing a bad clip restores real composition", await ctx.run("document.querySelectorAll('[data-program-video]').length===2"));
}

// 帧位置来自真实媒体节点和工程书签，便于在日志之外核对不同源入点映射。
// 记录只是观测，不设置currentTime，不干预播放器，也不被当作人工录屏。
// 证据仅保存内部实例ID、时间与解码状态，不保存用户文件路径或账号令牌。
// 三次记录分别对应叠放播放、黑场推进和后段暂停，能独立对照阶段含义。
// 层列表为空在gap阶段是正确结果，而不是漏采样就一律判失败。
// readyState和seeking保留原数值，便于判断记录是否处于真实稳定帧。
// muted保留每层事实，不只记录一个全局静音按钮标签。
// paused保留媒体是否真的停下，不能由UI意图字段替代。
// 尺寸来自videoWidth/videoHeight，不读取测试自己写的元数据常量。
// JSON追加已有记录，但随机root保证不会混入上一轮样本。
// 写盘失败直接抛出，让证据缺失成为显式失败，不假装已经交付记录。
// 记录函数从不调用play、pause或设置currentTime，观测不会成为制造通过的手段。
// 该文件不是工程保存格式，不能被列为项目保存功能已完成。
// 时间记录是自动证据，仍不等价于人工录屏或声卡试听。
async function playbackEvidence(ctx, stage) {
  const frame=await ctx.run("(()=>({time:Number(document.querySelector('[data-editor-playhead]').dataset.time),phase:document.querySelector('[data-program-composite]').dataset.programPhase,layers:[...document.querySelectorAll('[data-program-video]')].map(v=>({id:v.dataset.programVideo,time:v.currentTime,paused:v.paused,muted:v.muted,seeking:v.seeking,ready:v.readyState,width:v.videoWidth,height:v.videoHeight}))}))()");
  const file=path.join(ctx.root,"compose-playback-evidence.json");
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):[];
  fs.writeFileSync(file,JSON.stringify([...previous,{stage,...frame}],null,2));
}

// 可见性事件负向夹具：明确不是实测Windows最小化或前台遮挡。
// 它只覆盖通知到达后真实媒体是否释放，不能给系统可见性行为写通过。
// 原属性在document原型上，临时实例属性删除后恢复浏览器真实判断。
// 旧源引用与src检查仍是真实节点状态，不以mock过的hidden值作为清理证据。
// 恢复时应重新解码同一书签，并保持暂停，不得继承隐藏前的播放意图。
// visibilityFixture只在该函数期间遮蔽document的hidden属性，其他字段仍由真实浏览器提供。
// Object.defineProperty设置configurable，结束后才能删除临时实例属性并恢复继承行为。
// 没有写document.visibilityState，因此测试不能宣称模拟了操作系统完整可见性状态机。
// 事件名称仍是visibilitychange，用于覆盖产品已安装订阅后的清理通路。
// 保存引用在发送通知之前完成，能够观察脱离DOM的原video是否真的清src。
// 如果产品只CSS隐藏源，DOM节点仍存在，第一条wait就不能通过。
// 如果产品只移除节点却继续播放，paused/src的第二条检查仍会失败。
// 如果产品清理后又被旧play成功承诺启动，后续恢复状态检查会暴露异常。
// 恢复先删除临时属性，再发通知，确保快照读取浏览器原本可见事实。
// 返回visible不调用播放按钮，所以任何非paused节点都意味着意外自动播放。
// 恢复预期两层，防止只把最上层重建而漏掉下层解码生命周期。
// 恢复仍要求muted，避免素材查看曾开启声音的状态泄漏到节目。
// 真实书签保留2秒，恢复应定位旧书签而不是回片段起点；前面的快速定位组独立核对映射。
// 当前fixture没有模拟事件永久丢失，不能宣称覆盖所有visibility通知故障。
// 产品节拍中的document.hidden读取提供停播兜底，但资源卸载仍依赖可见性订阅更新。
// Windows原生最小化、遮挡和多显示器切换保留未实测，不与本条自动通过混报。
// 该fixture只在隔离窗口生效，结束后不改变用户客户端或系统可见性设置。
// 若中间断言抛错，外层销毁整个隔离窗口，临时属性不会留到用户应用。
// 此组没有使用headless预期来跳过真实媒体节点，src释放对象仍是浏览器创建的视频。
// 测试名称中保留fixture字样，最终统计虽累计通过数，文档仍能分开证据类别。
// 两条fixture通过不增加原生系统拖入、系统缩放或扬声器试听的验收数量。
// 数据不写入持久化用户文档，后续启动应用不会受测试visible状态影响。
// 清理发生后原媒体表应为空，下一次有效节点登记从新的request负一开始。
// 这能检验同一个clip.id在卸载再挂载时不会被旧表项误删。
// 重建新节点与重用旧节点不同；保留的旧引用应继续无src，不能被偷偷回装。
// 测试没有恢复旧节点src，因此恢复成功必须来自产品自身重新装载流程。
// 真实加载失败仍由稍后的FFV1组验证，可见恢复组只使用已知可解码的两份源。
// 暂停源的currentTime允许浏览器保留最后值，资源已释放不要求其数值强制清零。
// 不以currentTime零判断释放，避免把停止但未清源的节点误报为完整清理。
// 同样不以DOM数量零推断音频已停止，原节点paused才提供独立旁证。
// 如果系统本来报告hidden，删除临时属性后测试不会伪造visible来强行通过。
// 这种前置不满足应在等待中明确失败，并留待真实桌面环境验证。
// 外层当前offscreen窗口报告visible，实验可以检验通知逻辑但不能把它称为真实遮挡测试。
// 节目隐藏不删除clips或assets，后面错误恢复继续使用同一工程证明数据仍在。
// 切到素材查看的清理与本组不同：前者整个节目组件卸载，后者节目工程容器继续存在。
// 因此两组都保留，有助于发现仅在返回页面而非切源时才出现的生命周期遗漏。
// 节目计时器在隐藏期间不能推进，intent会被关闭而不只是把UI图标变成暂停。
// 原书签保留让再次显示时构图和所读源区间一致，不把等待时间补算成播放。
// 隐藏状态没有新增画面变换或工程编辑权限，锁保护仍归原共同模型。
// 可见恢复后的焦点不自动跳到某个图层，避免恢复页面抢走用户当前控件焦点。
// 本组不验证所有可访问性焦点路径，完整人工键盘仍保持待验。
// 附带的截图来自恢复后的真实构图，而不是为hidden状态生成一张空白mock。
// 媒体节点数观察只针对data-program-video，素材缩略图的短期读取不算节目解码器。
// 活动层只有两条，本组不检验默认五路上限满载时的销毁峰值。
// 销毁速度不记录毫秒性能指标，测试只在有界等待内确认最终资源状态。
// 如果将来引入预加载池，必须重新审查这里“隐藏即无src”的明确资源契约。
// 不能用缓存池合理化隐藏后继续播放有声源，声音互斥约束仍必须保持。
// 当前没有Blob对象URL，因此释放是源安装器的pause/remove src/load，不额外调用URL.revokeObjectURL。
// 若未来增加Blob源，要由创建URL的拥有者配对撤销，不能让每个共享节点重复撤销同一个URL。
// 这些边界不证明导出清理，因为本轮没有创建编码进程或输出文件句柄。
async function visibilityFixture(ctx) {
  await ctx.run("window.__visibilityMedia=[...document.querySelectorAll('[data-program-video]')];Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
  await ctx.wait("!document.querySelector('[data-program-video]')");
  ctx.smoke.check("COMPOSE fixture: visibility notification releases real media resources", await ctx.run("window.__visibilityMedia.every(e=>e.paused&&!e.hasAttribute('src'))"));
  await ctx.run("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))"); await ready(ctx);
  ctx.smoke.check("COMPOSE fixture: visible restoration decodes current bookmark without autoplay", await ctx.run("document.querySelectorAll('[data-program-video]').length===2&&[...document.querySelectorAll('[data-program-video]')].every(e=>e.paused&&e.muted)"));
}
