import { z } from "zod";

/**
 * Zod schema for the Power BI `dax_condition_met` polling trigger.
 *
 * Snapshot stores only the LAST evaluated condition result. The trigger is
 * edge-triggered — it fires on the false→true transition, so a condition
 * that stays true across ticks fires once and re-arms once it goes false.
 * Seeding at activation time means a condition that is ALREADY true when
 * the workflow activates does not fire retroactively.
 *
 * `threshold` is a string because the compared scalar may be numeric or
 * textual; `pollDax.evaluateCondition` compares numerically when both
 * sides parse as finite numbers and falls back to string equality
 * (`eq`/`neq` only — an ordering operator on a text result throws at poll
 * time, which is the earliest the value's type is knowable).
 */
export const PowerBiDaxConditionMetConfigSchema = z.object({
  workspaceId: z.string().min(1),
  semanticModelId: z.string().min(1),
  daxQuery: z.string().min(1),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
  threshold: z.string().min(1),
  impersonatedUserName: z.string().min(1).optional(),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      lastConditionMet: z.boolean(),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z.object({ lastPolledAt: z.string().min(1) }).optional(),
});

export type PowerBiDaxConditionMetConfig = z.infer<
  typeof PowerBiDaxConditionMetConfigSchema
>;
