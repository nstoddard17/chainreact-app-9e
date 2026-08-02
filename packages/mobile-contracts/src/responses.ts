import { z } from "zod";
import { MobilePageInfoSchema } from "./pagination";
import { MobileWorkflowSummarySchema } from "./workflows";
import { MobileRunSummarySchema } from "./runs";

/**
 * M1 list-response envelopes. `.strict()` at the envelope level — a list
 * response carries items + page info and nothing else. Item strictness is
 * governed per item schema (summaries stay tolerant-by-strip for additive
 * evolution; security-critical shapes are strict at their own definition).
 */
export const MobileWorkflowListResponseSchema = z
  .object({
    workflows: z.array(MobileWorkflowSummarySchema),
    pageInfo: MobilePageInfoSchema,
  })
  .strict();
export type MobileWorkflowListResponse = z.infer<
  typeof MobileWorkflowListResponseSchema
>;

export const MobileRunListResponseSchema = z
  .object({
    runs: z.array(MobileRunSummarySchema),
    pageInfo: MobilePageInfoSchema,
  })
  .strict();
export type MobileRunListResponse = z.infer<typeof MobileRunListResponseSchema>;
