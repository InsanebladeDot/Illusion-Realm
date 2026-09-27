export type SamplerOption = {
  label: string;
  /** ComfyUI 实际名称（直接写入工作流 JSON） */
  value: string;
};

/**
 * 采样器列表（任务规范《ComfyUI Anima 工作流动态生成规范》2.1）
 * value 原样写入 KSampler.inputs.sampler_name。
 */
export const SAMPLERS: readonly SamplerOption[] = [
  { label: "Euler", value: "euler" },
  { label: "Euler Ancestral", value: "euler_ancestral" },
  { label: "Heun", value: "heun" },
  { label: "Heunpp2", value: "heunpp2" },
  { label: "DPM 2", value: "dpm_2" },
  { label: "DPM 2 Ancestral", value: "dpm_2_ancestral" },
  { label: "LMS", value: "lms" },
  { label: "DPM Fast", value: "dpm_fast" },
  { label: "DPM Adaptive", value: "dpm_adaptive" },
  { label: "DPM++ 2S Ancestral", value: "dpmpp_2s_ancestral" },
  { label: "DPM++ SDE", value: "dpmpp_sde" },
  { label: "DPM++ SDE GPU", value: "dpmpp_sde_gpu" },
  { label: "DPM++ 2M", value: "dpmpp_2m" },
  { label: "DPM++ 2M SDE", value: "dpmpp_2m_sde" },
  { label: "DPM++ 2M SDE GPU", value: "dpmpp_2m_sde_gpu" },
  { label: "DPM++ 3M SDE", value: "dpmpp_3m_sde" },
  { label: "DPM++ 3M SDE GPU", value: "dpmpp_3m_sde_gpu" },
  { label: "DDPM", value: "ddpm" },
  { label: "LCM", value: "lcm" },
  { label: "DDIM", value: "ddim" },
  { label: "UniPC", value: "uni_pc" },
  { label: "UniPC BH2", value: "uni_pc_bh2" },
  // 规范之外的补充项（ComfyUI 同样提供，保留此前显式要求）
  { label: "Euler CFG++", value: "euler_cfg_pp" },
  { label: "Euler Ancestral CFG++", value: "euler_ancestral_cfg_pp" },
  { label: "Exp Heun 2 X0", value: "exp_heun_2_x0" },
  { label: "DPM++ 2S Ancestral CFG++", value: "dpmpp_2s_ancestral_cfg_pp" },
];

/**
 * 调度器列表（任务规范 2.2）
 * value 原样写入 KSampler.inputs.scheduler。
 */
export const SCHEDULERS: readonly SamplerOption[] = [
  { label: "Normal", value: "normal" },
  { label: "Karras", value: "karras" },
  { label: "Exponential", value: "exponential" },
  { label: "SGM Uniform", value: "sgm_uniform" },
  { label: "Simple", value: "simple" },
  { label: "DDIM Uniform", value: "ddim_uniform" },
];

export const DEFAULT_SAMPLER = "euler";
export const DEFAULT_SCHEDULER = "simple";
export const DEFAULT_STEPS = 15;
export const DEFAULT_CFG = 3;

/** Stable Diffusion 采样器种子范围：无符号 32 位整数 */
export const SEED_MIN = 0;
export const SEED_MAX = 4_294_967_295;

/** 随机模式下的种子参数哨兵值（实际生成时由后端随机） */
export const RANDOM_SEED = -1;

export const STEPS_MIN = 10;
export const STEPS_MAX = 50;
export const CFG_MIN = 1;
export const CFG_MAX = 10;
export const CFG_STEP = 0.1;

export const DEFAULT_IMAGE_COUNT = 1;

export const IMAGE_COUNT_OPTIONS = [
  { count: 1, label: "x1" },
  { count: 2, label: "x2" },
  { count: 3, label: "x3" },
  { count: 4, label: "x4" },
] as const;
