"use client";
/**
 * 界面：「转换预览」共用只读区，视频与 Role TTS 使用实际提交转换器。
 * 不写回原稿，不提供另一套替换规则，错误时保留可修改的原输入。
 */
import { useTranslation } from '@/i18n';
import { normalizeVideoReferences } from '@/utils/comfy/video-reference-media';
import type { PromptReferenceMedia } from '@/utils/prompt-media-references';

/**
 * 输入均来自当前任务，编号与提交列表一致，不读取全局图库或账户素材。
 * 视频传图片/视频/音频，Role TTS 只传唯一音频，两者共享展示结构。
 * 引用不存在时展示转换器原有友好错误，不拿未转换原文冒充提交预览。
 * 预览错误不发 toast，避免每打一个字符都打断用户；提交仍独立拒绝。
 * 使用 React 文本节点显示尖括号，官方标记不会被浏览器解释成 HTML。
 * 空输入或只有空白时隐藏整个预览，避免表单留下没有内容的折叠入口。
 * details 使用浏览器原生键盘开合，不新增弹窗、浮层或全局状态。
 * 自动计算发生在纯函数中，不请求模型、上传文件或创建任务。
 * 素材删除会触发重新计算，因此不会保留上一次成功转换的过期预览。
 * summary 与内容颜色沿用主题变量，长文本在窄栏换行而非撑开布局。
 * aria-live 只反馈只读内容变化，不改变编辑器光标或输入法状态。
 * 该预览只转换素材标记，不把短提示词自动重写成技能的六段长文。
 * 同类型素材删除留下空号时，UI 编号仍稳定，官方标签按剩余项连续排序。
 * 例如视频草稿的 @image7 可以映射成当前仅剩图片的 Picture 1。
 * 提交器采用同样排序，不能直接按 @ 后数字生成官方标签。
 * 对话中的邮箱和普通文字由共享匹配器排除，预览不额外扩大匹配范围。
 * 相同素材多次被引用会重复显示标签，不合并句子或删除用户的重复描述。
 * 手输官方标记也经过可用素材检查，预览成功不等于文件已上传成功。
 * 每次计算只遍历当前表单素材，不缓存跨模式结果，避免不同任务串号。
 * 输入中间态的错误仅展示为正文，不给 live region 设置强制打断的 alert。
 * 空错误字符串与成功正文分别保存，不能把异常对象直接渲染成 React 子项。
 * 数字边界、模型缺失和服务端失败不属于本预览，仍由原生成流程处理。
 */
export function PromptConversionPreview({ value, media }: { value: string; media: readonly PromptReferenceMedia[] }) {
  const { t } = useTranslation();
  // 显示条件统一放在共用组件中，视频和 Role TTS 不需要分别判断。
  // trim 只判断是否有内容，转换仍使用原稿，保留用户的换行和间距。
  if (!value.trim()) return null;
  let text = '', error = '';
  try { text = normalizeVideoReferences(value, media); }
  catch (cause) { error = cause instanceof Error ? cause.message : t('create.videoCreatePanel.generateFailed'); }
  return <details data-prompt-conversion className="rounded-md border border-border bg-background text-xs">
    {/* 界面：手动展开查看自动转换结果，正文始终是原提示词的只读投影。 */}
    <summary className="cursor-pointer px-3 py-2 text-muted-foreground">{t('create.mediaReferences.conversionPreview')}</summary>
    {/* 错误沿用提交器的校验含义；成功时显示将传入工作流的标签文本。 */}
    <div aria-live="polite" data-prompt-conversion-text className="whitespace-pre-wrap break-words border-t border-border px-3 py-2 text-foreground">{error || text}</div>
  </details>;
}
