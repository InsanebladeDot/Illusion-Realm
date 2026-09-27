import { z } from 'zod';

import { nonEmptyPathSchema } from './common.schema';

/** models:scan */
export const ScanModelsArgsSchema = z.tuple([
  nonEmptyPathSchema,
  z.enum(['checkpoint', 'lora']),
]);

/** files:readImageDataUrl */
export const ReadImageDataUrlArgsSchema = z.tuple([nonEmptyPathSchema]);

/** files:listImageFiles / files:listOutputFolders */
export const SinglePathArgsSchema = z.tuple([nonEmptyPathSchema]);

/** files:listGeneratedImages */
export const ListGeneratedImagesArgsSchema = z.tuple([
  nonEmptyPathSchema,
  nonEmptyPathSchema.nullable(),
]);

/** files:createHistoryFolder */
export const CreateHistoryFolderArgsSchema = z.tuple([
  nonEmptyPathSchema,
  z.string().min(1).max(255),
  nonEmptyPathSchema.nullable().optional(),
]);

/** files:previewDeleteHistoryFolder / files:deleteHistoryFolder */
export const FolderPathArgsSchema = z.tuple([nonEmptyPathSchema, nonEmptyPathSchema]);

/** files:deleteGeneratedImages */
export const DeleteGeneratedImagesArgsSchema = z.tuple([
  nonEmptyPathSchema,
  z.array(nonEmptyPathSchema).min(1),
]);

/** files:saveImageAs */
export const SaveImageAsArgsSchema = z.tuple([
  nonEmptyPathSchema,
  nonEmptyPathSchema,
]);

/** files:renameGeneratedImage */
export const RenameGeneratedImageArgsSchema = z.tuple([
  nonEmptyPathSchema,
  nonEmptyPathSchema,
  z.string().min(1).max(255),
]);

/** files:moveImagesToFolder */
export const MoveImagesToFolderArgsSchema = z.tuple([
  nonEmptyPathSchema,
  nonEmptyPathSchema,
  z.array(nonEmptyPathSchema).min(1),
]);

/** files:saveGeneratedImages（空数组是合法 no-op，主进程直接返回 []） */
export const GeneratedImagePayloadSchema = z.object({
  filename: z.string().min(1),
  dataBase64: z.string().min(1),
});

export const SaveGeneratedImagesArgsSchema = z.tuple([
  nonEmptyPathSchema,
  z.array(GeneratedImagePayloadSchema),
]);

/** shell:openPath */
export const OpenPathArgsSchema = z.tuple([nonEmptyPathSchema]);
