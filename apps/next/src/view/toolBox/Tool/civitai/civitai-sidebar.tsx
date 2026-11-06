"use client";

// 在线类别和基础模型筛选移到侧栏，列表请求契约仍来自原 CivitaiFilters。
// 筛选只改变远端参数，不能把远端类型伪装成本地已安装目录。
import { useState, type ReactNode } from "react";
import { SimpleSelect } from "@/components/SimpleSelect";
import { useTranslation } from "@/i18n";
import { CIVITAI_SOURCES, type CivitaiFilters } from "@/utils/civitai";
import { ModelLibraryChoices } from "./model-library-controls";
import styles from "./local-model-library.module.css";

/**
 * 在线侧栏与本地目录相似，但数据含义不同：
 * 官方类型是 Civitai 接口枚举，不能直接拿本地 loras 根目录名发给网站。
 * LORA 与 Checkpoint 的大小写遵循既有请求适配器，不按展示文本再拼参数。
 * Embedding 的接口值是 TextualInversion，展示标签只是便于用户识别。
 * 选中类型仍保留基础模型条件，两项筛选按交集提交，不轮流覆盖对方。
 * 基础模型区域是可选系列筛选，不代表用户硬盘里已经有这个主模型。
 * bases 由父级合并初始系列、当前条件和请求结果，侧栏不另发一个分类探测请求。
 * 系列选项的排序由父级决定，局部检索只缩小可见项而不改变稳定的 value。
 * 本地 query 只是寻找一个系列按钮，例如输入 anima 不会立刻搜索模型名称。
 * 中间搜索框提交的 filters.query 保持独立，局部检索失败也不能清空它。
 * 没有匹配系列时仍保留“全部基础模型”入口，用户不必先删完文本才能退出筛选。
 * 已选系列可能被局部文本暂时过滤掉，下面清除按钮仍能解除真实条件。
 * 清除只去掉 base，不能把用户选的模型类型和排序一起重置。
 * 底部重置恢复原排序和分类条件，保留已提交搜索及当前 API 来源。
 * 重置同时清掉侧栏检索草稿，避免条件已恢复但可见选项仍像被过滤。
 * 来源菜单只列 CIVITAI_SOURCES 中的受支持地址，不提供任意主机输入框。
 * 展示 hostname 便于识别，回调仍传完整受支持来源值给原请求层。
 * 换来源之后旧详情由父级清理，侧栏不让上一个站点的模型继续触发当前站点下载。
 * 在线模型总量无法从一页响应推导，所以分类没有假的数字装饰。
 * 每个 ModelLibraryChoices 实例都有独立折叠状态，收起类型不会把系列也收起。
 * 侧栏是自身滚动区，选项多时不把底部重置和应用导航挤出窗口。
 * 库切换在滚动区外，长分类列表不会导致“本地模型”入口无法找到。
 * 使用既有 SimpleSelect 保留键盘选择和弹层定位，不能换成系统默认 select 外观。
 * 搜索标签和空态文字继续使用既有 i18n，英文界面不靠中文内容做条件判断。
 * 查询不包含正则或脚本解释，只做大小写不敏感的包含匹配。
 * 只有点击实际条件才通知 onChange，展开折叠、侧栏打字都不触发远端请求。
 * 远端错误和重试位于中间目录，侧栏不隐藏条件来假装请求成功。
 * 侧栏没有写入用户配置或持久化偏好，切换模型库后由原页面生命周期初始化。
 */
/**
 * 侧栏细节与可访问性约定：
 * switcher 由模型库页传入，在线和本地因此使用同一组选项及选中状态。
 * 来源选择组件接收受限选项，不允许用户输入脚本或任意网站地址。
 * 每个标签旁是否有数字取决于上游的确定数据，不由侧栏猜测总数。
 * 折叠共享控件是同一个公共组件的两个实例，内部 open 状态天然独立。
 * 视觉折叠不清空过滤，恢复分组时用户仍看见刚才选中的条件。
 * 基础系列过滤文字和主模型查询框使用独立输入，不发生意外的双重搜索。
 * 该局部输入只影响侧栏候选列表，用户无需等待网络结果才能看到候选是否存在。
 * 选项为空时呈现明确空态，All 基础模型入口仍可以清除服务器系列条件。
 * 清除单个 base 不会更改原始模型类型，避免用户以为操作已恢复全部分类。
 * 底部 reset 是显式业务动作，因此会恢复原顺序和类型并通知上级请求刷新。
 * reset 保留用户输入的正式名称查询及来源，因为它们不是高级筛选草稿。
 * 局部系列文本在 reset 时清空，否则筛选已被重置但可选项仍隐藏会产生错觉。
 * 父级会在条件变化时同步重置 selected，侧栏不直接知道当前详情的具体模型。
 * 筛选值用 API 的真实枚举，显示标签通过 i18n 提供，二者不必字面相同。
 * 来源 hostname 从 URL 解析但最终提交原白名单地址，而不是重新拼接域名。
 * 目录滚动高度限制在左侧栏内部，页面底部重置按钮一直保留可见。
 * 展开或收起时不触发 query hook，只有更改确切过滤条件才产生请求。
 * 切换在线和本地业务由外层控制，此组件仅通过插槽展示切换按钮。
 */
interface SidebarProps { switcher: ReactNode; filters: CivitaiFilters; bases: string[]; onChange: (filters: CivitaiFilters) => void }
// 基础模型名字检索只过滤侧栏选项，不把文本当成用户已提交的模型搜索。
// 在线来源沿用受限来源列表，不能输入任意地址绕过请求适配器。
// 当前基础模型即使暂不在本页结果中仍由上层保留，翻页不会清掉筛选。
export function CivitaiSidebar({ switcher, filters, bases, onChange }: SidebarProps) {
  const { t } = useTranslation(), [query, setQuery] = useState("");
  const matches = bases.filter(base => base.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const types = [{ value: "", label: t("toolBox.civitai.all") }, { value: "Checkpoint", label: "Checkpoint" }, { value: "LORA", label: "LoRA" }, { value: "TextualInversion", label: "Embedding" }];
  return <><div className={styles.librarySwitch}>{switcher}</div><div className="min-h-0 flex-1 overflow-auto px-3 py-4" data-civitai-sidebar>
    {/* 在线侧栏：与本地官方类别复用同一个导航项，切换只回调当前来源筛选。 */}
    {/* 不显示未知总数，避免将当前一页十二条当作整个网站的分类计数。 */}
    <ModelLibraryChoices label={t("toolBox.civitai.officialModels")} items={types} current={filters.type} dataKey="civitai-type" onChange={type => onChange({ ...filters, type })} />
    <section className="mt-4 space-y-3 border-t border-border pt-4"><label className="block space-y-2 text-xs text-muted-foreground"><span>{t("toolBox.civitai.source")}</span><SimpleSelect value={filters.source} options={CIVITAI_SOURCES.map(source => ({ value: source, label: new URL(source).hostname }))} onChange={source => onChange({ ...filters, source })} ariaLabel={t("toolBox.civitai.source")} /></label></section>
    {/* 基础模型：侧栏内局部检索，不同于中间的模型名称搜索。 */}
    {/* 全部和清除入口仍保留，选中一个系列后始终能够回到无系列过滤。 */}
    <section className="mt-4 space-y-3 border-t border-border pt-4"><label className="block space-y-2 text-xs text-muted-foreground"><span>{t("toolBox.civitai.filter")} · {t("toolBox.civitai.base")}</span><input value={query} onChange={event => setQuery(event.target.value)} aria-label={t("toolBox.civitai.baseSearch")} placeholder={t("toolBox.civitai.baseSearch")} className="w-full min-w-0 rounded-md border border-border bg-transparent px-2 py-2 text-xs outline-none focus:border-primary" /></label><ModelLibraryChoices label={t("toolBox.civitai.base")} items={[{ value: "", label: t("toolBox.civitai.baseAll") }, ...matches.map(value => ({ value, label: value }))]} current={filters.base} dataKey="civitai-base" onChange={base => onChange({ ...filters, base })} />{!matches.length && <p role="status" className="text-xs text-muted-foreground">{t("toolBox.civitai.baseEmpty")}</p>}{filters.base && <button type="button" aria-label={t("toolBox.civitai.clearBase")} onClick={() => onChange({ ...filters, base: "" })} className="text-xs text-primary">{filters.base} ×</button>}</section>
  </div><div className={styles.scanActions}><button type="button" onClick={() => { setQuery(""); onChange({ ...filters, base: "", type: "", sort: "Most Downloaded" }); }}>{t("toolBox.civitai.reset")}</button></div></>;
}
