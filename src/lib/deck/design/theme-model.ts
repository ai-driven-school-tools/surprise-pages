import { z } from 'zod';
import { appearanceSchema } from './design';
import { logoAssetSchema, logoPresentationSchema, logoLayoutsSchema } from '../media/logo';

export const THEME_REQUEST_TTL = 3 * 24 * 60 * 60 * 1000;
export const themeRefSchema = z.object({id:z.string().uuid(),version:z.string().uuid()}).strict();
export const themeNameSchema = z.string().trim().min(1).max(60);
export const themeSnapshotSchema = z.object({
  appearance:appearanceSchema,
  logo:z.object({asset:logoAssetSchema,presentation:logoPresentationSchema,layouts:logoLayoutsSchema.optional()}).strict().nullable(),
}).strict();
export const myThemeSchema = themeRefSchema.extend({name:themeNameSchema,snapshot:themeSnapshotSchema});
export const myThemesSchema = z.object({themes:z.array(myThemeSchema)});
export const themeStampSchema = themeRefSchema.extend({name:themeNameSchema});
export type ThemeRef = z.infer<typeof themeRefSchema>;
export type ThemeSnapshot = z.infer<typeof themeSnapshotSchema>;
export type MyTheme = z.infer<typeof myThemeSchema>;
export type ThemeStamp = z.infer<typeof themeStampSchema>;
const request = z.object({requestId:z.string().uuid()});
const page = {page:z.string().min(1).max(400),baseVersionId:z.string().min(1).max(100)};
export const themeSaveSchema = request.extend({action:z.literal('save'),name:themeNameSchema,...page,replace:themeRefSchema.optional()}).strict();
export const themeMutationSchema = z.discriminatedUnion('action',[
  themeSaveSchema,
  request.extend({action:z.literal('rename'),theme:themeRefSchema,name:themeNameSchema}).strict(),
  request.extend({action:z.literal('delete'),theme:themeRefSchema}).strict(),
  request.extend({action:z.literal('apply'),theme:themeRefSchema,...page}).strict(),
]);
