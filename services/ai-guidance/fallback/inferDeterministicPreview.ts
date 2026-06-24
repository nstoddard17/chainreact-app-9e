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
const MAILCHIMP_ADD_TAG = { provider: "mailchimp", type: "add_tag" } as const;

/**
 * Candidate ids for a Mailchimp "send a campaign/email" capability. None of these exist in the V2
 * catalog today (Mailchimp ships tagging + subscriber/audience management, not campaign SENDING), so
 * `detectCatalogGap` reports the gap honestly rather than fabricating a step. Registry-checked, so the
 * gap auto-resolves if such an action is ever added.
 */
const MAILCHIMP_SEND_CANDIDATES = ["mailchimp:send_campaign", "mailchimp:send_email", "mailchimp:create_campaign"] as const;

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
 * High-confidence match for "in Mailchimp, tag … (win-back / retention / cancel)". Requires a
 * Mailchimp signal, a tag signal, and an APPLY-a-tag intent. A remove/untag-only intent declines (that
 * maps to `remove_tag`, a different shape). A pure read/lookup intent declines too.
 */
function matchesMailchimpAddTag(goal: string): boolean {
  const g = goal.toLowerCase();
  const mailchimp = /\bmailchimp\b/.test(g);
  const tag = /\btags?\b/.test(g);
  if (!mailchimp || !tag) return false;
  // Decline a remove/untag-only intent — that's mailchimp:remove_tag, not this pattern.
  if (/\b(remove|delete|untag|strip)\b/.test(g) && !/\b(add|apply|put|set|mark|label)\b/.test(g)) {
    return false;
  }
  const applyish = /\b(add|apply|put|set|mark|label|tag|win[\s-]?back|retention|retain|cancel(?:l?ed|lation)?)\b/.test(g);
  return applyish;
}

/** A recognized-but-unbuildable shape: the user's intent maps to a capability the catalog lacks. */
export interface CatalogGap {
  readonly provider: string;
  readonly capability: string;
  /** Plain-English, no-secret explanation surfaced to the user. */
  readonly message: string;
}

/**
 * Detect when an obvious intent needs a capability the catalog does NOT have, so the agent surface can
 * say exactly what's missing instead of going silent. Registry-driven (the gap auto-clears if the
 * capability is added). Pure + model-free; returns `null` when no known gap applies.
 *
 * Today's only entry: a Mailchimp "send a win-back campaign/email" intent — the catalog has tagging +
 * audience management but no campaign-send action.
 */
export function detectCatalogGap(goalText: string | undefined): CatalogGap | null {
  const g = (goalText ?? "").trim().toLowerCase();
  if (g.length === 0) return null;

  const mailchimp = /\bmailchimp\b/.test(g);
  const sendIntent = /\b(send|email|e-mail|campaign|broadcast|blast|newsletter)\b/.test(g);
  if (mailchimp && sendIntent) {
    const hasSendAction = MAILCHIMP_SEND_CANDIDATES.some((id) => getActionMeta(id) != null);
    if (!hasSendAction) {
      return {
        provider: "mailchimp",
        capability: "send_campaign",
        message:
          "ChainReact's Mailchimp integration can tag and manage subscribers, but it doesn't have a send-campaign or send-email action yet — so an automatic win-back email step can't be built here.",
      };
    }
  }
  return null;
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

  // --- Pattern 2: Mailchimp tag flow (manual run → add a Mailchimp tag) ---
  // The win-back / retention "tag the customer" intent IS catalog-backed (mailchimp:add_tag). The
  // trigger defaults to manual run (always valid) so we never guess a provider trigger; the user picks
  // the real trigger in the builder. A separate "send the email" intent is a catalog gap (see above).
  if (matchesMailchimpAddTag(goal)) {
    const triggerInputs = requiredTriggerInputs(MANUAL_TRIGGER.provider, MANUAL_TRIGGER.type);
    const actionInputs = requiredActionInputs(MAILCHIMP_ADD_TAG.provider, MAILCHIMP_ADD_TAG.type);
    if (triggerInputs !== null && actionInputs !== null) {
      const steps: WorkflowPlanStep[] = [
        {
          ref: "s0",
          role: "trigger",
          provider: MANUAL_TRIGGER.provider,
          type: MANUAL_TRIGGER.type,
          purpose: "Run this workflow manually (pick a different trigger in the builder if you prefer).",
          ...(triggerInputs.length > 0 ? { requiredInputs: triggerInputs } : {}),
        },
        {
          ref: "s1",
          role: "action",
          provider: MAILCHIMP_ADD_TAG.provider,
          type: MAILCHIMP_ADD_TAG.type,
          purpose: "Add a Mailchimp tag (e.g. a win-back / retention tag) to the subscriber.",
          ...(actionInputs.length > 0 ? { requiredInputs: actionInputs } : {}),
        },
      ];
      const plan: WorkflowPlan = {
        schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
        title: "Tag a Mailchimp subscriber",
        summary: "Add a Mailchimp tag to a subscriber — for example, a win-back or retention tag.",
        steps,
        notApplied: true,
      };
      if (validateWorkflowPlan(plan).ok) return plan;
      // else fall through (registry/validation miss → try other patterns / null)
    }
  }

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
