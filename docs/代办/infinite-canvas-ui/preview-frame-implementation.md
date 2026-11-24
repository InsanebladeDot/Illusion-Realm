# 节点网切图外框修复（2026-11-13）

预览自身与祖先没有可见 outline、border 或阴影；截图中的外围浅色框来自 AppShell main 的 1px 边线及 4px 留白。切到空节点、浅色主题时更明显。

仅在 `/canvas` 的节点网预览实际挂载时，取消 main 的这两项样式。继续复用原 CanvasSessionHost 的 ResizeObserver 同步宿主位置，不增加坐标体系；关闭或离开后选择器失效，恢复普通画布外壳。不改图片、工程数据、媒体生命周期及按钮焦点规则。

## 实际验证

| 验证 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出0 |
| `pnpm lint` | 退出0，0错误、37项既有警告 |
| `pnpm --filter @illusion-realm/next build` | 退出0 |
| `CANVAS_NETWORK_SMOKE=1 pnpm exec electron scripts/smoke-infinite-canvas.js` | 串行退出0，48/48 |
| 上述专项追加 `CANVAS_SMOKE_DEV=1` | 串行退出0，48/48 |

静态产物指纹 `59d347bb1f4f3e0212fed3f848ac2f2a90d4b7b9c07db43146e13905bb681229`，1127输入。修复前新增的三个几何断言均失败，其余44项通过，退出1。修复后首次运行47/48：空节点打开即测量，早于原 ResizeObserver 交付尺寸；补上原六秒上限轮询等待几何后通过，没有新增重试或改变产品等待。失败日志均保留。

覆盖深色键盘切换、浅色960×720点击切换、空图片节点、预览四边贴合main、关闭恢复4px/1px；原按住平移、滚轮、旋转、Tab/ESC、媒体播放和释放继续通过。最终截图已查看，外围色带消失。

上述均为 Chromium/Electron 自动事件与真实页面。媒体来自本机PNG、视频、音频夹具；未调用真实生成模型，未做人工验收。逐帧高速录屏、实体设备手感、其他主题预设及大图性能未验证；首次打开仍依赖现有 ResizeObserver 同步。此前人工待验与完整 `pnpm check` 的旧文案/Meta阻塞保持原记录，本轮未重跑全仓check。

[日志、失败反证和深浅主题截图](runtime/preview-frame-2026-11-13/)

## 增量注释

以 `logs/preview-frame-baseline` 为本轮快照，比较新增及替换最终行，纯注释逐条复核，空行不计；其他已有工作区修改不计。

| 类别 / 文件 | C | B | 比例 |
| --- | --- | --- | --- |
| 业务：workspace-shell.css | 1 | 1 | 50% |
| 测试：check-canvas-network.js | 3 | 14 | 17.65% |

业务只有一条局部规则和一句必要的作用域说明，测试主要是直接调用与几何断言；尺寸交付与关闭恢复的边界已解释。不为20%–30%参考范围拆行或补废话。新增普通函数≤30有效行。
