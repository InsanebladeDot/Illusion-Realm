"use client";

// 整块创建表单使用原 Zustand 初始化器，这里仅把节点参数翻译为原表单字段。
// 像两种插座间的转换头：不重新制造电器，也不把另一间房间的开关接进来。
// 局部 store 不安装 persist，写盘仍是原节点命令；卸载时取消订阅。
// 画布侧栏和页脚共用创作页允许的比例身份，避免八项中只有旧四项能回写。
// 外层ratio与表单size.aspectRatio是旧协议已有两种记法，在边界只转换分隔符。
// 侧栏修改使用原isAspectRatioLabel判定，不在适配器复制另一个允许列表。
// 无效草稿仍由原表单处理，不能直接保存任意带冒号的字符串。
// 本次不合并节点store，两个节点继续拥有各自局部表单快照。
// 比例来源共用不意味着参数值共用，切换对象不能覆盖其他卡的构图。
// 输出分辨率仍遵循已有画质换算，静态比例表的训练像素不替代自定义像素。
import { useLayoutEffect, useRef, useState } from "react";
import type { StoreApi } from "zustand";
import { createImageFormStore, type CreateFormState } from "@/stores/useCreateFormStore";
import { getImageWorkflowDefaults, type ImageWorkflowSeries } from "@/utils/comfy/imageWorkflow";
import { ANIMA_EDIT_DEFAULTS } from "@/utils/comfy/anima-edit-workflow";
import { isAspectRatioLabel, sanitizeAspectRatio } from "@/data/imageSizes";
import { assemblePrompt } from "@/utils/promptTabs";
import { clampSeed } from "@/utils/seed";
import type { CanvasData } from "./canvas-model";

export type CanvasImageFormWorkflow = ImageWorkflowSeries | "anima-edit";
type Parameters = NonNullable<NonNullable<CanvasData["imageParameters"]>["anima"]>;
interface Input { workflow: CanvasImageFormWorkflow; data: CanvasData; onChange: (patch: Partial<CanvasData>) => void }

// 初始化只读默认，不把默认值批量写回已有工程。
// 种子数值仅供原字段展示，用户没改它时不会覆盖节点已保存的字符串草稿。
// 预设像素由原尺寸组件解析，适配器只转字段名，不另算宽高。
/**
 * 参数接线的输入来自当前工作流的附表，不从全局创建页推测用户选择。
 * anima-edit 虽和 Anima 共用界面，默认采样值仍从真实编辑模板读取。
 * SDXL 的默认值跟随它自己的工作流，不能借 Anima 默认步数补空。
 * 节点没有附表是旧作品的合法状态，打开设置不等于用户确认了一份覆盖。
 * 默认值只进入局部工作单，真正修改后才由 publish 写回差量。
 * steps 是采样步数，不是动画帧数，不能映射到节点的视频时长字段。
 * cfg 是提示词引导强度，沿用原滑条的小数精度和限幅。
 * sampler 保存原工作流机器值，不能把下拉菜单的翻译名称写入模板。
 * scheduler 同样保留机器值，显示语言变化不会更换执行参数。
 * 缺省随机种子模式不会在打开侧栏时生成一个新种子。
 * customSeed 供原数值控件使用，节点旧字符串直到用户实际编辑才转换保存。
 * clampSeed 沿用创建页范围，避免转接时另造不同的最大安全整数规则。
 * Number 的转换只用于展示，不把转换结果立即写回原始工程。
 * 选择随机模式保留自定义数字，方便以后切回时仍看到原草稿。
 * sizeMode 区分预设和自定义；仅有宽高数字不足以推断当前模式。
 * aspectRatio 缺省时才读取节点页脚比例，已确认完整尺寸优先。
 * 页脚使用斜杠，原尺寸选择器使用冒号，转换只发生在适配边界。
 * sanitizeAspectRatio 沿用已有允许集，不能用任意字符串扩展原尺寸选项。
 * 非法历史比例的回退由公共尺寸工具决定，本层不维护另一个合法值列表。
 * customWidth 和 customHeight 即使当前使用预设也保留，方便模式往返。
 * 自定义像素默认一千零二十四，不代表导入图片或视频已经被重新采样。
 * sizeScale 是输出尺寸倍率，和页脚生成张数 batchSize 是两个独立意图。
 * 整块原表单会用 createSizeSelection 计算输出像素，这里不重复计算。
 * 图片卡片外形属于画布展示，不能由这里的输出宽高直接改卡片世界坐标。
 * prompt 不属于该数值快照；普通和高级正文另有各自的写入路径。
 * 主模型引用也不进入局部 store，它由原模型选择器确认到节点附表。
 * CLIP/VAE 以原覆盖对象保存，局部采样状态不能清空加载器选择。
 * LoRA 保持 workflowLoras 的既有身份与权重，不混入采样器字段。
 * 负面词保持每工作流的独立正文，不进入高级正向分类拼接。
 * batchSize 在原底栏受控，局部数值同步不应把六张恢复成一张。
 * 用 satisfies 检查原表单字段形状，防止接线把合法值静默接到拼错的键。
 * 返回对象不包含任何原 store 动作，动作始终来自共享初始化器。
 */
function snapshot({ workflow, data }: Input) {
  const row = data.imageParameters?.[workflow] ?? {};
  const defaults = workflow === "anima-edit" ? ANIMA_EDIT_DEFAULTS : getImageWorkflowDefaults(workflow);
  return {
    upscale: data.upscale,
    steps: row.steps ?? defaults.steps, cfg: row.cfg ?? defaults.cfg,
    sampler: row.sampler ?? defaults.samplerName, scheduler: row.scheduler ?? defaults.scheduler,
    seedMode: row.seedMode ?? "random", customSeed: clampSeed(Number(row.seed ?? 0)),
    sizeMode: row.size?.mode ?? "preset", aspectRatio: sanitizeAspectRatio(row.size?.aspectRatio ?? data.ratio.replace("/", ":")),
    customWidth: row.size?.customWidth ?? 1024, customHeight: row.size?.customHeight ?? 1024, sizeScale: row.size?.scale ?? 1,
  } satisfies Partial<CreateFormState>;
}

// 仅记录确实改变的参数，查看表单不物化默认，也不改其他模板的确认值。
// 原动作可能一次改多个尺寸字段，因此尺寸作为一笔完整输入一起写回。
// seedMode 与种子数字分开比较，开启随机不删除原自定义数字。
/**
 * next 和 previous 来自同一个局部 store 的连续快照，比较的是用户这次动作。
 * 不能把 next 和模板默认比较，否则用户改回默认时无法清除上次的值。
 * 一次动作可能同时修改种子模式和种子数字，两者都要记录。
 * sampler 和 scheduler 的空缺表示继承，不能写成一个无法执行的空名称。
 * 限幅和输入草稿仍由原字段负责，本函数不制造另一套提交校验。
 * 滑条拖动会多次通知，每次都经原节点事务，不假装它们已经合并成一笔撤销。
 * 这里只比较数值原始值，不用格式化后的显示字符串判断变化。
 * 小数 CFG 的正常精度来自原控件，适配器不额外四舍五入。
 * 数字种子只有改变时才序列化为字符串，避免查看即改写旧作品。
 * 随机和自定义互切时，未变化的 seed 数字不会被本次 patch 重复覆盖。
 * 尺寸字段相互关联，不能只写 mode 却漏掉刚修改的 customWidth。
 * 用户选择预设时原动作会一起更新比例和倍率，本函数把它们作为同一尺寸输入。
 * 尺寸快照包含当前自定义宽高，即使当前模式为 preset，也不丢掉备用草稿。
 * size 生成新对象，不修改 previous 内部对象，复制节点不会被连带修改。
 * 没有变化返回空补丁，后续不会发起节点事务或标记工程未保存。
 * 不是每次 store 通知都代表生成参数变化，切换活动分类也会通知。
 * 本函数故意不包含 prompt，分类组装有独立的变化判定。
 * 不比较 promptTemplates 的名称，保存模板不是修改采样参数。
 * 不比较折叠状态，界面收起不能让画布多一笔无内容的历史。
 * 不修改其他工作流键，SDXL 和 Anima 可以在同一节点分别保留值。
 * 不写媒体路径，调整参数不能移动、复制或重新导入源文件。
 * 本层不访问 IPC，持久化失败仍由原画布保存器显示真实错误。
 * Partial 表示真实差量，不要求用户为了修改一个值填满整份配置。
 * 空补丁不等于用户清空全部参数，不能把它解释成恢复默认操作。
 */
function parameterPatch(next: CreateFormState, previous: CreateFormState): Partial<Parameters> {
  const patch: Partial<Parameters> = {};
  if (next.steps !== previous.steps) patch.steps = next.steps;
  if (next.cfg !== previous.cfg) patch.cfg = next.cfg;
  if (next.sampler !== previous.sampler && next.sampler) patch.sampler = next.sampler;
  if (next.scheduler !== previous.scheduler && next.scheduler) patch.scheduler = next.scheduler;
  if (next.seedMode !== previous.seedMode) patch.seedMode = next.seedMode;
  if (next.customSeed !== previous.customSeed) patch.seed = String(next.customSeed);
  if (next.sizeMode !== previous.sizeMode || next.aspectRatio !== previous.aspectRatio || next.customWidth !== previous.customWidth || next.customHeight !== previous.customHeight || next.sizeScale !== previous.sizeScale) {
    patch.size = { mode: next.sizeMode, aspectRatio: next.aspectRatio, customWidth: next.customWidth, customHeight: next.customHeight, scale: next.sizeScale };
  }
  return patch;
}

// 外部撤销和节点正文编辑与字段修改共用同一输入来源。
// 已有分类与正文一致就保留；不一致仅替换分类内容，不让旧分类覆盖撤销结果。
// 更新期间由调用方锁住回写，水合不是用户新建的一笔历史。
/**
 * 外部节点是事实来源：撤销、恢复和页脚输入都可能改变当前已确认数据。
 * 不能只在挂载时初始化，否则侧栏打开时的撤销结果不会反映到字段。
 * 同步只对当前工作单生效，不回填全局 useCreateFormStore。
 * 当前输入引用每次提交后更新，不能拿首次打开时的 onChange 闭包覆盖新字段。
 * 原表单包含多个独立选择器，非采样变化不会强制重新创建整个局部 store。
 * 保留 store 身份能让正在使用的数值输入和高级分类继续沿用原订阅。
 * 通过值比较跳过等价 setState，减少无意义的子组件重绘。
 * Object.entries 只枚举本模块明确构造的字段，没有读入任意作品扩展键。
 * keyof 收窄仅用于查原状态，不把未知输入伪装成已通过的工程数据。
 * 工程文档的校验仍在原 schema 和主进程，不由本展示同步取代。
 * 高级模式下外部正文改变时，分类也必须刷新，否则下次分类编辑会复活旧正文。
 * assemblePrompt 复用原顺序和分隔符，不用简单 join 猜测最终字符串。
 * 比较正文忽略首尾空白，与高级组装原有的 trim 约定相同。
 * 外部正文不能可靠拆回多个分类，带逗号的自然语言不是分类分隔证据。
 * 因此仅把外部恢复的正文放在首分类，其余内容清空，分类结构保持不变。
 * 默认分类身份没有重建，原角色工具和动作工具仍能找到注册的目标。
 * 自定义分类的工具绑定、快捷词和名称不因正文恢复被删除。
 * 全部正文为空也是有效恢复，不用模板词替用户填充。
 * 普通模式的 PromptInput 直接受 data.prompt 控制，无需在这里另写 DOM。
 * 不能在水合时顺带打开高级开关，用户的观察模式与工程参数是不同状态。
 * 调用方在整个同步期间举起 syncing 标志，原订阅看到标志就不回写。
 * 这像收货与发货分开的柜台，收到外部货单时不能立刻当成新订单再次寄出。
 * 若不加单向门闩，撤销一次可能又被订阅提交一次，造成历史来回跳动。
 * setState 是 Zustand 同步动作，标志在它返回后才能放下。
 * 同步过程没有异步等待，不需要跨任务保持一个不确定的 pending 状态。
 * 模板切换由父级 key 卸载旧工作单，不能让本函数跨模板猜测迁移规则。
 * 字段默认值计算是纯函数，水合不扫描文件或请求模型服务。
 * 用户文件临时离线不会阻止已有参数在侧栏展示。
 */
function hydrate(store: StoreApi<CreateFormState>, input: Input) {
  const values: Partial<CreateFormState> = snapshot(input);
  const previous = store.getState();
  if (previous.advancedPrompt && assemblePrompt(previous.promptTabs) !== input.data.prompt.trim()) {
    values.promptTabs = previous.promptTabs.map((tab, index) => ({ ...tab, content: index === 0 ? input.data.prompt : "" }));
  }
  if (Object.entries(values).some(([key, value]) => previous[key as keyof CreateFormState] !== value)) store.setState(values);
}

// 原 store 动作产生差量，节点事务仍是保存、撤销和复制的唯一入口。
// 不能把原表单快照整份写回，否则会覆盖刚由其他控件修改的倍数或媒体。
// 高级组装只保存现有契约支持的拼接正文；分类结构和模板留在当前表单会话。
/**
 * 发布目标始终包含当前 workflow，不以界面文字或系列显示名猜键。
 * anima-edit 使用 Anima 的外观但保存到自己的附表，不能覆盖普通 anima。
 * 拼接正文保存在节点原 prompt，侧栏与卡片正文仍是同一事实来源。
 * 四千字符上限沿用节点提示词契约，不能让高级入口绕过普通输入限制。
 * 截断只影响写入正文，不把媒体描述或文件路径拼进提示词。
 * advancedPrompt 刚开启时即发布已有分类，让普通预览立刻显示正确拼接结果。
 * 只移动活动分类而不改内容不会发布 prompt，避免切标签就写一笔历史。
 * 分类数组改变时才重算发布条件，不监听整个 DOM 的 mutation。
 * 高级关闭时当前正文已由上一笔分类更新保存，不再发一笔内容相同的事务。
 * 改采样和改正文可以出现在同一次 store 动作里，补丁会同时保留两部分。
 * 没有采样变化且无需发布正文时，onChange 根本不会调用。
 * ratio 只同步页脚明确支持的四种快捷比例。
 * 完整尺寸选择器的其他合法比例仍保存在 size，不能被页脚允许集裁掉。
 * 自定义模式由原页脚读取 size.mode，不能靠把 ratio 写成“自定义”表示。
 * 比例格式转换只针对已确认的 aspectRatio，不修改用户的正文字符串。
 * imageParameters 先保留最新整表，再替换当前工作流的一项。
 * 当前项再保留旧字段，最后合入差量，负面词和主模型不被采样动作清空。
 * 三层不可变合并对应节点、模板表、参数项，不能省略成原地改对象。
 * 同源复制的两个节点即使起始引用相同，后续更新也会得到独立的新对象。
 * onChange 仍交回原编辑器，撤销、自动保存和保存状态提示不在此重做。
 * 本函数不直接调用 userDataStorage，避免绕过原文档合并和写入顺序。
 * 也不调用全局创建页动作，防止画布编辑污染普通文生图的草稿。
 * 不发生成请求；用户改参数不应该触发排队、上传或随机采样。
 * 失败反馈属于原保存链，本适配器不能显示一个与写盘结果无关的成功提示。
 * 历史粒度保持原编辑器行为，本轮没有承诺滑条多次通知会自动合并。
 * 模板分类和组装模板仅属于当前表单会话，未扩展工程文件格式保存它们。
 * 节点重开可从已保存正文重新进入组装，不能声称分类结构已经持久化。
 * 更新数量仍由底栏受控入口处理，不在这次参数发布里暗改 batchSize。
 */
function publish(input: Input, next: CreateFormState, previous: CreateFormState) {
  const { workflow, data, onChange } = input;
  const patch = parameterPatch(next, previous);
  const prompt = next.advancedPrompt && (next.promptTabs !== previous.promptTabs || !previous.advancedPrompt) ? assemblePrompt(next.promptTabs).slice(0, 4000) : undefined;
  const upscaleChanged = next.upscale !== previous.upscale;
  if (!Object.keys(patch).length && prompt === undefined && !upscaleChanged) return;
  onChange({
    ...(upscaleChanged ? { upscale: next.upscale } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(patch.size && isAspectRatioLabel(patch.size.aspectRatio) ? { ratio: patch.size.aspectRatio.replace(":", "/") } : {}),
    ...(Object.keys(patch).length ? { imageParameters: { ...data.imageParameters, [workflow]: { ...data.imageParameters?.[workflow], ...patch } } } : {}),
  });
}

// 回调与外部恢复都读最新节点，不能把打开设置时的整份旧 data 写回去。
// syncing 像只允许单向通行的门：外部恢复时只入站，不立刻当作用户编辑再出站。
// 节点撤销、页脚比例及复制后的更新可重新水合，不靠全局创建草稿中转。
/**
 * 一次 hook 挂载对应当前节点与工作流的表单会话。
 * 父级使用稳定节点和工作流 key，身份变化会释放旧订阅并初始化新草稿。
 * 工厂来自原创建 store 的初始化器，动作闭包绑定这份独立 store 的 set。
 * 不能浅拷贝全局 getState，因为那会连同写向全局的 setter 闭包一起复制。
 * 局部 store 没有 persist 中间件，不会占用创建页的存储键。
 * 初始化分类来自原默认分类，首分类正文才替换为当前节点提示词。
 * 原默认分类的顺序、工具绑定和标签名保持共享来源。
 * useState 的初始化器只执行本实例的首次建单，普通重绘不会重置已编辑分类。
 * 当前工作流默认参数一并放入工作单，原字段首帧不闪现全局默认值。
 * layout effect 在用户下一次交互前同步最新外部节点值。
 * current ref 只转交最新输入，不作为第二份工程状态保存。
 * syncing ref 仅用于阻止反向回写，不参与页面展示或工程序列化。
 * 订阅是在挂载 effect 中建立，不在每次渲染期间累计监听器。
 * effect 返回 Zustand 的 unsubscribe，关闭侧栏后旧节点不会继续响应。
 * React 开发重放会先清理再订阅，不会让同一个操作生成双份节点 patch。
 * 后台布局与窗口可见性不参与同步，节点恢复不依赖 rAF 才能完成。
 * 这一 hook 没有定时器和网络请求，不需要伪造加载进度或成功延时。
 * 事件回写发生在真实字段动作后，页面初始展示不会写入整份默认覆盖。
 * 外部参数改变会触发 hydrate，但不会卸载原输入或抢夺当前键盘焦点。
 * 工程数据卸载后仍由原持久化链保存，局部会话本身可以直接释放。
 * 关闭丢弃的是临时分类结构和折叠偏好，不是已经写入节点的确认参数。
 * 自定义组装模板没有被写入创建页全局模板表，隔离优先于偷偷共享草稿。
 * 不使用模块级 Map 缓存节点 store，避免删除大量节点后仍保留所有表单内存。
 * 重开恢复以节点确认值为准，不把上次已被撤销的局部快照重新盖回来。
 * 同一 hook 不能同时服务两个节点；所有权由当前组件实例保证。
 * 多个节点可以使用相同模板，但不会因为模板编号相同就共用这份 store。
 * 媒体播放状态不在 store 中，参数表单的更新不应重新创建媒体元素。
 * 返回的是原 StoreApi，完整创建组件继续使用既有 Zustand useStore 订阅。
 */
export function useCanvasImageForm(input: Input) {
  const current = useRef(input);
  const syncing = useRef(false);
  const [store] = useState(() => {
    const value = createImageFormStore();
    value.setState({ ...snapshot(input), promptTabs: value.getState().promptTabs.map((tab, index) => ({ ...tab, content: index === 0 ? input.data.prompt : "" })) });
    return value;
  });
  useLayoutEffect(() => {
    current.current = input;
    syncing.current = true;
    hydrate(store, input);
    syncing.current = false;
  }, [input, store]);
  useLayoutEffect(() => store.subscribe((next, previous) => {
    if (syncing.current) return;
    publish(current.current, next, previous);
  }), [store]);
  return store;
}
