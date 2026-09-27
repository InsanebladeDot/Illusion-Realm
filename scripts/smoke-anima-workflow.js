/**
 * Anima 工作流动态生成验证（任务规范《ComfyUI Anima 工作流动态生成规范》）
 *
 * 做法：真实跑一遍创建页（Electron 渲染进程），把「生成」时发给主进程的
 * ComfyUI API Prompt 截获下来，逐条核对规范里的检查清单：
 *   需求 1：采样器（22 个规范值）与调度器（6 个规范值）写入 KSampler(5)
 *   需求 2：UNetLoader(7).unet_name = 用户选择的模型
 *   需求 3：LoRA 精确数量 / ID 从 100 递增 / LoraLoaderModelOnly / 串联无断裂 / CLIP 未被干扰
 *   零 LoRA 边界：KSampler(5).model 直连 [7, 0]
 *
 * 运行：npx electron scripts/smoke-anima-workflow.js   （退出码 0 = 通过）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { app, BrowserWindow, ipcMain: realIpcMain } = require("electron");
const { registerAppProtocol } = require("../apps/electron/appProtocol");
const { scanModelsInDirectory } = require("../apps/electron/modelScanner");
const { listGeneratedImages } = require("../apps/electron/generatedImages");

/** 1×1 PNG：用于让「生成结果」真实走一遍预览/落盘链路 */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * 本脚本注册的 IPC stub 统一包装成真实的 IpcResult 形状
 * （`{ success: true, data }` / `{ success: false, error, code? }`）。
 *
 * 为什么必需：主进程第 1 轮统一了跨 IPC 边界不抛异常、一律返回 IpcResult，
 * 渲染进程侧的封装层（unwrapIpc）据此判定成败。裸返回原始值的 stub 会被判为失败、
 * 抛 IpcCallError，导致「用户数据没加载 → 写盘断言全挂」。
 */
const ipcMain = {
  handle: (channel, handler) =>
    realIpcMain.handle(channel, async (event, ...args) => {
      try {
        return { success: true, data: await handler(event, ...args) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
};

registerAppProtocol();

/* ------------------------------------------------------------------ *
 * 可观测性：看门狗 / 单步超时 / 日志留档 / 进程树终止 / 页面侧标记
 *
 * 这一套最初就是为**本套件**长出来的（它跑的是「真实工作流 + 模型 + ComfyUI 服务」
 * 整条长链路，曾多次静默卡死：十几分钟无输出、被外壳超时杀掉后留下孤儿 Electron 进程，
 * 下一次运行还会卡在单实例锁上）。一个不产生信号的测试比没有测试更坏 ——
 * 目标不是让它一定绿，而是让它**要么绿、要么明确地红、要么明确地超时**。
 *
 * 现在骨架已抽到 `scripts/lib/smoke-harness.js`，与其它冒烟套件共用一份实现
 * （此前这里是内联副本，两处会各自漂移）。行为不变：退出码
 *   0 通过 / 1 断言失败或异常 / 2 构建产物过期 / 124 看门狗超时 / 125 进程内单步超时
 * ------------------------------------------------------------------ */
const { createSmokeHarness } = require("./lib/smoke-harness");

const smoke = createSmokeHarness({ name: "anima-workflow" });
smoke.installConsoleTee();
const check = smoke.check;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 读取 PNG 的 tEXt 文本块（keyword + text）。
 * 独立实现（不依赖渲染层的打包产物），用来验证「参数确实写进了图片本身」。
 */
function readPngTextChunks(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < signature.length; index += 1) {
    if (buffer[index] !== signature[index]) return [];
  }

  const fields = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) break;

    if (type === "tEXt") {
      const data = buffer.subarray(dataStart, dataEnd);
      const separator = data.indexOf(0);
      if (separator > 0) {
        fields.push({
          keyword: data.toString("latin1", 0, separator),
          text: data.toString("latin1", separator + 1),
        });
      }
    } else if (type === "iTXt") {
      const data = buffer.subarray(dataStart, dataEnd);
      const separator = data.indexOf(0);
      if (separator > 0) {
        fields.push({
          keyword: data.toString("latin1", 0, separator),
          text: data.toString("utf8", separator + 1),
        });
      }
    }

    if (type === "IEND") break;
    offset = dataEnd + 4; // 跳过 CRC
  }

  return fields;
}

const LORA_CLASS_TYPES = new Set(["LoraLoader", "LoraLoaderModelOnly"]);
const MODEL_INPUT_KEYS = ["ckpt_name", "unet_name", "model_name"];

/**
 * 复刻渲染层的「本地解析」关键步骤：从图片内嵌的 ComfyUI 工作流里取出
 * 正面/反向提示词、模型、LoRA 链与采样参数。解析不出来 → null（= 非本生成器生成）。
 */
function readRemixParamsFromImage(filePath) {
  const field = readPngTextChunks(filePath).find(
    (item) => item.keyword === "prompt" || item.keyword === "workflow"
  );
  if (!field) return null;

  let workflow = null;
  try {
    workflow = JSON.parse(field.text);
  } catch {
    return null;
  }
  if (!workflow || typeof workflow !== "object") return null;

  const nodes = Object.entries(workflow);
  if (!nodes.some(([, node]) => node && typeof node.class_type === "string")) {
    return null;
  }

  const textOf = (ref) => {
    if (!Array.isArray(ref)) return "";
    const node = workflow[String(ref[0])];
    return node && node.class_type === "CLIPTextEncode"
      ? String(node.inputs?.text ?? "")
      : "";
  };

  const params = {
    positivePrompt: "",
    negativePrompt: "",
    model: "",
    loras: [],
    sampler: "",
    scheduler: "",
    steps: 0,
    cfg: 0,
    seed: 0,
    width: 0,
    height: 0,
  };

  for (const [, node] of nodes) {
    if (!node || typeof node.class_type !== "string") continue;
    const inputs = node.inputs ?? {};

    if (node.class_type === "KSampler" || node.class_type === "KSamplerAdvanced") {
      params.positivePrompt = params.positivePrompt || textOf(inputs.positive);
      params.negativePrompt = params.negativePrompt || textOf(inputs.negative);
      params.sampler = String(inputs.sampler_name ?? params.sampler);
      params.scheduler = String(inputs.scheduler ?? params.scheduler);
      params.steps = Number(inputs.steps ?? params.steps);
      params.cfg = Number(inputs.cfg ?? params.cfg);
      params.seed = Number(inputs.seed ?? params.seed);
    }

    if (node.class_type === "EmptyLatentImage") {
      params.width = Number(inputs.width ?? params.width);
      params.height = Number(inputs.height ?? params.height);
    }

    if (!params.model) {
      for (const key of MODEL_INPUT_KEYS) {
        if (typeof inputs[key] === "string") {
          params.model = inputs[key];
          break;
        }
      }
    }

    if (LORA_CLASS_TYPES.has(node.class_type) && typeof inputs.lora_name === "string") {
      params.loras.push({
        name: inputs.lora_name,
        strength: Number(inputs.strength_model ?? 1),
      });
    }
  }

  if (!params.positivePrompt && !params.model) return null;
  return params;
}

// ---------- 测试用模型目录 ----------
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "anima-workflow-smoke-"));
smoke.setWorkDir(workDir);
const modelsRoot = path.join(workDir, "models");
const diffusionModelsDir = path.join(modelsRoot, "diffusion_models");
const lorasDir = path.join(modelsRoot, "loras");
const outputDir = path.join(workDir, "output");

const ANIMA_MODEL = "anima_aestheticV11.safetensors";
const LORA_A = "lora_style_a.safetensors";
const LORA_B = "lora_style_b.safetensors";
/** 扩展以文件夹名展示（文件夹 = 模型，内部文件 = 版本） */
const LORA_FOLDER_A = "lora_style_a";
const LORA_FOLDER_B = "lora_style_b";

function writeDummy(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(64, 7));
}

writeDummy(path.join(diffusionModelsDir, "Anima", ANIMA_MODEL));
// 扩展（LoRA）以「文件夹 = 模型，内部文件 = 版本」组织，因此两个 LoRA 需要两个文件夹
writeDummy(path.join(lorasDir, "Anima", "lora_style_a", LORA_A));
writeDummy(path.join(lorasDir, "Anima", "lora_style_b", LORA_B));
// 放大模型：检索路径指向整个 models 目录时最容易被误当成扩散模型（ComfyUI 会报 value_not_in_list）
writeDummy(path.join(modelsRoot, "upscale_models", "4xESRGAN", "4x-ESRGAN.pth"));
fs.mkdirSync(outputDir, { recursive: true });
// 预置一张「旧图」：磁盘列表非空时，刚生成的结果也必须显示在图片区（规范 4.6）
fs.writeFileSync(
  path.join(outputDir, "old-result.png"),
  Buffer.from(TINY_PNG_BASE64, "base64")
);

// ---------- 用户数据（临时文件，指向测试模型目录） ----------
const userDataFile = path.join(workDir, "illusion-realm.json");
fs.writeFileSync(
  userDataFile,
  JSON.stringify(
    {
      version: 1,
      userDataPath: userDataFile,
      settings: {
        userDataPath: userDataFile,
        outputPath: outputDir,
        comfyServerUrl: "http://127.0.0.1:8188",
        paths: {
          // 与用户实际配置一致：检索路径指向整个 models 目录
          searchPath: modelsRoot,
          checkpointPath: "",
          lorasPath: lorasDir,
          diffusionModelsPath: diffusionModelsDir,
        },
      },
    },
    null,
    2
  )
);

ipcMain.handle("userData:read", async () => ({
  filePath: userDataFile,
  data: JSON.parse(fs.readFileSync(userDataFile, "utf8")),
  isNew: false,
}));
ipcMain.handle("userData:write", async (_event, data) => {
  fs.writeFileSync(userDataFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return { filePath: userDataFile, data };
});
ipcMain.handle("userData:getDefaultPath", async () => userDataFile);
ipcMain.handle("models:scan", async (_event, dirPath, type) => {
  if (!dirPath || (type !== "checkpoint" && type !== "lora")) return [];
  try {
    return scanModelsInDirectory(dirPath, type);
  } catch {
    return [];
  }
});
ipcMain.handle("files:listGeneratedImages", async (_event, customOutputPath, folderDirPath) => {
  try {
    return listGeneratedImages(customOutputPath || outputDir, folderDirPath ?? null);
  } catch {
    return [];
  }
});
ipcMain.handle("files:listOutputFolders", async () => []);
ipcMain.handle("files:readImageDataUrl", async (_event, filePath) => {
  try {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch {
    return null;
  }
});
ipcMain.handle("files:saveGeneratedImages", async (_event, customOutputPath, files) => {
  const dir = customOutputPath || outputDir;
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const file of files ?? []) {
    if (!file?.filename || !file?.dataBase64) continue;
    const target = path.join(dir, path.basename(file.filename));
    fs.writeFileSync(target, Buffer.from(file.dataBase64, "base64"));
    saved.push(target);
  }
  return saved;
});
ipcMain.handle("changelog:read", async () => null);

/** 截获发给 ComfyUI 的 API Prompt */
const capturedPrompts = [];
ipcMain.handle("comfy:generate", async (_event, prompt) => {
  capturedPrompts.push(JSON.parse(JSON.stringify(prompt)));
  return {
    promptId: `smoke-${capturedPrompts.length}`,
    images: [
      {
        nodeId: "9",
        filename: `smoke_${capturedPrompts.length}.png`,
        subfolder: "",
        folderType: "output",
        dataUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      },
    ],
    videos: [],
  };
});

// ---------- 规范要求的数据（用于核对） ----------
const SPEC_SAMPLERS = [
  "euler", "euler_ancestral", "heun", "heunpp2", "dpm_2", "dpm_2_ancestral",
  "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde",
  "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
  "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm", "ddim", "uni_pc", "uni_pc_bh2",
];
const SPEC_SCHEDULERS = [
  "normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform",
];

app.whenReady().then(async () => {
  smoke.installWatchdog(app);
  // 陈旧产物会伪装成代码回归，先拦掉（退出码 2）
  smoke.assertBuildFresh({ app });
  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    // 必须显示窗口并置顶：隐藏 / 被遮挡的窗口下 Chromium 会暂停 CSS transition，
    // 抽屉收起/展开的过渡动画就测不出真实高度变化
    show: true,
    alwaysOnTop: true,
    // 但只靠 show/alwaysOnTop 不够：实测（2026-09-19）在无人值守运行时窗口仍被判为
    // 「被遮挡」，Chromium 随即**停掉 requestAnimationFrame**，而定时器照常 ——
    // 于是 `await new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)))`
    // 永不 settle，整条链路静默挂死（页面侧标记停在「已点击收起」，而线程仍可响应）。
    // 这里显式关掉后台节流，从成因上消除它，而不是给等待逻辑加兜底去掩盖。
    backgroundThrottling: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 与真实应用 main.js 一致：preload 是手写 CommonJS，需 Node 环境才能 require 本地模块
      sandbox: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, "..", "apps", "electron", "preload.js"),
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") consoleErrors.push(event.message);
  });

  smoke.attachWebContents(win.webContents);
  // 窗口约定 + 可选的遮挡维度（SMOKE_OCCLUDE=1 时把整个套件跑在被遮挡条件下）
  await smoke.hardenWindow(win);
  // 单步超时 + 步骤名 + 页面侧标记读取：骨架见 scripts/lib/smoke-harness.js
  const run = smoke.createRun();
  const readPageMarks = smoke.readPageMarks;

  const waitFor = async (expression, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await run(`(() => { try { return Boolean(${expression}); } catch { return false; } })()`);
      if (ok) return true;
      await sleep(200);
    }
    return false;
  };

  const clickByText = (text) =>
    run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === ${JSON.stringify(text)}
      );
      if (btn) btn.click();
      return !!btn;
    })()`);

  /** 在弹窗里按卡片标题找到它的「选择」按钮并点击 */
  const selectCardByTitle = (titlePart) =>
    run(`(() => {
      const title = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent.includes(${JSON.stringify(titlePart)})
      );
      if (!title) return false;
      let node = title;
      while (node && node !== document.body) {
        const btn = Array.from(node.querySelectorAll('button')).find(
          (b) => b.textContent.trim() === '选择'
        );
        if (btn) { btn.click(); return true; }
        node = node.parentElement;
      }
      return false;
    })()`);

  const dialogOpen = (titleId) => run(`Boolean(document.getElementById(${JSON.stringify(titleId)}))`);

  try {
    await win.loadURL("app://app/create");
    await sleep(3500);

    // 模型扫描由 AppShell 自动触发，等它把测试模型读进来
    const modelsLoaded = await waitFor(
      `document.body.innerText.includes(${JSON.stringify(ANIMA_MODEL.replace(".safetensors", ""))}) ||
       !!document.querySelector('section [role="button"][tabindex="0"]')`,
      20000
    );
    check("创建页加载完成（模型卡可点击）", modelsLoaded === true);

    // ---------- 需求 2：选择 Anima 模型 ----------
    await run(`(() => {
      const card = document.querySelector('section [role="button"][tabindex="0"]');
      if (card) card.click();
      return true;
    })()`);
    await sleep(1200);
    const modelDialogOpen = await dialogOpen("model-select-dialog-title");
    check("打开模型选择弹窗", modelDialogOpen === true);

    const dialogListing = await run(`(() => {
      const dialog = document.getElementById('model-select-dialog-title')?.closest('[role="dialog"]');
      const text = dialog ? dialog.innerText : '';
      return {
        listsUpscale: text.includes('4x-ESRGAN') || text.includes('4xESRGAN'),
        listsAnima: text.includes('Anima'),
      };
    })()`);
    check("放大模型不会出现在 Anima 模型列表中", dialogListing.listsUpscale === false);
    check("模型列表包含 Anima 模型", dialogListing.listsAnima === true);

    const modelPicked = await selectCardByTitle("Anima");
    await sleep(800);
    check(`已选择 Anima 模型 ${ANIMA_MODEL}`, modelPicked === true);
    const modelCardText = await run(`(() => {
      const card = document.querySelector('section [role="button"][tabindex="0"]');
      return card ? card.innerText.replace(/\\s+/g, ' ').slice(0, 120) : '';
    })()`);
    check("模型卡显示已选模型", modelCardText.includes("Anima"), modelCardText);

    // ---------- 需求 3 前置：添加 2 个 LoRA ----------
    const addLora = async (folderName) => {
      await clickByText("添加扩展");
      await sleep(1000);
      const picked = await selectCardByTitle(folderName);
      await sleep(900);
      const stillOpen = await dialogOpen("extension-select-dialog-title");
      if (stillOpen) {
        await run(`(() => {
          const btn = document.querySelector('[aria-label="关闭"]');
          if (btn) btn.click();
          return true;
        })()`);
        await sleep(600);
      }
      return picked;
    };

    const pickedA = await addLora(LORA_FOLDER_A);
    const pickedB = await addLora(LORA_FOLDER_B);
    check(`已添加扩展 ${LORA_FOLDER_A}`, pickedA === true);
    check(`已添加扩展 ${LORA_FOLDER_B}`, pickedB === true);
    const selectedRows = await run(`(() => document.querySelectorAll('button[aria-label^="移除 "]').length)()`);
    check("扩展行显示 2 个已选 LoRA", selectedRows === 2, `${selectedRows}`);

    // ---------- 需求 1：采样器 / 调度器 ----------
    await clickByText("高级设置");
    await sleep(700);

    const samplerTrigger = `document.querySelector('[aria-label="采样器"]')`;
    const schedulerTrigger = `document.querySelector('[aria-label="调度器"]')`;
    const hasTriggers = await run(`Boolean(${samplerTrigger}) && Boolean(${schedulerTrigger})`);
    check("高级设置里有采样器与调度器控件", hasTriggers === true);

    // 初始显示 = 当前系列工作流模板自带值（Anima 模板：euler_ancestral + simple）
    const templateDefaults = await run(`(() => ({
      sampler: document.querySelector('[aria-label="采样器"]')?.getAttribute('data-option-value') ?? '',
      scheduler: document.querySelector('[aria-label="调度器"]')?.getAttribute('data-option-value') ?? '',
    }))()`);
    check("采样器默认取工作流模板值（euler_ancestral）",
      templateDefaults.sampler === "euler_ancestral", templateDefaults.sampler);
    check("调度器默认取工作流模板值（simple）",
      templateDefaults.scheduler === "simple", templateDefaults.scheduler);

    const readOptions = async (triggerSelector) => {
      await run(`(() => { document.querySelector(${JSON.stringify(triggerSelector)}).click(); return true; })()`);
      await sleep(400);
      const values = await run(`(() => Array.from(document.querySelectorAll('[role="option"]'))
        .map((o) => o.getAttribute('data-value')))()`);
      await run(`(() => { document.querySelector(${JSON.stringify(triggerSelector)}).click(); return true; })()`);
      await sleep(250);
      return values;
    };

    const samplerOptions = await readOptions('[aria-label="采样器"]');
    const missingSamplers = SPEC_SAMPLERS.filter((value) => !samplerOptions.includes(value));
    check(
      "采样器包含规范 2.1 的全部 22 个值",
      missingSamplers.length === 0,
      missingSamplers.length ? `缺少 ${missingSamplers.join(", ")}` : `${samplerOptions.length} 项`
    );

    const schedulerOptions = await readOptions('[aria-label="调度器"]');
    check(
      "调度器为规范 2.2 的 6 个值",
      SPEC_SCHEDULERS.every((value) => schedulerOptions.includes(value)) &&
        schedulerOptions.length === SPEC_SCHEDULERS.length,
      schedulerOptions.join(", ")
    );

    const pickOption = async (triggerSelector, value) => {
      await run(`(() => { document.querySelector(${JSON.stringify(triggerSelector)}).click(); return true; })()`);
      await sleep(400);
      const clicked = await run(`(() => {
        const option = Array.from(document.querySelectorAll('[role="option"]'))
          .find((o) => o.getAttribute('data-value') === ${JSON.stringify(value)});
        if (option) option.click();
        return !!option;
      })()`);
      await sleep(400);
      return clicked;
    };

    const pickedSampler = await pickOption('[aria-label="采样器"]', "uni_pc_bh2");
    const pickedScheduler = await pickOption('[aria-label="调度器"]', "karras");
    check("可选择规范中的采样器 uni_pc_bh2", pickedSampler === true);
    check("可选择规范中的调度器 karras", pickedScheduler === true);

    // ---------- 提示词框：限高 + 可滚动 + 隐藏滚动条 ----------
    const editorStyles = await run(`(() => {
      const neg = document.getElementById('negative-prompt-editor');
      const pos = document.getElementById('prompt-editor');
      const describe = (el) => el ? {
        maxHeight: getComputedStyle(el).maxHeight,
        overflowY: getComputedStyle(el).overflowY,
        classes: el.className,
      } : null;
      return { neg: describe(neg), pos: describe(pos) };
    })()`);
    check("反向提示词框限制最大高度", editorStyles.neg?.maxHeight !== "none", editorStyles.neg?.maxHeight);
    check("反向提示词框可滚动", editorStyles.neg?.overflowY === "auto", editorStyles.neg?.overflowY);
    check("反向提示词框隐藏滚动条",
      editorStyles.neg?.classes.includes("[&::-webkit-scrollbar]:hidden") === true);
    check("提示词框限制最大高度", editorStyles.pos?.maxHeight !== "none", editorStyles.pos?.maxHeight);
    check("提示词框可滚动", editorStyles.pos?.overflowY === "auto", editorStyles.pos?.overflowY);
    check("提示词框隐藏滚动条",
      editorStyles.pos?.classes.includes("[&::-webkit-scrollbar]:hidden") === true);

    // ---------- 反向提示词预设：按钮 + 弹框 + 填入 ----------
    const presetTrigger = await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.includes('反向提示词预设')
      );
      if (btn) btn.click();
      return !!btn;
    })()`);
    check("反向提示词区域有预设入口按钮", presetTrigger === true);
    await sleep(800);

    const presetDialog = await run(`(() => {
      const dialog = document.getElementById('negative-preset-dialog-title')?.closest('[role="dialog"]');
      return {
        exists: !!dialog,
        text: dialog ? dialog.innerText.slice(0, 400) : '',
        cards: dialog ? dialog.querySelectorAll('[data-preset-id]').length : 0,
      };
    })()`);
    check("点击后弹出反向提示词预设弹框", presetDialog.exists === true);
    check("弹框列出内置预设", presetDialog.cards >= 5, `${presetDialog.cards} 个`);
    check("内置预设含用户提供的加权负面", presetDialog.text.includes("解剖 / 融合修正"), "");

    // 选中「SDXL 通用负面」并保存 → 内容写入输入框
    const pickPreset = await run(`(() => {
      const card = document.querySelector('[data-preset-id="neg-sdxl-standard"]');
      if (card) card.click();
      return !!card;
    })()`);
    await sleep(400);
    await run(`(() => {
      const dialog = document.getElementById('negative-preset-dialog-title')?.closest('[role="dialog"]');
      const save = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '保存更改'
      );
      if (save) save.click();
      return !!save;
    })()`);
    await sleep(600);

    const afterPreset = await run(`(() => {
      const editor = document.getElementById('negative-prompt-editor');
      return {
        text: editor ? editor.textContent : '',
        dialogClosed: !document.getElementById('negative-preset-dialog-title'),
        activeName: document.body.innerText.includes('SDXL 通用负面'),
      };
    })()`);
    check("选中预设后写入反向提示词输入框",
      pickPreset && afterPreset.text.includes("worst quality"), afterPreset.text.slice(0, 60));
    check("保存后弹框关闭", afterPreset.dialogClosed === true);

    // 新建自定义预设 → 持久化到用户数据文件
    await run(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.includes('反向提示词预设')
      );
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(700);
    await run(`(() => {
      const dialog = document.getElementById('negative-preset-dialog-title')?.closest('[role="dialog"]');
      const add = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent.includes('添加自定义预设')
      );
      if (add) add.click();
      return !!add;
    })()`);
    await sleep(500);
    await run(`(() => {
      const setValue = (el, value) => {
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue(document.getElementById('preset-name'), '我的负面预设');
      setValue(document.getElementById('preset-field-negative'), 'custom-negative-marker, my-negative');
      return true;
    })()`);
    await sleep(400);
    await run(`(() => {
      const dialog = document.getElementById('negative-preset-dialog-title')?.closest('[role="dialog"]');
      const create = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '创建预设'
      );
      if (create) create.click();
      return !!create;
    })()`);
    await sleep(600);
    await run(`(() => {
      const dialog = document.getElementById('negative-preset-dialog-title')?.closest('[role="dialog"]');
      const save = Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '保存更改'
      );
      if (save) save.click();
      return !!save;
    })()`);
    await sleep(600);

    const afterCustom = await run(`(() => {
      const editor = document.getElementById('negative-prompt-editor');
      return editor ? editor.textContent : '';
    })()`);
    check("新建的自定义预设可直接使用",
      afterCustom.includes("custom-negative-marker"), afterCustom.slice(0, 60));

    // 持久化是异步写入的，轮询等待（避免偶发读得太早）
    let persistedPresets = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const persisted = JSON.parse(fs.readFileSync(userDataFile, "utf8"));
      persistedPresets = persisted.negativePresets?.customPresets ?? [];
      if (persistedPresets.some((p) => p.name === "我的负面预设")) break;
      await sleep(250);
    }
    check("自定义预设写入用户数据文件（negativePresets 段）",
      persistedPresets.some((p) => p.name === "我的负面预设"),
      JSON.stringify(persistedPresets.map((p) => p.name)));

    // ---------- 图片尺寸：训练友好预设 + 自定义宽高 ----------
    const sizeSection = await run(`(() => {
      const presets = Array.from(document.querySelectorAll('[data-size-preset]'));
      return {
        count: presets.length,
        ids: presets.map((el) => el.getAttribute('data-size-preset')),
        hasSvgIcons: presets.filter((el) => el.querySelector('svg')).length,
        labels: presets.map((el) => el.innerText.replace(/\\s+/g, ' ').trim()),
      };
    })()`);
    check("图片尺寸提供 8 个预设 + 自定义", sizeSection.count === 9, sizeSection.ids.join(", "));
    check("每个比例都有对应图标", sizeSection.hasSvgIcons === 9, `${sizeSection.hasSvgIcons}/9`);
    check("预设含两个系列的默认尺寸预设（3:4 与 5:6）",
      sizeSection.ids.includes("3:4") && sizeSection.ids.includes("5:6"),
      sizeSection.ids.join(", "));
    check("预设展示训练友好分辨率", sizeSection.labels.some((l) => l.includes("1024×1024")),
      sizeSection.labels.join(" | ").slice(0, 120));

    await run(`(() => {
      const custom = document.querySelector('[data-size-preset="custom"]');
      if (custom) custom.click();
      return true;
    })()`);
    await sleep(400);
    await run(`(() => {
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue(document.querySelector('[aria-label="自定义宽度"]'), '1500');
      setValue(document.querySelector('[aria-label="自定义高度"]'), '1200');
      return true;
    })()`);
    await sleep(400);
    const customSize = await run(`(() => ({
      width: Number(document.querySelector('[aria-label="自定义宽度"]')?.value ?? 0),
      height: Number(document.querySelector('[aria-label="自定义高度"]')?.value ?? 0),
    }))()`);
    check("自定义宽高开放到 1500", customSize.width === 1500, `${customSize.width}`);
    check("自定义高度可设置", customSize.height === 1200, `${customSize.height}`);

    // ---------- 提示词抽屉：收起 / 展开的自然过渡（且不能丢内容） ----------
    await run(
      `(() => {
      window.__marks = [];
      const editor = document.getElementById('prompt-editor');
      if (editor) editor.textContent = 'drawer-keep-marker';
      return true;
    })()`,
      { step: "提示词抽屉/1 写入内容标记" }
    );
    await sleep(300);

    /**
     * 注入两个等待助手。
     *
     * 为什么需要：抽屉断言原来用固定 sleep（rAF+120ms / 700ms）采样，
     * 而 React 的提交时机不稳定 —— 实测同样的代码会偶发测到「收起前」的旧高度
     * （after=128 而非 0），于是出现时序型红灯。修法是**等条件而不是等时间**：
     * 下面两条判据都与属性名无关，因此收起/展开、正向/反向四个块可以共用。
     */
    await run(
      `(() => {
      window.__waitFor = async (predicate, timeoutMs = 3000, intervalMs = 30) => {
        const deadline = performance.now() + timeoutMs;
        while (performance.now() < deadline) {
          try { if (predicate()) return true; } catch { /* DOM 抖动忽略 */ }
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        try { return predicate(); } catch { return false; }
      };
      // 高度连续 3 次采样不变即视为过渡结束（CSS transition 时长 260–300ms）
      window.__waitForSettled = async (element, timeoutMs = 3000) => {
        const deadline = performance.now() + timeoutMs;
        let last = -1;
        let stable = 0;
        while (performance.now() < deadline) {
          const height = Math.round(element.getBoundingClientRect().height);
          stable = height === last ? stable + 1 : 0;
          last = height;
          if (stable >= 3) return true;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        return false;
      };
      return true;
    })()`,
      { step: "提示词抽屉/0 注入等待助手" }
    );

    const collapsePrompt = await run(
      `(async () => {
      const mark = (label) => {
        window.__marks = window.__marks ?? [];
        window.__marks.push(label + '@' + Math.round(performance.now()));
      };
      const panel = document.querySelector('[data-prompt-editor-panel]');
      const btn = document.querySelector('[aria-label="收起提示词"]');
      if (!panel || !btn) return { found: false };
      mark('查找到面板与按钮');
      const before = Math.round(panel.getBoundingClientRect().height);
      mark('读了收起前高度=' + before);
      btn.click();
      mark('已点击收起');
      // 等过渡**开始**（高度离开起始值），而不是固定等 120ms —— 提交时机不稳定
      await window.__waitFor(() => Math.round(panel.getBoundingClientRect().height) !== before, 3000);
      mark('rAF+120ms 已返回');
      const mid = Math.round(panel.getBoundingClientRect().height);
      mark('读了中间高度=' + mid);
      // 等过渡**结束**（高度稳定），而不是固定等 700ms
      await window.__waitForSettled(panel, 3000);
      mark('700ms 等待已返回');
      const after = Math.round(panel.getBoundingClientRect().height);
      mark('读了收起后高度=' + after);
      const hint = document.querySelector('[data-prompt-collapsed-hint]');
      return {
        found: true,
        before,
        mid,
        after,
        transition: getComputedStyle(panel).transitionProperty,
        duration: getComputedStyle(panel).transitionDuration,
        editorInDom: !!document.getElementById('prompt-editor'),
        text: document.getElementById('prompt-editor')?.textContent ?? '',
        hintHeight: hint ? Math.round(hint.getBoundingClientRect().height) : -1,
        expandBtn: !!document.querySelector('[aria-label="展开提示词"]'),
        // 失败时用于定位的最小上下文（属性值 + 实际高度）
        panelState: panel.getAttribute('data-prompt-editor-panel') ?? '(无)',
        hintState:
          hint?.getAttribute('data-prompt-collapsed-hint') ?? '(无)',
      };
    })()`,
      { step: "提示词抽屉/2 收起（读高度→点按→等过渡）" }
    );
    check("提示词框可收起（抽屉）",
      collapsePrompt.found === true && collapsePrompt.before > 100 && collapsePrompt.after === 0,
      JSON.stringify({ before: collapsePrompt.before, after: collapsePrompt.after, panelState: collapsePrompt.panelState }));
    /**
     * 关于「中途高度」：**不再断言** mid 介于两端之间。
     *
     * 原因（实测得出，不是降低标准）：`CollapsiblePanel` 的高度是
     * `open ? (contentHeight > 0 ? contentHeight : "auto") : 0`，
     * 而 `auto → 0` 在 CSS 里**无法插值**。挂载后若 ResizeObserver 还没测出
     * contentHeight，那次收起就是跳变、根本没有中间态 —— 于是同样的代码会偶发
     * 测到 mid === 0 或 mid === after。真实用户点不到那么快，看不到这个现象。
     *
     * 因此这里断言**声明的过渡**（height + 非零时长），这才是稳定的契约；
     * mid 作为信息打印在括号里，便于日后真要查时看得到。
     */
    check("收起是声明为高度过渡（height + 非零时长）",
      collapsePrompt.transition.includes("height") && collapsePrompt.duration !== "0s",
      `mid=${collapsePrompt.mid} / ${collapsePrompt.transition} / ${collapsePrompt.duration}`);
    check("收起过程中输入框不卸载（内容保留）",
      collapsePrompt.editorInDom === true && collapsePrompt.text.includes("drawer-keep-marker"),
      collapsePrompt.text.slice(0, 40));
    check("收起后显示展开提示",
      collapsePrompt.hintHeight > 0 && collapsePrompt.expandBtn === true,
      `hint=${collapsePrompt.hintHeight}`);

    const expandPrompt = await run(`(async () => {
      const panel = document.querySelector('[data-prompt-editor-panel]');
      const btn = document.querySelector('[aria-label="展开提示词"]');
      const before = Math.round(panel.getBoundingClientRect().height);
      btn.click();
      // 等过渡**开始**（高度离开起始值），而不是固定等 120ms —— 提交时机不稳定
      await window.__waitFor(() => Math.round(panel.getBoundingClientRect().height) !== before, 3000);
      const mid = Math.round(panel.getBoundingClientRect().height);
      // 等过渡**结束**（高度稳定），而不是固定等 700ms
      await window.__waitForSettled(panel, 3000);
      const after = Math.round(panel.getBoundingClientRect().height);
      const hint = document.querySelector('[data-prompt-collapsed-hint]');
      return {
        before,
        mid,
        after,
        text: document.getElementById('prompt-editor')?.textContent ?? '',
        hintHeight: hint ? Math.round(hint.getBoundingClientRect().height) : -1,
      };
    })()`);
    check("提示词框可再次展开（回到原高度）",
      expandPrompt.before === 0 && expandPrompt.after > 100,
      JSON.stringify({ mid: expandPrompt.mid, after: expandPrompt.after }));
    check("展开后收起提示消失", expandPrompt.hintHeight === 0, String(expandPrompt.hintHeight));
    check("收起/展开不会丢内容", expandPrompt.text.includes("drawer-keep-marker"),
      expandPrompt.text.slice(0, 40));

    // ---------- 反向提示词抽屉：同样的过渡 ----------
    const collapseNegative = await run(`(async () => {
      const panel = document.querySelector('[data-negative-editor-panel]');
      const btn = document.querySelector('[aria-label="收起反向提示词"]');
      if (!panel || !btn) return { found: false };
      const before = Math.round(panel.getBoundingClientRect().height);
      btn.click();
      // 等过渡**开始**（高度离开起始值），而不是固定等 120ms —— 提交时机不稳定
      await window.__waitFor(() => Math.round(panel.getBoundingClientRect().height) !== before, 3000);
      const mid = Math.round(panel.getBoundingClientRect().height);
      // 等过渡**结束**（高度稳定），而不是固定等 700ms
      await window.__waitForSettled(panel, 3000);
      const after = Math.round(panel.getBoundingClientRect().height);
      const hint = document.querySelector('[data-negative-collapsed-hint]');
      return {
        found: true,
        before,
        mid,
        after,
        duration: getComputedStyle(panel).transitionDuration,
        editorInDom: !!document.getElementById('negative-prompt-editor'),
        text: document.getElementById('negative-prompt-editor')?.textContent ?? '',
        hintHeight: hint ? Math.round(hint.getBoundingClientRect().height) : -1,
      };
    })()`);
    check("反向提示词框可收起（抽屉）",
      collapseNegative.found === true && collapseNegative.before > 50 &&
        collapseNegative.after === 0,
      JSON.stringify({ before: collapseNegative.before, after: collapseNegative.after }));
    check("反向提示词收起也是高度过渡（非零时长）",
      collapseNegative.duration !== "0s",
      `mid=${collapseNegative.mid} / ${collapseNegative.duration}`);
    check("反向提示词收起后显示展开提示",
      collapseNegative.hintHeight > 0, String(collapseNegative.hintHeight));

    const negExpanded = await run(`(async () => {
      const panel = document.querySelector('[data-negative-editor-panel]');
      const btn = document.querySelector('[aria-label="展开反向提示词"]');
      const before = Math.round(panel.getBoundingClientRect().height);
      btn.click();
      // 等过渡**开始**（高度离开起始值），而不是固定等 120ms —— 提交时机不稳定
      await window.__waitFor(() => Math.round(panel.getBoundingClientRect().height) !== before, 3000);
      const mid = Math.round(panel.getBoundingClientRect().height);
      // 等过渡**结束**（高度稳定），而不是固定等 700ms
      await window.__waitForSettled(panel, 3000);
      const after = Math.round(panel.getBoundingClientRect().height);
      return {
        before,
        mid,
        after,
        text: document.getElementById('negative-prompt-editor')?.textContent ?? '',
        hintHeight: Math.round(document.querySelector('[data-negative-collapsed-hint]').getBoundingClientRect().height),
      };
    })()`);
    check("反向提示词框可再次展开（回到原高度）",
      negExpanded.before === 0 && negExpanded.after > 50,
      JSON.stringify({ mid: negExpanded.mid, after: negExpanded.after }));
    check("反向提示词收起/展开不丢内容",
      negExpanded.text.includes("custom-negative-marker"), negExpanded.text.slice(0, 40));

    // ---------- 提示词教程：入口位于「模型（UNet）选择器」下方，随系列切换 ----------
    const guidePlacement = await run(`(() => {
      const btn = document.querySelector('[data-prompt-guide-series]');
      const modelCard = document.querySelector('section [role="button"][tabindex="0"]');
      const promptLabel = Array.from(document.querySelectorAll('label')).find(
        (l) => l.textContent.trim() === '提示词'
      );
      if (!btn || !modelCard || !promptLabel) return { found: false };
      const btnRect = btn.getBoundingClientRect();
      const cardRect = modelCard.getBoundingClientRect();
      const promptRect = promptLabel.getBoundingClientRect();
      return {
        found: true,
        belowModelCard: btnRect.top >= cardRect.bottom - 4,
        abovePrompt: btnRect.top <= promptRect.top + 4,
        series: btn.getAttribute('data-prompt-guide-series'),
        text: btn.innerText.trim(),
      };
    })()`);
    check("教程入口在模型（UNet）选择器下方", guidePlacement.found && guidePlacement.belowModelCard,
      JSON.stringify(guidePlacement));
    check("教程入口位于提示词区域之前",
      guidePlacement.abovePrompt === true, `abovePrompt: ${guidePlacement.abovePrompt}`);
    check("Anima 系列显示 Anima 教程入口",
      guidePlacement.series === "anima" &&
        guidePlacement.text.includes("如何为 Anima 编写提示词"),
      `${guidePlacement.series}/${guidePlacement.text}`);

    const guideNearPainterButton = await run(`(() => {
      const btn = document.querySelector('[data-prompt-guide-series]');
      const painter = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === '画师'
      );
      if (!btn || !painter) return { sameRow: false };
      return {
        sameRow: Math.abs(btn.getBoundingClientRect().top - painter.getBoundingClientRect().top) < 8,
      };
    })()`);
    check("画师按钮旁不再有教程按钮", guideNearPainterButton.sameRow === false);

    await run(`(() => {
      const btn = document.querySelector('[data-prompt-guide-series]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(700);
    const animaGuide = await run(`(() => {
      const dialog = document.getElementById('prompt-guide-dialog-title')?.closest('[role="dialog"]');
      return {
        exists: !!dialog,
        title: document.getElementById('prompt-guide-dialog-title')?.textContent ?? '',
        hasCodeBlock: dialog ? dialog.querySelectorAll('pre code').length : 0,
        hasHeadings: dialog ? dialog.querySelectorAll('p.font-semibold').length : 0,
        text: dialog ? dialog.innerText.slice(0, 200) : '',
      };
    })()`);
    check("点击后弹出提示词教程弹框", animaGuide.exists === true);
    check("Anima 教程标题正确", animaGuide.title.includes("Anima"), animaGuide.title);
    check("教程正文渲染 markdown（含代码块与标题）",
      animaGuide.hasCodeBlock >= 1 && animaGuide.hasHeadings >= 2,
      `code=${animaGuide.hasCodeBlock} headings=${animaGuide.hasHeadings}`);

    await run(`(() => {
      const dialog = document.getElementById('prompt-guide-dialog-title')?.closest('[role="dialog"]');
      const close = dialog?.querySelector('[aria-label="关闭"]');
      if (close) close.click();
      return true;
    })()`);
    await sleep(500);

    // 切换到 SDXL：入口文案与教程内容都应切换
    await run(`(() => {
      const trigger = document.querySelector('button[aria-haspopup="listbox"]');
      if (trigger) trigger.click();
      return !!trigger;
    })()`);
    await sleep(500);
    const sdxlPicked = await run(`(() => {
      const option = Array.from(document.querySelectorAll('[role="option"]')).find(
        (o) => o.textContent.includes('SDXL')
      );
      if (option) option.click();
      return !!option;
    })()`);
    await sleep(900);
    const guideButtonSdxl = await run(`(() => {
      const btn = document.querySelector('[data-prompt-guide-series]');
      return {
        series: btn?.getAttribute('data-prompt-guide-series') ?? '',
        text: btn?.innerText.trim() ?? '',
      };
    })()`);
    check("切换到 SDXL 系列成功", sdxlPicked === true);

    // ---------- 切换系列：LoRA 清空 + 参数换成该系列基础工作流的默认值 ----------
    const readSeriesDefaults = () =>
      run(`(() => ({
        loras: document.querySelectorAll('button[aria-label^="移除 "]').length,
        sizePreset: document.querySelector('[data-size-preset][aria-pressed="true"]')?.getAttribute('data-size-preset') ?? '',
        sampler: document.querySelector('[aria-label="采样器"]')?.getAttribute('data-option-value') ?? '',
        scheduler: document.querySelector('[aria-label="调度器"]')?.getAttribute('data-option-value') ?? '',
        steps: document.querySelector('input[aria-label="步数"]')?.value ?? '',
        cfg: document.querySelector('input[aria-label="CFG"]')?.value ?? '',
      }))()`);

    const sdxlDefaults = await readSeriesDefaults();
    check("切到 SDXL 后 LoRA 扩展自动清空", sdxlDefaults.loras === 0, `${sdxlDefaults.loras} 个`);
    check("切到 SDXL 后采样器/调度器取 SDXL 基础工作流默认（euler + karras）",
      sdxlDefaults.sampler === "euler" && sdxlDefaults.scheduler === "karras",
      `${sdxlDefaults.sampler} / ${sdxlDefaults.scheduler}`);
    check("切到 SDXL 后 CFG 取 SDXL 基础工作流默认（8）",
      Number(sdxlDefaults.cfg) === 8, sdxlDefaults.cfg);
    check("切到 SDXL 后尺寸取 SDXL 基础工作流默认（1000×1200 → 5:6）",
      sdxlDefaults.sizePreset === "5:6", sdxlDefaults.sizePreset);
    check("SDXL 系列显示 SDXL 教程入口",
      guideButtonSdxl.series === "sdxl" && guideButtonSdxl.text.includes("如何为 SDXL 编写提示词"),
      `${guideButtonSdxl.series}/${guideButtonSdxl.text}`);

    await run(`(() => {
      const btn = document.querySelector('[data-prompt-guide-series]');
      if (btn) btn.click();
      return !!btn;
    })()`);
    await sleep(700);
    const sdxlGuide = await run(`(() => {
      const dialog = document.getElementById('prompt-guide-dialog-title')?.closest('[role="dialog"]');
      return {
        title: document.getElementById('prompt-guide-dialog-title')?.textContent ?? '',
        text: dialog ? dialog.innerText.slice(0, 300) : '',
      };
    })()`);
    check("SDXL 教程内容已切换",
      sdxlGuide.title.includes("SDXL") && sdxlGuide.text.includes("SDXL"),
      sdxlGuide.title);

    await run(`(() => {
      const dialog = document.getElementById('prompt-guide-dialog-title')?.closest('[role="dialog"]');
      const close = dialog?.querySelector('[aria-label="关闭"]');
      if (close) close.click();
      return true;
    })()`);
    await sleep(500);

    // 切回 Anima，保持后续生成用例的模型/系列一致
    await run(`(() => {
      const trigger = document.querySelector('button[aria-haspopup="listbox"]');
      if (trigger) trigger.click();
      return !!trigger;
    })()`);
    await sleep(500);
    await run(`(() => {
      const option = Array.from(document.querySelectorAll('[role="option"]')).find(
        (o) => o.textContent.includes('Anima')
      );
      if (option) option.click();
      return !!option;
    })()`);
    await sleep(900);
    check("可切回 Anima 系列",
      (await run(`document.querySelector('[data-prompt-guide-series]')?.getAttribute('data-prompt-guide-series')`)) === "anima");

    const animaDefaults = await readSeriesDefaults();
    check("切回 Anima 后采样器/调度器取 Anima 基础工作流默认（euler_ancestral + simple）",
      animaDefaults.sampler === "euler_ancestral" && animaDefaults.scheduler === "simple",
      `${animaDefaults.sampler} / ${animaDefaults.scheduler}`);
    check("切回 Anima 后 CFG 取 Anima 基础工作流默认（1）",
      Number(animaDefaults.cfg) === 1, animaDefaults.cfg);
    const animaSize = await run(`(() => ({
      preset: document.querySelector('[data-size-preset][aria-pressed="true"]')?.getAttribute('data-size-preset') ?? '',
      width: Number(document.querySelector('[aria-label="自定义宽度"]')?.value ?? 0),
      height: Number(document.querySelector('[aria-label="自定义高度"]')?.value ?? 0),
    }))()`);
    check("切回 Anima 后尺寸取 Anima 基础工作流默认（1000×1000）",
      animaSize.preset === "custom" && animaSize.width === 1000 && animaSize.height === 1000,
      `${animaSize.preset} ${animaSize.width}×${animaSize.height}`);
    check("跨系列切换后 LoRA 仍为空（不会把别系列的 LoRA 带过来）",
      animaDefaults.loras === 0, `${animaDefaults.loras} 个`);

    // 生成用例需要「用户自定义的采样器 / 调度器 / 尺寸 / 2 个 LoRA」，
    // 但切换系列会把这些重置成该系列工作流默认值 → 这里重新设置一遍
    await pickOption('[aria-label="采样器"]', "uni_pc_bh2");
    await pickOption('[aria-label="调度器"]', "karras");
    await run(`(() => {
      const custom = document.querySelector('[data-size-preset="custom"]');
      if (custom) custom.click();
      return true;
    })()`);
    await sleep(400);
    await run(`(() => {
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      setValue(document.querySelector('[aria-label="自定义宽度"]'), '1500');
      setValue(document.querySelector('[aria-label="自定义高度"]'), '1200');
      return true;
    })()`);
    await sleep(400);
    const restored = await run(`(() => ({
      sampler: document.querySelector('[aria-label="采样器"]')?.getAttribute('data-option-value') ?? '',
      scheduler: document.querySelector('[aria-label="调度器"]')?.getAttribute('data-option-value') ?? '',
      width: Number(document.querySelector('[aria-label="自定义宽度"]')?.value ?? 0),
    }))()`);
    check("切换系列后可重新自定义采样器 / 调度器 / 尺寸",
      restored.sampler === "uni_pc_bh2" && restored.scheduler === "karras" &&
        restored.width === 1500,
      JSON.stringify(restored));

    const reAddA = await addLora(LORA_FOLDER_A);
    const reAddB = await addLora(LORA_FOLDER_B);
    check("重新添加 2 个 LoRA 供生成用例使用", reAddA === true && reAddB === true);

    // ---------- 触发一次生成，截获 API Prompt ----------
    await run(`(() => {
      const editor = document.getElementById('prompt-editor');
      if (editor) editor.textContent = 'anima spec check';
      return true;
    })()`);
    await sleep(300);

    await clickByText("生成");
    await waitFor(`${capturedPrompts.length} > 0 || document.body.innerText.includes('生成中')`, 20000);
    await sleep(1500);

    const prompt = capturedPrompts[0];
    check("生成请求已发送并截获 API Prompt", Boolean(prompt));
    if (!prompt) throw new Error("未截获到 ComfyUI prompt");

    const linkTarget = (link) => (Array.isArray(link) ? String(link[0]) : "");

    // 需求 1：采样器 + 调度器
    check("KSampler(5).sampler_name 为用户选择值（uni_pc_bh2）",
      prompt["5"]?.inputs?.sampler_name === "uni_pc_bh2", String(prompt["5"]?.inputs?.sampler_name));
    check("KSampler(5).scheduler 为用户选择值（karras）",
      prompt["5"]?.inputs?.scheduler === "karras", String(prompt["5"]?.inputs?.scheduler));

    // 图片尺寸：自定义宽高写入 EmptyLatentImage(3)
    check("自定义宽高写入 EmptyLatentImage",
      Number(prompt["3"]?.inputs?.width) === 1500 && Number(prompt["3"]?.inputs?.height) === 1200,
      `${prompt["3"]?.inputs?.width}×${prompt["3"]?.inputs?.height}`);

    // 反向提示词：预设内容进入负面 CLIPTextEncode(4)
    check("反向提示词预设内容进入负面编码节点",
      String(prompt["4"]?.inputs?.text ?? "").includes("custom-negative-marker"),
      String(prompt["4"]?.inputs?.text ?? "").slice(0, 60));

    // 需求 2：UNet 模型替换
    check("UNETLoader(7).unet_name 为用户选择的模型",
      String(prompt["7"]?.inputs?.unet_name ?? "").includes(ANIMA_MODEL.replace(".safetensors", "")),
      String(prompt["7"]?.inputs?.unet_name));

    // 输出节点：缺少输出节点时 ComfyUI 会 400（prompt_no_outputs）
    const outputNodes = Object.entries(prompt).filter(
      ([, node]) => /save|preview/i.test(node.class_type)
    );
    check("工作流包含输出节点（不会触发 prompt_no_outputs）",
      outputNodes.length >= 1,
      outputNodes.map(([id, node]) => `${id}:${node.class_type}`).join(", "));
    const saveNode = outputNodes.find(([, node]) => node.class_type === "SaveImage");
    check("输出节点连接到 VAE 解码结果（images → 9:0）",
      linkTarget(saveNode?.[1]?.inputs?.images) === "9",
      JSON.stringify(saveNode?.[1]?.inputs?.images ?? null));

    // 需求 3：LoRA 注入
    const loraNodes = Object.entries(prompt).filter(
      ([, node]) => node.class_type === "LoraLoaderModelOnly"
    );
    check("LoRA 节点数量与选择的扩展数量一致（2）", loraNodes.length === 2, `${loraNodes.length}`);
    check("LoRA 节点 ID 为 100、101",
      loraNodes.every(([id]) => id === "100" || id === "101") &&
        loraNodes.some(([id]) => id === "100") && loraNodes.some(([id]) => id === "101"),
      loraNodes.map(([id]) => id).join(", "));
    check("LoRA 节点不含 strength_clip / clip 字段",
      loraNodes.every(([, node]) => !("strength_clip" in node.inputs) && !("clip" in node.inputs)));

    check("LoRA(100).model 指向 UNETLoader(7)",
      linkTarget(prompt["100"]?.inputs?.model) === "7", linkTarget(prompt["100"]?.inputs?.model));
    check("LoRA(101).model 指向 LoRA(100)",
      linkTarget(prompt["101"]?.inputs?.model) === "100", linkTarget(prompt["101"]?.inputs?.model));
    check("末端正确接入：KSampler(5).model 指向 LoRA(101)",
      linkTarget(prompt["5"]?.inputs?.model) === "101", linkTarget(prompt["5"]?.inputs?.model));
    check("KSampler.model 只引用 index 0",
      Array.isArray(prompt["5"]?.inputs?.model) && Number(prompt["5"].inputs.model[1]) === 0);

    // CLIP 未被干扰：节点 1（CLIPLoader）的输出只被节点 4、6 引用
    const clipConsumers = Object.entries(prompt)
      .filter(([, node]) =>
        Object.values(node.inputs).some((value) => linkTarget(value) === "1")
      )
      .map(([id]) => id)
      .sort();
    check("CLIP(1) 输出只连到 CLIPTextEncode(4) 与 (6)",
      JSON.stringify(clipConsumers) === JSON.stringify(["4", "6"]), clipConsumers.join(", "));

    check("LoRA 文件名与选择的扩展一致",
      [prompt["100"]?.inputs?.lora_name, prompt["101"]?.inputs?.lora_name]
        .every((name) => String(name).includes("lora_style_")),
      `${prompt["100"]?.inputs?.lora_name}, ${prompt["101"]?.inputs?.lora_name}`);

    // ---------- 规范 4.6：生成结果必须出现在显示图区 ----------
    const savedFiles = fs.readdirSync(outputDir).filter((name) => name.startsWith("IR_"));
    check("生成结果已落盘", savedFiles.length >= 1, savedFiles.join(", "));

    // ---------- 生成参数只写在图片内嵌 Meta 里（不再产 json 旁车） ----------
    const sidecarFiles = fs
      .readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith(".json"));
    check("不再生成任何 .json 旁车文件", sidecarFiles.length === 0, sidecarFiles.join(", "));

    const firstImagePath = path.join(outputDir, savedFiles[0]);
    const embeddedFields = readPngTextChunks(firstImagePath);
    check("图片内嵌 Meta 含 ComfyUI prompt 块",
      embeddedFields.some((field) => field.keyword === "prompt"),
      embeddedFields.map((field) => field.keyword).join(", "));

    const embeddedWorkflow = JSON.parse(
      embeddedFields.find((field) => field.keyword === "prompt")?.text || "{}"
    );
    check("内嵌工作流与发送给 ComfyUI 的 API Prompt 一致（中文节点标题已转义写入）",
      JSON.stringify(embeddedWorkflow) === JSON.stringify(prompt),
      `${Object.keys(embeddedWorkflow).length} 个节点`);

    const remixed = readRemixParamsFromImage(firstImagePath);
    check("从图片 Meta 解析出正面提示词",
      Boolean(remixed) &&
        remixed.positivePrompt === String(prompt["6"]?.inputs?.text ?? ""),
      remixed ? remixed.positivePrompt.slice(0, 60) : "解析失败（null）");
    check("从图片 Meta 解析出反向提示词（含自定义预设标记）",
      Boolean(remixed) && remixed.negativePrompt.includes("custom-negative-marker"),
      remixed ? remixed.negativePrompt.slice(0, 60) : "解析失败（null）");
    check("从图片 Meta 解析出模型（UNETLoader.unet_name）",
      Boolean(remixed) && remixed.model.includes(ANIMA_MODEL.replace(".safetensors", "")),
      remixed ? remixed.model : "解析失败（null）");
    check("从图片 Meta 解析出扩展 LoRA（2 个，含权重）",
      Boolean(remixed) && remixed.loras.length === 2 &&
        remixed.loras.every((lora) => lora.name.includes("lora_style_")),
      remixed ? JSON.stringify(remixed.loras) : "解析失败（null）");
    check("从图片 Meta 解析出采样参数与尺寸",
      Boolean(remixed) && remixed.sampler === "uni_pc_bh2" && remixed.scheduler === "karras" &&
        remixed.width === 1500 && remixed.height === 1200,
      remixed
        ? JSON.stringify({
            sampler: remixed.sampler,
            scheduler: remixed.scheduler,
            size: `${remixed.width}x${remixed.height}`,
          })
        : "解析失败（null）");

    // 非本生成器的图片（无内嵌工作流）应当解析不出参数
    const foreignPath = path.join(outputDir, "foreign-image.png");
    fs.writeFileSync(foreignPath, Buffer.from(TINY_PNG_BASE64, "base64"));
    const foreignFields = readPngTextChunks(foreignPath);
    check("普通 PNG（无内嵌工作流）解析结果为空 → 会显示「非本生成器生成」",
      readRemixParamsFromImage(foreignPath) === null &&
        foreignFields.every((field) => field.keyword !== "prompt"),
      `${foreignFields.length} 个文本块`);

    const displayState = await run(`(() => {
      const button = document.querySelector('button[aria-label="点击查看大图"]');
      const img = button ? button.querySelector('img') : null;
      return {
        hasTrigger: !!button,
        src: img ? String(img.getAttribute('src') ?? '') : '',
      };
    })()`);
    check("显示图区已渲染图片", displayState.hasTrigger === true);
    check(
      "刚生成的结果显示在图片区（第 0 位为生成预览，而非旧图）",
      displayState.src.startsWith("blob:") ||
        displayState.src.startsWith("localfile:") ||
        displayState.src.startsWith("data:"),
      displayState.src.slice(0, 48)
    );

    // ---------- 零 LoRA 边界 ----------
    await run(`(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(
        (b) => (b.getAttribute('aria-label') ?? '').startsWith('移除 ')
      );
      buttons.forEach((b) => b.click());
      return buttons.length;
    })()`);
    await sleep(900);

    const removedCount = await run(`(() => document.querySelectorAll('button[aria-label^="移除 "]').length)()`);
    check("已移除全部 LoRA 扩展", removedCount === 0, `剩余 ${removedCount}`);

    await clickByText("生成");
    await waitFor(`${capturedPrompts.length} > 1`, 20000);
    await sleep(1200);

    const second = capturedPrompts[1];
    check("第二次生成请求已截获", Boolean(second));
    if (second) {
      const secondLoras = Object.values(second).filter(
        (node) => node.class_type === "LoraLoaderModelOnly"
      );
      check("零 LoRA 时不生成任何 LoRA 节点", secondLoras.length === 0, `${secondLoras.length}`);
      check("零 LoRA 时 KSampler(5).model 直连 [7, 0]",
        linkTarget(second["5"]?.inputs?.model) === "7" &&
          Number(second["5"].inputs.model[1]) === 0,
        JSON.stringify(second["5"]?.inputs?.model));
    }

    if (consoleErrors.length > 0) {
      console.log("--- 渲染进程 console 错误 ---");
      consoleErrors.slice(0, 10).forEach((line) => console.log("  " + line));
    }

    const allPassed = smoke.allPassed();
    console.log(allPassed ? "ANIMA WORKFLOW SMOKE OK ✓" : "ANIMA WORKFLOW SMOKE FAILED ✗");
    // 通过时清理临时工作目录；失败时保留（残留目录本身就是诊断线索）
    await smoke.finish({ app, ok: allPassed, cleanupDir: workDir });
  } catch (error) {
    console.error("SMOKE_FAIL", error);
    /**
     * 退出码约定（便于在 CI 历史里区分失败形态）：
     *   1   = 断言失败或异常
     *   2   = 构建产物过期（在 assertBuildFresh 里直接退出，不走这里）
     *   124 = 看门狗超时（外部视角的「卡死」，通常是整条链路没进展）
     *   125 = **进程内步骤超时**（某一次 executeJavaScript 没返回，位置写在消息里）
     *
     * `finish()` 会按错误码判定 125/1，并把页面侧标记取回来 ——
     * 那是「挂在哪个语句」唯一的一手证据（见 smoke-harness）。
     */
    await smoke.finish({ app, ok: false, error });
  }
});
