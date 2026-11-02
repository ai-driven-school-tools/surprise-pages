import { z } from 'zod';
const point = z.object({id:z.string().min(1),label:z.string(),x:z.number().finite(),y:z.number().finite()});
const endLabels = z.object({start:z.string(),end:z.string()});
export const deckNativeSourceSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('set-overlap'),ariaDescription:z.string(),sets:z.array(point.extend({radius:z.number().positive()})).min(1),regions:z.array(point).optional()}),
  z.object({kind:z.literal('quadrant'),ariaDescription:z.string(),xAxis:z.string(),yAxis:z.string(),xEnds:endLabels.optional(),yEnds:endLabels.optional(),points:z.array(point).min(1)}),
]);
