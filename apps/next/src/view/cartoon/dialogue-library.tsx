"use client";

/** 模板面板：分类与搜索仅过滤资源，不把筛选结果当作画布图层列表。 */
// 内置模板与用户自定义图片共用同一张LibraryCard，不复制第二套素材卡。
// 卡片点击通过onAdd注入真实添加动作，公共卡片不拥有图层或历史。
// 分类控件复用SimpleSelect，保留全项目相同的菜单与键盘行为。
// 搜索只查询本地静态名称、用途和分类，不访问网络或扫描模型目录。
// 类别与query保存在本面板，另一工具或另一个实例不会跟着切换。
// 清空搜索恢复全部素材，不删除用户刚刚放到画布的气泡。
// 自定义素材只显示已成功恢复的记录，加载失败必须报告，不能伪装空库。
// 卡片展示空白轮廓与用途；选择后才把当前语言的样例放入独立文字层。
// 内置id稳定，筛选和排序不会让React把上一张预览借给另一张卡。
// 48种样式共享一个map循环，不为每种模板维护一个组件。
// 说明作为subtitle传入公共卡片，长文本沿用其省略与title机制。
import { useState } from "react";
import { useTranslation } from "@/i18n";
import { SimpleSelect } from "@/components/SimpleSelect";
import { LibraryCard } from "@/components/library/library-card";
import { templateText, type DialogueTemplate } from "./dialogue-data";

// 分类id来自固定六类，不把界面名称写入筛选状态。
// 语言改变后label更新，已选择的category仍能匹配同一类模板。
// 自定义素材另有custom类别，避免把它们错误归为基础对白。
// “全部”是查询条件，不复制到每一项模板的分类数组。
const CATEGORIES = ["basic", "emotion", "narration", "digital", "fantasy", "manga"] as const;

export function DialogueLibrary({ items, selected, onAdd, status }: { items: DialogueTemplate[]; selected: string | null; onAdd: (item: DialogueTemplate) => void; status: string }) {
  // items是完整可用目录，visible只是本次筛选的视图，不能传回宿主替换目录。
  // category为all时跳过类别约束，仍保留query，因此“全部”不等于清空所有条件。
  // query先去首尾空格再转小写，用户粘贴带空格的名称不应无故无结果。
  // 名称、用途和当前类别名称组成同一搜索串，允许用户按“旁白”这类用途检索。
  // 没有把sample对白纳入搜索，避免通用样例词让多个无关轮廓一起命中。
  // 没有模糊纠错或云端扩展，零结果只表达当前本地目录不匹配。
  // toLocaleLowerCase处理大小写，不做拼音、日文假名或繁简自动转换承诺。
  // 类别label每次从t读取，语言切换后选项文字会更新，但value保持固定英文id。
  // 这里的custom筛选只包含宿主已经恢复的合法素材，不重新读取用户文件。
  // status可能是加载或读取错误，均与visible是否为空分别呈现。
  // 例如自定义加载失败而基础模板可用，页面应同时有错误提示和可选内置卡片。
  // 选择custom且确实没有资源时，显示无匹配素材，不制造默认自定义卡占位。
  // selected取当前层templateId，表示这一层从何种轮廓创建，并非整个作品只能用一款。
  // 点已选卡仍调用onAdd，允许同一个样式在作品中出现两次。
  // 同款实例之间的文字差异不展示在库卡上，目录预览只负责辨认轮廓。
  // LibraryCard的title与subtitle接收已翻译纯文字，卡片无需知道dialogue命名空间。
  // badge接收类别标签，公共卡片不负责从templateId拆出所谓系列名称。
  // previewFit=contain让尾巴、阴影完整显示，默认cover的其他资料库不受改变。
  // 完整轮廓周围的透明留白是素材本身，不以裁切放大方式假装填满卡片。
  // 卡片保留4:5公共几何，所以这里没有另做一套对话框专用底部文字布局。
  // 图片错误由LibraryCard按失败地址回退，搜索来回切换不触发无限下载重试。
  // 同一id在列表中只对应一条目录记录，React key不能取翻译后名称。
  // 两个不同样式可能有相近显示名，id仍能防止搜索后把旧图片借给另一项。
  // 组件没有onDelete，因为目录条目不等于作品图层，不能在库中Delete删画布。
  // 取消弹窗由外壳处理，库只通知明确的样式选择，不直接调用路由返回。
  // 分类下拉使用portal避免被库的overflow-hidden裁掉，列表滚动仍归下方容器。
  // 搜索栏保持固定，用户浏览很多素材后无需滚回顶部才能收紧条件。
  // 网格断点由已有Tailwind窗口规则决定，不通过JS反复测量每张卡宽度。
  // 卡片数随查询变化，空态与网格互斥，不保留一批不可见的可聚焦卡片。
  // 全部过滤都是同步纯计算，没有“搜索完成”成功提示或假的请求加载计时。
  // 此库不请求ComfyUI，也不把模板PNG当作生成模型传给Agent。
  // 参数onAdd保留完整目录对象，宿主不需要按显示名再查一次可能重名的素材。
  // 就像筛选菜单不会撤走桌上已经点好的菜，找样式不应改变作品。
  // 对应的机制是query/category仅在本组件，作品layers在外层编辑器。
  const { t } = useTranslation(), [query, setQuery] = useState(""), [category, setCategory] = useState("all");
  const options = [{ value: "all", label: t("dialogue.all") }, ...CATEGORIES.map(value => ({ value, label: t(`dialogue.categories.${value}`) })), { value: "custom", label: t("dialogue.custom") }];
  const visible = items.filter(item => (category === "all" || item.category === category) && `${templateText(item, "name")} ${templateText(item, "use")} ${options.find(option => option.value === item.category)?.label ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <aside data-dialogue-library className="flex h-full min-h-0 flex-col overflow-hidden bg-background/80">
    {/* rail：素材标题、搜索与分类固定，只有卡片列表承担纵向滚动。 */}
    {/* 分类选择不清空搜索，两个条件共同收敛用户要找的样式。 */}
    {/* 原生search输入保留清除按钮、键盘焦点和真实受控值。 */}
    <div className="space-y-2 border-b border-border p-3"><h2 className="text-sm font-medium">{t("dialogue.library")}</h2><input data-dialogue-search type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t("dialogue.search")} placeholder={t("dialogue.search")} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><SimpleSelect ariaLabel={t("dialogue.library")} value={category} onChange={setCategory} options={options} portal /></div>
    <div data-dialogue-template-list className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
      {status && <p role="status" className="mb-2 text-xs text-muted-foreground">{status}</p>}
      {visible.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visible.map(item => <LibraryCard key={item.id} prefix="dialogue-template" id={item.id} title={templateText(item, "name")} subtitle={templateText(item, "use")} preview={item.src} previewFit="contain" badge={options.find(option => option.value === item.category)?.label} selected={item.id === selected} onSelect={() => onAdd(item)} />)}</div> : <p role="status" className="p-3 text-xs text-muted-foreground">{t("dialogue.empty")}</p>}
    </div>
  </aside>;
}
