# Anima image generation

Install the three files below. Standard generation does not require a LoRA.

## Main model → text encoder → VAE

1. Open the [Civitai model library](/tools/models/civitai), choose Anima and download a model. Automatic download offers the verified default version.
2. Put the text encoder in `text_encoders` and the VAE in `vae`. Click a model name below to copy its full destination path.
3. Completed downloads trigger a new scan. Select the downloaded Anima model in Create. Generation unlocks when the selected workflow has no missing files.

[Anima project](https://huggingface.co/circlestone-labs/Anima)

![Model downloads](/guides/anima/library.webp)

![Task files and destinations](/guides/model-setup/anima.webp)
