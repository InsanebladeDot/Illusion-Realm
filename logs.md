# 改动日志

## 2026-09-23 — 表情库：把「功能组」做成数据驱动的一条复用路径

用户给了表情数据集（`apps/next/src/data/prompt/expression.ts`：124 条，字段是
`object` / `attribute` / `displayName` / `langName` / `preview`，个别带 `description`），
要求两件事：① 分类**依赖 `attribute`**，并新增一个**默认分类「表情」**把这个功能装进去；
② 问「这些功能组能不能复用」—— 以后还想用同一套东西接新的 JSON 数据集。

**结论：能复用，原来那套只差两层抽象。** 一条「功能」拆开是三块，原先只有弹窗那块是复用的：

| 层 | 原先 | 现在 |
|----|------|------|
| 数据形状 | 动作 / 背景数据集**恰好**就是 `StaticTagItem`，所以从没有人处理过「形状不一样」 | `data/tagLibraryFormats.ts`：**格式适配器**注册表（`staticTagItem` / `expression`），一个格式一个 `toItem(raw, index)`；认不出的条目返回 `null` 被丢掉，而不是塞半截数据进卡片 |
| 库的声明 | `TAG_LIBRARIES` 里手写两条（`tabId` 字段其实无人消费） | `TAG_LIBRARY_DEFINITIONS`：一条 =「数据集 + 格式 + 对应工具 + 文案 key」，UI 形状由它派生 |
| 工具接线 | 散在四处：提示词下方按钮行、面板当前分类下的入口、自定义分类的挂载开关、工具→默认分类表；面板里四个 `if` 分支各写一遍按钮 | `data/promptTools.ts`：工具注册表（文字 / title / 数据钩子 / `defaultTab` / 弹窗类型），上面四处**全部由它生成**；「哪个库归哪个工具」只写在库那边，用 `getTagLibraryByTool(toolId)` 反查（一条事实一个出处，两张表不可能对不上） |

于是「加一个新库」＝ 放数据集 +（形状不同才）写一个适配器 + 声明表里加一条 + 补词条，
**组件一行不用改**。表情库这次就是照着这条路径加的（复用已有的弹窗 / 卡片 / 侧栏 / 分页）。

**这次的具体改动**

| 项 | 说明 |
|----|------|
| 新库 | `expression`：分类取 `attribute`（笑 15 / 哭 12 / 不开心 9 / 蔑视 9 / 生气 7 / 其他表情 41 / 积极情绪 15 / 负面情绪 5 / 气质 11），`object`（恒为「表情」）与 `attribute` 一起进检索特征词；`id` 用**序号**生成 —— 数据集没有 id，而 `displayName` 里有 `:d` / `;d`，按名字生成 id 会让这两条撞成一条 |
| 新默认分类 | `DEFAULT_PROMPT_TABS` 第 7 个「表情」（介于「姿势」与「背景」之间），默认 7 → 8 个分类；`PromptTabToolId` 增加 `expression` |
| 落点 | 默认分类与工具仍是固定一对一（`TOOL_DEFAULT_TAB`，现在由注册表派生）：表情库 → 「表情」分类，覆盖写入；自定义分类里挂它仍然是**追加** |
| 数据钩子统一 | 面板里的工具按钮从「一个工具一个属性名」（`data-prompt-tool-3d` / `-character` / `-pose` / `-background`）改成统一 `data-prompt-tool="<工具 id>"` —— 挂载开关早就是这个形式，现在两边一致了（冒烟的选择器跟着改） |
| 词条 | 新增 8 条（`taxonomy.promptTabs.expression` / `taxonomy.tagLibraries.expression.*` / `promptAssembly.tools.expression*` / `coveredExpression`）。**en 侧直接写英文**，所以未翻译数没有上涨（841 / 1184，基线 842 仍在上方）；`check:locale-keys` 键一致性绿 |
| i18n 硬编码基线 65 → 66 | 表情数据集里有一条条目自带中文 `description`。那是**内容数据**（与 `galleryPaintings` / `roles` / `cartoonFonts` 同一类，脚本照样计数），不是界面文案；这次没法把它挪进词条表（数据集是外部烤好的 JSON），于是如实 +1 并写明原因 |

**门禁 97 → 108/108**，新增 11 条：表情数据集结构（124 / 9 attribute / 单一 object / 字段齐全）、
按钮行「表情库」可打开与取消可关闭、表情分类里有入口且不串到别的工具、
弹窗按适配器结果渲染（24 张卡片 + 9 个分类）、分类筛选（笑 15 条 → 不足一页故无分页条）、
footer 单位是「表情」、应用后**覆盖**「表情」分类（写入英文标签 `smile`）、弹窗自动关闭、
清空后拼接结果复原。

**顺带**：清掉 `PromptSection.tsx` 里一个从 HEAD 就存在的未用 import（`appendPromptText`），
lint 少一条 warning。

`pnpm typecheck` / `pnpm lint`（0 error）/ `pnpm check:i18n` / `check:i18n:en` /
`check:locale-keys` 全绿；`smoke-prompt-assembly` 单独跑一次 108/108。

## 2026-09-21 — 首页概念页：按「背景 / 装饰 / 品牌 / 功能」四层重做

用户给了首页概念（图 2）、目标视觉风格（图 1：淡蓝紫底 + 白色半透明浮卡）与一张可选的天空背景板（图 3），
并明确要求**分层**：背景层、装饰层、品牌层、功能层各自成层，而不是把元素铺在背景图上。

| 层 | 实现 |
|----|------|
| 背景层 | 纯 CSS/SVG：天空渐变 + 日光 + 三层云团（模糊椭圆）+ 城市剪影（一条 SVG 天际线）。**不引外部图**——图 3 那张背景板可以不要，而外部图会带来授权与离线两个问题 |
| 装饰层 | 飘落花瓣（5 片，不同延时/尺寸）+ 星芒（5 点）：两个循环动画写在 `globals.css`（`home-petal-fall` / `home-sparkle`），尊重 `prefers-reduced-motion` 由既有的全局兜底负责 |
| 品牌层 | `拾光制作组 · SHIGUANG STUDIO` / `Illusion Realm` / `让灵感，成为看得见的世界。` / 用户给的长简介；左上角 AppLogo、右上角 Ver 1.0 |
| 功能层 | 两张**半透明卡片**（图片创作 / 视频创作）+「探索更多功能」，`bg-white/70 backdrop-blur`（深色 `dark:bg-zinc-900/50`），悬停微抬 |
| 衔接 | 作品流上方加一句引言（用户给的「从一张图片，到一段动态影像…」），把概念页与下面的画廊接起来 |

进入功能卡与「探索更多」走的是**和侧边栏同一套页面切换动画**（`startPageNavigation` + 方向判定），
所以从首页点进去和其它入口的动线一致。

**实测**（1200×900）：hero 宽 970（居中列）、花瓣 5 / 星芒 5 / 可点卡片 3、标语在页内；
浅色与深色各截一张（深色是夜空版本，同一套结构换色，没有第二个组件）。

## 2026-09-20 — 高级组装：自定义分类可以挂载**多个**既有工具
## 2026-09-20 — 高级组装：自定义分类可以挂载**多个**既有工具

需求原话：「新增分类为 1，可以为其添加所存在的功能，可以添加复数个」。

**现状**：默认 7 大分类与工具是**写死一对一**的（角色库 → 角色、动作库 → 姿势、背景库 → 背景、
3D 视角 → 镜头视图），而自定义分类（例如「1」）只能手打文字 —— 它拿不到那些既有功能。

| 变更 | 说明 |
|------|------|
| `PromptTab.tools?: PromptTabToolId[]` | 分类可挂工具（**数组**，可多个）；文档读取走 `sanitizeTabTools`，只留合法且不重复的 id |
| `togglePromptTabTool(tabId, toolId)` | store 里的挂 / 摘（点一下切换） |
| `applyToolPromptText(text, tool, targetTabId?)` | 新增落点覆盖：自定义分类传自己的 id，默认分类不传 → 走原固定绑定 |
| 面板 UI | 自定义分类里多一块「工具」区：上面是已挂工具（点了就用），下面是挂载开关（多选 + 勾选态） |
| 写入语义 | **自定义分类里是追加**，不是覆盖 —— 它可能同时挂好几个工具，覆盖会让后调用的把前一个清掉（那正是这个功能要解决的事）；默认分类仍是覆盖（原语义不变） |

**门禁 91 → 94/94**，三条新断言：① 四个既有工具都可挂（挂载入口存在且齐全）；
② 同一个自定义分类能同时挂两个（角色 + 动作库，勾选态与可调用按钮都对得上）；
③ 从该分类调用角色库后，结果**追加进这个自定义分类**、默认「角色」分类一字未动。

**顺带修掉一个真 bug**：`startViewTransition` 返回的 `updateCallbackDone` / `ready` 没人接 ——
过渡被浏览器跳过时它们会以 `AbortError: Transition was skipped` 拒绝，冒烟的「无 console 错误」
因此红过一次。现在三条 promise（ready / updateCallbackDone / finished）各接一个 catch。

（另一处是探针自身的时序：点完 Tab **同一 tick** 就去读输入框，拿到的还是上一个分类的值 ——
React 还没提交。加了 150ms 等待后才读到正确的值；这类「点完立刻读」的坑在冒烟里出现过不止一次。）

## 2026-09-20 — 给「被盖住的那一层」加景深模糊：把漂移感读成退后

用户要求：切页动画进行时，给底层（被盖住的那层）加模糊 ——「这样不会有严重的漂移感」。

**规则很统一**：退出的那一层**总是**被盖住的那层（进入层在上、返回层在上，见前面两轮的层级修正），
所以模糊只挂在两个 `*-out` 关键帧上，不用按方向分叉：

| 关键帧 | 用途 | 变化 |
|--------|------|------|
| `page-content-out` | 路由切换 / 表单 ↔ 图库 / 图库 → 详情 时被盖住的内容 | `filter: blur(0 → 7px)` + 原有位移 |
| `page-panel-out` | 详情返回时被图库盖住的详情 | 同上 |

用 token `--page-blur-covered: 7px` 一处可调。**进入层不加模糊**：新内容一进来就糊，反而像没加载完。

**为什么这个模糊有用**：位移本身让人读成「整块内容在漂」（尤其旧层从新层边缘露出来的那一条），
而模糊是**景深信号**——近处清晰、远处虚，于是同一点位移被读成「退到后面去」而不是「漂移」。

**实测**：一次性工具连拍（每帧间隔 = capturePage 本身开销，约 50–100ms，正好覆盖 380ms 过渡），
逐帧目视确认旧层那一带是糊的（附帧：`blur-fwd-03`）；另用「相邻像素差均值」做了个粗略锐度对照
——静止时 28.1，过渡中降到 0～3（注意这个数只能作辅证：它同样受画面内容影响，
主区从图片墙换成表单本身就会变平）。

`smoke-prompt-assembly` 91/91、`pnpm check` / `lint` / `typecheck` 绿、构建指纹与源码一致。

## 2026-09-20 — 宽屏点图片：不该继承整页切换（我的条件写漏了宽窄）

用户描述：宽度足够时点图片，**主区先整体滑一遍，然后弹窗才出现**；宽屏应当是「从中间缓缓浮现」。

**根因**：打开详情的那段整页过渡写在缩略图点击处，**没判宽窄**：

```tsx
// 之前：宽屏也走这条
runPageStyleTransition({ isSettled: () => Boolean(document.querySelector("[data-image-detail-panel]")) })
```

而 `data-image-detail-panel` **只在窄屏（占满主区那条）挂**。于是宽屏下 `isSettled` 永远不成立 →
过渡白等满 800ms 超时，期间主区照常滑了一遍 → 用户看到的就是「先整页动，再弹窗」。

**改法**：按版式分流 —— 只有 `page` 版式（窄屏，图库是占满主区的页）才走整页位移；
宽屏直接开，弹窗用它自己的 `motion-pop-in`（220ms、居中、淡入 + 轻微放大）缓缓浮现。

**实测**：

| 场景 | 整页切换类是否出现 | 详情表现 |
|------|-------------------|----------|
| 宽屏 1440×900 | **false**（没动主区） | `motion-pop-in` / 220ms / 居中 / 宽 1238px（86vw） |
| 窄屏 940×880 | **true** + `direction=forward` | 占满主区（宽 720 = 主区宽）、挂 `motion-none`、走位移 |

（探针第一版在窄屏读到 `false` —— 选择器选中了隐藏的宽屏右栏实例（它在窄屏是 `display:none`）。
把范围限定到换页内之后读数才对；这个坑在这套工具里踩过好几次，值得单记。）

`smoke-prompt-assembly` 91/91、`pnpm check` / `lint` / `typecheck` 绿、构建指纹与源码一致。

## 2026-09-20 — 切换动画要「发生在主区里」：侧栏不能被动到（组间层级再修一次）

用户反馈：动画看起来「从整个布局出发」，侧栏像被盖住了。

**根因**：内容层的快照不局限于它原来的框 —— 旧内容向左让位（-10%）时那一坨会滑到侧栏底下，
而 View Transitions 的**组间层级默认按 DOM 顺序**：`<nav>` 在 `<main>` 之前 ⇒ 侧栏反而被压在下面。

**改法**：把侧栏那一组的层级抬到最高（`z-index: 9`，其余按方向 2/3）。侧栏本身是不透明的固定列
（`w-[220px] bg-background`），抬到最上面之后，滑到它下面的内容自然被挡住 ——
视觉上就等于「动画被裁在主区里」。同时把详情面板与内容区的层级一起排到 2/3，保持「返回时目标层盖住当前层」。

**实测（940×880，逐帧采像素）**：

| 采样点 | 前进（首页 → 创建） | 返回（创建 → 首页） |
|--------|--------------------|--------------------|
| 侧栏中部 (110,420) | 颜色种类 **1**（恒为 `255,255,255`） | 颜色种类 **1** |
| 主区中部 (600,300) | 颜色种类 2（在动） | 颜色种类 3（在动） |

侧栏恒定 + 主区在动 = 「动画只在主区发生」这件事有了机器证据，不再靠肉眼。
（探针第一版读到过 `127,127,127` —— 那是更新公告的 `bg-black/50` 遮罩：桩里 changelog 为 null，
页面每次重挂都会再弹一次。真实应用只弹一次，属于探针环境噪音，已在工具里定时点掉。）

**顺带修掉一条「环境依赖的断言」**：`smoke` 里「弹窗统一入场动画」原本读当场的弹窗，
而那取决于「更新公告此刻还在不在」—— 探针点击遮罩会把它关掉，于是断言红过一次。
改成**自带探针**（临时插一个 `role=dialog` 读样式再摘掉）：规则对所有 `role=dialog` 生效，探针等价且稳定。

## 2026-09-20 — 返回时的层级：改成「目标层盖住当前层」（与页面切换同一套语义）

用户把差别说得很准：

> div1 div2 —— div2 返回时，效果是 **div1 覆盖到 div2 上**；
> 但图片这里变成了「图1 向左移开（顶层）、div2（底层）右移」。

**根因是层级，不是曲线**。详情面板挂在 `body` 末尾的 portal 里，而 View Transitions 的
**组间层级由 DOM 顺序决定** —— 于是 `page-panel` 那一组永远压在 `page-content` 之上，
返回时看到的就是「详情自己向左滑走、图库在底下动」，而页面返回时是「目标页盖回当前页」。

改法两条：

1. **按方向显式指定组间 z 顺序**（进入时新层在上、返回时目标层在上）：

   | 方向 | `page-content` | `page-panel` |
   |------|----------------|--------------|
   | `forward`（打开详情） | 1（让位） | **2（盖住）** |
   | `backward`（返回图库） | **2（盖住）** | 1（让位） |

2. `page-panel-out` 的位移从 `--page-shift-in` 改成 `--page-shift-out`：
   返回时详情是**让位**（向右飘 10%），而不是自己整屏滑走 —— 与 `page-content-out` 同一语义。

实测连拍（940×880）：返回途中图库整层盖在详情之上、详情向右让位，落点回到图库页（不是创建表单）。
`smoke-prompt-assembly` 91/91、`pnpm check` / `lint` / `typecheck` 绿、构建指纹与源码一致。

**留下的一条说明**：宽屏（≥ lg）的详情仍是居中弹窗（它是真弹窗，不是主区里的一页），
这条层级修正只影响窄屏那种占满主区的形态。

## 2026-09-20 — 图库页与图片详情：统一成「页面切换」那一套 + 详情改成占满主区

### 一、同一件事不再有三种手感

此前「进入下一层」在应用里有三套动画：路由跳转是位移、`已生成图片` 是 `subpage-enter` 淡入、
图片详情是弹窗缩放。用户要求「和图 1（`home → create`）一致」，于是把视图替换抽象成
`runPageStyleTransition({ direction, apply, isSettled })`（`utils/pageTransition.ts`），
路由跳转、创建表单 ↔ 图库、图库 ↔ 图片详情**共用同一条曲线、同一个方向语义**：

- 进去 = `forward`（新内容从右推入、旧内容向左让位）；
- 返回 = `backward`（镜像）；
- `isSettled` 保证新快照拍在「新界面已经画出来」之后（否则会拍到半成品）。

### 二、图片详情（窄屏）：从浮框改成占满主区

用户要求「不存在浮框，和图 1 一样占满，同样用 `<` 返回」：

| | 之前 | 现在 |
|---|---|---|
| 面板 | `right-2 top-2` + 圆角 2xl + 阴影，四周留 8px | `inset-y-0 right-0`，左边缘贴住侧栏 → **占满主区**，圆角/描边/阴影全为 0 |
| 遮罩 | 主区上一层 `bg-black/30` | **去掉**（这一层本来就占满，遮罩只是多一层没用的灰） |
| 关闭 | 标题栏右侧 `✕` | 左端 **`◀`** 返回键（与图库页标题栏同一条） |
| 入场 | `[role=dialog]` 统一缩放淡入 | 挂 `motion-none` 退出那条规则，改走页面切换的位移（`view-transition-name: page-panel`，打开/返回两条关键帧都有） |

实测（940×880，侧栏 220）：图库页与详情页的几何都是 `left=220 / top=0 / right=0 / bottom=0`，
`border=0 / radius=0`，详情页 `backdrop = 0`；点 `◀` 回到图库页（不是回到创建表单）✓

**门禁 90 → 91/91**：新增「进入『已生成图片』走的是和切页面同一套动画（不是另一套淡入）」——
在点击前装 `MutationObserver`，要求 `page-transition` 出现过且方向为 `forward`。
（详情页那条没进冒烟：套件的图库桩是空的，没有缩略图可点；几何与返回动线用一次性工具实测。）

## 2026-09-20 — 切页「白底浮现 + 卡」：两个成因（一个是我的 bug，一个是模型选错）

用户描述：「替换的时候底层是白色然后从下面浮现，显示得很卡、闪烁」。

### 成因一（我的 bug）：过渡结束的瞬间又淡入了一次

内容区当时挂着 `motion-fade-in`，我为了不让它把「淡入中途的帧」烘进新快照，加了
`html.page-transition [data-page-transition] { animation: none }`。问题是**类一摘掉，
`animation-name` 从 `none` 变回 `motion-fade-in`，浏览器就把这条动画重新起了一次** ——
于是滑动结束后整块内容又淡入一遍，读起来就是「底下一片白 → 内容浮现」。

修法：内容区**不再挂自己的入场动画**（View Transitions 已经负责这段；不支持它的环境就是直跳，
这比「随机多闪一次」诚实）。门禁那条断言也跟着改成守这个性质：
`animationName === "none"` + `view-transition-name === "none"`（平时不能挂名字）。

### 成因二：揭示模型会先把「新页面的加载态」露出来

上一版是「旧内容抽走 → 露出下面的新内容」。而新页面首帧往往只有骨架/空白（图库要等图片从
IPC 读回来），于是被露出来的正是那张白底 —— 图片随后才到，观感就是「白底 + 内容浮现 + 卡」。

改成**推入模型**：新内容整屏从同一侧推入并**压在最上层**（不淡化、不透明），旧内容反向轻微让位
（-10% 视差）垫在下面。旧页面全程可见，新页面盖上来时已经是「完整的它」，没有白底暴露的窗口。

| | 揭示模型（上一版） | 推入模型（现在） |
|---|---|---|
| 新内容 | 从同侧轻微视差（8%） | 从同侧整屏推入（32%） |
| 旧内容 | 抽走 22%（主动退出） | 反向让位 10%（视差） |
| 露白风险 | 有（新页加载态先被露出） | 无（旧页全程垫底） |

**验证**：连拍 9 帧 × 55ms（前进 / 返回各一组）逐帧确认：过渡中始终是「旧页 + 正在推入的新页」，
没有整屏白帧；`smoke-prompt-assembly` 90/90、`pnpm check` / `lint` / `typecheck` 绿。

**顺带记一条环境差异**：我的一次性截图工具带 `--disable-gpu`（沙箱里 GPU 起不来），
合成走软件；真实应用是开 GPU 的，快照平移在这类场景由合成器完成，通常更顺。
如果你那边仍然觉得卡，下一步该量的是「主进程是否被 IO 占住」（读图库是主进程在做），
而不是继续调动画时长。

## 2026-09-20 — 页面切换「闪烁 + 太快」的两处真问题（都是实现缺陷，不是口味）

用户反馈三点：不够丝滑 / 疑似太快 / **很严重的闪烁** / 返回时「从左边抽出」看着不对。逐帧抓图后定位到：

### 一、闪烁：两处叠加而成的假象

| 病灶 | 现象 | 修法 |
|------|------|------|
| 侧栏那一组只关了 `::view-transition-group` 的动画 | 默认仍给 **old / new 两个快照**各挂一条淡出/淡入 —— 两个「几乎完全一样」的侧栏快照互相淡化，就是**导航在闪** | 整组（group + old + new）`animation: none`，并统一 `mix-blend-mode: normal`（默认的 plus-lighter 会把重叠处提亮） |
| 抽出与移入都用 `opacity` 淡出/淡入 | 两段淡化之间存在「都接近透明」的窗口，那几十毫秒透出的是**空白底色** —— 观感就是闪一下 | **完全不淡化**：新旧快照都保持不透明，交接只靠位移；旧快照压在新的之上（显式 `z-index`），读起来是「旧内容被抽走、露出已经在那儿的新内容」 |

### 二、太快：时长 + 曲线

- 抽出 170→**300ms**、移入 210→**380ms**，并新增页面切换专用曲线 `--motion-ease-page`
  = `cubic-bezier(0.32, 0.72, 0, 1)`（起步快、收尾极缓，像「滑停下来」而不是「撞停」）；
- 移入不再等抽出结束（原来的 160ms 空档既是闪的来源、也让人感觉「卡了一下」）；
- 位移量：旧内容 22%、新内容 8%（新内容只做轻微视差，不做整屏平移 —— 整屏平移在 380ms 里会糊）。

### 三、返回方向

当前是**镜像**：向前向右抽、返回向左抽（逐帧确认：返回时旧页向左被抽走、上一页从左移入，与向前互为反向）。
方向政策提成一处显式开关 `BACKWARD_POLICY: "mirror" | "same"`（`utils/pageTransition.ts`）——
如果你要「两次都向右抽」的观感，改成 `same` 即可，一行。

**验证**：一次性 Electron 工具连拍 9 帧 × 60ms 覆盖整段过渡（前进与返回各一组），
逐帧确认「无空白/无闪白、旧页整体不透明地移出、新页在下方就位、导航列纹丝不动」；
`smoke-prompt-assembly` 90/90、`pnpm check` / `lint` / `typecheck` 绿、构建指纹与源码一致。

## 2026-09-20 — 页面切换改成「方向滑动」：旧内容向右抽出 → 新内容从右移入

**用户要的效果**：左边侧栏不动，右边内容区在切页时（如 首页 → 创建）先向右被抽走，
新内容再从右侧移入。

**为什么必须用 View Transitions**：想让旧内容「抽出去」，就得在它**还存在**时拍一张快照 ——
路由一切换，旧页面立刻被 React 卸载。CSS 只能做「新内容入场」，做不出「旧的退场」。
`startViewTransition(回调)` 的时序正好是「拍旧快照 → 跑回调（这里做 `router.push`）→ 拍新快照」，
两侧都能动，且不用自己维护「退场中的旧页面」这份状态（与主题波纹同一套机制）。

| 决定 | 理由 |
|------|------|
| 导航处包一层 `startPageNavigation()`（侧栏 + 移动底栏同源） | 路由跳转必须发生在回调**内部**，否则新快照拍的是旧页面 |
| 方向由主导航顺序判定（`resolvePageDirection`） | 向前 = 右抽 + 从右进；向后镜像到左侧 |
| `view-transition-name` **只在过渡期间挂**（`html.page-transition`） | 常驻的话，主题波纹那条「裁剪 root 新快照」的动画会把这些元素从 root 摘出去 —— 波纹就盖不到内容区与导航了 |
| 给侧栏单独一组并 `animation: none` | 快照默认含整页，不这么做导航会跟着一起滑（桌面应用里导航是常驻骨架） |
| 抽出 170ms、移入 210ms **带 160ms delay** | 读起来是「抽走 → 换新」，而不是两页在半透明里互相穿透；内容区自己铺了 `bg-background`，新快照不透明 |
| 过渡期间 `animation: none` 关掉内容区自己的淡入 | 两个动效叠加会让**新快照定格在淡入中途**（快照把那一帧的透明度烘进去）→ 看起来整体发灰。不支持 View Transitions 的环境不会挂这个类，淡入照旧（回退路径） |

**实测（一次性 Electron 工具，1200×860）**：点「首页」→「创建」，
`html` 上依次出现 `page-transition` + `data-page-direction="forward"`，约 500ms 后清理干净；
反向（创建 → 首页）为 `backward`。中途抓帧能看到旧内容右移与新内容从右进（导航列始终稳定）。
总时长约 370ms 动画 + 等路由提交的 ~100ms。

**门禁 89 → 90/90**：新增「页面切换是『旧内容抽出 + 新内容从同侧移入』（标记只在过渡期间挂、用完即清）」——
判据取三件与时机无关的事实：过渡前 `view-transition-name` 必须是 `none`（名字不能常驻）、
过渡中出现过 `page-transition` 且方向为 `backward`、播完后类与属性都被清掉。
放在**整套冒烟的最后一步**：它会离开创建页，跑在前面的话后面那些「创建页现场」的断言都得重做。

## 2026-09-20 — 页面切换动画：从「整个 AppShell 一起闪」改成「只淡入内容区」

**用户问**：切页面（首页 → 创作 → 其它页）有没有动画？

**先测再改**。上一轮加的是 `app/template.tsx`（`motion-fade-in`），我用一次性 Electron 工具
逐页导航（首页 / 创建 / 设置 / 我的主页）量了四组数据：

| 观测 | 结果 |
|------|------|
| 包裹层是否重挂 | 是（导航前打的 `data-nav-probe-tag` 在导航后消失） |
| 动画是否重播 | 是（`seen: true`，`animationName = motion-fade-in`，时长 `0.22s`） |
| 切换后第一帧不透明度 | `0.0077 / 0.0266 / 0.0361 / 0.0073` —— 确实从近透明淡入，不是硬切 |
| **负向发现** | `template` 包住的是整个 `<AppShell>`，**左侧导航也在包裹层里**（`navInsideWrapper: true`）→ 切页面时导航跟着一起闪 |

**改法**：删掉 `app/template.tsx`，把过渡下沉到 `<main>` 内部，用 `pathname` 当 key：

```tsx
<div key={pathname} data-page-transition={pathname} className="motion-fade-in h-full">
```

桌面应用里导航是**常驻骨架**，该动的是内容区 —— 改后实测 `navInsideWrapper: false`，
导航稳定、只有内容区淡入（各页首帧不透明度同样是 0.0x）。`data-page-transition` 同时是断言钩子。

**门禁 88 → 89/89**：新增「切页面有入场动画，且只淡入内容区（导航不跟着闪）」——
判据取 computed `animationName` + 「nav 是否在包裹层内」，后者正是第一版会红的那一格。

## 2026-09-20 — 动效基线：加载态给形状、交互给反馈、全局尊重「减少动效」

**起因**：用户要求「能加载动画的地方变丝滑，重体验的地方也加入动画」。先做了一次摸底，
发现三件事：

1. **有一处「动画」其实从来没生效**：图库网格挂着 `animate-in fade-in-0 duration-300` ——
   那是 `tailwindcss-animate` 的类，而项目**没装这个插件**，所以一直是硬切。
2. **加载态基本是纯文字**（「正在加载图片…」），内容到位时整块跳版。
3. **19 个弹窗没有一个有入场动画**；时长/缓动散着 200 / 220 / 260 / 300 / 560 五种数字，
   `motion-safe:` 只在部分调用点写了 —— 新加的地方很容易漏。

### 一、基线收在一处（`app/globals.css`）

| 做法 | 理由 |
|------|------|
| `--motion-fast/base/slow` + 两条缓动曲线做成 token | 结束「每个组件各写一个数字」 |
| 入场动画只动 `opacity` 与**独立变换属性** `scale` / `translate`，绝不写 `transform` | 弹窗普遍靠 `-translate-x-1/2 -translate-y-1/2` 居中，动 `transform` 会把居中打飞（动画期间弹窗瞬移到别处） |
| `[role="dialog"]` / `[role="menu"]` 按**属性**统一入场 | 19 个弹窗逐个加类迟早漏一个；要退出规则的加 `motion-none` |
| `.motion-skeleton`（扫光）/ `.motion-rise-in` / `.motion-fade-in` | 加载态与内容到位统一写法 |
| 文件末尾 `prefers-reduced-motion: reduce` **全局兜底**（时长压到 1ms） | 无障碍要求，不该指望每个调用点都记得写 `motion-safe:` |

### 二、加载态：先给形状，再给内容

- 图库的文件夹列表 / 图片网格：**骨架屏**取代「正在加载…」，且**列数与真网格同源**
  （抽了 `historyGridClass()`，否则加载时是另一种密度、内容一到就跳版）；
- 「加入图片到文件夹」弹窗、更新日志页同样换成骨架屏；
- 真实内容到位时用 `motion-rise-in` 入场（顺手把那条失效的 `animate-in` 删了）。

### 三、交互反馈

- 缩略图：`group-hover:scale-[1.04]`（图片自己放大，比整体降透明度更有反馈感）+ `hover:shadow-md`；
- 固钉按钮：`active:scale-90`；固钉本体挂载淡入；
- **页面级入场**：新增 `app/template.tsx`（App Router 的 `template` 每次路由切换都会重挂），
  一处覆盖全部页面 —— 放 `layout` 不重挂、放各页面要抄 12 遍；
- 创建页表单挂载淡入。

### 门禁（85 → **88/88**）

| 新增断言 | 判据 | 为什么这么取 |
|----------|------|--------------|
| 图库加载中显示骨架屏 | MutationObserver 抓 `[data-gallery-skeleton]` 出现（桩故意慢 250ms，否则这条永远看不到它） | 加载态是瞬时的，采样点踩不中就只能得到「没看见」 |
| 弹窗统一入场动画 | computed `animationName === "motion-pop-in"` 且时长 `0.22s` | 动画播完后 `animationName` 仍在（`both` 填充），**与采样时机无关**，不引入抖动 |
| 系统「减少动效」时全局压到 1ms | CDP 模拟 `prefers-reduced-motion: reduce` 后读时长（`0.001s`） | 无障碍兜底必须机检，否则哪天被顺手删掉没人知道 |

**回归**：`smoke-prompt-assembly` 88/88、`smoke-app` STYLES OK（改了 globals.css 所以顺带跑它）、
`pnpm check` / `lint` / `typecheck` 绿；用一次性 Electron 工具抓了骨架屏与内容到位两帧目视确认。

**还没做的（点名）**：Toast 只有入场没有退场（要保留下「退出态」才能做）；文件夹的展开/收起
仍是瞬时（`CollapsiblePanel` 那套实测高度过渡可以复用，但那块自带 200px 滚动区，要单独设计）。

## 2026-09-20 — 图片详情弹窗去掉描边（用户截图：深色下外层与「生成数据」那两道亮线）

**问题**：点开图片后的详情弹窗在深色下有两道 1px 亮线 —— 弹窗自身的外描边、
「生成数据」卡片的外描边（外加「非本生成器生成」警告卡片的琥珀描边）。
它们与背景的明度差很小，于是只剩「一道发光的线」，既没有信息量也很扎眼。

**改法：这三处都改成**不描边、靠面与间距分组**（同一处一致处理，而不是只去掉最显眼的一条）：

| 位置 | 之前 | 现在 |
|------|------|------|
| 弹窗外层（窄屏卡片） | `rounded-2xl border shadow-2xl` | `rounded-2xl shadow-2xl`（大阴影足够与主区分离） |
| 「生成数据」卡片 | `rounded-2xl border p-3` | `rounded-2xl p-3`（分组靠标题字号 + 内层字段的浅色底） |
| 「非本生成器生成」警告 | `border-amber-500/30 bg-amber-500/10` | `bg-amber-500/15`（底色即语义，填充略提亮补回分量） |

**实测**：改后弹窗 `borderTopWidth = 0px`（改前 1px），阴影仍在（`boxShadow ≠ none`），
浅色与深色各截一张确认（浅色下同样更干净）。

**留着的两条线**（都不是「框」，且都不是这次反馈的对象）：图片区那层 `bg-muted/40` 是**底色**不是描边
（它的作用是让不可避免的留白看起来是有意的画框，见上一轮的设计说明）；标题栏下那条
`border-b` 是滚动区分界。要一并不留，都是各删一个类的事。

## 2026-09-20 — 图库入口改为主区右上角「固钉」（三档视图切换）+ 深色模式柔化

### 一、入口从「提示词框下的一枚 chip」改成主区右上角的固钉

旧入口在提示词框下面那排 chip 里，**跟着表单滚** —— 往下拉一点就找不到了。用户要的是它一直在：
现在它是主区右上角一枚固钉（不随表单滚动），形状就是那三枚方钮 `[ ][ ][ ]`：

| 之前 | 现在 |
|------|------|
| 提示词框下的 chip（滚动即消失） | 主区右上角固钉，**不随滚动**（`right:12px / top:8px`） |
| 只负责「打开图库」 | 三枚方钮 = 网格 / 堆栈 / 收藏；**点任意一档 = 进图库并停在该档** |
| 档位是 `CreateHistorySidebar` 的本地 state | 档位提到 `useHistoryFolderStore`，三处入口共用 |

为什么要提状态：宽屏右栏、窄屏换页、固钉是**同一件事的三个入口**，各自本地 state 会出现
「在固钉上切到堆栈、进换页却显示网格」——同一件事两个答案。换页里的内联切换器同时移除，不留两个入口。
固钉离右边缘 12px（再靠右会压住页面自己的滚动条），按钮 28px、半透明 + 毛玻璃，
图库页里不再重复显示「已生成图片」标签（标题已经写了）。

### 二、深色模式柔化（用户截图：尺寸预设的边框「太粗、对比太强」）

根因是**深色下拿 `--foreground`（#ededed）当描边与实心填充**：选中的尺寸预设因此是一圈近白 2px 边框、
主按钮是一整块纯白。改法落在 token 上，一处改、全场受益：

| token | 浅色 | 深色 |
|-------|------|------|
| `--accent-stroke`（选中描边） | `#171717`（与改造前逐字一致） | `#71717a`（zinc-500，中灰） |
| `--accent-fill`（实心按钮 / 药丸 / 开关 / 滑杆） | `#18181b`（同上） | `#52525b`（zinc-600） |
| `--accent-fill-foreground` | `#ffffff`（同上） | `#f4f4f5` |

`ACCENT_*` 家族（选中描边 / tab 选中 / 开关 / 药丸 / 主按钮 / 滑杆）改走 token，
另外把 9 个文件里硬编码的 `bg-zinc-900 … dark:bg-zinc-100 dark:text-zinc-900` 主按钮一并收口
（浅色的取值与改造前逐字一致，浅色界面不变）。焦点环的深色不透明度 30% → 20%。
实测：选中的尺寸预设从近白 2px 变成中灰描边；「生成」按钮从纯白块变成中灰。

**门禁**：`smoke-prompt-assembly` 83 → **85/85**，新增两条：
「窄屏入口是主区右上角的固钉（三档，且旧 chip 已移除）」——判据取几何（右 ≤ 20px、顶 ≤ 20px）+ 三档齐全；
「固钉切档即生效」——点开时 grid 处于按下态、切到 stack 后 stack 处于按下态（证明三处入口共用同一份档位）。

## 2026-09-20 — 换页缩略图密度 + 收边侧边栏下弹框被裁掉

**一、缩略图过大 / 一行放几张**（用户实测截图：925 宽、侧栏收边，一行 3 张、单张 240px 上下）

| | 之前 | 现在 |
|---|---|---|
| 换页列宽上限 | `max-w-[760px]`（9xx 窗口里右侧空一条） | `max-w-[1000px]` |
| 网格列数 | `3 / lg:4` | `grid-cols-4 / sm:5 / lg:6`（收藏档 5 / 6） |
| 实测（925 宽、收边） | 3 张/行、约 240px | **5 张/行、161×161**（11 张 3 行） |

文件夹行仍走同一列，宽度上看着不挤；视图切换（网格 / 堆栈 / 收藏）照旧。

**二、收边后点「主题」「语言」没反应**

根因不在开关本身：弹框**已经渲染**，但它是按钮右侧的 absolute 子元素
（`left-full ml-2`，收边时只能往外长），而侧栏容器是 `overflow-hidden` —— 整块被裁成 0 可见。
展开态必须 `overflow-hidden`（宽度过渡期间标签会被挤出去），所以修法是**按状态切换**：
`expanded ? "overflow-hidden" : "overflow-visible"`。收边态没有标签会被挤出去（标签本来就只在展开态渲染），
放开裁剪是安全的；顺带把收边态的悬浮提示也一并救活了（同一处裁剪）。

**判据为什么用 IntersectionObserver 而不是几何**：被裁掉时 `getBoundingClientRect()` 一切正常，
只有「可见比例」（IntersectionObserver 会把祖先裁剪算进去）看得出来。
**负向对照已实测**：把容器改回恒定 `overflow-hidden` → 两条的可见比例都变成 **0**（正是用户看到的「没反应」），
改回按状态切换 → **1**。

**门禁**：`smoke-prompt-assembly` 新增两条（81 → **83/83**）：收边后主题 / 语言弹框的可见比例必须为 1
（弹框关闭走新加的 `data-sidebar-popover-backdrop`，与既有的 `data-language-dialog` 同一类测试钩子）。

## 2026-09-20 — 主题切换的「波纹换肤」：从左下角向外扩散（View Transitions）

**要的效果**：切深浅色时，新配色像水波一样从侧边栏左下角（主题入口）那一圈向外扩到整屏。

**做法**：`document.startViewTransition` + 圆形 `clip-path` 扩散 —— 给旧状态拍快照、
跑 callback、给新状态拍快照，然后把**新**快照按圆裁切、**旧**快照垫在底下，
于是扩散边缘之外仍是旧配色。自己叠一层遮罩做不到这个观感：换肤要变的是整张页面的颜色
（token + 全部 `dark:` 工具类），遮罩只能盖住，盖不出「新页面从圆心长出来」。
keyframes 与 `::view-transition-*` 规则都在 `globals.css`，且**只挂在 `html.theme-ripple` 下**——
启动时按系统偏好落色、系统偏好自己变化都不该放动画。

**圆心**取主题按钮（左下角）的中心，从 `useRef` 拿 rect，缺省回退到左下角 `(0, height)`；
半径 = 圆心到最远角的距离 + 8px。实测（940×900）：圆心 `(109.5, 822)`、半径 `1176px`。

**两个必须等的东西**（不等就会「动画播完什么都没变」）：`startViewTransition` 的时序是
「先拍旧快照 → 跑 callback → 再拍新快照」，而本项目里配色生效要经过两跳 ——
① React 提交（store → AppShell 订阅 → 写 `data-theme`）；② 主进程 `themeSource` 经 IPC 回来、
`prefers-color-scheme` 才翻。所以 callback 里应用主题后等 `waitForAppliedTheme()`（信号与媒体查询
一致，有界 400ms），再让出两拍宏任务给 React 与样式重算。

**踩到的坑（已写进 AGENTS.md）**：第一版用 `await new Promise(requestAnimationFrame)` 当那两拍，
实测**整页卡在旧快照上**——本仓库的既有前提「窗口被遮挡/最小化时渲染生命周期停摆、rAF 不再回调」
在产品代码里同样成立，而 view-transition 的 callback 不 resolve 就永远不完成。改成 `setTimeout`
并把整个等待包上 `Promise.race` 上限，另加 1.5s 看门狗兜底清理。

**回退**：没有 `startViewTransition`（老 Chromium / 非 Electron）或用户 `prefers-reduced-motion: reduce`
→ 直接切，不留任何痕迹。动效是锦上添花，不是切换的前提。

**门禁**：`smoke-prompt-assembly` 新增两条（80 → **81/81**）——
「波纹圆心在左下角、半径覆盖到最远角、结束后类与 CSS 变量清理干净」（用 MutationObserver 抓类出现的
那一刻读变量，采样点踩不中 560ms 的动画只能得到「没看见」这种既非通过也非失败的结论），
以及**回退路径的负向对照**：把 `Document.prototype.startViewTransition` 摘掉后主题仍要能切、
且不留波纹痕迹。

## 2026-09-20 — 未翻译清单落盘 + 窄屏图片详情重排 + 侧边栏左下角「深/浅色」开关

### 一、未翻译清单：从「一个总数」变成「一份可重新生成的清单」

`check-i18n-en.mjs` 新增 `--backlog`：把未翻译的 key 全清单写成 `docs/i18n-backlog.md`
（按命名空间分组、标注「整表未翻 / 部分完成」）。刻意**不写生成时间**——写了的话每次重新生成
都会产生 diff，于是「这份清单过没过期」这件事就再也看不出来；去掉时间戳后它可以拿
`node … --backlog && git diff --exit-code docs/i18n-backlog.md` 当一致性检查用。

文件头点名了这份清单**看不见**的东西：数据层的用户可见字面量（`ALL_HISTORY_FOLDER.name` 就是样板）、
以及本来就该是英文的开发者日志。只看 ratchet 的数字会漏掉整类问题。

**首批实译（55 条）**：`components` 23 → 0、`errors` 32 → 0；ratchet 897 → **842** 并 `--rebase`。
这一批踩到两处「翻字面量不够」的坑，都记在这里：

| 坑 | 症状 | 修法 |
|----|------|------|
| `errors.charactersFormat.wan/yi` | **分组间隔本身是语言的一部分**（中文 10^4/10^8，英文 10^3/10^6）。只翻单位字面量会把 103500 显示成「10.4K」——差一个数量级 | 删掉这两条词条，`formatCount` 改用 `Intl.NumberFormat(locale, { notation: "compact" })`；实测 zh 行为逐字一致，只有两处更精确的舍入（103500：`10.3万`→`10.4万`；12345678：`1235万`→`1234.6万`，旧值来自 toFixed 的浮点伪影与「≥100 万取整」的老约定） |
| `components.presetShell.forPrefix + 组名 + newPreset` | 三片拼接在英文里读成「for 角色 New preset」，语序错了 | 合成一条 `creatingFor: "New preset for {group}"`，JSX 用插值 —— 碎片拼接在语序不同的语言里没有正确解 |

### 二、窄屏图片详情：从「盖满整屏的居中弹窗」改成「主区里的卡片页」

原来的窄屏形态是屏幕居中 + 整宽 + 85dvh：图片区独占 `min(58vh, 560px)`，信息被挤到下面还要再滚一次，
关闭按钮浮在图上遮内容，而且**把左侧导航一起盖掉**。现在（`< lg`）：

- 左边缘让开导航（`navOffset + 8px`）、四周留 8px，圆角 2xl 的卡片挂在主区里；
- 关闭键从浮层挪进**标题栏**（标题栏同时显示文件名，`aria-labelledby` 指向它）；
- 图片区改成「按比例吃一段高度」（32dvh、上限 380px），元信息区独立滚动；
- 宽屏（≥ lg）两栏弹窗保持原样，一个字节未改。

实测几何（940×900，导航 220）：`left=228 / top=8 / 704×884`——即「贴住导航右缘 + 8px 内边距」。

### 三、侧边栏左下角「深/浅色」开关

**机制**：`nativeTheme.themeSource`（Electron 官方的「应用级覆盖 `prefers-color-scheme`」入口）。
本项目的深色 token 与全部 `dark:` 工具类都由这一个媒体查询驱动、只在 `globals.css` 定义一次，
所以 CSS **一个字节都不用改**，也不存在「媒体查询一份、class 一份」两套色值漂移的可能。

分层（各一处，互不重复写）：

| 层 | 文件 | 职责 |
|----|------|------|
| 决议 | `utils/themeResolution.ts` | 纯函数 + 真值表：`undefined/null/""` → `system`；非法值 → `system` 并报 `reason: "invalid"` |
| 持久化 | `useSettingsStore`（`settings.theme`） | `partialize` 写入 + `merge` 时**再过一次决议**（文档是外部输入） |
| 唯一写点 | `utils/themeSignals.ts` | `data-theme` / `data-theme-preference` / `color-scheme` + 一次 IPC |
| 订阅 | `AppShell` | 首帧先按 `system` 落一次；`useMediaQuery("(prefers-color-scheme: dark)")` 进依赖，系统偏好变了也重落 |
| UI | `Sidebar` 左下角「主题」 | 三态弹框（跟随系统 / 浅色 / 深色），复用语言弹框的外壳 |

**门禁**：`smoke-prompt-assembly` 新增三条（配对 + 反向对照 + 收尾）：弹框给出三态 →
选「深色」后 `matchMedia('(prefers-color-scheme: dark)').matches` 必须**真的翻成 true** →
选「浅色」必须翻回 false → 收尾选回「跟随系统」（不把后续步骤留在强制浅色上）。
判据刻意取**媒体查询本身**而不是我们自己写的 `data-theme`：只看自己的属性等于自己证明自己。
测试里装的是**真实主进程 handler**（`registerThemeHandlers()`）而不是桩 —— 踩过一次：
用桩时「主进程根本没注册这个 handler」也会一路绿，而那正是这类开关最容易坏的方式。

**顺手修掉一个既有缺陷（这次开关把它暴露了）**：`dark:bg-primary-foreground` 出现在三处
（提示词框 / 反向提示词框 / 侧栏搜索框）。`--primary-foreground` 是「主色上的**文字**色」（#fafafa），
拿它当输入框底色 = 深色模式下整块发白、正文变浅字压白底。实测：切深色后编辑器计算底色
`rgb(250, 250, 250)`；去掉这三处 override 后 `rgb(10, 10, 10)`，整页深色可读。

**回归**：`pnpm check` 绿（新增通道 `theme:setThemeSource` 过「两端通道表一致 + handler 已注册」）、
`pnpm lint` 0 error、`pnpm typecheck` 绿、`smoke-prompt-assembly` 全绿；构建指纹与源码一致。

## 2026-09-20 — 「已生成图片」页英文态收口：7 条实译 + 「全部」不再来自数据常量

**起因**：上一轮末尾记下的两处既有缺口 —— 英文界面下这一页仍有中文。这回把它收干净，
口径是「**这一页渲染出来的每一条**」，不是「跟着翻译整个命名空间」（`create` 还剩 178/297 条，
那是另一批活）。

**一、7 条实译（`apps/next/src/i18n/locales/en/create.ts`）**

| key | zh-CN | en |
|-----|-------|-----|
| `create.historyDrawer.openLabel` | 已生成图片 | Generated images |
| `create.historyDrawer.closeLabel` | 关闭 | Close |
| `create.page.mediaImage` | 图片 | Images |
| `create.page.mediaVideo` | 视频 | Videos |
| `create.page.mediaRoleCover` | 翻唱 | Cover songs |
| `create.page.mediaRoleTts` | 语音 | Speech |
| `create.historyEmptyState.noGeneratedImages` | 暂无已生成图片，双击文件夹可查看内容 | No generated images yet — double-click a folder to browse its contents |

**二、「全部」那一行**：它的名字来自 shared 数据常量 `ALL_HISTORY_FOLDER.name`（中文），
于是**词条表里 `createHistorySidebar.all` 早就翻好了，界面却永远显示中文** —— 这正是
「表里有译文 ≠ 界面是译文」的那种缺口：绕过词条表的字面量，ratchet 看不见它。
现在在**进列表之前**换名（`allHistoryFolder` 这个 memo 同时喂给显示与搜索），
于是 `filterHistoryFolders` 按 name 搜索也跟着语言走（英文下搜 “All” 能命中）。
shared 里那个常量留着当**身份**（id 与兜底），不再当界面文案。

**验证（机械）**

- `check:i18n:en`：未翻译 904 → **897**，并按流程 `--rebase` 把基线压到 897（ratchet 只允许调小）。
- `mirror-locale.mjs --check`：en 与 zh-CN 键完全一致（16 个命名空间）—— 实译没有动结构。
- `check:i18n`（硬编码中文只减不增）不受影响：本次没有新增任何中文字面量。

**验证（目视，一次性 Electron 工具 + 桩 IPC 数据，未提交）**：窄屏换页切到英文后，
对子页做了一次「叶子节点文本里还有没有中文」的扫描 → **空集**；整页文本实测为
`Generated images | Images | Folders | Double-click to open | New folder | All | Characters |
0 images · Sep 20, 03:15 PM | Amiya | 4 images · Sep 20, 02:15 PM | Images | Grid | Stack |
Favorites | End of list`。同一工具跑中文态确认没被带偏：`已生成图片 | 图片 | 文件夹 | 双击打开 |
新建文件夹 | 全部 | … | 已经到底了`。

**仍未翻的地方（点名，别指望它自己消失）**：`create` 命名空间其余 178 条、`toolBox` 181 条等；
以及**数据层的用户可见字面量**不只这一处 —— 本次修的「全部」就是这类形态的样板。

## 2026-09-20 — 文件夹行副信息（N 张 · 修改时间）+ 把 `listOutputFolders` 的契约接成同一份类型

**做了什么**：窄屏「已生成图片」换页里，每个文件夹行从「一行名字」变成「名字 + 副信息」
（`5 张 · 9月20日 13:59`），行高 40 → 56（page 版式专属；宽屏右栏只有 25% 宽，塞第二行会变成文字墙）。

**张数口径刻意等于「点开看到的张数」**：主进程新加的 `countImagesInDirectory` 与
`listImagesInDirectory` 用**同一个 `isImageFile` 判据**，且都只数该目录**直接**包含的图片
（不递归）。因此父文件夹显示 `0 张`、图片都在子文件夹里时，那个 0 是真的 —— 点进去确实是空的，
层级关系由缩进与展开箭头表达。若改成递归计数，就会变成「行上写 5 张，点进去一张都没有」，
那是更坏的谎。时间用 `Intl.DateTimeFormat(locale)` 格式化（`apps/next/src/utils/dateTimeFormat.ts`，
按语言缓存格式化器），**没有把「月/日」拼进代码** —— 拼字符串等于把中文写死，`check:i18n` 会拦。
时间戳为 0/非法时返回 null，那一项直接不显示（实测 `空的文件夹` 只显示 `0 张`）。

**顺手把一条「写在注释里的承诺」变成机器判据**：`apps/electron/generatedImages.js` 头部一直写着
「主进程产物与渲染进程消费的是同一份类型，字段漂移会立刻编译失败」，但 `OutputFolderEntry`
其实是该文件里的**本地** JSDoc typedef，与 shared 里的那份没有任何链接 —— 两边同时删掉一个字段，
没有任何东西会红，渲染进程只会静默拿到 `undefined`。现在：

| 位置 | 之前 | 现在 |
|------|------|------|
| `packages/shared/src/types/historyFolder.ts` | （无此类型） | `export type OutputFolderEntry` ← 单一事实来源 |
| `apps/electron/generatedImages.js` | 本地 `@typedef {object}` | `@typedef {import("@illusion-realm/shared").OutputFolderEntry}` |
| `packages/shared/src/types/electron-api.ts` | 内联匿名对象 | `IpcResult<OutputFolderEntry[]>` |
| `apps/next/src/utils/generatedImages.ts` | 自己再声明一份同形类型 | 别名到同一个类型 |

**负向对照已实测**：只把主进程 push 处的 `imageCount` 删掉 → `apps/electron` 的 tsc 立刻红
（`Property 'imageCount' is missing in type … but required in type 'OutputFolderEntry'`），
补回后 typecheck 绿。也就是说「主进程漏返回字段」从此是编译期错误，不再是运行期静默 undefined。

**并把它接成门禁 `check:foldercount`**（`scripts/verify-folder-image-count.js`，纯 Node、桩掉 appPaths、
不启 Electron，已进 `pnpm check`）：断言「行上的张数 = 点开看到的张数」在顶层 / 嵌套 / 空目录三处都成立、
非图片后缀不计入，并附一条**负向对照**（测试自己递归数一遍，证明「直接 3」与「递归 5」确实不同）。
这条门禁本身也做了造假对照：把 `countImagesInDirectory` 改成递归 → 立刻红两条
（`行=5 点开=3`、`行=5 直接=3 递归=5`）、exit 1；还原后 5/5。

**i18n**：新增 1 条词条 `create.createHistorySidebar.folderImageCount`（zh-CN `{count} 张` /
en `{count} images`，两边都写实译，`check:i18n:en` 的未翻译计数维持在 904/1142）。
切到英文实测：`0 images · Sep 20, 03:07 PM`（时间戳走 `Intl`，随语言变，不写死格式）。
顺带记一条**既有缺口**（不是本次引入）：列表里的「全部」来自数据常量
`packages/shared/src/data/historyFolders.ts` 的 `ALL_HISTORY_FOLDER.name`，在英文界面下仍是「全部」；
子页标题复用的 `create.historyDrawer.openLabel` 也还在 en 镜像里没翻。两者都属于正在推进的翻译批次。

**缩略图列数**：page 版式的档位从 `3 → md(768) 4` 改成 `3 → lg(1024) 4` ——
768–1023 这一段窗口里 4 列会把缩略图压到 ~150px，3 列更像卡片（实测 940 宽下 3 列 ≈ 226px）。

**回归**：`pnpm check` 绿（含 `check:i18n` / `check:i18n:en` / `check:locale-keys`）、`pnpm lint` 0 error、
`pnpm typecheck` 绿、`smoke-prompt-assembly` 76/76；宽屏右栏实测未变（文件夹行仍是 40px 单行）。

## 2026-09-20 — 窄屏「已生成图片」改为主显示区换页 + `page` 版式（居中列 + 卡片行）

**症状（用户截图，两条）**：

1. **位置错**：窗口不足 xl（< 1280）时点「已生成图片」，出来的是 `fixed inset-0` 的浮层 ——
   它把**整屏**盖住，连左侧应用导航一起盖掉。这个应用本来就是「左导航 + 右主区」两栏，
   盖掉导航等于用户既回不去别的页、也看不出自己在哪一层。
2. **版式错**：那一屏直接复用了 25% 宽右栏的版式，只把容器从 25% 换成 100%：文件夹列表仍是
   固定 200px 的一栏、行被拉成整条、缩略图摊成 5 列细条、「新建文件夹」还是列表末尾一行灰字、
   中间留下大片空白。同一份 DOM 在两种宽度下本来就是两种版式，横向拉满不会报错、不会崩，
   只会难看 —— 所以也一直没有红灯。

**改法一：换页而不是浮层。** 「已生成图片」现在替换的是创建表单那一栏（`showHistoryPage`），
左导航原样留着。表单用 `hidden` 保留挂载而不是条件卸载 —— 提示词框是 contenteditable，
卸载会丢编辑现场。外壳也顺势与其余主区页面对齐：细线标题栏（◀ + 标题 + 媒体名）+ 白色画布，
不再是浮在灰底上的圆角板。

**改法二：给 `CreateHistorySidebar` 加一个版式维度，而不是复制一个页面组件。**

| 版式 | 用在哪 | 形态 |
|------|--------|------|
| `sidebar`（默认） | 宽屏右栏（≥ xl，25% 列） | 现有形态 |
| `page` | 窄屏主区换页（< xl） | 居中列（max-w 760）+ 卡片行 + 大圆角 |

两种版式**共用同一份 JSX 与同一份状态**，只差类名（`pick(page, sidebar, isPage)` 把分支收在调用点）。
复制一份页面等于把「双击缩略图 / 批量选择 / 删除 / 右键菜单」全部复制一遍，下一轮改一处就得记得改两处。

- **换页外壳**：细线标题栏 + 白色画布。底边与移动底栏的关系不再需要手工让位 ——
  换页回到 `main` 的正常流里，`main` 早就带着 `md:pl-[sidebar]` 与 `pb-[mobile-nav-height]`。
- **卡片化**：文件夹行 `rounded-xl bg-muted` + 独立图标块、选中态 `ring-1 ring-foreground/25`；
  「新建文件夹」在 page 版式下升为**整宽主按钮**（`PRIMARY_BUTTON_CLASS`）；
  缩略图 3 列（≥ md 4 列）`gap-2` + `rounded-xl`；滚动收到根节点，文件夹与图片一起滚。
- **顺手修掉三处「一份 DOM 被两处消费」才有的毛病**：空列表下面不再挂「已经到底了」；
  批量选择操作条不再藏在 `md:` 之后（< md 之前它本来完全不可达）；
  已在「全部」时不再悬浮一个「全部」按钮。
- **i18n**：未新增词条（标题复用 `create.historyDrawer.openLabel`，副标题复用媒体名）。

**门禁**：`smoke-prompt-assembly` 把原来那条「整页子页」断言改成**两条几何判据**（76/76）：

| 断言 | 判据 | 旧形态会怎么红 |
|------|------|----------------|
| 换页占满主区、左导航保留 | 换页 `left ≥ 导航右边缘`、`right ≥ 视口右边`、宽度 ≥ 主区宽度 | 盖整屏 → `left=0`（实测红） |
| 换页是 page 版式 | `data-history-variant="page"` + 列宽 ≤ 800 + **在换页容器内**水平居中 | 用右栏版式 → 列宽 = 容器宽（实测红） |

两条都做了**负向对照**：把换页写回 `fixed inset-0` → 第一条读数 `left=0, position=fixed`、exit 1；
把版式写回 `variant="sidebar"` → 第二条读数 `columnWidth=1000`、exit 1；还原后 76/76。

**过程中撞到并写进断言注释的一件事**：这两条最初想用「命中测试」（`elementFromPoint` 落在导航里）
当判据，红了 —— 命中的是**首启的更新公告弹窗**（`fixed inset-0 z-[88] bg-black/50`）。
冒烟用全新 userData 启动，公告会一直盖在最上层，于是任何「导航可命中」的断言都在测公告、
而不是在测这次改动。结论：命中采样只留在详情串里当诊断，判据取几何。
（同一处插曲还有个教训：那两轮"冒烟挂死"其实是脚本自身语法错误 —— 页面侧字符串注释里写了反引号，
把外层模板串提前收尾；Electron 打不开窗口就一直挂着。改脚本后先 `node --check` 一次。）

**右栏没被改坏**：所有分支都挂在 `isPage` 上，`sidebar` 分支的类集合与改动前逐条等价；
另用一次性 Electron 截图工具（喂桩 IPC 数据，未提交）对 940 宽换页（含左导航）、700 宽（含移动底栏）、
深色模式与 1600 宽创建页各截了一张，右栏形态与用户提供的现状截图一致。

## 2026-09-19 — P0 定位并修复：「输出路径回落」在 IPC 边界是死代码

**症状（用户实测）**：设置页**显示**着默认路径 `…\Illusion Realm Output` 与「当前使用默认路径」，
但①生成后保存失败、报 `customOutputPath 必须是非空字符串`；②创建页列不出该目录里的图。
手动把路径选成同一个默认目录（store 里变成非空串）后，两条都恢复正常。

**根因（语句级，一处）**：`apps/electron/ipc-handlers/files.handlers.js` 里，
handler 函数体调用 `resolveOutputPath(customOutputPath)` —— 该函数的契约是
「用户未指定时回落到默认路径」，**显式处理空串**；但同一个 handler 的**校验器却要求非空**：

| 通道 | 旧校验器 | 后果 |
|------|---------|------|
| `FILES_SAVE_GENERATED_IMAGES` | `requireString(args[0], "customOutputPath")` | 空串被拒 → 保存失败（用户看到的报错原文） |
| `FILES_LIST_GENERATED_IMAGES` | 同上 | 空串被拒 → 创建页永远列不出默认目录 |
| `FILES_CREATE_HISTORY_FOLDER` / `FILES_LIST_OUTPUT_FOLDERS` | 同上 | 同样失效 |

其余通道只校验 `args[1]`，所以这个不对称一直没暴露。**「空 = 用默认路径」这条语义在边界上是死代码。**

**修法（契约层一处，而不是给 8 个调用点各补一次解析）**：
新增 `requireOptionalString(value, label)` —— 允许 `undefined` / `null` / 空串 / 纯空白（= 用默认），
但类型不对（数字 / 对象）仍然拒绝；四处 `customOutputPath` 校验改用它。
`filePath` / `dirPath` / `folderName` 等真必填字段仍走 `requireString`。

**门禁**：新增 `scripts/verify-output-path-contract.js`（纯 Node，桩替换 `appPaths` 避免拉 Electron），
已接进 `pnpm check`（`check:outputpath`）：
- 运行时：`undefined / null / "" / 空白` 都回落默认；**负向对照**显式路径原样保留、两侧空白被裁；
- 源码不变量：`files.handlers.js` 里 `customOutputPath` 的校验必须全为可选校验器
  （解析器自身有配对对照：`requireString` 必须被认出来，否则上面那条是恒真）；
- **负向对照已实测**：把保存通道的校验器改回 `requireString` → 门禁红并打印
  「改成 requireString 会让回落逻辑在 IPC 边界变成死代码」；还原后 11 项全过。

**顺带修掉一个「门禁天天喊狼来了」**：`apps/next/next-env.d.ts` 由 Next 自动重写、
后缀又正好是 `.ts`、还落在自动纳入的包根目录里 —— 于是**没有任何源码改动的两次冒烟都以 exit 2 收场**。
按「构建工具写出来的文件不是构建输入」把它排除出指纹（连同 `tsconfig.tsbuildinfo`），
`GENERATED_FILE_NAMES` 一处集中声明。这条若留着，就是教科书式的「报警被忽略然后关掉」。

**回归**：`pnpm check` 绿；`smoke-prompt-assembly` 66/66、`smoke-characters` 85/85。

## 2026-09-19 — 门禁体系落成一页（docs/testing-gates.md）；混沌模式补成功路径

**一、`docs/testing-gates.md`：新人上手地图**

汇总跑什么 / 退出码语义 / 八条机械校验的约定 + 违反后怎么办 / 豁免机制 /
台账字段与复查触发器 / 混沌模式 / 相关文档。写它的直接动因：这套门禁的形状已经稳定，
但知识散在 `AGENTS.md`（硬规则）、`known-flakes.js`（台账）、`logs.md`（决策）三处，
新人没有入口。

**二、豁免条目也会老化 —— 并入复查触发器**

`reviewTrigger` 的第三项（2026-12-19 回顾）现在写明要做三件事而不是两件：
重跑配对对照、**重估豁免理由**（`grep -rn "smoke-rules-allow" scripts/`）、
决定未定因降级还是续期。理由：`smoke-app.js` 的 `getComputedStyle` 豁免现在成立
（只读静态样式），但「将来开始断言过渡中间态或动画帧」会让它失效 ——
豁免从后门变成审计轨迹之后，审计本身也要有周期。

**三、混沌模式双向覆盖**

原 `--chaos` 只验证「错误期望必须被报成失败」（防把失败吞成成功），
对应的是「红灯被吞」；新增 `--chaos=pass` 验证相反方向（防把成功报成失败），
对应的正是上一轮实际发生的那种说谎（两例因错误的理由通过）。
两个方向都跑过：`--chaos` → 如实 FAIL + 整体 exit 0；`--chaos=pass` → 如实 PASS + exit 0。

**并把这条性质写进 docs/testing-gates.md（比命令耐用）**：调度层的正确性**无法由被测用例证明** ——
用例全绿只说明「在它自己的判断下没发现问题」，说明不了「它的判断本身是对的」；
唯一能证明它的是**故意造假的用例**。推而广之：凡「判断某件事对不对」的组件
（扫描器、比对器、调度器、护栏）都必须有一条故意造假的用例，
否则它只能证明自己没意见，不能证明自己对。

## 2026-09-19 — 把「约定」变成机械校验；给未定因绑触发器；自检说谎制度化

**一、负向声明不再靠人品：`pnpm check:smoke`（`scripts/check-smoke-rules.js`）**

两条规则进 `pnpm check`，且都**先剥注释再匹配**（否则文件头解释性提到 `matchMedia` 的注释会被误报）：

1. 声明「不适用 harness」的套件（`smoke-app.js` / `smoke-task.js`）里不得出现
   `requestAnimationFrame` / `matchMedia` / `getComputedStyle`。确有需要时用
   `smoke-rules-allow: <API>（理由）` 点名豁免 —— 豁免必须点名 API 并给理由，
   于是「重估」留下痕迹，未点名的 API 仍会被拦（有对应对照）。
2. 接入 harness 的套件不得直接调 `app.exit()` / `app.quit()`（出口收口一处）。

**这条校验第一次运行就抓到三处真实违规**，全部当场修掉：
- `smoke-app.js` 确实用了 `getComputedStyle`（读协议加载后的静态样式）→ 重估后点名豁免：
  遮挡下 `getComputedStyle` 会强制同步样式重算、读到当前值，不涉及过渡中间态，故结论成立；
- `smoke-gif-editor.js` / `smoke-video-editor.js` 在「未找到 ffmpeg」时直接 `app.exit(2)`
  → 收口到新的 `smoke.exitEnvironment(reason, { app })`（退出码 2 的统一出口，
  顺带把摘要也写进 `logs/smoke-runs.log`）。

规则自带 **9 条配对对照**（剥注释、豁免点名、未点名仍拦、真调用被抓…）。

**二、未定因绑触发器，已证实的写成不变量**

`harness/stdout-lost-on-exit` 补两处：
- `reviewTrigger`（**确定会发生的触发器**，三者取最早）：下次 Electron 升级 /
  CI 上首次观测到 stdout 截断 / 2026-12-19 门禁回顾；到期仍无新证据就降级为「已接受的风险」，
  而不是继续挂着当家具。
- `invariants`（两条已证实的行为，各有一条**机械用例**盯着，不再是笔记）：
  ① `app.quit()` 无视 `process.exitCode` → 用例 `quit-exitcode-ignored`（期望退出码 0；
  Electron 若改了，用例会红、说明护栏可以放宽）；
  ② 受控实验未复现 `app.exit()` 截断 → 用例 `stdout-completeness`
  （200 行 + `exit(7)`，外壳捕获管道断言末行完整：实测 203 行、末行完整）。

**三、调度层说谎制度化：混沌模式 + 永久失败**

- `self-test-harness-guard.js` 现在**缺 case 或未知 case 一律 exit 2**（不设默认分支：
  回落是危险控制流，「参数传错」不该看起来像「用例通过」）；
- `node scripts/self-test-gates.js --chaos`：故意给一个**错误期望**，要求调度层必须报成失败 ——
  实测「混沌：错误期望必须被报出来」被如实报 FAIL、整体 exit 0（= 自检没说谎）。
  这样调度层以后每次改动都能立刻知道它还在说实话。

**四、证据效力说明（一个决策点）**

此次修复意味着**此前护栏四例的「全绿」记录证据力下降**（其中两例是因为错误的理由通过的）。
影响面界定：那是**调度层**（`self-test-gates.js` 的护栏段）的误报，
六个套件本身是直接用 `npx electron` 跑的、不经过该调度层，故套件级记录不受影响。
当前没有依赖这些记录的发布/合并决策（仓库无发布流水），因此**记一笔、不回头考古**；
护栏段已用修好的 runner 重跑：**门禁自检 9/9 通过**。

**五、媒体查询模型抽成一页：`docs/media-query-event-loss.md`**

三通道不对称性表 + 降级链 + 失效上限 + 复现命令。并按 review 补了一条重要边界：
**本降级链仅对尺寸型 MQ 完备** —— `prefers-color-scheme` / `forced-colors` / `color-gamut`
这类非尺寸 MQ 变化时 `matches` 会变而 `resize` 不会，第二环失效；
将来用到任何非尺寸 MQ 必须在 `change` 里单独处理或在 `visibilitychange` / `focus` 上主动重查。

## 2026-09-19 — 门禁自检收拢成一条作业；顺带发现护栏自检自己是「恒真对照」

**一、resize 救场的精确形状：不对称性，而不是「遮挡时节流」**

把上一轮的时间线再读一遍会发现一个更值钱的事实：遮挡期间 `width` 已经是 1000、
`matches` 已经是 false，说明**三条通道表现不一致**：

| 通道 | 遮挡/隐藏期间 | 性质 |
|------|--------------|------|
| `matches` 查询 | **最新值**（读到 false） | 同步、可读 |
| `resize` 事件 | **照常派发** | 异步、可达 |
| `matchMedia` 的 `change` | **丢失** | 异步、丢失 |

这个不对称性才是根因的精确形状（可证伪），它一次解释两件事：
`SimpleSelect` / `TruncatedTextPopover` 一直没事（它们绑的是存活的那条通道）；
纯事件驱动的 `matchMedia` 写法会死，而「读为准」的写法能活。

**降级链与失效上限**（写进 `useMediaQuery` 注释，明确定义失效边界）：
`change` 丢 → `resize` 兜 → `resize` 也丢 → `visibilitychange` 兜 → 三者都丢 →
用户手动动一下窗口。仍会卡住的场景是「`matches` 变了但窗口尺寸没变」且页面始终可见
（现实中主要是缩放级别变化），这时只有 `visibilitychange` 或下一次 resize 能救。

**二、`generated-drift` 保持 exit 2，但错误信息给出修复命令**

它拦的不是「改了文档」，而是「**导出物与文档不一致**」——更新公告是面向用户的产物。
所以不降级为警告，只把反馈做成可执行：

```
EXIT 2 generated-drift: public/changelog.md 与 logs.md 不一致
      → 运行 pnpm build:next（内含 scripts/sync-changelog.mjs）后重跑；只改文档时也必须重建
```

**三、`smoke-app.js` / `smoke-task.js`：显式声明「不适用」而不是留着「未接入」**

两者都 `show: false`、只做静态导出页的样式/文本断言，不依赖 rAF / CSS 过渡 / matchMedia，
因此不受遮挡与事件丢失两条前提影响；harness 的三项收益（单步超时 / 页面侧标记 /
构建新鲜度）在这里没有落点。**半年后「遗漏」和「忘了接」无法区分，所以写进文件头**。

**四、5.9s 提前退出记入台账，状态标 `open-undefined-cause`**

与「stdout 截断」合并成一条 `harness/stdout-lost-on-exit`：写明**未定因**、
写明「app.exit() 必然截断」这个假设不成立（200 行受控实验没复现）、
写明真正被证实的是 `app.quit()` 无视 `process.exitCode`。

**五、门禁自检收拢成一条作业 —— 并在它自己身上抓到一次「恒真对照」**

`pnpm self-test:gate`（`scripts/self-test-gates.js`）把散在四处的故障注入固定下来：
Next 侧配对对照（16 项）→ 构建指纹确定性对照 → 退出码护栏四例 → 事件丢失维度（`=all`，
headless 可跑）。**新增 `.github/workflows/gate-self-test.yml`**（windows-latest：
本项目是 Windows 桌面应用，Electron 可直接启动、不需要 xvfb）。
遮挡维度刻意不进 CI —— 它需要真实可见窗口，无桌面会话时会被显式 SKIP。

第一次聚合运行时第 6 步失败，输出里打印的却是「故意失败的断言（自检用）」——
说明跑的根本不是指定的用例：**runner 把人类可读的标签当成了 CLI 参数**，
`self-test-harness-guard.js` 收到未知 case 后回落到默认分支（有失败 + `exit(0)` → 1），
于是前两例**因为错误的理由**通过（看起来全绿）、第三例期望 0 才暴露出来。

两处修法（都属于「对照程序自身也要防误用」）：
1. `label` 与 `caseId` 分开传；
2. 未知 case **响亮失败并列出可用值**（exit 2），不再回落默认分支。

修后：**门禁自检 7/7 通过**（未知 case 自检 exit 2）。

## 2026-09-19 — 归因、前置断言、退出码护栏、工具链可追溯

**一、A1：谁救的场 —— 时间线归因，不是推测**

上一轮只证明了「事件被吞掉也能纠正」，但恢复路径上 `change` 补发 / `resize` / `visibilitychange`
可能同时到，看不出是哪条救的。给 shim 加时间线打点后（`SMOKE_SWALLOW_MEDIA_EVENT=change`）：

```
variant=panel@117 → resize@1639 → change(swallowed)@1639 ×2 → variant=inline@1657
```

归因：**`resize` 救的场**。`change` 被吞（2 次尝试）、`visibilitychange` 那次根本没到
（页面全程 `visible`）。归因口径本身也踩了一次坑：不能取「翻转前一条」——
被吞的 change 会与 resize 挤在同一毫秒，简单取前一条会把「被吞掉的 change」误报成救场者，
必须取最后一条**非被吞**事件。

**二、A2：把结论写进产品注释**

`useMediaQuery` 的注释现在写明：① 恢复可见时的「补发」是实测行为、**规范不承诺，不得依赖**；
② 显式在 `change` / `resize` / `visibilitychange` 上重读 `matches`，`visibilitychange`
是第二层网（与尺寸变没变无关）；③ 时间线证据（`resize` 救场）与上述踩坑记录。

**三、B1：遮挡的前置断言 + headless 显式 skip**

- 覆盖后先 poll `document.visibilityState`：若不是 `visible` → **退出码 2** 并打印
  「遮挡在导航前生效，页面初始状态异常」+ 时机提示。踩过一次的坑不该让第二个人再推理一遍。
- 窗口不可见（纯 headless / 无桌面会话）→ **显式 SKIP 并打印原因**，不计入覆盖。
  静默通过和假红一样坏：它会让人以为这个维度被覆盖了。
- 退出码 2 的含义随之扩展为「环境/前置条件问题（构建产物过期、遮挡前提不成立）」。
- 两个维度按要求分开命名：`SMOKE_OCCLUDE=1`（遮挡，需真实窗口）vs
  `SMOKE_SWALLOW_MEDIA_EVENT=all`（事件丢失，headless 可跑，应进 CI）。

**四、D1：退出码护栏 + 护栏自检**

harness 装一次性护栏：
- `app.quit()` 一律拦下并改成 `app.exit(1)` —— 实测它**无视 `process.exitCode`**
  （`process.exitCode = 7; app.quit()` 退出码是 **0**），会把失败变成成功；
- 已有断言失败却 `app.exit(0)` → 强制改成 1 并报出是哪几条断言；
- 构建/前置条件判定（2）也记下来，避免被后续的 `app.exit(0)` 抹掉。

护栏自身有配对自检 `scripts/self-test-harness-guard.js`（三次独立进程）：
`exit-zero-with-failure` → 1 ✓ · `quit-with-failure` → 1 ✓ · `exit-zero-clean` → 0 ✓（不误伤）。

**五、C1：工具链可追溯字段**

指纹只覆盖源码（因而避开 Next 的随机 BUILD_ID），但也意味着「源码没变、只升级了工具链」
不可追溯。记录里因此新增 `toolchain` 字段（锁文件 hash + electron/next/react 版本），
过期原因里会补一句「属源码改动」还是「工具链也有变化：…」。
实测输出：`toolchain={"lockfileHash":"4aeebdbb…","versions":{"electron":"^43.1.1","next":"16.2.10","react":"19.2.4"}}`。

## 2026-09-19 — 遮挡机制的三个后续：产品侧定性、常驻维度、自检的反向对照

**一、产品侧定性：错过的 change 会补发，「永久停在旧变体」没有被复现**

上一轮把遮挡的机制钉到了语句级（matches 已重算、change 不派发）。这一轮先问一个更要紧的问题：
**解除遮挡 / 最小化恢复之后，变体是自愈还是永久停在旧值？** 探针（最小化 → hidden 期间把视口
1600 改成 1000 → 恢复窗口）：

| 阶段 | width | matches | change 事件 | 变体 |
|------|-------|---------|------------|------|
| 最小化后 | 1584 | true | 0 | panel |
| hidden 期间改视口 | **1000** | **false** | **0（不派发）** | **停在 panel** |
| 恢复窗口后 | 1000 | false | **1 次**（先到 `visibilitychange:visible` + `resize`） | **1ms 内翻到 inline** |

结论分两面：
- **不是**「用户恢复窗口后界面永久卡死」——Blink 在页面重新可见后的第一个生命周期补发了 change。
- 但「补发」是**实测行为、不是规范承诺**（规范只要求 `matches` 反映最新值）。正确性不该押在它上面。

因此 `useMediaQuery` 按「**以读为准、事件只做通知**」加固：`change` / `resize` / `visibilitychange`
三个触发都只做一件事 —— 重新读 `media.matches`。同族的 `SimpleSelect`（resize → 重测 rect）、
`TruncatedTextPopover`（resize → 重新 measure）本来就符合这条规则，未改动。

**二、加固的配对对照（同一份构建，靠页面侧 shim，不靠重新构建）**

`SMOKE_SWALLOW_MEDIA_EVENT` 在页面脚本执行前装 shim，把 `matchMedia` 的 change 事件吞掉：

| 模式 | change 被吞 | 冗余触发 | 结果 |
|------|------------|---------|------|
| `=change` | 2 次 | 保留 | **1ms 内翻到 `inline`**（读为准生效） |
| `=all` | 2 次 | **掐断 4 个监听** | **停在 `panel`，轮询超时 8046ms** |

`=all` 是负向对照：它把实现还原成「纯事件驱动」，证明正向那条不是「因为事件照常送达」才绿的。
同时断言 shim 真的生效过（`__swallowedMediaChanges > 0`），避免因错误的理由通过。

**三、遮挡从「复现开关」升级为常驻受测维度**

`smoke.hardenWindow(win)` 统一提供，`SMOKE_OCCLUDE=1` 即把整个套件跑在被遮挡条件下。
两个坑都是实测踩出来的：
- **时机**：遮挡必须在**页面加载完成后**才盖上。在 `loadURL` 之前就盖住会让页面「生来 hidden」
  （`visibilityState=hidden`、变体永远不翻）—— 那是另一个环境前提，会把维度测成假红。
- **断言什么**：`webContents.getLastWebPreferences()` 在 Electron 43 上**读不到** `backgroundThrottling`
  （实测 `undefined`），断言它等于断言空气。改成断言它的**可观测后果**：
  「被盖住时页面仍为 `visible`」。谁删掉那一行，这条立刻红。

另外把每次运行的摘要同步追加到 `logs/smoke-runs.log`（含 occlude 标记与失败断言名）：
stdout 是管道时异步写，`app.exit()` 有可能在排空前结束进程，文件写是同步的、不受影响。

**四、构建自检的反向对照：指纹本身会不会每次都变**

新增 `node scripts/record-build-fingerprint.js --compare`：把本次指纹与上次记录逐文件比对，
不同则列出差异文件并 `exit 1`（标注「构建产物非确定性」）。用途是 CI 上跑一次
「源码不变 → 连续两次 build → 指纹应相同」—— 这类报警一旦每次都响，就会被人直接关掉。

同时把清单从「靠人记着加」改成推导 + 不变量：
- 子包根目录的代码/配置后缀文件**自动纳入**（不靠记忆），跨包输入仍显式列；
- 显式清单里的文件若不存在 → 直接报 `input-list-rot`（清单腐烂比漏文件更危险）；
- 新增生成物不变量：`apps/next/public/changelog.md` 必须与 `logs.md` 一致
  （它是构建期副本，不一致就说明导出用的是旧更新日志）→ `generated-drift`。
- 顺带回答一个疑问：指纹清单（384 个文件）**包含** `apps/next/public/changelog.md`，
  且它与 `logs.md` 的哈希相同 —— 清单自动覆盖 public 树，不需要手工添加。

**五、遗留 2（stdout 截断）的确定性复现：没有复现出来，且原定修法有坑**

按「先复现、再动手」做的实验（打印 200 行定长文本后分别用三种方式退出，外壳数行数）：

| 退出方式 | stdout 行数 | 退出码 |
|----------|------------|--------|
| `app.exit(7)` | 200（末行完整） | 7 ✓ |
| `process.exitCode = 7; app.quit()` | 200（末行完整） | **0 ✗** |

两个结论：
1. **200 行整段输出没有被截断** —— 「`app.exit()` 必然截断 stdout」这个假设**不成立**。
   本轮确实遇到过两次结论整段丢失，但用这个实验复现不出来，成因仍未定，
   所以**不动退出机制**（改了就是「我觉得好像好了」）。
2. `app.quit()` **无视 `process.exitCode`**（实测退出码 0）。原定的修法方向会**把红灯变成绿灯** ——
   这个坑比它要修的问题严重得多，已记录在此，避免以后有人照着改。
   真要动手，必须保留显式退出码（`app.exit(code)` 或 `process.exit(code)`）。

## 2026-09-19 — 冒烟抖动定位到语句级：遮挡 → 渲染生命周期停摆

**一、问题**：`smoke-prompt-assembly` 接入共享 harness 后，窄屏变体断言 3 次里失败 2 次，
同一份代码改动前单独重跑却通过。失败细节只有一句
`variant=panel innerWidth=1000` —— 分不清「超时」还是「值不对」。

**二、先钉成因，再动手**：写了一次性探针（不进仓库），在同一遮挡条件下只切换
`backgroundThrottling`，对照结果：

| 条件 | visibilityState | rAF 增长 | matchMedia change 事件 | 变体 |
|------|-----------------|---------|----------------------|------|
| 默认节流 + 被遮挡 | `hidden` | 0（停摆） | **0 次（永不派发）** | 停在 `panel` |
| `backgroundThrottling:false` + 同样遮挡 | `visible` | 正常 | **1 次** | 翻到 `inline` |

关键细节：遮挡时 `matchMedia('(min-width:1280px)').matches` **读出来已经是 `false`**、
`innerWidth` 也已经是 1000 —— **查询重算了，只是 change 事件不派发**。
所以 `useMediaQuery` 的 React state 停在旧值，`data-prompt-assembly-variant` 永远不翻；
**加长轮询时间救不了这条断言**（事件不派发时超时是必然结果）。

这与 `smoke-anima-workflow` 的静默挂死（rAF 永不 settle）是同一根因族。

**三、修法与验证**：
- 冒烟窗口 `webPreferences.backgroundThrottling: false`（消除前提，不是兜底）；
- 断言改用 `waitForVariant()` 轮询并**回报命中/超时与耗时**，细节里带
  `matches` / `visibility` —— 下一次失败能一眼看出是哪一类；
- 负向对照（可复现，不再靠运气）：`SMOKE_OCCLUDE=1` 会额外开一个盖住被测窗口的置顶窗口。
  把 `backgroundThrottling` 改回默认值 → 断言稳定红
  （`轮询超时[8078ms] variant=panel matches=false visibility=hidden`），
  保持 `false` → 稳定绿（`轮询命中[1ms] variant=inline`）。
- 5 次连跑全绿；命中耗时 1ms/768ms/442ms/1ms/1ms，恢复宽屏 13ms/1968ms/2015ms/9ms/28ms
  —— 8000ms 的上限对最坏观测值仍有约 4 倍余量。

**四、顺带查清的两件事（都推翻了原来的判断）**
- `smoke-characters` 的「收起后高度 74px」**不是 UI bug，是采样假象**：把读数从
  `sleep(600)` 改成「等页面上的动画跑完 + 高度连续两次不变」后，读到
  `height=0 / gridRows=0px / animations=[]`（140ms 内落定）—— 原来那 600ms 是在过渡首帧之前读的。
  同一条断言从 84/85 变 85/85。判据本身也写进失败细节：`animations` 非空 = 时序问题，
  为空且高度非 0 = 代码问题。
- 陈旧 `apps/next/out` 会被**机器**拦住：`next build` 后由
  `scripts/record-build-fingerprint.js` 记录 379 个源码文件的逐文件 sha256，
  冒烟开跑前比对，不一致就 `exit 2` 并点名是哪几个文件变了。
  负向对照：往源码树加一个文件 → `record-stale` + 点名；删掉 → 通过。
  只改 mtime、内容不变（`git checkout/stash`）**不误报** —— 比的是内容，这一步是刻意设计。

**五、harness 成为唯一实现**：`smoke-anima-workflow` 的内联副本（约 200 行）删除，
改用 `scripts/lib/smoke-harness.js`，迁移后 102/102 全绿；抖动台账抽成
`scripts/lib/known-flakes.js`，断言失败时自动打印命中记录与按需复现步骤。

## 2026-09-18 — 图片内嵌 Meta 的摸底：原始前提被推翻，改为补版本标记

**一、摸底用什么做的**

新增 `apps/next/scripts/survey-image-meta.mjs`：`--discover <根>` 先找出「含本生成器产出图」
的输出目录，再对目录跑分档统计。判据与线上 `utils/sdImageInspector/parseComfyWorkflow.ts`
完全一致（PNG 文本块 → 关键字属于 `{prompt, workflow, Comment}` → `isComfyApiPrompt` 校验），
零新依赖（复用 `png-chunks-extract` / `png-chunk-text`）。

**二、摸底数字**

口径：**分母 = 输出目录下能列出的全部图片**（不是「本生成器产出的图」——那会把
「外部导入、从来没有 Meta」这一类恰好排除掉，而它正是要统计的对象）。

- 发现 3 个输出目录：dev 默认 3 张、打包版默认 25 张（含子目录「流萤」18 张）
- **N = 28**，扫描于 2026-09-18
- **无内嵌 Meta 占比 0%（0/28）**；28/28 都能解析出 Comfy API prompt 图
- 「无任何文本块」0 / 「有块但无可识别关键字」0 / 「有 Comfy 关键字但校验不过」0 /
  A1111 `parameters` 0；出现过的文本块关键字只有 `prompt`

**三、原始前提被推翻（这是本轮最重要的产出）**

原计划是「7 处数据契约型字面量需要兼容读旧文件 + 迁移脚本 + 测试覆盖」。摸底发现这个前提
对其中 6 处**根本不成立**：

- `提示词` / `负面提示词` / `其他参数` / `文件名` / `文件大小` / `完整生成信息` 这 6 个
  中文字段名**从未落盘**：它们由 `inspectSdImage` 在**读取时**合成，消费者只有
  `remixFromInspect` 的 A1111 回退路径与 `MetaFieldRow` 的展示。落盘的 PNG 块关键字
  是全 ASCII 的 `prompt` / `workflow` / `Comment`。**没有格式，就没有兼容问题。**
- `首帧` / `尾帧` / `时长` 这 3 个是真契约（比对仓库内工作流 JSON 的 `_meta.title`），
  但两侧都是我们自己的文件，且应用内没有工作流编辑器、用户不会修改它 ——
  同一次提交里改 JSON + 代码即可。

**四、真正的问题：版本标记从未写进图片**

`saveGeneratedImagesToDisk` 只嵌入 `metaDocument.workflow`，而
`version` / `promptId` / `createdAt` / `params` **全部被丢弃**（`promptId` 只用于文件名）。
后果：

- `GENERATED_IMAGE_META_VERSION` 目前是个**死常量**，图上没有任何版本信息
- 「有 `prompt` 块但版本对不上」这一档**不可测** —— 今天 28/28 都是「无标记」的图
- 今天的「是不是本生成器生成」完全靠**结构匹配**（能否解析并反推参数），不是版本协商
- 未来任何格式变更都无法在旧图上识别，症状会表现为「某类图突然不能二创」

**五、决议**

选方案 B：先把 9 处字面量常量化，再给落盘 Meta 补独立版本标记块
（`illusionRealmMeta`，**不动** `prompt` 块 —— 它与发给 ComfyUI 的 API Prompt 必须逐字一致，
冒烟有断言），读取侧对**无标记的旧图按 v1 推理**，保证今天这 28 张仍可二创。
做法与约束写进 `AGENTS.md` 的「数据契约与格式变更」段（含「反向检查先于进度」
「先当前格式、再旧格式」「格式脚本必须 process.exit(1)」三条）。

## 2026-09-18 — 工程化收尾：IPC 契约统一 / 主进程类型化 / ESLint 清零 / 接入 i18n

**一、跨 IPC 边界统一为 `IpcResult`（不再抛异常）**

- 通道名集中到 `packages/shared/src/ipc-channels.ts`（34 条），主进程在 `apps/electron/ipcChannels.js`
  保留同值副本，两端一致性由 `scripts/verify-electron-modules.js` 断言
- 新增 `packages/shared/src/ipc-result.ts`（`ipcOk` / `ipcErr` / 错误码），主进程 handler 统一走
  `apps/electron/ipcHandlers.js` 的 `registerHandle`：入参校验失败返回 `INVALID_ARGUMENT`，不泄露堆栈
- 新增 `packages/shared/src/schemas/`（Zod）作为形状的单一事实来源；主进程因 zod 不进 asar，
  使用等价的手写校验器
- 渲染进程用 `apps/next/src/utils/ipcResult.ts` 的 `unwrapIpc`（写操作，失败抛错）与
  `unwrapIpcOr`（读操作，失败回落默认值并 warn）消费返回值

**二、主进程手写 CommonJS 全量纳入类型检查**

- `apps/electron/tsconfig.json` 打开 `checkJs`，`@ts-nocheck` 从 26 个降到 **0**；
  `apps/electron/scripts/check-nocheck.js` 保留基线断言（只减不增）
- 修法上避免用 `any`：`comfyProxy` 用 `typeof import("../comfyProxy")` 打破循环推断，
  `preload.js` 用 shared 的 `ElectronAPI` 类型做整体标注

**三、渲染进程 49 个既有 ESLint error 清零**

- `react-hooks/set-state-in-effect`（35）统一改成 React 官方的「记录前值 + 渲染期比较」写法；
  `react-hooks/refs`（14）改 `useSyncExternalStore` / `useLayoutEffect` / `useMemo` 等
- **过程中引入并当场修掉一个回归**：8 个弹窗把「前值」只在 `open` 为真时记录，关闭时不更新，
  于是第二次打开时 `open === 前值` 恒成立、重置被跳过，残留上次的搜索/已选/草稿。
  该缺陷由 `smoke-prompt-assembly` 抓出（动作库第二次打开时上次选中项仍在，
  测试点同一张卡片变成「取消选择」→ 应用按钮变灰 → 正常模式「插入」断言失败）

**四、接入 i18n（零依赖强类型方案）**

- 新增 `apps/next/src/i18n/`：`t()`（非组件模块）与 `useTranslation()`（组件，订阅语言变化）；
  语言状态走 Zustand；不引 i18next / next-intl（静态导出 + `app://` 协议下 next-intl 的路由方案用不了，
  i18next 的 key 只能运行时发现）
- key 由 zh-CN 词条表推导为点分路径联合，写错 key 在 `pnpm typecheck` 阶段报 TS2345（已做负向对照）
- 导航（侧栏 / 移动端底栏 / 未实现提示）已迁移；新增 `apps/next/scripts/check-i18n.mjs`
  统计硬编码中文并接入 `pnpm check`（基线只减不增），以及
  `apps/next/scripts/verify-i18n-values.mjs` 机检「被搬走的文案是否逐字进了词条表」

**五、冒烟脚本修复**

- 六个驱动真实 preload 的脚本补 `sandbox: false`（手写 CommonJS preload 需要 require 本地模块）
- 脚本内注册的 IPC stub 统一包装成 `IpcResult` 形状，否则被 `unwrapIpc` 判为失败

**验证**：`pnpm typecheck` / `pnpm lint`（0 error，22 warning）/ `pnpm check` 全绿；
`verify-electron-modules`、`smoke-ipc-result`、`smoke-app`、`smoke-task`、`smoke-view3d`、
`smoke-characters`（85/85）、`smoke-prompt-assembly`（66/66）、`smoke-anima-workflow`、
`smoke-gif-editor`、`smoke-video-editor` **全部 exit 0、零 FAIL**。

**六、i18n 批量迁移（第一批模块）**

- 按功能域建立词条命名空间，一批一个文件、互不覆盖：`create` / `view3d` /
  `promptAssembly` / `cartoon` / `toolBox`（另有 `common` / `nav`）
- 已迁完：导航（侧栏 / 移动端底栏）、创建页大部分（10 个组件 + 3D 视角 + 提示词组装）、
  漫画对话框整块、视频剪辑台整块、GIF / EXIF / 工具箱外壳
- 硬编码中文从 **1152 降到 72**（期间扫描口径还变宽过一次：补上 JSX 子元素里的三元分支、
  排除词条表自身，因此这个差值不等于迁移量）。剩下的 72 处是有意保留的：
  内容素材 64（画作标题 / 角色名 / 字体名 / 预设提示词内容）、
  「数据契约型」字面量 7（元数据字段名与工作流节点标题，需按字面量比对）、
  Next metadata 1
- 词条表最终 16 个命名空间：页面域 `create` / `view3d` / `characters` /
  `promptAssembly` / `cartoon` / `toolBox` / `home` / `inspect` / `settings` /
  `profile` / `updates`，横向域 `common` / `nav` / `components` / `errors` / `taxonomy`
- `src/data/**` 里的界面标签（分类 Tab 名、筛选项名、系列名、教程标题）沿用
  `Localized* = Omit<…> & { …: MessageKey }` 模式改存 key，
  没有让 `packages/shared` 反向依赖 i18n
- 关键约束：**zh-CN 词条值与原字面量逐字一致**（标点 / 全角半角 / 空格），
  否则冒烟脚本的精确文案断言会挂；跨元素拆开的句子只换静态片段，
  不把多个文本节点合并成单个插值串

**七、为这次迁移加的两道机检**

- `apps/next/scripts/check-i18n.mjs`：AST 统计硬编码中文，接进 `pnpm check`，基线只减不增
  （负向对照：随便加一句中文 JSX 文本即 exit 1）
- `apps/next/scripts/verify-i18n-values.mjs`：迁移期校验。把 base 版本里面向用户的中文
  减去当前仍在的部分，要求剩下的每一句都能在 zh-CN 词条表里逐字找到；
  嵌套模板字符串这类整句无法原样入表的情况，退一档要求「每一段连续中文都有下落」
  并单独列出（否则「迁移它」与「校验通过」会互相矛盾）
- 过程中真实抓到的问题：扫描器把词条表自身的 `title:` / `description:` 值当成硬编码文案
  计入基线（基线虚高 12 处）；一次让子代理改 25 个文件的批量失败
  ——它给 19 个文件加了 `useTranslation()` 却没替换任何文案，已整体 revert 并改为小批次

**八、扫尾：把扫描器看不到的文案也捞出来**

- 新增反向审计脚本 `apps/next/scripts/audit-uncounted-i18n.mjs`：列出「含中文字面量
  但被统计为 0」的文件（40 个），用来反查整类漏检。靠它补上三类漏检形状：
  1. `throw new Error("中文")` 整类 —— 双重原因：`Error` 被错放进「非 UI 调用」名单，
     且 `new Error(...)` 是 **NewExpression** 不是 CallExpression，往上找 callee 时直接跨过去了。
     这类文案会经 ipcResult / `showToast(err.message)` 直接显示给用户（补迁 12 处）
  2. `return` 直接返回中文字面量（如 `directionLabel()` 的横排 / 竖排）
  3. 可选 props / 函数参数默认值里的中文（写在函数体外求值的位置，最容易硬编码）
- 最后一批 35 处落在更偏的写法里：模块级标签映射表、模块级数据数组的 name/badge、
  三元回退、`catch` 里的提示、解构参数默认值（16 个文件、6 个词条表）
- 两条经验：**扫描器是启发式的，基线数字不等于「全部」**；
  组件文件里的映射表要存 `MessageKey`、用组件的 `t` 取值
  （模块级 `t` 会被 hook 的 `t` 遮蔽，并冻结在 import 时刻）
- 过程中还抓到一处自己引入的隐患：`inspectSdImage` 产出的 `无` 已入表，
  但 `remixFromInspect.ts` 仍按中文字面量比较它 —— zh-CN 下仍匹配，
  本质是「把可翻译文案当哨兵值」。接入第二门语言前必须连同元数据字段名、
  工作流节点标题一起改成稳定的英文 key（已写入 README 待办）

## 2026-09-16 — 动作库 / 背景库入口搬到提示词下方按钮行，摄像机按钮补中文「3D 视角」

- 提示词输入框下方的按钮行现在依次是：**画师 | 角色 | 动作库 | 背景库 | 3D 视角**
  - 新增 **动作库**（PersonStanding 图标）与 **背景库**（Mountain 图标）按钮，位于「角色」右侧、与其它按钮同一行，整行都在**反向提示词上方**
  - **摄像机按钮**由纯图标改为「图标 + 3D 视角」文字（保留 tooltip / aria-label「3D 视角」），与其它按钮风格一致
- 写入规则沿用已定约定：**普通模式 = 插入**到单一提示词框末尾；**高级组装模式 = 覆盖**对应分类（动作库 → `姿势`、背景库 → `背景`）
- 右侧组装面板里「姿势 / 背景」分类内的动作库 / 背景库入口保持不变，两处入口行为一致

**验证**：`smoke-prompt-assembly` 扩到 **66 项全通过**，新增：按钮行顺序与位置（动作库/背景库在「角色」右侧、同一行、反向提示词之上）、摄像机按钮中文文案与图标、以及**普通模式下从按钮行打开动作库确认是「插入」而非覆盖**（`keep-me, arm support`）；`smoke-view3d`、`smoke-characters`、`smoke-anima-workflow`、`smoke-task`、`smoke-app` 复跑无回归。

## 2026-09-16 — 修复打包版启动即崩（主进程 require 了未打包的 axios）

- **现象**：安装后的应用一启动就弹 `A JavaScript error occurred in the main process — Cannot find module 'axios'`（`app.asar/electron/animadex.js`）
- **根因**：`axios` 只是 **devDependency `wait-on` 的传递依赖**，虽然本地 `node_modules` 里有，但 electron-builder 只把 `package.json` 的 `dependencies` 打进 asar —— 开发环境正常、打包版必崩
- **修复**：`electron/animadex.js` 改为使用 **内置 `fetch` + `URLSearchParams` + `AbortController`**（与 `comfyProxy.js` 一致），彻底去掉第三方 HTTP 依赖：
  - 20s 超时（AbortController）、非 2xx 时带状态码与响应片段的可读报错
  - `normalizeCharacter` 仍只透传界面需要的字段
- **防复发**：`verify-electron-modules` 新增**主进程依赖审计** —— 扫描 `electron/**` 的所有 `require`，断言每个第三方模块都在 `dependencies` 里（可选兜底模块 `ffmpeg-static`/`ffprobe-static` 显式白名单，因为它们包在 try/catch 内、本来就不打包）；另新增 `normalizeCharacter` 与「animadex 不依赖 axios」的断言
- **验证**：`verify-electron-modules` 全绿；重新打包后**实际启动** `dist\win-unpacked\Illusion Realm.exe`，主进程 4 个进程正常、窗口标题为「Illusion Realm」、无任何错误弹窗（此前该步骤必现 Cannot find module）

## 2026-09-15 — 静态标签库（动作库 / 背景库）接入高级组装 + 工具型弹框改为「高级模式覆盖」

**一、静态标签库（复用角色选择器 UI，动作与背景共用一个实现）**
- 数据源：`src/data/prompt/pose_prompt.ts`（动作 297 条 / 8 分类）与 `src/data/prompt/background_prompt.ts`（背景 1087 条 / 4 分类），纯静态随应用打包、不联网
- **一套实现两处复用**：`TagLibraryDialog` + 卡片 / 工具条 / 分类侧栏全部按 `prefix`（pose / background）与文案参数化，外观与角色选择器**完全同一套排版**：
  - 工具条：搜索（固定宽度左浮动）+ 排序（默认 / A-Z）+ 单选多选 + 复制已选 / 只看已选 / 清除已选（右浮动）
  - 左侧 Saber 导航：**全部分类（N）** + 分类列表（可收纳）+ 只看已选（N）
  - Main：4 列卡片（预览图 + 中文名 / 英文名 + 分类标签 + 标签预览），选中态与角色卡一致
  - 底部分页：复用角色选择器分页组件（新增 `itemLabel` / `testIdPrefix`，显示「共 1,056 个背景」）
  - footer：左侧「已选择 N 个动作/背景」，右侧 `取消 / 应用 Tags`
- **数据清洗**：背景数据集里 30 条 `duplicate: true` 的占位条目与 1 条空标签条目会被过滤（1087 → 1056），动作库的 `tags` 统一带结尾逗号会先剥掉；多选应用时**去重保序**，不会出现双逗号或结尾逗号
- **抽样检查**（按需求不必全量）：断言校验动作库 297 条 / id 唯一 / 8 分类 / 无缺字段，并**随机抽样 20 条**逐条检查 tags、preview、分类（全部通过）
- 入口：高级组装面板「**姿势**」→ 动作库、「**背景**」→ 背景库（与 3D 视角 / 角色库同一位置）

**二、工具型弹框在高级模式下的写入规则修正**
- **角色库 / 3D 视角 / 动作库 / 背景库** 应用提示词时：
  - **高级组装模式 → 覆盖对应分类**（角色 → `角色`、3D → `镜头视图`、动作库 → `姿势`、背景库 → `背景`），并自动切到该分类；
  - **普通模式 → 插入**到单一提示词框末尾（行为不变）。
- 统一由 `applyToolPromptText(text, tab)` 实现；创作页中间区的入口与右侧组装面板里的入口行为完全一致
- 面板提示文案同步改为「确认后直接覆盖「X」（普通模式下为插入）」

**验证**：`scripts/smoke-prompt-assembly.js` 扩到 **61 项全通过**（数据集审计、动作库/背景库的卡片·工具条·分类栏·分页·footer、分类筛选、搜索、选中应用、**覆盖「姿势」/「背景」分类**、以及 3D / 角色 / 动作库 / 背景库四个工具**预置旧内容后确认被替换**）；`smoke-characters`(85)、`smoke-view3d`(91)、`smoke-anima-workflow`(102)、`smoke-task`、`smoke-app`、`verify-electron-modules` 复跑无回归。

## 2026-09-15 — 高级提示词组装（任务规范 v2.1 · 方案 A：右侧面板联动）

**一、全局开关**
- 「提示词」标题右侧新增 **高级** Toggle（默认关闭）：关闭时保持原来的单一输入框、不占任何额外空间；开启后激活分类 Tab / 自定义分类 / 模板等高级排版，并在中间区提示词框旁提供 **🪄 组装** 入口（一键打开组装面板）
- 高级模式下中间提示词框变为**只读**（内容由分类自动拼接），关闭开关后恢复可编辑并保留拼接结果，可继续手动修改

**二、右侧面板联动（方案 A）**
- 开启高级后，创作页右侧原本的「文件夹 / 图片预览」面板临时切换为 **提示词组装面板**（顶部有「返回图库」）；关闭即恢复图库
- 窄屏（右栏被隐藏）时组装面板**就地展开在提示词框下方**，保证任何窗口尺寸下都有入口，且 DOM 中始终只有一份面板实例（`useMediaQuery` 断点 + `variant=panel/inline`）

**三、7 大分类 + 逗号自动拼接（核心算法）**
- 分类 Tab：**质量词 | 镜头视图 | 画师风格 | 角色 | 服饰 | 姿势 | 背景**，每个分类独立多行输入框，已填分类显示角标、顶部显示「N/M 已填」
- 拼接规则严格按文档：按 Tab 顺序遍历非空输入框，**结尾已有英文逗号则直接拼接，否则自动补 `, `**，结果实时写入只读的**合并预览**（带一键复制），并同步回中间提示词框
- 生成时直接使用拼接结果（`readPromptText()`），因此二创、角色/3D 插入等既有链路无需改动

**四、复用既有功能：镜头 → 3D 视角 / 角色 → 角色选择器**
- 「镜头视图」分类内有 **3D 视角** 按钮 → 打开既有的 3D 视角提示词生成器，确认后结果自动追加进「镜头视图」分类
- 「角色」分类内有 **角色库** 按钮 → 打开既有的角色选择器（animadex），确认后触发词 / 标签自动写进「角色」分类
- 高级模式下角色选择器、3D 视角、片段、二创的写入统一走 `appendPromptText/setPromptText`，会落到**当前选中的分类**，不会写进看不见的框里

**五、自定义分类与模板（均落盘到 `illusion-realm.json` 的 `createForm` 段）**
- 自定义分类：可新增（如 `光效`、`色彩`，最多 12 个）、可删除（默认 7 个不可删）、可改名；每个分类可配置「快捷插入词」（点击追加到当前分类，可增删）
- 模板：输入名称保存当前所有分类的填写状态，下拉列表一键加载（模板里没有的分类保持原样）、可删除；默认 7 个分类即使被删也会在加载时自动重建

**验证**：新增 `scripts/smoke-prompt-assembly.js`（**39 项全通过**）：默认关闭状态与只读切换、面板/图库互斥、7 大分类与不可删校验、快捷插入词、逗号拼接（含「结尾已有逗号不产生双逗号」）、空分类跳过、实时同步、角标、**镜头 Tab 打开 3D 视角并写入拼接结果**、**角色 Tab 打开角色选择器并写入拼接结果**、自定义分类增删、模板保存/加载/删除、用户数据落盘、**生成时使用拼接结果**（截获 API Prompt 校验）、关闭后恢复图库与可编辑、窄屏就地展开（DevTools 设备度量覆盖）。`smoke-anima-workflow`(102)、`smoke-characters`(85)、`smoke-view3d`(91)、`smoke-task`、`smoke-app`、`verify-electron-modules` 全部复跑无回归。

## 2026-09-15 — 修复「生成完毕后取图 404」（ComfyUI /view 的文件夹类型被丢掉）+ 下载兜底

- **根因**：`collectOutputFiles` 从历史记录里取出的字段叫 `folderType`，而下载函数 `fetchFileDataUrl` 读的是 `file.type` —— 于是文件夹类型永远是 `undefined`，请求被固定成 `type=output`。
  - `SaveImage` 写的是 `output`，所以 Anima 一直是好的；
  - `PreviewImage` 写的是 `temp`，用 `output` 去取必然 **404** —— 这正是「SDXL 换用 PreviewImage 的基础工作流后无法检索到图片资源 / 显示 404」的原因。
  - 现在历史记录解析会把 `type`（`output`/`temp`/`input`）原样保留并透传给下载。
- **下载兜底（`buildViewCandidates`）**：除了原样参数，还依次尝试
  1. `subfolder` 反斜杠 → 正斜杠（ComfyUI 只认 `/`）；
  2. `filename` 里自带子目录时拆成 `subfolder + basename`；
  3. `type` 依次回退 `output → temp → input`（原类型优先）。
  正常情况下第一个候选就命中，只是 1 次请求；全部失败时错误信息会带上**完整 URL 与 HTTP 状态**，便于定位。
- **工作流**：SDXL 基础工作流的输出节点被改成了 `SaveImage` 但缺少必填的 `filename_prefix`（标题也还是「预览图像」），已补为 `filename_prefix: "SDXL"` 并把标题更正为「保存图像」，与 Anima（`filename_prefix: "Anima"`）保持一致。
- **验证**：`verify-electron-modules` 现在会**真起一个假 ComfyUI**（只允许 `type=temp` 下载）做端到端断言 —— 类型正确时一次取回、类型报错时自动回退到 `temp` 取回、`subfolder` 反斜杠时也能取回、彻底失败时错误信息含 404 与 URL；另断言历史解析保留 `type`、候选顺序与子目录拆分。`smoke-anima-workflow`（102 项）与 `smoke-view3d`（91 项）复跑无回归。

## 2026-09-15 — 生成参数只存图片内嵌 Meta（不再产 JSON 旁车）+ 模型系列切换重置 + 3D 提示词体系重建

**一、生成参数只写在图片里（不再生成 `.json` 旁车）**
- **保存链路**：`files:saveGeneratedImages` 不再写 `<name>.json`；保存前把 ComfyUI 工作流（API 格式 JSON）嵌进 PNG 的 `tEXt` 块，图片本身就是唯一数据源
- **修复关键 bug（之前图片里根本没有参数）**：PNG 的 `tEXt` 块只允许 Latin-1 字符，而 ComfyUI 工作流里一定有中文节点标题（「K采样器」「加载CLIP」…），`png-chunk-text.encode` 会直接抛错，被上层 catch 后**静默跳过嵌入** → 于是二创/详情永远解析不到参数。现在把非 ASCII 字符转成 `\uXXXX` 转义再写入（仍是合法 JSON，解析结果完全一致），并只替换我们自己写的 `prompt` 块（ComfyUI 自带的 `workflow`/`Comment` 保留）
- **读取链路**：移除 `files:readGenerationMeta` IPC（主进程 / preload / 类型 / 工具函数）与「本地解析」页的旁车面板；二创数据统一由 `inspectImageMetaForRemix` 从图片内嵌 Meta 解析（正面提示词 / 反向提示词 / 模型 / LoRA 链与权重 / 种子 / 步数 / CFG / 采样器 / 调度器 / 尺寸）
- **解析器补强**：`parseComfyWorkflow` 除传统 `CheckpointLoaderSimple.ckpt_name` 外，还识别本应用 Anima 工作流的 `UNETLoader.unet_name`（以及 `model_name`），保证「模型」字段能正确解析
- **不可识别时的提示**：生成图详情弹框与「本地解析」页在解析不到工作流时明确显示 **「非本生成器生成」**（并说明无法解析提示词 / LoRA，二创按钮禁用）
- 历史遗留的 `.json` 旁车仍会在移动 / 删除图片时一并清理（`legacySidecarPathForImage`）

**二、模型系列切换（Anima ⇄ SDXL）自动重置**
- **LoRA 清空**：切换系列即清空已选扩展（跨系列不通用）
- **模型切换**：按新系列重新选中本地模型（Anima → diffusion_models，SDXL → checkpoints）
- **默认参数取该系列基础工作流**：采样器 / 调度器恢复为模板值（未自定义状态）、步数与 CFG 取模板值、尺寸取模板默认尺寸（能对上预设就用预设，否则用自定义宽高）
  - Anima 基础流：`euler_ancestral + simple`、steps 15、cfg 1、1000×1000
  - SDXL 基础流（新的「标准SDXL生成.json」）：`euler + karras`、steps 15、cfg 8、1000×1200
- 新增 `5:6`（1000×1200）尺寸预设与 `findImageSizePresetBySize()` 反查；高级设置的步数 / CFG 输入框补上 `aria-label`
- `View3DScene` 的 `maxPolarAngle` 放宽到 `π × 0.9995`，让「垂直仰视（-90°）」能真正到达极值

**三、3D 视角提示词体系按《AI 提示词动态生成》重建（旧的一套作废）**
- **Z 轴（半径 → 景别）**：`extreme close-up`(<1.5) / `close-up`(<3) / `medium shot`(<4) / `cowboy shot`(<5) / `full body`(<6.5) / `wide shot, scenery`(≥6.5)，**互斥只输出 1 个**且权重 1.0（裸词条）
- **X 轴（方位角 → 朝向）**：<30° `front view:3.0`；30~60° `front view` 3.0→2.0 与 `facing left/right` 1.0→3.0 共存；60~120° `facing left/right:3.0`；120~150° `from behind` 2.0→3.0 与 `facing` 3.0→1.0 共存；≥150° `from behind:3.0`；区间取左闭右开，接缝处与文档公式连续
- **Y 轴（俯仰角 → 视角）**：|el|≤20° 不输出；20~45° 1.5→2.0；45~90° 2.0→3.0
- **水平朝向随俯仰衰减**：`horizontalFactor`（平视 1.0 → 45° 时 2/3 → 90° 时 0），据此文档示例完全对得上：斜俯视 `(front view:2.0), (high angle:2.0)`、垂直俯视只有 `(high angle:3.0)`、拼接示例 `full body, (front view:2.0), (low angle:2.0)`
- **输出格式**：`[景别] + [朝向] + [视角]`，权重 1.0 的词条不带括号，>1 写成 `(tag:2.0)`
- **快捷视图**严格对应文档第五节 8 个按钮（正面 / 正侧视左脸 +90 / 正侧视右脸 -90 / 背面 180 / 斜俯视 0,+45 / 斜仰视 0,-45 / 垂直俯视 0,+90 / 垂直仰视 0,-90）
- **增强倍率**（原「增强滑块」保留为可选倍率层）：X / Y / Z / 总系数四个滑块，默认全 1 = 文档原值，最低 1，最高按系列（Anima 3.0 / SDXL 2.0，即文档第七节的权重上限），倍率放大后按上限收敛，权重不足 1 的词条不输出
- **新增精确角度输入**：面板里的方位角 / 俯仰角改成可直接输入的数值框（拖拽受阻尼影响只能拖个大概，要精确拿到某个过渡角度就靠输入）

**验证**：
- `scripts/smoke-anima-workflow.js` **102 项全通过**（新增 12 项）：不再生成任何 `.json`、图片内嵌 `prompt` 块与发送的 API Prompt 完全一致、从图片 Meta 解析出正面/反向提示词与 2 个 LoRA 及采样参数尺寸、普通 PNG 解析为空（= 非本生成器生成）、切换 SDXL 后 LoRA 清空且采样器/调度器/CFG/尺寸取 SDXL 基础工作流值、切回 Anima 同样重置为 Anima 基础工作流值、切换后可重新自定义
- `scripts/smoke-view3d.js` **91 项全通过**（按新规范重写）：快捷视图 8 条逐条精确比对、方位角与俯仰角各区间边界（30/60/120/150、25/45/70/-70/15）、水平朝向随俯仰衰减、尺寸与倍率组合、SDXL 上限 2.0
- `smoke-characters`（85 项）、`smoke-task`、`smoke-app`、`verify-electron-modules` 复跑无回归

## 2026-08-31 — 3D 视角提示词生成器：增强权重（X / Y / Z / 总系数四个滑块 + 加权标签）

- **新增增强权重面板**（3D 弹框右侧面板，`src/view/create/view3d/View3DEnhanceSection.tsx`）：
  - **四个滑块**：X 轴（左右朝向）、Y 轴（俯仰）、Z 轴（景别远近）、**总系数**（对三轴整体缩放）
  - **全部默认 1（强度 ×1）**，**最低 1**（不可低于基线），最高 **Anima 3 / SDXL 2**（切换系列时自动按新上限收敛）
  - 每个滑块下方**实时显示该轴当前会输出的加权标签**，并提供「全部重置为 1」；数值写入 `illusion-realm.json` 的 `view3d.enhanceWeights`
- **X 轴（from front / from behind / facing left / facing right）**：
  - 正对角色脸部 → `(from front:3.0)`（滑块拉满 3 时），完全背对 → `(from behind:3.0)`；**这两种情况下不会出现 facing left/right**（占比在 0°/180° 恰好归零）
  - 逐步转向侧面时 **facing 权重逐步升高、front 逐步降低**（45° 时两者各占 cos45/sin45 → 3 强度下各 2.1）
  - **越过 90° 后 front 变成 behind**；看角色**左脸**（相机在角色左侧）→ `facing left`，右脸 → `facing right`
  - 为便于取用，快捷视角补了「正侧视（右脸）」一档（270°），原「正侧视」标注为「正侧视（左脸）」
- **Y 轴（high angle / eye-level / low angle）**：最高点 high angle 拉满 → 平视 eye-level → 最低点 low angle 拉满，中间线性过渡（80° 强度 3 → `(high angle:2.7)`，-45° → `(low angle:1.5) (eye-level:1.5)`）
- **Z 轴（extreme close-up → close-up → medium shot → cowboy shot → full body → wide shot）**：按距离在相邻两档之间按占比加权，最近 `(extreme close-up:·)`、最远 `(wide shot:·)`
- **权重规则**：权重 = 占比 × 轴向滑块 × 总系数；**占优标签至少保留 1**，其余标签权重不足 1 时丢弃 —— 这样默认全 1 时每个轴只给一个 `(tag:1.0)`（仍是有意义的视角描述），拉高后才出现多标签混合
- **提示词预览**分三段展示：基础视角（原规范映射）/ 增强权重（带权标签）/ 插入内容（基础 + 增强），点「确认并插入」时写入**基础 + 增强**的完整内容
- **实现**：纯逻辑集中在 `src/utils/view3d/enhanceWeights.ts`（不依赖 three.js / React），面板组件只负责渲染与回调
- **验证**：`scripts/smoke-view3d.js` 从 60 项扩到 **85 项全通过**（新增 25 项），新增断言覆盖：面板与 4 个滑块存在、min=1/max=3/默认全 1、正对 `(from front:3.0)` 且无 facing、背对 `(from behind:3.0)` 且无 facing、90° `(facing left:3.0)`、270° `(facing right:3.0)`、45° 两者同时出现且都低于拉满值、强度 1 时只留占优标签、俯仰角越高 high angle 越大、强仰视 low+eye 混合、最近 `(extreme close-up:3.0)`、最远 `(wide shot:3.0)`、档位之间加权混合、总系数 ×2 权重整体翻倍、重置按钮、SDXL 上限 2 与越界收敛、权重落盘、插入内容含增强标签；`smoke-anima-workflow`、`smoke-characters`、`smoke-task`、`smoke-app`、`smoke-video-editor`、`smoke-gif-editor`、`verify-electron-modules` 复跑无回归

## 2026-08-31 — 角色选择弹窗（animadex）：抽屉收纳动画 / Saber+Main 布局 / 分页与搜索工具条 / 提示词抽屉过渡

**一、创建页提示词抽屉的收起 / 抽出改为自然过渡**
- 新增通用 `src/components/CollapsiblePanel.tsx`：内容**始终留在 DOM 中**（contentEditable 内容不丢），高度由 `ResizeObserver` 实测，在 `0 ↔ 真实高度` 之间做 `height` + `opacity` 过渡；收起时给内容加 `inert`，避免 Tab 聚焦到看不见的输入框
- 提示词与反向提示词两个抽屉都改用它（**替换原来的 `hidden` 硬切换**）：抽出/收回都是平滑滑动，不再「咔」地跳变
- 踩坑记录：先试了流行的 `grid-template-rows: 0fr → 1fr` 技巧，在本机 Chromium 下轨道仍按内容高度结算、不收起（`computed grid-template-rows` 恒为 `128px`），因此改成实测高度的方案
- 另一个环境坑：**隐藏窗口 / 被遮挡窗口下 Chromium 会暂停 CSS transition**，冒烟脚本必须 `show: true` 且 `alwaysOnTop: true` 才能采到中间帧
- 顺带修掉两处噪音：`View3DPromptDialog` 的 `exitFullscreen` 提前引用（改为先声明）、快捷视角 nonce 用递增 ref 替代渲染期 `Date.now()`；退出全屏只在「确实进入过窗口全屏」时才调 `window:setFullScreen`，避免无效 IPC 报错；`View3DScene` 的 ref 写入改到 effect 内

**二、角色选择弹窗结构（复用 `ResourceDialogShell`）**
- 弹窗仍复用创作页共用外壳（与模型/扩展选择器同一父组件），`bodyScroll=false` 由内部自行划分固定区与滚动区
- 布局按反馈改为 **Saber（左导航）| Main（右展示区）两个独立区域**，二者是同一行的兄弟节点：
  - **Main 内**：卡片展示区（唯一滚动容器）+ **分页固定在卡片区正下方**（属于 Main，不在 Saber 之下、也不再放在弹窗 footer 里）
  - **Saber 内**：字母（固定不折叠）+ 收藏（可收纳）+ 作品（可收纳、列表内部滚动）；面板整体不滚动，滚动卡片区时侧栏纹丝不动
- footer 只保留：左侧「已选择 N 个角色」，右侧 `取消 / 应用触发词 / 触发词+Tags`（**去掉 √ 图标，只留文字**），左右分居两端
- 工具条：**搜索框收窄到 220px 并左浮动**，排序（热度 | 最新，横向）/ 单选多选 / 复制已选 / 只看已选 / 清除已选 整体右浮动

**三、抽屉收纳（收藏 / 作品）**
- 标题行整行可点：箭头是一个 `>`，展开时**顺时针旋转 90° 变 ↓**，收起转回 `>`，旋转自带 300ms 过渡
- 段落内容用高度过渡展开/收起（不卸载、不闪烁），默认收起
- 两段各自独立记忆展开状态（组件内 state）

**四、分页 UI 重做**
- 左浮动：`共 N 个角色 | 显示第 X-Y 个`（X/Y 由当前页与每页条数算出）
- 右浮动：`首页 / <上一页 / 下一页> / 尾页`
- 中间：`1 / N 页` 页码指示，**数字是可自定义输入的输入框**（回车或失焦跳页，自动夹在 1..N 内），风格与左右分页按钮统一（白底 + `#E5E7EB` 描边 + 浅灰内框 + 主题色聚焦环），不做突兀的实心高亮
- 翻页后卡片区滚动位置回到顶部

**五、其他**
- 移除独立的 `/characters` 页面与导航项（角色库只作为创建页「画师」右侧的弹窗入口存在）
- 新增主进程 axios 客户端 `electron/animadex.js`（`animadex:search` IPC，避开渲染进程 CORS）；`verify-electron-modules` 增加该 handler 断言
- 清理临时探针脚本

**验证**：`scripts/smoke-characters.js` 重写并扩到 **85 项全通过**：入口位置、复用弹窗外壳、卡片 24 张 / 4 列 / 白底 12px 圆角、工具条顺序与搜索框宽度（220px）与左右浮动、Saber 与 Main 兄弟关系、分页归属 Main 且紧贴卡片区底部、分页文案与四个按钮与页码输入跳页、抽屉 `>`/`↓` 旋转（**采样到旋转中间帧**）与高度过渡（**采样到中间帧 3→24→51→65→71→74**）、侧栏与卡片区滚动互不干扰、多选/单选、复制/只看已选/清除已选、应用触发词（不带 Tags）与触发词+Tags（去重）、排序/搜索防抖/翻页、收藏落盘与只看收藏、作品与字母筛选、详情浮层插入；`smoke-anima-workflow`（提示词与反向提示词抽屉的过渡动画 + 内容不丢）、`smoke-task`、`smoke-app`、`smoke-video-editor`、`smoke-gif-editor`、`smoke-view3d`、`verify-electron-modules` 全部复跑通过

## 2026-08-31 — 修复退出全屏后布局未复原 + 3D 模型导入历史（记忆位置 / 倒序 / 去重）

- **修复「退出全屏后没有回到最初状态」**：
  - 根因：全屏态与常态的几何都写成 Tailwind 类并**叠加**在同一元素上（`-translate-x-1/2` 与 `translate-x-0`、`h-[min(86dvh,720px)]` 与 `h-dvh`、`w-[…]` 与 `w-screen` 同时存在），谁生效取决于 **Tailwind 生成 CSS 的顺序**而不是类名顺序 —— 退出后弹框可能仍被放大/错位，看起来就是"全被覆盖"
  - 修复：**几何改用内联样式**（内联优先级固定，必然覆盖类），且常态/全屏态给出两组互斥的内联对象；右侧面板改用内联 `display`/`flexBasis` 控制，不再依赖 `.hidden` 类切换
  - 三条退出路径（按钮 / Esc / 浏览器退出元素全屏）统一走 `exitFullscreen()`：退出 DOM 全屏 + 还原 Electron 窗口全屏 + 复位状态；关闭弹框与组件卸载也各有一道兜底
  - 新增 `layoutKey`（全屏模式）传进 3D 场景，布局切换后再补一帧强制 `renderer.setSize` + 相机 aspect，避免 ResizeObserver 与动画竞态导致画面被拉伸
- **模型导入记忆（新增）**：
  - **记住上次导入的位置**：选择文件时把上次模型所在目录作为 `defaultPath` 传给文件对话框（IPC 增加参数）
  - **历史列表**：面板新增「历史模型（新→旧）」，每条显示文件名 + 相对时间（刚刚 / N 分钟前 / N 小时前 / N 天前），点击即加载；**按路径去重**（重复导入会置顶而不是新增），最多保留 12 条，支持一键清空
  - 历史与当前模型写入 `illusion-realm.json` 的 `view3d.modelHistory`（拖拽导入时同样记录，路径由 preload 的 `getPathForFile` 取回）
- **验证**：`scripts/smoke-view3d.js` 扩到 **60 项**，其中新增严格几何断言：退出全屏后 `dialogMode=none`、**弹框重新居中**、右侧面板可见、**左 70% / 右 30%**（实测 0.699 / 0.299）、标题栏回归；无边框全屏 Esc 退出同样复原；关闭再打开仍是最初分栏；以及历史顺序（second | fixture）、相对时间、从历史加载、历史落盘、选择文件时 `defaultPath` = 上次目录

## 2026-08-31 — 3D 视窗全屏（窗口化 / 无边框两种方案 + 快捷键与提示，仅作用于 3D 区域）

- **只作用于 3D 区域**：进入全屏后隐藏右侧面板与弹框标题栏，只剩 3D 画面（预览数据仍在状态里，退出即恢复分栏）
- **两种方案**：
  - **窗口化全屏**（默认）：3D 区域铺满**应用窗口**，保留应用窗口边框；纯 CSS 实现，进入时把弹框自身改为 `inset-0`（否则内部 `fixed` 会被弹框的 `translate` 形成的包含块困住）
  - **无边框化全屏**：先调用**元素级 DOM Fullscreen**（真正的无边框，只剩画面，Esc 退出）；环境不支持或没有用户手势时，**回退到 Electron 主窗口全屏**（新增 IPC `window:setFullScreen`，复用现有窗口，**不新开窗口**）
- **快捷键**（弹框打开时生效，输入框/contentEditable 内不拦截）：**`F` 窗口化全屏（默认）**、**`Shift + F` 无边框全屏**、**`Esc` 退出全屏**（Esc 优先退全屏，不会顺手关掉弹框）；关闭弹框时自动退出全屏
- **提示文本**：3D 区域左下角常驻提示 `左键拖拽环绕 · 滚轮缩放 · 拖入 .glb 替换模型 · F 窗口化全屏 · Shift + F 无边框全屏`，进入全屏后改为「已进入窗口化全屏 · F 或 Esc 退出」/「已进入无边框全屏 · Esc 退出」，回退时附注说明
- **按钮**：3D 区域右上角两个按钮（窗口化全屏 / 无边框全屏），全屏时额外出现「退出全屏」
- **验证**：`scripts/smoke-view3d.js` 扩到 **50 项**：两个入口按钮存在、提示文本含快捷键、初始未全屏、窗口化全屏**实测铺满 `window.innerWidth/innerHeight`** 且右侧面板隐藏、`F` 可进可退、`Esc` 退出全屏且**不关闭弹框**、无边框全屏进入成功（回退路径被真实调用：`window:setFullScreen` 调用记录）、退出后恢复分栏布局

## 2026-08-31 — 3D 视角：角色模型可替换（拖拽 / 选择 .glb，自动归一化并记忆）

- **模型来源**：`src/utils/view3d/modelLoader.ts` 用 `GLTFLoader` 支持 **.glb / .gltf**；内置程序化模特作为默认与兜底
- **两种替换方式**：
  - **拖拽** .glb/.gltf 到 3D 视窗（File API 直读 `arrayBuffer()`，不依赖网络与自定义协议）
  - **选择文件**按钮（新增 IPC `view3d:pickModel` + `view3d:readModelFile`，走字节流读取，避免打包环境下跨协议 fetch 的坑；单文件上限 64 MB）
- **自动归一化**（关键，否则景别全错）：按包围盒缩放到目标身高 **1.8**、水平居中、脚底贴地 `y=0`；面板实时显示「已归一化：高 x.xx，约 N 面」
- **朝向修正**：0/90/180/270 可选（glTF/FBX 角色常朝 -Z，而本场景约定 +Z 为正面）
- **长期记忆**：模型路径与朝向写入 `illusion-realm.json` 的 **`view3d` 段**（新增 `useView3DStore` + AppShell 水合 + mergeDocument 合并）；重新打开弹框自动读回上次模型，文件缺失时回退内置模特并提示
- **其他**：`appProtocol` 补 `.glb`/`.gltf` MIME；preload 暴露 `getPathForFile`（Electron 新版已移除 `File.path`），拖拽后也能记住路径
- **验证**：`scripts/smoke-view3d.js` 扩到 **37 项**，用**手写的合法 .glb fixture**（0.5×2.0×0.3 长方体）真实走完整链路：默认内置模特 → 选择 .glb 后替换成功 → **归一化高 1.80（原始 2.0）/ 12 面** → 路径写入用户 JSON → 重开弹框自动加载 → 恢复默认模特 → 拖拽替换 → 朝向修正生效；`verify-electron-modules` 增加两个 view3d handler 断言（45 项），`smoke-anima-workflow`（77 项）、`smoke-task`、`smoke-app` 复跑无回归

## 2026-08-31 — 3D 球体视角提示词生成器（Three.js，task/任务.md 需求一 + 需求二）

**需求一 · 3D 视角与映射算法**
- 新增 `three@0.180` + `@types/three`（首个 3D 依赖）
- `src/view/create/view3d/View3DScene.tsx`：原点人物（图元拼装模特，无需外部模型资源）+ 半透明线框轨道球 + XYZ 坐标轴 + 地面网格；`OrbitControls` 支持左键环绕、滚轮缩放、触屏；每帧用 `THREE.Spherical` 反算方位角 / 俯仰角 / 半径，并按「签名变化」回调，避免无意义重渲染；无 WebGL 环境自动降级为提示文案
- `src/utils/view3d/promptMapping.ts`（纯函数，便于复用与测试）严格实现规范表格：
  - 方位角 8 分位：0±22.5 `front view`、22.5–67.5 / 292.5–337.5 `three quarter view`、67.5–112.5 / 247.5–292.5 `side view`、112.5–157.5 / 202.5–247.5 `back view`、157.5–202.5 `from behind`
  - 俯仰角 6 档：60–90 `bird's-eye view, top-down shot`、30–60 `high angle shot, from above`、15–30 `slightly from above`、-15–15 `eye-level shot`、-30–-15 `low angle shot, from below`、-60–-30 `worm's-eye view`
  - 景别按半径：Anima（R=5）0–2 / 2–3.5 / 3.5–4.5 / 4.5+，SDXL（R=8）0–3 / 3–5 / 5–7 / 7+，对应 `close-up, portrait` / `upper body, half body` / `full body` / `wide shot, full body, scenery`
  - 输出顺序固定为 **[景别] + [俯仰角] + [方位角] + [特殊镜头语言]**（顶视补 `overhead shot`、强仰视补 `extreme low angle`、背面补 `looking back over shoulder`）

**需求二 · UI 集成**
- 入口：提示词输入框左下角、与「画师」按钮并排的**相机图标**（Tooltip / aria-label 均为「3D 视角」）
- 弹框（`src/view/create/view3d/View3DPromptDialog.tsx`）：居中模态，**左侧 70% 3D 视窗 / 右侧 30% 面板**；面板含实时提示词预览、**模型适配切换（Anima / SDXL，切换时距离回到该系列默认 R）**、快捷视角（正面/四分之三侧/正侧/背面/斜俯视/垂直俯视/斜仰视/强仰视）、相机距离滑块与 φ/θ/r 读数，底部「确认并插入」
- 回传：确认后关闭弹框，并把提示词**追加到主提示词框末尾**（`appendEditableText` 自动补逗号分隔，避免与已有标签粘连）
- 可维护性：映射表、场景、弹框分成三个文件，映射逻辑零 three 依赖；快捷视角与距离滑块既是交互便利，也让映射表可被确定性验证

**验证**：新增 `scripts/smoke-view3d.js`（**29 项全通过**）：入口位置/Tooltip/与画师并排、弹框打开与 canvas 初始化（真实 WebGL）、左右分栏 70/30、方位角 4 组、俯仰角 5 组（含极端补充词）、景别 4 档、SDXL 切换默认 R=8 且半径 6 时与 Anima 结果不同、提示词顺序断言、确认后追加到输入框；`smoke-anima-workflow`（77 项）、`smoke-task`、`smoke-app`、`verify-electron-modules` 复跑无回归

## 2026-08-31 — 提示词抽屉（可收起）+ 提示词教程弹框（随系列切换，内置静态 md）

- **提示词抽屉**：提示词与反向提示词标题行右侧新增收起/展开按钮，收起后只保留标题与「已收起」提示行，节省竖直空间
  - **实现要点**：收起用 CSS `hidden` 隐藏而不是条件渲染 —— `contentEditable` 的内容不随 React 状态保存，一旦卸载再挂载会把已写好的提示词/预设内容清空（该问题由冒烟脚本当场抓出并修复）
- **提示词教程弹框**：创建页「模型（UNet）选择器」下方的入口按钮，**文案与内容随模型系列切换**
  - Anima 系列 → 「如何为 Anima 编写提示词？」，内容为 Anima 混合提示词格式（Danbooru 标签 + 自然语言）教程
  - SDXL 系列 → 「如何为 SDXL 编写提示词？」，内容为 SDXL 提示词结构/权重/负面向/分辨率教程
  - 入口位置按反馈调整到**模型选择器下方**（替换原先写死文案、无点击行为的占位按钮），画师按钮旁不再放教程入口
- **弹框与 markdown 复用**：
  - `src/components/DocumentDialog.tsx`：从「更新公告」弹框抽出通用文档外壳（固定头部 + 可滚动正文 + 底部按钮），更新公告与教程共用
  - `src/components/MarkdownDocument.tsx`：轻量 markdown 渲染（标题/列表/引用/分隔线/代码块/行内代码/粗体/链接），无第三方依赖
- **静态数据存放**：教程正文放在 `src/data/promptGuides/{anima,sdxl}.ts`（导出 markdown 字符串，随应用打包、无需联网与额外 IPC），由 `src/data/promptGuides/index.ts` 按系列取用；内容参考 Anima 官方 README 与社区写作指南，并在文档内标注来源链接
- **验证**：`scripts/smoke-anima-workflow.js` 扩到 **77 项**新增断言：两个提示词框可收起/展开且**内容不丢**（含预设内容）、教程入口位于模型选择器下方且在提示词区域之前、不在画师按钮同一行、Anima/SDXL 切换后入口文案与弹框标题/正文同步切换、教程正文含代码块与标题（markdown 真实渲染）；其余套件复跑无回归

## 2026-08-31 — 反向提示词预设 + 提示词框限高滚动 + 图片尺寸改造（训练友好分辨率/自定义宽高）

**提示词输入框**
- 提示词、反向提示词（以及视频面板提示词）统一限高 **220px**、超出可滚动，并**隐藏滚动条**（`PROMPT_EDITOR_SCROLL_CLASS`：`max-h-[220px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`）

**反向提示词预设**（`src/view/create/NegativePromptSection.tsx`）
- 反向提示词上方新增预设入口，UI 与「高级设置 → 预设提示词」一致（`bg-muted/50` 卡片 + 「使用中：xxx」+ 图标按钮），点击弹出弹框
- 弹框复用 `src/components/PresetDialogShell.tsx`：该外壳从原 510 行的 `PresetPromptDialog` 抽取，**画师预设与反向预设共用同一套列表/新建/保存 UI**，`PresetPromptDialog` 现仅为配置壳（约 110 行）
- 内置预设 `src/data/negativePresetPrompts.ts`：
  - **解剖 / 融合修正（加权）**：用户提供的整段加权负面（权重语法 `(tag:1.2)`）
  - **SDXL 通用负面**、**二次元（Illustrious / NoobAI）**、**写实向**、**精简负面**、**不使用负面**（社区通行写法，参考 [SDXL 分辨率与通用负面](https://stablediffusionxl.com/sdxl-resolutions-and-aspect-ratios/)、[SeaArt NoobAI XL 指南](https://docs.seaart.ai/guide-1/6-permanent-events/high-quality-models-recommendation/noobai-xl)）
- 选中预设后**直接写入反向提示词输入框**，仍可手动修改；自定义预设支持新建/删除，**持久化到 illusion-realm.json 的 `negativePresets` 段**（新增 `useNegativePresetStore` + AppShell 水合 + `mergeDocument` 合并）

**图片尺寸**（`src/view/create/ImageSizeSection.tsx` + `src/data/imageSizes.ts`）
- 预设比例改为**模型训练友好分辨率**（SDXL 分桶，1024² 面积）：1:1 `1024×1024`、2:3 `832×1216`、3:2 `1216×832`、3:4 `896×1152`、4:3 `1152×896`、9:16 `768×1344`、16:9 `1344×768`（依据 [SDXL Resolutions](http://stablediffusionxl.com/sdxl-resolutions-and-aspect-ratios/)、[ostris/ai-toolkit buckets](https://github.com/utopic-dev/ostris_ai-toolkit/blob/main/toolkit/buckets.py)）
- 新增**自定义宽高**模式：64–**1500**、自动对齐 8 像素（达到上限时保留 1500），两个数字输入框实时生效
- 每个比例都有**对应比例的 SVG 图标**（`AspectRatioIcon`，按比例绘制矩形，无需额外素材）；卡片排布为 `[图标] 比例` + 下一行实际像素（如 `1:1` / `1024×1024`）
- 旧持久化数据兼容：已下线的比例（如 4:5）加载时兜底为默认比例（`sanitizeAspectRatio`），宽高同样夹取

**验证**：`scripts/smoke-anima-workflow.js` 扩到 **59 项**新增断言：两个输入框限高/可滚动/隐藏滚动条、预设入口按钮、弹框含内置预设（含加权负面）、选中后写入输入框、新建自定义预设并**确认写入用户 JSON**、图片尺寸 8 个按钮且全部带 SVG 图标、预设标签含 `1024×1024`、自定义 1500×1200 **真实进入 EmptyLatentImage**、预设内容进入负面编码节点；`smoke-task` / `smoke-app` / `verify-electron-modules` / 视频与 GIF 冒烟 / 三个 ffmpeg 校验脚本全部通过

## 2026-08-31 — 修复误用放大模型（unet_name value_not_in_list）+ 采样器/调度器默认取工作流模板

- **现象**：提交报 `prompt_outputs_failed_validation` / `value_not_in_list`，`unet_name` 收到 `upscale_models\4xESRGAN\4x-ESRGAN.pth`
- **根因**：检索路径指向整个 ComfyUI `models` 目录时，扫描会把 `upscale_models/*.pth` 一并当作 checkpoint 收录，而「自动选中第一个本地模型」的逻辑挑中了它，于是被写进 `UNETLoader.unet_name`
- **修复（三层）**：
  1. **扫描时剔除**（`useSettingsStore.collectModelsFromPaths`）：`upscale_models`、`vae`、`clip`、`text_encoders`、`controlnet`、`embeddings`、`style_models`、`clip_vision` 等非扩散模型目录不再进入模型列表（新增 `NON_DIFFUSION_MODEL_DIRS` / `isNonDiffusionModelPath`）；只在 checkpoint 类型上生效，LoRA 目录不受影响
  2. **默认选择按系列限定**（`getDefaultLocalSelectedModel(models, series)`）：anima 只从 `diffusion_models` 下挑、sdxl 只从 `checkpoints` 下挑，并排除上述目录；切换系列时会重新挑选
  3. **提交前校验**（`buildGenerateParams.assertUsableDiffusionModel`）：命中非扩散模型目录或不在当前系列模型目录时，直接抛出可读中文提示（不再让用户只看到 ComfyUI 的 400）
- **采样器 / 调度器默认取模板自带的**：`getImageWorkflowDefaults(series)` 从工作流 JSON 的 KSampler 读取模板值——Anima 显示 `euler_ancestral + simple`，SDXL 显示 `euler + karras`；创建表单的采样器/调度器在「未自定义」时按当前系列模板显示与提交（`useCreateFormStore` 的 `sampler/scheduler` 改为 `null = 未自定义`，避免用同步 effect 回写状态），用户随时可切换
- **验证**：`scripts/smoke-anima-workflow.js` 扩到 **38 项**——测试配置改为与用户一致（检索路径指向整个 models 目录 + 预置 `upscale_models/4xESRGAN/4x-ESRGAN.pth`），断言：放大模型不出现在 Anima 模型列表、`unet_name` 始终为 Anima 模型、采样器/调度器初始显示为模板值；连同规范清单、输出节点、图片区显示、`smoke-task`、`verify-electron-modules`、`verify-gif`、`smoke-app` 全部通过

## 2026-08-31 — 修复 ComfyUI 400「prompt_no_outputs」：Anima 工作流补输出节点

- **现象**：Anima 生成提交报 `ComfyUI 提交失败 (400): prompt_no_outputs / Prompt has no outputs`
- **根因**：`标准anima生成流.json` 只有 1–7、9 号节点（VAEDecodeTiled 之后**没有任何输出节点**，恰好缺 8 号位），ComfyUI 会直接拒绝没有输出节点的 Prompt；SDXL 工作流一直有 `PreviewImage` 所以正常
- **修复**：补回 **8 号 `SaveImage`** 节点（`filename_prefix: "Anima"`，`images` 连接 `["9", 0]`，即 VAE 解码结果），与既有节点编号不冲突
- **防复发**：`buildImagePrompt()` 新增输出节点校验（class_type 含 save/preview 视为输出节点），缺失时抛出可读中文错误而不是等 ComfyUI 返回 400；`scripts/smoke-anima-workflow.js` 新增「工作流包含输出节点」「输出节点连接到 VAE 解码结果」两条断言（现共 **34 项**全通过）

## 2026-08-31 — Anima 工作流规范落地（采样器/调度器/LoRA 串联）+ 生成结果不显示修复

按 `task/任务.md`《ComfyUI Anima 工作流动态生成规范》逐条实现并验证：

- **需求 1 · 采样器与调度器**：`src/data/createForm.ts` 的 `SAMPLERS` 改为规范 2.1 的 **22 个值**（euler … uni_pc_bh2，顺序一致，另保留此前要求的 4 个 CFG++/exp_heun 补充项）；新增 `SCHEDULERS`（规范 2.2 的 normal/karras/exponential/sgm_uniform/simple/ddim_uniform）与 `DEFAULT_SCHEDULER`；两者 value **原样写入** `workflow["5"].inputs.sampler_name` / `.scheduler`
- **需求 1 · 调度器可选项**：创建表单新增「调度器」下拉（`createFormStore.scheduler` → `buildGenerateParams` → `CreatePage` → 工作流）；把仅服务采样器的 `SamplerSelect` 泛化为通用 `src/view/create/OptionSelect.tsx`，采样器与调度器共用（选项带 `data-value`，便于测试与审查）
- **需求 2 · UNet 替换**：`workflow["7"].inputs.unet_name` 由所选模型决定（沿用既有链路，本次纳入自动化断言）
- **需求 3 · LoRA 动态注入**（`imageWorkflow.ts: injectUserLoras`）：节点 ID **从 100 递增**（100/101/…）、类型 `LoraLoaderModelOnly`、**精确数量**（选几个就是几个）、链路 `UNETLoader(7) → LoRA(100) → … → KSampler(5).model`、CLIP 链路完全不经过 LoRA；**零 LoRA 边界**时 `KSampler(5).model` 直连 `[7, 0]`（原实现用 `user_lora_N` 命名且不保证链首，已按规范重写）
- **规范 4.6 · 生成结果不显示在图片区**：图片区此前「只要磁盘列表非空就只显示磁盘图」，而磁盘列表来自**已打开**文件夹、保存目标来自**已选中**文件夹，两者不一致（或落盘刷新慢半拍）时新图完全不显示；现在**刚生成的预览永远排在第 0 位**，磁盘图片顺延（同步修正画廊索引换算），落盘成功后照旧刷新列表
- **视频拖动实时跳帧修复**：暂停状态下以指针频率连续赋 `currentTime`，会让正在进行的 seek 一直被改写目标而始终完不成，画面只在松手时跳一次；现改为 **seek 串行化**（同一时刻只允许一个 seek 在途，拖动中的最新目标在 `seeked` 后立即接续，另有 1.2s 卡死兜底）；实测连续拖动落点序列 `0 → 0.35 → 0.7 → 1.05 → 1.4 → 1.75 → 2.1 → 2.45 → 2.8`，每步都刷新
- **验证**：
  - 新增 `scripts/smoke-anima-workflow.js`（**31 项**）：真实跑创建页 → 选 Anima 模型 + 2 个 LoRA → 改采样器/调度器 → 生成，**截获真实 API Prompt** 逐条核对规范检查清单（LoRA 数量/ID/类型/串联/末端接入/CLIP 未被干扰/零 LoRA 边界）+ 采样器与调度器注入 + UNet 替换 + 结果落盘与**图片区显示**（磁盘已有旧图时仍显示新图）
  - `scripts/smoke-video-editor.js` 扩到 **58 项**，新增「连续拖动时 seek 逐个完成 / 到达多个不同位置 / 位置单调推进」断言
  - `smoke-gif-editor.js`（50 项）、`smoke-task.js`、`verify-electron-modules.js`、`verify-video-edit.cjs`、`verify-video-concat.cjs`、`verify-gif.cjs`、`smoke-app.js` 全部通过

## 2026-08-31 — GIF 帧率改为「可输入 + 下拉」组合框；导出只改前缀名

- **帧率控件重做**（`src/components/SimpleNumberCombobox.tsx`，参考简约 combobox 惯例：左输入框 + 右下拉箭头）：
  - 点击**左侧输入框**可键入自定义帧率，失焦/回车提交；非法输入回退原值，超出范围自动夹取（`1–120`，实测输入 300 → 120、0 → 1）；聚焦时全选便于直接覆盖输入
  - 点击**右侧 ↓ 箭头**展开预设列表 `1/5/10/20/30/60/120`，当前值高亮、「20」标注**推荐**；点选即生效并收起；点外部或 Esc 关闭
  - 预设值与上下限集中到 `src/data/gifForm.ts`（`GIF_FPS_OPTIONS`/`GIF_FPS_MIN`/`GIF_FPS_MAX`）
- **导出文件名只改前缀**：`ExportPanel` 新增 `fileNameSuffix`，GIF 面板把 `.gif` 作为**固定后缀**展示（输入框只编辑前缀名，不必手写扩展名，也不会写错格式），导出时仍统一走 `normalizeOutputFileName()` 兜底补全扩展名
- **验证**：`scripts/smoke-gif-editor.js` 扩到 **50 项**——组合框为 `input[role=combobox]`、默认 20、箭头展开、预设列表与推荐标记、当前值高亮、点选生效并收起、自定义 45 生效、越界夹取、`.gif` 固定后缀、前缀名导出为 `我的动图.gif`、更换文件夹后沿用前缀、同名追加 ` (2)`；`smoke-video-editor.js`（53 项）、`verify-electron-modules.js`（43 项）、`verify-video-edit.cjs`、`verify-video-concat.cjs`、`verify-gif.cjs`、`smoke-task.js`、`smoke-app.js` 全部通过

## 2026-08-31 — 输出路径体验：文件夹可反复更换 + 文件名可自定义 + 未选文件夹时走「保存文件」

- **文件名可自定义**：导出面板新增文件名输入框（默认填入按参数自动生成的名字，如 `clip-a_x2.mp4`、`clip-a_x2_10fps_160px.gif`），并带「恢复自动命名」按钮；输入框保留**原始输入**（不在输入过程中补扩展名，避免打断打字），下方提示「实际导出为：xxx」；导出时统一走 `normalizeOutputFileName()`：过滤 Windows 非法字符、缺扩展名自动补（GIF 强制 `.gif`）
- **文件夹可反复更换**：已选择后按钮变为「**更换文件夹**」，随时可重新选择；选择结果写入 `videoTool.outputFolder`（视频与 GIF 共用）作为下次默认
- **未选文件夹 → 保存单个文件**：此时点击「开始处理」才弹出系统**保存文件**对话框（`video:pickOutput`，默认文件名就是输入框里的名字，GIF 只给 GIF 过滤器），直接指定单个输出文件；两条路径由界面文案明确区分
- **修复 GIF 报「缺少输入路径」**：根因是**主进程没有重启**——渲染进程已发 `mode: "gif"`，旧主进程不认识该类型，落到单片段校验分支后误报「缺少输入路径」。现在 `video:run` 与 `startEditJob` 都会先校验任务类型，未知类型直接提示「未知的导出类型「gif」：主进程可能不是最新版本，请完全退出应用后重新启动」；渲染进程在桥接缺失时也会明确提示重启应用，不再静默失败
- **验证**：`scripts/smoke-video-editor.js`（53 项）与 `scripts/smoke-gif-editor.js`（42 项）新增断言：未选文件夹时 `showSaveDialog` 必须被调用且默认名正确、已选文件夹时不得调用保存对话框、文件夹对话框必须是 `openDirectory`、按钮切换为「更换文件夹」、可再次选择、自定义文件名（含自动补扩展名与「恢复自动命名」）、同名文件追加 ` (2)` 不覆盖；`verify-electron-modules.js`（45 项）新增「未知任务类型提示主进程过旧」与 `ensureUniqueFilePath` 用例；`verify-video-edit.cjs` / `verify-video-concat.cjs` / `verify-gif.cjs` / `smoke-task.js` / `smoke-app.js` 全部通过

## 2026-08-31 — 导出改为「选择文件夹 + 自动命名」，不再弹「保存文件」

- **问题**：视频与 GIF 的「选择位置」调用的是系统**保存文件**对话框（showSaveDialog），需要用户自己起文件名，与「选择输出位置」的预期不符
- **改为选择文件夹**：新增 `video:pickOutputFolder`（`dialog.showOpenDialog` + `openDirectory`/`createDirectory`），按钮文案改为「**选择文件夹**」，面板显示「输出文件夹」并列出**自动生成的文件名**（视频：`<源文件名>[_x段数][_倍速][_crop].mp4`；GIF：`<源文件名>[_x段数]_<帧率>fps_<宽度>px.gif`）；原 `video:pickOutput`（保存文件）与 `pickOutputFile()` 已删除
- **记住目录**：选择后写入 `videoTool.outputFolder`（视频与 GIF 共用），下次进入默认沿用；未选择时回退到设置目录 → 源文件所在文件夹
- **不再静默覆盖**：主进程 `outputPaths.ensureUniqueFilePath()` 在导出前检查同名文件，存在则自动追加 ` (2)`、` (3)` …；同时自动创建尚不存在的输出目录，界面文案也已说明
- **验证**：`scripts/smoke-video-editor.js`（44 项）与 `scripts/smoke-gif-editor.js`（34 项）均断言对话框属性必须是 `openDirectory`、`showSaveDialog` 不得被调用、文件落在所选文件夹、文件名按参数生成、再次导出生成 ` (2)` 而不覆盖；`verify-electron-modules.js`（41 项）新增 `ensureUniqueFilePath` 与 `video:pickOutputFolder` 断言；`verify-video-edit.cjs` / `verify-video-concat.cjs` / `verify-gif.cjs` / `smoke-task.js` / `smoke-app.js` 全部通过

## 2026-08-31 — GIF 转换器（复用视频剪辑台 UI）+ 修复「开始处理」一直转圈

- **修复导出完成后一直转圈**：`ExportPanel` 的按钮图标原先按 `progress > 0` 判断，导出完成后 `progress` 停留在 100，导致「开始处理」永远显示加载动画；现改为按 `running` 判断（完成后回到下载图标），并保留完成横幅与「打开所在文件夹」
- **GIF 转换器**（`/toolBox/gif`，原为占位页）：
  - **帧率**：下拉 `1 / 5 / 10 / 20 / 30 / 60 / 120`，默认 **20 帧/秒** 并标注「推荐」（常量集中在 `src/data/gifForm.ts`）
  - **分辨率**：滑块控制输出宽度，**上限为源分辨率（首段）**，高度按首段比例等比自动计算并取偶数；源宽超过 480px 时默认落在 480px，可再手动拉满
  - **切片体验与视频一致**：同样的导入（可多选）、拖拽排序片段卡片、PR 风格 `[ ]` 时间轴剪切（拖动即跳帧）、走带预览、进度与取消
  - **多段**：列表顺序即拼接顺序，多段先归一化到首段比例再 concat，最后统一取调色板
- **ffmpeg 参数**（`electron/ffmpeg/jobs.js: buildGifArgs`）：每段输入侧 `-ss/-to` → `fps=N,scale=W:-2`（多段时 `scale+pad+setsar` 归一化后 `concat`）→ `split + palettegen(stats_mode=diff) + paletteuse(sierra2_4a)` 两遍编码；`-loop 0` 无限循环、`-an` 无音轨；输出扩展名强制 `.gif`，保存对话框在 GIF 模式只给 GIF 过滤器
- **UI/逻辑复用**（规范：可复用功能放入可复用位置）：把导入区、片段卡片、预览走带、PR 时间轴、导出面板、ffmpeg 状态栏与片段模型移入 **`src/components/videoEdit/`**；片段编辑交互抽成 **`src/hooks/useClipEditor.ts`**、ffmpeg 探测抽成 **`src/hooks/useFfmpegStatus.ts`**，视频剪辑页与 GIF 页共用（GIF 页仅保留帧率/分辨率参数），`ExportPanel` 通过 `hint/extra/heading` 插槽同时服务两个页面
- **文档**：新增 `src/view/toolBox/Tool/gif/README.md`（复用清单、参数、ffmpeg 语义、验证脚本）；同步更新视频工具 README 的目录结构与复用说明
- **验证**：
  - 新增 `scripts/verify-gif.cjs`（21 项）：单段/多段参数构建 + 真实转码，校验 GIF89a 文件头、尺寸（200×150 / 160×120）、帧率（20/10fps）、帧数、无音轨、帧率上限夹取与宽度取偶
  - 新增 `scripts/smoke-gif-editor.js`（26 项）：真实 UI 全流程，导入 2 段 → 时间轴剪切（终点 1.5s、画面跳到 1.500s）→ 帧率下拉默认 20/推荐标记/选项校验 → 宽度滑块 160（等比 120）→ 导出真实 GIF（160×120、10fps、35 帧 = 两段选区 3.5s×10fps）→ **「导出完成后不再转圈」回归断言**
  - `scripts/smoke-video-editor.js` 同步加入转圈回归断言（34 项全通过）；`verify-video-edit.cjs`、`verify-video-concat.cjs`、`verify-electron-modules.js`（37 项）、`smoke-app.js` 全部通过

## 2026-08-31 — 视频剪辑台：多片段拼接 + PR 风格起点/终点时间轴

- **多片段拼接**：`video:pickVideo` 改为多选，导入的每个视频是一张卡片；卡片用 `@dnd-kit`（PointerSensor + 竖向排序策略）**拖拽调整顺序，列表顺序即拼接顺序**，卡片显示各自裁剪区间/分辨率/体积/是否有音轨
- **PR 风格剪切**：去掉原生 `<video controls>` 播放条，改为时间轴上的 `|` 标记——拖动 `[` / `]` 划定区间，**拖动过程中视频画面实时跳到对应帧**（`onSeek` 写 `currentTime`）；区间外遮罩、刻度尺、播放头、点击跳转、播放到终点自动回到起点
- **每段独立剪切区间**：选中某卡片后时间轴编辑的是该段的 `trim`，切换片段各自保留；`PreviewStage` 提供播放/暂停、±1 帧、±1 秒、设为起点/终点、回到起点（快捷键式走带，不依赖原生控件）
- **拼接参数**（`electron/ffmpeg/jobs.js: buildConcatArgs`）：每段独立输入侧 `-ss/-to` → `scale+pad+setsar+fps+setpts` 归一化 → `concat=n=N:v=1:a=1`（含音频 `aformat` 统一重采样）；无音轨片段自动补 `anullsrc` 静音；**输出尺寸与帧率取首段**，换序后随之改变
- **无损/精确策略**：单片段默认 `-c copy`（关键帧对齐，界面已标注）；多片段拼接必然重新编码，因此「精确剪切」开关只在单片段时出现
- **失败可诊断**：桥接层兼容旧主进程只返回单路径的情况，并在桌面能力缺失时给出明确提示，不再出现「选了文件却毫无反应」
- **模块拆分**（规范：可复用逻辑入 utils、复杂 UI 拆子文件）：新增 `components/{ClipPlaylist,PreviewStage,TimelineScrubber}.tsx`，`video.tsx` 只负责状态编排；删除被取代的 `TrimPanel.tsx`
- **文档**：新增 `src/view/toolBox/Tool/video/README.md`（数据流、ffmpeg 语义踩坑、验证脚本、扩展方式）
- **验证**：新增 `scripts/smoke-video-editor.js` —— 真实 Electron UI 全流程 32 项断言：导入 2 段（320×240 / 640×360）→ 拖 `]` 到 40% 并断言画面跳到 1.600s → 切片段走带 + 设为起点 → 拼接导出（3.600s = 1.600 + 2.000，320×240，含音轨）→ 拖拽换序后按新首段重新导出（640×360）；`verify-video-edit.cjs` / `verify-video-concat.cjs` / `verify-electron-modules.js` 全部通过
- **顺带修正**：`scripts/smoke-task.js` 中视频面板断言按当前规范更新（工作流/提示词/起始图片 + wan2.2 时长 ≤5 秒、无分辨率与种子），原断言停留在旧版参数集

## 2026-08-31 — 修复主进程崩溃（IPC 全部 "No handler registered"）

- **现象**：视频页点击任何操作报 `No handler registered for 'video:...'`，且**所有** IPC 通道同时失效
- **根因**：主进程在**加载阶段**就抛错退出，因此 `registerIpcHandlers()` / `registerVideoToolIpc()` 从未执行：
  1. `electron/generatedImages.js`、`electron/comfyProxy.js`、`electron/appProtocol.js` 被写成 ES Module（`import/export default`），而 `main.js` 用 CommonJS 解构 require —— 既拿不到成员（`export default` 在 `require` 结果里位于 `.default`），ESM 的**无扩展名相对导入**还会直接 `ERR_MODULE_NOT_FOUND`
  2. `appProtocol.js` 在 ESM 中使用了 `__dirname`（ESM 无此变量）→ `ReferenceError: __dirname is not defined in ES module scope`
- **修复**：主进程统一为 **CommonJS**（与 `main.js`、`preload.js` 及其余模块一致）
  - `generatedImages.js`：`import ... from "./outputPaths"` → `require("./outputPaths")`，`export default {}` → `module.exports = {}`
  - `comfyProxy.js`：`import { randomUUID }` → `require("crypto")`，`export default {}` → `module.exports = {}`
  - `appProtocol.js`：改为 CommonJS（恢复 `__dirname`，去掉 `fileURLToPath` 兼容层）
- **新增回归防护**：`scripts/verify-electron-modules.js` —— 逐个 require 主进程模块、断言导出成员、并真实调用 `registerVideoToolIpc()` 后校验 7 个 `video:*` handler 均已注册（已全部通过）
- **注意**：主进程代码变更后需**完全重启** `npm run electron:dev`（仅刷新页面无效）

## 2026-08-31 — 视频工具箱：剪切 / 变速 / 裁剪（基于本机 ffmpeg）

- **功能**（`/toolBox/video`）：导入视频 → 预览播放 → 剪切（起止时间，可用播放头一键定位）→ 变速（0.5/0.75/1/1.5/2/4×）→ 裁剪（1:1、4:3、3:4、16:9、9:16 居中最大裁剪或自定义宽高坐标）→ 导出（进度条 + 取消 + 打开所在文件夹）
- **两条处理路径**：
  - **无损剪切**（默认）：`-c copy` 流拷贝，秒级完成；固有特性是按关键帧对齐——起点非关键帧时会从上一个关键帧开始，输出可能略长（已在界面标注）
  - **重新编码**（变速/裁剪/勾选「精确剪切」）：libx264 + aac，帧级精确
- **ffmpeg 探测**（`electron/ffmpeg/locate.js`）：手动指定 → 系统 PATH → 常见安装位置（含版本化目录）→ 应用内置（resources/ffmpeg、electron/bin、ffmpeg-static）；结果缓存；未找到时界面给出明确指引并可手动选择
- **参数踩坑修正（已实测）**：剪切窗口必须用**输入侧** `-ss START -to END`——`-to/-t` 放在 `-i` 之后是输出时限，配合变速滤镜会完全失效、配合 `-c copy` 会因关键帧回退而变长；修正后实测：无损剪切 2.600s（请求 2.5s）、精确剪切 2.000s、2× 变速 2.080s、变速+裁剪 1.320s/200×200
- **主进程模块化**：新增 `electron/ffmpeg/{locate,probe,jobs,index}.js`（查找 / ffprobe 元数据 / 参数构建与进度解析 / IPC 注册），IPC：`video:ffmpegStatus|selectFfmpeg|pickVideo|pickOutput|probe|run|cancel` + `video:progress` 事件
- **新增 localfile:// 协议**：只读服务本机文件（支持 HTTP Range），用于 `<video>` 预览与拖动进度
- **修复启动崩溃**：`appProtocol.js` 按 ESM 加载却使用了 `__dirname`（ESM 无此变量）导致主进程启动即抛 `ReferenceError`，改用 `fileURLToPath(import.meta.url)` 推导；并补具名导出，使主进程 `require("./appProtocol")` 解构与 `import()` 均可用
- **持久化**：新增用户数据段 `videoTool`（手动 ffmpeg 路径、默认输出目录），写入同一个 `illusion-realm.json`
- **验证**：`scripts/verify-video-edit.cjs`（13 项，真实转码）与 `scripts/verify-video-runtime.js`（ffmpeg 探测 + 协议导出）全部通过

## 2026-08-31 — EXIF 工具：文件夹路径持久化 + 队列清理 + 完成提示

- **输入/输出文件夹持久化**：新增用户数据段 `exifTool`（`{ inputFolder, outputFolder }`），落盘到与其它用户数据同一个 `illusion-realm.json`；新增 `stores/useExifToolStore.ts`（按规范 stores 承载持久化）并在 `AppShell` 注册水合；切换页面/重启后选择不再丢失
- **修复用户数据合并遗漏**：`userDataDocument.mergeDocument` 原先未合并 `customCategories`（自定义模型分类加载后会被丢弃），现一并补上 `customCategories` 与 `exifTool`
- **批处理后清理队列**：处理完成后清空成功项（并释放其预览 URL）；若存在失败文件则**仅保留失败文件**在队列中供用户复查重试
- **完成提示与动画**：`useToastStore` 支持 `info/success/error` 变体（错误提示停留更久、连续提示会重置计时器）；`ToastContainer` 按变体显示图标与配色并加 `toast-pop` 入场动画；EXIF 页面新增 `result-banner-in` 动画结果横幅（成功/失败计数 + 输出位置）

## 2026-08-31 — EXIF 编辑器重构：文件夹批量导入/导出 + 模块拆分

- **批量流程改造**：原先是「反复触发浏览器下载框」逐个下载；现改为 **选择输入文件夹 → 批量导入 → 选择输出文件夹 → 批量写盘**（Electron IPC），未选择输出文件夹时才回退为浏览器下载
- **模块拆分**（`src/view/toolBox/Tool/exif/`）：626 行单文件拆为 `exif.tsx`（仅状态编排）+ `types.ts` + `components/{UploadZone,MetadataEditor,RenameConfig,FileList,ForceClearModal}.tsx`；单文件与批量模式共用编辑器组件
- **可复用逻辑下沉**（`src/utils/exif/`）：`pngTextChunks.ts`（tEXt 解析/写入/剔除 + CRC32）、`metadataConsistency.ts`、`processImage.ts`、`electronFs.ts`、`format.ts`
- **修复 CRC 缺陷**：原实现拼接 tEXt 块时未写 CRC（且未按规范插入到 IEND 之前）；现统一重算 CRC32 并在 IEND 前插入，已通过 8 项运行时往返测试（CRC 校验、块顺序、剔除保留 IEND）
- **新增 IPC**：`files:listImageFiles`（列出文件夹图片）+ preload + 类型定义
- **文档**：新增 `src/view/toolBox/Tool/exif/README.md`，说明 PNG tEXt 算法、批量流程、分层职责与扩展方式

## 2026-08-31 — 修复 Anima 生成报错 + 补全采样器

- **修复 Anima 工作流 VAE/CLIP 校验失败（400）**：`标准anima生成流.json` 中 CLIPLoader 的 `clip_name` 补上子目录前缀为 `qwen_3_06b_base\qwen_3_06b_base.safetensors`，VAELoader 的 `vae_name` 为 `qwen_image_vae\qwen_image_vae.safetensors`，匹配 ComfyUI 实际模型列表
- **采样器补全**：`SAMPLERS` 改为 `{ label, value }` 结构，value 为 ComfyUI 采样器实际名称，新增 euler_cfg_pp、euler_ancestral、euler_ancestral_cfg_pp、heunpp2、exp_heun_2_x0、dpm_2_ancestral、lms、dpm_fast、dpm_adaptive、dpmpp_2s_ancestral、dpmpp_2s_ancestral_cfg_pp、dpmpp_sde 等；默认采样器改为 euler；`SamplerSelect` 显示标签、传 Comfy 值

## 2026-08-31 — 创建页系列作用域 + 设置路径自动填充（精华汇总）

- **设置页扫描优先级**：填写「检索路径」时只在检索路径下搜索并忽略其他参数；未填写时才扫描已填写的 checkpoint/loras/diffusion_models 路径
- **检索路径自动填充**：填写检索路径后自动填充 `checkpointPath={根}/checkpoints`、`lorasPath={根}/loras`、`diffusionModelsPath={根}/diffusion_models`（仅当对应路径为空）
- **创建页按系列限定模型来源**：模型弹窗 anima 仅加载 `diffusion_models/Anima`、sdxl 仅加载 `checkpoint/SDXL` 下的模型文件（不使用其他）；添加扩展 anima 仅用 `loras/Anima`、sdxl 仅用 `loras/SDXL`
- **本地模型分类归属**：分类名 = 相对扫描根的第一级文件夹名（根目录 `models` 下 `checkpoints`/`loras`/… 即 type 名）；修复 `normalizeLocalModel` 丢弃 `category` 字段导致抽屉归属失效的问题
- **设置页本地模型抽屉**：按文件夹名分抽屉（每个含模型文件的文件夹一个抽屉），展开只显示该文件夹下模型文件；无文件文件夹不显示；支持自定义分类/批量添加/去重优先级
- **图像生成改用工作流配置**：`imageWorkflow.ts` 按 class_type 通用注入，支持 Anima/SDXL 双工作流，VAE/CLIP 固定不开放选择
- **视频工作流**：`VideoWorkflowSelect` 分类式选择，宽高≤480、时长≤5 校验集中到 `VIDEO_WORKFLOW_LIMITS`

## 2026-08-31 — 任务迭代修复：分类字段保留 + 弹窗 UI 还原

- **修复分类字段丢失**：`normalizeLocalModel`（`utils/localModelScanner.ts`）重建对象时未保留 `category`，导致 `annotateCategory` 加上的分类名在 `normalizeLocalModels`/`mergeLocalModels` 后被丢弃、抽屉归属失效；已在三处返回分支中显式携带 `category` 字段
- **模型分类归属**：分类名 = 相对扫描根目录的第一级文件夹名（根目录如 `models` 下 `checkpoints`/`loras`/`upscale_models`… 即 type 名）；模型直接在根目录时回退为根目录名；不再把所有模型归入 checkpoint
- **创建页模型弹窗 UI 还原**：`ModelSelectDialog` 恢复为修改前的原始外壳样式（背板作为兄弟元素、头部保留「显示描述」开关、原容器/关闭按钮/工具栏/卡片类名），同时保留单选化与 Anima 系列仅加载 diffusion_models/Anima 的功能

## 2026-08-31 — 完成 task/ 任务：模型管理 + Anima/SDXL 工作流 + 视频面板

- **图像生成改用工作流配置**：新增 `utils/comfy/imageWorkflow.ts`，按 class_type 通用节点发现（KSampler/EmptyLatentImage/CheckpointLoaderSimple/UNETLoader/CLIPTextEncode），把用户参数注入 `src/data/comfy/imageWorkflower/` 下的 **Anima（标准anima生成流.json）与 SDXL（标准SDXL生成.json）** 工作流；VAE/CLIP 由工作流固定绑定（Anima 为 CLIPLoader/VAELoader 固定，不开放选择）；删除旧 `jinshiPrompt.ts`（金狮工作流）与硬编码节点 ID，更新 5 个引用方；已实测 Anima/SDXL 两套工作流节点解析与参数注入正确
- **本地模型管理（任务.md §二）**：
  - 新增 `data/modelCategories.ts`：26 个标准分类目录常量；`diffusion_models` 兼容 `.gguf/.safetensors`（主进程扫描已支持 .gguf）
  - 设置新增 **Diffusion 模型地址** 配置项（`diffusionModelsPath`，settings 类型/store/持久化全部扩展，旧数据自动回填默认值）
  - 本地模型列表改为**按文件夹名分抽屉**：每个包含模型文件的文件夹一个抽屉（抽屉名 = 文件夹名，如 checkpoints），展开只显示该文件夹下的模型文件（文件名 + logo.png 图标 + 路径）；无文件的文件夹不产生抽屉；全部文件已分配自定义分类的文件夹同样隐藏
  - **用户自定义分类**（`useCustomCategoryStore`，持久化到用户数据）：新建分类、批量添加模型（按文件夹名层级勾选）、移除模型；已分配自定义分类的模型不再在默认文件夹抽屉重复显示（优先级：用户分类 > 文件夹默认分类）
- **创建页模型选择（任务.md §4 / 任务1.md §一）**：移除多版本选择弹窗，点击模型卡片即单选默认版本；Anima 系列时模型弹窗**仅加载 diffusion_models/Anima 目录下的模型文件**，并展示"VAE/CLIP 已固定绑定"说明；SDXL 系列排除 diffusion_models 下的模型
- **视频工作流（任务1.md §二）**：新增 `VideoWorkflowSelect`（分类式抽屉，层级「大分类 / 工作流.json」），数据来自 `src/data/comfy/videoWorkflower/`（minimax 3 个 + wan2.2 1 个）；底层模型固定不开放选择；用户仅可配置正/反向提示词、宽高（**≤480×480 前端校验**）、时长（**≤5 秒**）；限制规则集中到 `data/videoForm.ts` 的 `VIDEO_WORKFLOW_LIMITS`（无魔法数字）；移除旧 VideoModelSelect/VideoResolutionSelect/VideoAdvancedSettings（种子等不再暴露）
- **移除「整理文件夹（单文件约束）」功能**：删除主进程 `organizeModelDirectories`/`scanModelsInRoot` 及 models:organize/models:scanRoot IPC、preload 暴露、`localModelCatalog.ts`、设置页整理按钮
- **验证**：`next build` 通过（9 页静态导出）；`scripts/smoke-task.js` 15 项冒烟检查全部 PASS（设置页/Anima 弹窗/视频校验/整理功能已移除）

## 2026-08-18 — 工程优化：依赖/死代码/重复实现清理

- 修复生产构建（P0）：`stealthExif.ts` 的 `import pako from "pako"` 改为 `import { ungzip } from "pako"` —— pako 3.x 为纯 ESM 具名导出、无 default export，此前 `next build`（Turbopack）必然失败，`electron:pack` / `electron:build` 均不可用
- **移除 ComfyUI API 代理重复实现**：删除 `src/app/api/comfyui/*` 两个 route handler 与 `src/api/comfyui/{generate,models,client,constants}.ts`（与 `electron/comfyProxy.js` 逐行重复，且 `output: export` 下 POST route handler 不受支持）；`transport.ts` 收敛为纯 IPC 通道、统一 `unwrapIpcError`，非 Electron 环境给出明确提示；`api/comfyui` 由 7 个文件减为 3 个
- **模型列表 TTL 缓存**：`fetchComfyModelLists` 增加 60s 缓存，避免每次生成都拉取全量 checkpoint/lora 列表
- **死代码清理**：删除 3 个纯 re-export 壳（`utils/comfy/comfyClient|comfyTransport|fetchComfyModelLists`）、`layout.ts` 的 `getSidebarWidth/getMainPaddingLeft`、public 下 5 个 create-next-app 样板 svg、`electron/icon.jpg`（与 logo.jpg 三份重复）、3 个未引用的 ComfyUI workflow JSON、`app/favicon.ico`
- **幽灵依赖修复**：`embedComfyPrompt.ts` 移除未声明的 `crc-32` 直接引用，改为内置查表 CRC32 实现（约 15 行，去掉一个"构建炸弹"）
- **依赖清理**：删除 `@types/pako`（pako 3 自带类型）与 `@types/electron`（electron 自带类型、stub 早已废弃）；删除 `.npmrc`（与 `electron:install` 的 ELECTRON_MIRROR 重复且产生 npm 告警）；删除 `next start` 脚本（`output: export` 下不可用）
- **用户数据单源化**：`electron/userData.js` 删除 `DEFAULT_DOCUMENT`/`mergeDocument`，主进程只做 JSON 读写与路径解析，默认值/合并/迁移统一由渲染侧 `types/userData.ts` + `userDataDocument.ts` 负责（消除三份默认文档的 schema 漂移）
- **更新公告改为 IPC 读取**：新增 `changelog:read` 通道（main/preload/类型/渲染侧），修复打包后 `file://` 环境下 `fetch("/changelog.md")` 被 Chromium 拦截、公告静默失效的问题
- **构建配置**：`next.config.ts` 固定 `output: "export"`（不再按环境变量切换）；移除 `next/font/google`（Geist）改用系统字体栈，消除离线构建期联网下载字体的依赖
- **调试残留**：删除 `useComfyGenerate` 中的 `console.group/log` 工作流调试输出
- **图片体积**：`electron/icon.png` 1080px 1.69MB → 256px 0.16MB；`assets/icon/create/model.png` 750×1096 0.97MB → 175×256 0.12MB（均保留透明通道）
- **目录规范**：`src/Date/` → `src/data/`（45 个文件 import 同步更新，消除拼写错误目录名）
- **gitignore**：补充 `/dist/`（electron-builder 输出目录此前未忽略）
- **打包配置**：`package.json` 的 `build.electronDist` 指向 `node_modules/electron/dist`，electron-builder 直接复用本地 Electron 43.1.1，避免首次打包时联网下载 electron zip 超时失败；`npm run electron:build` 已产出 `dist/Illusion Realm Setup 0.1.0.exe`（NSIS 安装包）与 `dist/win-unpacked/Illusion Realm.exe`（免安装版），冒烟测试通过
- **修复打包后样式/脚本/图片丢失**：Next.js 静态导出 HTML 使用绝对路径引用资源（`/_next/static/...`、`/logo.jpg`），Electron 用 `win.loadFile(file://)` 加载时全部解析到磁盘根目录而 404。新增 `electron/appProtocol.js`：注册自定义 `app://` 协议（standard/secure/supportFetchAPI/stream），把请求映射到 `out/` 真实文件（含 `/cartoon` → `cartoon.html` 兼容、目录穿越防护、MIME 表），主进程改为 `win.loadURL("app://app/index.html")`；新增 `scripts/smoke-app.js` 冒烟测试（body margin 重置、nav fixed、背景色变量等判定），验证 `STYLES OK ✓`

## 2026-08-08 — 漫画合成：竖排省略号 + 字号不随素材缩放

- **竖排省略号**：`…` / `……` 等横向省略号 glyph 展开为全角点逐字堆叠，竖排显示正常
- **字号独立**：拖动缩放对话框素材时，文字字号保持不变（不再随 `fontScale` 联动）
- 导出时按预览画布与成图宽度等比换算字号，保证导出与预览一致

## 2026-08-08 — 漫画合成：多对话框 + Delete 删除

- 支持同一页 **多个对话框**，点击画布空白处添加新气泡（使用左侧当前选中素材）
- **Delete / Backspace**：优先删除选中文本框；无选中文本时删除选中对话框
- 侧栏新增对话框列表，可切换选中；导出 PNG/JPEG 渲染全部对话框
- 工程草稿升级为 v2（`bubbles[]`），自动迁移 v1 单气泡格式

## 2026-08-08 — 漫画合成：第二阶段素材库

- 合成编辑页左侧加入 **素材库面板**，可随时切换内置/自定义对话框素材
- 切换素材时自动保存当前编辑内容，并按素材分别恢复草稿（背景图在同页切换时保留）
- 合成页支持 **添加/删除自定义素材**，与第一阶段共用同一素材库

## 2026-08-08 — 漫画合成：对话框镜像与透明度

- 选中对话框时，侧栏可 **水平/垂直镜像翻转** 素材 PNG（文字保持正向）
- 侧栏 **透明度** 滑块（0–100%），作用于整个对话框层（素材 + 文字）
- 导出 PNG/JPEG 与画布预览一致；工程 JSON / 草稿自动兼容旧数据

## 2026-08-08 — 漫画合成：缺点清单可落地项

- **撤销/重做**：`useComposeEditor` 历史栈（最多 50 步），侧栏按钮 + Ctrl+Z / Ctrl+Y
- **工程持久化**：localStorage 自动保存草稿；侧栏导出/导入 JSON 工程
- **文本框拖拽**：画布上拖动文本框移动位置；方向键微调（Shift 大步长）
- **删除文本框**：Delete / Backspace 快捷键 + 侧栏删除按钮
- **排版增强**：左/中/右对齐、行高倍率、字间距、描边宽度/颜色
- **自定义字体**：上传 ttf/otf/woff/woff2，持久化至用户数据，导出时一并渲染
- **导出格式**：PNG / JPEG 可选
- **字数提示**：选中文本时显示字数与过长警告（12–20 字建议）
- **图层列表**：侧栏文本图层列表，点击选中
- **清理**：移除未使用的 `CartoonAnchorCanvas`、`CartoonBubbleCanvas`

## 2026-08-08 — 漫画合成二级编辑页

- 一级页仅选择素材，文字添加移至二级合成页
- 二级页：虚线四边拖拉伸宽高（↔/↕ 光标）；右下角等比缩放；旋转图标绕中心顺/逆旋转
- 文本框支持字体选择（系统微软字体 + 网络宋体/黑体/动漫字体）与调色板
- 单击素材拖动移动；双击插入/编辑文本框
- 修复文字旋转时因裁切导致不显示的问题
- 双击插入/编辑文本框（默认横排）；右侧「文本框属性」调节文字、旋转、宽高

## 2026-08-08 — 漫画对话框编辑页

- 新增 `/cartoon` 页面：内置 6 款 `assets/cartoon` 漫画素材可选
- 文字工具：在素材虚线输入区域内点击添加文字，文字限制在素材/绑定区域内
- 支持横排与竖排排版、字号调节、文字块选中编辑与删除
- 支持上传自定义素材并拖拽框选文字输入区域（绑定位置），持久化至用户数据
- 支持导出合成后的 PNG 图片
- 侧栏导航新增「漫画对话框」入口

## 2026-07-24 — 创建页预览画廊切换

- 全屏预览支持左右箭头与键盘 ← / → 切换图片
- 按当前文件夹（全部图片 / 子文件夹）列表循环浏览，顶部显示序号
- 切换时同步更新中间预览与侧栏选中高亮
- 本地图片 URL 缓存 + 相邻预加载，移除「正在加载图片」提示

## 2026-07-24 — 创建页侧栏点击切换中心预览

- 右侧历史图片点击后，中间预览区自动切换为所选图片
- 新生成图片完成后仍优先显示最新结果；侧栏当前选中项高亮边框

## 2026-07-24 — 创建页生成图预览放大

- 中间预览区点击已生成图片可全屏查看（类似 Element Plus Image Preview）
- 支持滚轮缩放、拖拽平移、底部工具栏放大/缩小/重置、Esc 关闭

## 2026-07-23 — 创建页图片详情改读内嵌 Meta

- 侧栏点击图片弹出的详情 Dialog 不再读取同名 JSON sidecar
- 改为与本地解析相同的图片内嵌 Meta 解析流程（ComfyUI workflow / A1111）
- 新生成图片保存时将 workflow 写入 PNG `prompt` 块，便于后续解析

## 2026-07-23 — 本地解析载入二创

- `/inspect` 解析结果支持「载入二创」，跳转 `/create` 并填入表单
- 支持 JSON sidecar、ComfyUI 内嵌 workflow、A1111 内嵌参数三种来源
- 自动匹配本地 Checkpoint / LoRA，未找到时 Toast 提示

## 2026-07-23 — ComfyUI Workflow 内嵌 JSON 解析

- 本地解析页识别 `Comment` / `workflow` / `prompt` 中的 ComfyUI API 工作流
- **API 生成图片**：从 JSON sidecar 的 `workflow` 字段回退解析（PNG 内无内嵌 Meta 时）
- 自动提取 Checkpoint、LoRA、正/负提示词与全部节点结构
- 解析结果输出至浏览器控制台（`console.log`，含 `source: embedded | sidecar`）

## 2026-07-23 — 本地解析支持上传图片

- `/inspect` 页新增拖拽 / 点击上传，可解析任意本地 SD 图片内嵌 Meta
- 上传解析在浏览器与 Electron 均可使用；生成路径选图仍支持 JSON sidecar

## 2026-07-23 — 本地图片解析独立页（Navigation）

- 侧栏主导航新增「本地解析」→ `/inspect`
- Meta 解析功能从创建页迁移至 `view/inspect/LocalImageInspectPage.tsx`（左图右结果布局）

## 2026-07-23 — 创建页图片 Meta 解析（SD Inspector）

- 集成 stable-diffusion-inspector 逻辑：PNG tEXt/iTXt、JPEG/WebP EXIF、NovelAI Stealth
- 创建页可从生成路径选择图片，输出内嵌 Meta、JSON sidecar 与 EXIF
- 新增 `utils/sdImageInspector/`、`view/create/GeneratedImageMetaInspectorPanel.tsx`

## 2026-07-22 — 生成详情 LoRA 权重可视化

- 扩展 LoRA 行按权重显示淡色渐变条：正值从左向右绿色，负值从右向左红色
- 占比按 -5~5 范围映射；新增 `LoraStrengthRow` 与 `getExtensionWeightBarFill`

## 2026-07-22 — 更新公告（同步 logs.md）

- 侧栏「更新」进入 `/updates`，展示与 `logs.md` 同步的完整改动日志
- 启动时若有未读最新条目，弹出更新公告 Dialog
- `npm run dev` / `build` 前自动将 `logs.md` 复制为 `public/changelog.md`

## 2026-07-22 — 恢复模型/扩展 Dialog 分类下拉模式

- 恢复 `resourceCategoryUiMode`（标签栏 / 下拉框）与 `SimpleSelect` 分类下拉
- 与「小 / 中 / 大」字体切换并存，偏好持久化至 createForm

## 2026-07-22 — 扩展 LoRA 权重支持负值

- 扩展权重范围由 `0~5` 调整为 `-5~5`
- 滑块以 0 为原点双向填充；remix 回填时自动 clamp

## 2026-07-22 — 模型/扩展 Dialog 字体大小（小/中/大）

- 移除分类下拉模式，分类筛选固定为标签栏
- 新增 `resourceDialogFontSize`（sm/md/lg）持久化至 createForm
- 分类栏右侧提供「小 / 中 / 大」三档字体切换；「小」为原默认尺寸

## 2026-07-22 — 创建页模型/扩展 Dialog 下拉框样式

- 新增 `components/SimpleSelect.tsx` 自定义下拉（圆角 pill 触发器、选中勾选、Portal 防裁切）
- `ResourceCategoryFilter` 分类筛选由原生 `<select>` 改为 SimpleSelect，切换按钮改为圆角胶囊样式
- 模型/扩展 Dialog 卡片内版本选择按钮增加 ChevronDown 与柔和 hover 态

## 2026-07-21 — 生成图片 JSON 参数与详情展示

- 生成时同时保存图片与同名 `.json`（含工作流、提示词、种子、LoRA 等参数）
- 移动图片至文件夹时同步移动 JSON sidecar
- 创建页侧栏点击图片打开详情 Dialog，展示模型、LoRA 扩展、生成参数

## 2026-07-21 — 首页作品详情弹窗

- 点击瀑布流图片打开详情 Dialog（标签、大图轮播、作者、点赞、生成数据、同作者更多）
- 不含评论区；支持键盘 ←/→ 切换多图、Esc 关闭
- 新增 `view/home/PaintingDetailDialog.tsx`、`utils/galleryDetail.ts`

## 2026-07-21 — 统一用户数据 JSON 与 ComfyUI API 路径

- 设置、个人资料、侧栏、历史文件夹、快捷短语、创建表单等写入单一 JSON（默认：软件同级 `user/illusion-realm.json`）
- Electron IPC：`userData:read` / `userData:write` / `userData:getDefaultPath`；设置页可配置自定义路径
- 启动时加载 JSON、迁移旧 localStorage 键并写入新文件
- ComfyUI 相关 API 由 `api/comfy` 迁至 `api/comfyui`（generate、models）

## 2026-07-21 — 快捷短语

- 创建/编辑快捷短语：关键词（#）、提示词文本、可选显示图片（从图库选择）
- 短语卡片列表：使用 / 编辑 / 删除；点击「使用」插入提示词至编辑器
- 本地持久化 `stores/useQuickPhraseStore.ts`

## 2026-07-21 — 文件夹文件系统同步与双击打开

- 文件夹列表从生成输出目录扫描，与磁盘子文件夹同步（支持多个文件夹）
- 单击选中文件夹（生成保存目标），双击打开并查看文件夹内图片
- 图片区标题显示当前打开的文件夹名称

## 2026-07-21 — 文件夹右键批量添加图片

- 用户文件夹右键菜单「添加图片」，从已生成的本地图片中多选批量添加
- Electron IPC `files:moveImagesToFolder` 将图片移动至目标文件夹
- 新增 `view/create/AddImagesToFolderDialog.tsx`、`HistoryFolderContextMenu.tsx`

## 2026-07-21 — 文件夹与图片尺寸

- 新建文件夹仅需名称，在保存目录下创建物理文件夹（仅存放图片）
- 选中文件夹后，生成图片保存至该文件夹；侧栏展示文件夹内图片列表
- 生成完成后自动刷新侧栏图片网格
- 创建页「图片尺寸」按所选宽高比计算，宽高均 ≤ 1000，8 像素对齐
- 新增 `utils/imageSize.ts`、`stores/useCreateFormStore.ts`

## 2026-07-21 — 个人主页

- 移除侧栏底部 Discord / X / Reddit 小图标
- 新增 `/profile` 个人主页：头像、用户名、统计、Tab（帖子/喜欢/评论等）
- 新增「编辑公开资料」Dialog：头像上传、简介、社交媒体链接
- 侧栏用户入口与底部「你」导航跳转个人主页
- 新增 `stores/useProfileStore.ts`、`view/ProfilePage.tsx`、`view/profile/*`

## 2026-07-21 — 创建页接入本地模型资源

- 设置页扫描的 Checkpoint 模型显示在创建页「选择模型」Dialog
- 设置页扫描的 LoRA 模型显示在创建页「添加扩展」Dialog
- 模型卡片封面读取同目录 `logo.png`（通过 Electron 本地图片加载）
- 有本地模型时优先使用本地资源，无本地模型时回退到内置示例数据

## 2026-07-21 — 设置页与本地模型扫描

- 侧栏底部「内容过滤」改为「设置」，跳转 `/settings`
- 新增设置页：检索路径、Checkpoint 路径、LoRA 路径，支持 Electron 打开文件夹选择
- 新增 Electron IPC（`preload.js` / `modelScanner.js`）：文件夹对话框、递归扫描 `.safetensors/.ckpt/.pt/.pth`
- 同目录自动匹配 `logo.png` 等图片作为模型封面
- 新增 `stores/useSettingsStore.ts` 路径持久化；`utils/localModelScanner.ts` 扫描辅助函数
- 新增 `view/SettingsPage.tsx`、`view/settings/PathSettingRow.tsx`、`view/settings/LocalModelList.tsx`

## 2026-07-19 — 视频创建 Tab

- 点击「视频」切换至视频创建面板：模型选择、分辨率、时长滑块、费用估算
- 起始图片上传区、提示词、宽高比 auto、高级设置折叠区
- 底部升级按钮与积分提示；右侧预览区文案同步为视频
- 新增 `VideoCreatePanel`、`CreateModeTabs`、`Date/videoForm.ts` 等

## 2026-07-19 — 扩展选择 Dialog

- 点击「添加扩展」打开全屏 Dialog：高级方案提示条、17 张扩展卡片网格
- 封面本地化至 `assets/icon/create/extensions/`；锁定项显示锁层与「解锁」按钮
- 首个扩展保留基础模型不匹配警告样式；选中后创建页显示扩展名称与封面
- 新增 `Date/extensions.ts`、`ExtensionSelectDialog.tsx`、`types/extension.ts`

## 2026-07-19 — 模型封面本地化与卡片背景联动

- 模型封面下载至 `assets/icon/create/models/`，移除 CDN 远程依赖
- 选择模型/版本后，创建页模型卡片背景同步显示对应封面图

## 2026-07-19 — 模型选择 Dialog

- 点击模型卡片打开「选择模型」全屏 Dialog：搜索、A-Z 排序、模型网格
- 多版本模型支持版本子 Dialog；选中后同步更新创建页模型卡片
- 新增 `Date/models.ts`、`ModelSelectDialog`、`ModelVersionDialog`

## 2026-07-19 — 创建页滚动区间距与 Dialog 修复

- 模型卡片滚动区增加 `pt-2 sm:pt-3`，与模型系列选择器留出间距
- 修复 `PresetPromptDialog` useEffect 依赖数组不稳定导致的控制台报错

## 2026-07-19 — 自定义预设创建表单

- 「添加自定义预设」切换至新建视图：名称 / 正向前后缀 / 反向前后缀
- 支持返回列表、创建后自动选中；Pony / Illustrious 空系列也可添加

## 2026-07-19 — 预设提示词编辑 Dialog

- 高级设置「编辑」打开居中 Dialog：系列 Tab（Pony / Illustrious / Anima）、预设单选、取消/保存
- Anima 预设数据与参考一致；保存后同步更新高级设置预览
- 新增 `Date/presetPrompts.ts`、`view/create/PresetPromptDialog.tsx`

## 2026-07-19 — 移除升级限制

- 图片数量 x1–x4 全部默认可选，移除「升级后可用」禁用状态

## 2026-07-19 — 生成区图片数量下拉

- 点击「图片 ×1」弹出数量菜单：x1–x4 均可选（紫色勾选当前项）
- 空间不足时菜单自动向上展开；右对齐触发按钮
- 新增 `view/create/ImageCountDropdown.tsx`，生成按钮积分随数量联动

## 2026-07-19 — 模型系列上方分界线样式

- 图片/视频/Edit 标签栏底部分界线改为细黑灰色（`THIN_DIVIDER_CLASS`），与模型系列等区域边框一致

## 2026-07-19 — 高级设置滑块与种子逻辑

- 步数 / CFG 比例改用 Radix 风格 `RangeSlider`（轨道 + 填充 + 圆形滑块）
- 种子范围：`0 ~ 4294967295`（SD 无符号 32 位整数）
- 点击「自定义」自动随机生成合法种子；「随机」模式显示占位符、参数值为 `-1`（随机）
- 新增 `view/create/RangeSlider.tsx`、`utils/seed.ts`

## 2026-07-19 — 创建页滚动与采样器收尾

- 创建页启用 `AppShell fillViewport`，主区域 `overflow-hidden`，避免与表单内部滚动双重滚动
- `CreatePage` 改为 `h-full` 填满主内容区，移动端由 AppShell 底部留白适配底部导航
- 采样器下拉选项移除截断，长名称（如 DPM++ 2M SDE GPU）完整显示
- `npm run build` 验证通过

## 2026-07-19 — 创建页布局与采样器优化

- 左侧表单区改为「上方滚动 + 底部生成栏固定」，生成区分隔线为细灰线
- 采样器改为自定义圆角下拉，标签与选项分行显示，避免文字截断
- 预览灰色区域仅在 xl 及以上显示，窄屏下不再堆叠到生成区下方
- 修复高级设置展开时的宽度抖动（overflow / scrollbar-gutter / 种子行布局）

## 2026-07-19 — 创建页 task_1 完善

- 修复 `CreatePage` 缺失 import 导致的运行时错误（modelCover / 子组件）
- 模型系列下拉：悬停/触摸右侧弹出使用技巧（桌面右侧浮层，移动端内联展示）
- 提示词、图片尺寸区域使用细灰色边框（`border-input`）
- 高级设置可展开：预设提示词、采样器、步数、CFG、种子
- 生成区域：图片数量选择、积分显示、生成按钮
- 响应式：xl 以下隐藏历史侧栏与预览区，md 以下隐藏左侧导航并显示底部导航栏
- 拆分组件至 `view/create/`：`ModelSeriesSelector`、`PromptSection`、`ImageSizeSection`、`AdvancedSettings`、`GenerateFooter`
- 新增 `components/MobileBottomNav.tsx`

## 2026-07-19 — 创建页模型 / 模型系列 UI

- 模型卡片：紫色边框改为淡蓝色 `ring-sky-400`，封面使用 `assets/icon/create/model.png`
- 对齐参考结构：渐变遮罩、标题/版本、下拉箭头、「如何为 Anima 编写提示词」入口
- 模型系列：细灰白边框；SDXL / Anime 选项前分别使用 `SDXL.png`、`Anime.png`
- 系列数据放入 `Date/modelSeries.ts`

## 2026-07-19 — 项目初始化与布局框架

- 创建 Next.js 16 + TypeScript + Tailwind CSS 项目
- 集成 Zustand（侧边栏展开/收起状态本地持久化）
- 集成 Electron 桌面端入口（`electron/main.js`）
- 按规范创建目录：`view/`、`utils/`、`stores/`、`types/`、`Date/`、`assets/`
- 实现左侧 Navigation 侧边栏（220px 展开 / 56px 收起，300ms 过渡动画）
- 实现 Main 主内容区，padding-left 与侧栏宽度同步过渡，避免布局抖动
- 首页 `/` 与创建页 `/create` 布局复现 BetterWaifu 参考结构
- Logo + 文字点击返回首页；导航未开发项提示「暂未开发」
- 侧栏缩放按钮支持 active 缩放反馈
