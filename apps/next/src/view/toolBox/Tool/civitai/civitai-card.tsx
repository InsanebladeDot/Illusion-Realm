"use client";

// 在线模型只做展示适配：图片读取、模型身份与本地匹配提示保持原有规则。
// 与本地模型引用同一张 Card，避免两个入口分别维护封面比例和长文本行为。
import { useTranslation } from "@/i18n";
import { Download, MessageCircle, ThumbsUp } from "lucide-react";
import type { CivitaiModel } from "@/utils/civitai";
// 卡片只消费匹配证据，不读取 JSON 或请求本地模型哈希。
// 类型保留名称与摘要的差别，显示的提示必须与实际判断依据一致。
import type { CivitaiLocalMatch } from "@/utils/civitai-local-models";
import { CivitaiImage } from "./civitai-image";
import { formatBytes } from "@/utils/format";
import { ModelLibraryCard } from "./model-library-card";
// CSS module 会生成局部类名，必须通过 styles 取值，裸字符串无法命中模块规则。
// 信息层与本地卡片仍从同一模块读取布局，不另加在线专属全局覆盖。
// 列表和网格的文字排布由父级 data-view 区分，业务数据与点击回调无需分叉。
import styles from "./local-model-library.module.css";

/**
 * 在线 Card 适配保留的数据语义：
 * 网站的 model.id 是模型身份，不能拿封面 URL 或模型名代替它做选中判断。
 * 封面沿用第一个可用版本预览，点开详情后仍由原详情组件管理版本内切图。
 * 图片节点以 URL 为 key，换图会清理上一张的失败状态，不沿用旧占位结果。
 * localMatch 只提示至少一份文件有本地证据，不表示所有网站版本都已安装。
 * name 要求本地文件夹与网站标题、文件前缀分别完全相同，不只看文件名。
 * sha256 仅比较来源 JSON 已保存的摘要，不宣称本轮读取权重做了完整性校验。
 * 缺少证据时不显示标记，不能把来源加载中误报为严格同名或摘要匹配。
 * 两种角标复用同一个位置，匹配成功不能挤掉模型类型或另建一套卡片布局。
 * 提示词条按判定类型选择，切换语言时无需重读磁盘或重新判断身份。
 * DOM 只记录 name 或 sha256 这类判定，不输出真实用户路径或来源 JSON 内容。
 * 名称提示明确提醒没有校验内容，让用户可以自行决定是否再次下载验证。
 * 该提示不禁用下载，用户仍可能需要同一个模型的另一个版本。
 * 统计字段先核对 number，未提供的字段省略，不能把未知量显示成精确零。
 * 数字采用当前语言的紧凑格式，不把中文“万”写死到英文界面。
 * 作者与统计通过同一个 subtitle 传入，公共层仍无需认识 Civitai 的字段名。
 * 很长的第二行由 Card 统一省略，完整内容保留悬停标题供用户核对。
 * 模型类型与基础系列合并成角标提示，但卡片不会根据角标自行过滤数据。
 * 角标沿用原版前三个字符大写缩写，最多显示三个系列，其余精确计为总数减三。
 * 类型和加号计数不压缩，中间三个缩写承担窄卡省略，胶囊始终维持单行。
 * title 保留完整系列列表，缩写只改变展示，不能改变实际筛选枚举。
 * 卡片只收到 onSelect，没有直接下载回调，因此点封面不会无提示开始写模型文件。
 * 在线与本地共用选中描边，淡色视觉变更无需在两个入口各写一次。
 * 这里没有文件系统路径处理，线上名称不能被误用作任意本地保存地址。
 * 实际下载的文件名、校验摘要和保存位置仍由详情表单与主进程服务决定。
 */
export function CivitaiCard({ model, selected, localMatch = null, onSelect }: { model: CivitaiModel; selected: boolean; localMatch?: CivitaiLocalMatch; onSelect: () => void }) {
  const { t, locale } = useTranslation();
  const image = model.versions.flatMap(version => version.images)[0] || "";
  // 在线统计进入图片底部独立信息层，字段缺失就省略，不伪造零值。
  const count = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const stats = [{ key: "downloadCount", Icon: Download }, { key: "thumbsUpCount", Icon: ThumbsUp }, { key: "commentCount", Icon: MessageCircle }].filter(item => typeof model.stats[item.key] === "number");
  // 在线列表只展示首版本的主文件大小，不能把所有版本体积累加成单次下载量。
  // 优先选择网站标记的 primary 文件；没有标记时沿用首文件作代表。
  // 该体积来自网站 KB 元数据，换算字节后复用本地相同的格式化工具。
  // 未提供文件或有效体积时省略，避免把未知下载大小说成零字节。
  // 基础模型以这个版本声明为准，无版本声明才使用网站模型的系列列表。
  // 这个摘要不改变实际下载选择，详情仍可切换其他版本和量化文件。
  // 在线与本地共用两行排版，但在线标题仍是网站模型名，不伪装成本地文件名。
  // 网站作者和统计仍在网格里保留，列表让位于兼容性与体积信息。
  const version = model.versions[0], file = version?.files.find(item => item.primary) || version?.files[0];
  const listAttributes = [version?.baseModel || model.baseModels.join(" / "), model.type, file && file.sizeKB > 0 ? formatBytes(file.sizeKB * 1024) : ""].filter(Boolean).join(" · ");
  // 在线资料层使用真正的局部类，作者、标题与统计才能在封面底部依次排列。
  // 这些类同时服务列表模式：仅调整布局，不丢失原来的统计和详情入口。
  // 长模型名的完整值仍保留在按钮辅助名称里，省略只作用于屏幕文字。
  // 在线封面与名称都选择模型并打开资料，和本地库保持同一个浏览顺序。
  // 大图入口留在详情的 CivitaiPreview，仍复用创建页的共享预览层。
  // 卡片不再构建整份预览图数组，避免浏览列表时提前持有无用的画廊数据。
  return <ModelLibraryCard name={model.name} listAttributes={listAttributes} subtitle={model.creator} overlay={<div className={styles.modelCardOverlayContent}><p>{model.creator}</p><h3>{model.name}</h3><div className={styles.modelCardStats}>{stats.map(({ key, Icon }) => <span key={key} title={count.format(model.stats[key])}><Icon size={11} />{count.format(model.stats[key])}</span>)}</div></div>} selected={selected} pressed={selected} onSelect={onSelect} attributes={{ "data-civitai-card": model.id }}
    cover={<CivitaiImage key={image} src={image} alt={model.name} className="absolute inset-0 h-full w-full object-cover" />}
    badges={<><span data-civitai-bases title={[model.type, ...model.baseModels].join(" · ")} className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-black/55 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-md"><span className="shrink-0 border-r border-white/40 pr-1.5">{model.type}</span><span className="min-w-0 truncate">{model.baseModels.slice(0, 3).map(base => base.trim().slice(0, 3).toUpperCase()).join(" ")}</span>{model.baseModels.length > 3 && <span className="shrink-0">+{model.baseModels.length - 3}</span>}</span>{localMatch && <span data-civitai-local-match={localMatch} title={t(localMatch === "name" ? "toolBox.civitai.localNameMatchHint" : "toolBox.civitai.localMatchHint")} className="rounded-full bg-primary px-2 py-1 text-[9px] text-primary-foreground">{t(localMatch === "name" ? "toolBox.civitai.localNameFound" : "toolBox.civitai.localFound")}</span>}</>} />;
}
