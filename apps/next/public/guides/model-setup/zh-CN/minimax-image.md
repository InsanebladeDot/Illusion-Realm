# MiniMax 图片编辑

需要主模型、LoRA、文本编码器、VAE 共 4 项。主模型和视频任务共用，不重复下载。

## 安装文字改图依赖

下方文件按 `diffusion_models`、`loras`、`text_encoders`、`vae` 存放。MiniMax 基础模型来自 Comfy 官方仓库；P-H3 的 LoRA、编码器和 VAE 来自 [Pruna 官方项目](https://huggingface.co/PrunaAI/P-H3-Image-Comfy)，不要用视频编码器代替图片编辑编码器。

![当前任务与存放路径](/guides/model-setup/minimax-image.webp)
