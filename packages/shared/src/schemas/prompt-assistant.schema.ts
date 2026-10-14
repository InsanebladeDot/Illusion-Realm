/** Validate transformations and connection-scoped credentials at the IPC boundary. */
import { z } from "zod";
export const PromptConnectionSchema = z.object({ provider: z.enum(["glm", "custom"]), baseUrl: z.string().max(2048) });
export const PromptTransformSchema = PromptConnectionSchema.extend({
  model: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(16000),
  instruction: z.string().trim().min(1).max(8000),
});
export const PromptSecretArgsSchema = z.tuple([PromptConnectionSchema, z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/)]);
