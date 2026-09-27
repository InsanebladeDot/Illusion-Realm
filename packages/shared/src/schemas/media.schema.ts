import { z } from 'zod';

import { nonEmptyPathSchema } from './common.schema';

const trimSchema = z.object({ start: z.number(), end: z.number() });

const cropSchema = z.object({
  enabled: z.boolean(),
  width: z.number(),
  height: z.number(),
  x: z.number(),
  y: z.number(),
});

const clipInputSchema = z.object({
  inputPath: nonEmptyPathSchema,
  duration: z.number(),
  hasAudio: z.boolean(),
  trim: trimSchema.optional(),
});

/** VideoEditJob：single（默认）/ concat / gif */
export const VideoEditJobSchema = z.object({
  mode: z.enum(['single', 'concat', 'gif']).optional(),
  inputPath: nonEmptyPathSchema.optional(),
  clips: z.array(clipInputSchema).optional(),
  outputPath: nonEmptyPathSchema,
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  sourceDuration: z.number().optional(),
  trim: trimSchema.optional(),
  speed: z.number().optional(),
  crop: cropSchema.optional(),
  accurateCut: z.boolean().optional(),
  gif: z
    .object({
      fps: z.number().min(1).max(120),
      width: z.number().min(1),
      loop: z.boolean().optional(),
    })
    .optional(),
});

/** video:ffmpegStatus */
export const VideoFfmpegStatusArgsSchema = z.tuple([nonEmptyPathSchema.nullable()]);

/** video:pickOutputFolder */
export const VideoPickOutputFolderArgsSchema = z.tuple([z.string().max(255).optional()]);

/** video:pickOutput */
export const VideoPickOutputArgsSchema = z.tuple([
  z.string().max(255).optional(),
  z.enum(['video', 'gif']).optional(),
]);

/** video:probe */
export const VideoProbeArgsSchema = z.tuple([
  z.object({
    inputPath: nonEmptyPathSchema,
    manualFfmpegPath: nonEmptyPathSchema.nullable().optional(),
  }),
]);

/** video:run */
export const VideoRunArgsSchema = z.tuple([
  z.object({
    job: VideoEditJobSchema,
    manualFfmpegPath: nonEmptyPathSchema.nullable().optional(),
  }),
]);

/** video:cancel */
export const VideoCancelArgsSchema = z.tuple([z.string().min(1)]);

/** view3d:pickModel */
export const View3dPickModelArgsSchema = z.tuple([z.string().max(4096).optional()]);

/** view3d:readModelFile */
export const View3dReadModelFileArgsSchema = z.tuple([nonEmptyPathSchema]);

/** animadex:search */
export const AnimadexSearchArgsSchema = z.tuple([
  z.object({
    q: z.string().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    copyright: z.string().optional(),
    sort: z.enum(['recent', 'az']).optional(),
  }),
]);
