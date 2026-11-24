/** GPT-SoVITS 克隆原工作流；两段台词分别交给朗读节点和参考节点。 */
import template from "@/data/comfy/audioWorkflower/GPT_Sovits/GPT-SoVits 参考音色.json";
import type { ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";

export const GPT_SOVITS_NAME = "GPT-SoVITS";
export const GPT_SOVITS_MAX_SEED = 2 ** 32 - 1;
export const GPT_SOVITS_LANGUAGES = ["auto", "all_zh", "zh", "en", "all_ja", "ja", "all_yue", "yue", "all_ko", "ko", "auto_yue"] as const;
export const GPT_SOVITS_CUTS = ["按标点切", "不切", "四句一切", "约五十字一切", "按中文句号切", "按英文句号切", "手动按行独立合成"] as const;
export const GPT_SOVITS_WEIGHTS = template["1"].inputs;
export const GPT_SOVITS_DEFAULT_CUT = template["2"].inputs.cut;

// 界面范围来自合成节点，默认值读取工程自带的模板（停顿为 0.15 秒）。
export const GPT_SOVITS_PLAYBACK = {
  speed: { min: 0.25, max: 4, defaultValue: template["5"].inputs.speed },
  interval: { min: 0, max: 30, defaultValue: template["5"].inputs.interval },
} as const;

export interface GptSovitsSettings {
  speed?: number;
  interval?: number;
  textLanguage?: string;
  referenceLanguage?: string;
  transcript?: string;
  cut?: string;
  gptWeight?: string;
  sovitsWeight?: string;
}

export interface GptSovitsInput extends GptSovitsSettings {
  text: string;
  seed: number;
}

/** 这些错误来自用户可修正的输入，画布可直接显示对应文案。 */
export class GptSovitsInputError extends Error {}

function synthesisValue(value: number | undefined, { min, max, defaultValue }: { min: number; max: number; defaultValue: number }) {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value) || value < min || value > max) throw new GptSovitsInputError(t("canvas.gptSovits.invalidTiming"));
  return value;
}

export function buildGptSovitsPrompt(value: GptSovitsInput, referenceName?: string): ComfyApiPrompt {
  const { text, transcript, textLanguage = "auto", referenceLanguage = "auto", cut = GPT_SOVITS_DEFAULT_CUT, seed } = value;
  if (!referenceName) throw new GptSovitsInputError(t("canvas.gptSovits.referenceRequired"));
  if (!transcript?.trim()) throw new GptSovitsInputError(t("canvas.gptSovits.transcriptRequired"));
  if (!text.trim()) throw new GptSovitsInputError(t("canvas.gptSovits.textRequired"));
  if (!Number.isInteger(seed) || seed < 0 || seed > GPT_SOVITS_MAX_SEED) throw new GptSovitsInputError(t("canvas.gptSovits.invalidSeed"));
  if (![textLanguage, referenceLanguage].every(language => GPT_SOVITS_LANGUAGES.some(option => option === language)) || !GPT_SOVITS_CUTS.some(option => option === cut)) {
    throw new GptSovitsInputError(t("canvas.gptSovits.invalidSettings"));
  }
  const speed = synthesisValue(value.speed, GPT_SOVITS_PLAYBACK.speed);
  const interval = synthesisValue(value.interval, GPT_SOVITS_PLAYBACK.interval);
  // 像分别填写新台词和试音稿：语言跟各自的文字走，录音只接上传回执中的相对路径。
  const graph = structuredClone(template);
  // 两个权重槽独立；旧工程没有覆盖值时继续使用工作流内的原始名称。
  graph["1"].inputs.gpt = value.gptWeight ?? GPT_SOVITS_WEIGHTS.gpt;
  graph["1"].inputs.sovits = value.sovitsWeight ?? GPT_SOVITS_WEIGHTS.sovits;
  Object.assign(graph["2"].inputs, { text: text.trim(), language: textLanguage, cut });
  graph["3"].inputs.audio = referenceName;
  Object.assign(graph["4"].inputs, { transcript: transcript.trim(), language: referenceLanguage });
  // string_language 只给直接连入合成节点的普通字符串用，本模板接的是 GSVAtomicText。
  Object.assign(graph["5"].inputs, { seed, speed, interval });
  return graph as ComfyApiPrompt;
}
