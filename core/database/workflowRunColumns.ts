import { z } from "zod";
import {
  HumanizedErrorSchema,
  WorkflowRunFatalErrorSchema,
  WorkflowRunStepSchema,
} from "@/contracts/workflow";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { WorkflowRunFatalError, WorkflowRunStep } from "@/contracts/workflow";

/**
 * SUPABASE-TABLE-TYPING-1B — reading `workflow_runs`' broad columns safely.
 *
 * The generated types describe `trigger_event`, `steps`, `fatal_error` and
 * `error_classification` as `Json`, and `triggered_by` / `billing_status` as
 * `string`. The repositories model all six precisely, and previously bridged
 * the gap with a handwritten row interface plus `data as WorkflowRunsRow` — an
 * assertion nothing checked, on the record the engine replays, the retry logic
 * reads and the failure UI renders.
 *
 * Everything below parses with the EXISTING contract schemas — there is no
 * second copy of any shape — and fails closed. Error messages carry the field
 * path and the zod issue code ONLY: `trigger_event.payload` is an unmodified
 * provider payload and can hold tokens, addresses and message bodies, so it
 * must never reach a log line.
 */

/** zod issues reduced to path + code. Never includes a received value. */
function describeIssues(issues: readonly z.ZodIssue[]): string {
  return issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; ");
}

function parseOrThrow<T>(label: string, schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${label}: stored value does not match its contract — ${describeIssues(parsed.error.issues)}`);
  }
  return parsed.data;
}

/**
 * `trigger_event` — DECISION-DRIVING. The engine replays it, the variable
 * resolver reads it, and dedup keys off `provider` + `eventId`.
 *
 * The stable ENVELOPE is validated (provider / eventType / eventId /
 * occurredAt / providerAccountId, all non-empty) while `payload` stays opaque:
 * it is the provider's own body by design, so validating its interior would
 * either reject legitimate providers or invent a contract the providers never
 * agreed to. A missing or empty discriminator fails closed rather than being
 * defaulted to a manual trigger.
 */
export function parseTriggerEvent(label: string, raw: unknown): TriggerEvent {
  return parseOrThrow(label, TriggerEventSchema, raw);
}

/** `steps` — the per-node execution record replayed into diagnostics and UI. */
export function parseRunSteps(label: string, raw: unknown): WorkflowRunStep[] {
  return parseOrThrow(label, z.array(WorkflowRunStepSchema), raw ?? []);
}

/** `fatal_error` — nullable; drives failure notifications and the failure UI. */
export function parseFatalError(label: string, raw: unknown): WorkflowRunFatalError | null {
  if (raw === null || raw === undefined) return null;
  return parseOrThrow(label, WorkflowRunFatalErrorSchema, raw);
}

/**
 * `error_classification` — nullable; drives the failed-run next-action routing
 * and the AI repair suggestion, so an unknown `action` must not slip through.
 * Validated with `HumanizedErrorSchema`, which the classification is documented
 * to stay in lockstep with.
 */
export function parseErrorClassification(
  label: string,
  raw: unknown,
): z.infer<typeof HumanizedErrorSchema> | null {
  if (raw === null || raw === undefined) return null;
  return parseOrThrow(label, HumanizedErrorSchema, raw);
}

/**
 * CHECK-constrained text columns on `workflow_runs`. These mirror the
 * constraints in supabase/migrations — adding a value there means adding it
 * here, and an unknown value from the database throws rather than entering
 * retry, billing or source-attribution logic.
 */
export const WORKFLOW_RUN_TRIGGERED_BY = [
  "manual",
  "test",
  "webhook",
  "scheduled",
  "retry",
  "api_key",
  "unknown",
] as const;

export const WORKFLOW_RUN_BILLING_STATUSES = [
  "reserved",
  "reconciled",
  "released",
  "failed",
] as const;
