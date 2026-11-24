# 2. Add the VAE and text encoder

This is the manual guide. You can also switch to “Automatic download”, choose your models folder, then download the VAE and text encoder group or all required files.

Paths below start inside ComfyUI's models folder. If ComfyUI runs on another computer, put files there. Setting a local folder in Illusion Realm does not upload them.

## Find the companion files in the Anima project

The main model needs two companions: the text encoder reads your prompt, and the VAE turns the result into an image. Follow the download links in the Anima project instructions. Filenames below come from this app's workflow. Releases may use other names; renaming a file does not make it the same model.

[Read the Anima project instructions](https://huggingface.co/circlestone-labs/Anima/blob/main/README.md)

## Put the VAE in the vae folder

The current workflow uses qwen_image_vae.safetensors. Create the subfolders shown below inside models/vae and put the file there. Do not put it in checkpoints or loras.

Current workflow default path (relative to models):

`{{vaePath}}`

![Model path settings](/guides/anima/settings.webp)

> Actual app example; your version and paths may differ

## Put the text encoder in text_encoders

The current workflow uses anima_baseV10_txt.safetensors. CLIPLoader is the loader node's name; it does not mean the folder must be called clip. This guide uses ComfyUI's models/text_encoders folder with the subfolders shown below.

Current workflow default path (relative to models):

`{{textPath}}`

## Refresh ComfyUI, then select the files

Refresh or restart ComfyUI and open the creation page. Select Anima and check the main model, text encoder and VAE in the model selectors and loading settings. If a file is missing from a list, check the server-side folder and whether the download finished. Select the compatible actual file when a release uses different names; do not just rename it.
