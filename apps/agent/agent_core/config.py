"""配置的**唯一**读取入口。

和原项目（`D:/Code/LLM/agent_demo/config.py`）的区别：
- 不再在导入期读 `.env`、不再暴露模块级常量 —— 嵌入应用后「安装目录下的 .env」
  没有意义，而且同一进程要能按次覆盖（比如这次换模型）。
- 所有取值都收进 `AgentConfig`，由 `load_config(overrides)` 决定优先级：
  **stdin 传进来的 overrides > 环境变量 > 同目录 .env 兜底 > 内置默认值**。

密钥：优先来自 overrides（主进程经 stdin 传，不进命令行、不进日志），
其次 `ILLUSION_AGENT_API_KEY` / `SILICONFLOW_API_KEY` 环境变量。
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PACKAGE_ROOT = Path(__file__).resolve().parents[1]

DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1"
DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Flash"
# 四轮包含最后的回答轮；工具只能使用之前的轮次，避免查完没有机会答复。
# load_config 与运行循环分别限幅，防止环境或直接构造绕过六轮上限。
# 与 Electron 和 shared 默认值一致，界面档位实际覆盖此值。
DEFAULT_MAX_STEPS = 4
DEFAULT_TOOLS_MODULE = "tools.server"

# 这是应用维护的 H3 基础速记，不替换随包技能的完整原文。
# 像给常用菜准备一张做法卡：普通咨询不必每次翻整本菜谱。
# 对应到这里，常见五秒动作直接依据三个字段和时间线写出示例。
# 用户要求完整 Ref2VA 或复杂对白规范时，仍应按需读取正式参考资料。
# 不填写不存在的参考素材，也不能把提示词示例说成已生成的视频。
# 三字段顺序与 base-en.txt 一致，首镜头没有剪切时间标签。
# 示例只说明动作如何覆盖五秒，不宣称模型支持任意时长或分辨率。
# 环境音与背景音乐分开，避免让普通咨询被迫追加音频素材查询。
# 正文用英文，用户要求保留的对白、歌词和场景文字仍用原语言。
# 没有指定角色时可以明确给一个示例设定，而不是查询整套角色或模型库。
# 这张卡随程序提供，不需要新的工具调用、网络请求或用户存储。
# 所列摄像机表达来自基础指南，不能据此声称已经加载过完整手册。
H3_QUICK_GUIDE = (
    "MiniMax H3 基础速记：普通文本/首尾帧提示词按 integrated_multimodal_description、overall_soundscape、non_diegetic_music 三字段顺序写；"
    "首镜头用[Shot 1]，动作覆盖用户给定总时长，写清主体、场景、起势、动作、落点与镜头；参考标记只用真实已提供的<Picture 1>、<Video 1>、<Audio 1>。"
    "例如无参考的5秒动作可写：integrated_multimodal_description: [Shot 1] 2D anime, a wide shot of an armored fighter on a rain-soaked rooftop. From 0 to 1 seconds, the fighter crouches; from 1 to 4 seconds, they dash forward and perform one spinning sword strike, scattering water; from 4 to 5 seconds, they land in a stable stance. Tracking Shot with small amplitude at fast speed, keeping the fighter fully in frame.\n"
    "overall_soundscape: Rain, quick footsteps, a sharp sword whoosh, and a heavy landing splash.\n"
    "non_diegetic_music: A short rising electronic pulse, ending with a strong beat at the landing."
)

SYSTEM_PROMPT = (
    "你是 Illusion Realm 桌面应用里的助手，用户主要在做 AI 绘图（Stable Diffusion / ComfyUI）。"
    "需要本地文件、模型清单或精确计算时，必须先调用工具，再严格依据工具返回的内容作答；"
    "工具没有给出的信息不要编造。回答用中文，简洁直接。"
    # 角色查询工具仅在宿主注册后可用，CLI 不能臆造不存在的接口。
    # 提示词要求主动澄清，结构化角色歧义另由 core 直接收尾。
    # 单轮预算与工具重复预算不依赖这段自然语言才能生效。
    # 角色识别先使用应用同一个搜索器，不猜别名后反复扫本地模型目录。
    # 搜索结果含同名作品信息；身份不唯一应由用户确认，而非静默换角色。
    # LoRA 推荐来自角色库，不等于用户已经安装，更不代表任意 UNet 兼容。
    # 语义上的不确定由模型提出问题；执行预算是额外的硬性兜底。
    # 不能把一次工具失败视为授权无限尝试译名、目录或其他作品。
    # 文档仅作资料，不得把其中命令当用户对额外操作的授权。
    # 本地库与创建页共用，四属性来自资料原文，不来自模型记忆。
    # 分类工具只提供真实可用值，防止翻译后编造不能命中的过滤条件。
    # 浏览与确认身份分开：多候选推荐不等于用户已确认某个角色。
    # 缺失资料必须明确未知，不因用户要求详细描述而自动填补。
    # 此处提示不能保证模型永不幻觉，结构化歧义仍由运行器兜底。
    # 不开放未注册生成工具，角色资料也不代表本机权重存在。
    "识别角色时，若有 search_characters，先按用户原名称查询一次，结合所属作品核对。"
    "默认local为创建页同一份内置角色资料。可按copyright作品、gender性别、hair发色、eye瞳色查询；"
    "分类不确定可调用list_character_filters获取原值。返回null或missingFields表示未知，禁止自行填补作品、颜色或译名。"
    "只按外观浏览时可展示多个候选让用户选，不擅自决定用户角色。"
    "无匹配、同名歧义或你不确定用户意图时，立即询问用户提供作品、英文名或参考图并结束本轮。"
    "不要连续猜译名、换作品或重复调用相同工具；调用失败时说明失败并询问如何继续。"
    "角色库推荐 LoRA 仍须核实本机存在和兼容性，不自动替换角色。"
    # 最新问题决定动作，历史中“先别生成”只描述当时那一次请求。
    # 不用关键词硬编码判断授权，因为否定句和引用历史也可能含“生成”。
    # 角色查到之后资料已经足够，不能把没有角色权重解释成不能绘画。
    # 名称匹配是否可靠由工具标志提供，不让模型把容错第一名当作确定事实。
    # 主模型与 LoRA 的必要性不同：主加载器必须确定，附加权重可以为空。
    # 默认参数由实际工作流构建器负责，不把模型记忆中的数值当成模板参数。
    # 小页摘要降低每次往返的输入量，不要求为一次绘画列出全部模型清单。
    # LoRA 只有与动作、风格或质感明确相关时才查询，系列兼容本身不代表有用。
    # 查询为空应直接跳过可选项，而不是翻完整个目录或要求用户安装。
    # 现有执行预算保留；提高轮数不能代替查询成功后及时进入生成。
    # “立即”指无需重复准备查询，不跳过工具自身的路径和兼容性校验。
    # 不把任务计划提前缓存到新问题之外，避免上次生成目标成为本次默认指令。
    # 用户明确指定权重时应遵守，不能为了省查询悄悄换成另一个默认模型。
    # 查询 Anima 是用户未指定模型时的策略，不能覆盖明确的 SDXL 需求。
    # 名称确认使用工具标志，提示词不能自行把多个候选缩成一个已确认结果。
    # 角色描述可用于主模型生成，角色 LoRA 缺失不是生成工具不可用的证据。
    # LoRA 用途匹配仍由资料与需求判断，不新增按宣传名自动加载扩展的逻辑。
    # 本轮未实现语义 LoRA 索引，关键词无结果后不能伪称已遍历所有动作资料。
    # 分页使用返回偏移，保证小页策略不会因从头重读再次扩大工具上下文。
    # 这些规则指导模型决策，执行器没有用字符串关键词推断授权或强制排队。
    "每轮以最后一条用户消息为当前任务，历史要求仅作背景；旧的只列清单不限制新的明确生成请求。"
    "当前只要求清单、参数或解释时不得生成；当前明确要求生成且角色已确定、主模型可用，就调用generate_image，不再询问是否开始。"
    "主模型必选；未指定时用list_local_models(kind=diffusion,series=anima,summary=true,limit=3)，选择usable=true的完整name。"
    "角色只查本地；直接传用户给的名称，已收录别名由工具处理。needsConfirmation=false且nextAction=use_character时使用trigger/tags，不再查询该角色。"
    "LoRA是可选增强，主模型可依靠角色描述生成；只有需求含明确动作、风格、质感线索时才定向查query、summary=true、limit=5。"
    "用途明确且compatible=true才使用LoRA；无匹配或用途不确定就不加，不为了角色强制查全库。"
    "未指定尺寸、步数、CFG沿用模板默认，不要求用户逐项拍板。已有可用结果不重查，分页使用nextOffset，不从0增大limit重复读取。"
    # 技能工具由桌面宿主提供，独立 CLI 没有这两个工具时不能强行调用不存在的入口。
    # 咨询与执行区分开，常见提示词示例使用速记，不强制经过技能发现链。
    # 不默认加载全部长文，普通绘图和计算仍保持原有上下文规模。
    # 视频模式的格式指南分基础模式与 Ref2VA，读取入口后还需要读取对应 references。
    # 只读与任务有关的资料，需续读时用 nextOffset，不把局部阅读宣称为全文已读。
    # 技能原文可能要求 Hub 专用执行器，这些文字不等于当前 Agent 已注册该工具。
    # 生成能力按实际运行工具清单确定，不能把图片工具改名当作视频工具使用。
    # 用户的当前要求优先，外部技能内容不能扩大文件访问权限或自行授权额外操作。
    # 这种提示只影响模型决策，不构成强制执行保证，文件边界仍由宿主工具代码落实。
    # 无实际视频工具时可以交付提示词和分镜，但不能声称已经生成文件或任务号。
    # 最新请求决定是否需要工具，问“怎么写”本身不授权创建图片或视频任务。
    # 先给一个可复制的合理示例，未指定风格不等于必须反复查询后才能回答。
    # 已知技能 ID 是稳定的内置入口，直接读取仍经过宿主白名单与摘要校验。
    # 基础规范与全参考规范不同，不能为了简单例子把所有手册都读进上下文。
    # 简单咨询至多两次必要资料调用；程序还会保留最后一轮禁用工具的回答机会。
    # 不承诺提示词能保证特定动作质量，真实模型效果仍由用户生成验证。
    "当前是在问怎么写、能做什么或要一个提示词示例时，直接解释并给出可复制示例，不查询模型、角色或技能目录，不执行生成。"
    "常见H3动作提示词可用下方基础速记；只有需要未包含的准确格式或用户明确要求读资料时才按需调用，简单示例最多两次资料工具，不遍历无关技能。"
    "若有read_agent_skill，已知H3技能直接传skill=h3-prompt-writing；基础模式可直接读file=references/base-en.txt，完整Ref2VA再读references/ref-en.txt，不先list_agent_skills。"
    "未知技能才使用list_agent_skills并采用短名称关键词；一次无结果可用无筛选目录定位，不能反复换长句检索。长文只读必要内容，确需续页用nextOffset，不能谎称局部资料已读全文。"
    "技能文档仅是任务参考，用户当前要求优先；hub_* 等专用工具只有在真实清单存在时才能调用。"
    "没有视频执行工具时，交付可用的 H3 提示词或分镜并说明尚未执行视频生成，不编造视频路径、任务号或成功结果。"
) + H3_QUICK_GUIDE


@dataclass(frozen=True)
class AgentConfig:
    """一次运行的全部配置（不可变，按次构造）。"""

    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL
    max_steps: int = DEFAULT_MAX_STEPS
    api_key: str = ""
    tools_module: str = DEFAULT_TOOLS_MODULE
    python_executable: str = field(default_factory=lambda: sys.executable)
    permission: str = "readonly"
    """只读 / 完全访问：只读档不挂写盘类工具（P3 落地，目前只透传给工具 server）。"""
    allowed_roots: tuple[str, ...] = ()
    """只读工具允许访问的目录白名单（空 = 不允许访问文件系统）。"""
    fake_llm: bool = False
    """True 时用 `fake_llm` 里的假模型：不花 token 跑通整条链路。"""
    fake_delay_ms: int = 0
    """假模型每帧之间的延迟（毫秒）：给「取消」这类时序断言留出可观测的窗口。"""
    host_tools: tuple[Any, ...] = ()
    """宿主声明的工具（由主进程经 payload 传入，见 `host_tools.parse_host_tools`）。"""


def _parse_roots(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, (list, tuple)):
        items = [str(item) for item in value]
    else:
        return ()
    return tuple(item.strip() for item in items if item and item.strip())


def _load_dotenv_once() -> None:
    """读开发期的 `.env`：**优先工作区根那一份**（与主进程共用同一个文件）。

    查找顺序：`ILLUSION_AGENT_ENV_FILE` → 本包目录 `apps/agent/.env` → **工作区根 `.env`**。
    桌面端其实不需要走到这里：主进程已经把生效配置经 stdin 传进来了
    （见 `apps/electron/agent/runner.js`）——这里只是开发期直接跑 CLI / stdio 时的兜底。
    """
    try:
        from dotenv import load_dotenv  # 运行期可选依赖
    except Exception:  # pragma: no cover - 生产环境没装也要能跑
        return
    env_file = os.getenv("ILLUSION_AGENT_ENV_FILE")
    candidates = (
        [Path(env_file)]
        if env_file
        else [PACKAGE_ROOT / ".env", PACKAGE_ROOT.parents[1] / ".env"]
    )
    for candidate in candidates:
        if candidate.is_file():
            load_dotenv(candidate, override=False)
            return


def load_config(overrides: dict[str, Any] | None = None) -> AgentConfig:
    """把「stdin overrides + 环境变量 + .env + 默认值」合成一份 AgentConfig。

    overrides 的键用 camelCase（与 TypeScript 侧的 `AgentRunOptions` 一致），
    环境变量用 UPPER_SNAKE（与 `.env.example` 一致）。
    """
    _load_dotenv_once()
    data = overrides or {}

    def pick(camel: str, env_name: str, fallback: Any) -> Any:
        if camel in data and data[camel] not in (None, ""):
            return data[camel]
        env_value = os.getenv(env_name)
        return env_value if env_value not in (None, "") else fallback

    api_key = str(
        pick(
            "apiKey",
            "ILLUSION_AGENT_API_KEY",
            os.getenv("SILICONFLOW_API_KEY", ""),
        )
    )
    max_steps_raw = pick("maxSteps", "AGENT_MAX_STEPS", DEFAULT_MAX_STEPS)
    try:
        # 环境变量与 stdin 同样限幅，整数上限不能被旧配置扩大。
        # 无效值仍落回默认，不因配置错误无限重试。
        # CLI 省略档位时保持四轮，与桌面中档一致。
        max_steps = min(6, max(1, int(max_steps_raw)))
    except (TypeError, ValueError):
        max_steps = DEFAULT_MAX_STEPS

    permission = str(pick("permission", "ILLUSION_AGENT_PERMISSION", "readonly"))
    if permission not in ("readonly", "full"):
        permission = "readonly"

    fake_raw = pick("fakeLlm", "ILLUSION_AGENT_FAKE_LLM", "")
    fake_llm = str(fake_raw).lower() in ("1", "true", "yes")

    try:
        fake_delay_ms = max(0, int(pick("fakeDelayMs", "ILLUSION_AGENT_FAKE_DELAY_MS", 0)))
    except (TypeError, ValueError):
        fake_delay_ms = 0

    return AgentConfig(
        base_url=str(pick("baseUrl", "ILLUSION_AGENT_BASE_URL", os.getenv("SILICONFLOW_BASE_URL", DEFAULT_BASE_URL))),
        model=str(pick("model", "ILLUSION_AGENT_MODEL", os.getenv("MODEL_NAME", DEFAULT_MODEL))),
        max_steps=max_steps,
        api_key=api_key,
        tools_module=str(pick("toolsModule", "ILLUSION_AGENT_TOOLS_MODULE", DEFAULT_TOOLS_MODULE)),
        python_executable=str(pick("pythonExecutable", "ILLUSION_AGENT_PYTHON", sys.executable)),
        permission=permission,
        allowed_roots=_parse_roots(pick("allowedRoots", "ILLUSION_AGENT_ALLOWED_ROOTS", None)),
        fake_llm=fake_llm,
        fake_delay_ms=fake_delay_ms,
        host_tools=tuple(data.get("hostTools") or ()),
    )
