/**
 * Private session → sanitized global skill-event boundary (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * THE ENFORCEMENT POINT for "global learning may only receive sanitized/generalized skill events"
 * and "no raw private user conversations are promoted into global memory". It takes a PRIVATE,
 * account-scoped `GuidanceSession` + an advisory `WorkflowPlan` and emits a `SanitizedSkillEvent`
 * that carries ONLY generalized capability shape + a safe outcome — and provably nothing else:
 *   - it reads NO turn text / goal text (raw conversation never crosses),
 *   - it copies NO accountId / userId / workflowId / sessionId,
 *   - it forwards NO config, secret, token, or PII,
 *   - it keeps only step role/provider/type (capability shape) + counts + an outcome flag.
 *
 * It is pure + does not mutate its inputs. The tests pin that a session full of private data
 * yields an event containing none of it.
 */

import type { GuidanceSession, WorkflowPlan } from "@/contracts/guidanceSession";
import type {
  GeneralizedSkillStep,
  SanitizedSkillEvent,
  SkillEventKind,
  SkillEventOutcome,
} from "@/contracts/guidanceSkillEvents";
import { SKILL_EVENT_SCHEMA_VERSION } from "@/contracts/guidanceSkillEvents";
import { validateWorkflowPlan } from "./validateWorkflowPlan";

export interface ToSanitizedSkillEventInput {
  /** Private, account-scoped session. ONLY its generalized SHAPE is read — never its text. */
  readonly session: GuidanceSession;
  /** The advisory plan whose capability shape is generalized into the event. */
  readonly plan: WorkflowPlan;
  readonly eventKind: SkillEventKind;
  readonly outcome: SkillEventOutcome;
}

/**
 * Promote a private guidance session + plan into a de-identified global skill event. Deliberately
 * ignores `session.turns` (raw text), `session.accountId/userId/workflowId/id`, and every plan
 * field except step role/provider/type. The plan's capability validity is recomputed here so the
 * event records whether the shape was real (never trusting the brain).
 */
export function toSanitizedSkillEvent(input: ToSanitizedSkillEventInput): SanitizedSkillEvent {
  const steps: GeneralizedSkillStep[] = input.plan.steps.map((s) => ({
    role: s.role,
    provider: s.provider,
    type: s.type,
  }));
  const providers = [...new Set(steps.map((s) => s.provider).filter((p) => p.length > 0))].sort();
  const allStepsValidated = validateWorkflowPlan(input.plan).ok;

  return {
    schemaVersion: SKILL_EVENT_SCHEMA_VERSION,
    eventKind: input.eventKind,
    outcome: input.outcome,
    steps,
    stepCount: steps.length,
    providers,
    allStepsValidated,
  };
}
