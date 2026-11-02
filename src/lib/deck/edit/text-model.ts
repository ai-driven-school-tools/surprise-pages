import { z } from "zod";

/** Wire validation is independent of the CRDT runtime (also used by the CLI). */
export const MAX_TEXT_UPDATE_ENCODED=2_000_000;
export const encodedTextUpdateSchema=z.string().max(MAX_TEXT_UPDATE_ENCODED).regex(/^[A-Za-z0-9+/]*={0,2}$/).refine(value=>value.length%4===0);
export const textChangeSchema=z.object({epoch:z.string().uuid(),update:encodedTextUpdateSchema,undo:encodedTextUpdateSchema.optional()}).strict();
export type TextChange=z.infer<typeof textChangeSchema>;
export const textStateSchema=z.object({epoch:z.string().uuid(),state:encodedTextUpdateSchema}).strict();
export type TextState=z.infer<typeof textStateSchema>;
