# MiniMax image editing

Four dependencies: main model, LoRA, text encoder and VAE. The main model is shared with the video task and is not downloaded twice.

## Install image-editing dependencies

Files go in `diffusion_models`, `loras`, `text_encoders` and `vae`. The main model comes from Comfy's official repository. P-H3 dependencies come from [Pruna's official project](https://huggingface.co/PrunaAI/P-H3-Image-Comfy); do not substitute video text encoders for image-editing encoders.

![Task files and destinations](/guides/model-setup/minimax-image.webp)
