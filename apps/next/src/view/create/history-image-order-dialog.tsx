"use client";

/** 当前文件夹图片的手动顺序与批量改名弹窗，完成/取消均回到打开它的图库。 */
// 图库原来只有日期扫描顺序，本窗口让用户在不移动文件的前提下安排展示队列。
// 批量改名是可选项，默认关闭，打开排序窗口不会自动改写文件名。
// 界面组件只编排意图；真正的文件授权、名称安全和旁车处理沿用图片服务。
// SortableList 负责共用传感器，useSortable 负责当前图片行的位置和抓取手柄。
// ResourceDialogShell 负责应用既有的宽屏弹窗与窄屏 main 子页切换。
// 因此这个文件不复制遮罩、导航偏移、Escape 监听或另一个拖拽体系。
// RenameConfig 是 EXIF 工具正在使用的输入区，前缀和序号格式也取自同一工具。
// 通过 props 注入本图库的内容和回调，不把 EXIF 的文件处理业务搬过来。
// 本地缩略图走 LocalFileImage 的原有缓存，排序不再次读取整张图片字节。
// 图片路径用于身份，序号用于显示，拖动后 React 不会把旧图内容套到新行。
// 独立演示数据不参与这里的处理，接收到的记录全部来自父图库实际扫描。
// 没有导入 Node 或 Electron；系统操作只能通过既有渲染封装进入 preload。
// 组件不会在渲染期间调用文件服务，也不会在修改前缀时偷偷改名。
// 翻译 hook 随当前语言更新按钮与校验文案，不把提示文本存进配置。
// toast 仅用于已完成或明确的部分完成；输入错误展示在命名设置附近。
// 原图库关闭本弹窗后负责重新扫描，让外部变更也能合并回正式列表。
import { useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, ImageOff, LoaderCircle, Pencil } from "lucide-react";
import { SortableList } from "@/components/sortable-list";
import { useTranslation } from "@/i18n";
import { useToastStore } from "@/stores/useToastStore";
import { useHistoryImageOrder } from "@/hooks/use-history-image-order";
import { previewHistoryImageNames, validateHistoryImageNames, renameHistoryImageSequence } from "@/utils/history-image-order";
import { hasRenameGeneratedImageSupport } from "@/utils/electronBridge";
import { LocalFileImage } from "@/components/LocalFileImage";
import { RenameConfig } from "@/view/toolBox/Tool/exif/components/RenameConfig";
import { ResourceDialogShell } from "@/components/ResourceDialogShell";
import type { GeneratedImageFile } from "@/types/historyFolder";
import { INPUT_BORDER_CLASS } from "@/utils/layout";
import type { RenameGeneratedImageResult } from "@/utils/generatedImages";

// 各层交接的实际数据：
// listGeneratedImages 产生磁盘文件记录，父图库先应用已经确认的顺序。
// 本组件再把这批记录交给 useHistoryImageOrder，得到窗口独有的排序草稿。
// 拖拽容器只传两个路径 id，hook 将起点记录插入终点所在位置。
// 列表中显示的序号来自草稿位置，文件名仍来自原记录，二者暂时没有因果关系。
// 开启命名后，previewHistoryImageNames 才把位置映射成目标文件名。
// 目标文件名必须通过 validateHistoryImageNames，才能成为可确认的执行计划。
// 确认后 renameHistoryImageSequence 逐个调用受限文件接口，返回每项实际结果。
// completeRename 用这些结果替换父图库路径，并保持操作前确认的先后队列。
// 最后父图库重新扫描目录；扫描结果仍按保存后的新路径名单展示。
// 这条交接链没有把图片数据上传到模型或远端服务。
// 排序窗口不需要知道生成时使用哪个模型，也不会向生成工作流注入文件名。
// 生成中新增图片由父图库自己的刷新处理，不在执行中途扩展当前改名计划。
// 如果父层根本没有新的扫描结果，本窗口也不会凭空制造占位成功图片。

// 打开与确认之间的状态约定：
// 刚打开：读取已确认顺序，命名关闭，取消按钮获得初始键盘焦点。
// 开始拖动：库用 transform 预演位置，持久化名单尚未变化。
// 拖动放手：草稿改变；不因为一次放手就直接改名或写入全局顺序。
// 拖动按 Esc：由 dnd-kit 取消该次拖动，文件记录身份保持不变。
// 没有拖动就保存：确认当前完整名单，补上尚未登记的新文件。
// 拖动后取消：丢弃草稿，下次打开恢复上次确认的名单。
// 打开命名：显示前缀、起点、方向和对应关系，尚无磁盘操作。
// 修改起点：预览编号变化，图片行左侧的位置标记仍按一到总数显示。
// 改成递减：按当前图片次序递减分配数字，图片不会自动倒序。
// 输入越界：确认禁用，但取消仍可用，用户不会被错误设置困在窗口内。
// 关闭命名：不再使用临时名称验证阻止纯排序，仍可正常保存排列。
// 正在改名：输入、手柄、确认和取消共同锁定，不允许新一轮并发整理。
// 首项失败：原路径仍有效，窗口显示原因，用户可修正后重试。
// 中途失败：前面成功项保留，按实际替换过的名单保存顺序并告知部分完成。
// 全部成功：提示真实完成数量，来源列表接收全部新路径并重新扫描。
// 外部删除：缺失记录在最新映射中消失，不凭旧路径恢复一张不存在的图。
// 目录切换：父层通过 key 更换窗口实例，上一目录草稿不会写到新目录。
// 窗口缩窄：来源保活，外壳把同一业务实例迁移到 main 宿主。
// 导航离开：React 卸载本窗口，未确认草稿不在其他页面自动恢复。

// 与既有功能共用时需要保持的差异：
// 视频列表拖动会改剪辑数组，本窗口拖动只改图片显示队列。
// 提示词组拖动会影响正文拼接，本窗口不会读取或写入提示词正文。
// 三者共用相同 id 事件协议，所以可以复用容器而不用合并业务 store。
// EXIF 工具可以有单文件命名，本窗口始终传 ascending，启用批量方向控件。
// EXIF 的转换和输出目录设置不在本窗口中出现，避免改名等于重新导出的误解。
// 文件移动业务需要选择目标目录，本窗口没有目录选择器，也不改变图片归属。
// 图片详情业务需要读取 Meta，本窗口只需文件名和缩略图，不额外解析 Meta。
// 中央预览由来源控制，窗口不在多个卡片之间建立另一份“当前预览”状态。
// 删除入口仍属于原图库，本列表没有复刻删除确认或多选工具栏。
// SortableList 不知道改名正在写盘，因此 working 需要显式注入容器和手柄。
// ResourceDialogShell 不知道是否允许中断文件操作，因此关闭意图交回本组件判断。
// RenameConfig 不检查同目录冲突，因此父窗口必须提供验证和最终禁用条件。
// LocalFileImage 不负责文件改名缓存迁移，新路径交回父层后按新身份正常读取。
// i18n 不保存输入值，切换语言只更新说明，不会把中文前缀翻译成英文。
// Toast 不承担持久化，成功提示的依据始终是文件接口结果。
// 用户文档保存采用应用原延迟合并策略，本窗口不引入自己的 saveTimer。
// 这里的自动聚焦只发生在新 DOM 挂载时，输入前缀的后续渲染不会持续抢回焦点。

// 可用性与视图边界：
// 图库名称在来源标题栏省略，窗口内每张图的长文件名也在自己的剩余宽度内省略。
// 路径用于内部身份，列表文本只显示 fileName，不额外展示冗长目录链。
// 读屏使用手柄完整名称，鼠标可以通过 title 查看省略部分。
// 卡片缩略图固定尺寸，因此不同长宽比的原图不会让拖拽行高忽高忽低。
// 用 object-cover 显示小缩略图仅为识别文件，不代表会按这个裁切保存原图。
// 缩略图为空时位置仍保留，按钮不会因图片稍晚加载突然向左跳动。
// 图像加载缓存归公共组件管理，排序窗口不额外创建 object URL。
// 没有需要跨窗口共享的图片选择集合，每行只是排列对象而非勾选对象。
// 不显示虚假的播放、预览或导出按钮，点击文件名不会启动别的业务。
// 页头说明和底部动作由外壳固定，只有中间长列表滚动。
// 设置区内部名称预览另有限高，五个名称也不能无限挤掉图片区域。
// 按钮原生 disabled 既改变视觉也阻止交互，不依靠半透明样式装作禁用。
// 不以应用路由字符串决定布局，外壳会读取创建主区实际可用宽度。
// 窄屏 main 页允许返回导航，关闭仍遵守同一个锁检查。
// 两个图标方向不同：来源上下箭头打开图片排列，行末抓取点用于拖动具体文件。
// 图标只承担视觉识别，可访问名称独立提供完整业务含义。

// 部分完成时的数据推演：
// 假设原路径队列是 A、B、C，用户排成 C、A、B，再开启顺序改名。
// C 成功变成 image_1，A 成功变成 image_2，B 因占用失败。
// replacements 只登记 C 与 A，不能凭预览给 B 登记不存在的 image_3。
// 保存名单得到 image_1、image_2、B，仍和用户确认的三个位置一一对应。
// 父图库同样只替换两张成功图片，B 的原文件名和路径保留。
// 下次重新打开会看到真实磁盘状态，而不是一个“全部成功”的旧计划。
// 失败的提示数是二，不是总数三；用户不会因成功 Toast 误以为 B 已改名。
// 再次尝试时重新生成和验证目标，避免继续拿过期的 C、A 旧路径执行。
// 当前实现不自动重试占用错误，用户可先处理原因再明确启动新一轮。
// 不自动给失败目标添加随机后缀，否则将破坏可见编号与计划的对应关系。

// 异步恢复与来源责任：
// ref 锁在第一个 await 之前设置，同一任务里的第二次点击会立即返回。
// 普通浏览器没有 Electron 改名桥接时，失败提示留在窗口且不设置永久忙碌。
// 输入校验失败不会进入 try，因而不会短暂出现“正在改名”的假进度。
// 正式接口拒绝后由 helper 返回 error，回执处理只负责呈现真实完成阶段。
// helper 自身若发生未知异常，外层 catch 仍能恢复可见错误和按钮状态。
// finally 总会释放 ref 与 state，包含第一项失败但窗口继续保留的分支。
// 锁住期间 Esc 仍会进入公共外壳回调，但业务 close 会拒绝这次关闭。
// 锁住期间点击遮罩也经过相同 close，不因鼠标和键盘入口不同而绕过限制。
// 成功后的 onClose 不是用户取消，已经保存的名单不会调用 cancel 重置。
// 纯排序的 cancel 没有磁盘副作用，因此可以立即关闭而无需请求中止通道。
// 本窗口未提供跨路由保持后台整理的承诺，来源导航生命周期仍由应用管理。
// 真正的用户文档写盘失败反馈沿用应用级处理，不虚构“等待写盘成功”步骤。
// 测试若要检查重启恢复，需要等原保存链路完成，不能把窗口关闭当作落盘回执。

// 新增数据与身份变化的边界：
// 列表刷新可能生成新的图片对象，但同一路径仍被当作同一张待排图片。
// 图片文件内容被外部替换不改变路径，排序位置保持，不根据像素突然换位。
// 用户把文件在软件外改名属于新身份，旧名单跳过旧路径，新文件接到队尾。
// 在本窗口内改名则有明确新旧回执，因此可以保持原有位置。
// 名称比较只用于命名合法性，排序身份比较仍用真实完整路径。
// 序号不是文件 id，拖动后改序号不应使 React 卸载并重新加载整张图片。
// 保存名单不包含可执行内容，也不授予文件服务任意路径的权限。
// 即使用户配置被手工改过，真实文件请求仍必须通过原主进程路径校验。
// 当前目录之外的图片不能由这个窗口的 props 自动变成批量改名目标。
// 两个目录的相同文件名可以共存，父层按目录键分别保存各自排列。
// 对“全部”的排列使用实际输出根键，换输出根不会误用上一根的名单。
// 路径变化不尝试推断文件内容是否相同，避免昂贵的全图哈希读取。
// 排序只需现有记录字段，因而不增加模型扫描、视频探测或网络请求成本。
// 父层重扫时获得的修改时间是文件服务的真实值，预览计划不制造新时间戳。

interface HistoryImageOrderDialogProps {
  // 当前打开目录的完整图片集合，包含分页外或被搜索暂时隐藏的图片。
  // 不接收选中图片子集，避免同一目录里有文件没参与命名冲突检查。
  images: GeneratedImageFile[];
  // 当前应用的输出根配置，正式图片接口用它验证允许操作的路径范围。
  // 空字符串仍沿用原接口的默认输出根解析，不能改成任意用户路径权限。
  outputPath: string;
  // 目录路径用作排序偏好的键，“全部”目录由父层解析成当前有效输出根。
  // 不用可重名的显示标题作键，避免两个同名文件夹共享一个队列。
  folderKey: string;
  // 上次确认的路径名单；它不包含图片内容，也不会用名称替代文件身份。
  // 父层从同一个 historyFolders 段读取，跨入口看到同一套已确认排序。
  savedOrder: string[];
  // 保存展示顺序，回调不代表批量文件移动；每个目录由 store 分开保存。
  // 重命名后传回替换过的新路径，否则下次扫描无法匹配已经改名的图片。
  onSave: (folder: string, paths: string[]) => void;
  // 每个真实成功回执都通知父层，只有实际完成的文件才更新图库记录。
  // 第一参是旧身份，第二参是新记录，父层可同步当前预览和多选状态。
  onRenamed: (oldPath: string, image: GeneratedImageFile) => void;
  // 关闭仍由来源图库控制；取消、成功和部分完成都通过同一个生命周期收尾。
  // 父层负责恢复入口焦点，本窗口不保存来源按钮 DOM 引用。
  onClose: () => void;
}

/** 排序和批量改名共用原图清单，任一操作完成后都按文件路径刷新当前记录。 */
export function HistoryImageOrderDialog({ images, outputPath, folderKey, savedOrder, onSave, onRenamed, onClose }: HistoryImageOrderDialogProps) {
  const { t } = useTranslation();
  const toast = useToastStore(state => state.show);
  const order = useHistoryImageOrder(images, savedOrder, folderKey, onSave);
  // 只保存用户输入的命名选项，不额外复制一份可以与排序草稿走散的图片清单。
  // 默认 image_ 是可直接使用的文件名前缀，用户仍可输入中文或其他合法字符。
  // 起始编号从一开始，与可见列表标号一致；列表标号本身不随此设置改变。
  // ascending 只决定新文件的数字方向，不能反转用户已经安排好的图片队列。
  // renameEnabled 默认关闭，用户只想调整浏览顺序时无需接受磁盘变更。
  const [prefix, setPrefix] = useState("image_");
  const [start, setStart] = useState(1);
  const [ascending, setAscending] = useState(true);
  const [renameEnabled, setRenameEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  // preview 从完整排列派生，拖动任何一行都立即重新对应那张图的新编号。
  // 依赖包含前缀、起始号和方向，不能只在打开窗口时计算一次。
  // useMemo 仅减少重复计算，不承担冻结异步改名计划的职责。
  // 展示只取少量预览以保留图片区域高度，执行仍使用完整计划。
  const preview = useMemo(() => previewHistoryImageNames(order.items, prefix, start, ascending), [ascending, order.items, prefix, start]);
  // ref 像门闩，当次点击立即扣住；state 像门口灯，下一帧让按钮显示忙碌。
  // 只用 state 会给同一帧的快速双击留下两次进入异步操作的机会。
  // 这个锁不属于全局 store，另一个图库打开自己的窗口不会被错误锁住。
  const lock = useRef(false);
  // failure 记录实际执行错误；validation 表示当前输入尚不满足规则。
  // 两者分别保存，用户改输入不能让未完成的磁盘改名被误报成成功。
  // 新一次明确执行时清空旧 failure，避免把上次失败当成本次结果。
  const [failure, setFailure] = useState<string | null>(null);
  const validation = renameEnabled ? validateHistoryImageNames(order.items, prefix, start, ascending) : null;
  // 关闭命名功能后只保存顺序，非法的临时前缀不应阻止纯排列提交。
  // completeRename 不再次请求文件服务，专门负责把实际回执合并回界面。
  // 与异步调用拆开是为了明确两个阶段：先做文件操作，再更新来源和偏好。
  // 结果可以只有一部分，因此不能用计划长度替代成功回执数量。
  // sourceOrder 是开始执行前的路径快照，不读取正在被父层改名回调刷新的数组。
  const completeRename = (results: RenameGeneratedImageResult[], sourceOrder: string[], error: string | null) => {
    // 新旧路径表像改名登记簿，只有盖过完成章的条目才登记新身份。
    // 后面未处理的文件没有登记，保存顺序时仍保留其原路径。
    // 使用实际回执的新路径，也能兼容底层对最终文件名的合法处理。
    // Map 只做一次身份替换，不按新名称排序，因此数字名称不会反过来影响队列。
    const replacements = new Map(results.map(result => [result.oldPath, result.filePath]));
    // 回执自身包含完整图像记录字段，交给父层按 oldPath 替换。
    // 更新图库并不打开图片详情，排序不能顺带打断用户当前的预览任务。
    // 父层如果正在预览这张旧路径，会从这个通知同步到新文件。
    results.forEach(result => onRenamed(result.oldPath, result));
    // 零项完成表示磁盘未发生本次改名，保留窗口和输入供用户修正或退出。
    // 有部分完成时窗口结束并提示确切数量，不能用取消来暗示已经撤销文件改动。
    // 部分成功的路径仍写回偏好，否则那些文件在下次刷新时会被错误接到队尾。
    // 错误提示明确说已完成部分不会撤销，符合现有逐文件接口的真实能力。
    if (error) {
      const message = t("create.historyOrder.renamePartial", { count: results.length, reason: error });
      setFailure(message);
      if (!results.length) return;
      toast(message);
    } else toast(t("create.historyOrder.renameComplete", { count: results.length }));
    // 按旧名单逐项替换身份，保持用户确认的队列位置。
    // 不用 results 的长度截断名单，后续尚未处理的图片仍属于当前目录。
    // 关闭之后父层重扫目录，但正式列表会优先按这份保存的路径队列排列。
    // 这里没有强制等待用户文档延迟写盘，沿用整个应用的同一保存机制。
    onSave(folderKey, sourceOrder.map(path => replacements.get(path) ?? path));
    onClose();
  };
  const rename = async () => {
    // UI 按钮之外再检查一次锁和输入，不能依赖 disabled 作为唯一操作边界。
    // 功能探测用于普通浏览器或旧桥接环境；缺能力时给明确原因，保留用户草稿。
    // 不把缺少改名方法当作空结果成功，也不退化成仅修改卡片上的显示名称。
    if (lock.current || validation) return;
    if (!hasRenameGeneratedImageSupport()) { setFailure(t("create.generatedImageContextMenu.renameUnsupported")); return; }
    lock.current = true; setWorking(true); setFailure(null);
    // 进入 try 之后的请求和回执处理都有失败边界，未知错误不会留下未处理拒绝。
    // sourceOrder 和 preview 在第一次 await 之前确定，形成同一次确认的执行计划。
    // 外部生成通知可能刷新图库；不能让刷新中的新项插入已开始的命名计划。
    try {
      // 先冻结用户确认的顺序；改名回调会逐项刷新父图库，不能用刷新中的列表重排余项。
      const sourceOrder = order.items.map(image => image.filePath);
      const outcome = await renameHistoryImageSequence(outputPath, preview);
      completeRename(outcome.results, sourceOrder, outcome.error);
    } catch (error) { setFailure(error instanceof Error ? error.message : t("create.historyOrder.renameFailed")); }
    // 成功、部分完成和失败都释放锁，防止一次失败使当前窗口永久无法操作。
    // working 负责恢复输入和手柄，lock 负责恢复下一次同步点击的进入资格。
    // 没有后台轮询或进度模拟，忙碌状态只包围真实文件请求。
    finally { lock.current = false; setWorking(false); }
  };
  // 保存按钮根据明确的用户开关选择行为，命名设置隐藏时绝不发出改名 IPC。
  // 纯排序写回 store 后结束窗口，不需要读取图片内容或重新编码图片。
  // rename 内部已经捕获异步错误，这里的 void 不会遗失未处理的拒绝。
  const save = () => {
    if (renameEnabled) { void rename(); return; }
    order.confirm(); onClose();
  };
  // 正在逐文件改名时拒绝关闭，避免界面消失却仍在后台继续改变文件。
  // close 检查即时 ref 锁，覆盖 state 尚未刷新时的快速 Escape 或遮罩点击。
  // 普通关闭只清理排序草稿；已经保存的历史偏好由 store 保留。
  // 本窗口没有“停止后回滚”协议，不能把关闭按钮当作事务取消接口。
  const close = () => { if (lock.current) return; order.cancel(); onClose(); };
  const toolbar = (
    // 图库设置区：fieldset 统一禁用已有 RenameConfig 的所有输入和子按钮。
    // 使用原生禁用传播，不往 EXIF 控件添加图库业务专用的多个开关。
    // 标题与输入继续共用主题语义色，深浅模式由应用主题机制驱动。
    <fieldset disabled={working} className="flex min-w-0 flex-col gap-3 px-4 py-3">
      <p className="text-xs text-muted-foreground">{t("create.historyOrder.hint", { count: order.items.length })}</p>
      {/* 数量说明按完整目录统计，提醒用户本次排列包括当前分页和搜索之外的图片。 */}
      {/* 命名控件受控地接收相同参数，EXIF 和图库使用同一个界面实现。 */}
      {/* 各实例的 prefix、start 和 ascending 由调用方持有，不会互相污染。 */}
      {/* preview 是内容插槽，原控件不需要认识 GeneratedImageFile 或图库 store。 */}
      {/* 只有启用改名才展示预览，减少仅做排列时的非必要占用。 */}
      {/* 新旧名称同时展示，用户可确认这张图对应哪个目标，而不只看到一串新名字。 */}
      {/* 长名称以省略和 title 保留可读性，不能撑出弹窗横向滚动条。 */}
      {/* 预览最多显示五项，超出的数量单独说明，避免误以为只会改五张图。 */}
      {/* 名称预览自己滚动，图片列表仍由外壳主体负责滚动。 */}
      <RenameConfig title={t("create.historyOrder.renameTitle")} enabled={renameEnabled} onToggle={setRenameEnabled}
        prefix={prefix} onPrefixChange={setPrefix} startNumber={start} onStartNumberChange={setStart}
        ascending={ascending} onAscendingChange={setAscending}
        preview={renameEnabled ? <div className="max-h-24 space-y-1 overflow-auto text-xs">{preview.slice(0, 5).map(item => <div key={item.image.filePath} className="truncate" title={`${item.image.fileName} → ${item.name}`}>{item.image.fileName} → {item.name}</div>)}{preview.length > 5 && <span>{t("create.historyOrder.more", { count: preview.length - 5 })}</span>}</div> : undefined} />
      {(validation || failure) && <p data-order-error role="alert" className="text-xs text-destructive">{validation ?? failure}</p>}
      {/* 输入校验优先显示，先指导用户修正当前不合法的设置。 */}
      {/* 真正请求失败仍留在 failure 中，下一次提交时才明确清理。 */}
      {/* role=alert 用于操作错误播报，普通数量和预览不被当成紧急消息。 */}
    </fieldset>
  );
  const footer = (
    // 图库操作区：数量和确认固定在底部，不随长图片清单滚出屏幕。
    // 取消默认接收焦点，打开窗口不会因为按下 Enter 就直接执行磁盘批量改名。
    // 缺图或尚未加载的缩略图不影响按名称和路径排列，按钮依据图片记录而非像素状态。
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <span data-order-count className="text-xs text-muted-foreground">{t("create.historyOrder.count", { count: order.items.length })}</span>
      <div className="flex gap-2">
        <button type="button" data-order-cancel autoFocus disabled={working} onClick={close} className={"inline-flex h-9 items-center rounded-md border px-3 text-sm " + INPUT_BORDER_CLASS}>{t("common.cancel")}</button>
        <button type="button" data-order-confirm disabled={working || order.items.length === 0 || Boolean(validation)} onClick={save} className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm text-background disabled:opacity-50">
          {/* 忙碌图标反映实际请求期，命名开启时按钮直接说明会改文件名。 */}
          {/* 未开启改名的确认只写顺序，两种动作不使用同一个含糊的“应用”文案。 */}
          {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : renameEnabled ? <Pencil className="h-4 w-4" /> : <Check className="h-4 w-4" />}{renameEnabled ? t("create.historyOrder.renameAction") : t("create.historyOrder.applyOrder")}
        </button>
      </div>
    </div>
  );
  return (
    // 图库排序页：外壳承接返回和 Escape，业务 close 再统一判断是否允许关闭。
    // 关闭回调不直接写入 store，只有确认按钮才会提交排序偏好。
    // bodyClassName 只调整本业务的列表留白，没有复制弹窗定位与宽高规则。
    <ResourceDialogShell open title={t("create.historyOrder.title")} titleId="history-image-order-title" description={t("create.historyOrder.description")} toolbar={toolbar} footer={footer} onOpenChange={open => { if (!open && !working) close(); }} closeLabel={t("common.close")} bodyPadded={false} bodyClassName="px-4 py-3">
      {order.items.length === 0 ? <p data-order-empty className="p-8 text-center text-sm text-muted-foreground">{t("create.historyOrder.empty")}</p> : (
        // 空库可能来自外部删除或扫描刷新，展示明确空态而非可确认的空操作。
        // ids 和行 key 都使用完整路径，SortableList 的碰撞名单与真实列表一致。
        // 垂直策略沿用视频片段列表的排序方式；图库只注入自己的 move 回调。
        // 手柄和容器同时禁用，异步执行中不能改变 UI 队列误导执行编号。
        <SortableList ids={order.items.map(image => image.filePath)} layout="vertical" disabled={working} onMove={order.move}>
          <div data-history-order-list className="space-y-2">
            {order.items.map((image, index) => <SortableOrderCard key={image.filePath} image={image} index={index} label={t("create.historyOrder.drag", { name: image.fileName })} disabled={working} />)}
          </div>
        </SortableList>
      )}
    </ResourceDialogShell>
  );
}

/** 抓取点沿用同一个 dnd-kit 子项，不让点击预览卡片本身开始拖动。 */
// 图片行只负责展示，不选择时间线、不打开详情，也不写入持久化。
// index + 1 是当前位置标记，不是可修改的文件编号或排序键。
// handle 与正文分开，用户仍能选择文件名文字而不意外拖动卡片。
// setNodeRef 交给整行，库按行的真实高度计算上下让位。
// setActivatorNodeRef 交给按钮，使键盘提起与焦点恢复落在可操作的抓取点。
// listeners 和 attributes 由同一个 useSortable 提供，避免鼠标与键盘各写一套协议。
// transform 只是拖动中的视觉位置，最终顺序由公共容器在放手时通知 hook。
// transition 来自已有库的归位机制，不另起定时器驱动卡片动画。
// isDragging 只提高当前行层级，不能用阴影或临时位置判断排列已经提交。
// 透明失败占位仍保留固定宽高，读取不到缩略图时文件名和手柄不会左右跳动。
// 缺图不代表文件改名不可用，真实文件是否存在由主进程再次核实。
// alt 为空是因为相邻文件名已提供身份，装饰缩略图不重复朗读同一句。
// 按钮的 label 含真实文件名，多个手柄可以在辅助功能列表里区分。
// 原生 disabled 阻止忙碌时点击；容器也在提交边界检查 disabled。
// touch-none 只用在抓取按钮上，用户仍能在其余行区域滑动滚动列表。
// visible 焦点环帮助键盘用户确认正在操作哪一张图，不用常驻粗框模拟选中。
// 文件名省略只影响视觉展示，title、回调和文件身份仍保留完整字符串。
// 这些行没有独立加载或保存状态，真正异步操作统一由上层窗口负责。
function SortableOrderCard({ image, index, label, disabled }: { image: GeneratedImageFile; index: number; label: string; disabled: boolean }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: image.filePath, disabled });
  return <article ref={setNodeRef} data-order-image={image.filePath}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    className={(isDragging ? "relative z-10 shadow-md " : "") + "flex min-w-0 items-center gap-3 rounded-md border border-border bg-background p-2"}>
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs tabular-nums">{index + 1}</span>
    <LocalFileImage filePath={image.filePath} alt="" className="h-14 w-14 shrink-0 rounded object-cover"
      fallback={<span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"><ImageOff size={18} /></span>} />
    <span className="min-w-0 flex-1 truncate text-sm" title={image.fileName}>{image.fileName}</span>
    <button ref={setActivatorNodeRef} type="button" disabled={disabled} {...attributes} {...listeners} data-order-handle={image.filePath} aria-label={label} title={label}
      className="flex h-8 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-stroke">
      <GripVertical className="h-4 w-4" aria-hidden="true" />
    </button>
  </article>;
}
