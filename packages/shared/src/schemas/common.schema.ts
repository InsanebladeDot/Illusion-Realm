/**
 * 入参 Zod schema（跨 IPC 校验用）。
 *
 * 现状说明：主进程是手写 CommonJS、且运行期解析不到 zod（packages/shared 不含构建产物、
 * zod 是 devDependency），因此主进程侧使用等价的手写轻量校验；
 * 本目录的 schema 是**形状的单一事实来源**，供类型推导、渲染进程与后续主进程 zod 化使用。
 */
import { z } from 'zod';

/** 非空路径字符串（跨平台，不强制绝对路径以便测试桩使用相对路径） */
export const nonEmptyPathSchema = z.string().min(1).max(4096);

export const localModelTypeSchema = z.enum(['checkpoint', 'lora']);
