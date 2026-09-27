# 门禁体系上手：规则、触发器、豁免机制

给新人的一页地图。目标：知道**改什么会撞上哪道门**、**红灯是代码问题还是环境问题**、
**哪些约定是机械校验的、哪些还需要人判断**。

## 一、跑什么

| 命令 | 覆盖 | 环境要求 |
|------|------|---------|
| `pnpm check` | typecheck + 主进程 verify + 文案逃逸 + Meta 契约 + 三件套配对对照 + **冒烟约定校验** | 无桌面会话即可 |
| `pnpm self-test:gate` | **门禁自检 9 步**：配对对照 / 指纹确定性 / 退出码护栏四例 / 两条不变量 / 事件丢失维度 | Electron（CI 用 windows-latest，无需 xvfb） |
| `pnpm self-test:gate` 的 `--chaos` | 调度层是否说谎（双向，见下） | 同上 |
| `SMOKE_OCCLUDE=1 npx electron scripts/smoke-<name>.js` | **遮挡维度**：被盖住时的 rAF / visibilityState | **必须真实可见窗口**；headless 会显式 SKIP |
| `SMOKE_SWALLOW_MEDIA_EVENT=all npx electron scripts/smoke-prompt-assembly.js` | **事件丢失维度**：最坏情况（change 永远不来） | headless 可跑 |
| `SMOKE_DPR=1.25 npx electron scripts/smoke-view3d.js` | **显示缩放维度**：`devicePixelRatio > 1` 时 3D 画布必须仍铺满容器、不溢出（默认 dpr=1 时这条恒真） | 需要窗口的 CSS 宽度仍 ≥ xl，否则弹窗转紧凑形态（见 AGENTS.md） |
| `npx electron scripts/smoke-<name>.js` | 六个套件正常模式 | 需要桌面会话 |

六个套件：`prompt-assembly` / `characters` / `view3d` / `gif-editor` / `video-editor` / `anima-workflow`。
**一次只跑一个**（背靠背串联出现过「后跑的那个失败或卡死、单独重跑却通过」），
开跑前清残留：`Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force`。

## 二、退出码语义（先看这个再读日志）

| 码 | 含义 | 你该做什么 |
|----|------|-----------|
| 0 | 通过 | — |
| 1 | 断言失败或异常 = **代码问题** | 看断言名 |
| 2 | **环境 / 前置条件问题**：构建产物过期、遮挡前提不成立、缺 ffmpeg | **别改代码**，按提示修环境 |
| 124 | 外部看门狗超时（整条链路没进展） | 按「已知超时」看，不是基础设施故障 |
| 125 | 进程内单步超时（某一步的 promise 没 settle，消息里有步骤名） | 直接看那一行 |

退出码不可被抹掉：护栏会拦下「已有失败却 `app.exit(0)`」并把 `app.quit()` 改成非零退出
（`app.quit()` 实测**无视** `process.exitCode`，会把红灯变绿灯）。

## 三、机械校验的约定（会拦你，别绕过）

| 约定 | 由谁拦 | 违反了怎么办 |
|------|--------|-------------|
| 源码改了必须重建再跑冒烟（跑的是 `apps/next/out`） | `smoke.assertBuildFresh`（指纹比对，exit 2） | 跑 `pnpm --filter @illusion-realm/next build` |
| `logs.md` 改了必须重建（导出里有更新公告） | `generated-drift`（exit 2，提示带命令） | 同上 |
| 冒烟窗口必须 `backgroundThrottling: false` | 遮挡维度的「被盖住时仍 visible」断言 + 事件丢失维度 | 把这行加回去 |
| 声明「不适用 harness」的套件不得用时序/媒体查询 API | `pnpm check:smoke` 规则 1 | 删断言，或重估并点名豁免（见下） |
| 接入 harness 的套件不得直接调 `app.exit()` / `app.quit()` | `pnpm check:smoke` 规则 2 | 改用 `smoke.finish()` / `smoke.exitEnvironment()` |
| 硬编码中文只减不增 | `check:i18n`（基线 65） | 迁进词条表 |
| 文件夹行的「N 张」= 点开该文件夹看到的张数（不是递归计数） | `check:foldercount` | 见 `scripts/verify-folder-image-count.js` 的判据说明 |
| 主进程 `@ts-nocheck` 基线只减不增 | `check:nocheck` | — |
| 落地 Meta 必须带版本标记、旧图仍可读 | `check:meta`（45 条断言） | 见 AGENTS.md「数据契约」段 |

### 豁免机制

确有必要时，在文件里写一行，**必须点名 API + 给理由**：

```js
// smoke-rules-allow: getComputedStyle（仅静态样式断言，不涉及过渡中间态）
```

未点名的 API 仍会被拦（有对照证明豁免不是免死金牌）。豁免 = 审计轨迹，
新人在 `grep -rn "smoke-rules-allow" scripts/` 能看到全部例外及其理由。

## 四、触发器与台账

`scripts/lib/known-flakes.js` 是抖动 / 未定因台账。断言失败时 harness 会**自动打印命中记录**
（含失败签名、根因、复现命令、不变量、复查触发器）。字段约定：

| 字段 | 作用 |
|------|------|
| `signature` | 照抄失败输出，便于按字符串检索 |
| `rootCause` | 环境条件还是代码缺陷，以及判断依据（对照实验优先） |
| `repro` | **按需复现的命令**；不能复现的 flake 等于没修 |
| `invariants` | 已证实的行为，**各有一条机械用例盯着**（会红的活注释，不是 markdown） |
| `reviewTrigger` | 未定因的复查触发器（确定会发生的事件，不是「等有空」） |

**当前 `reviewTrigger` 的三件事**（三者取最早；到点做十分钟就够）：

1. 下次 **Electron 升级**（版本变化会出现在构建指纹的 `toolchain.versions` 里）；
2. CI 上**首次观测到 stdout 截断**；
3. **2026-12-19 门禁回顾** —— 重跑配对对照 / **重估豁免理由**（`grep -rn "smoke-rules-allow" scripts/`）/
   决定 `open-undefined-cause` 降级还是续期。

## 五、自检本身也会说谎（所以有混沌模式）

```bash
node scripts/self-test-gates.js --chaos        # 故意给错误期望 → 调度层必须报 FAIL
node scripts/self-test-gates.js --chaos=pass   # 故意给正确期望 → 调度层必须报 PASS
```

**为什么两个方向都要有**：调度层的正确性**无法由被测用例证明** —— 用例全绿只说明
「在它自己的判断下没发现问题」，说明不了「它的判断本身是对的」。
唯一能证明它的，是**故意造假的用例**：给一个错误期望、看它是否如实报错；
给一个正确期望、看它是否如实放行。前者防「把失败吞成成功」（红灯被吞），
后者防「把成功报成失败」——**后者正是历史上真实发生过的说谎方式**。

历史教训（值得记住形状，而不是记住命令）：`self-test-gates.js` 曾把人类可读的标签
当 CLI 参数传下去，护栏脚本收到未知 case 后**回落默认分支**，
于是前两例**因为错误的理由通过**（看起来全绿）、第三例期望 0 才暴露。
两条由此定下的规矩：

- **不设默认分支**：缺 case / 未知 case 一律 exit 2 并列出可用值。
  回落本身就是危险的控制流 —— 哪怕回落到一个失败，也会让「参数传错」看起来像「用例通过」。
- **对照程序自身也要有对照**：标签与参数分离、豁免要点名、调度层要有混沌模式。

推而广之：凡是「判断某件事对不对」的组件（扫描器、比对器、调度器、护栏），
都必须有一条**故意造假**的用例，否则它只能证明自己没意见，不能证明自己对。

## 五之二、注入式对照的**四步形态**（跨领域通用，缺一不可）

任何「故意制造故障、再看门禁是否报出」的对照，都必须走完四步。只做前两步是**假绿**的主要来源：

| 步 | 断言什么 | 不做的后果 |
|---|---|---|
| 1 | **注入真的生效** | 正则/编码/路径让注入静默失败 → 对照"通过"但什么都没测 |
| 2 | **走到了目标分支** | 注入生效但走的是相邻分支（例如 BOM 双写 → 落在 error 路径而不是 warn 路径） |
| 3 | **该分支行为符合预期** | 只有第 1、2 步，等于确认「程序跑了」，不是「程序对了」 |
| 4 | **相邻分支未被破坏** | 修 warn 时把 error 路径改坏，或反向：没有基线对照 |

三个真实事故（都发生在同一个仓库，值得当教材）：

| 事故 | 死在第几步 | 具体情况 |
|---|---|---|
| BOM 对照 | **第 2 步** | 既手写 `[char]0xFEFF` 又用 `UTF8Encoding($true)` → 写成双 BOM → 剥一个还剩一个 → 走的是 **error** 路径，却以为在验 warn 路径 |
| `--force` 对照 | **第 4 步** | 破坏性对照波及 16 个命名空间，还原只做了 1 个；教训：**验证手段本身也有波及面**，还原要用目录级命令 |
| 孤儿键注入 | **第 1 步** | `(\{)$` 在 .NET 正则里 `$` 不按行匹配 → 注入静默失败 → 对照"通过"（假绿）；补一句「注入成功=True」才拦住 |

> 结论：**验证动作本身也需要被验证**。写成规矩就是 ——
> 注入式对照的第一行必须是「注入生效」的自检，最后一行必须是「相邻分支/基线未被破坏」的对照。

## 六、相关文档

| 文件 | 内容 |
|------|------|
| `AGENTS.md` | 全部硬规则（i18n / 数据契约 / 冒烟前提 / 退出码 / 两个维度） |
| `docs/media-query-event-loss.md` | 三通道不对称性、降级链、失效上限、复现命令 |
| `scripts/lib/known-flakes.js` | 抖动台账（唯一事实来源） |
| `logs.md` | 每轮决策与实测数字（导出到「更新」页） |
