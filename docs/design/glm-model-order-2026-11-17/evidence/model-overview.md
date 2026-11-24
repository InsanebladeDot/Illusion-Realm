> ## Documentation Index
> Fetch the complete documentation index at: https://docs.bigmodel.cn/llms.txt
> Use this file to discover all available pages before exploring further.

# 模型概览

## 最新模型

> [card] [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3.md)
>
> **旗舰模型**
>
> * 在复杂软件工程、终端操作和更广泛的 Agent 任务上进步显著，并在效果和 Token 利用率之间平衡更佳

> [card] [GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md)
>
> **原生多模态模型**
>
> * 普惠的全球前沿模型，能够原生理解图片视频、生成可交互代码，自主完成研究分析、文档制作等专业任务

## 推荐模型

> [!TIP]
>
> 若需要看模型价格，请直接前往[价格页面](https://docs.bigmodel.cn/cn/guide/start/pricing.md)。

以下为智谱 9 款核心模型，覆盖文本生成、多模态理解、图像生成、视频生成、OCR、语音识别、语音合成、向量检索等全场景需求：

| 模型 | 特点 | 上下文 | 最大输出 |
| :- | :- | :- | :- |
| [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3.md) | 编程与智能体能力比肩 Claude Fable 5   长程任务与复杂环境中表现更佳 | 1M | 128K |
| [GLM-5.3-Flash](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md) | 普惠的全球前沿多模态模型  能够原生理解图片视频，生成可交互代码等专业任务 | 1M | 128K |
| [GLM-5.3-FlashX](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md) | 更快更流畅的 GLM-5.3-Flash  推理速度达 200 tokens/s | 1M | 128K |
| [GLM-5.3-FlashX-Legal](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md#glm-5-3-flashx-legal) | 面向法律专业场景优化的模型  助力法律检索、合同审查与文书起草的全流程 | 1M | 128K |
| [GLM-Image](https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image.md) | 旗舰图像生成模型 复杂指令遵循与知识密集生成更强 文字渲染表现突出，支持多分辨率 | | |
| [GLM-OCR](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-ocr.md) | 轻量图文解析模型 兼顾高精度、高效率文档理解 支持常见复杂版式解析 | 输入：单图 ≤ 10 MB， PDF ≤ 50 MB 最大支持 100 页 | |
| [GLM-ASR-2512](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-asr-2512) | 高精度语音识别模型 字符错误率低，支持自定义词汇 覆盖多种主流语言与方言场景，多模态支持音频 | | |
| [GLM-TTS](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts) | 语音合成模型 支持超拟人语音生成与情感表达 提供非流式与流式接口，多模态支持文本 | | |
| [CogVideoX-3](https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3) | 旗舰视频模型 指令遵循与物理模拟更强 现实与 3D 场景表现提升，支持首尾帧生成 | | |
| [Embedding-3](https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-3) | 第三代文本向量化模型（V3）  适用于语义检索、聚类、主题建模与分类等场景 | 8K | - |

> [accordion] 全部模型
>
> ### 语言模型
>
> 语言模型是一类专注于自然语言理解、生成与推理的多模态智能模型，具备文本处理、逻辑推导及视觉理解能力，能够自动处理和分析海量文本与图像数据，理解图像中的物体、场景及其关系，并结合语言信息进行逻辑判断、因果分析和多步推理，广泛应用于文本生成、智能问答、图像理解、图文交互及复杂任务处理等场景。
>
> | 模型 | 特点 | 上下文 | 最大输出 |
> | :- | :- | :- | :- |
> | [GLM-5.2](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2.md) | 支撑复杂长程任务稳定执行   Coding 能力大幅提升，从代码生成走向工程交付 | 1M | 128K |
> | [GLM-5.1](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.1) | Coding 能力对齐 Claude Opus 4.6  长程任务显著提升，可自主工作长达 8 小时 | 200K | 128K |
> | [GLM-5V-Turbo](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5v-turbo) | 多模态 Coding 基座 兼顾视觉理解、推理与代码生成 适配 Agent 工作流与长上下文任务 | 200K | 128K |
> | [GLM-5-Turbo](https://docs.bigmodel.cn/cn/guide/models/text/glm-5-turbo) | 龙虾任务核心需求专项优化  复杂长任务执行连续性好 | 200K | 128K |
> | [GLM-5](https://docs.bigmodel.cn/cn/guide/models/text/glm-5) | 编程能力对齐 Claude Opus 4.5  擅长 Agentic 长程规划与执行 | 200K | 128K |
> | [GLM-4.7-FlashX](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) | 轻量高速，小尺寸强能力 | 200K | 128K |
> | [GLM-4.7](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7) | 通用对话、推理与智能体能力上升级 | 200K | 128K |
> | [AutoGLM-Phone](https://docs.bigmodel.cn/cn/guide/models/vlm/autoglm-phone) | 手机智能助理框架 支持自然语言完成 App 操作任务 覆盖完整移动端操作指令集 | 20K | 2048 |
> | [GLM-4.6V](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.6v) | 原生支持工具调用 前端代码复刻效果更稳定 | 128K | 32K |
> | [GLM-4.6](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.6) | 擅长高级编码、复杂推理与工具调用 | 200K | 128K |
> | [GLM-4.5-Air](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.5) | 轻量模型  推理、编码与智能体任务表现稳定 | 128K | 96K |
> | [GLM-4.5-AirX](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.5) | 极速版本  适合低延迟、高响应要求的业务场景 | 128K | 96K |
> | [GLM-4.5](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.5) | 原生智能体大模型，参数效率翻倍  Agentic Coding 表现优异 | 128K | 96K |
> | [GLM-4.1V-Thinking-FlashX](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.1v-thinking) | 擅长复杂场景理解与多步骤分析 适合高并发视觉推理场景 | 64K | 16K |
> | [GLM-4-Long](https://docs.bigmodel.cn/cn/guide/models/text/glm-4-long) | 能够理解和回应复杂的查询  为处理超长文本和记忆型任务设计 | 1M | 4K |
> | [GLM-4-FlashX-250414](https://docs.bigmodel.cn/cn/guide/models/text/glm-4) | Flash 增强高速版本  推理速度快，适合高并发调用场景 | 128K | 16K |
> | [GLM-4.7-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash) | 免费文本模型  延续 GLM-4.7 基座的通用能力 | 200K | 128K |
> | [GLM-4.6V-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) | 免费模型，支持视觉推理 | 128K | 32K |
> | [GLM-4.5-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash) | 免费文本模型  支持最长 128K 的上下文处理 | 128K | 96K |
> | [GLM-4.1V-Thinking-Flash](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.1v-thinking-flash) | 免费模型，支持视觉推理 | 64K | 16K |
> | [GLM-4-Flash-250414](https://docs.bigmodel.cn/cn/guide/models/text/glm-4) | 免费文本模型 | 128K | 16K |
>
> ### 图像生成模型
>
> 图像生成模型是一类通过学习海量图像数据，实现从文本生成高质量图片的模型，广泛应用于视觉内容创作、游戏美术、产品设计、医学影像合成等领域。
>
> | 模型 | 特点 | 多分辨率 |
> | :- | :- | :- |
> | [CogView-4](https://docs.bigmodel.cn/cn/guide/models/image-generation/cogview-4) | 通用图像生成模型，生成质量高 画面细节更完整，适合多类创意场景 | 支持 |
> | [CogView-3-Flash](https://docs.bigmodel.cn/cn/guide/models/free/cogview-3-flash) | 免费模型 适合轻量图像创作 | 支持 |
>
> ### 视频生成模型
>
> 视频生成模型是一类通过学习时序视觉数据，从文本、图像或其他视频素材生成动态视频内容的模型，广泛应用于影视制作、虚拟人、动画生成、数字营销等领域。
>
> | 模型 | 特点 | 多分辨率 |
> | :- | :- | :- |
> | [Vidu Q1](https://docs.bigmodel.cn/cn/guide/models/video-generation/viduq1) | 高质量视频生成模型 | 图像、文本、 首尾帧 |
> | [Vidu 2](https://docs.bigmodel.cn/cn/guide/models/video-generation/vidu2) | 高速低价视频模型 | 图像、参考、 首尾帧 |
> | [CogVideoX-Flash](https://docs.bigmodel.cn/cn/guide/models/free/cogvideox-flash) | 免费视频生成模型 | 图像、文本 |
>
> ### 音视频模型
>
> 音视频模型是一类处理音频与视频信号的多模态模型，能够理解、生成或编辑视听内容，广泛应用于虚拟人、语音驱动动画、视频配音与剪辑、跨模态检索等场景。
>
> | 模型 | 特点 | 多模态支持 |
> | :- | :- | :- |
> | [GLM-TTS-Clone](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts-clone) | 音色克隆模型 3 秒音频即可快速生成相似音色 | 文本、音频 |
> | [GLM-Realtime](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-realtime) | 实时音视频模型 | 视频、音频、文本 |
> | [GLM-4-Voice](https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-4-voice) | 实时语音对话模型 | 文本、音频 |
>
> ### 向量模型与其他
>
> | 模型 | 特点 | 上下文 | 最大输出 |
> | :- | :- | :- | :- |
> | [Embedding-2](https://docs.bigmodel.cn/cn/guide/models/embedding/embedding-2) | 第二代文本向量化模型（V2） | 8K | - |
> | CodeGeeX-4 | 代码补全模型 | 128K | 32K |
> | Rerank | 文本重排序模型 | 4K | - |


This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.