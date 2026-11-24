# 侧栏品牌首行与下载核对提示

2026-11-15。本次只移动侧栏品牌入口，并解释自动下载的逐文件处理结果；保留工作区已有修改。

## 侧栏怎么变化

- 展开：第一行显示原 Sparkles 图标、Illusion Realm 名称和侧栏开关。
- 收起：这一行只显示开关，点击或键盘 Enter 都能恢复展开。
- 使用原 `useSidebarStore`、开关词条、图标、主题色和 `window-caption-action`；不新建导航状态或窗口操作。
- 原宽度继续为展开 158.75px、收起 68px，主区留白同步。品牌文字缩到 12px 以适应原宽度，不额外扩大导航。
- 标题栏继续提供窗口拖动、目录门牌、账户、任务和系统控件。登录页仍是无标题的简洁窗口栏；820px 以下沿用隐藏桌面导航的规则。

![展开](../screenshots/sidebar-header-2026-11-15/sidebar-expanded-light.png)

![收起](../screenshots/sidebar-header-2026-11-15/sidebar-collapsed-light.png)

![深色收起](../screenshots/sidebar-header-2026-11-15/sidebar-collapsed-dark.png)

## 为什么这一组只下载一个、全部只下载两个

本机检查发现 VAE 已经位于工作流指定位置。实际重算 SHA256 得到 `a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f`，与固定清单一致；主模型与文本编码器缺失。因此依赖组只需下载文本编码器，全部下载只需主模型和文本编码器。

下载数量符合补缺规则，原界面的问题是跳过原因远离文件行，容易误以为漏下了文件。本次调整：

- 每个文件旁直接显示尚未核对、等待、进度、暂停、失败，或“文件已存在，SHA256 校验通过，无需下载”。
- 清单上方显示本次核对数量、新入队、沿用任务、已存在和失败数量，排队不冒充正在传输。
- 进度文案直接复用下载中心 `DownloadSummary`，暂停和重试仍在原下载中心。
- 队列匹配使用完整目标路径，不能只靠同名文件。当前清单打开期间保留同一 models 目录各组的结果；换目录后隐藏旧目录核对结果。
- 关闭并重开清单可恢复队列的实时状态，但磁盘核对结果需要再次点击下载核对，不把旧检查当成永久有效。

下图是隔离小文件测试，用于证明真实 SHA256 核对和逐文件展示；不是官方 GB 级权重已安装的证据。

![核对汇总](../screenshots/sidebar-header-2026-11-15/automatic-existing-summary.png)

![已存在的 VAE](../screenshots/sidebar-header-2026-11-15/automatic-existing-vae.png)

## 实际改动

| 文件 | 职责 |
| --- | --- |
| components/Sidebar.tsx | 品牌与开关移入首行，按原 store 展开或收起 |
| components/window-titlebar.tsx | 移除旧品牌与开关，保留窗口和业务工具 |
| components/model-download-list.tsx | 导出原 DownloadSummary，两个入口共用文案 |
| components/setup-download-file.tsx | 逐文件匹配真实任务，解释已存在与失败 |
| components/setup-download-panel.tsx | 放入逐文件组件和本次核对汇总 |
| hooks/use-setup-downloads.ts | 保留当前目录各组结果，区分最近一次提交与文件状态 |
| i18n/locales/{zh-CN,en}/components.ts | 同步核对汇总和文件状态的双语文案 |
| scripts/smoke-setup-checklist.js | 侧栏真实鼠标、键盘、主题和已存在文件回归 |
| scripts/smoke-create-layout.js | 更新侧栏入口位置，增加 --shell-only，旧五项预期改为当前六项导航 |
| scripts/smoke-login.js | 游客进入后检查侧栏品牌与标题栏工具 |
| scripts/smoke-profile-ui.js | 从实际外壳变量读取展开宽度，用布局矩形判断隐藏 |

渲染文件路径均相对于 `apps/next/src/`，脚本路径相对于仓库根。没有改动下载传输器、固定摘要、主进程、IPC、模型文件或真实下载库。

## 验证记录

| 命令 | 本次结果 |
| --- | --- |
| pnpm typecheck | 通过 |
| pnpm lint | 0 错误，37 条已有警告 |
| pnpm check:locale-keys | 中英键一致 |
| pnpm check:i18n / pnpm check:i18n:en | 通过 |
| node apps/next/scripts/verify-i18n-values.mjs --base HEAD | 无可疑文案拆分或改写 |
| pnpm --filter @illusion-realm/next build | 成功静态导出，最终源码指纹 e1db9d107d84 |
| pnpm exec electron scripts/smoke-setup-checklist.js --automatic | 21/21：821/900/1240px 实际点击、键盘恢复、深浅主题、窄窗口、原下载中心 |
| pnpm exec electron scripts/smoke-setup-checklist.js --automatic --present | 18/18：实际小文件 SHA256、依赖组新增 1 个、全部共 2 个任务、VAE 字节保留 |
| pnpm exec electron scripts/smoke-setup-checklist.js | 34/34：手动文档、预览、全屏、导航、英文、读取失败重试 |
| pnpm exec electron scripts/smoke-create-layout.js --shell-only | 13/13：创建页分栏、导航密度、标题栏中线和主区几何 |
| pnpm exec electron scripts/smoke-login.js | 52/52：简洁登录栏、游客进入/退出、尺寸、DPR 和持久化 |

Electron 专项全部串行，使用隔离用户目录。首轮键盘夹具缺少页面焦点与字符事件，补齐真实 Enter 序列后通过；创建页旧断言仍写五个导航入口，已按当前六个入口修正后通过，没有放松尺寸检查。

未覆盖：完整 profile-ui 套件、全量 pnpm check、官方权重完整下载与真实 ComfyUI 生成。本次不提交或上传 GitHub。

## 注释审计

任务开始的副本基线为 `ir-setup-download-status-baseline-20261115`；hook 的基线依据本轮编辑前读取内容恢复。新增文件统计全文，已有文件只数本次新增与替换后的行，不计删除行和未变更上下文。

TypeScript 语法树提取注释、区分纯注释与混合行，再人工核对有效说明，逐文件明细见 [审计 JSON](./sidebar-header-download-status-comment-audit-2026-11-15.json)。

- 业务：C=9，B=71，11.25%。
- 测试：C=12，B=64，15.79%。

低于 20%–30% 参考：保留了目录归属、哈希核对、分组结果与隔离夹具的必要说明，其余是原能力复用与 JSX 装配，不为比例补重复注释。本次新增的普通逻辑函数和修改的下载 hook 已检查，不超过 30 行有效代码；JSX 装配不机械套用该限制，原冒烟入口未因新增一个专项分支而整体重构。
