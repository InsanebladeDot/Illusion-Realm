# 画布媒体直接保存到工程（2026-11-12）

画布生成结果直接写当前工程分类目录，登记节点时复用原文件，不再先保存图库、再复制进工程。目录沿用现有大小写，避免破坏旧工程包与路径识别：

```text
user/Infinite Canvas/<工程目录>/
├─ project.sqlite
├─ Picture/  图片、图片超分结果
├─ video/    视频、视频超分结果
└─ Audio/    音频
```

用户根沿用主进程现有路径服务，工程实际目录由归属标记确认，不直接把节点标题当磁盘路径。改工程显示名称仍沿用既有目录；本轮没有迁移、删除旧图库文件或历史重复副本。

## 复用与改动

| 文件或能力 | 本次行为 |
| --- | --- |
| `canvas-output-target.ts` | 通过原 `canvasImportMedia` 空列表准备工程目录；渲染层不拼绝对路径 |
| `canvas-project.schema.ts`、`project-validation.js` | 两端同时允许空列表准备目录；返回三类临时输出地址，不持久化额外路径字段 |
| `project-assets.js` | 同工程同类别普通文件直接登记；外部/其他工程来源仍复制；链接目录拒绝写入 |
| `image-generation-queue.ts`、`anima-edit-queue.ts` | 给原队列增加可选输出目标，任务记录同步归属目录；画布显式指定，创作页保持原图库规则 |
| `canvas-local-generation.ts`、`canvas-image-job.ts`、`canvas-upscale-job.ts` | 本地普通图片、H3/Anima编辑、远端后处理及独立图片/视频超分传入工程目标；准备期间取消不再提交任务 |
| `saveGeneratedImages.ts` | 每份输出追加独立UUID，防止短任务号相同且同秒完成的批量结果覆盖；PNG Meta流程不变 |
| 远端Euzhi、嵌入合成器、导演台 | 原本即写工程目录，本轮复用其既有规则 |

媒体正文仍在磁盘，工程只登记引用。外部文件默认复制后保留原件，这是导入契约；其他工程素材不能被本工程移动或接管。超分原图和结果是两份不同成果，均保留在工程内。ComfyUI服务自身输出/临时缓存不由本轮清理；本次消除的是客户端图库与画布之间的重复保存。

## 实际验证

最终Next静态构建退出0，1112个输入，指纹 `83053969a96c00a3b6d8852c4fe2f2fbb80bff4611870be773a4037a0a0c7921`。

| 检查 | 实际结果与边界 |
| --- | --- |
| `pnpm typecheck` | 通过；最终任务归属目录修正后再次执行退出0 |
| `pnpm lint` | 退出0，0错误、37条既有警告；文件名修复后补跑该文件lint退出0 |
| `pnpm --filter @illusion-realm/next build` | 通过，最终源码重新静态导出 |
| `node scripts/verify-canvas-output.js` | 通过；三类真实文件写入、同路径复用、跨工程复制、目录准备、链接目录拒绝。夹具字节不是音视频解码证据 |
| `node scripts/verify-canvas-project.js` | 通过；两端空列表接受范围及原工程格式回归 |
| `node scripts/verify-canvas-generation.js` | 219项，通过；纯生产算法，无推理 |
| `node scripts/verify-canvas-image-parameters.js` | 338项，通过；两端参数契约 |
| Electron图片生成与引用专项 | 23/23；先1张再6张，实际工程Picture恰好7份PNG、图库0副本；批量回填、挂起、取消、编辑及改名回归 |
| Electron超分与创作页专项 | 24/24；工程图片/视频路径、原图保留、顺序二次请求、失败/取消、创作页仍写图库 |
| 原画布Electron回归 | 149/149；与其他Electron逐项串行 |
| 输出路径、双语键、冒烟规则 | 分别通过；不是完整check全部通过 |
| `pnpm check` | 退出1；类型与Electron模块通过，停在既有未引用词条 `auth.verifySuccess`、`canvas.reference`、`canvas.styleTransfer`，后续串联项未自动执行 |
| `pnpm check:meta` | 单独重跑退出1；未修改的 `MetaFieldRow.tsx` 中文JSX注释被判字段文案，真实语料golden baseline缺失，不能称通过 |

自动操作运行正式静态页面与生产preload/IPC，真实读写隔离工程文件和SQLite。模型清单/生成结果来自本机HTTP固定媒体夹具；Euzhi返回值是替身，未访问收费服务。不能把这些结果当作真实H3/SeedVR2推理、人工导入或画质验收。

### 本轮发现并修复

1. 初次目录准备被主进程旧的非空列表校验拒绝：同步修正shared与主进程，补两端反证。
2. 零图库副本测试错误地假设图库目录必存在：允许目录缺席，仍严格检查没有副本。
3. 窄窗口测试在跨进程resize生效前读到旧布局：改为有界等待实际视口与侧栏重排后再断言，截图确认真实边界。
4. 七次真实保存只剩部分文件：暴露同秒短任务号重名覆盖，给输出增加独立标识后最终七份文件断言通过。未降低张数或放松文件数量要求。

修复前失败日志与最终日志均在 [运行证据](runtime/project-output-2026-11-12/) 保留。旧人工待验项不改写。

## 注释、函数与限制

以本轮开始快照 `logs/canvas-output-baseline` 为基线，保留早期工作区修改。修改文件只数本轮插入/替换后的物理行，新文件全文；剔除空行、装饰、纯类型JSDoc，混合行计代码。逐项复核注释说明与实际路径、取消、导入行为一致。

业务有效注释 **31/(31+65)=32.29%**，测试 **7/(7+54)=11.48%**。业务略高于20%–30%参考，主要为纠正原“先图库再复制”的过时说明；测试低于参考，新增主要是直接磁盘断言，没有为比例补重复解释。两类均不满足历史70%阈值。详见 [逐文件审计](project-output-comment-audit.json)。TypeScript AST叶子token按有效物理行复核，本轮触及普通函数均≤30行，见 [函数审计](project-output-function-audit.json)。

真实模型推理、手动系统选择框、系统缩放、打包安装态和长期并发压力本轮未实测。普通画布视频/音频生成仍未接通，不因分类目录已存在宣称可生成。已有音频导入继续使用Audio；本轮三类文件复用验证不代表音频生成实现。失败/取消后已写成果保留；删除节点仍不立即清文件，以保护撤销引用。旧重复副本清理与服务端缓存清理不在范围。

以下为正式工作区自动事件截图；蓝色内容来自固定HTTP夹具，不是真实模型画质：

![图片批量结果](runtime/project-output-2026-11-12/70-local-2k-six-results.png)

![视频超分结果与节点](runtime/project-output-2026-11-12/92-seedvr2-video-result-http-fixture.png)
