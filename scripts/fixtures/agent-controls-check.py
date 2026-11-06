# 无网络的 Agent 执行预算回归，使用正式 AgentSession.stream。
# SDK 边界由确定性异步流替代，不调用远端服务或真实生图。
# 工具桥只计调用次数，能区分“模型请求了”与“真正执行了”。
# 时间上限缩到毫秒，验证超时行为不依赖一分钟的真实等待。
# 本文件不覆盖 MCP 进程启动；真实进程树另由 verify-agent-events 验证。
# 任意断言失败让 unittest 返回非零，不能把超时当作通过。
import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch

# 从仓库脚本直接运行，不要求安装项目为全局 Python 包。
# 优先当前工作区源码，避免意外测到 site-packages 的旧版本。
# 路径只用于 Python 导入，不作为模型消息或日志输出。
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps/agent"))
from agent_core.config import AgentConfig, H3_QUICK_GUIDE, load_config
from agent_core.core import AgentSession
from agent_core.generation_guidance import generation_hint
from agent_core.run_limits import ToolBudget, TurnLimit, bounded_completion, character_question


# 每次 create 只吐出一个完整 chunk，省去与本次目标无关的 SDK 序列化。
# 重复工具调用每次使用新 id，预算应按名称和参数判断而非调用 id。
# request 计数在 create 内增长，可发现预算结束后仍偷偷追加模型请求。
# delay 模拟首 token 前建立连接缓慢，与流内部暂停分开测试。
# 该假客户端不会模拟服务商审核、识图能力或真实价格。
# arguments 是固定 JSON 对象，维持真实工具分片解析所需字段。
# content 与 reasoning 可以单独赋值，区分正常回答和长推理。
# tools 为空时是正常 final，而非为了停止测试强行抛异常。
# chat/completions 指向自身，只实现执行器实际依赖的表面。
# 增加工具种类通过 name 参数完成，不更改生产注册清单。
# 每次返回新的异步生成器，不能把已经耗尽的流重复使用。
# 关闭行为由 Python 生成器 finally 与生产 close_stream 共同验证。
# vary 模式不会重复查询参数，用来证明总轮数限制独立存在。
# stream_delay 在流消费阶段暂停，覆盖连接成功后推理不再返回的情况。
# closed 只在生成器真正关闭时设置，不能由测试结束后直接伪造。
# 模拟对象仍返回有效工具 JSON，限额测试不依赖参数解析失败。
# 所有计数都按对象实例隔离，多个测试并行时不会串用统计结果。
# 用户消息本身不被伪模型解析，测试目标是执行控制而不是自然语言理解。
# 真实模型是否选择角色工具另需用户账号联网验证。
# create 的参数兼容生产调用，未私自增加只供测试控制执行器的参数。
# 参数变化和工具名变化是不同边界，这里通过单一工具名隔离变量。
# 本例没有调用 test-only 的“结束循环”标志，停止必须来自真实限额。
# SDK 关闭接口差异由生产 close_stream 适配，而非测试自行代劳。
# 首个 chunk 可以含答案或工具调用，复用正式核心的两条完成路径。
# Python 事件生成器的 final 由真实 core 产生，假模型只返回 SDK chunk。
# 输出文字简短是确定性夹具，不能拿它衡量 Grok 的实际回复质量。
# 超时测试不重新构造事件循环或关闭其他测试的连接。
class Model:
    # answer 提供可观察的最终正文，不把限额文本当作提示词示例通过。
    # ignore_tool_choice 专门模拟供应商违反 none，检查本机是否仍会执行工具。
    # 默认遵守接口约定，与故意违规的负向场景形成配对反证。
    def __init__(self, name=None, reasoning="", delay=0, vary=False, stream_delay=0, script=None, answer="完成", ignore_tool_choice=False):
        self.chat = self.completions = self; self.requests = 0; self.name = name; self.reasoning = reasoning; self.delay = delay; self.vary = vary; self.stream_delay = stream_delay; self.closed = False
        # script 按模型请求分批提供工具，空批次表示模型完成回答。
        # None 保留旧重复调用模式，两种夹具不能靠真假值混为一谈。
        # 不让脚本解析用户文字，意图是否正确由消息保留断言单独核对。
        self.script = script
        # 每次保存完整消息快照，不能留引用被后续 append 改成最后一轮状态。
        # 测试不打印快照，历史文字和未来可能增加的图片不会进入终端日志。
        # 记录只属于夹具实例，不添加生产会话的跨轮缓存或新持久化格式。
        self.messages = []
        # 同时记录实际 API 限制，只有自然语言提醒而没传 none 应使检查失败。
        # 选择记录按请求存副本，不从模型回复倒推出执行器“应该”传过什么。
        # 本对象仅存在测试内存，不新增生产事件或用户资料字段。
        self.choices, self.answer, self.ignore_tool_choice = [], answer, ignore_tool_choice

    # 建立请求的暂停发生在返回流之前，覆盖“连首 token 都没有”的情况。
    # 工具调用 id 随模型请求递增，确保相同工具不因不同 id 绕过重复检查。
    # 非工具模式给正常回答，验证限额没有误伤一次即可完成的请求。
    # 以真实 chunk 的 choices/delta 层级交付，不直接绕过 stream 方法。
    # kwargs 接收模型、messages 和 tools，与生产 create 签名调用一致。
    # 测试不会打印 kwargs，防止以后夹具含图片数据时写入终端。
    # 生成器在消费时才构造 token，模拟真正的异步消息流。
    # 没有依赖“某段源码含某个字符串”一类恒真断言。
    async def create(self, **kwargs):
        self.requests += 1; await asyncio.sleep(self.delay)
        # 模拟 OpenAI 接口实际收到的请求，不在生成器结束后倒读消息数组。
        # JSON 往返得到独立快照，同时覆盖这些消息确实可序列化的前提。
        # 图片等复杂内容仍按原样保存，不重新构造一份简化对话替代正式输入。
        self.messages.append(json.loads(json.dumps(kwargs["messages"])))
        # 普通查询轮应为 auto，保留回答轮才应为 none。
        # 记录工具模式独立于 script，脚本不能反过来修改生产请求参数。
        # 不保存凭据、服务地址或整个 SDK 客户端，只记录这一项策略。
        self.choices.append(kwargs.get("tool_choice"))
        async def chunks():
            try:
                # 最后一次机会从现有上下文直接回答，不再消费下一批工具脚本。
                # 违规模式跳过此分支，用真实 core 的执行拦截保证不会有副作用。
                # 直接构造正文 chunk，最终 final 事件仍由生产 core 生成。
                if kwargs.get("tool_choice") == "none" and not self.ignore_tool_choice:
                    yield NS(choices=[NS(delta=NS(content=self.answer, reasoning_content=None, tool_calls=[]))])
                    return
                if self.script is not None:
                    # 请求超出脚本长度应直接失败，暴露执行器多发了一次请求。
                    # 每批次可含多个调用，用来检查中间是否错误插入 system 消息。
                    # 生成任务也是普通宿主名，必须经过正式工具预算与桥路由。
                    batch = self.script[self.requests - 1]
                    # index 与 id 遵循真实分片拼装所需字段，不直接塞事件进结果列表。
                    # 调用参数编码成字符串，正式执行器需要重新解析才能交给桥。
                    # id 同时包含请求和批内序号，避免同批两个回执错误绑定。
                    calls = [NS(index=i, id=f"{self.requests}-{i}", function=NS(name=name, arguments=json.dumps(args))) for i, (name, args) in enumerate(batch)]
                    # 空批次给正常文字，最终 final 由真实 core 判断并产生。
                    # 不是通过抛取消异常或直接伪造 final 来缩短轮数。
                    # return 仍进入 finally，原有 closed 资源断言继续有效。
                    # 空批次采用调用方给定的正文，允许验证用户确实收到了可复制示例。
                    # 有工具时仍不给正文，避免靠提前输出例子掩盖后续查询无休止。
                    # answer 不影响工具参数，测试中的调用次数仍由生产预算控制。
                    yield NS(choices=[NS(delta=NS(content=None if calls else self.answer, reasoning_content=None, tool_calls=calls))])
                    return
                arguments = json.dumps({"query": str(self.requests) if self.vary else "Alice"})
                call = NS(index=0, id=str(self.requests), function=NS(name=self.name, arguments=arguments))
                yield NS(choices=[NS(delta=NS(content="完成" if not self.name else None, reasoning_content=self.reasoning, tool_calls=[call] if self.name else []))])
                if self.stream_delay: await asyncio.sleep(self.stream_delay)
            finally:
                self.closed = True
        return chunks()


# 桥返回一次查询结果，既不搜索真实角色，也不读取用户模型目录。
# 输出可以切换为歧义回执，以验证执行器无需第二轮推理就会询问用户。
# 次数仅在真正 call 时增长，拒绝的重复调用必须不计入。
# MCP 启动不参与此单元，角色工具作为正式宿主名登记后直接走桥。
# 每个场景创建新实例，避免不同提问共享预算造成假通过。
# 超时参数接受但不使用，真实宿主超时由单独桥接回归覆盖。
# 输出 JSON 保持生产结构，不能用特殊错误文本触发停止。
class Bridge:
    def __init__(self, output="ok"):
        self.calls = 0; self.output = output

    # 只记录实际执行，不伪造失败后强行终止模型。
    # 返回字符串符合 HostBridge.call 的正式消费约定。
    # 本测试的 name/arguments 不执行任何文件或网络副作用。
    async def call(self, name, arguments, timeout):
        # 计数发生在路由真实调用后，阶段提示本身不能让桥调用次数增加。
        # 字典只提供固定回执，不复制生产校验或替 Agent 自动选择模型。
        # 未登记的工具名触发键错误，不能静默回 ok 掩盖多余查询。
        self.calls += 1
        # 旧预算用例仍返回单一字符串，保持重复查询的原有前置条件。
        # 新阶段用例按工具名区分角色、模型和排队回执，避免交叉使用同一标志。
        # timeout 参数继续由生产调用传来，这个内存桥不模拟 GPU 等待。
        return self.output[name] if isinstance(self.output, dict) else self.output


# 同步边界与异步循环分别断言，定位是预算判断还是调用链失效。
# unittest 管理事件循环，测试失败也能完成异步资源清理。
# 不使用固定睡眠等待“应该已经停止”，而等待受限流正常结束。
# 数值硬上限同时测试环境读取与直接构造配置，阻止仅保护 UI 的假修复。
# 角色零匹配与多匹配均要求确认，单匹配仍允许正常回答。
# 这些断言不证明模型语义上永远可靠，只证明代码能强制收尾。
class Controls(unittest.IsolatedAsyncioTestCase):
    # 用真正会话消费脚本化的模型流，覆盖阶段提示进入下一次请求的时机。
    # 首轮同时请求角色和主模型，第二轮请求生成，第三轮作正常回答。
    # 默认四轮内完成，不以提高 max_steps 掩盖查询步骤过多。
    # 历史只列清单、本轮生成，用来检查最新 user 消息持续保留在工具循环中。
    # 本例没有 LoRA 调用，证明正式执行链不会强制插入额外权重查询。
    # 假模型只验证消息与工具路由，不能证明真实服务商一定服从提示词。
    # 两个查询合在一轮会触发核心的多工具批次路径，而非只测最简单单工具。
    # 如果提示插在两个结果中间，严格的服务商可能拒绝整个下一轮请求。
    # 因此本测试不仅要“最后出现 system”，还要核对它前面紧邻两个 tool。
    # 真实用户可以先看清单再改为生成，历史反转是正常产品流程而非异常输入。
    # 提示词更新不能靠强行删除旧对话解决，否则用户前面的角色信息会丢失。
    # 这里检验消息位置，不引入基于中文关键词的授权判断器。
    # 生图桥回执不含本地路径，测试不会误读真实图库或修改生成队列。
    # 完成阶段的提醒采用固定文字，用户角色名没有获得 system 优先级。
    # 这个场景也不需要用户再次确认是否执行，因为本轮已明确要求生成。
    # 但执行行为仍由模拟模型提出，不是应用见到角色就自动排队。
    # 记录模型请求数比只看 final 更严格，防止后台多跑一轮总结没有显示出来。
    # 记录桥调用数补上副作用次数，不能只因生成事件出现就忽略重复提交。
    async def test_generation_progress(self):
        # 最小角色回执只给确定标志，证明提示依据机器字段而非长段解释文案。
        # 没有角色姓名插入 system，真实触发词仍来自普通 tool 消息。
        # 这里的唯一角色成功与下一个用例的唯一候选待确认构成配对。
        role = {"needsConfirmation": False, "nextAction": "use_character"}
        # 主模型用带目录和扩展的名称，不鼓励重造不完整的显示名。
        # usable 表示本地预检；没有真正的张量或 ComfyUI 服务参与测试。
        # 只提供一项足以进入生成，模型无需先列出其余未选版本。
        models = {"models": [{"name": "Anima/base.safetensors", "kind": "diffusion", "usable": True}]}
        # 首轮两个查询像一次领齐两张凭证，下一轮只需提交而非重办凭证。
        # 最后一批空数组代表正常收尾，不能把预算耗尽误认为生成成功。
        # 脚本刻意没有 list_loras，正式链路不应擅自加入这个可选步骤。
        script = [[("search_characters", {"query": "莉音"}), ("list_local_models", {"summary": True})], [("generate_image", {"model": "Anima/base.safetensors", "prompt": "rio (blue archive)"})], []]
        model = Model(script=script)
        # queued 只模拟宿主接受请求，不声称本例生成了图片文件。
        # 角色与模型 JSON 经正式解析，任一格式不符都不能产生对应阶段提示。
        # 桥不会根据用户文字决定工具顺序，顺序来自上面的 SDK 脚本。
        bridge = Bridge({"search_characters": json.dumps(role), "list_local_models": json.dumps(models), "generate_image": "queued"})
        # 工具走 parse_host_tools 正式登记，不能直接修改 session 的名称集合。
        # 这隔离了 MCP 子进程启动，只测试与本次修改有关的主机会话控制。
        # 没有实际云端密钥，也不访问当前应用用户的模型目录。
        tools = tuple({"name": name, "parameters": {}} for name in bridge.output)
        agent = AgentSession(AgentConfig(host_tools=tools), llm=model, bridge=bridge)
        # 故意保留相反的历史要求，检查工具往返后最新任务仍在上下文中。
        # 所有事件消费完成再判断，防止只看前几条而漏掉后续重复查询。
        # 默认配置保持四轮，本例完整回答应只使用其中三轮。
        events = [event async for event in agent.stream("现在生成莉音图片", [{"role": "user", "content": "只列清单，不生成"}])]
        # 实际 tool_call 顺序是执行器可观察行为，不只检查辅助提示的字符串。
        # 第三项必须生成，若自动插入全库 LoRA 或重复查询会使列表不相等。
        # 正式生成参数仍由模型提供，本测试不证明自然语言模型永远不犯错。
        self.assertEqual([event["name"] for event in events if event["type"] == "tool_call"], ["search_characters", "list_local_models", "generate_image"])
        # 请求数和调用数分别核对，能区分模型多问一轮与桥多执行一次。
        # 最终文字必须是脚本正常回答，不能被通用限额提示替代。
        self.assertEqual((model.requests, bridge.calls, events[-1]["text"]), (3, 3, "完成"))
        second = model.messages[1]
        # 严格中转接口要求一批 tool_calls 先回齐，再开始新的系统消息。
        # 顺序断言能发现“第一项成功后立刻插 system、第二项再回 tool”的协议错误。
        # 同一批阶段提示集中交付，未改变工具回执中的实际 JSON。
        self.assertEqual([message["role"] for message in second[-3:]], ["tool", "tool", "system"])
        # 历史保留不等于当前任务被覆盖，最后一个 user 必须仍是新生成请求。
        # 不靠删除历史来通过此断言，用户此前的背景仍由原构造器保留。
        self.assertEqual([message["content"] for message in second if message["role"] == "user"][-1], "现在生成莉音图片")
        # 两个不同阶段都应提醒下一步，不能只保留最后一个工具的就绪状态。
        # 只验证关键策略含义，详细角色数据仍不应复制进系统提示。
        self.assertIn("本轮角色身份已确定", second[-1]["content"])
        self.assertIn("本轮已有可用主模型", second[-1]["content"])

    # 阶段完成只是建议下一步，不应在查询工具回执到达时自行触发生图。
    # 历史生成、本轮只列清单是相反对照，排除沿用旧任务的消息拼装错误。
    # 独立检查错误回执和空模型，不能把无结果当作“已有可用主模型”。
    # 不确定角色由执行器直接询问，即使唯一模糊候选也不继续下一模型请求。
    # 两种确认原因覆盖错字与作品冲突，不只测试 total 大于一。
    # 最新的只列清单请求应在工具往返后保持原文，不被阶段提示改写。
    # 若本轮角色查询成功，仍不能把先前的生成请求重新提升为待执行任务。
    # 与上个测试共用正式 AgentSession，避免测试专用分支造成两套授权规则。
    # 角色确认标志来自工具，执行器不应靠解析用户给出的具体人名猜歧义。
    # 模糊查询和作品冲突均可只有一个候选，数量条件不足以完成身份确认。
    # 测试把两种原因分别发送，确保不是某种特定文字意外触发停止。
    # 辅助提示对无模型结果返回 None，不代表当前任务成功或自动选择默认权重。
    # 主模型不可用不能当成可选 LoRA 缺失，两个阶段的处理语义不同。
    # 非 JSON 错误继续交给原失败路径，不用测试把它包装成伪造的成功对象。
    # JSON 数组合法但不是工具契约对象，不能因解析成功就表示阶段完成。
    # 未知工具的相同 total=0 不应产生 LoRA 提示，工具名称也是校验边界。
    # 全部检查使用内存数据，不能据此声称已验证某个真实云模型的遵循率。
    # 本例不改变重复预算，强制询问角色依赖原有 character_question 入口。
    # 生成指令未被撤销的情况下也需先确认错字角色，避免画错人后再解释。
    # 测试通过表示控制链完整，联网效果与图像质量仍应单独验收。
    async def test_preparation_boundaries(self):
        # 查询得到可用角色，但本轮只列清单，执行器不能自行创建生成调用。
        # 假模型的下一批为空，若程序自动触发生图桥计数就会增加。
        # 这只验证应用没有隐式副作用，真实模型的任务理解仍需联网评估。
        role = json.dumps({"needsConfirmation": False, "nextAction": "use_character"})
        model = Model(script=[[("search_characters", {"query": "莉音"})], []])
        bridge = Bridge(role)
        config = AgentConfig(host_tools=({"name": "search_characters", "parameters": {}},))
        agent = AgentSession(config, llm=model, bridge=bridge)
        # 与前一个用例反转历史和当前要求，排除永远偏向某一条旧指令的拼装错误。
        # 消息格式沿用生产入口，没有测试专用的“只读任务”开关。
        events = [event async for event in agent.stream("现在只列清单，不生成", [{"role": "user", "content": "生成图片"}])]
        # 查询被实际执行一次；零次不能证明阶段提示到达后没有误生成。
        # 同时检查事件名，避免桥因为未登记生成工具而恰好未计数。
        self.assertEqual(bridge.calls, 1)
        self.assertFalse(any(event.get("name") == "generate_image" for event in events))
        # 新问题仍是最后一条 user；阶段 system 只能补规则，不能替换用户目标。
        # 这里不检查模型凭记忆复述的答案，直接核对发给模型的真实消息。
        self.assertEqual([message["content"] for message in model.messages[1] if message["role"] == "user"][-1], "现在只列清单，不生成")
        # total=1 不能绕过 needsConfirmation=true，唯一候选也可能是错字召回。
        # 作品冲突是另一种唯一但待确认场景，不能只按数量决定是否生成。
        # 具体标志来自正式 JS 检索测试，此处检验 Python 是否尊重上游结论。
        for reason in ("fuzzy", "workConflict"):
            model = Model("search_characters")
            agent = AgentSession(config, llm=model, bridge=Bridge(json.dumps({"needsConfirmation": True, "total": 1, "match": {reason: True}})))
            events = [event async for event in agent.stream("生成图片")]
            # 第一次工具回执后直接向用户确认，不再付费请求模型继续猜测。
            # 假模型会不断查询，若强制收尾失效将耗到预算而不是在一轮停止。
            self.assertEqual(model.requests, 1)
            self.assertIn("请", events[-1]["text"])
        # 错误文字、非对象 JSON、空模型和不可用模型分别覆盖四种假成功风险。
        # 它们都不得得到“主模型已就绪”的固定高优先级提醒。
        # 正向就绪分支已在上一用例覆盖，不能通过所有回执一律忽略来伪通过。
        for output in ("错误", "[]", '{"models":[]}', '{"models":[{"kind":"diffusion","usable":false}]}'):
            self.assertIsNone(generation_hint("list_local_models", output))
        # 无 LoRA 是可选项缺失，提示继续使用主模型；不是主模型本身缺失。
        # 同样内容来自未知工具时不能触发阶段提醒，防止无关结果串入生成策略。
        self.assertIn("LoRA可选", generation_hint("list_loras", '{"total":0}'))
        self.assertIsNone(generation_hint("other", '{"total":0}'))
        # 错误输出不会在辅助逻辑里抛异常，最终失败展示继续由原工具路径负责。
        # 这组断言不把缺少阶段提示当作停止原因，停止仍由现有会话协议产生。

    # 参数换序必须归为同一调用，调用 id 在预算器里根本不参与。
    # 两次允许给瞬态失败一次重试，第三次拒绝，边界不多执行一次。
    # 生图同参数第二次即拒绝，避免用户多收到一项重复任务。
    # 总量十二覆盖不同参数批量请求，不只约束完全相同的循环。
    # load_config 的极端配置必须截到六轮，而非信任用户环境变量。
    # 验证两种不确定场景，防止把空列表错误当作唯一候选。
    # 非角色工具回执不能通过伪造标记中断正常任务。
    # 无匹配不宣称角色不存在，断言只要求得到可读确认问题。
    # 所有用例使用新的预算器，确保不是受上一断言计数污染。
    # 输入均在内存构造，不需要磁盘模型与远程角色库。
    # 参数范围断言和执行断言是互补的，不把默认值存在视为执行成功。
    # 当前配置默认必须四轮，未来修改默认时会显式失败要求复核。
    def test_boundaries(self):
        budget = ToolBudget(); self.assertTrue(budget.allow("q", {"a": 1, "b": 2})); self.assertTrue(budget.allow("q", {"b": 2, "a": 1})); self.assertFalse(budget.allow("q", {"a": 1, "b": 2}))
        budget = ToolBudget(); self.assertTrue(budget.allow("generate_image", {})); self.assertFalse(budget.allow("generate_image", {}))
        budget = ToolBudget(); self.assertTrue(all(budget.allow("q", {"i": i}) for i in range(12))); self.assertFalse(budget.allow("q", {"i": 12}))
        self.assertEqual(load_config({"maxSteps": 100}).max_steps, 6); self.assertEqual(AgentConfig().max_steps, 4)
        for count in (0, 2): self.assertIsInstance(character_question("search_characters", json.dumps({"total": count, "needsConfirmation": True})), str)
        self.assertIsNone(character_question("search_characters", '{"needsConfirmation":false}')); self.assertIsNone(character_question("other", '{"needsConfirmation":true}'))

    # 重复查询让模型不断索要完全相同工具，应只实际执行两次。
    # 生成场景模拟副作用工具，第二次请求不得再进入桥。
    # 角色歧义要求第一次查询后直接 final，不能再请求模型猜别名。
    # 每次都消费完整事件流，检验真实 final 及 steps，而不是只测试辅助函数。
    # 传 max_steps=100 绕开配置读取，运行循环仍必须有自己的硬上限。
    # 无歧义的重复查询与有歧义的查询分开，避免混淆两个停止原因。
    # 断言模型请求次数，防止执行器拒绝工具却继续烧 token。
    # final 文案应为询问用户的可操作收尾，不是空白的“已停止”。
    # bridge 的实际调用次数还能发现提前 yield 后继续执行的错误。
    # 未启动 MCP 是刻意隔离，宿主工具名称仍经过正式解析和路由。
    # 正常文字回答作正向对照，预算不能让所有回答一律变成澄清。
    # 一个生成完成后模型应回应，此处重复生成用于测试保守停止路径。
    # 任务实际文件产出不属于这个模拟用例的证明范围。
    # 没有真实密钥、真实模型或真实角色参与这组执行断言。
    # expected 是实际桥调用上限，不是模型产生的 tool_call 分片数量。
    # 桥记录与模型请求记录分别比对，能够定位是哪一层未收敛。
    # 单次歧义查询不再请求模型，因此 requests 应为一而非二。
    # 重复查询在第三次模型请求时停止，但第三个工具不得被执行。
    # 重复生图在第二次模型请求时停止，原生成结果只出现一份。
    # 任何 final 都应为非空问题，用户无需展开工具 JSON 才知道如何继续。
    # session 未进入 MCP 上下文仍可以执行已注册宿主工具，这是既有边界。
    # 非宿主工具需要 MCP，不在此用空 session 伪造它们的成功结果。
    # 每一条提问由中文字符串触发，确保核心消息构造支持原应用语言。
    # 这不是角色实体解析准确率测试，只验证结构化不确定结果被可靠处理。
    # 正常无工具回复与预算收尾使用相同 final 协议，防止客户端悬挂。
    # 正向对照要求原回答逐字保留，不允许所有场景都直接发询问文案。
    # 没有通过 catch 忽略执行器异常，任何协议破坏都直接令测试失败。
    # 构造的宿主参数是 schema 空对象，仍必须通过 parse_host_tools 正式登记。
    # 工具清单在假模型中无需搜索名称，但生产路由仍查 host_tool_names。
    # 检查 request 次数能发现模型自动追加总结、继续猜名等不可见请求。
    # 检查实际调用次数能发现预算判断发生在副作用之后的错误次序。
    # 最后一项正常问候证明一轮即可完成的请求不会额外消费下一轮预算。
    # fake 输出不包含真实图片路径，测试不会误把生成产物加载进聊天。
    # 结果消息完整消费后再断言，不因提前停止测试掩盖后续重复事件。
    async def test_session(self):
        for name, output, expected in [("query", "ok", 2), ("generate_image", "ok", 1), ("search_characters", '{"needsConfirmation":true}', 1)]:
            model = Model(name); bridge = Bridge(output)
            agent = AgentSession(AgentConfig(max_steps=100, host_tools=({"name": name, "parameters": {}},)), llm=model, bridge=bridge)
            events = [event async for event in agent.stream("查询角色")]
            self.assertEqual(bridge.calls, expected); self.assertEqual(events[-1]["type"], "final"); self.assertIn("请", events[-1]["text"])
            self.assertEqual(model.requests, 1 if name == "search_characters" else expected + 1)
        agent = AgentSession(AgentConfig(), llm=Model()); events = [event async for event in agent.stream("你好")]; self.assertEqual(events[-1]["text"], "完成")

    # 首 token 前延迟超过限额，必须返回 TurnLimit 而非永远等待。
    # 缩短常量只在上下文里生效，测试结束恢复生产一分钟上限。
    # 长推理一次就越界，证明并非仅依赖慢连接超时来兜底。
    # 第一条超长推理不应先写到界面再警告，应直接收到收尾标记。
    # 正常内容不在此用例伪造，正常路径已由 test_session 配对覆盖。
    # 检查列表恰有一项，防止超限后继续产出 delta 或第二次 final。
    # 两个测试共用真实 bounded_completion，未替换生产限额分支。
    # 自动关闭生成器由 finally 执行，不要求外部进程结束才能收尾。
    # 使用标准 unittest mock，不引入新的 Python 测试框架依赖。
    # 流在首 token 后卡住也必须超时，不能仅覆盖 create 的等待。
    # 首 token 正常发出，随后出现 TurnLimit，二者的数量与顺序都检查。
    # closed 在假生成器 finally 设置，可证明生产清理实际执行。
    # 长思考路径也检查关闭，防止提前结束界面却保留 HTTP 流。
    # 为正常 stream 增加 finally 不主动触发失败，仅记录资源生命周期。
    # 流内部暂停由消费行为触发，不是测试主任务睡眠造成的假超时。
    # 单轮等待分连接阶段与消费阶段配对检查，覆盖两种常见长思考表现。
    # 时间常量总是通过 mock 上下文恢复，不影响后续会话的正常限额。
    # 故意变化参数的模型另外检验全局轮数，不能只依赖重复键停止。
    # 工具调用随请求递增关键字；前五轮可执行，第六轮必须留给回答。
    # 直接构造一百轮配置仍只请求六次，说明硬上限位于执行器。
    # 最后 final 的 steps 必须六，避免界面显示配置的一百轮。
    # 本测试不把首 token 当作回答完成；必须消费流到正式终点。
    # 使用异步 finally 记录比读取源码或检查函数名更能反映资源释放。
    # 进程级强杀不一定执行 Python finally，那个边界由 Electron 负责。
    # 在正常自动预算路径，HTTP stream 清理必须发生在交付澄清之前。
    # 这些场景不依赖网络抖动，任何机器上都能重复得到相同事件序列。
    # 消费到限额的列表断言也防止停止后仍生成额外 token。
    # 不检查精确运行毫秒，操作系统调度抖动不应让正确实现假失败。
    # 等待十毫秒只用于触发 timeout，而非根据固定延迟推断成功。
    # 真正成功信号是 TurnLimit 加资源关闭两个独立可观察结果。
    # reasoning 超额与工具次数超额共享收尾协议，但各自独立触发。
    # 任何一步抛异常都由 unittest 标红，不会用 finally 将失败覆盖为通过。
    # 配置读取边界已经在同步测试覆盖，这里专门尝试绕过配置读取。
    async def test_wait_and_reasoning(self):
        with patch("agent_core.run_limits.TURN_TIMEOUT_SECONDS", 0.01):
            events = [event async for event in bounded_completion(Model(delay=0.1), AgentConfig(), [], [])]
        self.assertEqual(len(events), 1); self.assertIsInstance(events[0], TurnLimit)
        model = Model(stream_delay=0.1)
        with patch("agent_core.run_limits.TURN_TIMEOUT_SECONDS", 0.01):
            events = [event async for event in bounded_completion(model, AgentConfig(), [], [])]
        self.assertEqual(len(events), 2); self.assertIsInstance(events[-1], TurnLimit); self.assertTrue(model.closed)
        model = Model(reasoning="想" * 6001); events = [event async for event in bounded_completion(model, AgentConfig(), [], [])]
        self.assertEqual(len(events), 1); self.assertIsInstance(events[0], TurnLimit); self.assertTrue(model.closed)
        model = Model("query", vary=True); bridge = Bridge(); agent = AgentSession(AgentConfig(max_steps=100, host_tools=({"name":"query","parameters":{}},)), llm=model, bridge=bridge)
        # API 模式与实际执行次数一起验证，不能只让按钮提前显示结束。
        # 第六轮必须正常返回正文，不能读完第六份资料后再交付通用上限提示。
        # 仍只发六次模型请求，没有偷偷追加第七次“免费总结”。
        events = [event async for event in agent.stream("继续查询")]; self.assertEqual(model.requests,6); self.assertEqual(bridge.calls,5); self.assertEqual(events[-1]["steps"],6)
        self.assertEqual(model.choices, ["auto"] * 5 + ["none"])
        self.assertEqual(events[-1]["text"], "完成")

    # 用用户这次的原问题验证短流程，工具选择由确定性脚本模拟。
    # 测试不证明任何真实服务商都能准确理解这句话，只验证宿主不会强制插入发现步骤。
    # 第一种场景直接回答，第二种场景按已知路径读取一次基础资料再回答。
    # 最终正文包含五秒示例和三个字段，不能仅返回“已读取技能”充数。
    # 只读工具注册在正式 HostBridge 清单，真实 core 必须走正常配对路径。
    # 目录工具也注册着，断言没有调用它，避免因删掉工具造成假通过。
    # max_steps=2 低于默认四轮，两种情况都不能靠提高上限完成。
    # 模型返回文本是夹具，不拿它宣称测试了真实动作质量。
    # 资料只在内存中返回，完整手册读取由 Node 宿主集成回归独立检查。
    # 检查消息内的速记确实存在，避免定义常量但没提供给运行模型。
    # 第一轮直接回答可以省去所有工具，第二轮若存在则必须传 none。
    # 实际工具数量与请求数分别检查，批量调用也不能掩盖多次执行。
    # 新的 question 必须仍是最后一条 user，示例不应来自错误的旧任务。
    # 不创建图片、音频或视频任务，也不要求用户配置真实 API Key。
    # 两个场景都使用自己的 bridge，调用数量不能由前一个测试遗留。
    # 最终文本由模型流进生产执行器，不是测试直接向事件列表追加 final。
    # 五秒范围只检查示例的时长描述，不能据此证明工作流参数已设置。
    # 三个字段的次序由速记规范提供，例子不会加载完整一万多字手册。
    # 无结果的角色提示不适用于此问题，正文不应出现角色身份补充要求。
    # 首轮普通回复没有强制收尾，证明咨询本身无需等用完预算。
    async def test_prompt_consultation(self):
        question = "若我要一个酷炫的5s动作，你怎么帮我写提示词？"
        # 例子的主体是泛指人物，不注册任何角色搜索回执帮助它完成。
        # 对应问题只咨询写法，事件中出现 generate_image 就是越过任务范围。
        # 对声音的描述只是提示词的一部分，不引入音频上传或真实播放器。
        answer = "integrated_multimodal_description: [Shot 1] A fighter dashes and lands within 5 seconds.\noverall_soundscape: Footsteps and a landing impact.\nnon_diegetic_music: A rising electronic beat."
        read = ("read_agent_skill", {"skill": "h3-prompt-writing", "file": "references/base-en.txt"})
        # 一个空批次的脚本表示第一轮已足够回答，预期没有工具过程。
        # 先读取再空批次则表示资料辅助场景，必须在第二轮完成正文。
        # 同一断言集覆盖两种情况，不能只修复“完全没有工具”的最简单路径。
        for script in ([[]], [[read], []]):
            model, bridge = Model(script=script, answer=answer), Bridge({"read_agent_skill": "Base guide"})
            # 这里的桥仅有一份基础资料回执，若执行器擅自查目录将直接报错。
            # 目录工具声明仍在，从 API 的角度它本可被选；并非靠隐藏工具通过。
            # 没有把已知 skill 路径转成任意文件访问，测试仍使用正式宿主名。
            tools = tuple({"name": name, "parameters": {}} for name in ("list_agent_skills", "read_agent_skill"))
            agent = AgentSession(AgentConfig(max_steps=2, host_tools=tools), llm=model, bridge=bridge)
            events = [event async for event in agent.stream(question)]
            self.assertLessEqual(bridge.calls, 2)
            self.assertEqual([event["name"] for event in events if event["type"] == "tool_call"], [] if len(script) == 1 else ["read_agent_skill"])
            self.assertEqual(events[-1]["text"], answer)
            # 初始 system 中的速记必须完整传入，未使用的模块常量不能算实现。
            # 模型消息已经在 create 前复制，后续追加 system 不会反向修改首轮证据。
            # 原问题仍从 user 角色读取，不能把系统中的示例误当用户已指定角色。
            self.assertIn(H3_QUICK_GUIDE, model.messages[0][0]["content"])
            self.assertEqual([message["content"] for message in model.messages[-1] if message["role"] == "user"][-1], question)
            self.assertEqual(model.choices, ["auto"] if len(script) == 1 else ["auto", "none"])

    # 保留最后回答机会时，供应商可能仍发回工具调用，不能仅相信 none。
    # 使用副作用工具名 generate_image，实际桥调用为零才说明安全边界生效。
    # max_steps=1 让第一轮就是最后回答轮，避免先发生一次合法生成掩盖问题。
    # 违规假模型照常发送有效 JSON，不能靠解析参数失败阻止副作用。
    # 不发 tool_call 事件，界面不能把未执行动作显示成正在运行。
    # neutral final 不提角色，防止与视频咨询无关的补充问题再次出现。
    # 最后请求仍只有一次，没有暗中重试或追加新的总结轮。
    # 模型流必须被释放，不能只是忽略其调用后留下连接等待。
    # 此处验证程序拦截，不把假供应商行为描述成某一家中转站实测缺陷。
    # 否则只修改 system prompt 的实现会让 bridge.calls 变成一并使检查失败。
    # timeout 和长思考的独立检查保留，不用最后轮规则代替等待上限。
    # 已有活动任务取消不在此用例执行，避免向用户 ComfyUI 发停止命令。
    async def test_final_turn_rejects_unexpected_tools(self):
        # 违规模型仍拿到合法工具声明，防止因为它根本看不到工具而误判安全。
        # 不传图片参数也是合法 JSON，最终轮的拒绝应先于宿主业务参数校验。
        # Bridge 若被调用会如实累加，不能用空实现掩盖一次真实执行。
        model, bridge = Model("generate_image", ignore_tool_choice=True), Bridge()
        config = AgentConfig(max_steps=1, host_tools=({"name": "generate_image", "parameters": {}},))
        agent = AgentSession(config, llm=model, bridge=bridge)
        events = [event async for event in agent.stream("说明五秒动作提示词，不生成")]
        # 请求次数、实际调用和 API 模式三个证据来自不同边界。
        # 只将 tool_choice 改成 none 但仍执行违规回包，会让桥次数断言失败。
        # 只是不发送事件却仍执行工具，也不能用界面上没有过程冒充通过。
        self.assertEqual((model.requests, bridge.calls, model.choices), (1, 0, ["none"]))
        self.assertFalse(any(event["type"] == "tool_call" for event in events))
        self.assertEqual(events[-1]["text"], TurnLimit().text)
        # 用户本轮没有要求寻找角色，通用兜底不应强加作品或角色名查询。
        # 关闭标记来自生成器 finally，需真正消费或关闭流才能成为 true。
        # 本地拦截不依赖服务商主动断开，因此不能用模拟断连代替资源清理。
        self.assertNotIn("角色", events[-1]["text"])
        self.assertTrue(model.closed)


# 标准测试入口；输出只含测试名称与通过状态，不包含消息、图片和密钥。
# 出错自动退出 1，便于与 Node 及 Electron 回归采用同样的门禁判读。
# 直接执行文件即可，无需修改项目运行依赖或正式用户文档。
if __name__ == "__main__":
    unittest.main()
