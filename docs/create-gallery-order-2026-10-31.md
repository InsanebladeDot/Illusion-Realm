# 创作页图库排序与批量改名

本次调整解决了图库标题和工具栏互相挤压的问题，并加入手动排序与可选批量改名。

## 交互

- 图库标题栏固定为单行；长文件夹名只占标题剩余宽度，超出显示 `…`，完整名称仍可通过悬停查看。
- 排序入口使用紧凑的上下箭头按钮。点击打开“图片排列”窗口，关闭或取消后返回图库；提示词组的排序箭头则负责自身的展开与收起。
- 排列窗口使用现有 `SortableList` 和 dnd-kit 手柄，拖动只改变显示顺序；点击“保存顺序”才写入用户文档。
- “批量重命名”默认关闭。打开后复用 EXIF 的 `RenameConfig`，可设置前缀、起始数字和方向，并在确认前预览旧名到新名的对应关系。
- 文件改名逐项调用现有图片文件接口。成功回执才会替换图库路径；部分失败会保留已完成结果并明确提示，不显示假成功。
- 缺图使用固定尺寸占位，长文件名省略；排序、命名和详情预览使用各自的真实文件身份。

## 数据与复用

`useHistoryFolderStore.imageOrderByFolder` 按实际目录路径保存已确认的图片路径队列，兼容旧用户文档。扫描到的新图片排到队尾，已删除路径自动跳过。窗口内的拖动草稿由 `useHistoryImageOrder` 独立维护，取消不会污染全局顺序。

排序窗口复用 `ResourceDialogShell`、`SortableList`、`LocalFileImage` 和 EXIF 的 `RenameConfig`。差异通过图片记录、路径队列、改名回调和当前目录参数注入；图片详情、多选、文件移动和 EXIF 元数据编辑仍保持各自业务边界。

## 验证

- `pnpm typecheck`：通过。
- `pnpm lint`：通过，33 条既有 warning，无 error。
- `pnpm --filter @illusion-realm/next build`：通过，28 个静态页面，并更新构建指纹。
- `pnpm exec electron scripts/smoke-prompt-assistant.js`：通过，66/66，包含提示词组紧凑箭头展开、收起和拖拽排序。
- `pnpm exec electron scripts/smoke-create-layout.js --history-move-only`：通过，25/25。使用真实临时 PNG 和正式文件接口验证了长标题省略、浅色/深色表面切换、窄窗口草稿保留、取消、纯排序持久化、非法前缀、真实批量改名、编号与拖拽身份对应及重载恢复。
- `pnpm check:locale-keys`：通过。
- `pnpm check`：主进程模块检查通过；门禁仍被工作区原有未引用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 阻断。

截图目录：

- `C:/Users/18305/AppData/Local/Temp/ir-create-layout-7HN38r/history-title-ellipsis.png`
- `C:/Users/18305/AppData/Local/Temp/ir-create-layout-7HN38r/history-order-dark.png`
- `C:/Users/18305/AppData/Local/Temp/ir-create-layout-7HN38r/history-order-rename-preview.png`
- `C:/Users/18305/AppData/Local/Temp/ir-create-layout-7HN38r/history-order-narrow.png`

本轮未验证真实用户目录权限、跨磁盘改名、文件占用导致的中途部分失败、触屏/触控笔和辅助阅读器播报；这些不由临时夹具推断为已通过。

## 注释率

按开工前快照 `C:/Users/18305/AppData/Local/Temp/ir-gallery-order-baseline-qyih0g_z/baseline.json` 对比本轮新增/替换行。快照未包含的两处，单独限定统计：`workspace-shell.css` 的图库工具栏规则（当前 243–261 行），以及 `check-history-move.js` 的长目录夹具注入（46–50、242–270 行）。不把这两个原有未跟踪文件的全文计成本轮新增。

- 业务代码：有效注释 632 行、代码 266 行，注释率 70.38%。
- 测试代码：有效注释 289 行、代码 111 行，注释率 72.25%。

| 文件 | 有效注释 C | 非空代码 B |
| --- | ---: | ---: |
| CreateHistorySidebar.tsx | 67 | 35 |
| PromptAssemblyPanel.tsx | 10 | 4 |
| useHistoryFolderStore.ts | 29 | 7 |
| userData.ts | 3 | 1 |
| zh-CN/create.ts | 20 | 17 |
| en/create.ts | 20 | 17 |
| RenameConfig.tsx | 18 | 6 |
| history-image-order.ts | 163 | 41 |
| history-image-order-dialog.tsx | 239 | 115 |
| use-history-image-order.ts | 49 | 18 |
| workspace-shell.css（限定规则） | 14 | 5 |
| smoke-create-layout.js | 6 | 1 |
| check-history-order.js | 258 | 101 |
| check-history-move.js（限定夹具） | 25 | 9 |

两类代码均达到项目要求；统计只计职责、边界、失败和验证含义明确的注释，没有把装饰性空行计入。

例如，用“座位名单”解释旧顺序、新文件与已删路径的合并；用“搬箱子收据”解释逐项改名及部分失败只回传真实成功结果。普通逻辑函数按有效代码行复核，不把 JSX 装配函数机械拆碎。

本轮仅重建 Next 静态产物，未重新制作 setup 安装包；已经安装的旧版本需要重新打包安装才能包含这些修改。
