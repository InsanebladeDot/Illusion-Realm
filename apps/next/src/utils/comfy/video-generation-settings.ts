/** Read Minimax settings through template links; apply steps, timing and FPS while preserving the existing sampling and output graph. */
import type { ComfyApiNode, ComfyApiPrompt } from "@/types/comfy";
import { t } from "@/i18n";
import { findMinimaxVideoNode } from "./minimax-video-node";

export interface VideoGenerationSettings { steps: number; fps: number; durationSeconds: number; frameCount?: number }
export const VIDEO_GENERATION_LIMITS = { stepsMin: 1, stepsMax: 100, fpsMin: 1, fpsMax: 120, durationMin: 0.1, durationMax: 60, frameMax: 3592 } as const;
/** 官方 length 上限是 3600；按 17n+5 对齐后最后一个合法值是 3592。 */
export function getVideoDurationMax(fps: number) {
  return Math.min(VIDEO_GENERATION_LIMITS.durationMax, VIDEO_GENERATION_LIMITS.frameMax / fps);
}
export function alignMinimaxFrames(frames: number) {
  // Match Python round() in ComfyMathExpression, including half-to-even ties.
  const lower = Math.floor(frames);
  const rounded = Math.max(5, frames - lower === 0.5 ? lower + lower % 2 : Math.round(frames));
  return rounded + ((5 - rounded % 17) + 17) % 17;
}
export function getVideoFrameCount(settings: VideoGenerationSettings) {
  return alignMinimaxFrames(settings.frameCount ?? settings.durationSeconds * settings.fps);
}
function linkedNode(prompt: ComfyApiPrompt, value: unknown) {
  return Array.isArray(value) && typeof value[0] === "string" ? prompt[value[0]] : undefined;
}
function required(node: ComfyApiNode | undefined, name: string): ComfyApiNode {
  if (!node) throw new Error(t("create.videoModels.missingNode", { name }));
  return node;
}
function numberSource(prompt: ComfyApiPrompt, input: unknown, depth = 0): ComfyApiNode {
  const node = required(linkedNode(prompt, input), "PrimitiveInt");
  if (depth > 8) throw new Error(t("create.videoModels.invalid"));
  if (node.class_type !== "ComfySwitchNode") return node;
  const enabled = linkedNode(prompt, node.inputs.switch)?.inputs.value ?? node.inputs.switch;
  return numberSource(prompt, node.inputs[enabled ? "on_true" : "on_false"], depth + 1);
}
function settingsNodes(prompt: ComfyApiPrompt) {
  const nodes = Object.values(prompt);
  const video = required(findMinimaxVideoNode(prompt), "Minimax");
  const math = required(linkedNode(prompt, video.inputs.length), "ComfyMathExpression");
  const duration = required(linkedNode(prompt, math.inputs["values.a"]), "PrimitiveFloat");
  const output = required(nodes.find((node) => node.class_type === "CreateVideo"), "CreateVideo");
  const sampler = required(nodes.find((node) => node.class_type === "BasicScheduler"), "BasicScheduler");
  const steps = typeof sampler.inputs.steps === "number" ? sampler : numberSource(prompt, sampler.inputs.steps);
  return { math, duration, output, steps, stepsKey: steps === sampler ? "steps" : "value" };
}
export function getVideoGenerationDefaults(prompt: ComfyApiPrompt): VideoGenerationSettings {
  const nodes = settingsNodes(prompt);
  return { steps: Number(nodes.steps.inputs[nodes.stepsKey]), fps: Number(nodes.output.inputs.fps), durationSeconds: Number(nodes.duration.inputs.value) };
}
function validateSettings(settings: VideoGenerationSettings) {
  const limits = VIDEO_GENERATION_LIMITS;
  const valid = Number.isInteger(settings.steps) && settings.steps >= limits.stepsMin && settings.steps <= limits.stepsMax
    && Number.isInteger(settings.fps) && settings.fps >= limits.fpsMin && settings.fps <= limits.fpsMax
    && Number.isFinite(settings.durationSeconds) && settings.durationSeconds >= limits.durationMin && settings.durationSeconds <= limits.durationMax;
  const validFrames = settings.frameCount === undefined || Number.isInteger(settings.frameCount) && settings.frameCount >= 5 && settings.frameCount <= alignMinimaxFrames(limits.durationMax * settings.fps);
  if (!valid || !validFrames || getVideoFrameCount(settings) > limits.frameMax) throw new Error(t("create.videoSettings.invalid"));
}
export function applyVideoGenerationSettings(prompt: ComfyApiPrompt, settings?: VideoGenerationSettings) {
  if (!settings) return;
  validateSettings(settings);
  const nodes = settingsNodes(prompt);
  nodes.steps.inputs[nodes.stepsKey] = settings.steps;
  nodes.output.inputs.fps = settings.fps;
  nodes.duration.inputs.value = settings.frameCount === undefined ? settings.durationSeconds : getVideoFrameCount(settings) / settings.fps;
  if (settings.frameCount !== undefined) nodes.math.inputs.expression = String(getVideoFrameCount(settings));
  else {
    const expression = String(nodes.math.inputs.expression);
    if (!/a\s*\*\s*\d+(?:\.\d+)?/.test(expression)) throw new Error(t("create.videoModels.missingNode", { name: "fps" }));
    nodes.math.inputs.expression = expression.replace(/a\s*\*\s*\d+(?:\.\d+)?/g, `a * ${settings.fps}`);
  }
}
