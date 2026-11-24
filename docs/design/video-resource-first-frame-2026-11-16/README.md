# 视频资源默认首帧封面

工程素材、全局资源库、节点网底部预览和缺少封面的 @ 素材缩略图，共用 `VideoFirstFrameCover`。已有封面继续优先使用；其他视频复用原 `videoFirstFrame`，从时间零解码小图，不自动播放，也不向工程或磁盘另存一份封面。

进入可见区才读取；滚出或卸载通过 AbortSignal 停止未完成的解码。完成后释放视频元素，组件只保留最长边192像素的小图。解码失败回退视频图标，原播放入口不变。没有全局无限缓存。

首轮真实媒体检查发现 localfile 视频可播放，但默认跨域方式不能导出 Canvas 小图。现已复用协议已有的应用来源授权，以 `crossOrigin=anonymous` 读取，不放宽主进程协议权限。

验证：`pnpm typecheck`、`pnpm lint`（0错误、37条既有警告）、Next 静态构建通过。新鲜构建上的 `CANVAS_NETWORK_SMOKE=1` 共55/55通过，覆盖工程/全局库、选中保留、关闭重开、主视频播放和释放、深浅主题与窄窗。@ 缩略图已接入同一组件，未单独人工操作该入口。

日志：`logs/smoke-infinite-canvas-2026-11-16T07-22-57-422Z-35300.log`，最终成功运行目录为系统临时目录 `ir-canvas-PTO6Q9`。

![工程素材首帧](./project-video-cover.png)
![全局资源库首帧](./library-video-cover.png)

## 本次增量注释核对

基线为修改前保存的临时副本 `ir-video-cover-baseline-20261116`，保留任务开始前的工作区改动。按新增和替换后的行统计，新文件全文；删除及上下文不计。文本比对后人工核对有效说明，类型声明和括号计代码。

| 文件 | 有效注释 C | 代码 B |
| --- | ---: | ---: |
| utils/video-first-frame.ts | 2 | 6 |
| components/video-first-frame-cover.tsx | 5 | 27 |
| components/library/library-card.tsx | 1 | 3 |
| view/create/media-thumbnail.tsx | 0 | 2 |
| canvas-network-preview.tsx | 0 | 2 |
| canvas-network-preview.module.css | 0 | 1 |
| canvas-project-resources.tsx | 0 | 1 |
| scripts/lib/check-canvas-network.js | 1 | 5 |
| scripts/lib/check-video-resource-covers.js | 4 | 36 |

业务8/(8+42)=16.0%；测试5/(5+41)=10.9%。已说明可见区读取、取消、换源隔离、失败回退和测试边界；其余为直接接线与断言，未为达到20%–30%补重复注释。
