# 1. Download Anima and choose its location

This is the manual guide. For automatic downloads, switch to “Automatic download”, choose your models folder, then submit the files. Track progress in the top download center.

Paths below start inside ComfyUI's models folder. If ComfyUI runs on another computer, put files there. Setting a local folder in Illusion Realm does not upload them.

## Tell the app where your models live

Open Settings → Model plugins → Path configuration. Set the model root to the models folder of the ComfyUI you use, not the whole ComfyUI folder. If only individual model folders are set, downloads use the relevant folder. Always check the destination shown before downloading.

![Model path settings](/guides/anima/settings.webp)

> Actual app example; your version and paths may differ

[Open path settings](/settings)

## Find an Anima main model in Civitai

Open Toolbox → Civitai models and use the online library. Choose Checkpoint as the model type and Anima as the base model, then open a model. A LoRA is not a replacement for the main model.

![Choose Checkpoint and Anima](/guides/anima/library.webp)

> Actual app example; your version and paths may differ

[Open Civitai models](/tools/models/civitai)

## Check the destination before downloading

Choose a version on the right, click Download, check its category and destination, then click Start download. The download icon in the title bar shows progress. The path below is the workflow default. Downloads create category and model folders; if yours differs, select the actual file in the creation page instead of making another copy.

Current workflow default path (relative to models):

`{{modelPath}}`

![Check the download destination](/guides/anima/download.webp)

> Actual app example; your version and paths may differ

[Open Civitai models](/tools/models/civitai)
