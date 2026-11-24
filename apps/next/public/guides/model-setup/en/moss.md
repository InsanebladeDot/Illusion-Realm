# Moss Image text to image

Use the checklist's group download or get the files from the [Comfy-Org Moss Image repository](https://huggingface.co/Comfy-Org/MOSS-Image). Each path starts inside your ComfyUI `models` folder.

## Download the main model

Put `moss_image_sft_int8_convrot.safetensors` at `{{modelPath}}`.

## Download the text encoder

Put `qwen3.5_9b_int8_convrot.safetensors` at `{{textPath}}`.

## Download the VAE

Put `flux2-vae.safetensors` at `{{vaePath}}`. After installing files manually, return to Create and select Recheck models. If the files are in other subfolders of the matching categories, use Choose local models.
