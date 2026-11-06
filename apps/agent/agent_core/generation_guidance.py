"""在工具结果之后给下一次模型请求补充固定的阶段提示。

像检查表盖章：资料已经确认就进入下一格，不从头再查一遍。
这些提示不代替用户授权，也不自动调用带副作用的生成工具。
当前任务仍由最后一条 user 消息决定，不能因查到角色就强制画图。
仅解析正式工具的 JSON 标志，不把角色名或模型文件名提升成系统指令。
工具错误不是 JSON 时保留原错误链路，不伪造阶段完成。
没有唯一角色时继续由原有 character_question 询问用户。
模型目录只有本地预检结论，不能把阶段提示说成 GPU 已经加载成功。
本模块不持久化用户文字，也不缓存跨提问的旧生成目标。
"""
import json


# 字段检查要同时看工具名和真实布尔值，不能用任意文本中的“成功”猜阶段。
# 同名工具的非法回执忽略，不让辅助提示覆盖错误或改变既有协议。
# 本函数只返回应用自己写的固定文字，外部资料不进入 system 内容。
# 每次调用读取本轮输出，不从历史里推测哪个模型曾经可用。
# JSON 数组和字符串都不是正式回执，不能按字典访问导致整个回答崩溃。
# None 表示不追加提示，原模型上下文与工具结果依然完整保留。
# 不接受用户传入的阶段名，更不允许工具回执设置当前用户任务。
# 本轮主模型可用表示本地扫描通过，不表示 ComfyUI 正在执行或已完成生成。
# 主模型仍以原 tool 消息中的完整 name 传递，提示本身不复制或截断路径。
# 角色提示只在唯一身份可用时出现，browse 候选不能触发“角色已确定”。
# needsConfirmation 必须为真实 False，字符串 false 或缺字段均不算确认完成。
# ask_user 与未知 nextAction 不进入角色完成阶段，保留原有澄清路径。
# 角色回执只被视为资料来源，里面的 tags 不可改变用户的生成意图。
# 模型列表中的 usable 同样要求真实 True，不用非空字符串代替校验结论。
# VAE、文本编码器和 LoRA 不能满足主模型就绪条件，即使标志被错误设为 True。
# 空主模型页不会给出继续生成的建议，需要下一步按查询结果处理。
# 只要本页存在一个可用主模型就足够，不要求先枚举所有其他版本。
# 这避免为了找“最好”的模型反复扫描目录，但不替用户覆盖其指定模型。
# LoRA 的 total 表示过滤后的全集，不是当前分页条数。
# 只有 total 为零才建议跳过；offset 超尾的空页不能当成整个库没有匹配。
# 无匹配提示保留用户明确要求权重的例外，不能悄悄删掉硬性需求。
# 对未注册工具不产生提示，防止普通文件内容伪装阶段回执。
# JSON 解析失败直接返回 None，不用错误字符串中的偶然关键字判定成功。
# 数组与标量先被排除，避免辅助逻辑抛错后中断本已成功的工具调用。
# 这里不会重新发送模型请求；调用方只把提示附加到既有下一轮上下文。
# 没有修改预算，也不因为附加提示就延长同一个工具的执行期限。
# 多个工具同时返回时由会话层汇总，避免破坏一组调用与回执的配对顺序。
# 阶段提示不能替代工具结果，用户展开过程时仍能看到实际候选与错误。
# 固定文字只描述应用策略，不让外部返回的姓名作为更高优先级指令执行。
def generation_hint(name, output):
    try:
        data = json.loads(output)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    if name == "search_characters" and data.get("needsConfirmation") is False and data.get("nextAction") == "use_character":
        return "本轮角色身份已确定，使用返回的trigger/tags；不要重查角色或强制寻找角色LoRA。以最后一条user为准：若要求生成，主模型可用后直接generate_image；若仅列清单，不生成。"
    models = data.get("models")
    if name == "list_local_models" and isinstance(models, list) and any(isinstance(item, dict) and item.get("usable") is True and item.get("kind") in ("diffusion", "checkpoint") for item in models):
        return "本轮已有可用主模型，保存其完整name，不要重复查询或逐个核对其他模型。若最后一条user要求生成且角色已确定，直接generate_image；LoRA可省略，未指定采样参数用模板默认。"
    if name == "list_loras" and data.get("total") == 0:
        return "本轮定向查询没有LoRA匹配。LoRA可选，使用主模型和已有角色描述继续；除非用户明确要求该权重不可省略，否则不要再扫全库。只列清单时仍不得生成。"
    return None
