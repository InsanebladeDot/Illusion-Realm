/** 角色音色只从表单接收分类和台词，文件由主进程选择。 */
import { z } from "zod";

const forbidden = /[<>:"/\\|?*]/u;
const reserved = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\s*(?:\.|$)/iu;
const hasControl = (name: string) => [...name].some(char => char.charCodeAt(0) < 32);

// 角色与语气各占一级文件夹，不能包含目录分隔符或 Windows 保留名称。
const folder = z.string().trim().min(1).max(60).refine(name =>
  !forbidden.test(name) && !reserved.test(name) && !name.endsWith(".") && !hasControl(name));

export const canvasVoiceRequestSchema = z.object({
  role: folder,
  tone: folder,
  transcript: z.string().trim().min(1).max(80).refine(name => !hasControl(name)),
}).strict();

export type CanvasVoiceRequest = z.infer<typeof canvasVoiceRequestSchema>;
