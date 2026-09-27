/**
 * 教程文档：SDXL 提示词写法（静态数据，随应用打包，不需要联网）
 *
 * 参考：
 * https://blog.pixai.art/en/pixai-sdxl-prompting-guide-essential-tips-tricks/
 * https://theneuralbase.com/comfyui/learn/intermediate/sdxl-prompt-structure/
 * https://stablediffusionxl.com/sdxl-resolutions-and-aspect-ratios/
 */
export const SDXL_PROMPT_GUIDE = `# 如何为 SDXL 编写提示词

SDXL 使用 **双文本编码器**（CLIP ViT-L + OpenCLIP ViT-bigG），既吃「逗号分隔的标签」，
也吃「完整句子」。核心原则：**把最重要的内容写在最前面**，因为文本编码有长度上限，
超出部分会被截断或弱化。

## 一、推荐的书写顺序

1. **画质 / 风格开头**：\`masterpiece, best quality, highly detailed\`
2. **主体**：\`1girl, solo\` / \`a young knight\`
3. **关键特征**：发色发型、服装、表情、动作
4. **环境与构图**：\`forest, sunlight, from below, full body\`
5. **光影与镜头**：\`cinematic lighting, depth of field, 50mm\`
6. **风格 / 艺术家 / 媒介**：\`watercolor, illustration, by <artist>\`

示例：

\`\`\`
masterpiece, best quality, 1girl, solo, long black hair, red kimono,
standing under a maple tree, autumn leaves, warm sunlight, from side,
full body, detailed background, illustration, soft shading
\`\`\`

## 二、SDXL 的实用技巧

- **别堆标签**：30–50 个有效标签通常优于上百个冲突破标签；重复表达同一概念会互相稀释。
- **权重**：\`(tag:1.2)\` 加权、\`(tag:0.8)\` 减弱；建议 1.0–1.4 之间，避免超过 1.5。
- **强调位置**：把最重要的 3–5 个标签放在最前，后面的标签影响较弱。
- **句子也可以**：\`a girl in a red kimono standing under maple trees\` 这类短句同样有效，
  可与标签混用（前段标签、后段句子）。
- **负面向**：SDXL 官方建议保持简短，过长反而干扰。

## 三、负面提示词

通用可用：

\`\`\`
worst quality, low quality, normal quality, lowres, bad anatomy, bad hands,
text, error, missing fingers, extra digit, fewer digits, cropped,
jpeg artifacts, signature, watermark, username, blurry, artist name
\`\`\`

动漫模型（Illustrious / NoobAI 等）可改用带分数标签的版本：

\`\`\`
worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts,
bad anatomy, bad hands, watermark, signature, username, artist name, dated
\`\`\`

两条都内置在「反向提示词预设」里，可直接选择。

## 四、尺寸与步数

- 训练分辨率是 **1024² 面积**，推荐分桶：\`1024×1024\`、\`832×1216\`、\`1216×832\`、
  \`896×1152\`、\`1152×896\`、\`768×1344\`、\`1344×768\`（创建页已内置这些预设）。
- 不要用 512×512 直接出图（SDXL 在低分辨率下容易崩坏），需要小图请先生成再缩放。
- 步数 20–30、CFG 5–8 是常见起点；底模为 Illustrious / NoobAI 时可从 CFG 5 起试。

## 五、模型选择提示

- **写实底模**：提示词偏自然语言与摄影术语（镜头、光圈、光线）。
- **动漫底模**：提示词偏 Danbooru 标签，并保留质量标签（\`masterpiece, best quality\`）。
- 同一段提示词换底模后效果差异很大，换模后先减少标签数量再逐步加。

## 六、常见问题

- **颜色溢出 / 过曝**：降低整体权重，检查是否有 \`(tag:1.5+)\`。
- **构图松散**：加入构图词（\`close-up\`、\`from above\`、\`rule of thirds\`）比堆形容词更有效。
- **手部崩坏**：负面加入 \`bad hands, extra fingers, missing fingers\`，并把动作写清楚。
`;
