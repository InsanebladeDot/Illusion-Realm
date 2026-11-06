/**
 * 启动注入：把「初始语言」从主进程带到渲染层要用的**参数解析**（纯函数，可纯 Node 单测）。
 *
 * ## 为什么单独抽出来
 * 接线涉及三个进程侧（main.js 注入 / preload.js 解析 / AppShell 消费），
 * 而那三处都不好测（要真窗口）。唯一能用真值表钉死的是**解析语义**，
 * 所以把它抽成零依赖的 CJS 模块：main 与 preload 都 require 它，
 * 语义只有一处实现、一处验证。
 *
 * ## 参数形态：必须带命名空间前缀
 *   用 `--illusion-locale=en`，**不要** `--initial-locale=en`。
 *   渲染进程的 `process.argv` 里挤满 Chromium / Electron 自己的开关，
 *   通用名字迟早被吃掉（而且那种故障极难复现）。
 *
 * ## 语义（与 resolveLocale 的第一格严丝合缝）
 *   · 没有匹配 → `undefined`（= `missing` → 回退 zh-CN）
 *   · 有匹配   → 取**最后一个**（argv 可重复，后者覆盖前者，与 CLI 惯例一致）
 *   · 前缀无值（`--illusion-locale=`）→ `undefined`（空值等同于没传）
 *   · 别的语言的相似开关（`--lang=ja`）**不得**被误认
 *
 * ## 不变量（一句话，别改写成别的说法）
 *   **解析结果 = argv 中「最后一个非空的匹配值」；没有则 `undefined`。**
 *   把这句话写死是为了防语义漂移：将来若要加 `--illusion-locale=auto` 这类**语义值**，
 *   很容易误以为「空串是合法值」而去掉空值分支 —— 但空串在 CLI 里表示「没传」，
 *   一旦当成合法值，`--illusion-locale=en --illusion-locale=` 就会从 en 变成空值，
 *   进而落回 zh-CN，症状是「明明传了参数却回退中文」。要表达 auto 请用 `auto` 这个字符串。
 *
 * 注意最后一条：`--lang` 是 Chromium 自己的开关，若这里图省事做「包含 locale 就认」，
 * 用户的系统语言会悄悄改掉应用语言 —— 那是个极隐蔽的 bug。
 */

const INITIAL_LOCALE_PREFIX = "--illusion-locale=";

/**
 * 从 argv 里解析初始语言。
 * @param {readonly string[]} argv
 * @returns {string | undefined} 原始值（**不做校验**：合法性由 resolveLocale 决议）
 */
function parseInitialLocale(argv) {
  if (!Array.isArray(argv)) return undefined;
  /** @type {string | undefined} 显式标注：本包开了 checkJs，未标注的 `let` 会退化成隐式 any */
  let found;
  for (const arg of argv) {
    if (typeof arg !== "string") continue;
    if (!arg.startsWith(INITIAL_LOCALE_PREFIX)) continue;
    const value = arg.slice(INITIAL_LOCALE_PREFIX.length);
    // 空值等同没传（`--illusion-locale=` 这种写法结果不可用，不能让它覆盖前面的有效值）
    if (value.length === 0) continue;
    found = value;
  }
  return found;
}

/**
 * 构造注入参数（main 进程用；与解析端共用同一个前缀常量，避免两处各写一份字符串）
 * @param {string} locale
 * @returns {string}
 */
function buildInitialLocaleArg(locale) {
  return `${INITIAL_LOCALE_PREFIX}${locale}`;
}

/**
 * 从用户数据文档取出要注入的参数数组（main 进程用，纯函数、可零窗口单测）。
 *
 * **刻意只做「取值 + 拼参数」，不做任何校验/清洗**：
 *   · 不 import 允许集（`AVAILABLE_LOCALES`）—— main 一旦知道「有哪些语言」，
 *     就与渲染层形成**两套允许集**；将来渲染层加语言而这里忘了同步，
 *     症状是「用户选了新语言却回退中文」，且只在正式窗口复现；
 *   · 不调 `resolveLocale` —— 洗成合法值后 `reason` 会恒为 `stored`，
 *     正式窗口上 `missing` / `invalid` 两格永远测不到，日志也分不出「用户选了 en」
 *     与「文档坏了回退 zh-CN」。判决权全部留在渲染层。
 *
 * `settings` 在老文档里可能整个不存在，所以这条链必须一路可选：
 *   收进纯函数就是为了避免在 main.js 里手写成 `data.settings.locale`（老文档上会崩），
 *   同时让这条链能被真值表直接钉住（不需要 Electron、不需要窗口）。
 *
 * @param {unknown} userData `readUserData()` 的返回（`{ filePath, data, isNew }`）
 * @returns {string[]} 无值 → `[]`（不注入 = missing）；有值 → 单元素数组（**原样**，含非法值）
 */
function initialLocaleArguments(userData) {
  const data = /** @type {{ data?: { settings?: { locale?: unknown } } } | null} */ (userData);
  const raw = data?.data?.settings?.locale;
  if (typeof raw !== "string" || raw.length === 0) return [];
  return [buildInitialLocaleArg(raw)];
}

module.exports = {
  INITIAL_LOCALE_PREFIX,
  parseInitialLocale,
  buildInitialLocaleArg,
  initialLocaleArguments,
};
