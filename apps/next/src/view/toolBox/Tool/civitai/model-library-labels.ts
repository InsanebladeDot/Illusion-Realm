// 扫描器的旧 type 只有三种，VAE 等辅助目录不能因此被错误标作 Checkpoint。
// 浏览标签按真实官方目录显示；未知新类别保留原名，不用白名单隐藏模型。
// 这张表仅改可读名称，不参与目录匹配、生成选择或模型兼容性判断。
// LoRA 的技术名称在不同语言中一致，不把展示名称反向用于拼接模型路径。
// 当独立配置目录使用自定义名字时，rootCategory 已由浏览适配器确定。
// 此函数不根据模型大小猜架构，避免将小体积主模型误标为 LoRA。
// 可读名称只属于表现层，真实 rootCategory 始终保留扫描器提供的原值。
// 例如 LoRA 标签显示得更友好，但点击后仍按 loras 过滤而非按翻译文本匹配。
const ROOT_LABELS: Record<string, string> = { loras: "LoRA", checkpoints: "Checkpoint", vae: "VAE", clip: "CLIP", text_encoders: "Text Encoders", unet: "UNet", diffusion_models: "Diffusion Models", embeddings: "Embedding", model_patches: "Model Patches" };
export function modelRootLabel(root: string) { return ROOT_LABELS[root.toLowerCase()] || root; }
