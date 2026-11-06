"use client";

/**
 * 蒙版工作区的进程内草稿。组件卸载只解除订阅，不删除文档。
 * 像素数据保存在独立 canvas，revision 通知界面重画，不复制大数组进 React。
 * 文件导入有版本门闩，较慢的旧解码不能覆盖后选图片。
 * 没有把浏览器对象写入磁盘；此处保证页面切换，不承诺应用重启恢复。
 */
import { create } from 'zustand';
import { createMaskDocument, exportMaskDocument } from '@/utils/mask-document';
import { maskContext, rememberMask, restoreMask, snapshotMask, travelMask, type MaskDocument } from '@/utils/mask-document';
import { DEFAULT_MASK_BRUSH, invertMask, transformMask, type MaskBrush, type MaskTool } from '@/utils/mask-paint';
import { t } from '@/i18n';
import { gaussianBlur, selectionToMask, type PixelPoint, type PixelRect } from '@/utils/image-editor';
// 所有形状共用同一个选区契约，像素动作继续复用文档历史。
// 裁剪以选区覆盖率求边界，反选不误用原轮廓的包围框。
// 删除和图像翻转互相独立，不能把反选当成镜像操作。
import { cropSelectionPixels, deleteSelectionPixels, selectionBounds, transformSelection, type PixelSelection } from '@/utils/image-editor';

// 输出只针对一个 revision；任何笔迹变化都会立即清除旧导出。
// 图层显隐和预览颜色不改变实际输出，因此不增加 revision。
// busy 用于导入和导出边界，阻止转换期间覆盖源文档。
// 工具/笔刷的设置与文档分离，换图保留常用笔刷参数。
// revision 是文档内容版本，异步读取可以用它拒绝过期结果。
// busy 覆盖导入/导出过程，生成状态则由共享编辑会话负责。
// doc=null 是唯一未导入状态，不能用空文件名或尺寸零表达。
// layer 限制为两个可写层，原图不通过 patch 暴露可编辑选择。
// brush.color 是 RGB 绘画色，color 是蒙版显示色，二者不能同步绑定。
// visible 每层独立，false 只表示隐藏预览，不表示从导出排除。
// tolerance 使用 8bit 通道差范围，contiguous 只控制颜色选择的区域范围。
// exports 同时保留四份 Blob，新增笔迹后立即释放 store 对旧 Blob 的引用。
// error 只保存可读文字，不能把异常堆栈或用户路径写入持久日志。
// selection 是套索工作区，不等于已写入的蒙版；显式转换才改变输出。
// crop 是等待确认的自然像素矩形，取消框选不能删除底图。
// channel 切换只读视图，painting 是唯一接受画笔的编辑视图。
// blurRadius 以原像素为单位，缩放不影响滤镜强度。
interface MaskWorkspaceData {
  // draft 仅作绘制中虚线，不能作为 Delete 或裁剪的有效目标。
  // drawing 标记阻止尚未闭合时执行破坏性动作，并供 Escape 中断手势。
  // selection 只保存完成的自然像素区域，窗口与主题变化不会改写它。
  selection: PixelSelection | null; selectionDraft: PixelPoint[] | null; selectionDrawing: boolean; crop: PixelRect | null; blurRadius: number;
  channel: 'painting' | 'mask' | 'image' | 'composite';
  doc: MaskDocument | null; revision: number; busy: boolean; error: string;
  tool: MaskTool; layer: 'mask' | 'painted'; brush: MaskBrush;
  color: string; displayOpacity: number; visible: { original: boolean; painted: boolean; mask: boolean };
  tolerance: number; contiguous: boolean; exports: ReturnType<typeof exportMaskDocument> | null;
}
// patch 不能替换动作函数，调用方只能更新数据字段。
// mutate 是像素操作入口，统一记录历史并使旧导出失效。
// refresh 用于正在进行的同一笔，不重复保存历史快照。
// 动作接口区分修改数据和修改像素，调用方不能误把画笔当成普通 state 字段。
// importFile 捕获自身错误，UI 可以安全 void 调用而不产生未处理拒绝。
// mutate 只有文档就绪且不忙时执行，不需要每个工具各写一遍历史逻辑。
// action 名称封闭为 union，按钮传错操作会在 TypeScript 阶段失败。
// refresh 使所有订阅视图看到相同 revision，缩略图不会保留旧导出。
// Undo/redo 不修改 brush，因此用户撤销时保留当前选定的工具偏好。
// 保存和取消是编辑检查点，不代表写磁盘，也不触发服务器请求。
interface MaskWorkspaceState extends MaskWorkspaceData {
  patch: (value: Partial<MaskWorkspaceData>) => void; refresh: () => void;
  importFile: (file: File) => Promise<void>; mutate: (action: (doc: MaskDocument) => void) => void;
  // 三种选择共用这些动作，无有效选区时不创建像素历史。
  // 反选只变更选区，删除才修改图像透明度。
  // 开始裁剪仅预览，确认动作才真正删除范围外像素。
  action: (name: 'undo' | 'redo' | 'clear' | 'invert' | 'rotate' | 'rotateLeft' | 'flipX' | 'flipY' | 'save' | 'cancel' | 'applyCrop' | 'gaussian' | 'selectionMask' | 'invertSelection' | 'deleteSelection' | 'startCrop' | 'cancelSelection') => void;
}

// revision 只单调增加，异步输出可以据此识别用户是否已继续编辑。
// 错误属于当前工作区，不覆盖同页面共享生成表单的服务端错误。
// 导入新图时重置图层显隐，避免旧文档隐藏状态使新图看似导入失败。
// 当前文档由替换操作自然回收，不维护永远增长的素材缓存。
// 同一进程内多个订阅者读到同一个文档，缩略图和主画布不会分叉。
// 锁定发生在事件同步阶段，不依赖下一帧按钮 disabled 才防止重复操作。
let importVersion = 0;
export const useMaskWorkspaceStore = create<MaskWorkspaceState>((set, get) => ({
  // 默认蒙版笔选择 mask 层，旧版导入后即可涂抹的交互保持不变。
  // 默认叠加透明度为 0.55，实际输出覆盖率仍由 brush.opacity 决定。
  // 三层初始都可见，空 painted/mask 层自然不遮挡原图。
  // 容差 24 是颜色工具初始设置，不参与普通画笔。
  // 清空导出不会删除已经下载或由生成器保存的文件。
  // 错误提示不会在定时器后自动消失，直到明确的新操作清除它。
  selection: null, selectionDraft: null, selectionDrawing: false, crop: null, blurRadius: 4, channel: 'painting',
  doc: null, revision: 0, busy: false, error: '', tool: 'draw', layer: 'mask', brush: { ...DEFAULT_MASK_BRUSH },
  color: '#8877ee', displayOpacity: 0.55, visible: { original: true, painted: true, mask: true }, tolerance: 24, contiguous: true, exports: null,
  // patch 使用 Zustand 浅合并，只改传入字段，保留其他工具配置。
  // refresh 只增加版本和清空派生输出，当前 canvas 仍是原对象。
  // 不用深克隆三张 canvas，每个鼠标事件不会复制几十兆原图。
  // history 快照只在每次操作边界创建，绘制移动只调用 refresh。
  // 新内容会清除旧错误，避免上一轮导出失败挡住成功后的状态。
  patch: value => set(value), refresh: () => set(state => ({ revision: state.revision + 1, exports: null, error: '' })),
  importFile: async file => {
    // 版本在 await 前取得；并发读取中最后一次用户选择拥有提交权。
    // 旧文档暂留界面，导入失败时不让用户丢失已有编辑。
    // busy 先置位，导入期间工具按钮和画布输入都停止改写文档。
    // 后发导入可以替换前发请求，但前发 finally 不能解除后发 busy。
    // 解码函数负责释放其临时 URL，store 只接管已经建立的文档。
    const version = ++importVersion; set({ busy: true, error: '' });
    // 成功时同时替换 doc、版本、导出和层选择，不留下新旧素材混合状态。
    // 新图工具恢复蒙版笔，避免上一张图的填充模式误触整幅新图片。
    // 颜色、硬度等偏好则保留，换素材不要求用户重复调笔刷。
    // 被淘汰请求的文档没有写入 store，自然等待浏览器回收其缓冲。
    // 版本比较使用数字，不依赖文件名、MIME 或大小是否碰巧相同。
    // 新文档同时清掉完成选区和未结束的轮廓，旧指针不能污染同尺寸新图。
    // 版本门闩仍以最后一次导入为准，失败继续保留原素材。
    // 清掉裁剪预览不代表确认裁剪，也不写回源文件。
    try { const doc = await createMaskDocument(file); if (version === importVersion) set(state => ({ doc, selection: null, selectionDraft: null, selectionDrawing: false, crop: null, channel: 'painting', revision: state.revision + 1, exports: null, tool: 'draw', layer: 'mask', visible: { original: true, painted: true, mask: true } })); }
    // 只显示当前请求的错误；旧失败不能覆盖较新的成功提示。
    // 未知拒绝值回落到已有翻译，避免 UI 显示对象字符串。
    // 不清 doc 和 exports，用户可以继续下载上一次有效结果。
    catch (reason) { if (version === importVersion) set({ error: reason instanceof Error ? reason.message : t('create.maskEditor.loadFailed') }); }
    // loading 只由最后请求结束，保证快速连续选图不会错误解锁。
    // 即使导入失败也恢复可操作状态，允许从同一个入口重试。
    finally { if (version === importVersion) set({ busy: false }); }
  },
  // 快照先于像素写入；失败仍保留一次可撤销入口来恢复可能的部分操作。
  // 大图内存不足可能在快照或绘图阶段抛错，统一转为可读提示。
  // action 不应该包含异步操作；所有像素步骤在同一事件中完成。
  // 异步导出或生成在组件边界管理，不把 Promise 混进历史栈。
  // 无文档或导入中直接返回，调用方不会获得一个假成功的空输出。
  // 三层共用一条历史，旋转不能只撤回其中一层。
  // 记录成功后 refresh 清掉旧导出，防止用户下载与画布不同步的文件。
  mutate: action => { const { doc, busy } = get(); if (!doc || busy) return; try { rememberMask(doc); action(doc); get().refresh(); } catch (reason) { set({ error: reason instanceof Error ? reason.message : t('create.maskEditor.exportFailed') }); } },
  action: name => performMaskAction(name, get(), set),
}));

/**
 * 保存仅建立本地检查点，不发送上传或生成请求。
 * 取消恢复最近保存点，同时清除旧撤销栈，不能撤回到已取消的半成品。
 * 清空只清当前编辑层，原图始终存在，不把橡皮擦扩展成删除图片。
 * 旋转和镜像改变所有像素层；反转只作用于蒙版。
 * undo/redo 自行管理历史，不能经过 mutate 再记一次，否则会形成循环。
 * 错误保留为可读说明，不向用户输出 canvas 异常堆栈。
 */
// 操作名封闭在action union中，UI不能向这里传任意脚本或动态函数名。
// applyCrop需要已有合法矩形，没有框选时是无操作。
// 确认裁剪之后清空旧selection与crop，避免旧坐标作用于尺寸已变的新画布。
// 滤镜保留selection，因为用户可在同一范围继续修饰RGB。
// 高斯完成后自动显示painted，仅影响用户能否看见处理结果。
// selectionMask转换后清空临时选择，真实覆盖已写进mask层。
// 选择mask作为活动层与显示mask一起更新，不留下“已选择却看不见”的状态。
// save建立内存检查点，没有下载、落盘或上传副作用。
// cancel恢复saved并清除历史分支，撤销不能把取消的修改重新带回来。
// undo和redo直接travelMask，不能先remember再导航，否则会制造循环历史。
// rotateLeft用三次精确90度变换实现，外层mutate仍只产生一份快照。
// 镜像和旋转同步映射已完成轮廓，未完成草稿不继承到新的坐标系。
// 清空只作用当前可写层，原图永远不属于允许清空的layer类型。
// 反转仅修改蒙版覆盖率，不与Canny图像的黑白反转混用。
// 错误发生后保留文档与可读提示，不能用新建空图掩盖异常。
// mutate已经处理像素动作错误，外层catch覆盖保存点和历史导航等直接操作。
// revision通知主图及通道预览，导出缓存也必须同时失效。
// 视图显隐不会使缓存失效，因为固定导出契约不读取visible。
// 清空导出引用不会撤销用户已经下载到磁盘的文件。
// 返回页面后读同一store文档，操作不依赖组件仍挂载。
// 编辑草稿不自动持久化，关闭应用后这些浏览器对象会自然消失。
// 真正生成任务属于公共队列，不能在本action中另起请求或重置taskId。
// 读取源Meta仍使用doc.file，不把当前裁剪后的像素误当作原文件字节。
// 文档尺寸来自original缓冲，绝不使用用户正在观看的缩放矩形。
// 图层快照的恢复包括宽高，裁剪后undo能够真实找回被删区域。
// 大图内存异常可能留下可撤销状态，错误提示不能宣称动作已完成。
// 按钮禁用之外仍检查busy，导入中的直接调用不能写入旧文档。
// 调用序列同步完成，不把Promise留在Canvas变换与历史更新之间。
// 同一状态快照保证一次动作不会混用前后两个文档引用。
// 此入口不修改brush偏好，撤销像素时用户选中的笔刷仍保留。
function performMaskAction(name: Parameters<MaskWorkspaceState['action']>[0], state: MaskWorkspaceState, set: (value: Partial<MaskWorkspaceData>) => void): void {
  // 读取同一份 state 快照避免一次操作中混用两张文档。
  // 底层保护重复检查 busy，不因测试或其他调用绕过按钮禁用。
  // 保存不改变像素，因而不清 exports；取消和历史导航必须清派生输出。
  // 取消恢复后将历史清空，旧修改分支不应该还能通过 redo 复活。
  // 检查点本身不在 past/future 中，因此多次撤销不改变取消目标。
  // rotateLeft 用三个 90 度变换，外层 mutate 仍只创建一次历史记录。
  // clear 对选中层读实际自然宽高，不用可能缩放过的 DOM 矩形。
  const { doc, busy } = state; if (!doc || busy) return;
  try {
    // 选区动作先处理，避免无选区 Delete 落入旧翻转默认分支。
    // 手势未闭合时禁止像素确认，Escape 仍可主动取消。
    // 删除、裁剪每次只记一条既有历史，不另建跨素材历史栈。
    if (performSelectionAction(name, state, set)) return;
    if (name === 'gaussian') { state.mutate(value => gaussianBlur(value, state.blurRadius, state.selection)); set({ visible: { ...state.visible, painted: true } }); return; }
    if (name === 'selectionMask') { if (state.selection) state.mutate(value => selectionToMask(value, state.selection!)); set({ selection: null, layer: 'mask', visible: { ...state.visible, mask: true } }); return; }
    if (name === 'save') { doc.saved = snapshotMask(doc); return; }
    // 历史导航和恢复保存点同时取消开放手势，迟到抬起不能提交旧尺寸轮廓。
    // 清除草稿不改历史内容，像素恢复仍只经过同一条 travel/restore 路径。
    // 正在绘制时 selection 已为空，因此不能仅清 selection 就认为手势结束。
    // redo 与 undo 使用相同取消语义，不让前进历史复活另一张预览边框。
    if (name === 'cancel') { set({ selection: null, selectionDraft: null, selectionDrawing: false, crop: null }); restoreMask(doc, doc.saved); doc.past = []; doc.future = []; state.refresh(); return; }
    if (name === 'undo' || name === 'redo') { set({ selection: null, selectionDraft: null, selectionDrawing: false, crop: null }); travelMask(doc, name === 'redo'); state.refresh(); return; }
    // 翻转/旋转同步变换完成选区，不能只移动 RGB 留下错位虚线。
    // 未完成草稿不继承到新方向；撤销仍清选区以免和历史像素错配。
    // 逆时针组合三个顺时针只映射三次坐标，仍由下方记一次像素历史。
    if (['rotate', 'rotateLeft', 'flipX', 'flipY'].includes(name)) { let selection=state.selection; if(selection) for(let i=0;i<(name==='rotateLeft'?3:1);i++) selection=transformSelection(selection,name==='rotateLeft'?'rotate':name as 'rotate'|'flipX'|'flipY'); set({ selection, selectionDraft:null, selectionDrawing:false, crop:null }); }
    state.mutate(value => { if (name === 'clear') maskContext(value[state.layer]).clearRect(0, 0, value.original.width, value.original.height); else if (name === 'invert') invertMask(value); else if (name === 'rotateLeft') { for (let i = 0; i < 3; i++) transformMask(value, 'rotate'); } else if(name==='rotate'||name==='flipX'||name==='flipY') transformMask(value,name); });
  } catch (reason) { set({ error: reason instanceof Error ? reason.message : t('create.maskEditor.exportFailed') }); }
}

// 选择动作不会暗中改变工具以外的模型参数，也不会开始上传或生成。
// 返回 true 表示已消费该动作，无选区仍需返回 true 以阻止旧默认分支。
// cancelSelection 在手势中也可执行，drawing=false 使迟到 pointerup 无法提交。
// startCrop 复用当前形状，没选区时只进入唯一裁剪工具等待矩形拖动。
// 反选不记像素历史，连续两次反选恢复同一图像范围。
// 删除保留选区便于连续操作；撤销像素后统一清除，避免坐标错配。
// crop 矩形只是预览包围框，真正裁切仍使用完整形状和反选语义。
// 空覆盖不能进行破坏性裁剪，所有 no-op 都在 rememberMask 之前返回。
// 任务期间入口由 locked 禁用，导入 busy 由上方共同守卫。
// 三层修改均经过 mutate，revision/exports 失效通知遵循原有机制。
// selectionBounds 只在显式裁剪入口调用，鼠标移动不读回整幅图像。
// cancelSelection 不改工具，用户可继续用同一个选择工具重新圈选。
// 反选时有裁剪预览才重算包围框，普通选择不生成裁剪确认状态。
// 删区仍保留位图宽高，裁剪才更换自然尺寸，不能交换这两个动作。
// crop 为 null 时菜单取消已退出预览，旧确认按钮不会留在工作区。
// 返回消费状态和动作是否改像素不同，无选择时的 Delete 是已处理无操作。
// 同时保留 menu 和快捷键守卫，程序性动作也不能绕过有效选区检查。
// set 只发布对应状态片段，未修改的生成参数和下载队列不被覆盖。
// 反选对象是新引用，所有预览订阅者能够在同一版本看到内外交换。
// 本模块不把选区状态写入用户 JSON，避免序列化大图与浏览器对象。
function performSelectionAction(name: Parameters<MaskWorkspaceState['action']>[0], state: MaskWorkspaceState, set: (value: Partial<MaskWorkspaceData>) => void): boolean {
  const selection=state.selection;
  if(name==='cancelSelection') { set({selection:null,selectionDraft:null,selectionDrawing:false,crop:null}); return true; }
  if(!['startCrop','invertSelection','deleteSelection','applyCrop'].includes(name)) return false;
  if(state.selectionDrawing) return true;
  if(name==='startCrop') { set({tool:'crop',crop:selection?selectionBounds(selection):null}); return true; }
  if(!selection) return true;
  if(name==='invertSelection') { const next={...selection,inverted:!selection.inverted}; set({selection:next,crop:state.crop?selectionBounds(next):null}); }
  else if(name==='deleteSelection') state.mutate(doc=>deleteSelectionPixels(doc,selection));
  else if(selectionBounds(selection)) { state.mutate(doc=>cropSelectionPixels(doc,selection)); set({selection:null,selectionDraft:null,crop:null}); }
  return true;
}
