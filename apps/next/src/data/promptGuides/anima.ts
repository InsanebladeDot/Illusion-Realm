/**
 * 教程文档：Anima 提示词写法（静态数据，随应用打包，不需要联网）
 *
 * Anima = CircleStone Labs × Comfy Org 的 2B 文生图模型（基于 NVIDIA Cosmos-Predict2-2B，
 * 文本编码器为 Qwen3-0.6B），采用「Danbooru 标签 + 自然语言」的混合提示词格式。
 * 参考：
 * https://huggingface.co/circlestone-labs/Anima/blob/main/README.md
 * https://github.com/AI-KSK/anima-prompt-crafter-skill/blob/main/references/source-baseline.md
 * https://moescape.ai/posts/7bc3e4a3-a0ed-46ea-b157-060786f15146
 */
export const ANIMA_PROMPT_GUIDE = `# 如何为 Anima 编写提示词

Anima 是 2B 参数的文生图模型（CircleStone Labs × Comfy Org），文本编码器为 Qwen3-0.6B。
它同时理解 **Danbooru 风格标签**与**自然语言**，因此推荐用「混合格式」写提示词。

## 一、推荐的书写顺序

1. **质量 / 分数标签**（放在最前）
2. **主体与数量**：角色、人数、动作
3. **外貌与服装**：发色发型、瞳色、服饰
4. **场景与构图**：背景、镜头、视角
5. **风格与年代**：画风、时间段标签
6. **自然语言补充**：一句话描述氛围或细节

示例：

\`\`\`
score_8, masterpiece, best quality, 1girl, solo, silver hair, long hair,
blue eyes, school uniform, standing, classroom, looking at viewer,
soft lighting, upper body, newest, gentle smile
\`\`\`

## 二、质量标签怎么选

- 分数标签 \`score_1\` … \`score_9\` 是 Anima 系列的核心质量信号，\`score_7\` 以上配合 \`masterpiece, best quality\` 通常最稳。
- 想要更「干净扁平」的旧番质感：把 \`newest\` 去掉，改用年代/赛璐璐相关标签（如 \`retro artstyle, cel shading\`）。
- 想要最新画风：保留 \`newest, highres, absurdres\`。

## 三、权重语法

与 ComfyUI / A1111 通用：

\`\`\`
(silver hair:1.3), (blue eyes:1.1), [background:0.8]
\`\`\`

- \`(tag:1.2)\` 提高权重，\`0.8\` 左右是轻度削弱
- 不建议超过 \`1.5\`，过高会出现色彩与结构崩坏
- 建议只对 2–4 个关键标签加权，整段加权会互相压制

## 四、负面提示词

Anima 训练时使用分数标签作为质量信号，因此最有效的负面是：

\`\`\`
worst quality, low quality, score_1, score_2, score_3, artist name, blurry,
jpeg artifacts, bad anatomy, bad hands, extra fingers, watermark, signature
\`\`\`

需要更强的结构约束时，在「反向提示词预设」里选择「解剖 / 融合修正（加权）」。

## 五、尺寸与步数

- 推荐分辨率：\`1024×1024\`、\`832×1216\`、\`1216×832\` 等训练友好分桶（创建页已内置）。
- 步数 15–30、CFG 1–4 之间通常表现最好；采样器可先用模板自带的 \`euler_ancestral\` + \`simple\`。

## 六、常见问题

- **画面脏、噪点多**：提高分数标签、降低 CFG、确认负面里包含 \`worst quality, low quality\`。
- **多手多脚**：负面加入手部与肢体标签，并把人数标签写清楚（\`1girl, solo\`）。
- **风格跑偏**：减少风格标签数量，把想要的画风标签放到质量标签之后、主体之前。
`;
