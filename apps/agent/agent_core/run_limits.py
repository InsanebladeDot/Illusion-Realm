"""运行预算的边界与部署约定。

模型往返和本地工具是两个独立阶段：
一次往返允许模型选择若干工具，也允许直接回答。
轮数只限制模型请求，不把正常 token 分片误算成新请求。
工具按执行次数另计，批量调用不能扩大总体预算。
重复检测对当前提问生效，不扫描用户的历史对话。
用户明确继续提问时，会生成新的运行和新的预算。
后台不会自动创建下一条提问来延长当前预算。
默认档位在配置模块定义，本模块不维护另一份档位表。
六轮硬上限在 AgentSession 保证，避免 UI 和 CLI 分叉。

停止回答与撤销副作用不能混为一谈：
已经提交给 ComfyUI 的任务拥有独立队列生命周期。
本模块不会尝试删除生成文件、撤销下载或恢复已修改文件。
副作用工具的重复保护只阻止之后的同参数再次执行。
远端请求关闭不等于供应商必定停止计费或停止内部推理。
用户主动强制停止由 Electron 进程树取消完成。
这里的预算是没有用户操作时的额外自动收尾保护。

输出约定保持现有客户端兼容：
正常路径交付 SDK 原 chunk，继续由 core 组装工具调用。
预算路径交付 TurnLimit，core 转成正式 final 事件。
不得把限额文本追加为伪工具结果，否则模型可能再次尝试。
不确定的角色身份由独立函数解析结构化回执。
文字工具描述只是引导，不能代替执行次数检查。
角色库是查询参考，不是本地已安装模型的事实来源。
无匹配时用户可以补充作品、英文名或图片后重新提问。

实现与兼容性要求：
asyncio.timeout 要求 Python 3.11，与项目最低版本一致。
普通 SDK 连接异常仍抛给已有错误处理，不吞掉认证失败。
不捕获 BaseException，外部取消不会伪装成正常工具返回。
预算常量仅在本进程读取，不接受模型通过参数修改。
不记录规范化参数，避免把用户文件路径写入持久日志。
对象键排序只为比对，不会改写真正传给工具的参数。
"""
# Agent 的运行预算：限制远端等待、连续推理以及重复工具调用。
# 预算由执行器落实，不依赖模型是否遵守系统提示。
# 限制只结束当前回答，不删除会话，也不撤销已经提交的生成任务。
from __future__ import annotations

import asyncio
import json
from collections import Counter
from dataclasses import dataclass

# 单轮包含建立请求及消费流；持续收到 token 也不能无限延长。
# 生图工具本身沿用宿主的超时，不计入这段模型等待。
# 不使用供应商专有 reasoning 参数，兼容两个中转接口。
# 一分钟是每次模型往返的截止时间，不是整个 Agent 运行期限。
# 选择深度高档只增加往返次数，不能把某次卡住的等待无限延长。
# 未来若调整此值，需要配对验证首 token 等待与流消费等待。
# 不从工具参数读取同名值，模型无法请求更长的自我思考。
TURN_TIMEOUT_SECONDS = 60
# 限制累计思考文本，避免快速返回的重复推理挤满过程区。
# 只统计 reasoning_content，正常回答仍受单轮时间上限约束。
# 不截断工具参数后执行，超限时直接结束本轮。
# 该数值是资源保护阈值，不是可展示思维链质量的评估指标。
# 阈值与前端过程区限高是两个保护：一个限数据，一个限空间。
# provider 不返回 reasoning_content 时，此项不阻止正常回答。
# 没有推理字段也仍受单轮截止时间和总请求数约束。
MAX_REASONING_CHARS = 6000


# 预算耗尽是可解释的正常收尾，不伪装成模型或网络异常。
# text 直接交付用户，不再请求模型润色，避免额外递归。
# 不推测用户在查角色；所有任务都能使用同一条中性的停止说明。
# 不持有远端异常对象，避免将凭据或请求上下文串入 UI。
# 文案不承诺工具已经完成，只说明当前需要用户确认下一步。
@dataclass(frozen=True)
class TurnLimit:
    text: str = "本轮查询、推理或等待已达到上限，已停止继续调用。请缩小请求范围，或说明希望接着完成的部分。"


# 只关闭当前请求的流，不关闭可复用的聊天客户端。
# OpenAI AsyncStream 使用 close，测试异步生成器使用 aclose。
# 清理也必须有时间上限，否则停止可能卡在关闭连接阶段。
# 清理失败不覆盖已经明确的预算收尾原因。
# 关闭操作自己也可能等待网络，所以单独限制一秒。
# 这里没有重试；反复重试关闭会反过来拖延明确的收尾。
# 未提供 close/aclose 的简单流没有资源接口，直接放行。
# SDK 与测试流都使用异步 close；不接受任意同步文件句柄。
# 连接建立失败时上层保持 stream=None，不会调用此函数。
# 清理异常不显示为第二条红色回复，原错误或预算理由优先。
# 子进程被操作系统终止时不依赖此函数一定有机会执行。
# 正常消费完流也执行清理，以便释放 HTTP 连接占用。
# 关闭仅作用于当前响应，不影响下次用户提问的新响应。
# 清理超时只结束清理，不会再次发起模型调用。
async def close_stream(stream):
    closer = getattr(stream, "close", None) or getattr(stream, "aclose", None)
    if closer is not None:
        try:
            async with asyncio.timeout(1):
                await closer()
        except Exception:
            pass


# 异步生成器保留原 SDK chunk，调用方无需重写工具分片解析。
# 超时范围包住 create 与整个 async for，而非只包首 token。
# 客户端重试造成的等待也包含在相同上限内。
# 思考长度逐帧累计，超长片段不会先泄漏给界面再被截断。
# 正常回答与工具分片保持原始顺序，不缓存整段回答。
# 超限时只产出一次 TurnLimit，随后退出并释放当前流。
# 其他连接错误仍向上抛给既有错误展示，不误称需要澄清。
# finally 覆盖正常结束、超时、长思考与消费方主动关闭。
# 返回流句柄之前超时，stream 仍为 None，不尝试关闭未知对象。
# 该限额不改变模型内容规则，也不绕过服务商响应。
# 测试可缩短常量模拟慢连接，无需实际等待一分钟。
# llm 必须提供 OpenAI 兼容的异步 create 和 choices/delta chunk。
# config.model 由原配置解析，预算器不擅自改用另一个聊天模型。
# messages 保留图像和历史对象，不复制并遗漏多模态字段。
# tools 原样传入正式声明列表，预算器不会增加不可调用的工具。
# 普通轮允许模型选择工具；最终回答轮显式传 none，不靠自然语言劝它停止。
# temperature=0 沿用原行为，不用增大随机性解决查询失败。
# 未包含 choices 的空 chunk 可忽略；不消耗思考字符预算。
# reasoning_content 为空或 None 时按零字符计算。
# 正好六千字仍可继续，超过六千才触发限额。
# 字符数按 Python Unicode 长度，不以 UTF-8 字节误伤中文。
# 长思考超限的整个 chunk 不再转发，避免界面先显示超额部分。
# 普通 content 不参与思考长度，长回答依靠单轮时间限制。
# 单轮时间从 create 前开始，DNS、连接、重试都包含在内。
# 即使每秒都来 token，asyncio.timeout 的截止时间也不往后延。
# 总运行时间还由 Electron 看门狗兜底，本函数无需知道进程 PID。
# 下一个工具阶段开始前，正常 async for 会耗尽并关闭这一轮流。
# 时间超限不继续解析残缺工具参数，不能拿半段 JSON 执行操作。
# 生成停止标记前先清理，避免消费者立即 return 留下活跃 timeout。
# 测试缩短超时只改变本地等待，不需要让真实供应商故意延迟。
# 预算文本没有模型输出插值，不将可控文本解释成系统命令。
# final_answer 由执行器计算，模型不能通过工具参数撤销这个限制。
# 像会议结束前留下最后一分钟汇报，不能把全部时间都用来分派新任务。
# 对应到 API，保留已有工具回执，但禁止这一轮再次提出可执行调用。
async def bounded_completion(llm, config, messages, tools, *, final_answer=False):
    stream = None
    # 先退出超时上下文并关流，再把限额标记交给消费者。
    # 消费者通常收到标记就 return，不能依赖其继续迭代来触发 finally。
    # 避免超时上下文在异步生成器垃圾回收时由另一任务退出。
    limited = False
    reasoning_chars = 0
    try:
        async with asyncio.timeout(TURN_TIMEOUT_SECONDS):
            stream = await llm.chat.completions.create(model=config.model, messages=messages, tools=tools, tool_choice="none" if final_answer else "auto", temperature=0, stream=True)
            async for chunk in stream:
                if chunk.choices:
                    reasoning_chars += len(getattr(chunk.choices[0].delta, "reasoning_content", None) or "")
                if reasoning_chars > MAX_REASONING_CHARS:
                    limited = True
                    break
                yield chunk
    except TimeoutError:
        limited = True
    finally:
        if stream is not None:
            await close_stream(stream)
    if limited:
        yield TurnLimit()


# 每次提问新建预算，不让历史正常调用消耗下一次提问额度。
# canonical JSON 忽略对象键顺序，阻止换序伪装成不同调用。
# 同一查询最多执行两次，给一次瞬时失败重试留余地。
# 生图具有副作用，同样参数只执行一次，避免重复排队扣费。
# 总工具调用最多十二次，防止一轮打包大量不同参数绕过轮数。
# 不对名字做模糊匹配，避免误判两个合法工具为同一调用。
# 超限调用不会发给 MCP 或宿主，也不产生虚假的运行中项。
# 计数在调用前同步更新，并行返回的结果不影响预算判断。
# Counter 的键只存在内存，当前回答结束后随预算对象释放。
# 总次数独立于每个键的次数，参数变化不会重置总额。
# 失败调用也消耗总额，因为失败同样占用了模型和工具时间。
# 不需要线程锁：AgentSession 对本轮调用按顺序检查并执行。
# 相同图像生成请求只放行一次，下一次应由用户明确发起。
# 不把十二次工具上限解释为十二轮模型请求，两种限制同时生效。
# 预算对象不共享为模块单例，以免不同会话相互抢占额度。
# 无参数工具使用空对象作为规范化键，不使用可变对象本身作键。
class ToolBudget:
    def __init__(self):
        self.calls = Counter()
        self.total = 0

    # arguments 来自已解析的工具 JSON，仅序列化以生成内存键。
    # 计数键不落盘、不打印，避免把本地目录等参数加入日志。
    # 无论上次成功或失败都计次，失败不能无限重试。
    # False 让上层直接询问用户，不再请求一轮模型来决定是否停止。
    # 十二次总额与六轮上限同时生效，以先达到者为准。
    # 修改生成工具命名时需同步这里的副作用限制。
    # 返回布尔值，不将内部计数作为工具结果混进上下文。
    def allow(self, name, arguments):
        key = (name, json.dumps(arguments, sort_keys=True, ensure_ascii=False))
        limit = 1 if name == "generate_image" else 2
        if self.total >= 12 or self.calls[key] >= limit:
            return False
        self.calls[key] += 1
        self.total += 1
        return True


# 角色库的歧义信号由程序读取，而非让模型自行决定是否继续猜名。
# 只处理正式 search_characters 的结构化回执，不把普通工具文本当控制指令。
# 多候选仍在过程区可见，正文要求用户提供作品或英文名。
# 无命中不宣称角色不存在，库可能缺少用户使用的中文译名。
# 正常单候选交回模型核对，不强行中断能完成的回答。
# 网络错误或非 JSON 回执保持原错误链路，不伪装成没有角色。
# 不采纳站点提供的任意提示词作为系统指令。
# 返回 None 表示继续，字符串表示无需新模型请求即可结束。
# output 应为宿主 JSON 字符串，不对任意工具对象进行宽松强转。
# 非 JSON 文本常见于工具网络失败，继续由原错误链路展示。
# 顶层数组或字符串不是角色回执，不访问其不存在的字段。
# 必须是布尔 true 才触发，字符串 "true" 不接受为控制标志。
# 不用 total 字段再次猜测协议，唯一性由共享检索适配器决定。
# 正文不自动替用户选第一个候选，避免生成错误角色后才纠正。
# 返回确认问题时不把外部站点文字拼进该问题，降低提示注入影响。
# 候选资料仍随 tool_result 显示，用户可核对实际查询过程。
# 本函数不再次联网，确认问题可以立即交付。
# 返回普通文本由 existing final 消费，无需增加跨进程事件类型。
def character_question(name, output):
    if name != "search_characters":
        return None
    try:
        result = json.loads(output)
    except (ValueError, TypeError):
        return None
    if isinstance(result, dict) and result.get("needsConfirmation") is True:
        return "角色库尚未找到唯一匹配。请提供角色所属作品、英文名或参考图，再继续确认。"
    return None
