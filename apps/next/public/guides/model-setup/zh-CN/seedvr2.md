# SeedVR2 超分

7B、3B 和 VAE 共 3 项。只用 7B 时可跳过 3B；只用 3B 时可跳过 7B。无需 CLIP 或 LoRA。

## 下载所选超分模型和 VAE

主模型放 `diffusion_models/SeedVR2`，VAE 放 `vae/SeedVR2`。创建页关闭超分时不会因缺超分模型而禁用普通生成；开启后只检查当前所选模型和 VAE。

[Comfy 官方 SeedVR2 项目](https://huggingface.co/Comfy-Org/SeedVR2)

![当前任务与存放路径](/guides/model-setup/seedvr2.webp)
