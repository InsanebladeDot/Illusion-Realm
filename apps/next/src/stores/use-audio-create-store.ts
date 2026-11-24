"use client";
/**
 * Role TTS 常驻草稿和播放结果：路由卸载、切模式均不重置。
 * 只保留本次运行的 File/Blob URL，不把私人参考音频写入用户 JSON。
 * 队列负责执行生命周期，此 store 只关联当前任务并保留最近二十次结果。
 */
import { create } from 'zustand';
import { defaultAudioLoras } from '@/utils/comfy/audio-workflow';
import type { VideoLora } from '@/utils/comfy/video-workflow-loras';
import { enqueueAudioGeneration } from '@/utils/audio-generation-queue';
import { generateRandomSeed } from '@/utils/seed';
import { t } from '@/i18n';
// 批次数量沿用图片按钮菜单的数据来源，音频不另建一份选项范围。
// 每项仍独立进入公共 FIFO，关闭页面不丢整批任务。
// 菜单值之外的调用回落到一项，不把小数或异常数量直接交给循环。
import { IMAGE_COUNT_OPTIONS } from '@/data/createForm';
// 两份音频工作流的节点号不同，按参考模式分开保存辅助覆盖。
// 用户替换音频不会丢草稿，也不能让另一张图的 CLIP/VAE 节点串入当前提交。
import type { VideoModelOverrides } from '@/utils/comfy/video-workflow-models';

// 种子保留字符串草稿，随机值在点击时确定；结果 URL 仅用于当前会话播放，path 才是落盘地址。
// LoRA 清空后不补回默认项；草稿与队列状态分开，界面不能伪造任务结果。
interface AudioResult { id: string; url: string; path: string }
export interface AudioCreateState {
  prompt: string; reference: File | null; seed: string; random: boolean; loras: VideoLora[];
  // null 表示跟随当前音频图默认值，切换参考不会固化上一张图的步数。
  // unetName 是模型相对名而非带图前缀的节点 id，切换模板仍可保留选择。
  // 两字段只在点击时冻结，不能更新已经排队任务的实际模型与采样参数。
  unetName: string | null; steps: number | null;
  // null 跟随当前模板；显式数值在参考音频增删后仍保留用户选择。
  // 时长只属于音频草稿，不读写视频页的同名设置。
  // 路由卸载不重置，与已有提示词、步数保持相同生命周期。
  durationSeconds: number | null;
  // 无参考与参考图各保留一份选择，删除参考后可恢复之前的无参考配置。
  // 只保存在当前会话，不新增另一份用户存储或迁移字段。
  // 队列深拷贝本次分支，之后切换模式不会追溯修改已排队项。
  modelOverrides: Record<string, VideoModelOverrides>;
  taskId: string | null; error: string | null; results: AudioResult[];
  // patch 只开放表单字段，合并加载覆盖时保留另一种参考模式的配置。
  patch: (value: Partial<Pick<AudioCreateState, 'prompt' | 'reference' | 'seed' | 'random' | 'unetName' | 'steps' | 'durationSeconds' | 'modelOverrides'>>) => void;
  setLoras: (value: VideoLora[] | ((current: VideoLora[]) => VideoLora[])) => void;
  // 共用生成按钮传回 N 后必须真正创建 N 个任务，不能只有数量外观变化。
  // 不传数量仍表示一项，兼容表单提交和既有程序化调用。
  // 批次由公共 FIFO 串行执行，而非在本 store 并发请求 ComfyUI。
  submit: (count?: number) => void;
}

// 最近 20 条播放结果使用独立 Blob URL，裁掉旧项时释放 URL，不删除磁盘文件。
function appendResults(id: string, result: Awaited<ReturnType<typeof enqueueAudioGeneration>['promise']>) {
  const state = useAudioCreateStore.getState();
  const incoming = result.outputs.map((item, index) => ({ id: `${id}:${index}`, url: URL.createObjectURL(item.blob), path: result.savedPaths[index] }));
  const all = [...incoming, ...state.results];
  for (const item of all.slice(20)) URL.revokeObjectURL(item.url);
  useAudioCreateStore.setState({ results: all.slice(0, 20) });
}

// 点击时冻结草稿并进入公共 FIFO；第一项用所选种子，后续项随机。
// 同步校验和异步执行分别接住错误；旧任务失败不覆盖新任务提示，取消不重复报错。
// 切页不取消任务，不自动重试结果未知的请求。
function submitAudio(count = 1) {
  try {
    const state = useAudioCreateStore.getState();
    const seed = state.random ? generateRandomSeed() : /^\d+$/.test(state.seed) ? Number(state.seed) : NaN;
    // 数量来源与共用下拉一致；每项有独立任务 id、完成记录和停止入口。
    // 每项内部仍只提交一次音频图，不在 ComfyUI 中篡改 latent 批量参数。
    // 循环在同一个同步动作中完成，File 与 LoRA 都来自同一份点击时草稿。
    const total = IMAGE_COUNT_OPTIONS.some(option => option.count === count) ? count : 1;
    for (let index = 0; index < total; index++) {
      // null 转 undefined 表示跟随模板；参考文件决定加载覆盖所用的分支。
      const job = enqueueAudioGeneration({ prompt: state.prompt, seed: index ? generateRandomSeed() : seed, loras: state.loras, unetName: state.unetName ?? undefined, steps: state.steps ?? undefined, durationSeconds: state.durationSeconds ?? undefined, modelOverrides: state.modelOverrides[state.reference ? 'reference' : 'text'] }, state.reference);
      useAudioCreateStore.setState({ taskId: job.id, error: null });
      void job.promise.then(result => appendResults(job.id, result)).catch((error: unknown) => {
        if (useAudioCreateStore.getState().taskId !== job.id || error instanceof DOMException && error.name === 'AbortError') return;
        useAudioCreateStore.setState({ error: error instanceof Error ? error.message : t('create.page.generateFailed') });
      });
    }
  } catch (error) { useAudioCreateStore.setState({ error: error instanceof Error ? error.message : t('create.audio.invalid') }); }
}

// 草稿仅在当前进程保留；模板默认 LoRA 只在初始化读取，用户清空后不自动补回。
export const useAudioCreateStore = create<AudioCreateState>((set) => ({
  // 模型、步数和时长以 null 跟随当前模板，显式设置才覆盖。
  prompt: '', reference: null, seed: '0', random: true, unetName: null, steps: null, durationSeconds: null, modelOverrides: {}, loras: defaultAudioLoras(), taskId: null, error: null, results: [],
  patch: value => set(value), setLoras: value => set(state => ({ loras: typeof value === 'function' ? value(state.loras) : value })), submit: submitAudio,
}));
