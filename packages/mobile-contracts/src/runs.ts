import { z } from "zod";
import { MobileHumanizedErrorSchema } from "./humanizedError";

/**
 * Run monitoring shapes — the security-critical heart of this package.
 *
 * `MobileRunStep` and `MobileRunDetail` are `.strict()`: a payload carrying
 * step `output`, a `triggerEvent`, a `fatalError`, error `details`, provider
 * response bodies, or any credential-shaped field FAILS to parse. This is
 * deliberate and non-negotiable — mobile never receives execution outputs
 * (stricter than web, which exposes them only to a test run's own author).
 * Additive evolution of these two shapes therefore requires a contract
 * version bump; that is the intended cost.
 *
 * Status enums mirror `contracts/workflow.ts` (`WorkflowRunDisplayStatusSchema`
 * / `WorkflowRunTriggeredBySchema`), parity-tested in the web repo. The
 * display status includes the non-terminal `queued`/`running` — the mobile
 * detail endpoint serves in-flight runs (steps may be empty or partial).
 */
export const MOBILE_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export const MobileRunStatusSchema = z.enum(MOBILE_RUN_STATUSES);
export type MobileRunStatus = z.infer<typeof MobileRunStatusSchema>;

export const MOBILE_RUN_TRIGGERED_BY = [
  "manual",
  "test",
  "webhook",
  "scheduled",
  "retry",
  "api_key",
  "unknown",
] as const;
export const MobileRunTriggeredBySchema = z.enum(MOBILE_RUN_TRIGGERED_BY);
export type MobileRunTriggeredBy = z.infer<typeof MobileRunTriggeredBySchema>;

export const MobileRunSummarySchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowName: z.string(),
  status: MobileRunStatusSchema,
  isTest: z.boolean(),
  triggeredBy: MobileRunTriggeredBySchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorClassification: MobileHumanizedErrorSchema.nullable(),
});
export type MobileRunSummary = z.infer<typeof MobileRunSummarySchema>;

/**
 * Sanitized per-step error: stable code + humanized message ONLY.
 * `.strict()` — the web wire shape's optional `details` blob is intentionally
 * absent and rejected.
 */
export const MobileRunStepErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .strict();
export type MobileRunStepError = z.infer<typeof MobileRunStepErrorSchema>;

/**
 * One executed step: identity, display label, status, sanitized error.
 * `.strict()` — NO `output`, NO raw provider anything, ever.
 */
export const MobileRunStepSchema = z
  .object({
    nodeId: z.string(),
    /** Server-resolved display name so mobile never fetches the graph. */
    displayName: z.string().nullable(),
    status: z.enum(["succeeded", "failed", "skipped"]),
    error: MobileRunStepErrorSchema.nullable(),
  })
  .strict();
export type MobileRunStep = z.infer<typeof MobileRunStepSchema>;

/**
 * `GET …/runs/{runId}` response. `.strict()` at every level (see module
 * header). Non-terminal runs serve `steps: []` until execution records them.
 */
export const MobileRunDetailSchema = z
  .object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    workflowName: z.string(),
    status: MobileRunStatusSchema,
    isTest: z.boolean(),
    triggeredBy: MobileRunTriggeredBySchema,
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    errorClassification: MobileHumanizedErrorSchema.nullable(),
    steps: z.array(MobileRunStepSchema),
  })
  .strict();
export type MobileRunDetail = z.infer<typeof MobileRunDetailSchema>;
