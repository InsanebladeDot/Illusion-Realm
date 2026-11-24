# 原视频合成器直接嵌入实施记录

日期：2026-11-10。功能接通与专项自动回归完成；人工项待验，注释率门槛未通过，不能标记完整验收通过。

## 接入位置与原件

入口仍是无限画布节点中的“视频合成器”，在 AppShell 主区打开原网页。没有替换工具箱的视频编辑器，也没有改写导演台。

资源统一位于 `apps/next/public/embedded-tools/video-composition/`。实际加载 `embed.html`，其内部直接挂载提供包的原 `VideoCompositionDialog`。原 Vue、时间线、预览器、属性、CSS 和 WebCodecs 编码模块继续使用；React 只承担宿主与画布事务适配。原 CSS 隔离在 iframe 内，没有加入幻域全局样式。

`original/` 共34份资源，约1.43 MiB；`source-manifest.json` 保留来源和目标 SHA256。33份逐字不变；消息适配器 `index-BAZtl7kx.js` 只增加“禁止尚未实际写盘就提示本地导出成功”的分支，真正成功、取消和失败由宿主回执反馈。原剪辑和编码实现没有修改。

原演示 `index.html`、`local-host.js` 保留来源完整性，但正式入口不加载它们，也不启动3220服务或使用 `/api/state`。资源随 Next 静态导出走 `app://`，不依赖个人 Documents 目录。

## 文件与复用关系

| 文件/机制 | 职责及复用边界 |
| --- | --- |
| `public/embedded-tools/video-composition/embed.*` | 原 Vue 挂载、MessageChannel、真实保存反馈和关闭保护 |
| `src/view/video-composition/composition-editor.tsx` | iframe 宿主，复用 CanvasOverlay 主区尺寸和导演台已有导航保护机制，业务会话独立 |
| `composition-assets.ts` | 连线输入与资产编号/本地URL的双向转换，保留原剪辑快照 |
| `composition-bridge.ts` | 每会话一条专线，动作白名单、排队、回执、关闭等待与释放 |
| `composition-controller.ts` | 原快照保存、原文件写入及成片视频节点/连线回填 |
| shared schema / 主进程校验 | 分别校验版本、规模、有限数字、合法媒体引用和请求正文 |
| `composition-media.js` | 复用画布工作目录分配，受管媒体与真实另存为 |
| `project-archive.js` | 将合成器资产纳入既有 `.ircanvas` 打包与恢复 |

原静态外壳 `reference-ui/composition-editor.tsx` 已删除，其专用 `.hy-composer` 样式及失效主题规则已清理。既有画布、导演台、创建页组件与工具箱原视频编辑器继续各自工作。

## 本地闭环

1. 读取直接连入该合成节点的真实图片、视频和音频；原组件依其原初始化规则入轨，宿主不会再添一套片段。
2. 原组件继续管理剪辑、效果、播放、撤销及原导出设置。保存事件经专线进入既有画布持久化方法。
3. 保存快照保持原字段，但所有 `src/url` 均改写为 `composition-asset:<id>`；真实文件路径仅在 `composition.assets` 中登记。打开时再恢复成 `buildLocalFileUrl` 地址。
4. 原本地选择器通过 File 正文调用窄 IPC，在当前画布 `video/Picture/Audio` 目录创建真实文件；默认复制，不移动原文件，不在线上传。
5. “本地”出口真实编码后另存为；取消不生成结果节点。“画布”出口先写真实 MP4，再创建独立视频节点与合成来源连线。
6. 最后保存成功才关闭。写盘失败保留最新快照，关闭失败重新展开原内容，支持重试；磁盘确认状态不会被假的成功回执覆盖。

每次打开固定绑定合成节点ID；两个合成节点分别持有素材表、状态、端口及事务。保存/媒体/合成请求串行执行。原组件卸载释放其媒体；宿主释放端口、等待器、主题监听和观察器。已开始的主进程写盘不会被错误宣称“端口关闭即可撤销”。

主进程只接受正式宿主调用，文件名不允许目录跳转，正文单份上限256 MiB。另存为先写同目录随机临时文件再替换，不先截断用户目标文件。工程归档先收齐所有节点引用再改副本路径，修复共享媒体对象在遍历中被改成相对路径的问题。

## 实际运行结果

| 检查 | 结果 |
| --- | --- |
| `node scripts/verify-video-composition.js` | 55项通过；两端golden/反证、真实归档往返、34份资源指纹 |
| `node scripts/verify-canvas-project.js` | 通过；原工程格式、拖动模型、工作流LoRA等回归 |
| `pnpm typecheck` | 通过，包含渲染层和主进程 |
| `pnpm --filter @illusion-realm/electron check` | 通过，无新增类型逃逸 |
| `pnpm lint` | 通过，0 errors / 37项既有 warnings |
| `pnpm --filter @illusion-realm/next build` | 通过，正式静态导出 |
| `pnpm exec electron scripts/smoke-video-composition.js` | 最终21/21，退出0，源/产物指纹一致 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 146/146，退出0；随后仅精简/纠正注释与改进专项截图等待，不改变功能 |
| 冒烟约定、脚本引用、业务函数长度 | 通过；普通业务函数未超过30有效行 |
| 双语键与中英文i18n基线 | 通过 |
| `pnpm check` | 退出1：既有未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`；后续串联检查未执行 |

最终Next指纹：`eac9d2053074a6eddb5b56bf5bb51964446b57fddf2c7199908177c3f39569d0`。Electron专项与原画布回归串行执行，没有并发启动测试窗口或结束用户应用。

专项验证：正式入口原Vue加载；三类真实连线媒体；原输入编辑到实际JSON（图片0.8秒、缩放1.2）；复制/撤销；视频解码就绪且播放时间推进；故障期间磁盘保持、失败关闭保稿、重试真实写盘和刷新恢复；原素材选择器真实文件落入Picture；第二节点空状态隔离；空工程导出拒绝；主题/窄窗口；另存为取消/成功；成片节点/边回填；其他用户数据段保留；未发出外部网络请求，renderer错误列表为空。

真实成片重新经生产localfile协议解码，得到 **854×480、2.020136秒**。测试在原UI明确选择16:9和480P；没有把“原始比例保留小源尺寸”的行为误报为480P。用例仅覆盖短片，不能推广为所有输入格式或长视频均可导出。

## 证据与边界

[正式深色工作区](runtime/original-video-composition-2026-11-10/01-original-compositor-dark.png) · [浅色宿主/窄窗口](runtime/original-video-composition-2026-11-10/02-original-compositor-light-narrow.png) · [结果回填](runtime/original-video-composition-2026-11-10/03-canvas-result.png) · [真实短片](runtime/original-video-composition-2026-11-10/local-output.mp4) · [提供包原界面参考](runtime/original-video-composition-2026-11-10/reference-original.png)

截图来自正式Electron静态入口；参考图只代表用户资料原组件，未以它冒充幻域接入截图。原组件保持固定深色；浅色主题截图证明幻域宿主主题切换与边界，**不代表原组件已有完整浅色皮肤**。

| 类别 | 实际采用 | 不代表 |
| --- | --- | --- |
| 自动事件 | 原按钮/输入的DOM事件，Electron鼠标/键盘注入 | 人工鼠标手感、完整键盘与读屏验收 |
| 文件选择 | CDP给原file input设置真实磁盘File | 人工系统选择框、资源管理器实体拖入 |
| 媒体/持久化 | 真实PNG、MP4、WAV、生产localfile/preload、隔离JSON、实际成片编码与解码 | 任意用户文件或编码均兼容 |
| 返回夹具 | 系统另存为返回路径/取消、外壳账户空初始化 | 人工确认Windows对话框 |
| 故障注入 | 写盘前拒绝后检查旧文件和保稿恢复 | 磁盘满、断电、系统文件锁等真实故障均已实测 |

未验证：人工系统选择/拖入、扬声器试听、完整键盘/读屏/IME、Windows125%/150%系统缩放、多屏、长视频/4K/大批量素材、硬件编码、长时性能及安装包。此前人工待验继续保留。没有操作录屏；MP4是原合成器实际输出，不是操作录屏。

## 注释审计

以任务开始前工作区快照 `ir-composition-embed-_gmpp3zo` 为基线，不将其他已有修改计入本轮。新业务文件全文与原文件增量纳入；原样第三方供应资源、JSON数据、二进制媒体、文档、生成产物排除。original唯一适配改动另与提供包原件比较。HTML/CSS/TS/JS新增代码均纳入，混合行只计代码。

删除了重复及人为拆短的整段头部说明，保留职责、失败恢复、媒体归属、Vue文本节点保护和测试证据边界等有效说明。按逐文件扫描并复核，业务 **C124/B527 = 19.05%**；测试 **C68/B269 = 20.18%**，**均未达到70%，注释规范验收未通过**。没有用重复说明凑比例，也没有把第三方原件排除后误报为零业务分母。明细见[增量审计](runtime/original-video-composition-2026-11-10/comment-audit.json)。

有效说明示例：“资产表像货架目录：片段只记货号，换电脑时只更换目录里的地址”；“不替换Vue管理的文本节点，否则后续更新会找不到旧锚点”。前者解释便携工程引用机制，后者解释实际修复的原DOM更新边界。

## 保留限制

原编码器仍可能整份读取媒体；256 MiB只是正文导入/输出IPC上限，画布已有连线文件不经过该正文导入限制，但编码阶段仍有内存成本。没有搭建在线服务、任务云端、远程上传或新的数据库。继承的原功能不等于本轮逐项验证了每个效果、音轨混合或编码配置。工具箱的视频编辑器、导演台和其他未完成任务不由本轮改写状态。
