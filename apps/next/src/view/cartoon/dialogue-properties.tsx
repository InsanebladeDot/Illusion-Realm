"use client";

/** 属性区：共享编辑器控件通过字段配置绑定气泡参数，导入导出由宿主回调执行。 */
// 不为字号、宽度和透明度分别手写输入框，统一复用EditorFloatField的草稿确认机制。
// 数字输入到失焦或Enter才提交，用户先输入1时不会立刻被最小值强制改写。
// 按钮、折叠组、禁用说明沿用已完成的视频编辑器公共控件。
// 两个工具仅共用控件，不共享素材状态、播放器、时间线或业务请求。
// 未选中气泡时只展示真实空态，不用默认选中的假对象占据属性表。
// 当前图层的文本与方向属于该层，切换选择不会改动其他气泡。
// 导出按钮只有存在图层时可用，busy禁止重复提交真实PNG编码。
// 本组件不读写文件，点击只是把意图交给页面级导入和导出流程。
// 背景导入入口在无选中时也可用，不要求先添加某种模板。
// 长图层文本在列表省略，完整内容始终在右侧textarea可编辑。
// 颜色使用现有ColorPicker，不打开另一套系统色框或复制颜色公式。
import { Download, ImagePlus, MessageSquarePlus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import { SimpleSelect } from "@/components/SimpleSelect";
import { ColorPicker } from "@/components/color-picker";
import { EditorAction, EditorFloatField, EditorGroup, EditorPlaceholder } from "@/view/toolBox/Tool/video/editor/editor-controls";
import { templateText, type DialogueTemplate } from "./dialogue-data";
import { layoutDialogue } from "./dialogue-render";
import type { DialogueLayer } from "./dialogue-types";
import type { useDialogueEditor } from "./use-dialogue-editor";
// 字体与正文复用同一图层补丁入口，异步字体加载保持独立错误边界。
// 单击只选择样式目标，正文许可由editor.editing单独注入。
// 两个控件按图层id重新挂载，不持有其他实例的草稿或迟到请求。
import { DialogueFontPicker } from "./dialogue-font-picker";
import { DialogueTextInput } from "./dialogue-text-input";
// 属性区没有复制视频控件的数字草稿逻辑，只为本工具传入focusTone展示参数。
// 淡焦点仍保留可见轮廓，非法数字的错误边框和文字提醒不受影响。
// 默认属性输入保持单列，新增字体菜单不重新挤成两列造成窄竖线问题。
// 正文锁定提示位于正文下面，不给字号字段添加误导性的“双击才能调整”说明。
// 方向、对齐、色板与字体都是样式设置，选中后始终可以正常使用。
// 完成按钮只显示于已解锁状态，未解锁时用可见提示说明进入方式。
// 反复打开字体菜单不增加撤销步骤，真正加载成功并提交新id才是内容修改。
// 字体加载错误属于当前选择器，不覆盖背景导入或导出的页面级错误。
// 右栏继续独立滚动，字体说明加长时不会推走底部固定导出入口。
// LayerProperties的key保持图层UUID，字体异步状态不因模板名相同而共用。
// 模板说明、文字计数和字体名称都不参与成品SVG，只是用户编辑信息。
// 字段数组仍是数字参数唯一配置，顶部旋转手柄与数组rotation项读写同一字段。

// 字段名必须来自实际的数值参数，不能把text、id或direction交给数值控件。
// min/max/precision是控件的输入契约，不在每个onChange中写不同的纠正逻辑。
// width改变框的比例尺寸，fontSize独立控制字的自然像素大小。
// lineHeight为倍率，spacing为像素，在界面与SVG排版中保持相同含义。
// opacity以0..1保存，避免显示100%却把100作为图层alpha提交。
// rotation允许负角度，用户可以顺时针或逆时针调整。
// 字号最高200，与旧合成器支持范围一致，不强迫所有模板使用样例小字号。
// 字距最低-1，保证字格不会因为负推进量倒退或进入无限换行。
// 参数数组是静态定义，不混入某个选中图层的值。
// 每次渲染都从selected读取值，撤销重做可同步回填控件。
// 不通过数组下标绑定参数，未来调整字段顺序也不会把字号改成宽度。
// 文案键与实际字段对应，双语表缺字段会触发TypeScript错误。
const FIELDS = [
  // lineHeight保留两位小数，1.45这样的默认阅读节奏不会被变成1.5。
  // spacing保留一位小数，允许在较小字体中微调字与字之间的距离。
  // width只改变整个画片比例，高度始终从素材比例派生，不提供容易拉坏模板的独立高度。
  // rotation是整体旋转，而direction是字排方式，两者不能合并成一个横竖切换值。
  // opacity存小数便于直接传SVG，字段标签不附百分号以免误导输入100。
  // 数组中key是补丁字段，不能改成翻译后的标题，否则语言切换后无法写回层。
  // precision只影响数值确认，未确认草稿可暂时包含负号、空串或小数点。
  // 约束由共享控件执行，map中的回调不再静默夹值，错误会留在具体字段旁。
  { key: "fontSize", min: 8, max: 200, precision: 0 },
  { key: "lineHeight", min: .8, max: 3, precision: 2 },
  { key: "spacing", min: -1, max: 20, precision: 1 },
  { key: "width", min: 80, max: 3000, precision: 0 },
  { key: "rotation", min: -180, max: 180, precision: 0 },
  { key: "opacity", min: 0, max: 1, precision: 2 },
] as const;

// hook返回值只在本工具内组合，不成为全局编辑器接口或跨进程类型。
// onImport与onExport无文件参数，由宿主保留文件输入和导出SVG引用。
// 自定义模板名通过name覆盖翻译值，用户文件名不会错误当作语言key。
// 状态来自真实异步流程，不在属性栏用定时器模拟完成。
interface PropertiesProps {
  editor: ReturnType<typeof useDialogueEditor>; templates: DialogueTemplate[];
  onImport: () => void; onExport: () => void; importing: boolean; exporting: boolean;
  // 模板入口与背景导入分开，点击只打开资源弹窗，不自动新增默认气泡。
  // 页面的回调决定弹窗展示方式，属性组件不持有另一份库筛选状态。
  // 真实选择完成后由宿主添加图层，按钮本身不显示虚假的添加成功。
  onTemplates: () => void;
}

export function DialogueProperties({ editor, templates, onImport, onExport, importing, exporting, onTemplates }: PropertiesProps) {
  // editor.selected可能为空，也可能因资源目录更新暂时找不到模板信息。
  // 两者均不应创建默认图层顶替，而应展示“选择素材”空态。
  // item按templateId取样式，patch按layer.id取实例，两种身份不能互换。
  // 例如两个classic-left分别写A和B，修改B只传B的UUID。
  // patch内部再检查layer，允许控件事件晚一帧到达时安全忽略无选中状态。
  // 这里不依赖DOM寻找选框，画布和属性的选中事实都来自同一editor参数。
  // 文档尺寸判断只选择横竖预设，不会自动改写导入图片的真实尺寸。
  // 非预设尺寸显示实际宽高，例如1080乘1080方图不能被误标成竖版3:4。
  // 用户主动选择预设才改变画稿，不在读取属性时强制调整为900乘1200。
  // 横竖切换把尺寸与气泡相对位置一次提交，撤销能完整恢复上个构图。
  // 清除背景只改变background，不顺便重置画稿比例、文字或图层顺序。
  // 撤销后即使原选中id不存在，历史文档仍有效，属性会自然进入空态。
  // 图层列表序号由当前数组生成，不把#2这样的展示顺序当持久化主键。
  // 列表title保留完整正文，truncate仅节约一行高度，不删除原文。
  // 空正文用模板名称帮助辨认，不能用空字符串生成一个看不见的按钮。
  // 列表选中不改变z顺序；点后方气泡的列表项可以编辑它，而不把它偷偷移到最前。
  // 层次调整不是本次新增能力，列表按钮没有伪装成拖拽排序手柄。
  // 模板入口与导入背景入口始终独立，用户无需先选中气泡才能打开资源库。
  // exporting和importing来自宿主两个真实状态，公共控件只负责显示对应等待外观。
  // 不把EditorAction的busy当成异步任务执行器，Promise生命周期仍归页面。
  // 没有图层时exportHint解释禁用，带背景但没有气泡也仍遵循当前成品导出规则。
  // group的折叠状态归共享组件实例，不因另一个工具收起同名组而同步收起。
  // 右栏固定280像素来自当前布局，字段内部使用可收缩网格，不再设置另一套外宽。
  // 类比检查表只填写当前选中物件：改变检查表目标不应搬动桌上其他物件。
  // 真实机制是受控layer参数和仅包含变化字段的Partial补丁。
  const { t } = useTranslation(), layer = editor.selected, item = templates.find(template => template.id === layer?.templateId);
  const patch = (values: Partial<DialogueLayer>) => { if (layer) editor.patch(layer.id, values); };
  return <aside data-dialogue-properties className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background/80">
    {/* side：属性标题和撤销工具固定，字段与图层列表独立滚动。 */}
    {/* aside外框使用主题语义色，白色作品底纸不应传染到整个属性面板。 */}
    {/* 头部动作采用同一EditorAction，禁用按钮不会仍持有一个假成功回调。 */}
    {/* canUndo/canRedo由内容历史产生，模板筛选和选中变化不会点亮这两个按钮。 */}
    {/* onTemplates只表达打开意图，属性组件不再挂第二份48卡片目录。 */}
    {/* 滚动区的scrollbar-gutter给滚动条留位，字段增减时左右位置不会轻微跳动。 */}
    {/* 图层按钮是原生button，空格与回车使用浏览器默认激活，避免手写重复键盘逻辑。 */}
    {/* 属性组key取层id，切到另一个实例时共享数值控件的未提交草稿重新归属。 */}
    {/* 不给所有字段加全局keyup，Delete保护由编辑器统一判断输入目标。 */}
    {/* 底部导出区域与字段滚动是兄弟节点，长文字不能把唯一导出按钮推到页面外。 */}
    {/* 窄窗时整个regions可滚动到属性区，内部字段仍使用同一组件和回调。 */}
    {/* 选中气泡不改变素材筛选，搜索也不清空当前文字参数。 */}
    {/* 无历史用真实禁用控件，不生成点了却无反馈的假成功。 */}
    <div className="border-b border-border p-3"><h2 className="mb-2 text-sm font-medium">{t("dialogue.properties")}</h2><div className="flex gap-2"><EditorAction icon={Undo2} label={t("dialogue.undo")} compact onClick={editor.canUndo ? editor.undo : undefined} /><EditorAction icon={Redo2} label={t("dialogue.redo")} compact onClick={editor.canRedo ? editor.redo : undefined} /><EditorAction icon={ImagePlus} label={t("dialogue.background")} busy={importing} onClick={onImport} /></div></div>
    {/* side：新增模板入口固定在属性栏，默认无需为整个模板库保留第三栏。 */}
    {/* 用户选择后再添加，取消弹窗不会创建气泡或修改当前选中项。 */}
    {/* 按钮复用EditorAction，键盘焦点与禁用外观保持同一规范。 */}
    <div className="shrink-0 border-b border-border px-3 py-2"><EditorAction icon={MessageSquarePlus} label={t("dialogue.chooseTemplate")} onClick={onTemplates} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]">
      <EditorGroup title={t("dialogue.canvas")}><SimpleSelect value={editor.doc.width === 1280 && editor.doc.height === 720 ? "landscape" : editor.doc.width === 900 && editor.doc.height === 1200 ? "portrait" : "current"} ariaLabel={t("dialogue.canvas")} options={[{ value: "current", label: `${editor.doc.width} × ${editor.doc.height}` }, { value: "landscape", label: t("dialogue.landscape") }, { value: "portrait", label: t("dialogue.portrait") }]} onChange={value => { if (value === "current") return; editor.change(doc => ({ ...doc, width: value === "portrait" ? 900 : 1280, height: value === "portrait" ? 1200 : 720, layers: doc.layers.map(current => ({ ...current, x: current.x / doc.width * (value === "portrait" ? 900 : 1280), y: current.y / doc.height * (value === "portrait" ? 1200 : 720) })) })); }} portal />{editor.doc.background && <EditorAction label={t("dialogue.clearBackground")} onClick={() => editor.change(doc => ({ ...doc, background: "" }))} />}</EditorGroup>
      <EditorGroup title={t("dialogue.layers", { count: editor.doc.layers.length })}>
        <div className="space-y-1">{editor.doc.layers.map((current, index) => <button type="button" key={current.id} data-dialogue-select={current.id} aria-pressed={layer?.id === current.id} onClick={() => editor.select(current.id)} title={current.text} className={`block w-full truncate rounded-md border px-2 py-1.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring ${layer?.id === current.id ? "border-accent-stroke bg-accent-soft" : "border-border hover:bg-muted"}`}>#{index + 1} {current.text || templateText(templates.find(template => template.id === current.templateId) ?? templates[0], "name")}</button>)}</div>
      </EditorGroup>
      {layer && item ? <LayerProperties key={layer.id} layer={layer} item={item} editing={editor.editing} onEdit={() => editor.editText(layer.id)} onDone={() => editor.select(layer.id)} onPatch={patch} onRemove={editor.remove} /> : <EditorPlaceholder state="empty" message={t("dialogue.noSelection")} />}
    </div>
    {/* 底部导出使用自然画布尺寸；loading由真实PNG编码流程控制。 */}
    {/* 整个按钮体系共用EditorAction，禁用原因与键盘行为不再各写一套。 */}
    {/* 不显示假保存成功，浏览器最终下载路径仍由用户决定。 */}
    <div className="shrink-0 border-t border-border p-3"><EditorAction icon={Download} label={t("dialogue.export")} accent busy={exporting} disabledReason={!editor.doc.layers.length ? t("dialogue.exportHint") : undefined} onClick={onExport} /></div>
  </aside>;
}

// 属性分区以选中图层id作为key，输入草稿不会跨图层沿用。
// 值相同也不会共用另一个图层的中间输入，如尚未提交的负号或小数点。
// textarea保留换行，上限120字来自参考模板的短对白约束。
// textOverflow提醒只针对真实排版结果，不因为用户输入长文件名误报。
// 横竖排与对齐选项来自固定联合类型，SimpleSelect返回值缩窄后才写入。
// 色板的当前值转为hex，让内置rgb颜色与共享色板契约一致。
// 删除动作只通知宿主，历史与选中清理不藏在公共按钮内部。
// 模板用途与注意事项展示真实静态说明，不当作模型生成建议。
// 参数字段使用同一循环，后续改边框、字号、禁用态可以同步生效。
// 控件不接受任意JSON，用户只编辑可理解的文字与数值。
// 文字溢出时仍允许导出，预览所见的裁切与最终PNG一致。
// 调整字号不会重置文字、颜色或旋转，patch只包含本次字段。
// 对齐菜单使用当前层状态，默认center仅在新建实例时设置。
// 因为本组件没有副作用，切换选择不触发导入、自动补全或网络请求。
// 字体从本工具的离线目录按需加载，不恢复依赖Google网络CSS的旧方案。
// 编辑区错误由页面显示，属性空态不把加载错误伪装成成功选中。
function LayerProperties({ layer, item, editing, onEdit, onDone, onPatch, onRemove }: { layer: DialogueLayer; item: DialogueTemplate; editing: boolean; onEdit: () => void; onDone: () => void; onPatch: (values: Partial<DialogueLayer>) => void; onRemove: () => void }) {
  // onPatch只接受此工具的层字段，不接受任意组件状态或整个用户文档。
  // 动态数值补丁借用已知FIELDS的key，不用用户输入构造对象属性名。
  // textarea由layer.text控制，撤销恢复原文后输入框也必须显示恢复结果。
  // 输入框每次change是一条内容修改，当前没有对输入停顿作合并历史的承诺。
  // maxLength使用浏览器UTF-16计数，计数器按码点显示，组合字符时可能存在显示差异。
  // 上限针对短对白而非文件体积；不能把它误当作完整排版容量验证。
  // 实际容量还受框宽、字号、行高及横竖方向影响，因此另外显示overflow。
  // 例：相同20个字在字号24时可见，在字号200时可能被裁切而保留全文。
  // overflow是普通状态提醒，不能把它当网络异常清空正文或禁用所有参数。
  // 使用role=status让辅助技术能知道文字超框，但不反复弹出阻断操作的对话框。
  // direction的返回字符串先缩窄，未知选项不以类型断言强行写进联合字段。
  // align同样只认left、center、right，不能把翻译label直接存入文档。
  // 对齐列表从固定联合数组生成，三个选项共享一份onChange逻辑。
  // portal使下拉菜单离开右栏overflow裁切，但菜单状态仍属于对应SimpleSelect。
  // 色板同样只负责输出颜色，实际文字更新沿onPatch回到文档和历史。
  // marker区分色板入口，并不表示新增一个全局颜色配置段。
  // 说明文字来自模板的use与note，属于编辑帮助，不导出到最终画面。
  // 删除图标放在当前属性组标题旁，目标与正在编辑的层保持明确对应。
  // 删除本层后此组件卸载，但历史仍保存旧正文以便撤销。
  // 字号等字段按稳定key挂载，调整值不会因数组下标变化移到另一个输入框。
  // 同一布局中的两个数字字段各持有草稿，输入宽度不会重置未确认的字距。
  // 没有选中层时整个LayerProperties不存在，不渲染可编辑但无人接收的表单。
  // 本组件只渲染短说明与表单，没有文件选择器、网络请求或图片解码副作用。
  // 导出读取的是文档已确认值；数字框尚未确认的草稿不会偷偷改变作品。
  const { t } = useTranslation(), overflow = layoutDialogue(layer, item.vertical).overflow;
  return <EditorGroup title={templateText(item, "name")} action={<EditorAction icon={Trash2} label={t("dialogue.remove")} compact onClick={onRemove} />}>
    <p className="text-xs text-muted-foreground">{templateText(item, "use")} {templateText(item, "note")}</p>
    {/* side：原有正文输入通过参数锁定，双击进入编辑，不新建画布内输入副本。 */}
    {/* 字体选择只提交加载成功的fontId，失败时旧字体与正文保持完整。 */}
    {/* 数字字段继续复用EditorFloatField，正文与数字各自通过双击解锁。 */}
    <DialogueTextInput value={layer.text} editing={editing} onEdit={onEdit} onDone={onDone} onChange={text => onPatch({ text })} />
    <DialogueFontPicker value={layer.fontId} onChange={fontId => onPatch({ fontId })} />
    {overflow && <p role="status" data-dialogue-overflow className="text-xs text-amber-600">{t("dialogue.textOverflow")}</p>}
    <SimpleSelect ariaLabel={t("dialogue.direction")} value={layer.direction} options={[{ value: "horizontal", label: t("dialogue.horizontal") }, { value: "vertical", label: t("dialogue.vertical") }]} onChange={value => { if (value === "horizontal" || value === "vertical") onPatch({ direction: value }); }} portal />
    <SimpleSelect ariaLabel={t("dialogue.align")} value={layer.align} options={(["left", "center", "right"] as const).map(value => ({ value, label: t(`dialogue.${value}`) }))} onChange={value => { if (value === "left" || value === "center" || value === "right") onPatch({ align: value }); }} portal />
    <ColorPicker value={layer.color} label={t("dialogue.color")} onChange={color => onPatch({ color })} marker="dialogue" />
    {/* side：公共数字行内部已有84px标签列，280px属性栏不能再把它劈成两列。 */}
    {/* 单列留足数字和错误提示空间，不覆盖公共控件内部CSS，也不新写另一套输入框。 */}
    {/* 六项仍由FIELDS注入同一EditorFloatField，失焦确认、范围校验和撤销接线不变。 */}
    {/* 宽度随手柄实时变化；其余字段保持独立，不把缩放当成字号修改。 */}
    {/* side：六个数值共用双击策略，不为字号、宽度等分别手写锁定状态。 */}
    {/* 提示放在整个字段组前，用户不必逐个悬停才能知道如何开始输入。 */}
    {/* 画布四角与旋转仍直接工作，字段锁定只防止意外打字，不锁住真实图层更新。 */}
    <p className="text-xs text-muted-foreground">{t("dialogue.editNumberHint")}</p>
    <div data-dialogue-fields className="grid grid-cols-1 gap-2">{FIELDS.map(({ key, ...constraints }) => <EditorFloatField focusTone="subtle" editActivation="doubleClick" activationHint={t("dialogue.editNumberHint")} key={key} {...constraints} label={t(`dialogue.${key}`)} value={layer[key]} onCommit={value => onPatch({ [key]: value })} />)}</div>
  </EditorGroup>;
}
