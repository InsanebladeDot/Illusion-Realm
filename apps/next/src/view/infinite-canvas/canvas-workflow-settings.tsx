"use client";

// 工作流配置只编排创建页已有选择器，节点参数仍交给原画布事务保存。
// 模块按打开动作加载，未点配置的空画布不提前装入全部工作流模板。
// 像给每个抽屉贴上模板名：数组为空是用户清空，缺数组才读取默认配料。
// 此处不访问生成服务，不将本地模型显示为已完成的生成结果。
// 本地索引只提供可选版本，是否能被服务端找到仍由以后运行前的映射检查决定。
// 画布工程交换保存参数引用，不在这里把数GB的模型复制进作品目录。
// 文件夹路径、来源封面和搜索分类继续由创建页适配器解释，避免两套筛选产生分歧。
// 用户目录更新时资源可见项随索引刷新，已确认列表不会被自动删除。
// 因为文件可能暂时离线，配置恢复不能要求每次都完整读取模型才能打开作品。
// 不在模块顶层订阅设置变化，只有配置页挂载时才读取所需索引。
// 图片侧栏可记录主模型与辅助覆盖，未覆盖的加载文件仍由原模板提供。
// 用户选择模型不应重新加载节点中的视频，也不应打断同画布另一张音频卡。
// 显示文字不能作为身份：两个版本可同名，模型资源id才区分具体选择。
// LoRA 列表的顺序有意义，所以确认只追加，不按显示标题再排序。
// 卸载只结束本次界面会话，不清除已写入原画布事务的配置。
// 没有轮询或延时提交，保存状态继续由原用户文档写入器反馈。
// 共享选择器读取自己的已选草稿，取消不会额外调用本页更新接口。
// 不直接调用创建页生成方法，避免把节点输入串到用户正在编辑的创建表单。
import { useMemo, useRef, useState, type SetStateAction, type RefObject } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { filterAndSortExtensions } from "@/data/extensions";
import { DEFAULT_EXTENSION_WEIGHT, type SelectedExtension } from "@/types/extension";
import { makeLocalLoraId } from "@/utils/localModelResources";
import { ANIMA_EDIT_LORA } from "@/utils/comfy/anima-edit-workflow";
import { ExtensionSelectDialog } from "@/view/create/ExtensionSelectDialog";
import { SelectedExtensions } from "@/view/create/selected-extensions";
import { CanvasVideoSettings } from "./canvas-video-settings";
import { ImageCreatePanel } from "@/view/create/image-create-panel";
import { ModelSelectDialog } from "@/view/create/ModelSelectDialog";
import { resolveImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
import type { CanvasImageFormWorkflow } from "./use-canvas-image-form";
import { useCanvasImagePanel } from "./use-canvas-image-panel";
import { CanvasImageSidebar } from "./canvas-image-sidebar";
import type { CanvasData } from "./canvas-model";
import { MinimaxImageEditSettings } from "@/components/create-edit/minimax-image-edit-settings";
import { canvasMinimaxEditParameters } from "./canvas-image-parameters";
import { MINIMAX_IMAGE_EDIT_DEFAULTS } from "@/utils/comfy/minimax-image-edit-workflow";
import { CanvasLoraStatus } from "./canvas-lora-status";

// 类型直接从节点契约取，不能由弹窗另定义一组可写字段。
// 当前配置针对明确工作流，切换选择时不根据全局当前节点猜写入目标。
// label 是展示标题，稳定编号才用于更新，界面语言切换不会改作品内容。
// onClose 只结束配置页，没有提交生成或自动补齐服务连接的副作用。
// data 是节点当前参数，父组件每次更新都传最新值，不能只在首次打开时拷贝。
// 配置页关闭后节点仍可撤销修改，历史记录不由这个临时组件持有。
// label 允许翻译和较长名称，外壳负责换行，不把标题塞进模型文件参数。
// 工作流联合类型包含 Wan，因为它仍应能打开并解释当前不支持的设置。
interface Props { returnFocus?: RefObject<HTMLElement | null>; sidebar?: boolean; workflow: NonNullable<CanvasData["workflow"]>; label: string; data: CanvasData; onChange: (patch: Partial<CanvasData>) => void; onClose: () => void }

// 图片使用原系列过滤、资源分组与权重行，保留版本、封面和搜索行为。
// 模型索引来自设置页已有扫描结果，打开弹窗不扫描或读取模型权重正文。
// 默认文字改图预载原 AnimeEditV2；用户删除后 [] 不会被默认项复活。
// 默认项即使没扫描到也显示它的真实文件名，不把它当成安装成功证明。
// 新增额外项与创建页一样采用 DEFAULT_EXTENSION_WEIGHT，编辑预载权重仍为1。
// 读取模板默认项不表示已添加覆盖；用户第一次改权重才形成显式数组。
// 缺失 cover 继续使用公共图片组件的缺图状态，不下载远端示例作为成功证据。
// 在搜索后确认只接收资源选择器返回的版本，不能从标签文字猜文件名。
// 资源数组通过 useMemo 按模型索引、目录和系列更新，拖滑条不重建整批分类。
// 系列切换为 SDXL 后不会列出 Anima 专属模型；规则与创建页相同。
// 此层不自行扫描目录补齐“看起来缺少”的模型，保持主进程权限边界。
// 文件名回退仅限原编辑 LoRA 默认，没有创建任意用户可执行路径。
// 保留初始 editId 只是为了显示模板预载，不能当成跨机器的唯一文件保证。
// 模板切换隔离由父级字段表负责，不调用 useCreateFormStore 的选择 setter。
function ImageLoraSettings({ workflow, value, onChange, open, onOpenChange }: { workflow: CanvasImageFormWorkflow; value?: SelectedExtension[]; onChange: (value: SelectedExtension[]) => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const models = useSettingsStore(state => state.models), paths = useSettingsStore(state => state.paths);
  const resources = useMemo(() => filterAndSortExtensions("", models, paths, null, resolveImageWorkflowSeries(workflow)), [models, paths, workflow]);
  // 优先使用已扫描到的原编辑版本；回退只作参数引用，不创建虚构模型文件。
  // 版本比较沿用原编辑页的初始化规则，不用显示名称做实际运行匹配。
  // 这里只在未覆盖时用默认值，扫描刷新不能覆盖已确认或已清空的列表。
// 斜杠归一只用于默认名称比较，保存的原 id 仍保留生产编码。
// 这里沿用旧编辑页的便利初始化；真实任务需要严格匹配时由原构建器负责。
// 动态资源刷新可能带来真实封面，因此仅未扫描到时提供默认名称覆盖。
// 如果每次都传空封面，真实资源已有的封面也会被遮掉，故区分这两种情况。
// props.value 即使是 [] 也优先，不用布尔或长度测试重新注入 AnimeEditV2。
// 普通 ANIMA 与 SDXL 默认没有额外用户扩展，不能拿另一个节点的选中项填充。
// 模板自带编辑 LoRA 不是不可删除的依赖，本页与创建页一样允许用户移除。
// 参数状态只描述意图，删除预载项不意味着修改磁盘模板 JSON。
  const editVersion = resources.flatMap(item => item.versions ?? []).find(item => item.id.toLowerCase().replace(/\\/g, "/").endsWith("/animeeditv2.safetensors"));
  const editId = editVersion?.id ?? makeLocalLoraId(ANIMA_EDIT_LORA);
  const items = value ?? (workflow === "anima-edit" ? [{ extensionId: editId, weight: 1 }] : []);
  const update = (next: SetStateAction<SelectedExtension[]>) => onChange(typeof next === "function" ? next(items) : next);
  // 确认只追加新版本，已选行的权重与顺序保持不变。
  // 公共弹窗的取消不调用此回调，因此不会把未确认的勾选写进节点。
  // 未扫描到的默认项使用文件名作提示，避免公共列表回退到无关演示封面。
  // 返回资源页后外层配置还在，用户可继续调整或删除刚加入的行。
  // 选择器自己的单选/多选草稿与节点已确认数组是两种状态。
  // 同名不同版本按 extensionId 分开；显示名称相同不能作为去重依据。
// SelectedExtensions 自己处理双击权重输入、滑条和移除，本层不复制交互实现。
// 数值提交继续使用创建页的限幅与草稿规则，非法输入不会直接污染参数。
// setStateAction 适配保留公共组件的函数式接口，不要求它理解画布数据结构。
// 每笔更新返回新数组，已经复制的节点持有旧列表也不会同步改变。
// 已选资源被搜索隐藏仍保留在列表里，不能因为暂时不可见就清除用户配置。
// 选择器内部单选/多选模式只是本次挑选方法，不改变画布节点选择模式。
// ExtensionSelectDialog 返回数组不是完整替换：关闭搜索不能顺带删除旧项。
// 重复确认同一模型不会新增同身份行，后续按身份调权和删除保持唯一目标。
// 资源选择器自己的分类和字号偏好仍沿用原实现，本页没有第二份UI偏好。
// 仅在 open 时挂载选择会话，关闭后下次打开读取当前已确认列表。
// 图片分支只读共享模型索引，绝不修改 settings.models 或图片生成 store。
// 对话框没确认的勾选在卸载后丢弃，已经确认的参数仍可通过工程历史撤销。
  return <>
    <SelectedExtensions value={items} onChange={update} onAdd={() => onOpenChange(true)} displays={workflow === "anima-edit" && !editVersion ? { [editId]: { name: ANIMA_EDIT_LORA, cover: "" } } : undefined} />
    <CanvasLoraStatus names={workflow === "anima-edit" ? [ANIMA_EDIT_LORA] : []} inherited={value === undefined} />
    {/* 内层选择页同样传中性外观，避免打开资源门户后又回到应用蓝色表面。 */}
    {/* 分类卡片及多选状态继续使用原组件，没有为画布另造一套模型浏览器。 */}
    {/* 配色参数不会改变 filterAndSortExtensions 已提供的系列与版本范围。 */}
    {open && <ExtensionSelectDialog open selectedIds={items.map(item => item.extensionId)} resources={resources} onOpenChange={onOpenChange} onConfirm={selected => onChange([...items, ...selected.filter(item => !items.some(old => old.extensionId === item.id)).map(item => ({ extensionId: item.id, weight: DEFAULT_EXTENSION_WEIGHT }))])} />}
  </>;
}

// 配置即时进入原事务，关闭不伪装成一次额外的“保存成功”。
// 外层和 LoRA 选择器各自有关闭路径，内层打开时 Escape 只能先退一层。
// 焦点记录来自真正触发器，退出后不把用户留在已经卸载的弹窗内部。
// 模板身份和 LoRA 数组一起留在节点中，复制节点仍按不可变更新隔离。
// 修改权重只替换当前工作流条目；其他模板的已确认配置继续保留。
// 这样 Minimax 目录规则修复会同时作用于创建页和画布，不需维护两套映射。
// 图片和视频参数形状不同，传回前保持各自类型，不能按名称强行合并业务。
// onPickerOpenChange 只通知嵌套层级；它不会泄露内部资源选择草稿。
// 内层关闭时 React 下一次提交恢复外层关闭权限，同一次 Escape 不会连退两页。
// 单独关闭外层后资源选择页也卸载，不留下能继续写旧节点的悬浮入口。
// 保存仍由原画布检测参数变化，标题上的已保存状态不由配置页手工设置。
// 只要配置确实改变，原节点事务就形成历史；重开查看本身没有新的历史。
// 撤销可以恢复之前的权重表，配置页每次重绘使用恢复后的节点值。
// 对象点击顺序不会决定模板配置优先级，稳定键名才是对应关系。
// 本页没有跨节点缓存，“同源素材”也不代表两个节点应共享参数选择。
function CanvasImageWorkflowSettings({ returnFocus: sidebarReturnFocus, workflow, label, data, onChange, onClose }: Props & { workflow: CanvasImageFormWorkflow }) {
  const [selecting, setSelecting] = useState(false);
  // 主模型和 LoRA 各有选择会话，不能用一个布尔值同时打开两份资源列表。
  // 外壳关闭保护才合并两者，业务确认仍回到各自原选择器。
  // 内层取消不清空另一类参数，也不会把主模型资源当成 LoRA 追加。
  const [modelSelecting, setModelSelecting] = useState(false);
  const returnFocus = useRef(typeof document === "undefined" ? null : document.activeElement);
  // 侧栏只接原组件的参数，所有表单 DOM 直接来自创建页同一 ImageCreatePanel。
  const imageForm = useCanvasImagePanel({ workflow, data, onChange, onSelecting: setModelSelecting });
  // 视频三个原组件由独立适配器接入，外壳只负责关闭与焦点。
  // 显式空数组用 ?? 保留，不能用长度判断重新补回用户删除的默认 LoRA。
  // 不原地改 data.workflowLoras；历史和副本即使共享旧对象也不会一起变。
  // 视频默认读取同一模板提取器，不把文件名抄成另一份配置常量。
  // 打开设置不提交生成，加载设置展开后的清单请求仍由原组件负责。
  // 外层取消与选择器取消都不清空参数，配置更改可通过工程撤销返回。
// 视频默认值由原模板提取器读取，不把公共选择器的行删除写回静态模板。
// 数值编辑使用当前数组计算，不把第一次打开时的默认数组永久缓存。
// 字段表合并保留同节点其他模板，来回对比模型不会丢掉先前的选择。
// 数组本身仍由公共组件以不可变方式产生，合并表时也不改旧的父对象。
// 类型守卫在读取键前拒绝非 Minimax 模板，不用断言把 Wan 强制当成可配置。
// 空数组允许保存，和模板继承采用不同语义，下一次重开必须保持清空结果。
// 关闭后恢复的原控件若已被节点删除，则不尝试聚焦已经断开的 DOM。
// 这是界面资源清理，不会让已经关闭的配置页重新挂载节点或触发保存。
// 关闭不是事务提交点，避免误以为在模型选择器中取消也会丢掉已调好的权重。

  const close = () => {
    if (selecting || modelSelecting) return;
    onClose();
    if (returnFocus.current instanceof HTMLElement && returnFocus.current.isConnected) returnFocus.current.focus({ preventScroll: true });
  };
  // 配置页与资源选择共用原响应式外壳，不另造全窗口罩住应用导航。
  // data-canvas-popover 隔离配置区快捷键，Delete 不会删掉正在设置的节点。
  // 标题跟随稳定工作流，不把旧创建页当前选中模型当本节点配置。
  // 说明明确“仅配置”，不会显示生成费用、进度或假的成功状态。
  // 内层 selection 状态通知只保护关闭次序，不参与磁盘数据。
  // 未选择模型的空态仍使用原添加扩展入口，继续支持用户后续选择。
// 配置内容位于外壳自己的滚动区，很多 LoRA 时不会撑开整张画布节点。
// 窄窗口由原资源外壳提供主区布局，应用导航和退出入口仍可到达。
// 配置页标题不强塞进胶囊，节点只保留短工作流名以减少常驻占位。
// 文本说明明确原模板默认，不能从用户没有扫描过的目录虚构模型数量。
// 节点参数仍可以离线编辑；是否有可用服务不决定能否保存本地意图。
// 真实生成接入后必须消费相同字段表，本页不能只把配置当临时显示标签。
// LoRA 模型权重文件未随工程包自动搬迁，跨机器仍需在本机重新配置资源目录。
// 当前只保证参数记录可恢复，不声称一个模型在所有设备上都可以运行。
  // 通过外壳公开的 tone 参数设置门户颜色，不用业务 CSS 窥探内部 DOM 改色。
  // 视频选择器继续透传同一外观，内外两层与黑白工作流菜单保持一致。
  // 字段、权重和资源高亮仍属于原选择器，主题不提供另一份业务状态。
  // 图片侧栏保留原 LoRA 适配器作插槽，不复制版本选择、权重或默认编辑项。
  // 外壳只负责几何和关闭，参数字段与数据仍由当前节点负责。
  // 内层资源页打开时把 selecting 交给外壳，Escape 不同时退两层。
  // 工作流 key 由宿主提供，换模板后输入与资源临时草稿自然重建。
  // 配置修改即时进入节点历史，关闭不另造一次假的“应用成功”。
  // 图片有新增主模型、负面词、尺寸和采样，但 LoRA 原字段表继续复用。
  // 不把这些图片字段放进视频对象，主进程会拒绝跨类型附表。
  // 模板开关和配置开关分开：返回模板菜单不会丢掉已确认的配置。
  // 当前配置页不发起生成，所以服务离线时仍能编辑和保存本地意图。
  // 选择器的目录索引来源可共享，用户在其中确认的版本仍只交回该节点。
  // 权重滑条的数值由 SelectedExtensions 提供，不在外壳重新转换成百分数。
  // 空数组是明确关闭额外 LoRA；缺数组才继承模板预载，不能用长度判断。
  // 原文字改图预载 AnimeEditV2 可删除，恢复时不能因默认项存在自动加回来。
  // 图片模型与 LoRA 各有 open 状态，二者只在关闭保护处做逻辑合并。
  // 不同选择器在父级共用一个 selecting 会造成错误的同时弹出，故刻意分开。
  // 外层 close 检查两种会话，防止内层 Escape 或取消一次退出全部配置。
  // 内层确认采用原回调时序，先通知节点数据，再收起该资源会话。
  // 侧栏关闭后表单卸载，但节点参数仍留在原工程历史和自动保存路径。
  // label 是当前节点标题，工作流身份由 workflow 明确传入，不反推业务类型。
  // 图片配置和节点内参数区读取同一 data，onChange 不会替换不相关的 media。
  // 配置状态改变不会强制 fitView，用户调整参数时观察位置应保持稳定。
  // 加载本地模型索引不等于读取权重文件，打开侧栏不能造成整模型进内存。
  // 缺封面继续显示缺图状态，不用模板展示图充当已找到对应文件的证据。
  // 当前侧栏只承诺参数恢复，不承诺跨机器模型文件自动迁移或下载。
// 图片配置直接把节点工作单传给 ImageCreatePanel，不排列一份相似的字段列表。
// settings 变体只关闭节点面板已承载的正向、尺寸和请求区。
// 主模型封面、反向输入、高级采样与加载设置仍由原表单决定顺序和交互。
// 扩展通过原 extensions 插槽注入，LoRA 弹窗与权重行不需要重新实现。
// ModelSelectDialog 继续挂在同一会话，选中的版本只写回当前节点。
// 外壳的 selecting 合并只保护关闭顺序，不合并两个资源选择器的数据。
// 工作流切换时原 key 负责重建局部草稿，不能把 Anima 参数带进 SDXL。
// 这个调用方没有生成 footer，唯一请求入口在节点右下角。
// 批量数量同样在节点工具条，不再让原底栏提供第二个数量来源。
// 关闭侧栏不会删除节点参数，确认值仍由原工程自动保存。
// 模型索引可共享但节点选择不共享，因此复用原组件也不会改动创作页全局草稿。
  return <CanvasImageSidebar returnFocus={sidebarReturnFocus} label={label} selecting={selecting || modelSelecting} onClose={close}>
    <ImageCreatePanel {...imageForm.panel} variant="settings" extensions={<ImageLoraSettings workflow={workflow} value={data.workflowLoras?.[workflow]} onChange={items => onChange({ workflowLoras: { ...data.workflowLoras, [workflow]: items } })} open={selecting} onOpenChange={setSelecting} />} />
    {imageForm.picker.open && <ModelSelectDialog {...imageForm.picker} />}
  </CanvasImageSidebar>;
}

// 资源侧栏不需要另造视频弹窗，沿用图片壳的几何、关闭与键盘隔离。
// 图片与视频在此分支选择内容，不能在视频分支仍启动图片 form store。
// 否则视频配置虽只显示三个控件，后台也可能建立不相关的图片订阅。
// 组件边界让 React hooks 始终按固定顺序执行，不在同一个函数条件调用 hook。
// 图片已有 ModelSelectDialog 和扩展会话继续保留，不被视频状态覆盖。
// 视频扩展打开时 selecting 只保护本侧栏关闭次序，不修改图片资源草稿。
// 具体资源弹窗都仍由原组件创建，外壳没有复制一套选中或确认逻辑。
// 原主模型门户可以在 body 下，公共侧栏已根据真实 DOM 归属让它处理键盘。
// 普通侧栏内的 Delete 被隔离，用户调整参数时不会误删底层节点。
// Escape 关闭外壳后由 returnFocus 回到实际触发器，而不是找同名模型按钮。
// 父级节点删除会卸载本实例，失效弹窗不应继续写其他已选节点。
// 名称用于标题，工作流用于模板，二者不互相推导。
// 未配置的参数只读默认，打开侧栏本身不制造历史或未保存标记。
// 两种内容共同使用 create-workspace 主题域，原控件颜色与创作页保持一致。
// 不添加专供画布的按钮描边或加载滑条，之后原组件修正会同时生效。
// 侧栏没有二次应用按钮；每个原控件确认后直接写回原节点事务。
// 分支在子组件边界切开生命周期，视频不会偷偷启动图片草稿同步订阅。
// 两种媒体只共享侧栏几何，不共享表单 store 或参数模型。
// 视频选择页的原模态弹窗自行处理 Escape；外层只在没有内层会话时收起。
// 关闭会卸载三个原组件，参数仍留在作品，模型列表请求的旧回包由原组件丢弃。
export default function CanvasWorkflowSettings(props: Props) {
  const [selecting, setSelecting] = useState(false);
  const { workflow, label, data, onChange, onClose, returnFocus } = props;
  if (workflow === "minimax-image-edit") return <CanvasImageSidebar returnFocus={returnFocus} label={label} selecting={selecting} onClose={() => { if (!selecting) onClose(); }}>
    {/* 图片编辑侧栏：直接复用创作页 H3 设置，不再复制输入与加载表单。 */}
    <div className="min-w-0 px-3 pb-4 pt-3 sm:px-4"><CanvasMinimaxEditSettings data={data} onChange={onChange} onSelecting={setSelecting} /></div>
  </CanvasImageSidebar>;
  if (workflow === "anima" || workflow === "sdxl" || workflow === "moss" || workflow === "anima-edit") return <CanvasImageWorkflowSettings {...props} workflow={workflow} />;
  return <CanvasImageSidebar returnFocus={returnFocus} label={label} selecting={selecting} onClose={() => { if (!selecting) onClose(); }}>
    <CanvasVideoSettings key={workflow} workflow={workflow} data={data} onChange={onChange} onSelecting={setSelecting} />
  </CanvasImageSidebar>;
}

/** 参数写到当前节点的 H3 附表；A/B 节点和原 Anima 草稿互不覆盖。 */
function CanvasMinimaxEditSettings({ data, onChange, onSelecting }: Pick<Props, "data" | "onChange"> & { onSelecting: (open: boolean) => void }) {
  const row = data.imageParameters?.["minimax-image-edit"] ?? {};
  const update = (patch: Partial<typeof row>) => onChange({ imageParameters: { ...data.imageParameters, "minimax-image-edit": { ...row, ...patch } } });
  // 设置界面不抽随机数，不因重渲染改变显示种子；提交时才生成本次随机种子。
  const settings = { ...canvasMinimaxEditParameters({ ...data, imageParameters: { ...data.imageParameters, "minimax-image-edit": { ...row, seedMode: "custom", seed: row.seed ?? MINIMAX_IMAGE_EDIT_DEFAULTS.seed } } }) };
  // 模型、种子和扩展一起更新，撤销和重开都从当前节点恢复。
  const change = (value: typeof settings) => onChange({
    imageParameters: { ...data.imageParameters, "minimax-image-edit": { ...row, seed: value.seed, modelOverrides: value.modelOverrides, seedMode: value.seed !== settings.seed ? "custom" : row.seedMode } },
    workflowLoras: { ...data.workflowLoras, "minimax-image-edit": value.loras.map(({ name, strength }, index) => ({ id: String(index), name, strength })) },
  });
  return <><MinimaxImageEditSettings settings={settings} onPickerOpenChange={onSelecting} onChange={change} seedMode={row.seedMode ?? "random"} onSeedMode={seedMode => update({ seedMode })} />
    <CanvasLoraStatus names={MINIMAX_IMAGE_EDIT_DEFAULTS.loras.map(item => item.name)} inherited={data.workflowLoras?.["minimax-image-edit"] === undefined} />
  </>;
}
