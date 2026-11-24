"use client";

import type { ReactNode } from "react";
import { useCreateFormStore, type CreateFormState } from "@/stores/useCreateFormStore";
// store 只注入数据归属，不复制字段或另写参数布局；省略时仍是创建页原草稿。
// useStore 与原绑定 hook 共享同一 Zustand 订阅方式，局部实例不会反写全局。
import { useStore, type StoreApi } from "zustand";
// 采样器到种子直接复用完整字段块，普通图片继续拥有自己的表单状态。
// 共用组件不决定工作流默认值，当前系列模板仍由本层读取。
import { GenerationSamplingFields } from "./generation-sampling-fields";
import { AdvancedSettingsSection } from "./advanced-settings-section";
import { getImageWorkflowDefaults } from "@/utils/comfy/imageWorkflow";
import { clampSeed, generateRandomSeed } from "@/utils/seed";

// 这里只增加原 store 的注入口，高级设置内部布局和全部原字段保持共用。
// sampler 的缺省仍由当前系列模板解析，不能固定填成某个常用采样器。
// scheduler 的显示也独立回退，用户只覆盖其中一个时另一个仍继承原模板。
// steps 和 cfg 使用原字段动作，局部适配器只负责把确认值写回节点。
// seedMode 与 customSeed 必须来自同一 store，否则随机按钮和数字框会相互矛盾。
// 切到 custom 仍生成原规则的随机起始数字，不改原创建页的交互约定。
// 数字输入空串仍按原处理保留旧确认值，不能把临时删除解释成种子零。
// 原 clampSeed 负责范围，读取局部状态不意味着跳过原数值约束。
// children 仍留给原图片高级扩展，局部 store 注入不改变插槽顺序。
// 折叠由原 AdvancedSettingsSection 管理，字段不会出现两套开关状态。
// 输出参数变更由宿主事务负责，展开高级区自身不创建工程修改。
export function AdvancedSettings({ series = "anima", children, store }: { series?: Parameters<typeof getImageWorkflowDefaults>[0]; children?: ReactNode; store?: StoreApi<CreateFormState> }) {
  const samplerOverride = useStore(store ?? useCreateFormStore, (state) => state.sampler);
  const schedulerOverride = useStore(store ?? useCreateFormStore, (state) => state.scheduler);
  /** 未自定义时显示当前系列工作流模板自带的采样器 / 调度器 */
  const workflowDefaults = getImageWorkflowDefaults(series);
  const sampler = samplerOverride ?? workflowDefaults.samplerName;
  const scheduler = schedulerOverride ?? workflowDefaults.scheduler;
  const steps = useStore(store ?? useCreateFormStore, (state) => state.steps);
  const cfg = useStore(store ?? useCreateFormStore, (state) => state.cfg);
  const seedMode = useStore(store ?? useCreateFormStore, (state) => state.seedMode);
  const customSeed = useStore(store ?? useCreateFormStore, (state) => state.customSeed);
  const setAdvancedSettings = useStore(store ?? useCreateFormStore,
    (state) => state.setAdvancedSettings
  );

  const handleSeedModeChange = (mode: "random" | "custom") => {
    setAdvancedSettings({
      seedMode: mode,
      ...(mode === "custom" ? { customSeed: generateRandomSeed() } : {}),
    });
  };

  const handleCustomSeedChange = (raw: string) => {
    if (raw === "") return;
    setAdvancedSettings({ customSeed: clampSeed(Number(raw)) });
  };

  // 界面：「高级设置」折叠区的外壳由图片、视频与音频共用。
  return (
    <AdvancedSettingsSection>
      {/* 界面：采样与种子参数和图片编辑工作区共用。 */}
      <GenerationSamplingFields
        sampler={sampler}
        scheduler={scheduler}
        steps={steps}
        cfg={cfg}
        seed={String(customSeed)}
        seedMode={seedMode}
        onSampler={sampler => setAdvancedSettings({ sampler })}
        onScheduler={scheduler => setAdvancedSettings({ scheduler })}
        onSteps={steps => setAdvancedSettings({ steps })}
        onCfg={cfg => setAdvancedSettings({ cfg })}
        onSeed={handleCustomSeedChange}
        onSeedMode={handleSeedModeChange}
      />
      {/* 界面：生成模式专属参数由调用方填入。 */}
      {children}
    </AdvancedSettingsSection>
  );
}
