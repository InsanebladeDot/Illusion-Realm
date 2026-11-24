# 2. 补齐 VAE 和文本编码器

这是手动下载清单。也可以切到「自动下载」，选择 models 文件夹后，下载「VAE 和文本编码器」这一组，或一键下载全部所需文件。

以下路径从 ComfyUI 的 models 文件夹开始。若 ComfyUI 运行在另一台电脑，文件要放在那台电脑；设置幻域本地目录不会把文件传过去。

## 到 Anima 项目说明找配套文件

主模型还需要两个搭档：文本编码器负责理解提示词，VAE 负责把结果还原成图片。打开 Anima 项目说明，按里面的链接下载配套文件。下面列的是幻域当前工作流使用的文件名；不同发布版名称可能不同，不能只改名就当成同一个模型。

[查看 Anima 项目说明](https://huggingface.co/circlestone-labs/Anima/blob/main/README.md)

## 把 VAE 放到 vae 文件夹

当前工作流使用 qwen_image_vae.safetensors。在 models/vae 下按下面的子文件夹放好；文件夹没有就新建。不要把它放到 checkpoints 或 loras。

当前工作流默认路径（相对于 models）：

`{{vaePath}}`

![模型路径配置](/guides/anima/settings.webp)

> 实际界面示意，版本与路径以自己的页面为准

## 把文本编码器放到 text_encoders 文件夹

当前工作流使用 anima_baseV10_txt.safetensors。CLIPLoader 是加载它的节点名，不表示必须放到叫 clip 的文件夹。本清单统一使用 ComfyUI 的 models/text_encoders；按下面的子文件夹放好。

当前工作流默认路径（相对于 models）：

`{{textPath}}`

## 让 ComfyUI 重新识别，再选择文件

刷新或重启 ComfyUI，再打开幻域创作页。选择 Anima，在主模型和模型加载设置里检查主模型、文本编码器、VAE。若下拉框没有文件，先检查服务端路径和文件是否下完整；下载版本的文件名不同，就选择兼容的实际文件，不要只改文件名。
