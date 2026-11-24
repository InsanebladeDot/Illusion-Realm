# Anima 文生图

补齐下面 3 个文件即可。标准文生图没有必需 LoRA，不需要多下载。

## 主模型 → 文本编码器 → VAE

1. 打开[工具箱的 C 站模型库](/tools/models/civitai)，选择 Anima 下载主模型；自动下载使用已核对的默认版本。
2. 文本编码器放 `text_encoders`，VAE 放 `vae`。下方每个模型名可复制完整存放路径。
3. 下载完成会自动重新扫描。在创作页选择已下载的 Anima 主模型；缺项公告消失后可生成。

[Anima 项目说明](https://huggingface.co/circlestone-labs/Anima)

![模型下载页面](/guides/anima/library.webp)

![当前任务与存放路径](/guides/model-setup/anima.webp)
