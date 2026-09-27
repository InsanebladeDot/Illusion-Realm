# 媒体查询与事件丢失：三条通道的实测不对称性

一页纸，写给**下一次动视口 / 媒体查询相关代码的人**。结论来自 2026-09-19 的探针与故障注入，
不是推理；每条都可复现。

## 一、实测现象表

窗口被遮挡或最小化时 Chromium 会停摆渲染生命周期。此时**三条通道表现不一致**：

| 通道 | 遮挡 / 隐藏期间 | 性质 |
|------|----------------|------|
| `matchMedia(q).matches` 查询 | **最新值**（读到 false） | 同步、可读 |
| `resize` 事件 | **照常派发** | 异步、可达 |
| `matchMedia` 的 `change` 事件 | **丢失**（不派发） | 异步、丢失 |

这就是根因的精确形状（可证伪），它一次解释两件事：

- 为什么 `SimpleSelect`（resize → 重测 rect）、`TruncatedTextPopover`（resize → 重新 measure）
  一直没出问题 —— 它们绑的是**存活的那条通道**；
- 为什么「纯事件驱动的 matchMedia 写法」会死，而「以读为准」的写法能活。

时间线归因（不是推测）：`SMOKE_SWALLOW_MEDIA_EVENT=change` 主动掐断 change 通道后，
页面侧时间线为

```
variant=panel@117 → resize@1639 → change(swallowed)@1639 ×2 → variant=inline@1657
```

→ **救场的是 `resize`**（change 被吞、`visibilitychange` 那次根本没到，因为页面全程 visible）。

## 二、正确的写法

**以读为准，事件只做通知**：任何触发回调都重新求值，不采信事件载荷。

```ts
const media = window.matchMedia(query);
const update = () => setMatches(media.matches); // 读，而不是 event.matches
update();
media.addEventListener("change", update);
window.addEventListener("resize", update);
document.addEventListener("visibilitychange", update);
```

参照实现：`apps/next/src/hooks/useMediaQuery.ts`（注释里带上面那张表与时间线）。

## 三、降级链与失效上限

```
change 丢 → resize 兜 → resize 也丢 → visibilitychange 兜 → 三者都丢 → 用户动一下窗口
```

**失效上限**：仍会卡住的场景是「`matches` 变了、但窗口尺寸没变、且页面始终可见」。
现实中主要是缩放级别 / DPR 变化。

> **本降级链仅对尺寸型媒体查询完备。**
> 非尺寸型 MQ（`prefers-color-scheme`、`forced-colors`、`color-gamut` 等）变化时
> `matches` 会变而 `resize` 不会 —— 降级链的第二环对它们失效。
> 一旦本项目用到任何非尺寸 MQ，必须在 `change` 监听里单独处理，
> 或在 `visibilitychange` / `focus` 上做一次主动重查。

**不要依赖「恢复可见时补发 change」**：那是实测行为、不是规范承诺
（规范只要求 `matches` 反映最新值）。我们有它作为兜底，但不把正确性押在上面。

## 四、怎么复现（故障注入，headless 可跑）

```bash
# 最坏情况：change 通道被掐断（页面侧 shim），变体应仍能被纠正
SMOKE_SWALLOW_MEDIA_EVENT=change npx electron scripts/smoke-prompt-assembly.js   # 期望 68/68

# 负向对照：连 resize / visibilitychange 也掐断 → 变体不再被纠正（证明上一条有区分度）
SMOKE_SWALLOW_MEDIA_EVENT=all    npx electron scripts/smoke-prompt-assembly.js   # 期望 68/68

# 遮挡维度（需真实可见窗口；无桌面会话时会显式 SKIP）
SMOKE_OCCLUDE=1 npx electron scripts/smoke-prompt-assembly.js                    # 期望 67/67
```

`=all` 这一档已进 CI（`pnpm self-test:gate`）；`SMOKE_OCCLUDE=1` 留在本地 / 带桌面会话的 runner。

## 五、相关文件

| 文件 | 作用 |
|------|------|
| `apps/next/src/hooks/useMediaQuery.ts` | 唯一使用 `matchMedia` 的地方（2 个消费者） |
| `scripts/lib/known-flakes.js` | 抖动的失败签名、根因、对照证据与复现命令 |
| `AGENTS.md`（冒烟段） | 遮挡 / 事件丢失两个维度的命名与区别 |
| `scripts/smoke-prompt-assembly.js` | shim 注入 + 时间线归因的实现 |
