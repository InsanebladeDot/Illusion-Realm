/**
 * Role TTS 的单音频引用适配：UI 与构图共用同一素材身份及 H3 转换器。
 * 像同一张座位表：预览和执行都把当前唯一参考音频映射到 Audio 1。
 * 只处理名称和提示词，不上传、不读文件字节，也不创建播放 URL。
 */
import type { PromptReferenceMedia } from '@/utils/prompt-media-references';
import { normalizeVideoReferences } from './video-reference-media';

/**
 * 输入可来自 File，也可来自上传成功后的服务器名称，仅要求 name。
 * 唯一编号对应原音频模板的唯一参考端口，不暗示支持多个音频输入。
 * src 留空是因为菜单对音频只显示音乐图标，不能伪造可播放的地址。
 * 素材 id 不含用户名称，替换文件后仍是同一个任务槽位。
 * null 表示无参考，未上传时不能通过 @audio1 引用不存在的音频。
 * 文件有效性仍由 audioExtension 在入队前检查，不在这里重复校验格式。
 * 数组只包含 audio，即使旧视频表单里有图片也不会成为 TTS 候选。
 * 返回新数组避免菜单内部排序或装饰影响调用方草稿。
 */
export function audioPromptMedia(reference: { name: string } | null): PromptReferenceMedia[] {
  return reference ? [{ id: 'audio-1', kind: 'audio', number: 1, name: reference.name, src: '' }] : [];
}

/**
 * 共用视频引用转换，确保官方标记始终是带空格的 <Audio 1>。
 * 没有参考时输入 @audio1 或官方 Audio 标记必须失败，不能发送未解析引用。
 * 图片、视频引用同样会因当前列表没有对应素材而失败。
 * 用户对白和非引用文字原样保留，不自动翻译或补写参考角色。
 * 不用 replaceAll 把每个 @audio 都替换成第一项，编号必须精确匹配。
 * builder 使用上传名只是判断参考是否存在，提示词不包含服务器文件名。
 * 在上传前占位校验与实际构图都会调用，失败不能被 preview 的 catch 吞掉。
 */
export function normalizeAudioReferences(text: string, referenceName?: string) {
  return normalizeVideoReferences(text, audioPromptMedia(referenceName ? { name: referenceName } : null));
}
