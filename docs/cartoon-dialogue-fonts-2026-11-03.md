# 漫画对话框：文字解锁、字体与顶部旋转

日期：2026-11-03，正式入口 `/tools/image/cartoon`。仅修改漫画合成工具与其实际复用的公共数值控件参数，保留工作区已有修改。

## 本轮行为

- 画布选框为0.75px淡色细线，随缩放保持线宽；四角与顶部旋转控件同样使用浅色描边。模板PNG自身的黑色漫画线条不受影响。
- 右侧数值控件焦点由原强光圈改为1px淡色轮廓，仍可键盘定位；非法数字的错误提示保留。
- 单击气泡选中后可直接调整字号、字体、行高、字距、颜色、宽度、旋转与透明度；正文默认只读。
- 双击气泡或正文框解锁右栏唯一textarea并进入输入。键盘可在只读框按Enter解锁；Escape或“完成”结束输入并保留选择；单击其他对象重新锁定正文。后续按用户澄清，数字框也改为双击解锁，详见[数字输入补充记录](cartoon-dialogue-number-lock-2026-11-03.md)。
- 顶部使用既有Lucide RotateCw图标，按住拖动旋转。沿旧rotationFromPointerDrag的指针角差机制适配当前自然像素文档；中心与宽度不变，一次旋转对应一次撤销。右栏精确角度输入继续保留。
- 增加10种随包离线字体：站酷快乐体、站酷庆科黄油体、站酷小薇体、马善政毛笔体、龙藏手写体、刘建毛草、志莽行书、Bangers、Comic Neue、Pangolin。其中三款英文漫画字体以目录中的latin标记显示“英文漫画”；中文缺字由系统字体回落，不声称全部字体覆盖所有中文字符。

上述列表中的英文漫画字体为Bangers、Comic Neue、Pangolin；其余七项为中文手写或展示风格，适合不同对白、旁白与拟声用途，并非声称十款都是专门设计的完整中文漫画字库。

## 文件与复用

| 文件 | 本轮职责 |
| --- | --- |
| `apps/next/src/view/cartoon/dialogue-stage.tsx` | 细淡选框、双击编辑回调、顶部图标与既有指针捕获/手势/撤销接线 |
| `dialogue-transform.ts` | 在原四角计算旁增加指针角差旋转，返回最小角度补丁 |
| `use-dialogue-editor.ts`、`dialogue-page.tsx`、`dialogue-types.ts` | 选择与编辑许可分开；fontId随实例内容历史保存；回调参数注入 |
| `dialogue-properties.tsx`、`dialogue-text-input.tsx` | 属性接入唯一正文框；只读/双击/键盘解锁与完成 |
| `dialogue-font-picker.tsx`、`dialogue-fonts.ts`、`dialogue-fonts.json` | 复用SimpleSelect；真实异步字库加载、过期结果保护、失败保留、缓存与导出字体内嵌 |
| `dialogue-blob.ts`、`dialogue-render.ts` | 将原带超时FileReader提取为图片与字体共同读取器；render转发旧export以保留调用契约；SVG导出内嵌所需字体 |
| `apps/next/src/view/toolBox/Tool/video/editor/editor-controls.tsx`、`editor.module.css` | EditorFloatField增加可选focusTone="subtle"参数，调用方不覆盖内部DOM；视频调用方不传时保持原样 |
| `apps/next/src/i18n/locales/{zh-CN,en}/dialogue.ts` | 双语字体、解锁、加载/失败及操作说明 |
| `apps/next/public/dialogue-fonts/` | 10个完整TTF与各自OFL原文，共36,937,044字体字节，约35.2MiB；按需读取，不启动时加载全部字库 |
| `scripts/smoke-cartoon-dialogue.js` | 单击/双击/旋转/字体真加载、故障注入和真实PNG像素回归 |

不新增IPC、Node渲染依赖、工程保存格式或第二套用户存储。字体缓存仅属于当前渲染进程，图层仅保存fontId，不重复保存大字库字节。既有自定义字体数据保持原状，本轮未恢复自定义字体管理。

字体原始来源为Google Fonts仓库的相应ofl目录，下载经其静态镜像取得；完整字体与SIL Open Font License原文一起随包分发。[资源大小、SHA256、来源与许可清单](cartoon-dialogue-font-assets-2026-11-03.json)。开发时核对TTF签名和OFL正文，运行时不哈希全部字库。

## 实际验证

- Next静态构建通过，最终指纹 `9c3df54c86a4211092fb2ed62c2812480d1f517ab3d30c5f749d7ae17877219e`。
- `pnpm typecheck`通过（在pnpm check链中包括Next及Electron）。
- `pnpm lint`通过，0错误、33条既有警告；新增hook依赖警告已修复。
- `pnpm check:i18n`、`pnpm check:i18n:en`、`pnpm check:locale-keys`通过。
- `node scripts/check-smoke-rules.js`通过。普通逻辑函数经TypeScript printer去注释后正常分行检查，未超过30行；JSX装配按职责检查。
- 漫画Electron回归46/46通过：真实鼠标单击、双击焦点、Escape锁回、顶部手柄旋转与单次撤销；数字焦点实际1px；10份FontFace均真实loaded；字体只影响目标实例；首次字体请求故障时保留原字体，解除故障后重试成功。
- 两种英文漫画字体在同一画稿、同一正文下分别实际导出PNG，nativeImage解码后位图不同，验证字体进入最终栅格成品。并非只检查font-family字符串。
- 原有四角、背景导入、取消、坏图保留、成品尺寸、深浅主题、720px/540px、GIF宿主和本地模型标题槽回归继续覆盖。
- `pnpm exec electron scripts/smoke-video-editor-ui.js`：最终静态产物97/97通过，覆盖共享数值控件的草稿、Enter/失焦提交、非法值、Escape、实例独立、浅深主题、窄窗口以及GIF/legacy宿主；focusTone未传时保持原有视频控件行为。
- 初次新增字体导出回归曾因测试未清空上一轮downloaded标记读到旧尺寸而失败；已修正每次导出的等待归属，后续46项通过。该失败有日志保留，不隐藏为环境问题。
- `pnpm check`的Electron模块/IPC注册验证通过，随后仍因三个既有未引用词条失败：`auth.verifySuccess`、`common.localeNameSelf`、`create.generationTasks.active`。未删除范围外词条，未声明全仓check通过。

## 真实运行截图

来自正式静态导出、正式preload与app协议的实际Electron页面。账户/用户文档隔离夹具不等于真实登录验证；模板PNG、字体文件、SVG、鼠标输入、图片解码和PNG编码均真实执行。故障注入只用于字体失败用例，不冒充资源成功证据。

- [字体与顶部旋转](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-fonts.png)
- [字体菜单](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-font-menu.png)
- [细淡数字焦点](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-properties.png)
- [浅色](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-light.png)、[深色](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-dark.png)
- [720px](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-narrow.png)、[540px](screenshots/cartoon-dialogue-fonts-2026-11-03/editor-small.png)

已人工查看字体菜单截图，选框、顶部图标、中文字体和菜单都真实显示。未验证所有触摸设备、所有DPR与前台遮挡；系统文件选择器人工操作/原生保存确认仍沿前次边界；未做所有字形逐像素金标。

## 增量注释

以本轮开始前快照统计，新增源码全文、原文件新增/替换行；共享数字控件基线通过仅反向撤回本轮focusTone改动重建，保留其既有修改。移动到新blob文件的原读取器按新增文件全文计算，不宣称这一部分是新开发算法。JSON、字体二进制、许可、截图、文档不纳入源码分母。

- 业务C=368、B=157，70.10%。
- 测试C=155、B=66，70.14%。
- [逐文件范围、基线摘要与方法](cartoon-dialogue-fonts-comment-audit-2026-11-03.json)。

人工复核注释与行为，例如“便签先选中改外观，再双击打开内容”说明选择和编辑许可；“把印章随画稿寄出”说明为什么导出SVG需要内嵌字体；测试明确区分真实资源、错误注入、真实鼠标与系统原生交互证据。
