# 生成图片预览去重与图片自定义尺寸开放

## 行为

生成结果以前无条件把临时预览加在磁盘清单前面，同一图片保存后被扫描到，便出现两个缩略图。现在普通图片与 Anima 编辑任务记录预览对应的实际保存路径，创建页按这个身份合并临时项和磁盘项。保存时的重命名、多轮批量生成及不同输出目录都不再依赖文件名猜测。

最新结果仍在首位；同路径只占一项，像素相同但路径不同的两张作品仍分别保留。切图索引查询合并后的展示数组，首图保留真实文件路径以支持右键操作。原缩略图带、主图和最新结果卡继续复用原组件与同一个预览源。

预览组件已有 src 时，不再通过 filePath 额外触发本地 base64 读取；内嵌与放大层的相邻图片预取遵守同一规则。临时 URL 仍由任务队列拥有、替换和回收。没有清空全局历史缓存，没有删除磁盘文件，也没有测量或承诺具体节省的进程/GPU 内存。

图片自定义尺寸移除原 1500 上限，输入不再设置 HTML max；解析、缩放和草稿恢复也不截断大尺寸。图片保留最小 8 像素与 8 像素对齐；例如 1500 对齐为 1504，400 保持 400。无穷值、NaN 和无效小尺寸回落到最小单元。

图片和视频继续复用 SizeSelector，通过可选 max 注入差异。MiniMax H3 使用独立的范围：最小 64、当前界面最大 1472、32 像素对齐，提交兼容旧草稿至 1500。它不再从图片模块导入上下界。

## 验证

- Next 静态构建成功，最终冒烟匹配 743 个源码输入的指纹，摘要前缀 `28a8b274cfcf`。
- `pnpm typecheck`、`pnpm lint` 通过，lint 为 0 错误、33 条原有 warning。
- `node scripts/verify-video-resolution.js` 通过：保留两个真实 H3 模板的 28740 组尺寸/缩放组合，并增加图片 4096×2160、0.5 倍缩放、旧上限对齐、超大数值与非法数值检查。
- 创建页 Electron 冒烟最终 **180/180**，退出码 0。实际输入 4096×2160，核对显示摘要与提交 latent 参数；保存夹具回填真实返回路径，检查缩略图数量、切图后的实际 src、最新项右键菜单。两张生成夹具故意像素相同但保存路径不同，防止误做内容去重。
- 原布局、窄屏、深浅主题、英文、九宫格、多选、弹层、文件管理、文字编辑、蒙版、停止及断连回归一并通过。
- 首次完整冒烟在已通过 172 项后遇到旧脚本寻找已移除的“角色”模式而异常，退出码 1；核对现有 CreateModeTabs 后，修正脚本为实际四种模式，再串行重跑得到 180/180。未通过修改产品恢复下线入口来掩盖测试过期。
- 最终日志：`logs/smoke-create-layout-2026-10-27T11-42-55-810Z-40728.log`，摘要追加至 `logs/smoke-runs.log`。截图在临时目录 `ir-create-layout-vXRfeF`；实际查看了生成界面截图。
- `check:i18n`、`check:i18n:en`、双语键一致性、冒烟规范检查通过。
- `pnpm check` 在类型与 Electron 模块检查通过后，仍因已有未引用词条 `auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active` 停止，后续链未执行。
- 额外运行的 `verify-i18n-values --base HEAD` 报告既有 `galleryPaintings.ts` 删除中的 32 处文案，不属于本轮涉及文件；未为消除该报告修改旧图库。

所有冒烟串行使用隔离用户目录和假模型服务，没有关闭用户客户端、修改真实图片或执行 GPU 生成。4K 尺寸验证针对参数传递；实际推理可行性与具体内存占用未实测。本轮重建了静态界面，未制作新安装包。

## 注释审计

基线为本轮开工及新增尺寸需求开始前的文件快照，保存于系统临时目录 `ir-preview-dedup-2026-10-27`。统计本轮新增/替换行，使用 TypeScript AST 区分注释与代码，再人工复核内容；不把工作区之前的改动计入本轮成果。

| 文件 | 有效注释 C | 非空代码 B |
| --- | ---: | ---: |
| components/ImagePreviewOverlay.tsx | 32 | 12 |
| hooks/useComfyGenerate.ts | 7 | 3 |
| i18n/locales/en/create.ts | 0 | 3 |
| i18n/locales/zh-CN/create.ts | 0 | 3 |
| stores/useCreateFormStore.ts | 5 | 2 |
| stores/useGenerationTaskStore.ts | 3 | 1 |
| utils/anima-edit-queue.ts | 3 | 1 |
| utils/image-generation-queue.ts | 9 | 3 |
| utils/imageSize.ts | 13 | 3 |
| utils/comfy/video-resolution.ts | 11 | 5 |
| view/CreatePage.tsx | 26 | 9 |
| view/create/creation-size-selector.tsx | 5 | 2 |
| view/create/size-selector.tsx | 18 | 8 |
| scripts/smoke-create-layout.js | 93 | 40 |
| scripts/verify-video-resolution.js | 12 | 4 |

业务合计 C=132、B=55，**70.59%**；测试合计 C=105、B=44，**70.47%**。前 13 行路径相对于 `apps/next/src`。用“电子票与纸票合并成同一张票”解释预览身份，用“不同尺寸画框”解释图片与视频约束的边界；测试注释说明相同像素、不同路径为何必须保留为独立作品。
