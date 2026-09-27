# locale 水合（批次 A 第二半）的设计依据

下一笔照这份做。**六格定性 + 三坑 + 验收四样**，全部已确认，不再需要重新论证。

## 一、六格定性（已取证，勿重新讨论）

| 格 | 定性 | 证据 |
|---|---|---|
| 渲染层读文档 | **异步**：`useEffect` 里 `await loadUserDataDocument()` 再 `primeUserDataDocument(...)` | `AppShell.tsx:41-44`；preload 全是 `ipcRenderer.invoke` |
| 主进程读文档 | **同步**：`readFileSync` + `JSON.parse` | `userData.js:21-31/50` |
| 启动注入 | **目前没有**：`main.js` 只 `loadURL(...)`，无 `additionalArguments` | `main.js:42/46` |
| 异常路径 | **返回默认值，不抛**：不存在 → `null`；解析失败 / 权限失败 → `catch → null` | `userData.js:22-31` |
| 首帧约束 | 静态导出**无 SSR** ⇒ 不存在 hydration mismatch；真正约束是 `data-locale`/`lang` 必须出现在 **React 首次提交的 DOM** 里 ⇒ **只能惰性初始化，不能用 `useEffect`** | 本页第四节 |
| harness 兼容 | 冒烟套件自建 `new BrowserWindow`（不经 `main.js`）⇒ `window.initialLocale` 恒 `undefined` ⇒ 命中 `missing → zh-CN`（白拿一格覆盖） | 六个套件的窗口创建代码 |

**选型：注入式**（主进程创建窗口前同步读 → 注入 → preload 同步暴露）。理由里最硬的一条不是省一次闪烁，而是**消掉一个时序类 flake**：若改为「决议后再挂信号」，冒烟断言就得容忍「先无信号后有」，这类断言正是本仓库间歇性失败的来源（`smoke-characters` 已吃过 1/3 的苦）。

异常路径结论：**不需要**额外 try/catch（`readUserData` 已定义异常语义）；注入时按 `readUserData()?.data?.settings?.locale` 取，`null` 交给 `resolveLocale` 的第一格。

## 二、三坑（写出来才会撞到的那种）

1. **首帧 zh-CN → 异步文档到达后翻 en 是预期行为，不是回归。**
   - 允许至多**一次** locale 跳变，方向固定为「快照决议值 → 文档决议值」。
   - 因此冒烟断言**不能**写「首帧即终值」，应写「首帧 ∈ {zh-CN, 注入值} 且**稳定后**等于文档值」。否则同一份断言在正式窗口红、在 harness 绿 —— 语义随环境变化，是最坏的用例。
   - 日志告警要能区分 `missing` 与 `stored`：看到「回退 zh-CN」紧接「切换成 en」时，应一眼判定为正常启动流程而非脏数据（`localeResolutionWarning` 只对 `invalid` 产告警，正好覆盖）。
2. **注入参数加命名空间前缀**：用 `--illusion-locale=en`，**不要** `--initial-locale=en`（renderer 的 `process.argv` 挤满 Chromium/Electron 自己的开关，三个月后可能被吃掉）。
   - 解析时按前缀匹配，**只取最后一个匹配项**（argv 可重复）；
   - **无匹配 = `undefined` = `missing`** —— 必须与 `resolveLocale` 第一格严丝合缝，否则会出现「明明传了参数却回退中文」的假失败。
3. **快照读后即焚**：`window.initialLocale` 只读一次，读完立刻 `delete`，防止设置页 / 热重载 / 窗口重建时误读过期快照（那类「改了语言又跳回去」的 bug 极难排查）。

## 三、验收四样（下一笔只看这四个）

1. 注入参数带命名空间前缀（`--illusion-locale=`）；
2. `AppShell` **惰性初始化**（`useState(() => resolveLocale(...))`），**不是** `useEffect`；
3. 断言**容忍一次单向跳变**（首帧 ∈ 集合，稳定后 = 文档值）；
4. `package.json` scripts 存在性检查**不误杀复合命令**。

## 四、落地形状

```ts
// AppShell：首帧 DOM 就带信号（不是 effect）
const snapshot = typeof window !== "undefined" ? window.initialLocale : undefined;
delete (window as { initialLocale?: string }).initialLocale; // 读后即焚
const [locale, setLocale] = useState(() =>
  resolveLocale(snapshot, AVAILABLE_LOCALES, DEFAULT_LOCALE).locale
);
// 同一语句、同源、同标签：lang 由决议结果派生，绝不透传原始字段
// （否则脏值 "ja" 会同时污染日志与 DOM）
```

异步文档到达后：`const next = resolveLocale(doc?.settings?.locale, AVAILABLE_LOCALES, DEFAULT_LOCALE).locale;`
**仅在 `next !== locale` 时** `setLocale(next)`。

`reason` 契约的穷尽检查：`localeResolution.ts` 是 `.ts`（strict），switch 不带 `default` 即够；
将来若这段逻辑挪进 `.js`，必须补运行时兜底 `default: throw new Error("unreachable reason: " + r)`。

## 五、随后可选的两颗螺丝（零边际成本，与守卫 2 同批跑）

- `package.json` scripts 存在性检查：**保守做法** —— 只看每个值的第一个 token，不做全语法解析（目标是「门禁不自毁」，不是脚本语法校验）。典型漏网：`"pnpm run a && node x.js"`、带引号或 flag 的串。
- 硬编码中文扫描器的**显式豁免标记**（如 `// i18n-exempt: developer log`）取代「靠注释里一句英文争取」的做法，让豁免可统计、可审计。这条为 `localeResolutionWarning` 那种开发者日志而设（日志用英文，但机制要显式）。

## 七、harness 可以直接造出「注入 en → 首帧即 en」（本轮新增的关键简化）

原先我以为「注入类测试要覆盖 en，得让套件自己决定注入什么」是额外机制。其实不用：
六个冒烟套件本来就自己 `new BrowserWindow({ webPreferences: { preload, additionalArguments } })`，
而 `additionalArguments` **正是** `initialLocale` 的注入通道 —— harness 窗口虽然不走 `main.js`，
但它照样走 `parseInitialLocale`（那个函数只吃 argv，不在乎 argv 从哪来）。

于是第 3 格的断言可以从「容忍一次单向跳变」升级成**确定性的两档**：

| 套件构造窗口时 | 首帧 | 稳定后 |
|---|---|---|
| 不传 `additionalArguments` | `zh-CN`（`missing`） | = 文档决议值 |
| 传 `--illusion-locale=en` | `en`（`stored`） | = 文档决议值 |

跳变仍然允许发生（正式窗口在「快照值 ≠ 文档值」时确实会跳一次），但**冒烟不再依赖跳变来证明正确性** ——
harness 里可以让快照与文档相等（都不传 = 都落 `missing`；都传 en = 都落 `stored`）。
这是把时序不确定性从断言里彻底抽掉的唯一办法；「容忍一次跳变」只作为正式窗口手工验证时的说明。

## 八、两条落地前的语义收口（本轮已落到代码/文档）

1. **「空值不覆盖」写成不变量，而不是靠测试表暗示**（已写入 `apps/electron/initialLocale.js`）：
   > 解析结果 = argv 中「最后一个非空的匹配值」；没有则 `undefined`。

   防的是语义漂移：将来加 `--illusion-locale=auto` 这类语义值时，容易误以为「空串是合法值」
   而删掉空值分支 —— 空串在 CLI 里表示「没传」，当成合法值会让
   `--illusion-locale=en --illusion-locale=` 从 en 变成空值再落回 zh-CN。
2. **快照用「读过就标记」而不是静默即焚**（接线时按此实现）：
   preload 的 `exposeInMainWorld` 同步、先于渲染层脚本，所以 `window.initialLocale`
   在 AppShell 模块求值期可读 —— 这点成立。但 HMR / 热重载会重求值模块，此时快照已被销毁，
   惰性初始化落到 zh-CN、异步文档到达又翻回 en：**开发态多一次无意义跳变，且可能掩盖真正的接线问题**。
   所以销毁改成标记，重复读取时**明确记一条 debug 日志**，让开发态的异常跳变可观测；生产态行为不变。

BOM 那类「假红灯」的处理也定了口径：检查器**剥掉 BOM 继续查真正的缺陷，同时单独 warn**（见 `check-script-refs.js`），
因为 BOM 是脏东西但不是该检查的目标，报成 error 会把人往错方向引。


## 九、接线时会在落笔处撞墙的三格（已定性，动手前先读这节）

### a. main 注入必须是**原始字段值**，不能注入决议后的值

若 main 侧先 `resolveLocale()` 再注入，渲染层拿到的永远是合法值 ⇒ `reason` 恒为 `stored`，
于是真值表里的 `missing` / `invalid` 两格**在正式窗口上永远测不到**，
日志里也分不出「用户选了 en」和「文件坏了回退 zh-CN」。

**结论：inject 原始字段值**（`undefined` / `"ja"` / `"en"` 原样透传），
判决权留在渲染层的 `resolveLocale` —— 这样 `reason` 统计才真实，`missing` 在正式窗口上依然可达。
（影响面：main / 文档 / 日志三处，写一半再改会牵动全部三处，所以先定。）

### b. `lang` 只能走模块求值期的同步写，不能走 effect

静态导出下 `_document` 是**构建期**渲染，拿不到运行时 locale ⇒ `<html lang>` 没法走 React。
唯一可行：在 `AppShell` **模块求值期**同步写 `document.documentElement.lang = resolved` ——
它早于首次提交，且能与 `data-locale` 写在**同一条语句**里。
钉死这一点，否则很容易顺手塞进 effect，又晚一帧。

### c. 异步文档到达是「无信号事件」，必须挂 ready 标记

不挂标记的话，冒烟只能 `setTimeout` 猜时序 —— 那正是本仓库间歇性失败的来源。
**要求**：异步决议完成后，在与 `data-locale` **同一元素、同一次更新**里挂 `data-locale-ready="true"`。
断言写成「等到 ready 再取 `data-locale` / `lang`」，彻底去掉时序猜测。

### d. 快照的「读过就标记」需要显式标记位

只用 `delete window.initialLocale` 不够：**「重复读取」与「从未传参」在观测上不可区分**，
第八节要求的 debug 日志就写不出来。需要显式留 `window.__initialLocaleConsumed`（或等价物）。

### e. 验证批次从两档扩成三档

| 档 | 构造 | 期望首帧 | 期望 reason |
|---|---|---|---|
| 1 | 不传 `additionalArguments` | `zh-CN` | `missing` |
| 2 | `--illusion-locale=en` | `en` | `stored` |
| 3 | **`--illusion-locale=ja`（非法）** | `zh-CN` | **`invalid`** |

第 3 档不能省：**main 那一格是唯一能产出 `invalid` 的地方**，只测两档就会把 `invalid`
漏在正式窗口之外 —— 而非法值恰恰是「用户文档被手改 / 迁移写入脏值」时唯一会走到的分支。

### f. `contextBridge.exposeInMainWorld` 拒绝 `undefined`，且后果是**整个页面加载失败**

实测：`exposeInMainWorld("initialLocale", undefined)` 直接抛异常，而该异常会让页面加载
以 `ERR_FAILED (-2)` 结束 —— **不是「桥接少一项」那么轻**，是「窗口打开是白的 / 加载失败」。
更坑的是 **`preload-error` 事件不会触发**，所以别指望它报警。

抓它的手段是最便宜的那种对照：**同一页面「带 preload / 不带 preload」** ——
不带 `LOAD OK`、带 `LOAD FAILED`，一次运行即定位到 preload（而不是页面、路径或协议）。

修法：**有值才 expose**。不 expose 时 `window.initialLocale === undefined`，
与 `parseInitialLocale` 的「无匹配 = undefined = missing」语义一致，渲染层照样正确落 zh-CN。

> **代价（不可逆的简化，写在这里免得三个月后重新推）**：
> 「从未传参」与「传了空串被丢弃」在观测上**不可区分**了 —— 两者都是 `window.initialLocale === undefined`，
> 都落到 `missing → zh-CN`。当前语义下这是正确的（本来就都是 missing），但它意味着：
> 将来若想支持「显式清空语言设置 → 强制回退中文」，**这个通道已经无法表达**。
> 要恢复表达能力，需要换一种编码（例如传 `--illusion-locale=default` 之类的语义值），
> 而不是把 `exposeInMainWorld` 改回传 undefined（那会让页面加载失败，见上）。

> 通用教训：往 `contextBridge` 加任何暴露项时，值都要先判空/判类型；
> 并且**必须用「带/不带 preload」的同页面对照**验证，不能只看 preload 有没有报错。

### g. 探针页面：`data:` 与 `file://` 都不可用

| 取法 | 结果 |
|---|---|
| `loadURL("data:text/html,…")` 顶层导航 | 本版本 Electron 拒绝（`ERR_FAILED`） |
| `loadFile(<临时 html>)`（**配 preload**） | 也 `ERR_FAILED`；同一页面**不带 preload** 正常 |
| `loadURL("about:blank")` | 可用（preload 照常执行） |
| `app://app/index.html`（冒烟套件用法） | 可用（`app://` + 同一 preload，套件 69/69） |

自检脚手架统一用 `about:blank`；页面加载不了时**退出码 3 = SKIP** 并打印原因
（显式未验证，不计入覆盖 —— 静默通过和假红一样坏）。

### h. `additionalArguments` 只在该窗口**新建渲染进程**时生效

同一进程里连续开多个窗口时，后开的窗口会**复用**先开的渲染进程，
于是它的 `additionalArguments` 从未进入那个进程 —— 实测症状：
第 1 档（不传）通过、第 2 档（传 `en`）读到 `undefined`。

因此注入类自检必须是**逐档独立进程**（`self-test-locale-injection.js` 用「自己派生自己」，
与 `self-test-harness-guard.js` 同款形状）。这条只影响自检脚手架：
正式应用只创建一个主窗口，不涉及复用。

## 十、AppShell 那一笔的两格「未命名坑」与冒烟规格（已定性，照此实现）

### i. 快照必须读进**模块作用域常量**，不能读在 `useState(() => …)` 回调里

两者都「只执行一次」，但时机不同：模块作用域的读取发生在**模块求值期**，
回调里的读取发生在**首次渲染期**。差别在 HMR —— 模块重求值时标记位已是 consumed，
回调会读到 `undefined` → 落 `missing` → 首帧翻回 zh-CN。
**症状与「接线没通」完全一样，且只在开发态出现**，是最难排查的那一类。

```ts
const CONSUMED = Symbol.for("illusion.initialLocale.consumed");
const snapshot =
  typeof window !== "undefined" && !(window as any)[CONSUMED]
    ? (((window as any)[CONSUMED] = true), (window as any).initialLocale)
    : undefined;

const [locale, setLocale] = useState(() => resolveLocale(snapshot, AVAILABLE_LOCALES, DEFAULT_LOCALE).locale);
```

标记位用 `Symbol.for` 而**不是布尔值**：这样「从未传参（`undefined`）」与「已消费（Symbol）」
在观测上可区分 —— 这正是第八节要求「重复读取时记 debug 日志」的前提；
若用布尔，`false` 与「没传」在类型上撞车，日志写不出来。

### j. 目标节点必须先钉死，否则「同一条语句」会落空

- 挂 `<html>`（`lang` 本来就在那）→ 写点是 `document.documentElement`；
- 挂 `AppShell` 根 `div` → 写点是 ref。

**两处不能一个走模块作用域、一个走渲染期**，否则「同源」就退化成「同文件」。
**统一挂 `<html>`**：静态导出时 `_document` 吐出的 `lang` 与客户端首帧写在**同一个节点**上。

写时机：`useState` 初始化器跑在渲染期、初始渲染同步提交 ⇒ **早于首帧绘制**，成立。
若为「更早」而挪到模块作用域也安全（`document.documentElement` 在静态导出页与
`about:blank` 探针页都存在）；**唯一不安全的是塞进 effect**。

### k. 三档冒烟的规格（复用自检形状，但换页面）

- **页面**：必须走 `app://`（测的是 AppShell 的真实 DOM），不能像注入自检那样用 `about:blank`；
- **进程**：每档 spawn **独立 Electron 进程** —— 同一实例依次加载三个 URL 会复用渲染进程，
  第 2、3 档的 argv 同样进不去（第九节 h 的变体）。照搬 `self-test-locale-injection.js` 的形状；
- **等待谓词**：有界轮询「`data-locale-ready` 属性出现」，**超时必须 dump 实际取到的
  `data-locale` / `lang` / ready 状态** —— 超时原因有三种（ready 根本没挂 / 挂晚了 / 值错了），
  只报 `timeout` 会让人重新去猜时序；
- **SKIP ≠ PASS**：假红那条改成显式 SKIP 后，若统计把 SKIP 计入通过，要在输出里明确标注并**单独计数**。

## 六、守卫 3（7 处数据契写字面量）——先红灯，后修法

威胁模型有两半，**负向冒烟先立起来再动任何匹配逻辑**：

- **写不污染**：保存后读回文件，断言那 7 处字面量原样存在 —— 比对**原始字符串**（JSON 重序列化会规范化引号与键序，用序列化结果比对会漏掉「我们重写了文件」）；
- **读能兼容**：手工造一份带那 7 处中文字面量的旧文件 → 走当前合并逻辑 → 断言解析后**结构等价**且不报错。这一半对终端用户才致命（旧文件还能不能打开）。
