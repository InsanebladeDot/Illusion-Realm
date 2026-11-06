"use client";

/**
 * Agent 站点与模型偏好：普通 JSON 只保存非机密选择，凭据另走主进程。
 * 各站分别记住上次模型；首次 Euzhi 由核实目录推荐，不按名称猜最低价。
 * 硅基流动旧文档继续使用原默认模型，不因升级悄悄改变现有对话。
 * 目录更新不自动换用户模型；下架或账户不可用时在发送前明确报错。
 * 异步目录按 provider 存放，切换站点后的迟到响应不能覆盖当前列表。
 * 同站请求合并；失败保留旧列表并显示错误码，不清空用户选择。
 * 存储加载与保存都有失败路径，保存失败不能显示成已经切换。
 * 选择器和设置页共享同一状态，实际发送也读取这一份。
 */
import { create } from 'zustand';
import { AGENT_DEFAULTS, AgentPreferencesSchema, type AgentProvider, type AgentCatalog, type AgentPreferences } from '@illusion-realm/shared';
import { createUserDataSectionPersistStorage, flushUserDataSave } from '@/utils/userDataStorage';
import { readAgentCatalog } from '@/utils/agent-provider';
import { t } from '@/i18n';
const defaults: AgentPreferences = { provider: 'siliconflow', models: { siliconflow: AGENT_DEFAULTS.model, euzhi: '' } };
// 当前数据格式没有版本升级需求：只是 v1 用户文档上的可选增量 section。
// 历史聊天不会记录这些新字段，因此加载旧会话不触发不可逆迁移。
// 站点切换后返回旧站时从 models 字典恢复，不以最后一个全局字符串代替。
// 选择保存失败不会清空此前选择，也不会回到与用户期望不同的免费模型。
// 已选的 premium 模型同样被保留，价格分档不是自动降级或升级策略。
// 目录下架与网络故障的区分依赖 catalog 结果，不能从空搜索结果推断下架。
// 用户未填写密钥也可以先确定模型，凭据校验在实际发送之前进行。
// 状态 store 不读取环境变量，避免把主进程开发配置镜像进浏览器内存。
// 问题发生时只显示固定业务提示，不把整份偏好对象写入错误日志。
// 硅基流动和 Euzhi 的目录错误互不覆盖，用户可以主动切站继续使用。
// 本 store 的重载验证通过主进程文档夹具完成，真实推理另需用户有效 key。
// 任务执行结果仍由原 Agent store 管理，目录刷新不会制造或结束一次运行。
// 组件可同时订阅 preferences 与 catalogs，模型名和价格解释来自一致的数据源。
const storage = createUserDataSectionPersistStorage<AgentPreferences>('agentPreferences');
let loading: Promise<void> | null = null;
// 普通 JSON 是单文档，快速点击两个站点时写入必须保持用户操作顺序。
// 队列只保存 Promise，不保存原始 key；本 store 从不接收凭据参数。
// 失败分支会释放队列，下一次选择仍可重试。
let preferencesWrite: Promise<void> = Promise.resolve();
const jobs = new Map<AgentProvider, Promise<void>>();
// defaults 只包含旧模型 ID 和空的新站选择，不复制密钥配置状态。
// structuredClone 用于初始化，避免后续偏好修改回写默认对象本身。
// models 使用站点作键，来回切换不会丢掉各站最后一次选择。
// AgentPreferencesSchema 允许旧文档缺此字段，由 load 明确回退默认值。
// 不在 shared 文档默认值里强制新增非可选字段，保持 v1 旧文件兼容。
// 价格目录属于临时视图，写入普通用户文档会留下过期权限与价格，因此不持久化。
// catalog 的可见性来自主进程，客户端 store 不根据模型名字猜工具支持。
// errors 用于传输/解析失败，catalog.error 用于有旧数据可保留的联网失败。
// 两种错误同时存在时 UI 都能提示，不能用旧成功数据掩盖刚发生的失败。
// busy 只控制刷新按钮，不意味着模型推理正在运行。
// active run 状态继续由原 Agent store 管理，不在此引入第二个任务队列。
// loading 共享一次文档读取，防止设置页和 composer 各自同时迁移偏好。
// jobs 保留所属 provider，站点 A 返回时不会覆写站点 B 的目录字段。
// store 不订阅远端推送，周期策略由 useAgentProviders 在挂载范围内提供。
// 关闭模型弹窗不会清理持久化偏好，只清理组件自己的搜索草稿。
// catalogs 与 errors 独立于偏好，不把模型价格或账户可见性写进用户普通备份。
// busy 按站点存，两个窗口请求不同服务商时不会互相锁住。
// error 只包含稳定目录错误码，原始 IPC 错误不会原样出现在页面。
// ready 为 true 之前不能提交默认选择，防止覆盖刚从磁盘加载的偏好。
// model 为空只允许首次使用尚未读取目录的 Euzhi。
// choose 是唯一持久化入口，选择不隐含聊天请求或账户操作。
// load 的失败会清掉 loading，用户之后可以重试。
// refresh 的失败由 store 消化，界面从 errors 提示，不产生未处理 rejection。
interface ProviderState {
  preferences: AgentPreferences; ready: boolean; catalogs: Partial<Record<AgentProvider, AgentCatalog>>;
  errors: Partial<Record<AgentProvider, boolean>>; busy: Partial<Record<AgentProvider, boolean>>;
  load: () => Promise<void>; choose: (provider: AgentProvider, model?: string) => Promise<void>; refresh: (provider: AgentProvider, force?: boolean) => Promise<void>;
}
/**
 * load 合并旧文档的缺失字段，再用 schema 验证，损坏值回退原默认选择。
 * 不把未识别的 provider 当自定义站点，因为其密钥边界无法确定。
 * 读取偏好不会自动发请求，只有可见页面的生命周期启动目录刷新。
 * 保存失败保留旧偏好，让界面与实际落盘状态一致。
 * 先写存储再发布新选择，避免消息刚发送却保存失败的时序。
 * 目录异步结果只写入所属 provider，不从闭包读取新站点。
 * 推荐只是首次填空，用户明确选过的模型即使更贵也不覆盖。
 */
export const useAgentProviderStore = create<ProviderState>((set, get) => ({
  preferences: structuredClone(defaults), ready: false, catalogs: {}, errors: {}, busy: {},
  load: () => {
    // 文档读取发生在普通用户数据层，不直接访问文件系统或 Electron 原生 API。
    // schema.safeParse 使坏偏好回落旧默认，不因一个手改字段阻断 Agent 页面。
    // 验证两个站点的模型键必须存在，避免 undefined 被当作已选择模型。
    // ready 只有在读取或有意识回退后发布，首帧不抢先保存默认覆盖磁盘。
    // get().load 可被发送入口等待，立刻回车也能使用刚读取的真实偏好。
    // 网络目录刷新不在这个函数里，读取设置不会隐含请求模型服务。
    // 读取抛错时清 loading，下一次用户动作可以重试，而不是永远复用 rejected Promise。
    // 调用者获得同一 Promise，任何 load 失败都能由发起入口显示或记录固定提示。
    // 不在错误日志中输出整份文档，因为普通设置可能包含用户私人路径。
    // ready 不代表密钥已配置，后者必须另向主进程查询所属服务商。
    if (!loading) loading = (async () => {
      try { const value = (await storage.getItem('agentPreferences'))?.state; const parsed = AgentPreferencesSchema.safeParse(value); set({ preferences: parsed.success ? parsed.data : structuredClone(defaults), ready: true }); }
      catch (error) { loading = null; throw error; }
    })();
    return loading;
  },
  // 一次选择只修改目标站点的模型，保留另一站点的最后选择。
  // 不以空字符串覆盖已有模型；首次 Euzhi 的默认值来自有效推荐。
  // 写盘和 UI 提交共用错误路径，表单会显示失败而非静默回退。
  // 运行中对话已经捕获配置，此处不会取消或改写正在执行的请求。
  // 保存字段限于 schema 定义，不夹带目录结果或明文 API Key。
  // flushUserDataSave 保证应用立即关闭也不丢最近选择。
  choose: (provider, model) => {
    // provider 已受 TS 约束，存储格式也由固定 schema 定义，不支持任意新站点。
    // 用户切站只改变 provider，另一站模型的值必须逐字保留。
    // 显式 model 参数表示卡片确认，优先于推荐和此前选择。
    // 省略 model 表示设置页切站，可以恢复该站已保存模型。
    // 从未选择过且已有推荐时固定推荐 ID，之后价格变化不会自动更换付费模型。
    // 目录尚未取得时允许暂留空值，发送前再等待，不造出假定的 Grok ID。
    // createUserDataSectionPersistStorage 合并整个文档的这个 section，不覆盖其他功能。
    // flushUserDataSave 触发真实保存，用户立即退出应用也应保留最近选择。
    // 回滚只恢复本节旧值，不能删除生成队列、用户资料或提示词助手配置。
    // 出错 Promise 继续拒绝，让弹窗保持打开并显示未保存提示。
    // 不把“选择更贵模型”视为授权立即发送，聊天仍必须由生成按钮提交。
    // 序列化写入与实际模型执行分离，已运行任务使用启动时捕获的配置。
    // 每个操作等前一次完成后才读取 previous，避免同时从同一旧快照覆盖彼此。
    // 界面状态只在写盘成功后发布，所以失败时无需伪造一个新选择再回滚显示。
    // 串行仅用于偏好保存，不阻塞模型流式事件或已有任务的工具执行。
    const operation = preferencesWrite.then(async () => {
    await get().load();
    // 首次切入站点时固定已核实的默认推荐，之后刷新价格不再改变该选择。
    // 用户明确点击模型的值优先，即使比推荐贵也应保留。
    // 若目录尚未加载则留空，发送前等待目录，不能猜一个不存在的 ID。
    const previous = get().preferences; const selected = model ?? (previous.models[provider] || get().catalogs[provider]?.recommended || '');
    const preferences = { provider, models: { ...previous.models, [provider]: selected } };
    try { await storage.setItem('agentPreferences', { state: preferences }); await flushUserDataSave(); set({ preferences }); }
    catch (error) { await storage.setItem('agentPreferences', { state: previous }); throw error; }
    });
    // 吞掉的只是一份队列尾部副本，返回给调用方的 operation 仍会拒绝并显示错误。
    // 不能直接吞掉返回值，否则设置页会把保存失败当作切换成功。
    // 下一次操作由该副本继续，不因一次磁盘错误让所有未来选择永久失败。
    preferencesWrite = operation.catch(() => {}); return operation;
  },
  // 主进程负责六小时 TTL；这里合并同站 UI 请求，避免挂载与按钮产生重复。
  // 网络失败保留上次目录及其旧时间，不能用空数组覆盖可用列表。
  // busy 在 finally 清理，失败之后允许再次点击刷新。
  // 认证失败保留公开价目，用户可以先选择再去设置修正密钥。
  // 每次响应仅更新自身 provider，快速切换标签也不会混淆两站。
  // 不在刷新回调中改 preferences，防止迟到推荐覆盖手动选择。
  refresh: (provider, force = false) => {
    // 同站 busy 时复用已有请求，防止双击刷新创建相同的认证列表请求。
    // 另一站请求可独立进行，不因 Euzhi 不可达而阻塞硅基流动目录。
    // force 只是传给主进程跳过 TTL 的布尔值，不改变网络目的地。
    // schema 或 IPC 失败只更新 errors，不删除上一次成功模型卡。
    // 成功响应即使带 catalog.error 也保留，因为它可能包含有价值的旧价格。
    // 更新 catalogs 时使用函数式 set，保留并发返回的另一站条目。
    // 错误状态同样按 provider 作用域合并，不能清掉另一站提示。
    // finally 总会释放 busy 和 jobs，失败后仍能手动重试。
    // 不在 finally 更新价格时间戳；失败尝试不是重新核实价格。
    // 网络消息不透传到 UI，避免服务商错误里含令牌或调试路径。
    // 更新只改变目录投影，preferences 保持用户选择，不被推荐覆盖。
    // 当用户关闭页面时请求仍可能自然完成，但写入全局站点数据是安全的。
    // 组件挂载时重用全局目录，避免路由切换造成模型卡先清空再恢复。
    // Promise 返回 void，调用方只需读取 store 状态，无须复制一份本地结果。
    const previous = jobs.get(provider); if (previous) return previous;
    const job = (async () => {
      set(s => ({ busy: { ...s.busy, [provider]: true } }));
      try { const catalog = await readAgentCatalog(provider, force); set(s => ({ catalogs: { ...s.catalogs, [provider]: catalog }, errors: { ...s.errors, [provider]: false } })); }
      catch { set(s => ({ errors: { ...s.errors, [provider]: true } })); }
      finally { set(s => ({ busy: { ...s.busy, [provider]: false } })); jobs.delete(provider); }
    })(); jobs.set(provider, job); return job;
  },
}));
/**
 * 发送前等待持久化偏好，不允许首帧默认值覆盖磁盘里选择的 Euzhi。
 * 空模型时等待本站目录，只有明确推荐才作为第一次运行的模型。
 * 账户明确不可用时拒绝发送，不自动换成另一个付费模型。
 * 目录不可用但用户已选模型存在时允许正常尝试，服务商仍最终校验。
 * 返回值是配置快照，后续 UI 切换不影响这一次运行。
 */
// 提示词助手可显式请求本站模型，但不能因此更改 Agent 当前使用的供应商。
// 缺省参数保留原聊天行为，调用方只复用模型读取、推荐回退和权限检查。
// 返回的是一次快照，两个入口不会因复用方法而互相切换选项。
// 已经选过的本站模型优先于新目录推荐，新增调用方不能悄悄替用户降档。
// override 只影响这次读取，刷新结果仍按本站键保存，不能盖住其他站点目录。
export async function agentRunSelection(providerOverride?: AgentProvider) {
  // 先 load 再读取 preferences，不能捕获调用前默认 provider 后永远沿用。
  // provider/models 的读取构成一次选择快照，后续目录等待不切换到新站。
  // 对空模型刷新的是该快照站点，不读取等待结束时可能已变的 provider。
  // 没有推荐就报错，不能回落硅基流动或硬选第一项以伪装成功。
  // 明确 available=false 的模型禁止发送，避免目录已有权限结果却照常付费尝试。
  // available=null 允许用户尝试，因为无认证核实与模型不可用含义不同。
  // 有效旧选择即使不在当前精选也可交给服务商验证，不无声替换模型。
  // 该函数不读取 key，仅返回 provider/model，密钥始终留在主进程。
  // UI 错误经 i18n，不能把底层磁盘或网络异常堆栈显示给用户。
  // 发送入口拿到快照后还会检查所属站点密钥和草稿是否仍有效。
  const store = useAgentProviderStore.getState(); await store.load();
  // 指定 Euzhi 时读取其上次模型，即使 Agent 当前在硅基流动也不取错站点。
  // models 是加载后的快照，目录等待期间用户换站不改写本次转换选择。
  // 不调用 choose，因此创作页选站不会产生 Agent 偏好写入。
  const { provider: savedProvider, models } = useAgentProviderStore.getState().preferences;
  const provider = providerOverride ?? savedProvider;
  if (!models[provider]) await store.refresh(provider);
  const catalog = useAgentProviderStore.getState().catalogs[provider];
  const model = models[provider] || catalog?.recommended || '';
  if (!model || catalog?.models.find(x => x.id === model)?.available === false) throw new Error(t('agent.providers.selectionUnavailable'));
  return { provider, model };
}
