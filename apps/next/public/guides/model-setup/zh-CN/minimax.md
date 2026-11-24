# MiniMax 视频与音频

按下方顺序安装 5 个基础文件。音频生成不需要视频 VAE；视频同时需要两种 VAE。

## 下载当前工作流的依赖

1. 主模型放 `diffusion_models`。
2. 加速 LoRA 放 `loras`。
3. 文本编码器放 `text_encoders`。
4. 视频和音频 VAE 都放 `vae`，但不要互相替代。

来源是 [Comfy 官方仓库](https://huggingface.co/Comfy-Org/MiniMax-H3)。原首尾帧模板还预载了一个非官方角色 LoRA（NSFW_ANIME_H3_V16-step00002250）；本清单不猜它的下载地址。如果未安装，请在扩展里移除或替换它。只要当前所选工作流仍有缺项，就会继续禁用生成。

![当前任务与存放路径](/guides/model-setup/minimax.webp)
