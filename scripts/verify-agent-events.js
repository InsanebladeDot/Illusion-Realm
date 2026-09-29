/**
 * Agent 事件流的**无 token 端到端自检**（纯 Node，不需要 Electron）。
 *
 * 它走的是主进程真正用的那条链路：`apps/electron/agent/runner.js` →
 * spawn Python sidecar（`apps/agent`，用 `fakeLlm` 假模型）→ 逐行解析 NDJSON。
 * 因此这条自检同时覆盖了「Python 侧事件契约」「主进程转发」「取消语义」三件事，
 * 而**不花一分钱**（假模型不调网络）。
 *
 * 运行：
 *   node scripts/verify-agent-events.js
 *   ILLUSION_AGENT_PYTHON="D:/Code/LLM/.venv/Scripts/python.exe" node scripts/verify-agent-events.js
 *
 * 退出码（与仓库冒烟一致）：
 *   0 通过 / 1 断言失败 / 2 环境问题（找不到可用的 Python 运行时或依赖缺失）
 *
 * 为什么没并进 `pnpm check`：它依赖本机有可用的 Python 解释器与 `mcp`/`openai` 依赖，
 * 而这些属于环境前提（退出码 2），不适合塞进「代码门禁」里天天喊红。
 * 等 `apps/agent/.venv` 随包分发的方式定下来（见 docs/agent-integration.md），再决定接不接。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const { startAgentRun, cancelAgentRun } = require("../apps/electron/agent/runner");
const { settleHostCall } = require("../apps/electron/agent/host-tools");
const { IPC_CHANNELS } = require("../apps/electron/ipcChannels");

const AGENT_DIR = path.join(__dirname, "..", "apps", "agent");
const RESULTS = [];

function check(name, ok, detail = "") {
  RESULTS.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 假 sender：主进程那边是 `event.sender`，这里只要有个 `send` 就能顶替 */
function createCollector() {
  const events = [];
  return {
    events,
    sender: {
      send: (channel, payload) => {
        events.push({ channel, payload });
      },
    },
  };
}

/** 模拟渲染层完成生图：文字回模型，图片路径走单独的 UI 事件。 */
function createImageHostCollector(imagePath) {
  const collector = createCollector();
  const send = collector.sender.send;
  collector.sender.send = (channel, payload) => {
    send(channel, payload);
    if (channel !== IPC_CHANNELS.AGENT_HOST_CALL) return;
    queueMicrotask(() =>
      settleHostCall({
        callId: payload.callId,
        ok: true,
        result: `已生成 1 张图片，保存路径：${imagePath}`,
        images: [imagePath],
      })
    );
  };
  return collector;
}

async function waitForFinal(events, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (events.some((item) => item.payload.type === "final")) return true;
    if (events.some((item) => item.payload.type === "error")) return true;
    await sleep(100);
  }
  return false;
}

function isEnvironmentProblem(events) {
  const text = JSON.stringify(events);
  return (
    text.includes("No module named") ||
    text.includes("启动失败") ||
    text.includes("不是内部或外部命令")
  );
}

async function main() {
  const collector = createCollector();
  const result = startAgentRun({
    sender: collector.sender,
    options: {
      question: "帮我算 (26+18)*3-7 等于多少？",
      history: [],
      config: { fakeLlm: true, allowedRoots: [AGENT_DIR], maxSteps: 4 },
    },
  });

  if (!result.ok) {
    console.error(`\n[环境] 启动 Agent 失败：${result.error}`);
    process.exit(2);
  }
  console.log(`runId=${result.runId}`);

  const settled = await waitForFinal(collector.events);
  if (!settled) {
    console.error("\n[环境/超时] 30 秒内没有收到 final/error 帧");
    process.exit(2);
  }
  if (isEnvironmentProblem(collector.events)) {
    console.error(
      "\n[环境] Python 运行时不可用或缺少依赖（需要 mcp / openai）。\n" +
        "提示：ILLUSION_AGENT_PYTHON=<解释器路径> node scripts/verify-agent-events.js\n" +
        "或先在 apps/agent 下 `python -m venv .venv && .venv/Scripts/python -m pip install -e .`"
    );
    process.exit(2);
  }

  const events = collector.events.map((item) => item.payload);
  const types = events.map((event) => event.type);

  /**
   * 断言「阶段序列」而不是逐帧相等：`answer_delta` 本来就是**逐字多帧**，
   * 把重复帧折叠掉才是在断言契约本身（顺序与阶段齐全）。
   */
  const phases = types.filter((type, index) => type !== "answer_delta" || types[index - 1] !== "answer_delta");
  check(
    "阶段序列：tools → step → reasoning_delta → tool_call → tool_result → step → answer_delta → final",
    phases.join(",") === "tools,step,reasoning_delta,tool_call,tool_result,step,answer_delta,final",
    phases.join(",")
  );

  const answerDeltas = events
    .filter((event) => event.type === "answer_delta")
    .map((event) => event.text)
    .join("");
  const final = events.find((event) => event.type === "final");
  check(
    "answer_delta 拼起来等于 final.text",
    Boolean(final) && answerDeltas === final.text,
    `delta=${answerDeltas.slice(0, 40)} | final=${(final && final.text || "").slice(0, 40)}`
  );

  const toolResult = events.find((event) => event.type === "tool_result");
  check(
    "工具真的被 MCP 执行了（calculate 返回 125）",
    Boolean(toolResult) && String(toolResult.output).includes("= 125"),
    toolResult ? toolResult.output : "没有 tool_result"
  );

  check(
    "每帧都带 runId（多窗口 / 多次运行可区分）",
    collector.events.every((item) => item.payload.runId === result.runId),
    `${collector.events.length} 帧`
  );

  // ---- 取消语义：给假模型加延迟，才有窗口可观测 ----
  const slow = createCollector();
  const slowRun = startAgentRun({
    sender: slow.sender,
    options: {
      question: "帮我算 1+1",
      history: [],
      config: { fakeLlm: true, fakeDelayMs: 60, allowedRoots: [AGENT_DIR], maxSteps: 4 },
    },
  });
  if (!slowRun.ok) {
    check("取消：第二次运行能启动", false, slowRun.error);
  } else {
    // 等到真的开始流式输出再取消：否则可能取消在一个已经跑完的 run 上，
    // 断言会变成「时快时慢」的假红（这类抖动在本仓库已经被坑过）
    const streamDeadline = Date.now() + 10000;
    while (
      Date.now() < streamDeadline &&
      !slow.events.some((item) => item.payload.type === "answer_delta")
    ) {
      await sleep(50);
    }
    const before = slow.events.length;
    const cancelled = cancelAgentRun(slowRun.runId);
    await sleep(900);
    const afterSettle = slow.events.length;
    await sleep(1200);
    const after = slow.events.length;
    check(
      "取消：cancelAgentRun 命中在跑的运行，且事件流在 1.2 秒内停止",
      cancelled === true && afterSettle >= before && after === afterSettle,
      `cancel=${cancelled} 取消时 ${before} 帧 / 稳定后 ${afterSettle} 帧 / 再等 1.2s 仍 ${after} 帧`
    );
    check("取消：再用同一 runId 取消返回 false（已回收）", cancelAgentRun(slowRun.runId) === false);
  }

  // ---- 宿主工具（list_local_models）：真扫目录，结果经宿主桥回传 ----
  /**
   * 这一段验证的是**跨进程 + 跨语言**的那条链：
   *   Python 侧发起 host_request → 主进程 runner 在本进程执行（用应用同一个扫描器）
   *   → 回写 host_response → Python 侧把结果回填给模型 → final。
   * 目录与用户数据都是现造的，所以断言不依赖这台机器上真有模型。
   */
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-host-"));
  const checkpointDir = path.join(hostRoot, "checkpoints");
  const loraDir = path.join(hostRoot, "loras");
  fs.mkdirSync(path.join(loraDir, "Anima"), { recursive: true });
  fs.mkdirSync(checkpointDir, { recursive: true });
  fs.writeFileSync(path.join(checkpointDir, "anima_aestheticV11.safetensors"), Buffer.alloc(4096));
  fs.writeFileSync(path.join(loraDir, "Anima", "some-lora-v2.safetensors"), Buffer.alloc(1024));
  const hostUserData = path.join(hostRoot, "user.json");
  fs.writeFileSync(
    hostUserData,
    JSON.stringify({
      version: 1,
      settings: {
        paths: {
          searchPath: "",
          checkpointPath: checkpointDir,
          lorasPath: loraDir,
          diffusionModelsPath: "",
        },
      },
    })
  );
  process.env.ILLUSION_AGENT_USER_DATA = hostUserData;

  const hostRun = createCollector();
  const hostResult = startAgentRun({
    sender: hostRun.sender,
    options: {
      question: "我本地有哪些 LoRA 模型？",
      history: [],
      config: { fakeLlm: true, maxSteps: 4 },
    },
  });

  if (!hostResult.ok) {
    check("宿主工具：运行能启动", false, hostResult.error);
  } else {
    await waitForFinal(hostRun.events);
    // 工具是**异步**执行的（等 sidecar 发 host_request），所以环境变量要等运行结束再清
    delete process.env.ILLUSION_AGENT_USER_DATA;
    const hostEvents = hostRun.events.map((item) => item.payload);
    const hostCall = hostEvents.find((event) => event.type === "tool_call");
    const hostToolResult = hostEvents.find((event) => event.type === "tool_result");
    const hostFinal = hostEvents.find((event) => event.type === "final");

    check(
      "宿主工具：模型能看到并调用 list_local_models（kind=lora 透传）",
      Boolean(hostCall) &&
        hostCall.name === "list_local_models" &&
        hostCall.arguments &&
        hostCall.arguments.kind === "lora",
      hostCall ? JSON.stringify(hostCall.arguments) : "没有 tool_call"
    );
    check(
      "宿主工具：真扫到了现造的 LoRA 文件（跨进程回传成功）",
      Boolean(hostToolResult) &&
        String(hostToolResult.output).includes("some-lora-v2") &&
        String(hostToolResult.output).includes("Anima/"),
      hostToolResult ? String(hostToolResult.output).slice(0, 120) : "没有 tool_result"
    );
    check(
      "宿主工具：结果进入最终回答，且没把 Checkpoint 混进来（kind 过滤生效）",
      Boolean(hostFinal) &&
        hostFinal.text.includes("some-lora-v2") &&
        !hostFinal.text.includes("anima_aestheticV11"),
      hostFinal ? hostFinal.text.slice(0, 120) : "没有 final"
    );
  }

  // ---- 生图产物：模型文本与 UI 图片路径分流 ----
  const fakeImagePath = path.join(hostRoot, "generated", "agent-test.png");
  const imageRun = createImageHostCollector(fakeImagePath);
  const imageResult = startAgentRun({
    sender: imageRun.sender,
    options: {
      question: "请生成图片",
      history: [],
      config: { fakeLlm: true, maxSteps: 4 },
    },
  });
  if (!imageResult.ok) {
    check("生图产物：运行能启动", false, imageResult.error);
  } else {
    await waitForFinal(imageRun.events);
    const imageEvents = imageRun.events.map((item) => item.payload);
    const artifact = imageEvents.find((event) => event.type === "tool_artifacts");
    const resultEvent = imageEvents.find((event) => event.type === "tool_result");
    check(
      "生图产物：图片路径通过 tool_artifacts 单独推给界面",
      Boolean(artifact) && artifact.name === "generate_image" &&
        artifact.images?.[0] === fakeImagePath,
      artifact ? JSON.stringify(artifact) : "没有 tool_artifacts"
    );
    check(
      "生图产物：模型仍收到文字工具结果（不混入结构化字段）",
      Boolean(resultEvent) && resultEvent.output.includes(fakeImagePath),
      resultEvent ? resultEvent.output : "没有 tool_result"
    );
  }

  const failed = RESULTS.filter((item) => !item.ok);
  console.log(`\n${failed.length === 0 ? "AGENT EVENTS OK ✓" : "AGENT EVENTS FAILED ✗"}  ${RESULTS.length - failed.length}/${RESULTS.length}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("SMOKE_FAIL", error);
  process.exit(1);
});
