# SeedVR2 upscaling

Three files: 7B, 3B and VAE. Skip 3B when only using 7B, or skip 7B when only using 3B. No CLIP or LoRA is required.

## Install your selected model and VAE

Weights go in `diffusion_models/SeedVR2`, and the VAE in `vae/SeedVR2`. Ordinary generation remains available when upscaling is off. When enabled, only the selected upscaler and VAE are required.

[Comfy's official SeedVR2 repository](https://huggingface.co/Comfy-Org/SeedVR2)

![Task files and destinations](/guides/model-setup/seedvr2.webp)
