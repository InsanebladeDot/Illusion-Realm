# 原导演台直接嵌入实施记录

日期：2026-11-09。用户明确要求删除旧导演台重写版，直接使用其已整理的原编译资源和模型。本记录替代此前 React + Three 重写方案，不保留备用旧引擎。

## 来源与优先级

权威来源为用户目录 `幻域导演台本地项目/导演台本地复刻/public` 及同项目的 `docs/原组件嵌入说明.md`。该嵌入说明覆盖旧“完整替换”重写任务书。供应 React 演示组件只作接口参考，独立演示 localStorage 场景保存不搬进生产。

原 `public/original` 收录 64 个运行文件，排除只给独立演示用的 index.html，正式入口使用 embed.html + embed.js。其相对依赖闭包与资源 SHA256 纳入自动检查。场景样例与动画样例复制为测试 golden，不从当前实现生成预期。

模型严格使用供应 bodykun/bodychan：

- bodykun SHA256：`c2577e82abfbf9abbd5402d009244def31c6a88ff6e40ca3bc41880b3ec99aed`
- bodychan SHA256：`3f7561a5fd20fddfb7b8e92173b351efa0743f8893f31d2607dc9a3a1e0e0e8c`

完整逐文件来源/落地摘要见 original-resource-manifest.json。原模板、姿势、道具几何和动画位于供应编译模块，不重新提取一套旧参数覆盖它们。

## 目录与复用

静态资源统一 `apps/next/public/director/{original,models}`；宿主适配统一 `src/view/director`；跨进程纯数据按 shared types/schemas/data 归位；主进程仅在现有 canvas 模块中做等价校验和资源引用。验证脚本在 scripts，证据在本任务 docs，不向源码目录散放 HTML 演示和截图。

继续复用：CanvasOverlay、场景节点、用户 JSON 写入器、生成图片写盘、localFileUrl、工程归档。iframe 只隔离供应 Vue、Three、CSS、快捷键，不重建工具栏/属性组件。新入口仍是无限画布场景节点，没有复制 AppShell，没有本地端口服务。

参数差异：打开传场景副本；保存/确认通过回调交由当前画布处理；connectedMediaUrls 目前空数组，不伪装素材库已接通。三维状态、模型生命周期、撤销历史、动画由原组件持有；宿主只持有节点身份、持久化和会话退出。

## 删除与保留

- 删除旧 30 个引擎、几何、姿势、属性、动画、轨迹、导出等实现文件，详见 original-deleted-files.json。
- director.tsx 改为 iframe 薄外壳；新增 embed-bridge.ts 与 embed-events.ts。
- 保留/修改 director-media、director-session、use-director-navigation、migrate-scene，仅用于保存边界及旧数据输入，不作为旧 UI 或旧模型备用。
- 删除旧 props.json 与六个旧专用 TS 测试，移除只为旧版安装的 mediabunny 包依赖；原自带编码编译依赖仍随原资源保留。
- 旧证据、失效文档及多余夹具移出仓库任务目录，当前 README/verification 重写为实际嵌入结果；不再链接已删除的旧实施记录。
- 删除不包含用户场景、工程媒体或其他功能模块；本轮前工作区其他修改保留，未执行 Git 提交或合并。

## 唯一运行资源补丁

1. SceneComposerDialog 的 bodykun/bodychan/xbot 模型路径统一从 `/models/` 改到 `/director/models/`。供应没有 xbot 文件，不杜撰替代模型。
2. embed.html 的 connect/img CSP 增加 localfile，使工程本地全景和图片板沿既有协议读取。
3. 同一原模块的线上识图按钮禁用并说明尚未接入；上传服务仍阻断，不假装识图成功。
4. 原视频导出 title 改为“导出视频到本地”，编码完成通知改为“正在请求本地下载；请检查下载结果”。原编码函数不改，不显示上传或创建节点的假成功。

除此之外原编译正文按源摘要核对；两个 GLB 完全相同。供应 embed.js、宿主替代件和服务阻断件本身来自用户包，并非声称恢复了其原线上 API。原图标、动画和操作步骤均由该供应包决定。

## 保存、迁移与生命周期

MessageChannel 像每个会话的专线，只有实际子窗口可建立；场景不放 URL，不对全窗口广播。打开有 30 秒上限，子请求 120 秒，宿主关闭等待 130 秒，均不是假延时成功。

原 Vue emit 不等待异步保存，供应 embed.js 串行等待 ack；幻域 bridge 也串行处理校验与真实写盘。请求编号去重，防止重复下载或生成图片节点；回调 ref 在队列真正执行时读取，防止旧闭包擦掉刚保存的预览。失败 ack 返回稳定错误提示，不向 iframe 暴露堆栈或路径。

退出走原 save → ack → cancel → closed，收到 closed 后才卸载。失败保留磁盘原文，原组件恢复最近快照并可重试；恢复会丢弃原实例的撤销栈，此限制明确保留。导航等待同一关闭承诺；卸载清专线、事件和等待计时器，迟到结果不操作下一场景。

共享契约接受原人物无 category、道具 category 为资产分类、posture=null、嵌套世界坐标 IK targets 等真实字段。passthrough 保留未知扩展，但先检查纯 JSON、深度、节点数、字符串预算、危险键、有限数字，再检查引用、轨道目标类型、关键帧及片段范围。主进程手写等价校验，不运行 Zod/共享 TS。

v1 读取先校验，局部 IK 按旧旋转缩放转换成世界坐标；v2 只换 IK 包装；原生 targets 不重复变换。迁移只改副本，version 3 表示宿主快照版本，动画 schemaVersion 仍为供应版本 2。未批量迁移用户文档，只有成功保存才替换节点场景。

图片先写文件再保存文档；工程只留路径，浏览器副本用 localfile 地址。按内容 SHA256 的 16 项收据缓存减少重复写图，失败移除收据。自动保存不反复建图片节点；确认才创建真实 JPEG 节点和连线。全景/图片板/预览继续随现有工程包导入导出，不新增存储层。

PNG、JSON、视频 Blob 下载复用原浏览器/Electron 下载流程，校验正文和文件名、限制大小、释放临时 URL；原供应模块只保存浮动预览几何偏好到 localStorage，不用它保存场景正文。

## 验证与交付状态

最终 Electron 11/11、纯逻辑 8/8、Next 构建与类型通过，lint 0 错误/37 警告。实际检查失败、较早构建的其他回归、所有未验项和注释率未达标详见 verification.md，不把原功能存在或截图相同当作完整功能验收。

截图：original-01-open（正式打开）、03-tracking（X=2.5 与原取景）、04-save-error（失败保留）、05-confirmed-image（实际图片节点）、06-female-model（供应女性 GLB）、07-animation（原动画面板）；均在 runtime/original-embed-2026-11-09。

本轮到原组件替换及保存闭环为止，未扩大到线上服务、主题重做或其他页面重构。
