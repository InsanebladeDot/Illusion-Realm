"use client";

/**
 * 文字编辑的模型选择状态：复用图片页的本地 UNet/LoRA 数据契约与参数组装器。
 * 编辑 LoRA 只在初始化时预选，用户可调整权重、移除或继续添加其他 LoRA。
 * 本状态与文生图页独立，修改编辑模型不会把另一个模式的已选资源覆盖掉。
 */
// 草稿跨页面保留；仅首次进入时初始化预载项。
// effect 不拥有会话，卸载时不清空模型选择。
// 空数组与未初始化分开，用户移除全部扩展后不会自动补回。
import { useEffect } from "react";
import { useAnimaEditStore } from "@/stores/use-anima-edit-store";
// 资源按模式订阅，控制流的空 LoRA 列表不能被文字编辑预载覆盖。
// setter 每次读取最新草稿，确认模型后立即生成也不会使用旧值。
// 参数与模型同时按模式读取，显示名称与提交路径保持一致。
import { editDraftSetter, getAnimaEditDraft, patchAnimaEditDraft, useAnimaControlStore, type ControlMode } from '@/stores/use-anima-control-store';
import type { SetStateAction } from 'react';
import type { SelectedExtension } from '@/types/extension';
import { useSettingsStore } from "@/stores/useSettingsStore";
import { getSelectedModelDisplay } from "@/data/models";
import { filterAndSortExtensions } from "@/data/extensions";
import { buildGenerateParams } from "@/utils/comfy/buildGenerateParams";
import { makeLocalLoraId } from "@/utils/localModelResources";
import type { CreateExtension } from "@/types/extension";
import { ANIMA_EDIT_LORA, type AnimaEditSettings } from "@/utils/comfy/anima-edit-workflow";
import modelCover from "@/assets/icon/create/model.png";
// selectedModel 只保存资源 id 与版本 id，不能将用于显示的名称直接当服务端路径。
// 本地路径经共享 buildGenerateParams 校验后，才成为构建器输入。
// 服务端目录可以不同，运行前再进行唯一匹配，并保留真实服务端路径。
// 编辑模型选择跨路由保留，但应用重启不恢复陈旧的 blob 会话。
// 模板回退项不会发起下载，缺少模型时由运行检查显示明确错误。
// 资源封面只是展示资料，缺图不会影响权重和实际文件选择。
// 纯模型状态 hook 不包含图片 Blob，不负责生成结果的资源释放。

// 预加载项仍使用标准 local-lora id，权重读取与额外 LoRA 完全一致。
// 服务端路径在提交前匹配，模板的相对目录不要求和实际安装路径完全相同。
// 离线无扫描结果时仍展示真实文件名，不伪装成已经找到或已经安装。
export const EDIT_LORA_ID = makeLocalLoraId(ANIMA_EDIT_LORA);

/**
 * 资源列表复用本地目录、系列过滤、分类与版本数据，不手写第二个扫描器。
 * 内置编辑 LoRA 增加可重新选择入口，移除后不需要刷新页面才能恢复。
 * 预加载不代表服务器上确实有文件，运行时仍使用实时模型列表校验。
 * 对真实本地选择调用 buildGenerateParams，沿用图片页的路径与模型类型校验。
 * 没有用户选择时保留编辑模板的 UNet 默认文件，不显示无关示例模型名称。
 * 模型卡片显示来自原资源适配器，封面缺失仍走公共组件的回退机制。
 * 初始化函数读取当前扫描结果，若编辑 LoRA 已存在则使用实际本地版本 id。
 * 不在后续渲染中重新预载，被用户移除的编辑 LoRA不会自动复活。
 * 菜单取消由共享选择器处理，只有确认选择才更新当前资源状态。
 * 模型切换不清空用户的原图、指令、负面词和参数。
 */
export function useAnimaEditModels(mode: ControlMode | 'text') {
  // 使用设置页已有扫描结果，不因进入编辑页而重复扫描磁盘。
  // paths 参与系列过滤：同一 LoRA 根目录下的 SDXL 资源不进入 Anima 列表。
  // query 为空仅表示初始未过滤，搜索框与分类筛选由共用弹窗自己管理。
  // 模型元数据、封面和版本分组继续使用原扫描适配器。
  // 用户切换本地模型目录时资源列表更新，已输入的指令不会随列表刷新丢失。
  const localModels = useSettingsStore((state) => state.models), paths = useSettingsStore((state) => state.paths);
  const resources = filterAndSortExtensions("", localModels, paths, null, "anima");
  // 如果扫描已提供编辑文件就复用该版本，不能额外显示同一文件的模板别名。
  // 离线目录未扫描到时才提供可重选的回退项，运行时仍做实时存在性验证。
  // basename 匹配只用于初始化方便；真正提交的歧义匹配在构建层严格拒绝。
  // 反斜线归一兼容 Windows 路径，id 本身不在这里改写。
  const editVersion = resources.flatMap((resource) => resource.versions ?? []).find((version) => version.id.toLowerCase().replace(/\\/g, "/").endsWith("/animeeditv2.safetensors"));
  // 回退项只是已知默认文件的可选入口，不代表本机已经安装成功。
  // 使用标准本地资源 id，公共参数组装器才能将其解释为 LoRA。
  // 通用图片封面用于缺少真实封面的默认项，不加载远端占位图片。
  // 固定产品/文件名保持原名，不把它作为可翻译的自然语言句子。
  const fallback: CreateExtension = { id: EDIT_LORA_ID, name: "AnimeEditV2", seriesTag: "Local", cover: modelCover, versionLabel: "AnimeEditV2", versions: [{ id: EDIT_LORA_ID, label: "AnimeEditV2" }], isLocal: true, filePath: ANIMA_EDIT_LORA };
  // 模型选择与参数草稿同属常驻 store，不受编辑组件是否挂载影响。
  // 两个 selector 只订阅相关字段，资源扫描更新仍来自设置 store。
  // setter 保持函数式更新语义，公共选择组件无需适配另一种接口。
  // 双 store 订阅只触发渲染，不复制源文件、结果或任务门闩。
  // 隐藏表单各自绑定模式，不能初始化另一个控制模板的资源。
  // null 模型回退本模式 settings，不使用另一模板的默认文件。
  // 修改选择不会自动提交，任务仍只由公共生成按钮触发。
  useAnimaEditStore(); useAnimaControlStore();
  const draft = getAnimaEditDraft(mode), selectedModel = draft.selectedModel, setSelectedModel = editDraftSetter(mode, 'selectedModel');
  // 只在第一次创建编辑器时预选，后续刷新资源不能撤销用户主动移除。
  // 初始权重为编辑模板的 1，额外 LoRA 则沿用普通图片界面的添加默认值。
  // 这份列表就是实际提交列表，不另行暗中注入不可见的编辑模型。
  // selectedModel 的 null 表示尚未改选，不能误用图片页面的演示默认版本。
  // null 是初次初始化标记，[] 是用户明确删除后的有效选择。
  // 重挂载只恢复现有值，不能重放预载逻辑覆盖用户权重。
  // 同步回退仅用于首帧展示，effect 将首次扫描到的真实版本写入 store。
  // effect 读取最新 store 再判断，严格模式重复执行也只初始化一次。
  // 默认值不参与后续运行时隐式补齐，实际提交仍由 snapshot 决定。
  // null 是文字首次初始化标记，控制模式明确从空数组开始。
  // 回调总收到数组，删除全部后不自动补回编辑 LoRA。
  // 连续调整权重时读最新列表，隐藏页面不会撤销当前更改。
  // 用户手动选择的顺序保留，公共构建器仍按该顺序连接模型链。
  const stored = draft.extensions;
  const setExtensions = (value: SetStateAction<SelectedExtension[]>) => patchAnimaEditDraft(mode, { extensions: typeof value === 'function' ? value(getAnimaEditDraft(mode).extensions ?? []) : value });
  const extensions = stored ?? [{ extensionId: editVersion?.id ?? EDIT_LORA_ID, weight: 1 }];
  // 预载仅属于文字编辑，蒙版模板没有这一 LoRA，不能隐式注入。
  // effect 再读当前值，StrictMode 重放也不复活已删除的扩展。
  // 使用稳定 store 动作，不将每帧新建 setter 放入 effect 依赖。
  // 资源扫描更新只提供可选项，不覆盖用户已经确认的模型。
  useEffect(() => { if (mode === 'text' && useAnimaEditStore.getState().extensions === null) useAnimaEditStore.getState().setExtensions([{ extensionId: editVersion?.id ?? EDIT_LORA_ID, weight: 1 }]); }, [editVersion?.id, mode]);
  // 选择后的封面和名称由统一适配器提供，避免只更新标题而仍提交旧路径。
  // 尚未选择时展示默认 UNet 文件名，用户知道实际运行将尝试加载哪个文件。
  const display = selectedModel ? getSelectedModelDisplay(selectedModel, localModels) : { name: draft.settings.checkpointName.split(/[/\\]/).pop() ?? "Anima", cover: modelCover };
  const snapshot = (value: AnimaEditSettings): AnimaEditSettings => {
    // 同一个标准组装器负责模型目录约束、LoRA 路径解析和强度夹取。
    // 空模型 id 不属于本地 checkpoint，组装器会留下 checkpointName 未设置。
    // 本层在未设置时使用编辑默认 UNet，不能回落到任意首个扫描文件。
    // LoRA 使用每一行当前权重，不使用模板里写死的强度覆盖它。
    // 共享组装器可能填充文生图默认负面词，这里只取其模型字段。
    // 指令、负面词、MP、seed 等仍从调用者当前参数快照保留。
    // 所有扩展移除时返回空列表，参考节点在 builder 中直接接主模型。
    // 此函数可以抛出可读校验错误，运行与导出两处调用都已有 try/catch。
    // 提交重新读取资源，刚确认模型后不依赖下一帧更新才能正确运行。
    // 控制模式明确空数组保持无 LoRA，文字 null 才使用首帧预载列表。
    // 共享组装器只解析模型字段，采样参数继续使用当前模式冻结值。
    // 缺手选 UNet 时保留传入模板的文件路径，不回退文字编辑模板。
    // 显式同步的资源拥有优先级，模板初值不会覆盖用户选择。
    const current = getAnimaEditDraft(mode);
    const params = buildGenerateParams({ positivePrompt: value.instruction, negativePrompt: value.negative, selectedModel: current.selectedModel ?? { modelId: "", versionId: "" }, selectedExtensions: current.extensions ?? extensions, localModels, paths, seed: Number(value.seed), steps: value.steps, cfg: value.cfg, samplerName: value.samplerName, scheduler: value.scheduler, series: "anima" });
    return { ...value, checkpointName: params.checkpointName ?? value.checkpointName, loras: params.loras ?? [] };
  };
  // resources 只控制可选菜单，extensions 才是已经确认的生成输入。
  // displays 仅补齐模板回退 id 的封面，真实扫描版本沿用普通扩展显示。
  // 向公共组件传 setter 保留其函数式更新语义，多行权重不会相互覆盖。
  // 回退资源存在时仍与其他真实 LoRA 共用相同的确认/取消流程。
  return { selectedModel, setSelectedModel, extensions, setExtensions, display, resources: editVersion ? resources : [fallback, ...resources], snapshot, displays: { [EDIT_LORA_ID]: { name: "AnimeEditV2", cover: modelCover } } };
}

// snapshot 仅在运行或导出时求值，结果随后深克隆，不保留对资源列表的活动引用。
// 负面词为空时保留空字符串，不复制 buildGenerateParams 的文生图长默认负面词。
// params 在此只用于解析模型与 LoRA，编辑指令和采样参数仍由当前表单决定。
// 用户 LoRA 顺序就是模型链顺序，不把编辑 LoRA偷偷移到另一个隐藏链上。
// 修改同一项的权重仍走 SelectedExtensions 的函数式更新，保持其他行不变。
// 资源确认采用标准 extensionId 去重，重复选择不会追加相同版本的第二行。
// SDXL 和非扩散模型继续由共享模型选择器与参数组装器拦截。
// 当前编辑能力限定 Anima，不提供一个实际无法运行的 SDXL 系列切换。
