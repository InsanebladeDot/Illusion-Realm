"use client";
/**
 * 音频结果展示：三栏挂在 stage，单/双栏挂在 Role TTS 表单内。
 * 地址来自生成成功后的 Blob，文件路径来自实际保存回包。
 * 本组件不拥有 URL，不会在模式切换或路由卸载时释放其他页面仍需的结果。
 */
import { Music } from 'lucide-react';
import { t as translate, useTranslation } from '@/i18n';
import { useAudioCreateStore } from '@/stores/use-audio-create-store';
import { useToastStore } from '@/stores/useToastStore';
import { unwrapIpc } from '@/utils/ipcResult';

// 通过已有最小化 IPC 在文件管理器中定位保存文件，不在 renderer 读取磁盘。
// 路径不写日志，失败信息经既有 toast 呈现给用户。
// 桌面桥不存在时给明确提示，不提供一个没有反应的按钮。
// 返回 Promise 被组件事件显式消费，避免异步错误成为未处理拒绝。
// 播放不依赖 Explorer 或 ComfyUI 临时目录，服务关闭后仍可播放内存结果。
// 当前客户端重启后文件仍在输出目录，播放历史的跨重启恢复不在这里实现。
// 文件查看是用户主动操作，生成结束不会自动打开操作系统窗口。
// openPathInExplorer 是现有 preload 的最小化能力，不需要暴露通用 shell。
// IpcResult 失败被 unwrapIpc 转成 Error，按钮事件负责接收拒绝。
// 当前组件只消费路径，不解析或改写用户输出目录。
// 在其他路由的任务中心也可使用同一 helper 定位音频。
// 辅助函数不依赖组件挂载，因此任务中心不会需要先进入 Role TTS。
export async function revealAudio(path: string) {
  if (!window.electronAPI?.openPathInExplorer) throw new Error(translate('create.audio.desktopOnly'));
  unwrapIpc(await window.electronAPI.openPathInExplorer(path));
}

// 原生 audio controls 提供播放、暂停、进度与音量，避免绘制无功能的波形占位。
// preload=none 限制多结果同时解码，不因列表渲染加载二十个音频缓冲。
// 显示文件 basename，绝对路径只用于用户主动定位文件。
// 同一结果的 key 独立于数组索引，追加新任务不会重置旧播放器身份。
// 不设 autoplay，生成结束不会突然播放声音。
// 空态使用本地 SVG 图标，离线时也能正常显示音频模式。
// 结果列表滚动属于宿主容器，不覆盖 nav 或撑开创建页高度。
// 返回创建页重挂载播放器时 URL 仍有效，不再次请求 ComfyUI。
// controls 的可访问名称含结果序号，多个播放器可以准确区分。
// 列表顺序由 store 决定，最新完成结果排在最前。
// “查看文件”读取每个结果自己的路径，不借用当前输出目录设置。
// 文件已保存且与结果字节一致，按钮不是一次重新导出或重新生成。
// audio 元素使用生成 Blob URL，不能把用户参考音频误当成生成结果。
// 音频 MIME 由生成传输层带入，浏览器按真实编码解码。
// 没有结果时音乐图标一直存在，不依赖点击后才注入图标脚本。
// 每个 audio 都提供 controls，不绘制只能看不能操作的伪播放按钮。
// 浏览器标准控制条支持键盘和读屏，避免复制一套播放器交互逻辑。
// 列表中的文件名取 basename，保留真实 wav/flac 后缀供用户识别。
// 文件路径含中文时仍可在本地定位，不需要对用户目录做英文重命名。
// 用户关闭 ComfyUI 后 Blob 仍在，播放不会重新请求服务器。
// 结果项的按钮 type=button，放在音频 form 中也不会再次提交生成。
// 列表中的多个文件可独立查看，不能把所有按钮都绑定到最新文件。
// 结果为空只影响显示，不尝试自动补跑模板或播放作者样例。
// 展示组件不创建 URL，所以重复渲染不会累积无法释放的播放资源。
// 播放失败属于浏览器媒体解码状态，不会把已经保存的文件自动删除。
// 下载和落盘成功不能证明声学生成质量，本界面不据此声称语音效果达标。
export function AudioResults() {
  const { t } = useTranslation(), results = useAudioCreateStore(state => state.results);
  return <section data-audio-results aria-label={t('create.audio.results')} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    {/* stage / rail：音频模式只展示自己的音频，避免残留上一次文生图预览。 */}
    {!results.length && <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Music className="size-9" aria-hidden /><p>{t('create.audio.empty')}</p></div>}
    {results.map((item, index) => <div key={item.id} className="space-y-2 rounded-xl border border-border bg-background/50 p-3"><p className="truncate text-xs">{item.path.split(/[/\\]/).pop()}</p><audio controls preload="none" src={item.url} aria-label={t('create.audio.resultNumber', { number: index + 1 })} className="h-10 w-full" /><button type="button" onClick={() => { void revealAudio(item.path).catch((error: unknown) => useToastStore.getState().show(error instanceof Error ? error.message : t('create.page.saveFailed'))); }} className="text-xs text-accent-text hover:underline">{t('create.audio.reveal')}</button></div>)}
  </section>;
}
