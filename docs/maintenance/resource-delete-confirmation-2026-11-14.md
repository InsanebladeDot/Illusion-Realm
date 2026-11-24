# 素材删除确认

“工程素材”和“全局资源库”的删除入口现在先弹出确认框，显示所选数量和系统回收站提示，提供红色“确定”和普通“取消”。点击确定才调用原删除服务。

复用 `CanvasOverlay`、`CanvasChip` 和 `canvas.module.css` 的对话框样式。确认时背景列表不可操作，关闭确认后焦点返回删除按钮；执行期间禁用重复操作，失败在确认框内显示。资源归属、引用保护、回收及数据库规则不变。

## 验证

- Next 类型检查通过。
- 全量 lint 通过：0 错误，37 条现有警告；修改组件的单独 lint 也通过。
- 回归脚本语法检查通过。
- 已更新现有全局资源回归，覆盖取消、背景不可操作、Escape 后保留文件及确认后真实删除；本轮未运行该 Electron 回归。
- 未运行构建、实机界面操作及深浅主题截图验证。当前用户应用保持运行，未关闭或重启。

## 增量注释

统计以本轮修改前的工作副本为基线，不包含此前改动；只数新增与替换后的非空行。

| 文件 | 有效纯注释 C | 代码 B |
| --- | ---: | ---: |
| `apps/next/src/view/infinite-canvas/canvas-project-resources.tsx` | 1 | 15 |
| `apps/next/src/view/infinite-canvas/canvas-project-resources.module.css` | 0 | 4 |
| `scripts/lib/check-canvas-global-resources-ui.js` | 1 | 8 |

业务增量注释率 5%，测试 11.1%。仅解释背景禁用和取消验证的原因；其余为现有组件装配，不为达到参考比例补重复注释。
