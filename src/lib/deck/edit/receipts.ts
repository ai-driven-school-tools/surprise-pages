import {z} from "zod";
import {deckEditRecordOperationsSchema} from "./model";

export const deckEditReceiptSchema=z.object({
  id:z.string().uuid(),fingerprint:z.string(),inverse:deckEditRecordOperationsSchema,
  baseVersionId:z.string().optional(),operations:deckEditRecordOperationsSchema.optional(),
  summary:z.string().optional(),client:z.string().optional(),verification:z.unknown().optional(),
  draftFingerprint:z.string().optional(),
  span:z.object({start:z.number().int().nonnegative(),end:z.number().int().nonnegative()}).refine(value=>value.end>=value.start).optional(),
  batch:z.boolean().optional(),
  batchSize:z.number().int().min(1).max(20).optional(),
});
export type DeckEditReceipt=z.infer<typeof deckEditReceiptSchema>&{versionId?:string;authorEmail?:string};
export type DeckRejectedRequest={id:string;fingerprint:string;outcome:{category:"operation"|"generation";message:string}};
export type DeckReceiptGroup={audience:string;receipts:{author:{email:string;name:string|null};receipt:DeckEditReceipt}[];coordination?:{token:string;rejected:DeckRejectedRequest[]}};
