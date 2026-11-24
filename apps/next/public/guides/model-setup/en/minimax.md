# MiniMax video and audio

Install the five base files below. Audio generation needs only the audio VAE; video needs both VAEs.

## Install workflow dependencies

1. Main model: `diffusion_models`.
2. Turbo LoRA: `loras`.
3. Text encoder: `text_encoders`.
4. Both VAEs: `vae`; audio and video VAEs are not interchangeable.

Files come from [Comfy's official repository](https://huggingface.co/Comfy-Org/MiniMax-H3). The original first/last-frame template also includes a third-party NSFW_ANIME_H3_V16-step00002250 LoRA. Its download URL is not guessed here: install it separately or remove/replace it in Extensions. Any missing file in your current selection keeps generation disabled.

![Task files and destinations](/guides/model-setup/minimax.webp)
