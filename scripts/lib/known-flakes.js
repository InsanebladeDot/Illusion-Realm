/**
 * 已知抖动（flake）台账。
 *
 * 为什么要有这个文件：抖动最贵的不是那一次红灯，而是**下一次红灯时你要重新猜一遍**。
 * 一条 flake 如果只留在当轮的对话里，三个月后看到同样的失败签名，仍然是从零开始排查 ——
 * 于是「重跑一次就好了」变成习惯，真正的回归就此混过去。
 *
 * 因此约定：
 *   1. 每条记录必须写清**失败签名**（照抄断言输出的原文，便于按字符串检索）。
 *   2. 必须写清**是环境条件还是代码缺陷**，以及判断依据（对照实验优先于推理）。
 *   3. 已修好的也要留档，并给出**按需复现的开关**——不能复现的 flake 等于没修。
 *   4. `scripts/lib/smoke-harness.js` 会在断言失败时自动带出这里的记录。
 */
const KNOWN_FLAKES = [
  {
    id: "prompt-assembly/narrow-variant",
    suite: "prompt-assembly",
    assertion: "窄屏（右栏隐藏）时组装面板就地展开，不会没有入口",
    status: "fixed",
    /** 照抄失败输出，便于按字符串检索 */
    signature: "variant=panel innerWidth=1000（老输出）/ 轮询超时[8000ms] variant=panel matches=false visibility=hidden",
    symptom:
      "接入 smoke-harness 后 3 次里失败 2 次，同一份代码改动前单独重跑却通过 —— 表现为抖动而非回归。",
    rootCause:
      "环境条件而非代码缺陷：冒烟窗口被桌面上其它窗口盖住时，Chromium 把页面标记为 hidden，" +
      "渲染生命周期停摆。此时 matchMedia 的**查询结果仍会重算**（读 matches / innerWidth 都正确），" +
      "但 **change 事件永不派发**，useMediaQuery 的 React state 停在旧值，" +
      "data-prompt-assembly-variant 因此永远不翻。",
    evidence: [
      "对照实验（同一遮挡条件下只切换 backgroundThrottling）：",
      "  默认节流 → visibilityState=hidden, rAF 增长 0, change 事件 0 次, 变体停在 panel",
      "  backgroundThrottling=false → visibilityState=visible, rAF 正常, change 事件 1 次, 变体翻到 inline",
      "失败签名与实验室复现逐字一致（panel + innerWidth=1000）。",
      "反证：加长轮询时间无效 —— 事件根本不派发，超时是必然结果而非时间不够。",
      "同根因族：smoke-anima-workflow 的静默挂死（rAF 永不 settle）也是遮挡导致的渲染生命周期停摆。",
      "补充实测（2026-09-19，产品侧定性）：hidden 期间错过的 change，会在**页面重新可见后的第一个",
      "  生命周期补发** —— 最小化→改视口→恢复：restore 后 visibilitychange(visible)+resize 先到，",
      "  change 紧随其后，1ms 内变体翻正。所以「用户恢复窗口后界面永久停在旧变体」**没有被复现**；",
      "  但「补发」是实测行为、不是规范承诺（规范只要求 matches 反映最新值），",
      "  因此 useMediaQuery 额外把 resize / visibilitychange 当触发信号（都以「重新读 matches」为准）。",
      "该加固的配对对照（同一份构建内，无需重新构建）：",
      "  SMOKE_SWALLOW_MEDIA_EVENT=change → 吞掉 change（2 次）、保留冗余触发 → 1ms 内翻到 inline",
      "  SMOKE_SWALLOW_MEDIA_EVENT=all    → 连冗余触发也掐断（4 个监听）→ 停在 panel、超时 8046ms",
      "  后者是负向对照：证明正向那条不是「因为事件照常送达」才通过的。",
    ],
    fix:
      "smoke-prompt-assembly.js 的 BrowserWindow 加 webPreferences.backgroundThrottling: false；" +
      "断言改为 waitForVariant() 轮询，并把「轮询命中/超时 + 耗时 + viewport 诊断」写进失败细节；" +
      "遮挡维度改由 smoke.hardenWindow(win) 统一提供（SMOKE_OCCLUDE=1），" +
      "并断言「被盖住时页面仍为 visible」这一可观测后果。",
    repro:
      "SMOKE_OCCLUDE=1 npx electron scripts/smoke-prompt-assembly.js —— 页面加载完成后会额外开一个" +
      "盖住被测窗口的置顶窗口。把 backgroundThrottling 改回默认值即可复现红灯（负向对照）；保持 false 则通过。" +
      "注意时机：遮挡必须在**页面加载完成之后**才盖上；在 loadURL 之前就盖住会让页面「生来 hidden」" +
      "（实测 visibilityState=hidden、变体永远不翻），那是另一个环境前提，不是本条要复现的场景。",
    recordedAt: "2026-09-18",
  },
  {
    id: "harness/stdout-lost-on-exit",
    suite: "(所有套件)",
    assertion: "(非断言：输出完整性)",
    status: "open-undefined-cause",
    signature:
      "进程退出后 stdout 只剩外壳自己的提示行（如 npx 警告 8 行），脚本结论整段消失；退出码正常",
    symptom:
      "排查遮挡问题时遇到过两次。其中一次查明是探针自身 bug（在打印前就抛出，属正常表现）；" +
      "另一次探针跑了 5.9s 提前退出，既没写结果文件也没打印错误、阶段日志也没生成 —— **成因未定**。",
    rootCause:
      "**未定因，不要当成已证结论。** 特别是「app.exit() 会截断 stdout」这个假设**不成立**：" +
      "受控实验（200 行定长文本）没有复现任何截断。真正被证实的是另一件事 —— " +
      "app.quit() 无视 process.exitCode（实测退出码 0），所以「改成优雅退出」这个修法方向本身是错的。",
    evidence: [
      "受控实验（200 行 × 约 80 字符，外壳数行数）：",
      "  app.exit(7)                    → 200 行完整、末行 LAST_LINE、退出码 7 ✓",
      "  process.exitCode=7; app.quit() → 200 行完整、退出码 **0** ✗（红灯会变绿灯）",
      "另一次 5.9s 提前退出：加阶段日志后重跑即正常，只能说「未复现」，不是「已修复」。",
    ],
    fix:
      "**未修**（成因不明时不动退出机制，改了就是「我觉得好像好了」）。只做了正交的零成本兜底：" +
      "① 每次运行把摘要同步追加到 logs/smoke-runs.log（fs 写，不受 stdout 影响）；" +
      "② 装了退出码护栏（禁 app.quit()、有失败不得 exit(0)），防的是「修错方向反而掩盖问题」。",
    repro:
      "未复现。相关证据：logs.md 2026-09-19 第五节（三种退出方式的对照表）；" +
      "护栏自检：npx electron scripts/self-test-harness-guard.js exit-zero-with-failure（期望退出码 1）。",
    /**
     * 未定因条目必须绑一个**确定会发生的触发器**，否则「等有空再查」会永久家具化。
     * 三者取最早；到期仍无新证据就把本条降级为「已接受的风险」并写进 AGENTS.md。
     */
    reviewTrigger:
      "以下三者取最早：① 下次 Electron 升级（版本变化会出现在构建指纹的 toolchain.versions 里）；" +
      "② CI 上首次观测到 stdout 截断；③ 2026-12-19 门禁回顾。到点时做三件事：重跑配对对照、" +
      "**重估豁免理由**（`grep -rn \"smoke-rules-allow\" scripts/` —— 豁免条目本身也会老化，" +
      "例如 smoke-app.js 的 getComputedStyle 豁免在「开始断言过渡中间态」后即失效）、" +
      "决定本条降级为「已接受的风险」还是续期。十分钟的事。",
    /** 已证实的两条按**不变量**维护（各有一条机械用例盯着），不再是笔记 */
    invariants: [
      "app.quit() 无视 process.exitCode → 自检固定用例 quit-exitcode-ignored 断言其退出码为 0；" +
        "Electron 若改了这条，用例会红，说明护栏可以放宽。",
      "受控实验未能复现「app.exit() 截断 stdout」→ 自检固定用例 stdout-completeness 断言 200 行末行完整。",
    ],
    recordedAt: "2026-09-19",
  },
  {
    id: "characters/expand-animation-never-starts",
    suite: "characters",
    assertion: "展开是连续的高度动画（存在中间帧）",
    status: "open",
    signature:
      "FAIL 展开是连续的高度动画（存在中间帧）  (samples=0,0,0,0,0,0,0,0,0,0,0,0,0,0)" +
      " / FAIL 展开过程中箭头同步旋转（> 转 ↓）(mid= final=matrix(1, 0, 0, 1, 0, 0))" +
      " / FAIL 展开后箭头朝向为 ↓ 且内容可见 (down / 0px)",
    symptom:
      "2026-09-19 三次运行里出现 1 次：14 次采样高度全是 0（过渡从未开始），" +
      "同一轮里后面的「再次点击转回并恢复收起」却是 PASS（settle 到 height=0 / animations=[]）。" +
      "紧接着的独立重跑是 85/85、样本 4,24,51,65,71,74,… —— 间歇性，不是确定性回归。",
    rootCause:
      "**未定因**。已排除的：不是产物陈旧（同一份 out 上重跑即绿）；" +
      "不是遮挡导致的渲染停摆（该套件已 backgroundThrottling: false，且失败读数里 visibility=visible）；" +
      "不是 P1（图库抽屉）改动 —— 本次改动不触及 CharacterFilterSidebar 子树，且改动前后都有绿有红。" +
      "现象指向「点击之后过渡从未启动」：状态翻了（arrow=down、open=true）但 grid 行高没动过。",
    evidence: [
      "第三次运行才暴露，且**同一份构建**上重跑就绿 → 间歇性。",
      "失败轮的采样序列全 0；成功轮为 4,24,51,65,71,74 —— 差异是「过渡有没有跑」，不是「跑多快」。",
      "套件的 win.focus() + 折叠重试逻辑在失败轮**也**没拿到中间帧。",
    ],
    fix:
      "**未修**。下一次出现时的第一步：在采样前先读 `getAnimations()` 与 `document.visibilityState`" +
      "（像 settleSection 那样带诊断），把「过渡没启动」与「起跑太晚」分开 —— " +
      "两者修法完全不同。",
    repro:
      "`npx electron scripts/smoke-characters.js`（单独重跑 2–3 次，本机 1/3 概率复现）。",
    recordedAt: "2026-09-19",
  },
  {
    id: "prompt-assembly/swallow-scenario-change-never-fires",
    suite: "prompt-assembly（事件丢失维度）",
    assertion: "负向对照：连 resize / visibilitychange 也掐断时，变体不再被纠正（证明上一条有区分度）",
    status: "open",
    signature:
      "FAIL … (轮询超时[8059ms] variant=panel 被吞掉的 change=0 被掐断的冗余触发=4 " +
      '救场事件=（无前置事件） 时间线=["variant=panel@421"])',
    symptom:
      "2026-09-19 在 `pnpm self-test:gate` 里出现一次：**被吞掉的 change=0** —— " +
      "说明整个场景里 matchMedia 的 change 事件一次都没触发（时间线只有首帧的 variant=panel）。",
    rootCause:
      "**疑似测试设计缺陷（未定论）**：该断言要求 `swallowed > 0`，而 swallowed 只有在" +
      "「视口真的跨过 1280px 断点、且 useMediaQuery 已经订阅」时才 > 0。" +
      "场景的时序是 `Page.addScriptToEvaluateOnNewDocument` → `win.reload()` → 固定 sleep(1500ms)" +
      " → CDP 覆盖到 1000px：若 reload 后页面尚未完成水合/订阅，覆盖发生时**没有监听者**，" +
      "于是 change 事件从未产生（不是被吞，而是压根没发生），断言因 `swallowed > 0` 失败。",
    evidence: [
      "同一份代码在更早的运行里该步稳定通过（被吞掉的 change=2、救场事件=resize）。",
      "本次失败的时间线只有 `variant=panel@421`，连 resize 都没记到 —— 与「页面还没订阅」一致。",
      "被掐断的冗余触发=4 说明 shim 的 addEventListener 拦截确实生效（shim 装了，但没人订阅 change）。",
    ],
    fix:
      "**未修**。两个方向：① 断言前先**轮询** `window.__swallowedMediaChanges > 0`（有界超时），" +
      "仍然为 0 时按**显式 SKIP** 处理并打印原因（而不是判失败）——" +
      "牺牲一点区分度，换掉一个假红；② 或把固定 sleep 换成「等页面出现 [data-prompt-assembly] 再覆盖」。" +
      "倾向 ①，因为它同时修掉「时序不确定」这个根因类别。",
    repro: "`pnpm self-test:gate`（该步间歇复现；也可直接跑 `SMOKE_SWALLOW_MEDIA_EVENT=all npx electron scripts/smoke-prompt-assembly.js`）。",
    /**
     * 无主的已知失败比红色状态本身更危险 —— 它不会有人去修。
     * 责任人写「下一个动该套件的人」而不是留空：留空等于宣布「没人认领」。
     */
    owner: "下一个修改 smoke-prompt-assembly 或事件丢失维度的人（认领后在提交信息里写明）",
    /** 修它的那一笔**只许修它**：这类「先修掉它」的补丁最容易变成夹带改动的特快通道 */
    fixScope: "只改断言时序（轮询 swallowed > 0 + 有界超时 → 仍为 0 则显式 SKIP），不得顺手改场景里其它断言",
    recordedAt: "2026-09-19",
  },
  {
    id: "prompt-assembly/wide-viewport-assertions-environmental",
    suite: "prompt-assembly",
    assertion: "恢复宽屏后组装面板回到右侧栏",
    status: "open",
    signature:
      "FAIL 恢复宽屏后组装面板回到右侧栏 (轮询超时[8024ms] variant= innerWidth=444 matches=false visibility=visible …)" +
      " / FAIL 宽屏时不存在窄屏专用的图库入口（负向对照）" +
      " / FAIL 开启后右侧面板切换为提示词组装面板 (variant=inline gallery=true)" +
      " / FAIL 动作库渲染 24 张卡片 / 4 列网格 (24 张 / 3 列)",
    symptom:
      "同一份代码多次运行：有时 75/75 全绿（innerWidth=1586），有时若干条**依赖窗口宽度**的断言失败，" +
      "读数依次见到 innerWidth=946 / 444，还有一次进程被外部终止（exit 1073807364、无日志）。" +
      "失败集合每次不同，但都属「窗口没达到 xl 断点以上」这一族。",
    rootCause:
      "**环境性**：本机主屏当前 1707×960（工作区高 912），而冒烟窗口请求 1600×1000 —— " +
      "窗口被系统约束在屏幕内，某些时刻宽度被压到 xl(1280) 以下，于是所有「宽屏才成立」的断言一起红；" +
      "同期与宽度无关的断言（语言三信号、popover 定位、子页进入/返回）全部 PASS。",
    evidence: [
      "成功轮 innerWidth=1586；失败轮 946 / 444 —— 差异只在窗口宽度。",
      "失败轮里与宽度无关的断言全部通过。",
      "主屏分辨率实测 1707×960，小于冒烟窗口请求的 1600×1000。",
    ],
    fix:
      "**未修**。方向：① 把「宽屏档」也改成用 CDP `Emulation.setDeviceMetricsOverride` 施加" +
      "（与窄屏断言同一套原语，彻底摆脱 OS 窗口尺寸影响）；② 或断言前先读 innerWidth，" +
      "未达 xl 时按**显式 SKIP** 处理并打印读数。倾向 ①：让宽屏与窄屏对称地成为受控条件。",
    repro: "npx electron scripts/smoke-prompt-assembly.js（本机间歇复现；失败时看 innerWidth 读数）",
    owner: "下一个修改 smoke-prompt-assembly 或该套件窗口尺寸用法的人",
    fixScope: "只改「宽屏档」的施加方式（CDP 覆盖或显式 SKIP），不得顺手改窄屏档与子页断言",
    recordedAt: "2026-09-20",
  },
];

/** 按断言名查台账（断言名可能被改写，故用包含匹配兜底） */
function findKnownFlake(assertionName) {
  if (!assertionName) return null;
  return (
    KNOWN_FLAKES.find((entry) => entry.assertion === assertionName) ??
    KNOWN_FLAKES.find(
      (entry) => entry.assertion.includes(assertionName) || assertionName.includes(entry.assertion)
    ) ??
    null
  );
}

/** 把台账条目压成几行，供失败时直接打印 */
function formatKnownFlake(entry) {
  const lines = [
    `已知 flake 台账命中：${entry.id}（状态：${entry.status}）`,
    `  失败签名：${entry.signature}`,
    `  根因判定：${entry.rootCause}`,
    `  修复：${entry.fix}`,
    `  按需复现：${entry.repro}`,
    "  结论前先照上面的复现步骤确认，不要直接重跑当通过。",
  ];
  if (entry.invariants?.length) {
    lines.push("  已证实的不变量（有机械用例盯着）：");
    for (const invariant of entry.invariants) lines.push(`    · ${invariant}`);
  }
  if (entry.reviewTrigger) lines.push(`  复查触发器：${entry.reviewTrigger}`);
  // 「无主的已知失败比红色状态本身更危险」—— 责任人 / 修复范围 / **创建日期**必须随失败一起打印，
  // 否则记在字段里也是隐形的，等于没记；无日期的 open 项三个月后与「已经没人关心了」不可区分。
  if (entry.owner) lines.push(`  责任人：${entry.owner}`);
  if (entry.fixScope) lines.push(`  修复范围：${entry.fixScope}`);
  if (entry.recordedAt) lines.push(`  记录日期：${entry.recordedAt}`);
  return lines;
}

module.exports = { KNOWN_FLAKES, findKnownFlake, formatKnownFlake };
