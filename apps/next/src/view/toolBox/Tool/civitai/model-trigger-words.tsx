"use client";

// 本地与在线详情共用触发词区，来源适配器仍保留原始资料。
// 展示时复用创建页的标签拆分器，避免同一句提示词在两个入口拆法不同。
// 复制复用现有浏览器剪贴板封装，不为文字操作新增 Electron 通道。
import { Copy } from "lucide-react";
// 标签外观与创建页共用，点击复制仍留在当前详情的业务边界。
// 模型详情继续沿用原分组与复制实现，只把每颗词的外观交给共享标签。
// 创建页的追加和删除不会进入这里，模型触发词仍是只读资料。
// data-copy-trigger-word继续附到真实按钮，单颗复制入口和旧回归定位保持一致。
// 两行训练词组外层容器不改，抽取标签不能把组间换行重新合成一段。
// 缺少触发词时仍由原详情状态处理，不生成一颗可点击的空标签。
// 主按钮复制完整训练词，视觉折行不会给剪贴板内容插入额外换行。
// copy-all继续从原始组取值，不能从标签DOM反读被屏幕阅读器改写的文本。
// 复制失败的反馈保留原边界，公共tag只通知点击意图，不自行访问剪贴板。
import { PromptTag } from "@/components/prompt-tag";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { copyText } from "@/utils/charactersFormat";
import { missingLoraTriggerWords } from "@/utils/lora-trigger-words";

/**
 * words 接收来源中的整组触发词，数组项允许含多个逗号标签。
 * 例如 ["foo, bar", "baz"] 应成为三颗独立按钮，而不是两块文字。
 * 英文逗号、中文逗号和换行遵守创建页已有拆分规则。
 * 标签内部的空格保留，所以 breast hug 仍是一颗标签。
 * 空白项和尾随逗号不生成空按钮。
 * 同组重复项复用创建页的忽略大小写规则，保留第一次出现的拼写。
 * 此处把空提示词交给同一计算器，意思是尚未加入任何词。
 * 它只做内存文字计算，不会把内容自动写入创建页。
 * 复制全部按照用户约定以逗号连接，并保留最后一个逗号。
 * 单标签复制保留纯词，不添加逗号或其他标签。
 * 两种复制共用一个失败边界，拒绝剪贴板权限时明确提示。
 * 提示只在异步复制完成后显示，不提前声称成功。
 * 没有标签时不显示空标题或可复制的空按钮。
 * 复制不改变模型选择，也不触发资料补全或下载。
 * 标签用原生按钮支持键盘 Enter、Space 和焦点提示。
 * 长标签在按钮内部换行，不能把整个右栏撑出横向滚动。
 * 整个区域保留可选择的文本，复制失败仍可手工处理。
 * 状态提示复用全局 Toast，不为每颗标签开启定时器。
 * 多个详情实例只共享展示规则，不共享当前标签数组。
 * 组件没有订阅或资源句柄，切换版本不需要额外清理。
 * data 标记供真实页面回归定位，不向业务提供测试开关。
 * 数据示例：foo,bar,, 得到 foo 与 bar，复制整组是 foo,bar,。
 * 全部复制不插入空格，避免调用方再猜分隔风格。
 * 展示标签会裁掉两端空白，单词内部的标点和字母大小写不被翻译。
 * 触发词属于模型约定，切换语言只改“触发词”和“复制”的操作文案。
 * 不按下划线、括号或冒号拆分，这些字符可能就是模型训练时的标签。
 * 拆分不是自然语言分词；一个带空格的动作短语仍需作为整体复制。
 * 输出去重不回写 sidecar，用户原始资料的顺序和排版仍保留在文件里。
 * 创建页需要追加到提示词时仍使用自己的业务入口，点击标签不偷偷生成图片。
 * 标题右侧的按钮只处理当前版本，不混入同模型其他版本的触发词。
 * 复制按钮无 form 提交语义，不会在下载表单附近误触开始下载。
 * 单标签没有悬浮大图或选择弹窗，重复点击仍然只是复制这个词。
 * 等待复制期间不占用模型下载锁，文字操作与权重文件事务互不阻塞。
 * 用户取消或系统拒绝权限时不重试，避免连续弹出系统授权提示。
 * copyText 返回 false 同时涵盖空内容和浏览器拒绝，统一用已有失败提示。
 * 标签先过滤为空，所以正常渲染的操作不会刻意提交空字符串。
 * Toast 文案不包含模型路径、API 密钥或触发词内容，避免无必要的信息外露。
 * 异步回执不调用组件 setState，因此离开详情后也不会写回旧版本界面。
 * 此处没有复制历史缓存，关闭详情后不会另存一份用户提示词。
 */
export function ModelTriggerWords({ words }: { words: string[] }) {
  const { t } = useTranslation();
  // 原始数组项像分开的词卡，每张词卡还可能通过真实换行写了几组。
  // 先按数组与实际换行确定分组，再在每组里复用逗号拆分器。
  // 浏览器因栏宽产生的视觉折行不在字符串内，不能据它切断长短语。
  // 每组分别去重，保留同一个词在不同组中的语义归属。
  // 空行或只有逗号的行被丢弃，不为它们画空底板。
  // 分组只影响详情展示，下载与创建页仍消费原始触发词数据。
  // 全部复制按显示顺序展开所有组，仍使用用户要求的逗号格式。
  const groups = words.flatMap(word => word.split(/[\r\n]+/))
    .map(word => missingLoraTriggerWords([word], ""))
    .filter(group => group.length > 0);
  const tags = groups.flat();
  const copy = async (text: string) => {
    const copied = await copyText(text);
    useToastStore.getState().show(t(copied ? "create.promptAssistant.copied" : "common.copyFailed"));
  };
  if (!tags.length) return null;
  return <section data-model-trigger-words className="space-y-2 text-xs">
    {/* 触发词：标题旁复制整组，标签自身只复制当前词，不嵌套可交互按钮。 */}
    {/* 标题与按钮分别占据左右两侧，长标签不会挤走复制入口。 */}
    {/* 复制按钮采用已有蓝色工具操作样式，深浅主题共用语义背景。 */}
    <div className="flex items-center justify-between gap-2"><h5 className="font-medium">{t("toolBox.civitai.words")}</h5><button type="button" data-copy-trigger-words onClick={() => { void copy(`${tags.join(",")},`); }} className="inline-flex shrink-0 items-center gap-1 rounded text-blue-500 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Copy size={12} />{t("common.copy")}</button></div>
    {/* 单词区保持完整内容，省略号只用于模型说明，不截断待复制的标签。 */}
    {/* 所有标签共享同一个回调，在线和本地不分别维护一份点击复制逻辑。 */}
    {/* 同组内用标签作键；组键附带原始次序，允许两组包含完全相同的内容。 */}
    {/* 组数不由卡片宽度决定，窗口缩小时只会在当前组内自然换行。 */}
    {/* 分组底板使用主题语义色，不把截图里的深色写死到浅色主题。 */}
    {/* 单个数组项中的英文逗号只分标签，不产生另一块组底板。 */}
    {/* 每组保留独立间距，让角色词、服装词等原始段落一眼可分。 */}
    <div data-local-trigger-words className="space-y-2">{groups.map((group, index) => <div key={`${index}:${group.join(",")}`} data-model-trigger-group className="flex flex-wrap gap-1 rounded-md bg-muted/40 p-1.5">{group.map(tag => <PromptTag key={tag} label={tag} data-copy-trigger-word onClick={() => { void copy(tag); }} />)}</div>)}</div>
  </section>;
}
