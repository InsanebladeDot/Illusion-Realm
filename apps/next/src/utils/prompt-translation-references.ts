/** 转译像寄送带号码的包裹：请求用连续编号，回填按本次清单还原编辑引用，不按文件名猜。 */
import { t } from '@/i18n';
import { mediaReferenceToken, type PromptReferenceMedia } from './prompt-media-references';

const MARKERS = /<([A-Za-z][A-Za-z0-9_-]{0,31})\s+([1-9]\d*)>/g;

/** 映射由实际请求的转换器产生，因此自定义前缀、编号空位和上传顺序都沿用工作流规则。 */
export function restoreTranslationReferences(response: string, input: string, media: readonly PromptReferenceMedia[], prepare: (value: string) => string): string {
  const mapping = new Map(media.map(item => [prepare(mediaReferenceToken(item)), mediaReferenceToken(item)]));
  const prefixes = new Set(['Picture', 'Video', 'Audio', 'Slot', ...[...mapping.keys()].map(token => token.slice(1, token.indexOf(' ')))]);
  const required = new Set([...input.matchAll(MARKERS)].map(match => match[0]).filter(token => mapping.has(token)));
  const received = new Set<string>();
  const restored = response.replace(MARKERS, (token: string, prefix: string, _number: string, offset: number) => {
    const reference = mapping.get(token);
    if (!reference && prefixes.has(prefix)) throw Error(t('create.promptAssistant.referenceInvalid'));
    if (!reference) return token;
    received.add(token);
    // 尖括号换回 @ 后需要词边界，否则“<Picture 1>is”会变成无法识别的 @picture1is。
    const left = /[\p{L}\p{N}_]/u.test(response[offset - 1] ?? '') ? ' ' : '';
    const right = /[\p{L}\p{N}_]/u.test(response[offset + token.length] ?? '') ? ' ' : '';
    return left + reference + right;
  });
  if ([...required].some(token => !received.has(token))) throw Error(t('create.promptAssistant.referenceInvalid'));
  return restored;
}

/** 手动应用迟到结果也不能跳过校验；当前清单变了，就保留原稿让用户重新转译。 */
export function assertTranslationReferenceKey(original: string | undefined, current: string | undefined): void {
  if (original !== current) throw Error(t('create.promptAssistant.referenceChanged'));
}
