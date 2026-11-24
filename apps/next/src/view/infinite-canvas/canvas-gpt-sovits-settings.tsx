"use client";

/** 声音参数侧栏只编辑当前节点；朗读正文和音频附件留在节点下方。 */
import { CanvasGptSovitsWeightSelect } from "./canvas-gpt-sovits-weights";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { AdvancedSettingsSection } from "@/view/create/advanced-settings-section";
import { GenerationParameterControl } from "@/view/create/generation-parameter-control";
import { SeedFields } from "@/view/create/generation-sampling-fields";
import { GPT_SOVITS_CUTS, GPT_SOVITS_DEFAULT_CUT, GPT_SOVITS_LANGUAGES, GPT_SOVITS_PLAYBACK, GPT_SOVITS_WEIGHTS } from "@/utils/comfy/gpt-sovits-workflow";
import type { CanvasData } from "./canvas-model";

type AudioParameters = NonNullable<CanvasData["audioParameters"]>;
type Settings = NonNullable<AudioParameters["gptSovits"]>;
interface Props {
  value?: Settings;
  reference?: string;
  invalid: boolean;
  disabled?: boolean;
  onChange: (value: Settings) => void;
}

export function CanvasGptSovitsSettings({ value, reference, invalid, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const { languages, cuts } = useGptSovitsOptions();
  const update = (patch: Settings) => onChange({ ...value, ...patch });
  return <section data-canvas-gpt-sovits className="min-h-0 flex-1 overflow-y-auto">
    <fieldset disabled={disabled} className="min-w-0 space-y-4 p-3">
      {/* 参数侧栏：只有确定两项选择才把权重一起写回节点。 */}
      <CanvasGptSovitsWeightSelect value={{ gpt: value?.gptWeight ?? GPT_SOVITS_WEIGHTS.gpt, sovits: value?.sovitsWeight ?? GPT_SOVITS_WEIGHTS.sovits }}
        onConfirm={({ gpt, sovits }) => update({ gptWeight: gpt, sovitsWeight: sovits })} />
      {/* 参考音频与台词分开保存，音频文件名只用来标识已选来源。 */}
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{t("canvas.gptSovits.reference")}</p>
        <p className="break-all text-xs text-muted-foreground" role={invalid ? "alert" : undefined}>{invalid ? t("create.audio.invalidReference") : reference ?? t("canvas.gptSovits.referenceRequired")}</p>
      </div>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{t("canvas.gptSovits.transcript")}</span>
        <textarea data-gpt-sovits-transcript rows={3} maxLength={4000} value={value?.transcript ?? ""} className="block w-full resize-y rounded-md bg-muted px-2.5 py-2 focus-visible:outline-1 focus-visible:outline-muted-foreground" onChange={event => update({ transcript: event.target.value })} />
      </label>
      {/* 两个语言值各自回写；中英混合等代码直接使用插件定义。 */}
      <GptSovitsSelect field="reference-language" label={t("canvas.gptSovits.referenceLanguage")} value={value?.referenceLanguage ?? "auto"} options={languages} onChange={referenceLanguage => update({ referenceLanguage })} />
      <GptSovitsSelect field="text-language" label={t("canvas.gptSovits.textLanguage")} value={value?.textLanguage ?? "auto"} options={languages} onChange={textLanguage => update({ textLanguage })} />
      <GptSovitsSelect field="cut" label={t("canvas.gptSovits.cut")} value={value?.cut ?? GPT_SOVITS_DEFAULT_CUT} options={cuts} onChange={cut => update({ cut })} />
      {/* 高级设置：合成节点只接收语速、停顿和种子，不显示注意力后端。 */}
      <AdvancedSettingsSection showModelAttention={false}>
        <GenerationParameterControl name="gsv-speed" label={t("canvas.gptSovits.speed")} {...GPT_SOVITS_PLAYBACK.speed} step={0.01}
          value={value?.speed ?? GPT_SOVITS_PLAYBACK.speed.defaultValue} onChange={speed => update({ speed })} />
        <GenerationParameterControl name="gsv-interval" label={t("canvas.gptSovits.interval")} {...GPT_SOVITS_PLAYBACK.interval} step={0.01}
          value={value?.interval ?? GPT_SOVITS_PLAYBACK.interval.defaultValue} onChange={interval => update({ interval })} />
        <SeedFields seed={value?.seed ?? "0"} seedMode={value?.random !== false ? "random" : "custom"} onSeed={seed => { if (/^\d{0,32}$/.test(seed)) update({ seed }); }} onSeedMode={mode => update({ random: mode === "random" })} />
      </AdvancedSettingsSection>
    </fieldset>
  </section>;
}

function useGptSovitsOptions() {
  const { t } = useTranslation();
  // 选项值由插件定义，界面只替换显示文字；显式键让双语检查也能找到引用。
  const languages = {
    auto: t("canvas.gptSovits.languages.auto"), all_zh: t("canvas.gptSovits.languages.all_zh"),
    zh: t("canvas.gptSovits.languages.zh"), en: t("canvas.gptSovits.languages.en"),
    all_ja: t("canvas.gptSovits.languages.all_ja"), ja: t("canvas.gptSovits.languages.ja"),
    all_yue: t("canvas.gptSovits.languages.all_yue"), yue: t("canvas.gptSovits.languages.yue"),
    all_ko: t("canvas.gptSovits.languages.all_ko"), ko: t("canvas.gptSovits.languages.ko"),
    auto_yue: t("canvas.gptSovits.languages.auto_yue"),
  };
  const cuts = {
    "按标点切": t("canvas.gptSovits.cuts.punctuation"), "不切": t("canvas.gptSovits.cuts.none"),
    "四句一切": t("canvas.gptSovits.cuts.fourSentences"), "约五十字一切": t("canvas.gptSovits.cuts.fiftyCharacters"),
    "按中文句号切": t("canvas.gptSovits.cuts.chineseFullStop"), "按英文句号切": t("canvas.gptSovits.cuts.englishFullStop"),
    "手动按行独立合成": t("canvas.gptSovits.cuts.eachLine"),
  };
  return {
    languages: GPT_SOVITS_LANGUAGES.map(value => ({ value, label: languages[value] })),
    cuts: GPT_SOVITS_CUTS.map(value => ({ value, label: cuts[value] })),
  };
}

function GptSovitsSelect({ field, label, ...select }: { field: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><p className="text-sm font-medium">{label}</p><SimpleSelect {...select} portal ariaLabel={label} data-gpt-sovits-field={field} /></div>;
}
