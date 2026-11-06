# 漫画对话框：四角缩放与属性可用性

日期：2026-11-03。入口 `/tools/image/cartoon`。

## 行为与复用

- 选中气泡后显示四角手柄；拖动任意一角等比缩放，对角保持原位。旋转后仍按气泡自身方向计算，宽度沿用80至3000自然像素限制。
- 缩放只改变该实例的位置与宽度，文字重新排版，字号独立控制；其他气泡保持不变。一次手势对应一次撤销。
- 手柄复用既有画布指针捕获、自然坐标、选中与历史回调；按旧版逆旋转思路适配当前width契约，不恢复旧版scaleX/scaleY数据结构。
- 手柄带既有导出排除标记，PNG不包含四角工具。
- 右侧字号、行高、字距、宽度、旋转、透明度改为单列排列，解决公共数字行被双列布局挤成竖线的问题。继续使用同一个EditorFloatField，由FIELDS注入约束和提交回调，不改公共视频编辑器控件。

## 修改文件

- `apps/next/src/view/cartoon/dialogue-transform.ts`：四角符号配置、逆旋转投影和固定对角的中心换算。
- `apps/next/src/view/cartoon/dialogue-stage.tsx`：四角手柄、手势快照和缩放分支。
- `apps/next/src/view/cartoon/dialogue-properties.tsx`：六个数字字段单列布局。
- `scripts/smoke-cartoon-dialogue.js`：真实鼠标四角、旋转缩放、独立实例、撤销和属性生效验证。

## 实际验证

- `pnpm typecheck`：通过，含Next和Electron。
- 受影响三个渲染文件ESLint：通过。
- `pnpm lint`：通过，0错误、33条既有警告。
- Next静态构建通过；源码指纹 `1ec740b8fc224d7225ce097c3bd516bfdb3bcdb0f0de19ea2359019575c55508`。
- `pnpm exec electron scripts/smoke-cartoon-dialogue.js`：36/36通过；运行前源码指纹一致，退出码0。
- `node scripts/check-smoke-rules.js`：通过。
- 逻辑函数经TypeScript printer移除注释、正常分行复核，无超过30行项；DialogueStage为JSX装配，内部事件函数分别核查。
- 真实Chromium鼠标输入覆盖四角放大、固定对角、30度旋转后缩放、一次撤销和其他两层不变；六字段实际提交后读取SVG字号、基线、字长、变换和透明度。六个输入框均至少100px宽。
- 原有背景导入、取消、损坏文件保留、PNG编码与像素、深浅主题、720px/540px布局、GIF宿主和标题槽回归仍通过。
- 全仓门禁仍因三个既有未引用键失败：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`；未修改范围外词条，未宣称全仓check通过。

## 截图

来自正式静态导出的实际Electron页面；账户和用户文档用隔离夹具，PNG轮廓、SVG、鼠标事件和图片编码均真实执行。

- [四角与六个属性输入框](screenshots/cartoon-dialogue-resize-2026-11-03/editor-properties.png)
- [浅色](screenshots/cartoon-dialogue-resize-2026-11-03/editor-light.png)、[深色](screenshots/cartoon-dialogue-resize-2026-11-03/editor-dark.png)
- [720px](screenshots/cartoon-dialogue-resize-2026-11-03/editor-narrow.png)、[540px](screenshots/cartoon-dialogue-resize-2026-11-03/editor-small.png)

截图已人工查看，四角与数值输入可见。未覆盖所有触摸设备、所有DPR和真实前台遮挡；系统选择器人工点击与保存确认沿用前次未验证说明。

## 本轮增量注释

以本轮开始的独立快照为基线，保留上一轮及用户其他工作区修改。新增transform全文、其余三个文件只统计新增/替换行；文档、PNG和审计JSON不纳入分母。

- 业务：C=65、B=27，70.65%。
- 测试：C=111、B=47，70.25%。
- [逐文件审计与基线摘要](cartoon-dialogue-resize-comment-audit-2026-11-03.json)。

人工核对说明与实现：以“拉照片一角，另一角留在桌面原处”解释固定对角和中心偏移；测试说明区分真实鼠标命中、读取SVG结果与未覆盖的系统原生交互。
