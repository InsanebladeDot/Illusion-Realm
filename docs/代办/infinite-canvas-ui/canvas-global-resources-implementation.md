# 全局资源库、分类引用与手动删除（2026-11-14）

## 已实现与使用方式

1. 打开画布底部“导入本地素材”，在原窗口切换“工程素材 / 全局资源库”。全局库允许混合多选图片、视频、音频，默认复制，保留外部原件；导入库本身不创建节点或连线。
2. 点击“多选”后，“全选”选中当前筛选结果，再点一次全部取消。切换分类/来源清空选择。删除先确认，成功项移入**系统回收站**；部分失败明确显示提示并重新读取清单，不把隐藏卡片当作删除成功。
3. 提示词输入 `@` 后复用原分类菜单；也可直接输入 `@/资源库/`、`@/图片/` 搜索。音频节点的画布内分类为 `@/音频/`。分类路径不进入最终提示词。
4. 选择后显示原编辑器的固定缩略图和文件名前缀，正文仍保存稳定编号。MiniMax预览/转换沿用 `<Picture N>`、`<Slot N>`；原通用组件的 `<Video N>` 协议保留。本轮画布视频模板仍只接图片参考，未扩展它的多模态输入契约或接通视频生成执行。
5. 选择库素材只增加当前节点附件；不会增加边、不会复制成另一份节点，也不会把整个候选库上传。已有相同路径复用编号；本地与非本地的图片输入上限继续生效，音频仍为单槽。

## 真正复用的调用关系

| 基准 | 本轮接入 | 独立边界 |
| --- | --- | --- |
| `LibraryCard` | 工程素材和全局资源共用卡片 | 数据来源、删除权限由画布服务负责 |
| `CanvasChip`、`SegmentedControl`、原画布浮层 | 选择、全选、筛选、删除确认 | 不复制卡片或按钮样式 |
| `ImageReferencePrompt` → `usePromptMediaMentions` → `PromptMediaMenu` | 图片、视频、音频节点共用原输入、光标、键盘和菜单 | 增加可选分组和选择回调；创作页不传时保留旧类别行为 |
| `useCanvasPromptMedia`、原预览/转换器 | 实际输入与MiniMax编号表 | 全局库是候选，明确选择后才进入输入表 |
| `importAssets`、`canvas_resource` | 全局库沿用复制器和SQLite资源台账 | 未另建重复媒体表、上传器或图引擎 |
| `canvasLibrary`、现有preload方法 | 扩展原业务操作联合 | 通道名称和 `IpcResult` 不变；shared和主进程校验同步 |
| 原工程保存、`nodeReferences` | 节点附件原样保存、重开、依赖检查 | 不增加第二份全局提示词草稿 |

## 文件与数据位置

```text
user/Infinite Canvas/
  library.sqlite                      # 原子资源台账和工程目录表
  .global-resources.json              # version=1，仅记录全局抽屉的id和folder
  Resource Library/                   # 同名目录已存在时沿用原分配器加独立后缀
    .canvas-owner
    Picture/...
    video/...
    Audio/...
  <工程目录>/project.sqlite            # 当前节点持有附件引用
```

媒体正文仍在文件系统，不进SQLite。全局目录没有 `project.sqlite`，不会被工程发现逻辑误登记成一张画布。资源条目仍用已有 `canvas_resource`；新增按workspace筛选的命名SQL，复用已有索引，无数据库迁移。

`.global-resources.json` 是带版本的归属指针，不是另一份资源清单；丢失或损坏不能靠同名目录猜归属。全局库常驻保留，不参与单画布关闭后的24小时无引用回收。项目内原有自动回收规则保持原样。

## 删除保护

- 手放/未知归属文件不因“无引用”而自动删除。本轮只允许用户明确勾选、确认后手动回收指定文件，不给其他未知文件补登记或自动删权。
- 删除前重新列清单、比对文件身份、核对归属和祖先目录，拒绝重复目标、目录链接、越界路径和已变化文件；先整批预检，再逐项系统回收。
- 当前未保存草稿的附件也算依赖；全部未删除工程的保存数据也参与检查。仍有其他打开/挂起工作区时保守阻止，避免漏掉它们未保存的引用。
- 读取其他工程失败时不能视为空工程。删除已引用资源前需要移除引用并保存；原撤销栈不能恢复已手动回收的正文，文件恢复使用系统回收站。
- 文件操作和回收复用现有主进程队列；渲染层只提供明确选择，不持有任意磁盘删除能力。操作失败保持错误边界，关闭窗口不再调用卸载组件的完成回调。

## 实际验证

最终静态产物指纹：`5fe5dc72ef2e6c73a2bb4e6e39545f2cdb91b2be49ed9000d308b489724a9ddb`，1139个构建输入。所有Electron检查串行执行，测试文件使用独立临时目录，未删除用户实际工程文件。

| 运行命令 | 实际结果 |
| --- | --- |
| `pnpm typecheck` | 退出0；最终Next构建再次通过TypeScript |
| `pnpm --filter @illusion-realm/electron check` | 退出0，无ts-nocheck逃逸 |
| `pnpm lint` | 退出0，0错误/37项旧警告 |
| `pnpm --filter @illusion-realm/next build` | 退出0，静态导出并记录新指纹 |
| `pnpm check` | 退出1：原三个未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`；此前typecheck/verify通过，后续未执行不算通过 |
| `pnpm check:i18n`、`pnpm check:i18n:en`、`pnpm check:locale-keys` | 分别退出0，双语键一致 |
| `pnpm check:smoke`、`pnpm check:refs` | 分别退出0，冒烟约定和脚本引用有效 |
| `pnpm exec electron scripts/verify-canvas-global-resources.js` | 退出0，6/6组独立反证检查 |
| `pnpm exec electron scripts/verify-canvas-resources.js` | 退出0，原自动回收9/9组 |
| `$env:CANVAS_GLOBAL_RESOURCES_SMOKE='1'; pnpm exec electron scripts/smoke-infinite-canvas.js` | 退出0，最终14/14 |
| `$env:CANVAS_PROMPT_SMOKE='1'; pnpm exec electron scripts/smoke-infinite-canvas.js` | 退出0，最终34/34 |
| `pnpm exec electron scripts/smoke-minimax-audio.js` | 退出0，原创作页19/19，包含旧@分类与真实音频播放 |
| `pnpm exec electron scripts/smoke-infinite-canvas.js` | 退出0，最终149/149，包含复制删除、参数独立、媒体播放、资源释放、深浅主题、窄窗和工程导入导出 |

存储反证覆盖：跨画布/重启可见、三类批量复制、原件不动、24小时不回收全局库、当前无连线附件/其他工程依赖保护、其他租约保护、身份过期、重复/越界/目录链接拒绝、只回收明确选中的未知文件，以及部分回收失败。

证据分开报告：

- **自动事件**：CDP选择真实PNG/MP4/WAV文件、DOM/Electron输入操作正式页面、生产IPC和SQLite；截图来自实际静态页面。系统回收站成功路径真实执行。
- **mock / 注入**：存储检查用小字节文件验证路径和身份，不冒充媒体解码；部分回收失败明确注入；音频生成回包和提示词转换服务使用旧测试夹具，不代表真实GPU推理或付费接口验收。24小时用主进程时间注入，不是实等一天。
- **人工**：本轮没有人工Windows选择框、实体鼠标/输入法、扬声器、视觉相似度或真实模型验收。之前全部人工待验继续保留；视频生成执行仍未接通，既有Meta阻塞也未处理。

中间失败均保留：首次全局窗口测试在读取未结束时点击禁用控件；普通填值助手主动失焦关闭了@菜单；保存断言误把显式保存当自动保存。修正了测试前提。提示词专项两次因窗口内容1000px、离屏页面1001px的实测差异失败，改为读取实际内容区并只给1px舍入容差，控件避让仍严格检查。完整回归首次也点击了读取中的禁用导入按钮，改为等待真实可用后最终149/149。早期12/12不替代最终14/14，失败记录不计入成功数。

## 截图

![全局库批量选择](runtime/canvas-global-resources-2026-11-14/global-130-global-library-selected-dark.png)

![复用原菜单选择全局图片](runtime/canvas-global-resources-2026-11-14/global-131-image-global-mention.png)

![无连线引用和官方标记预览](runtime/canvas-global-resources-2026-11-14/global-132-image-direct-reference.png)

![浅色窄窗口](runtime/canvas-global-resources-2026-11-14/global-133-global-library-light-narrow.png)

## 增量注释和性能限制

以 `logs/canvas-global-resources-baseline` 任务起点快照统计；新增文件全文、已有文件仅统计本轮新增/替换后的物理行，删除和旧上下文不计。冒烟总入口未在初始广域快照中，按唯一新增的专项分派行还原基线并注明。按语法候选和人工复核用途统计，类型专用JSDoc及装饰行不凑有效说明。

业务有效说明37行、代码435行，**7.84%**；测试有效说明14行、代码256行，**5.19%**。低于20%–30%参考：增量含较多类型、参数化JSX和直接断言；已复核归属、依赖、异步过期、操作失败和mock边界说明，不用重复解释凑数。见[逐文件审计](canvas-global-resources-comment-audit.json)。新增/修改的普通逻辑函数≤30有效物理行；JSX装配豁免，原冒烟main的31行与任务起点相同，未借此修改范围外代码，见[函数审计](canvas-global-resources-function-audit.json)。

- 清单最多返回2000条并提示截断，全选仅作用于当前可见分类；目录遍历深度沿用8层上限，未做大目录窗口化或缩略图缓存改造。
- 导入每批200个，超过时顺序分批；每批复制及台账操作不具备跨批文件事务，失败会保留成功项并给出错误，不能自动回滚用户成果。
- 库读取使用Zustand共享缓存和请求合并，节点移动只订阅媒体对象，候选分组memo化；实际生成仍只读已选择的附件。
- 手动删除为保守正确性读取全部保存工程依赖，成本随工程数增长；没有做万级素材、超长路径或大量4K视频性能承诺。
- 文件身份检查不是对其他程序的独占锁；系统回收站与SQLite不是跨系统事务，故逐项报告部分失败，不声称断电原子回收。文件被外部同时替换、系统回收后数据库写失败仍可能需要用户人工核对。

只完成本轮资源库与删除需求，没有提交、上传或合并GitHub，也未继续扩展保存/导出业务。
