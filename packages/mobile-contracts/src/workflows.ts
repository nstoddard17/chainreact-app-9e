import { z } from "zod";

/**
 * Workflow monitoring shapes.
 *
 * State + disabled-reason enums mirror `contracts/workflow.ts` exactly
 * (parity-tested in the web repo). `MobileWorkflowSummary` is a mobile-owned
 * projection of the web `WorkflowListItem`: NO `draftDefinition`, NO node
 * configs, NO folder membership, NO credential detail — monitoring and
 * control need state, provenance chips, and run stats only.
 */
export const MOBILE_WORKFLOW_STATES = [
  "draft",
  "active",
  "paused",
  "disabled",
  "eligible_to_resume",
  "deleted",
] as const;
export const MobileWorkflowStateSchema = z.enum(MOBILE_WORKFLOW_STATES);
export type MobileWorkflowState = z.infer<typeof MobileWorkflowStateSchema>;

export const MOBILE_WORKFLOW_DISABLED_REASONS = [
  "integration_revoked",
  "billing_exhausted",
  "repeated_failure",
  "manual_admin",
] as const;
export const MobileWorkflowDisabledReasonSchema = z.enum(
  MOBILE_WORKFLOW_DISABLED_REASONS,
);
export type MobileWorkflowDisabledReason = z.infer<
  typeof MobileWorkflowDisabledReasonSchema
>;

/** Provider chip — server-derived from node `provider` fields only. */
export const MobileProviderChipSchema = z.object({
  id: z.string(),
  label: z.string(),
  iconUrl: z.string().nullable(),
});
export type MobileProviderChip = z.infer<typeof MobileProviderChipSchema>;

/** Lifetime, real-run aggregates. Never presented as "today"/"24h". */
export const MobileWorkflowRunStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  lastRunAt: z.string().nullable(),
  lastRunStatus: z.enum(["succeeded", "failed"]).nullable(),
});
export type MobileWorkflowRunStats = z.infer<typeof MobileWorkflowRunStatsSchema>;

export const MobileWorkflowSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: MobileWorkflowStateSchema,
  disabledReason: MobileWorkflowDisabledReasonSchema.nullable(),
  providers: z.array(MobileProviderChipSchema),
  triggerCount: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative(),
  runStats: MobileWorkflowRunStatsSchema,
  updatedAt: z.string(),
});
export type MobileWorkflowSummary = z.infer<typeof MobileWorkflowSummarySchema>;
