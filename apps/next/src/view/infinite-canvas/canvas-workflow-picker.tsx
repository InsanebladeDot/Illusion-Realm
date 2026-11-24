"use client";

// 画布只选择创建页已有工作流，不另建模型目录或复制工作流 JSON。
// 像给每张任务单选一条生产线：选线属于草稿，按下生成才允许真正开工。
// 模板编号保存在当前节点，菜单位置与展开状态只活在当前组件。
// 图片和视频共用入口外壳，各自保留适用的模板清单。
// 这里选择的“ANIMA”是基础流，不是声称本机已经找到某个同名模型。
// SDXL 使用创建页 checkpoint 工作流，不能与 Anima 的 UNet 模板互换。
// 图片编辑使用原文字改图默认链，不创建蒙版、边缘或自由编辑变体。
// 视频仅提供 MiniMax 的图生视频与参考模式，Wan 暂不进入画布可选清单。
// 默认配置采取继承模板的方式，不把其中步数、CFG、CLIP/VAE 再抄进节点。
// 这样原模板调整后，未自定义的画布不会被旧副本默认值困住。
// 默认模型仍继承原模板；用户确认的 LoRA 覆盖按工作流单独保存在节点参数中。
// 该入口没有访问令牌和服务地址的需求，便携作品也不应包含这些信息。
// 默认 CLIP/VAE 与采样配置仍由创建页模板提供，不伪造已扫描到的文件选项。
// 修改模板编号只改变下一次任务意图，不重新编码正在预览的本地素材。
// 切回基础流后原图仍在，用户不用为比较两个模板重复导入文件。
// 本轮没有远端副作用，打开菜单不会上传已经导入的图片。
// 工作流名称不是素材标题，长文件名不会改变选中的工作流身份。
import { useRef, useState } from "react";
import { CascadeMenu, type CascadeMenuItem } from "@/components/cascade-menu";
import { DEFAULT_VIDEO_WORKFLOW_ID, VIDEO_WORKFLOWS } from "@/data/videoForm";
import { useTranslation } from "@/i18n";
import type { CanvasData } from "./canvas-model";
import { useCanvasEditorActions } from "./canvas-editor-context";
import { CanvasChip, IconButton } from "./reference-ui/components";
// 配置页按点击加载，原空画布不提前加载图片和视频全部模板。
// 使用 Next 客户端分包，静态导出仍能运行，不新增服务器接口。
// 组件只复用既有资源选择器，默认配置和节点更新仍归本画布所有。

// 输入只含当前节点与原更新回调，不接创建页全局 setter。
// 共用模板不等于共用表单，选择 SDXL 不应改变别的图片卡。
// disabled 由上层真实业务状态传入，不能在本地伪造任务正在运行。
// Partial 交回原事务，未涉及的提示词、比例和素材引用保持原值。
interface PickerProps {
  // 目标由卡片传入，外壳只打开同一工作区内的节点参数。
  // 原节点删除后工作区会卸载侧栏，不保留失效写入入口。
  // 同源媒体可以有多个节点，不能拿素材地址充当编辑身份。
  nodeId: string;
  data: CanvasData;
  onChange: (patch: Partial<CanvasData>) => void;
  disabled?: boolean;
  // 图标入口直达当前配置；菜单入口保留模板分类，不重复持有工作流参数。
  // 两种入口只改变触发方式，配置读写仍使用同一节点回调。
  // 不以按钮外观判断是否已经具备生成执行能力。
  settingsOnly?: boolean;
}

// 下拉内容直接读取视频创建页注册表，名称和新增模板不会维护两份清单。
// 图片基础流仍为 Anima、SDXL；文字改图分别列 H3 和 Anima。
// 文本、音频、导演台不由本入口接管，调用方只对图片和视频挂载它。
// 旧图片没有模板编号时遵循现有图片构建器的 Anima 默认。
// 旧视频遵循创建页 DEFAULT_VIDEO_WORKFLOW_ID，不写死另一个默认名称。
// 不从来源图片宽高推断模板；卡片形状和生成系列没有必然关系。
// 模板编号与显示文案分开，切换界面语言不会产生一笔作品修改。
// 视频名称沿用注册表的 nameKey；没有翻译键的模板显示原登记名称。
// 这里不装载大份模板 JSON，打开空画布不新增推理引擎的加载成本。
// 仅选择配置，不查询 ComfyUI，也不把模板内默认文件名当作本机已安装证明。
export function CanvasWorkflowPicker({ nodeId, data, onChange, disabled, settingsOnly }: PickerProps) {
  const { t } = useTranslation();
  const actions = useCanvasEditorActions();
  // 这里转发稳定节点 ID，不把图片参数临时复制到组件 state。
  // 重复打开同一对象只更新可见性，不制造一笔作品历史。
  // 图片和视频都转交同一个工作区侧栏宿主，节点内不再持有旧视频模态配置。
  // 打开只发送稳定节点身份，实际数据始终来自父级最新文档。
  // 远端图片只打开自己的模式选择，不借这个动作弹出本地参数侧栏。
  // 传入节点身份而非 workflow 快照，可避免连续切换时打开过时配置。
  // 下拉关闭仍归公共级联组件，侧栏关闭仍归工作区，两个生命周期不会互相缓存。
  // 不从调用位置复制字段，三个视频控件在侧栏中直接调用创作页原组件。
  // 工作区复用原 openImageSettings 名称以保留动作接口，不能据此仅支持图片。
  // 该动作不调用生成服务、不改素材文件，也不修改创建页当前模式。
  // 正在生成的禁用态由外层传入，不能通过设置图标绕过节点 busy 限制。
  const configure = () => {
    if (data.remoteImage) { setOpen(true); return; }
    actions.openImageSettings(nodeId);
  };
  const [open, setOpen] = useState(false);
  // 当前工作流的配置页和下拉菜单互斥，避免同时消费 Escape。
  // 模板编号作为配置目标，不从后来变化的显示文字反推当前模板。
  // 关闭清掉临时页状态，不撤回已经通过原事务确认的 LoRA 参数。

  const anchor = useRef<HTMLDivElement>(null);
  const current = data.workflow ?? (data.kind === "video" ? DEFAULT_VIDEO_WORKFLOW_ID : "anima");
  // 这里的白名单只限制画布新选择；创作页共用的注册表仍完整保留。
  // 已有 Wan 草稿不自动改成 MiniMax，避免用户重开时无声丢失模板身份。
  // 视频扩展与加载覆盖仍按末级编号索引，不以系列名称合并两套设置。
  const choices = data.kind === "video"
    ? VIDEO_WORKFLOWS.filter(workflow => workflow.id === "minimax" || workflow.id === "minimax-reference").map(workflow => ({ id: workflow.id, label: workflow.nameKey ? t(workflow.nameKey) : workflow.name }))
    : [{ id: "anima", label: "ANIMA" }, { id: "sdxl", label: "SDXL" }, { id: "anima-edit", label: t("canvas.imageEditWorkflow") }, { id: "minimax-image-edit", label: `MiniMax H3 · ${t("canvas.imageEditWorkflow")}` }, { id: "moss", label: "Moss Image" }];
  // 关闭只收起菜单，外部点击不会回抢焦点到旧节点。
  // Escape 的焦点返回与订阅清理由公共菜单负责，不再注册第二套全局按键。
  // 组件随节点取消选中卸载时，公共菜单的 portal 和监听也随之卸载。
  // 已选值点击仍可关闭，但不重复写作品历史或触发保存。
  // 动作只产生稳定模板编号，不能把菜单文字作为后续执行参数。
  // 类型断言的候选来自固定图片列表或正式视频注册表；持久化两端另有白名单。
  // 每次渲染重建 action，快速改选后比较的是最新节点，不用初次挂载的旧值。
  // 事务回调替换字段，不在这里原地改 data，复制节点的旧快照不会跟着变。
  // 同一编号的重复点击没有事务，避免撤销一次却看不出任何变化。
  // 菜单在选择后收起，选中标签从下一次真实节点数据渲染得出。
  // 即使外层拒绝更新，也不能让这里先保存一份虚假的 selected 状态。
  // 默认只在展示时回落，查看旧节点不会触发自动保存或弄脏作品。
  // 未知编号正常情况下先被恢复校验拒绝，展示回落不构成兼容迁移。
  // disabled 阻止重新打开入口；业务忙碌时不发出额外模板修改动作。
  // 此处没有运行定时器，也没有通过延迟改变节点成功状态。
  // 菜单卸载不会清空已确认编号，重开面板仍由工程数据恢复对勾。
  // 选择模板本身不改视频参考编号；参考素材属于后续独立接入。
  // 图片编辑与基础图片共享卡片，不能靠换类型来破坏既有连接关系。
  // 对勾和触发标签使用同一个 current，避免菜单与按钮分别显示不同模板。
  // 页面失焦只影响菜单生命周期，不影响已经提交的配置。
  // 公共菜单负责可见区域裁切，节点在画布边缘仍可展开实际可选项。
  // 用户取消菜单没有事务，撤销仍回到上一项实际内容更改。
  // 自定义比例和已经导入的文件始终不随模板切换被清空。
  const close = () => setOpen(false);
  const items: CascadeMenuItem[] = choices.map(choice => ({
    ...choice, selected: !data.remoteImage && choice.id === current,
    action: () => {
      if (choice.id !== current || data.remoteImage) onChange({ workflow: choice.id as CanvasData["workflow"], remoteImage: undefined, mode: choice.id === "anima-edit" || choice.id === "minimax" || choice.id === "wan2.2" ? "image" : choice.id === "minimax-reference" || choice.id === "minimax-image-edit" ? "reference" : "text" });
      close();
      // 选择只切换模板；保留该模板已确认的覆盖，齿轮才打开参数侧栏。
    },
  }));
  // 分类像逐层打开文件柜：本地是来源，系列是抽屉，最末项才是真正模板。
  // 父项只导航，不提前把 Anima 或 SDXL 写成已经确认的选择。
  // 叶子保留旧模板编号，原工程、默认配置和 LoRA 表无需迁移。
  // Anima 图片编辑只使用文字改图，不能把蒙版或边缘功能混进这个入口。
  // 视频保留原登记模板，来源分组不会重写视频模式或参考输入。
  // 非本地没有真实适配器，因此原生禁用并说明原因，不提供可点的占位。
  // 已选路径也由 current 推导，切换语言不改变所属分类。
  // 图标不能在 busy 时打开，避免任务锁定期间出现另一条修改途径。
  // 关闭页仍由锚点恢复焦点，不把用户送到另一个节点的按钮。
  // 菜单项和图标共享 data；两者不会分别缓存一份权重数组。
  // 父项的对勾仅帮助定位，展开父项不产生作品历史。
  // 未配置的旧节点继续只读默认，打开设置不会先写一笔空事务。
  // 资源选择仍走现有创建页组件，没有新增模型扫描或网络生成请求。
  // 级联展开继续交给公共菜单处理窄窗与键盘，不在此处复制定位算法。
  // 菜单根只表达资源来源，本地分组中才区分工作流系列。
  // “Anima”本身不是可执行任务，选择基础流或文字改图才产生稳定编号。
  // SDXL 当前只有标准文生图，不用空的图片编辑项暗示功能已接通。
  // 两个基础流显示同一句“标准文生图”，父级系列负责消除歧义。
  // 保存仍是 anima 和 sdxl，不把完整中文路径串写进工程。
  // 中文与英文只更换标签，模板编号、当前对勾和 LoRA 参数保持不变。
  // 视频在本地组内增加 MiniMax 系列，两个原模板作为末级选项。
  // Minimax 基础流和参考流的相似名称由原 nameKey 翻译，不能手写一组过期名称。
  // 不删除全局 Wan 注册和旧工程编号，暂停新选项不应破坏其他入口或已保存作品。
  // 非本地来源目前没有服务适配层，因此点击不会打开空表或返回假成功。
  // 不隐藏这个来源有助于表达当前分类，但 disabledReason 必须解释真实限制。
  // 键盘导航会跳过原生禁用项，用户不会卡在没有动作的“暂定”项。
  // 级联组件会在横向空间不足时退为逐级返回，不强制将三列挤出视口。
  // 配置图标不显示一个新的临时选中模板，只从当前 data.workflow 取值。
  // 图片打开侧栏的动作转交所属工作区，一个实例不会叠加多个侧栏。
  // 关闭设置后的焦点回到原触发节点，即使菜单叶子已卸载仍有明确返回目标。
  // 节点 title 与模型标签是不同信息，重命名节点不会更换当前工作流。
  // 选择模板不会移除已有端口引用，图连接和参数分类继续保持各自身份。
  // 未来接执行时必须消费相同 workflow，不可另从创建页全局当前系列猜测。
  const grouped: CascadeMenuItem[] = [
    { id: "local", label: t("canvas.localWorkflows"), children: data.kind === "video" ? [{ id: "minimax-series", label: "MiniMax", children: items }] : [
      { id: "minimax-image-series", label: "MiniMax H3", children: [{ ...items[3], label: t("canvas.imageEditWorkflow") }] },
      { id: "anima-series", label: "Anima", children: [
        { ...items[0], label: t("canvas.standardImageWorkflow") },
        { ...items[2], label: t("canvas.imageEditWorkflow") },
      ] },
      { id: "sdxl-series", label: "SDXL", children: [{ ...items[1], label: t("canvas.standardImageWorkflow") }] },
      { id: "moss-series", label: "Moss Image", children: [{ ...items[4], label: t("canvas.standardImageWorkflow") }] },
    ] },
    { id: "remote", label: t("canvas.remoteWorkflows"), ...(data.kind !== "image" ? { disabledReason: t("canvas.remoteVideoUnavailable") } : { children: [
      { id: "euzhi", label: "Euzhi", children: ["gpt-image-2", "gpt-image-2.5-sunburst", "gpt-image-2.5-flare"].map(model => ({
        id: model, label: model, children: (["text", "image", "reference"] as const).map(mode => ({
          id: `${model}-${mode}`, label: t(mode === "text" ? "canvas.modeTextImage" : mode === "image" ? "canvas.modeImageImage" : "canvas.modeReference"),
          selected: data.remoteImage?.model === model && (data.mode ?? "text") === mode,
          action: () => {
            // 首次用方图，换在线模型或用途时沿用已选尺寸。
            const remoteImage = data.remoteImage ?? { provider: "euzhi", size: "1024x1024", quality: "medium" } as const;
            onChange({
              remoteImage: { ...remoteImage, model: model as NonNullable<CanvasData["remoteImage"]>["model"] },
              mode,
            });
            close();
          },
        })),
      })) },
    ] }) },
  ];
  // 沿用 CanvasChip，避免为了选择模型复制一套有粗边框的按钮。
  // 公共 CascadeMenu 就是创建页翻译和画布右键所用的展开组件。
  // 菜单采用 portal 绘制，不被卡片圆角或参数面板的裁切截断。
  // 稳定标记只供自动操作定位，不能用它绕过原节点事务。
  // popover 标记让画布快捷键识别浮层，方向键不会同时移动底层选择。
  // 选中对勾由真实 workflow 决定，鼠标移出不能取消配置。
  // title 说明配置与执行的区别，不给仅选模板显示假成功通知。
  // 多节点分别持有 open，切换选中不会重开上一个节点的菜单。
  // 菜单中的方向键、Home/End、Escape 继续复用公共可访问路径。
  // 主题与窄窗沿用公共菜单，画布不为工作流另起一套配色和定位算法。
  return <div ref={anchor} data-canvas-workflow data-canvas-popover={open ? "" : undefined}>
    {settingsOnly ? <IconButton icon="settings" label={t("canvas.settings")} disabled={disabled} onClick={() => configure()} /> : <CanvasChip disabled={disabled} expanded={open} onClick={() => setOpen(value => !value)} reason={t("canvas.workflowConfiguration")}>
      {data.remoteImage ? `${data.remoteImage.model} · ${t(data.mode === "image" ? "canvas.modeImageImage" : data.mode === "reference" ? "canvas.modeReference" : "canvas.modeTextImage")}` : choices.find(choice => choice.id === current)?.label ?? t("canvas.workflow")}
    </CanvasChip>}
    {/* 工作流门户：中性标记让黑白配色不被 body 的蓝色主题覆盖。 */}
    {/* 原级联定位与对勾仍复用，不能另画一个只有外观相似的下拉。 */}
    {/* 每张节点只挂载自己的配置页，更新回调不会越过该节点写到创建页。 */}
    {open && <CascadeMenu anchor={anchor} items={grouped} label={t("canvas.workflow")} backLabel={t("create.promptAssistant.back")} attributes={{ "data-canvas-workflow-menu": true, "data-canvas-theme": true }} onClose={close} />}

  </div>;
}
