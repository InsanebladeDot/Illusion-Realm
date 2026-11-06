# 全项目性能开销检查

日期：2026-11-06。当前任务为检查与列清单，没有修改业务、IPC、存储格式、样式或测试脚本。保留全部已有工作区修改。

检查覆盖 Next 渲染/状态、Electron 主进程/存储/媒体、shared 契约和 Python Agent 的主要调用路径；不是对每个函数的完整性能剖析。依据实际源码、调用方及现有静态导出，区分“机制已确认”和“实际耗时尚待测量”。未运行用户真实工程的 CPU/堆/GPU 录制，也不提供未经测量的加速百分比。

## 结论与建议顺序

最值得缩小的是大对象和二进制的复制、全量列表、热路径重新计算、主进程同步 I/O，以及未使用功能的提前加载。建议按下表拆成小任务实施，每项用固定规模作品做前后对照，保留用户数据与业务契约。

| 顺序 | 优化项 | 主要收益 | 风险/工作量 |
| --- | --- | --- | --- |
| 1 | 本地封面从 Base64 常驻缓存转向缩略图/媒体地址，设缓存预算 | 降低看图、模型库的内存和主进程阻塞 | 中；保留需要真实字节的解析功能 |
| 2 | 蒙版绘制分离像素刷新和面板状态，复用画布缓冲，收紧快照预算 | 降低笔刷卡顿和大图内存峰值 | 中高；像素、撤销和导出必须一致 |
| 3 | 模型与图片目录扫描异步化、去重和增量刷新 | 降低启动、刷新、更换封面时整窗停顿 | 中；不能新增扫描时自动哈希 |
| 4 | 创建页的画师数据、3D工具及收藏导出按需加载 | 降低进入创建页的脚本解析与对象初始化 | 中；保留打开后的草稿和焦点规则 |
| 5 | 视频播放时间与静态素材/时间线分离，缓存波形和索引 | 降低播放时 CPU 和 React 更新量 | 中高；不能破坏统一时钟、定位和锁轨 |
| 6 | 单用户 JSON 的去重保存、串行异步落盘与精简返回值 | 降低文档增长后的写盘和 IPC 复制开销 | 中高；需验证失败恢复与写入顺序 |
| 7 | 模型资料按版本失效、长列表窗口化 | 降低列表选中、搜索和长目录开销 | 中；键盘、多选、布局和滚动要回归 |

其中1—5优先于清理少量 CSS 或给所有组件机械增加 memo。没有证据表明注释、文件命名或普通组件拆分本身是当前瓶颈。

## 构建体积实测

数据来自现有静态产物，指纹 `889b67441d37eaa0538974e6cac53cebd6fcca3ad82458745d45054a616ba53e`，记录时间 `2026-11-06T08:01:54.580Z`。本轮未重新构建。机器可读数据见 [performance-audit-2026-11-06.json](performance-audit-2026-11-06.json)。

下表只加总导出 HTML 直接引用的 JS，同路由去重；不是完整异步依赖总量、实际加载耗时或内存。不同页面共享的 chunk 在导航时可能复用，不能把多页数字相加当常驻占用。

| 入口 | 脚本数 | 原始字节 | MiB |
| --- | ---: | ---: | ---: |
| 首页 `/` | 14 | 1,275,005 | 1.22 |
| 创建 `/create` | 18 | 6,829,279 | **6.51** |
| 无限画布 `/canvas` | 15 | 1,526,180 | 1.46 |
| Agent `/agent` | 16 | 1,655,136 | 1.58 |
| 个人中心 `/profile` | 15 | 1,937,521 | 1.85 |
| 视频编辑器 `/tools/video/editor` | 17 | 1,426,463 | 1.36 |
| C站模型 `/tools/models/civitai` | 16 | 1,384,320 | 1.32 |

所有 JS chunk 共58个，约8.81 MiB。最大的 `0_1dxuowxgvix.js` 为5,272,149字节（约5.03 MiB）；同时包含画师记录字段、`GLTFLoader` 和 `WebGLRenderer`。画师源 JSON 为3,466,762字节、40,600条。gzip 对照仅作为体积参考，不表示当前 app 协议使用了 gzip。

## 确认的开销与实施边界

### 1. 本地图片：同步读取、Base64、多层复制、无容量上限的缓存

调用链为 [LocalFileImage](../apps/next/src/components/LocalFileImage.tsx:24) → [useLocalImageSrc](../apps/next/src/hooks/useLocalImageSrc.ts:33) → [localImageSrcCache](../apps/next/src/utils/localImageSrcCache.ts:12) → preload `readLocalImage` → [image-data](../apps/electron/src/main/modules/images/image-data.js:33)。主进程同步读取整张图片并编码，IPC传输长字符串，renderer 的模块 Map 缓存成功结果。没有条数/字节预算或常规淘汰，换页不自动清空。

Base64长度约为原文件的4/3，除此以外还有编码时的Buffer、跨进程克隆、字符串与图像解码开销；不能只按压缩文件大小计算内存。缓存 notify 会通知所有图片订阅者做快照检查，但不等于所有图片都会重新渲染。

建议：列表用实际尺寸的缩略图，大图预览按需加载原图；显示优先复用 `buildLocalFileUrl` 与既有 localfile 协议；需要EXIF/PNG Meta字节的解析功能保持独立。若继续缓存字节，需按容量限额、按路径通知并保留更换封面的失效规则。验收应观察浏览大量不同封面后内存是否有界，而非仅比较第一次打开。

### 2. 蒙版：一次笔刷移动引发全尺寸合成与全状态订阅

[use-mask-pointer](../apps/next/src/components/create-edit/use-mask-pointer.ts:141) 在移动中 `refresh()`；[store](../apps/next/src/stores/use-mask-workspace-store.ts:89) 改 revision。stage、工具栏、笔刷面板和多个通道组件订阅整个 store。[stage](../apps/next/src/components/create-edit/mask-canvas-stage.tsx:152) 每次重绘重新设置自然宽高；[drawMaskOverlay](../apps/next/src/utils/mask-preview.ts:47) 又新建原图尺寸的着色canvas。通道缩略图也随 revision 更新。

建议：用选择器缩小面板订阅；手势像素更新与面板状态分离；只在自然尺寸变化时重建缓冲；复用着色层，必要时重绘脏矩形；通道缩略图降频。可以合并显示帧，但最终笔迹、松手提交、取消与隐藏窗口收尾不能丢失，不能单靠 rAF 等待事务结束。

### 3. 蒙版快照：名义96 MiB预算不覆盖最小一份快照与其他层

[snapshotMask](../apps/next/src/utils/mask-document.ts:112) 每份复制original、painted、mask三层。`rememberMask` 用96 MiB算条数，但最少保留1份。允许的4096×4096图片，一层RGBA原始像素为64 MiB，一份三层快照为**192 MiB**；saved和至少一份past便是384 MiB，还未算活动图层、stage、临时叠加、解码和撤销过程的峰值。这是按代码形状计算的理论像素量，不是实测堆占用。

建议：普通笔画只保存被修改图层/区域，原图不可变时共享；旋转/裁剪单独处理尺寸变化；预算覆盖past、future、saved及临时缓冲。不能为性能简单删除撤销或强制降低导出分辨率。

### 4. 主进程：模型和生成图片目录是同步扫描

[scanner](../apps/electron/src/main/modules/models/scanner.js:139) 递归 `readdirSync`、逐文件 `statSync`，随后再次枚举目录找封面。[handler](../apps/electron/src/main/modules/models/models.handlers.js:90) 虽声明async，内部仍直接执行同步扫描，不会自动转移到其他线程。[AppShell](../apps/next/src/components/AppShell.tsx:241) 启动时调用全模型扫描；[更换封面](../apps/next/src/view/toolBox/Tool/civitai/local-model-library.tsx:214) 也触发全扫描。[generated-images](../apps/electron/src/main/modules/images/generated-images.js:102) 的列图和目录操作同样包含同步枚举/stat。

大目录、机械盘、外接盘或网络路径会放大主事件循环阻塞。建议异步fs、受限并发、重复请求合并、已枚举结果复用；封面变化局部更新，显式刷新负责完整核对。保留配置目录、分类、权限、失效和手动扫描语义；不能把模型SHA计算塞进扫描。

### 5. 创建页：未打开工具也提前加载大数据与3D引擎

[PromptAssemblyPanel](../apps/next/src/view/create/promptAssembly/PromptAssemblyPanel.tsx:47) 静态导入标签库和3D弹窗；[TagLibraryDialog](../apps/next/src/view/create/tagLibrary/TagLibraryDialog.tsx:37) 静态导入画师查询；[artist-library](../apps/next/src/utils/artist-library.ts:7) 模块初始化即为40,600条源数据建立Map、展示对象和图片地址。[tagLibraries](../apps/next/src/data/tagLibraries.ts:4) 与[收藏导出控件](../apps/next/src/components/library/library-favorites-controls.tsx:9) 也存在通向全库数据的静态依赖，所以只把一个弹窗改成dynamic仍可能没有真正拆掉大包。

建议：按需加载工具和静态数据，收藏导出在点击时加载；核对所有静态导入边，避免间接重新带回主包。已有真实打开实例可保留草稿，不把“暂时关闭”变成每次重置；首次使用展示真实加载/失败状态。验收看构建引用图和实际网络/解析耗时，不只看源码出现了dynamic。

### 6. 关闭的标签库仍订阅状态并可能做全库过滤排序

[PromptAssemblyPanel](../apps/next/src/view/create/promptAssembly/PromptAssemblyPanel.tsx:823) 为每个资料库装配一个实例。[TagLibraryDialog](../apps/next/src/view/create/tagLibrary/TagLibraryDialog.tsx:151) 在 `if (!open) return null` 之前已经执行store订阅和过滤useMemo；收藏等依赖变化可使关闭的库也参与计算。画师查询包含完整候选排序，不能因为只显示24条就认为只计算24条。

建议：将计算放在打开的内容实例内，或显式暂停关闭库的查询和高频订阅。保留原来取消草稿和重开重置规则，不在Hook条件分支里违法调用Hook；不要为关闭状态建立所有库的永久DOM。

### 7. 模型库：全量卡片、反复排序、详情点击触发整批元数据读取

[LocalModelLibrary](../apps/next/src/view/toolBox/Tool/civitai/local-model-library.tsx:500) 直接 `filtered.map` 挂载所有模型，无分页/窗口化；筛选树和[排序](../apps/next/src/view/toolBox/Tool/civitai/local-model-sort.tsx:98) 在普通选择重渲染中也会重做。列表模式的 [metadataRevision](../apps/next/src/view/toolBox/Tool/civitai/local-model-library.tsx:445) 包含detailsRevision；`showDetails()`每次增加它，而整个列表的useLocalModelMetadata也使用这份revision。因此点击一张详情会重新读取整批列表JSON，而不只是该模型。

建议：按输入缓存筛选/目录树/排序；列表分页或窗口化；分离详情修订与列表修订，元数据按路径和明确失效原因共享。对外部修改的JSON保留刷新/mtime失效策略，不使用永不过期缓存。批量选择用Set/索引，保留当前严格名称或JSON哈希的“本地已有”规则。

### 8. 文件管理全页和Agent长会话：有memo不等于DOM有界

[CreateHistorySidebar](../apps/next/src/view/create/CreateHistorySidebar.tsx:533) 侧栏只显示6或9张，但 `isPage` 分支使用全部筛选图片；全页大目录仍可能挂载所有条目。[AgentMessageList](../apps/next/src/view/agent/AgentPage.tsx:264) 同样map全部会话消息。消息行与Markdown已经memo，历史文本通常不会每次重解析；仍有全部DOM、列表遍历和布局占用。

建议仅对真实长列表做窗口化/分页，缩略图懒加载不能代替DOM窗口化。回归高度变化、回到底部、查找、选区、键盘和完整预览索引；小列表无需为此引入复杂虚拟化框架。

### 9. 视频编辑器：播放时间更新范围过大

[useProgramScheduler](../apps/next/src/view/toolBox/Tool/video/editor/use-program-playback.ts:280) 每40ms检查节目状态，播放时通过 `reportTime` 更新工程状态。[VideoEditorView](../apps/next/src/view/toolBox/Tool/video/editor/video-editor-view.tsx:89) 每次重新按轨道筛片段、find素材并构造所有层/回调；[TrackRow](../apps/next/src/view/toolBox/Tool/video/editor/editor-timeline.tsx:243) 重新filter/map全轨片段。[ClipWaveform](../apps/next/src/view/toolBox/Tool/video/editor/clip-waveform.tsx:105) 每次渲染重新生成SVG路径，循环里还有 `lower.unshift` 的重复数组搬移。

建议：素材id索引、按轨道分组和波形路径缓存；静态列表/片段层与播放头、当前关键帧和预览操作层分开更新；稳定回调需确保读到最新业务状态。波形生产端目标2048、硬上限4096个峰值，已有上限应保留，不能拿无限长伪数据夸大结论。暂停且完全就绪时可减少无效轮询，但加载/解码错误上界和隐藏窗口收尾必须仍能完成。

这里确认了25Hz路径及重算行为，尚未在大工程上测得每帧CPU/FPS。不能简单移除统一时钟，或让各video独立推进以换取表面流畅。

### 10. 视频连续帧：滚动时重复建立解码器，仍有进一步复用空间

[VideoFilmstrip](../apps/next/src/view/toolBox/Tool/video/editor/video-filmstrip.tsx:178) 每次paint新建video、加载媒体、逐帧seek，最后清理。滚动与缩放调度有120ms防抖，已经有可见性判断、视口宽度画布、串行队列和64帧缓存，这些不是缺失项。

剩余机会是同源片段共用受限数量的解码会话、缓存键/采样策略和过期任务合并，减少连续滚动反复load。优先级低于整个编辑器的重渲染范围。不能取消中止/清理，不能把缓存无上限或“每格真实每帧解码”当优化；需要按可见密度采样。

### 11. 用户文档：整份来回传输、格式化、同步写盘

[userDataStorage](../apps/next/src/utils/userDataStorage.ts:30) 已有300ms防抖和共享文档缓存；[saveUserDataDocument](../apps/next/src/utils/userDataDocument.ts:189) 每次合并整份文档并IPC提交。[writeJsonFile](../apps/electron/src/main/storage/user-data.js:45) 对整份文档做pretty JSON和 `writeFileSync`，[writeUserData](../apps/electron/src/main/storage/user-data.js:120) 返回结果还包含完整data，renderer这里只消费成功状态。文档包含收藏、设置、生成记录和画布，增长会扩大每次不相关小修改的成本。

建议先比较实际持久化分段，跳过无内容变更写入；单文件内采用串行、有序、异步写入和明确失败恢复；写入接口在核对所有调用方后只返回所需信息。保持一个JSON文件和既有默认路径，不引入数据库。异步化要配套顺序控制，不能让晚完成的旧快照覆盖新数据；减少格式空白只是次要收益。

### 12. 3D视角：静止时仍持续绘制

[View3DScene](../apps/next/src/view/create/view3d/View3DScene.tsx:220) 每个rAF执行controls.update并render；角度没变化只避免回调，没有避免GPU绘制。关闭弹窗会卸载并dispose，所以不声称关闭后仍一直运行。

建议相机、模型、光照或尺寸变化时标记重绘，阻尼收敛后停画；隐藏的保留工作区暂停图形绘制但保留模型/草稿。验收需要真实窗口和非100%DPR，不能破坏已有遮挡/可见性约定。

### 13. 无限画布：热路径已修，剩余是历史和非拖动签名

上一轮已减少逐帧嵌套查找、全卡Context广播和拖动JSON，不重复列为未修复。[snapshot](../apps/next/src/view/infinite-canvas/canvas-model.ts:137) 仍克隆全节点外壳/position/data及边，历史最多50份；[持久化签名](../apps/next/src/view/infinite-canvas/use-canvas-persistence.ts:38) 在非拖动nodes/edges引用变化时仍完整序列化，选择/测量虽不写入文档也可能触发计算。

建议先用大图测快照/选择/参数编辑成本，再考虑结构共享或操作历史、内容版本与保存签名分离、可见节点渲染。快照是浅层复制，不能将全部文本字符串都按每份深拷贝夸大内存；历史改造涉及取消、复制和导入，风险高于低成本局部优化。

### 14. Agent：长回答和长上下文应分别治理

[useAgentStore](../apps/next/src/stores/useAgentStore.ts:640) 已将流式delta按40ms合并；[MarkdownResponse](../apps/next/src/components/MarkdownResponse.tsx:75) 已memo，代码块也有memo和十万字符高亮上限。当前正在增长的回答仍同步解析累计Markdown与发生变化的代码块，长输出会重复工作，可考虑对流式展示降频或稳定块缓存，结束时完整解析。

另一个开销是 [buildHistory](../apps/next/src/stores/useAgentStore.ts:175) 将历史文本及用户图片再次送入请求，[Python构造器](../apps/agent/agent_core/input_messages.py:118) 保留这些上下文；图片已有总量限制，但没有按模型token预算规划历史的机制。长会话会增加请求体、模型输入消耗和等待，这与页面卡顿是两回事。建议增加明确的上下文用量/预算与用户可理解的摘要策略；不可为省钱静默丢弃旧图或改变对话含义。实际模型费用与延迟需使用真实账户统计，当前未测。

### 15. Comfy输出：仍有整文件转Base64的路径

[fetchFileDataUrl](../apps/electron/src/main/modules/comfy/proxy.js:224) 对输出响应 `arrayBuffer()` 整体读取，再生成data URL；生成结果流程调用该函数。大图或长媒体会经历整文件Buffer、Base64和跨进程复制，不能从“模型下载已经流式”推断全部媒体通道也流式。

建议核对每类消费者，适合落地的输出先流式保存到合法目标，renderer拿媒体引用，需写Meta的PNG单独保留有界处理。保持取消、失败、元数据和原输出目录契约；不是把所有data URL一刀切删除。收益取决于实际媒体大小，未测峰值内存。

### 16. 静态资源：字体可减包体，不能冒称当前启动负担

十份漫画TTF共**36,937,044字节，35.23 MiB**。[dialogue-fonts](../apps/next/src/view/cartoon/dialogue-fonts.ts:1) 按需加载，并非启动全下载。[app协议](../apps/electron/src/main/core/protocol.js:152) 对静态文件readFile后整体返回，字体/OpenCV等大资源有额外Buffer峰值。

可以评估完整字库WOFF2、保留许可与导出字体一致性、静态资源流式返回及内容哈希资源的缓存策略。这主要降低安装包/首次使用某字体的开销；不能删除未输入字形换来后续缺字，也不能删除离线能力。35.23 MiB不能算进创建页的JS加载量。OpenCV约10.37 MiB已在Worker中按需加载，先保留现有隔离，不为缩包移回UI线程。

## 已经存在、建议保留的优化

- [模型下载](../apps/electron/src/main/modules/models/downloads/model-download-transfer.js:40) 已按chunk读写并等待写入，有背压、断点续传和哈希验证，不是整个权重下载进内存；[进度](../apps/electron/src/main/modules/models/downloads/model-download-manager.js:172) 已按约250ms节流。
- localfile协议为真实视频提供Range/流式读取；视频编辑器没有先把整个本地视频搬进renderer内存。
- 波形任务已按来源共享、串行执行、有限缓存，FFmpeg输出也有峰值数上限；连续帧已有可见性和缓存预算。
- 用户数据已经共享读取、300ms防抖；优化应集中在整份写入和多余保存，而非再加一层同类防抖。
- Agent流式合并、历史消息memo、代码高亮上限、资料库24条分页已存在。不能重复实现后声称修复了原本没有的问题。
- Canny已在Worker处理并有防抖、取消/过期结果和超时边界；不优先重写。

## 实施后应怎样验证

| 场景 | 固定测试输入 | 应采集证据 |
| --- | --- | --- |
| 创建页冷启动/首次工具 | 同产物、同窗口、空工程 | 直接引用/异步chunk、解析时间、长任务；首次打开加载状态 |
| 模型库/文件管理 | 100、1,000、5,000条目录 | 挂载DOM数、主进程事件循环停顿、搜索/选中耗时、JSON读取次数 |
| 图片浏览 | 连续打开不同来源后离开/返回 | Base64缓存字节预算、renderer/main内存、释放后稳定值 |
| 蒙版 | 2048²和4096²、相同笔迹与撤销次数 | 指针到绘制延迟、缓冲分配、峰值内存、导出像素对照 |
| 视频 | 相同源片段20/100/300个、多轨 | 播放帧CPU、React commit范围、波形重算次数、定位/取消回归 |
| JSON保存 | 多个文档规模、同一批设置修改 | 写次数、IPC字节、主事件循环延迟、失败/并发/重开后的数据一致性 |
| 3D和Agent | 相机静止/操作、长流式回答 | 静止GPU占用、活跃长任务、历史滚动、结束后资源释放 |

这些是后续验收计划，不是本轮通过记录。真实操作、自动事件和mock必须分别报告；不能以CPU使用率下降但功能未执行作为优化成功。

## 本轮验证范围

实际完成：源码/调用方检查、导出HTML脚本引用去重统计、chunk/源数据/字体大小测量，以及像素缓冲理论量计算；数值已存JSON。未做业务修改，未运行typecheck/lint/构建/Electron回归或真人操作，本轮不借用上轮104/104当作性能验收。没有删除文件或用户素材，也没有读取用户JSON正文、凭据或私人媒体。

仅文档与测量数据新增，业务/测试增量注释率不适用。后续实现仍须遵守函数长度、注释率和按影响回归要求。
