/** 角色音色目录与插件权重列表，只传可选名称及现有工程媒体描述。 */
import type { UserDataInfiniteCanvas } from "../schemas/infinite-canvas.schema";

export interface CanvasReferenceVoice {
  source: string;
  custom?: true;
  role: string;
  tone: string;
  media: NonNullable<UserDataInfiniteCanvas["nodes"][number]["data"]["media"]>;
}

export interface GptSovitsWeights {
  gpt: string[];
  sovits: string[];
}
