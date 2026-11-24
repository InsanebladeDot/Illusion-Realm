/** 原服务经过 preload 和真实请求构造器，只有供应商 HTTP 响应由现有冒烟替代。 */
const fs = require("node:fs"), path = require("node:path");
const image = `data:image/png;base64,${fs.readFileSync(path.resolve("scripts/fixtures/video-composition/image.png")).toString("base64")}`;

async function checkPromptImageApi(ctx) {
  checkVisionCatalog(ctx);
  const request = { provider: "glm", baseUrl: "", model: "glm-4.6v-flash", text: "", instruction: "Return tags", images: [image, image] };
  const before = ctx.requests.length;
  // 不等待响应就先检查请求体，确保测试覆盖发送顺序而非仅检查返回的假文字。
  await ctx.run(`window.imageRequest = window.electronAPI.transformPrompt(${JSON.stringify(request)}); true`);
  await ctx.fixtureRequest(before);
  const content = ctx.requests[before].messages[1].content;
  ctx.check("Image-only transcreation sends ordered image_url bytes to the provider", Array.isArray(content) && content[0].type === "text" && content.slice(1).every(item => item.type === "image_url") && content[1].image_url.url === image && content[2].image_url.url === image);
  ctx.complete("1girl, blue_hair");
  ctx.check("Multimodal response returns through the unchanged IPC result", (await ctx.run("window.imageRequest")).data === "1girl, blue_hair");
  await checkInvalidImages(ctx, request);
  const next = ctx.requests.length;
  await ctx.run(`window.imageRequest = window.electronAPI.transformPrompt(${JSON.stringify(request)}); true`);
  await ctx.fixtureRequest(next); ctx.complete("", 400);
  const rejected = await ctx.run("window.imageRequest");
  ctx.check("Vision rejection is explicit and never retries without images", !rejected.success && rejected.error === "imageRequestRejected" && ctx.requests.length === next + 1);
}

/** 官网夹具覆盖视觉分档与免费项，生成价格仍应排除；离线也要能选到推荐型号。 */
function checkVisionCatalog(ctx) {
  const { parseGlm } = require("../../apps/electron/src/main/modules/agent/glm-catalog-parser");
  const text = "## 最新模型\n| GLM-5 | 128K | 4 | 18 |\n### 视觉理解\n| GLM-4.6V | 32K | 1 | 3 |\n| GLM-4.6V | 128K | 2 | 6 |\n> | GLM-4.6V-Flash | — | 免费 | 免费 |\n### 多模态生成\n| GLM-Image | 1K | 0.1 | 0.1 |";
  const models = parseGlm(text);
  ctx.check("Official vision prices retain free and tiered entries without image generation models", models.length === 3 && models[1].pricingBasis === "tiered" && models[2].tier === "free" && models[2].input === 0);
  const snapshot = require("../../apps/electron/src/main/modules/agent/provider-snapshot.json");
  ctx.check("Shared model picker has an offline free vision option", snapshot.glm.some(model => model.id === "glm-4.6v-flash" && model.input === 0 && model.output === 0));
}

async function checkInvalidImages(ctx, request) {
  const before = ctx.requests.length;
  for (const images of [null, ["localfile://local/?path=private.png"], Array(9).fill(image), [], ["data:image/png;base64,"]]) {
    const response = await ctx.run(`window.electronAPI.transformPrompt(${JSON.stringify({ ...request, images })})`);
    ctx.check("Malformed or empty image-only requests are rejected before networking", !response.success && response.code === "INVALID_ARGUMENT");
  }
  ctx.check("Invalid attachments have no provider side effects", ctx.requests.length === before);
}
module.exports = { checkPromptImageApi };
