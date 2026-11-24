# 导演台 · 原组件直接嵌入

状态：已替换旧 React 重写版，正式入口运行用户提供的原编译导演台；核心自动闭环通过，完整人工验收及代码注释门槛尚未通过。

入口：无限画布 → 场景节点 → 打开导演台。继续使用幻域现有画布、用户 JSON、图片保存和工程包能力，不运行供应项目的独立演示存储。

## 固定目录

| 位置 | 职责 |
| --- | --- |
| `apps/next/public/director/original/` | 原 Vue/Three 编译页面、CSS、图标、动画编码依赖，共 64 个文件 |
| `apps/next/public/director/models/` | 用户提供的 `bodykun.glb`、`bodychan.glb`，按字节核对摘要 |
| `apps/next/src/view/director/` | iframe 外壳、专线消息、媒体地址、退出保存及旧数据输入迁移 |
| `packages/shared/src/{types,schemas,data}/director*` | 原生快照契约、纯 JSON 与引用校验 |
| `apps/electron/src/main/modules/canvas/director*` | 主进程等价校验与工程资源引用 |
| `docs/代办/director/` | 当前记录、来源摘要、删除清单、实际截图和检查日志 |

开发时由 `apps/next/out/director/` 提供资源；打包规则将同一静态目录放入 `resources/next-out/director/`，通过 `app://` 读取。不依赖用户 Documents 路径或额外本地服务器。正式安装包未在本轮实际安装验证。

人物、姿势、IK、机位、工具条、图层、模板与动画均运行供应模块。旧引擎、旧人偶、旧属性面板和旧动画实现已删除，没有备用旧导演台。仅保留必要的工程宿主适配和旧文件迁移；已有场景不会因替换被批量删除。

最小适配仅涉及模型路径、本地纹理协议、未接入线上入口的禁用说明，以及视频导出改为本地下载的准确提示。不修改原模型、骨架、姿势或动画求值逻辑。原界面目前仍为深色中文，不能声称已适配原生浅色或英文。

## 当前证据

- 原生契约/迁移/桥接/归档/资源完整性自动检查：8/8。
- 最终静态构建的正式 Electron 导演台回归：11/11。
- 最终构建 DPR 1.25/1.5 各 11/11（自动渲染缩放）；同轮较早原画布回归 118/118。
- 最终构建、类型检查通过；lint 0 错误/37 警告。
- `pnpm check` 失败：三个既有未引用词条；单跑 Meta 检查另有既有失败。
- 增量注释率业务 30.37%、测试 13.44%，未达到分别 70% 的要求，不能标记完整验收通过。

[实施记录](original-embed-implementation.md) · [实际验证与未验证](verification.md) · [来源与摘要](original-resource-manifest.json) · [删除清单](original-deleted-files.json) · [增量注释审计](original-comment-audit.json)

![正式入口的原导演台](runtime/original-embed-2026-11-09/original-03-tracking.png)

## 补充实测：静止人物的推进镜头

已实际播放并导出 5 秒相机推进动画：前 4 秒推近，最后 1 秒停留，1280×720 / 30fps / H.264。人物参数保持不变。此结果仅补齐这一指定短片的导出验证，不改写完整人工验收状态。

[动画实测记录与视频、工程](camera-push-in-experiment.md)

## 修复：导演台节点拖动

正文的禁止拖动标记已缩小到打开按钮，预览图关闭原生图片拖拽。空卡与真实预览卡的正文移动、打开、保存回归最终13/13通过。[修复与证据](node-drag-fix.md)。

## 补充实测：脚底环绕到面部

已实际播放并导出 8 秒动画：前 7 秒从脚底环绕一周并抬升到面部，末 1 秒停留。人物参数不变，720p / 30fps / H.264，240 帧完整解码成功，并提供可导入工程。[作品、运行截图与验证记录](foot-orbit-to-face-experiment.md)。既有人工待验与检查限制继续保留。
