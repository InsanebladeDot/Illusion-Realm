# 本地角色参考库与 Agent 工具

用户提供的 8,000 条 `character_data.ts` 记录现集中保存在 `packages/shared/src/data/character-reference.json`。原 TS 路径保留模块导出，不再往 `window` 写全局变量。主进程和创建页都经 `animadex:search` 使用同一搜索器；安装配置将 JSON 复制到 `resources/character-reference.json`。

## 四个分类

| 属性 | 含义 | 原值示例 |
| --- | --- | --- |
| `copyright` | 所属作品 | `the legend of zelda` |
| `gender` | 资料中的性别标签 | `1girl` |
| `hair` | 发色 | `blonde` |
| `eye` | 瞳色 | `blue` |

四项按交集筛选，值忽略大小写及下划线/空格差异，不猜中文译名。资料有误需要更正数据，工具不会从角色名自动“纠正”属性。`post_count` 只是参考热度，不是实时统计。

创建页默认“本地分类 · 在线资料”，保留在线库切换、收藏、多选、详情、触发词与 Tags 应用。性别、发色、瞳色、热门作品系列放在左侧可展开分类中，不再占用顶部工具条。右侧数量为整份本地资料中该分类的角色记录数，不是当前分页数量，也不是站点实时数量；作品按数量排序，默认展示前 30 项，输入作品名可搜索全部作品，当前已选作品不因离开热门列表而消失。

本地列表不批量请求封面。打开一个本地角色的详情后，才按原名查一次线上资料；姓名和作品规范化后必须都相同且只有一个匹配，才补充图片、推荐 LoRA 等展示信息。零匹配、多匹配或网络失败均保留本地标签并显示说明，不猜别名、不递归重试。收藏 slug、原名、作品与四属性仍以本地为准。原始性别标签直接应用，发色/瞳色分别转换为 `blonde hair`、`blue eyes`，缺失值不生成标签。本地没有时间戳，因此排序提供热度和 A–Z。

## Agent 最短查询方式

已知名字时直接调用 `search_characters`，无须先遍历分类：

```json
{"query":"princess zelda","copyright":"the legend of zelda"}
```

只描述外观也可以查询候选：

```json
{"gender":"1girl","hair":"blonde","eye":"blue"}
```

分类不确定时用 `list_character_filters`，如 `{"field":"hair"}` 或 `{"field":"copyright","query":"zelda"}`，将返回原值用于搜索。

`search_characters` 默认 `source=local`，至少一个非空条件，最多八个候选；`list_character_filters` 最多三十项。两者返回总数及截断标记，不能将摘要说成完整清单。在线来源只支持姓名和作品，外观过滤会明确拒绝。

`null` 和 `missingFields` 表示资料未知，不允许推断颜色或别名。按姓名识别无结果或多结果时返回 `needsConfirmation=true`，既有 Agent 执行器直接询问用户。仅按分类浏览时多个候选是正常结果，应展示候选让用户选择。`zelda` 并不是库中的唯一原名，不可擅自改写为 `princess zelda`。

角色资料与模型权重分开：角色存在不证明本机有同名 LoRA，实际生成仍需核查模型清单与主模型兼容性。工具提示与结构化结果减少无依据回答，不能保证聊天模型永不产生幻觉。

## 验证入口

- `pnpm exec electron scripts/verify-character-reference.js`：真实资料、四属性、身份歧义、未知值、分类、分页、输入校验、离线查询不联网。
- `node scripts/verify-agent-controls.js`：显式在线来源兼容与既有取消边界。
- `python scripts/fixtures/agent-controls-check.py`：执行预算及角色确认控制。
- 先构建静态导出，再单独执行 `pnpm exec electron scripts/smoke-characters.js`：本地筛选和标签应用，以及原在线交互回归。

这些检查不调用付费聊天模型或实际生成图片。安装资源映射已添加；新的完整安装包需要重新打包后才能包含这份资料。

## 上一阶段验证记录（2026-10-26，工具与本地资料接入）

真实资料回归、在线兼容/取消回归、Python 执行控制三项测试、静态导出构建均通过。创建页 Electron 冒烟最终 **107/107**，涵盖本地四属性、精确原名、标签应用、反向空结果，以及在线库原有收藏、多选、复制、分页、详情、主题和宽窄布局。8,000 条 JSON 记录与修改前 TS 数组逐条比对一致。

旧冒烟的 1100px 视口断点预期已改为读取主区的 760px 阈值，并使用 800px 窗口验证宿主替换；主题检查等待实际 data-theme 与详情颜色过渡均完成，精确颜色断言保留。

ESLint 为 0 错误、33 个既有警告；中文逃逸、英文额度及双语言键一致检查通过。`pnpm check` 已执行，但在既有门禁自检失败处停止，输出列举了 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 等未引用词条，因此不能称全项目门禁通过；自检仅展示前三个例子，不表示仅有三项。

注释统计使用本轮修改前快照确定增量，TypeScript AST 的注释范围与 JSX 注释、Python tokenize/AST 识别有效注释；纯 JSON 数据、词条、文档与生成物排除。15 个业务/测试文件分别均达到 70%；业务 12 文件合计 404 注释行 / 141 代码行，74.13%；测试 3 文件合计 234 / 94，71.34%。统计按技能要求只计算新增/修改行及直接关联说明，不将整个历史文件的注释拿来抵扣。

本轮没有调用真实聊天供应商确认模型遵循率，也没有重新生成安装包；工具与 UI 流程通过不代表能保证语言模型永不幻觉。

## 侧栏分类与线上资料整合（2026-10-26）

- 性别、发色、瞳色、热门作品均改为左侧可展开列表，使用本地整库计数；作品可搜索，多条件取交集。
- `verify-character-reference.js` 已通过真实计数与严格资料合并回归：错误作品、不同姓名和重复候选拒绝合并，匹配时保留本地身份与标签。
- 类型检查、静态导出、ESLint（0 错误、33 个既有警告）、中英文词条检查通过。`pnpm check` 仍被上述既有未引用词条门禁阻塞。
- 普通启动的界面冒烟两次为 106/109；禁用原生遮挡检测的一次为 104/109，涉及收藏过渡及主题颜色。新增诊断记录到状态已展开但动画 `running/currentTime=0`、页面仍为 `visible`，因此不能把原因简化成未触发点击，也未修改断言掩盖失败。
- 使用软件渲染与取消帧率上限，单独执行 `pnpm exec electron --disable-gpu --disable-frame-rate-limit scripts/smoke-characters.js` 后 **109/109** 通过；实际窗口截图已复核。这个结果不证明默认 GPU 路径的时间线停滞已修复，产品启动参数未改变。
- 线上整合验证使用确定性替身；公网探测收到 403，未确认真实线上服务可用。缺少唯一匹配或网络失败时保留本地资料。
- 本轮按修改前快照、语法注释范围与直接关联注释统计 10 个业务/测试文件，逐文件均不低于 70%。业务 8 文件为 232 注释行 / 81 代码行（74.12%）；测试 2 文件为 102 / 33（75.56%）。纯数据、词条和文档排除，模板字符串内注释文字按代码计。

## 采用参考工具的角色与背景筛选（2026-10-26）

参考 `comfyui-anima-tools` 的分类语义实现，未复制外部工具代码或导入第二份资料。角色使用本地 8,000 条记录，背景继续使用项目已有的 1,087 条原始资料，按既有规则排除重复、占位及空项后为 1,056 条可用记录。

| 库 | 侧栏分类 | 组合规则 |
| --- | --- | --- |
| 角色 | 性别、发色、瞳色、热门作品 | 每项单选，四项取交集；作品默认前 30 项，搜索覆盖完整作品集合 |
| 背景 | 自然与户外、都市与日常、幻想与科幻、极简与纯色 | 场景可多选，命中任意场景即可 |
| 背景特征 | 从数据中的 `traits` 动态统计，如室内、夜晚、雨天 | 特征可多选，必须全部命中，再与场景结果取交集 |

两库复用 `LibraryFacetSection` 与 `LibraryFacetOption`，背景沿用现有弹窗、卡片、分页和标签应用。计数基于可用整库，不随当前页或其他条件变小。清除分类保留搜索和选择；“只看已选”展示完整选择草稿，不被原搜索、分类或所在分页裁掉。背景特征的中文优先来自源资料中严格对齐的双语标签，缺少可靠译名时保留原值。

### 本轮验证

- `node scripts/verify-library-filters.js` 通过：真实背景资料的场景并集、特征交集、计数、旧分类兼容、跨页已选对象和热门作品完整搜索。
- `pnpm exec electron scripts/verify-character-reference.js` 通过：角色真实资料与四属性查询。
- 类型检查、静态导出、ESLint（0 错误、33 个既有警告）、中文逃逸、英文额度与中英文键一致检查通过。
- 使用 `--disable-gpu --disable-frame-rate-limit` 单独启动角色冒烟，**111/111** 通过；未改变产品启动参数，不表示默认 GPU 时间线问题已修复。
- 背景页面专项 **8/8** 通过，实际点击侧栏分类、清除、多页选择并确认源 Tags 写入创建页。真实窗口截图已复核。PowerShell 运行方式：

```powershell
$env:LIBRARY_FILTER_ONLY = '1'
pnpm exec electron --disable-gpu --disable-frame-rate-limit scripts/smoke-prompt-assembly.js
Remove-Item Env:LIBRARY_FILTER_ONLY
```

- 完整 `smoke-prompt-assembly.js` 两次单独运行均在背景用例之前中断：测试未注入自定义顶栏参数，却断言顶栏主题入口并尝试点击该入口。保留默认完整套件及其断言；专项入口不使完整套件变绿。
- `pnpm check` 的类型和主进程验证通过，最终仍停在既有未引用词条门禁，输出示例含 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`，不能称全项目检查通过。
- 基于本轮开工前快照，使用 TypeScript AST 注释范围及 JSX 注释识别统计增量，11 个业务/测试文件逐个达到 70%。业务 7 文件：261 注释行 / 101 代码行，**72.10%**；测试 4 文件：205 / 82，**71.43%**。词条、纯数据、文档及构建产物排除，字符串中的文字不计作注释。

本轮验证针对本地分类和页面交互，未验证公网预览可用性、真实聊天供应商调用或新安装包。

## 本地角色与网络封面关联（2026-10-30）

本地 8,000 条角色记录仍负责姓名、作品、性别、发色、瞳色和提示词；封面按参考工具的资源规则关联：`https://blobs.animadex.net/Outputs/thumbs/{encodeURIComponent(姓名 + ", " + 作品)}.webp`。文件名保留源资料的拼写，包含斜杠等字符时整体编码。`hasImage` 不因可推导地址而标记为已确认，来源页面与本地 LoRA 信息也不伪造。

创建页继续使用 `CharacterCard → LibraryCard`，复用懒加载、选择、收藏与缺图占位；没有另写卡片、逐卡查询搜索 API、额外磁盘缓存或新增 IPC。点击详情才用现有线上搜索补资料，仅唯一姓名与作品匹配可合并；线上媒体优先，线上媒体为空时保留关联封面，详情坏图回落占位。Agent 继续走精简本地身份检索，不返回封面或增加在线查询轮次。

修改涉及 `local-catalog.js`、渲染工具 `characters.ts`、详情 hook 与 `CharacterDetailDialog.tsx`；回归复用 `verify-character-reference.js` 和 `smoke-characters.js`。

- `pnpm typecheck`、主进程 `check`、静态导出构建和离线角色回归通过；ESLint 为 0 错误、33 个既有警告。
- 真实静态页面冒烟 **114/114**，覆盖本地封面解码和懒加载、不逐卡调用线上搜索、坏图占位、四属性筛选、线上详情合并、提示词插入、收藏、分页、深浅主题及宽窄布局。使用 `--disable-gpu --disable-frame-rate-limit`，未改变产品启动参数。
- 首次冒烟 113/114：测试用 HTTPS 重定向到 data URL 被浏览器拦截；改为测试协议直接返回图片字节后重跑通过。正式图片关联实现不依赖该测试替身。
- 截图来自真实窗口，但 CDN 图片使用统一的测试夹具，不能作为角色图准确性的证明：`C:/Users/18305/AppData/Local/Temp/ir-character-previews-shots/sidebar-local.png`。
- 公网样例在浏览器形式的请求下返回 `200 image/webp`；无浏览器请求头的探测和线上搜索 API 曾返回 403。未验证全库远端收录率、所有用户网络环境、真实生成或新安装包；失败时本地标签仍可使用。
- `pnpm check` 在既有未引用词条门禁停止：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；后续链路未执行，不宣称整套通过。

注释率以本轮修改前快照为基线，按新增/替换行分类并人工复核，文档和构建产物不计。业务 4 文件为 C=31、B=10，**75.61%**；测试 2 文件为 C=77、B=33，**70.00%**。说明覆盖完整身份编码的原因、候选 URL 不代表资源存在、网络失败的 UI 边界，以及坏字节夹具与空 URL 的不同检测能力。
