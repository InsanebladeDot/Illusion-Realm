# 顶栏图文任务清单

顶栏新增清单图标，提供两份可展开、逐步勾选的指南：下载 Anima 主模型并确认存放位置；补齐工作流使用的 VAE 和文本编码器。勾选在本次应用会话内跨页面保留，重新启动后重新核对，不代表自动检测或安装成功。

## 内容维护

正文、步骤标题、截图与链接全部来自 Markdown，不在组件或语言词条中重复维护：

- [主模型下载和存放](../../apps/next/public/guides/anima/zh-CN/model.md)
- [VAE、文本编码器](../../apps/next/public/guides/anima/zh-CN/dependencies.md)
- [维护说明](../../apps/next/public/guides/anima/README.md)

`#` 是清单名称，`##` 是一个可勾选步骤，其余正文使用已有 Markdown 阅读器。英文文件位于相邻 `en` 目录。三个路径占位符从 Anima 标准工作流读取默认路径，避免教程和工作流各维护一份路径。

清单区分模型根目录、下载时按分类建立的真实目录，以及工作流的默认路径。说明 CLIPLoader 是节点名称，本清单将配套文本编码器放到 `models/text_encoders`。远端 ComfyUI 的文件必须放到服务器一侧，幻域本地路径设置不承担上传。

## 复用和边界

- 外壳直接复用 `WindowTaskPanel`，保留主题、滚动、窗口边界、点外侧关闭及 Escape 返回入口。
- 正文复用 `MarkdownResponse`，仅增加可选组件插槽；清单注入应用内链接和随包截图，Agent 继续使用原有默认组件。
- 截图直接复用 `ImagePreviewOverlay`，可放大和拖动，看完返回清单。
- Markdown 阅读依赖在打开清单时按需加载；文档请求支持取消、8 秒上限、明确失败反馈和重试。换语言时不显示旧语言的响应。
- 勾选使用独立会话 Zustand store，不写入设置、SQLite 或模型安装状态。
- 未改下载器、IPC、凭据和工作流请求；用户确认本轮只做指南，没有下载模型权重。

三张教程截图均从幻域实际页面采集，模型名称、版本及示例目录来自隔离教学夹具；不声称真实站点返回了这些数据。WebP 总计约 149 KiB，可点击看大图。Anima 项目说明链接沿用项目已有资料地址，本机网络未能验证 Hugging Face 连通性。

## 实际验证

```powershell
pnpm --filter @illusion-realm/next build
pnpm exec electron scripts/smoke-setup-checklist.js --capture-guides
pnpm exec electron scripts/smoke-setup-checklist.js
pnpm exec electron scripts/smoke-agent-vision.js
pnpm check:locale-keys
pnpm check:i18n
pnpm check:i18n:en
node apps/next/scripts/verify-i18n-values.mjs --base HEAD
```

截图生成后重新构建，再运行最终冒烟，构建指纹 `eecd86d7a32ca504d8fe5a6ad4b1d8cf251de5a4e06107587d938cac3e4ec147`。构建内 TypeScript、全部本轮修改文件 ESLint、脚本语法及语言检查通过；既有中文词条无可疑改写。

- 清单专项 **21/21 通过**：两份文档、路径与工作流一致、全部截图解码、勾选及取消、跨页面保留、大图返回、跳转、深浅主题、中英文正文、650px 窗口边界、Escape、切换下载中心、真实 Markdown 请求失败与重试，且未请求模型权重。
- Agent 原入口回归 **14/14 通过**：原默认 Markdown 阅读、长回复滚动、发送图片、追问、停止与菜单未受清单插槽影响。使用本地替身，不调用付费服务。
- 逐一目视核对教程三图及最终清单的深浅主题、窄窗截图。两套 Electron 冒烟串行运行，均使用隔离目录和新鲜静态产物。

[浅色清单](runtime/setup-checklist-2026-11-15/checklist-light.png) · [深色清单](runtime/setup-checklist-2026-11-15/checklist-dark.png) · [窄窗](runtime/setup-checklist-2026-11-15/checklist-narrow.png) · [英文](runtime/setup-checklist-2026-11-15/checklist-english.png) · [截图大图预览](runtime/setup-checklist-2026-11-15/checklist-image-preview.png)

[专项日志](runtime/setup-checklist-2026-11-15/smoke.log) · [Agent 回归](runtime/setup-checklist-2026-11-15/agent-regression.log) · [构建](runtime/setup-checklist-2026-11-15/build.log) · [截图采集](runtime/setup-checklist-2026-11-15/capture.log)

未跑全仓库完整检查、实体窗口遮挡及真实模型下载/推理；局部验证不代表全仓库门禁通过。早期截图采集的缺少夹具通道及过期产物前置失败已修正，最终采集和验证日志为上述归档；过程摘要保留在 `logs/smoke-runs.log`。

## 注释审计

基线为本轮开始前的工作区快照，已有修改保留。新增文件计全文，修改文件仅计本轮新增与替换行；Markdown、图片不纳入源码统计。通过 TypeScript AST 识别注释后人工复核用途、取消、错误、会话状态、测试夹具和路径填充说明。

业务有效纯注释 C=14、非空代码 B=152，**8.43%**；测试 C=4、B=198，**1.98%**。本轮主要是展示装配、静态文案登记和直接界面断言，已说明不明显的边界，不补重复注释凑比例。新增普通逻辑函数均在 30 行以内。

[逐文件、逐行统计](runtime/setup-checklist-2026-11-15/comment-audit.json)
