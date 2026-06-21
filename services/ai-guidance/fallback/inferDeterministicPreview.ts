/**
 * Deterministic, catalog-validated guidance fallback (HERMES-AGENT-DETERMINISTIC-SHAPE-FALLBACK).
 *
 * When the Hermes Agent returns useful guidance TEXT but no valid `workflowPlan`/`previewDraft` for an
 * OBVIOUS supported shape, ChainReact can still produce a partial, VALIDATED preview so the user gets
 * the "I sketched the workflow — finish the details below" experience instead of plain-text questions.
 *
 * This is intentionally NARROW and SAFE — NOT a planner:
 *   - It matches only a tiny allow-list of high-confidence phrasings (manual run → Slack channel
 *     message today). Ambiguous goals return `null` (let Hermes' text stand).
 *   - It NEVER invents provider/action ids: every step is checked against the real discovery registry
 *     (`getTriggerMeta`/`getActionMeta`) and the whole plan is run through `validateWorkflowPlan`. Any
 *     miss → `null` (fail closed).
 *   - It reads `requiredInputs` field KEYS from the action's real metadata (`meta.fields` where
 *     `required`) — never hardcoded guesses. If the metadata can't be resolved, it returns `null`.
 *   - It is deterministic + model-free: NO Hermes / model / network call. It produces only an advisory
 *     `WorkflowPlan` (the route converts it to an ephemeral `notApplied` preview). It creates / saves /
 *     activates / runs NOTHING, and carries no config values, secrets, or ids.
 *
 * Server-only: imports the discovery registry. Lives in the AI-guidance path, called by the guidance
 * route only when Hermes produced no plan.
 */

import { WORKFLOW_PLAN_SCHEMA_VERSION, type WorkflowPlan, type WorkflowPlanStep } from "@/contracts/guidanceSession";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";
import { validateWorkflowPlan } from "../validateWorkflowPlan";

/** Canonical capability ids the fallback may use. Each is registry-checked before it ships in a plan. */
const MANUAL_TRIGGER = { provider: "native", type: "manual.run" } as const;
const SLACK_CHANNEL_MESSAGE = { provider: "slack", type: "send_channel_message" } as const;

/** Required field KEY names for a `provider:type` action, read from its real metadata (or null). */
function requiredActionInputs(provider: string, type: string): readonly string[] | null {
  const meta = getActionMeta(`${provider}:${type}`);
  if (!meta) return null;
  return meta.fields.filter((f) => f.required).map((f) => f.name);
}

/** Required field KEY names for a `provider:type` trigger, read from its real metadata (or null). */
function requiredTriggerInputs(provider: string, type: string): readonly string[] | null {
  const meta = getTriggerMeta(`${provider}:${type}`);
  if (!meta) return null;
  return meta.fields.filter((f) => f.required).map((f) => f.name);
}

/**
 * High-confidence match for "when I run this manually, send a Slack (channel) message …". Requires
 * BOTH a manual-run signal AND a Slack send-message signal. A direct-message / DM phrasing is treated
 * as a DIFFERENT (ambiguous-for-this-pattern) shape and declines, so we never silently pick the
 * channel action when the user asked for a DM.
 */
function matchesManualSlackChannelMessage(goal: string): boolean {
  const g = goal.toLowerCase();
  const manual = /\bmanual(?:ly)?\b/.test(g);
  const slack = /\bslack\b/.test(g);
  const sendish = /\b(send|post|message|msg|notify|remind(?:er)?|ping|alert)\b/.test(g);
  if (!manual || !slack || !sendish) return false;
  // Decline the explicit DM/direct-message shape — that's slack:send_direct_message, not this pattern.
  if (/\b(dm|direct message|direct-message)\b/.test(g)) return false;
  return true;
}

/**
 * Produce a deterministic, catalog-validated partial `WorkflowPlan` for an obvious supported shape, or
 * `null` when nothing matches safely. The route converts a non-null result with `planToDraftPreview`.
 *
 * Pure + model-free. Returns `null` for ambiguous goals and whenever the registry/metadata can't
 * confirm every capability (fail closed).
 */
export function inferDeterministicPreviewPlan(goalText: string | undefined): WorkflowPlan | null {
  const goal = (goalText ?? "").trim();
  if (goal.length === 0) return null;

  // --- Pattern 1: manual run → Slack channel message ---
  if (matchesManualSlackChannelMessage(goal)) {
    // Confirm both capabilities exist in the real registry; read required field keys from metadata.
    const triggerInputs = requiredTriggerInputs(MANUAL_TRIGGER.provider, MANUAL_TRIGGER.type);
    const actionInputs = requiredActionInputs(SLACK_CHANNEL_MESSAGE.provider, SLACK_CHANNEL_MESSAGE.type);
    if (triggerInputs === null || actionInputs === null) return null; // capability/metadata missing → bail

    const steps: WorkflowPlanStep[] = [
      {
        ref: "s0",
        role: "trigger",
        provider: MANUAL_TRIGGER.provider,
        type: MANUAL_TRIGGER.type,
        purpose: "Run this workflow manually.",
        ...(triggerInputs.length > 0 ? { requiredInputs: triggerInputs } : {}),
      },
      {
        ref: "s1",
        role: "action",
        provider: SLACK_CHANNEL_MESSAGE.provider,
        type: SLACK_CHANNEL_MESSAGE.type,
        purpose: "Send a message to a Slack channel.",
        ...(actionInputs.length > 0 ? { requiredInputs: actionInputs } : {}),
      },
    ];

    const plan: WorkflowPlan = {
      schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
      title: "Manual run → Slack message",
      summary: "When you run this workflow manually, send a message to a Slack channel.",
      steps,
      notApplied: true,
    };

    // Final gate — the same deterministic capability validator the Hermes plan path uses. Fail closed.
    return validateWorkflowPlan(plan).ok ? plan : null;
  }

  return null;
}
