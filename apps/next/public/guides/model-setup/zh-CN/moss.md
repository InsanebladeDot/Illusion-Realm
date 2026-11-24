# Moss Image 文生图

使用任务清单的「下载本组」，或者从 [Comfy-Org 的 Moss Image 模型库](https://huggingface.co/Comfy-Org/MOSS-Image)下载下列文件。路径都从 ComfyUI 的 `models` 文件夹开始。

## 下载主模型

将 `moss_image_sft_int8_convrot.safetensors` 放到 `{{modelPath}}`。

## 下载文本编码器

将 `qwen3.5_9b_int8_convrot.safetensors` 放到 `{{textPath}}`。

## 下载 VAE

将 `flux2-vae.safetensors` 放到 `{{vaePath}}`。手动放好后，回到创作页点「重新检查」。如果文件已经放在对应分类的其他子目录，选「指定本地模型」。
