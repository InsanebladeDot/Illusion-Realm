import cartoon1 from "@/assets/cartoon/1.png";
import cartoon2 from "@/assets/cartoon/2.png";
import cartoon3 from "@/assets/cartoon/3.png";
import cartoon4 from "@/assets/cartoon/4.png";
import cartoon5 from "@/assets/cartoon/5.png";
import cartoon6 from "@/assets/cartoon/6.png";
import type { CartoonBubbleAsset } from "@/types/cartoonBubble";

/** 内置漫画对话框素材（图片尺寸在运行时由 onLoad 校准） */
export const BUILTIN_CARTOON_ASSETS: CartoonBubbleAsset[] = [
  { id: "builtin-1", name: "云朵气泡", src: cartoon1.src, width: 512, height: 512, isBuiltIn: true },
  { id: "builtin-2", name: "圆角对话框", src: cartoon2.src, width: 512, height: 320, isBuiltIn: true },
  { id: "builtin-3", name: "尖角气泡 1", src: cartoon3.src, width: 512, height: 320, isBuiltIn: true },
  { id: "builtin-4", name: "尖角气泡 2", src: cartoon4.src, width: 512, height: 320, isBuiltIn: true },
  { id: "builtin-5", name: "爆炸框", src: cartoon5.src, width: 512, height: 512, isBuiltIn: true },
  { id: "builtin-6", name: "思考框", src: cartoon6.src, width: 512, height: 320, isBuiltIn: true },
];

export const DEFAULT_BUILTIN_CARTOON_ASSET_ID = BUILTIN_CARTOON_ASSETS[0].id;
