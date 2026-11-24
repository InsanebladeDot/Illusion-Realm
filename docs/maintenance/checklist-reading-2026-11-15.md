# 清单看图返回与全屏阅读

看大图时，原实现关闭并卸载清单正文，返回后重新创建的原生 details 默认折叠，滚动位置也丢失。现在保留原正文实例，只暂停外壳显示与事件监听；预览关闭后回到原展开项、勾选和滚动位置。

清单右上角新增「全屏阅读 / 退出全屏」图标。全屏铺满标题栏下方的应用内容区，不改变操作系统窗口状态；全屏与浮窗共用同一正文，来回切换不折叠任务。全屏看图后也回到全屏。

## 复用与改动

- `WindowTaskPanel` 增加可选暂停、全屏状态及图标回调，清单传入这些参数。暂停时使用 hidden、inert 和 display:none，移除 Escape、外侧点击监听，恢复时聚焦不滚动。
- `SetupChecklist` 保留打开状态，看图只切换暂停状态，直接复用现有 `ImagePreviewOverlay`。
- 下载、生成入口不传新参数，保持原默认外观与退出逻辑。
- 新增两个中英文按钮词条，Markdown 正文与任务配置不变。

## 验证

```powershell
pnpm --filter @illusion-realm/next build
pnpm exec electron scripts/smoke-setup-checklist.js
pnpm check:locale-keys
pnpm check:i18n
pnpm check:i18n:en
```

构建及构建内 TypeScript、目标文件 ESLint、脚本语法、双语键及文案检查通过。静态产物指纹：`cdb10aa1156049648a31d2f5af978b59d35919b83a1181aedadc79b980152a92`。

Electron 专项 **33/33 通过**，包括原有清单流程、新增浮窗和全屏预览返回、DOM 实例与滚动位置保持、两项展开状态、Escape 和预览关闭按钮、退出全屏、深浅主题、窄窗缩放，以及共用下载和生成面板的默认行为。离屏测试使用独立临时用户目录；用户已运行的幻域未关闭或修改。

目视核对实际截图：[浅色全屏](runtime/checklist-reading-2026-11-15/checklist-fullscreen-light.png) · [深色全屏](runtime/checklist-reading-2026-11-15/checklist-fullscreen-dark.png) · [窄窗全屏](runtime/checklist-reading-2026-11-15/checklist-narrow.png)。

[专项日志](runtime/checklist-reading-2026-11-15/smoke.log) · [构建日志](runtime/checklist-reading-2026-11-15/build.log)

前两次验证的尺寸断言误用浮点坐标严格相等，修正为等待稳定尺寸并允许不足 1 CSS 像素的舍入误差后通过；未放宽展开或滚动保持要求。过程摘要保留于 `logs/smoke-runs.log`。未运行全仓库完整检查、实体窗口遮挡或真实下载推理。

## 注释审计

基线为本轮编辑前工作区快照；仅统计新增、替换行，删除和既有修改不计。TypeScript AST 识别后人工核对注释内容。

| 文件 | 有效纯注释 C | 非空代码 B |
| --- | ---: | ---: |
| setup-checklist.tsx | 1 | 4 |
| window-task-panel.tsx | 1 | 11 |
| zh-CN/components.ts | 0 | 2 |
| en/components.ts | 0 | 2 |
| smoke-setup-checklist.js | 2 | 33 |

业务 **9.52%（2/21）**，测试 **5.71%（2/35）**。局部 UI 参数接入和直接断言占主要行数，已说明保留 DOM、暂停监听和共享入口边界，不加重复说明凑比例。普通逻辑函数未超过 30 有效行。

[逐行审计](runtime/checklist-reading-2026-11-15/comment-audit.json)
