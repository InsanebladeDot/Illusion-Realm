/** 节点只存自定义前缀；编号由真实输入槽产生，不允许在前缀里夹入编号或尖括号。 */
import { z } from "zod";

const prefix = z.string().min(1).max(32).regex(/^[A-Za-z]/).regex(/^[A-Za-z0-9_-]*$/).refine(value => !/\s/.test(value));
const defaults = { image: "Picture", video: "Video", audio: "Audio" } as const;
export const PromptReferenceLabelsSchema = z.object({ image: prefix.optional(), video: prefix.optional(), audio: prefix.optional() }).strict().refine(value =>
  Object.entries(defaults).every(([kind, fallback]) => {
    const label = value[kind as keyof typeof defaults] ?? fallback;
    return !Object.entries(defaults).some(([other, reserved]) => other !== kind && label.toLowerCase() === reserved.toLowerCase())
      && (kind === "audio" || label.toLowerCase() !== "slot");
  }) && new Set(Object.entries(defaults).map(([kind, fallback]) => (value[kind as keyof typeof defaults] ?? fallback).toLowerCase())).size === 3);

export type PromptReferenceLabels = z.infer<typeof PromptReferenceLabelsSchema>;
