# 构造 OpenAI 兼容多模态消息，供正式 Agent.stream 和契约测试共同使用。
# 用户附件是 base64 data URL；blob URL 和本机路径无法被远端读取。
# 文本调用仍返回字符串 content，避免改变既有纯文本模型和 CLI 行为。
# 历史用户图片保留原有顺序，助手历史只允许文本，不注入 system/tool 角色。
# 本模块只整理内存数据，不读文件、不联网、不记录图片或密钥。
# 各端相同的数量与长度约束同时保护 CLI 直接调用与桌面端请求。
from collections.abc import Mapping, Sequence
import re

# MIME 与 shared schema 一致，浏览器非原生格式先转换为 PNG。
# 限制在正则之前检查，拒绝过大的请求时不扫描整个图片内容。
# 全部上下文的预算在 build_messages 统一计算，不能靠拆消息绕过。
IMAGE_URL = re.compile(r"data:image/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}")


# None 表示旧客户端省略 images，与显式空数组具有同样含义。
# 不接受字符串、字典或混合数组，非法内容不默默丢掉再发纯文本。
# 错误只使用固定说明，不将任意图片字节回显进 error 事件。
def normalize_images(value: object) -> list[str]:
    # 直接 CLI 调用没有 Electron 的入参校验，所以 Python 不能盲目信任输入。
    # list 的顺序决定模型看到图片的顺序，不使用集合进行去重或排序。
    # 相同图片可被用户主动附加多次，每次出现都保留并计入预算。
    # 十二 MiB 为 ASCII 编码字符上限，不是图片宽高或 token 窗口大小。
    # base64 正则不允许换行，确保 stdin 中的数据仍由 JSON 转义规则承载。
    # 允许的 MIME 与浏览器编码器一致，BMP 和 AVIF 必须先转为 PNG。
    # 拒绝非图片 data URI，不能把任意 HTML 或文件路径作为视觉输入。
    # GIF 数据可传输，但远端是否理解动画帧不属于本函数的承诺。
    # 不使用 urllib 或 requests 去访问附件地址，图片上传不增加第三方网络目的地。
    # 空列表合法，方便没有附件的旧桌面端和 CLI 共用同一方法。
    # 空字符串图片不合法，不能制造一个看似有图但实际无内容的请求块。
    # 输入列表复制成新的字符串列表，不会在后续处理时修改调用方对象。
    # 不在异常信息中附带 repr(value)，避免将整张图片写到 NDJSON 错误事件。
    # 单图超长时先按长度拒绝，避免正则扫描过大的内容。
    # 不尝试从扩展名推断 MIME，这里已经没有可供读取的本地文件路径。
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 8:
        raise ValueError("Invalid Agent images")
    images: list[str] = []
    for image in value:
        if not isinstance(image, str) or len(image) > 12 * 1024 * 1024 or not IMAGE_URL.fullmatch(image):
            raise ValueError("Invalid Agent image data")
        images.append(image)
    return images


# 普通文字原样保留，Markdown 不在传输层解释，也不依据附件名修改提示词。
# 有图片时采用标准 text + image_url 数组，Grok 实际收到可解码字节。
# detail=auto 由模型决定视觉细节，不在客户端臆测供应商图像 token 价格。
# 这里只构造协议，不保证所选中转站账号已开通该模型的视觉权限。
# 多图按用户选择顺序追加，不把两张图合并为一张或转换为路径文字。
def user_content(text: str, images: list[str]) -> str | list[dict[str, object]]:
    # 这是 OpenAI Chat Completions 的输入结构，不是 Responses API 的 input_image 结构。
    # 采用 image_url 对象的 url 字段，兼容当前 Euzhi 的 /v1/chat/completions。
    # 不把 base64 作为普通 text 块，否则模型只会看到无法理解的大串字符。
    # text 块放在图片之前，保留用户对这些图片提出的问题。
    # 不对文字进行 Markdown 渲染，原始提示词中的标签和标点必须逐字保留。
    # detail=auto 是协议选项，不强制更高分辨率或隐含选择更贵模型。
    # 只有调用方明确提供图片时才使用数组 content，文本负向对照应仍是字符串。
    # 不把系统提示词混入用户 content，防止角色边界因多模态改动而消失。
    # 每个 image_url 都是独立对象，没有把多图拼成一个超宽截图。
    # 对象只包含标准协议字段，不附带客户端文件名、大小或浏览器预览 URL。
    # 这个结构可以在工具返回后复用，工具调用不会要求重新读取图片。
    # 纯构造函数没有 token 统计或消费请求，生成结构本身不触发收费。
    if not images:
        return text
    return [{"type": "text", "text": text}, *[
        {"type": "image_url", "image_url": {"url": image, "detail": "auto"}}
        for image in images
    ]]


# system 指令只来自应用配置，历史角色允许集阻止用户注入额外系统消息。
# 每次工具循环继续复用这个 messages 数组，模型调用工具之后仍看得到输入图片。
# 当前问题只追加一次，不能又放进 history 导致图像重复计费。
# 历史图片沿用已发送字节，删除磁盘源文件后本次内存会话仍可继续讨论。
# 预算按整个请求的图片字符数计算，不把纯文本误当图像字节。
# CLI 省略 images 时保持原始顺序：system、history、当前 user。
# 只读权限约束本地工具操作，不禁止用户主动把自己选中的图片交给聊天模型。
def build_messages(system: str, question: str, history: Sequence[Mapping[str, object]] | None = None, images: object = None) -> list[dict[str, object]]:
    # 先创建应用拥有的唯一系统消息，再按历史的原始顺序追加对话。
    # role 允许集检查独立于图片，文本历史也不能指定 system 或 tool。
    # content 仍要求 str，多模态协议块只由本模块构造而非页面自由注入。
    # 当前问题的图片由单独参数传入，不从 history 的最后一项猜测。
    # 桌面端会排除当前用户消息，避免 question 与 history 同时包含这轮内容。
    # 图片预算从当前图片开始累积，再加历史图片，顺序不改变总量语义。
    # 预算以编码后字符计算，base64 都是 ASCII，各端字符串长度含义相同。
    # 累计预算包括重复图片，因为重复出现也会扩大实际 HTTP 请求体。
    # 三十二 MiB 是客户端传输限制，不宣称等于 Grok 的最大上下文 token 数。
    # 超限不能静默裁掉早期图片，否则“上一张图”的追问会在不知情下改变含义。
    # 失败先抛异常，由 stdio 入口输出明确 error，不能继续发出纯文本请求。
    # 助手历史允许省略 images，兼容此前已经存在的所有文本会话。
    # 助手历史的空 images 不引入图片，因此仍可按普通文本发送。
    # 不接受助手伪造的非空输入图片；工具产物有自己的展示与授权路径。
    # 用户历史原文无需再次分词、翻译或摘要，保留已有多轮聊天含义。
    # 纯文本历史通过 user_content 原样返回，不引入不必要的结构变化。
    # 当前 question 总是在末尾，服务商仍可根据最后一条 user 确定本轮问题。
    # 当前 images 为 None 与 [] 的输出相同，保证默认参数的向后兼容。
    # 返回新的字典列表，后续追加 assistant/tool 消息不改变用户 store 中的数据。
    # 不复制工具执行细节到这份历史，避免上次工具回执污染新一次运行。
    # 主进程的历史白名单与这里相同，双层验证覆盖桌面端和直接 Python 调用。
    # 系统指令从函数参数取值，不读取图片文字或文件名作为应用指令。
    # 服务商模型和 endpoint 不参与构造，消息内容与身份路由保持各自职责。
    # API Key 不作为函数参数，图像构造不会把秘密放进 messages。
    # 不生成图片上传 URL，不依赖另一个网站长期保存私人图像。
    # 返回结构只包含 JSON 可序列化值，可以由 OpenAI SDK 直接编码发送。
    # 每次 stream 调用只构造一次；工具循环继续复用同一列表中的图片。
    # 运行结束后的内存释放由会话生命周期管理，本模块没有全局图片缓存。
    # 阶段事件不含这份 messages，前端流式进度不会收到大段原图 base64。
    # 测试通过本地 HTTP 捕获正式 SDK 请求，验证这里的输出确实进入远端协议。
    # 模型是否有视觉权限仍由站点决定，合法消息结构不能替代真实账户验证。
    # Python 保持对文本 CLI 的兼容，原调用点无需提供任何图片参数。
    # 格式扩展必须同步 shared schema 与主进程检查器，不能只改某一端允许集。
    messages: list[dict[str, object]] = [{"role": "system", "content": system}]
    current = normalize_images(images)
    chars = sum(len(image) for image in current)
    for item in history or []:
        role, text = item.get("role"), item.get("content")
        previous = normalize_images(item.get("images"))
        if role not in ("user", "assistant") or not isinstance(text, str) or (role == "assistant" and previous):
            raise ValueError("Invalid Agent history")
        chars += sum(len(image) for image in previous)
        messages.append({"role": role, "content": user_content(text, previous)})
    if chars > 32 * 1024 * 1024:
        raise ValueError("Agent image context is too large")
    messages.append({"role": "user", "content": user_content(question, current)})
    return messages
