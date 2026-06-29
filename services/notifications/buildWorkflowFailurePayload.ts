import {
  GENERIC_ACTION_ERROR_TITLE,
  type HumanizedError,
} from "@/core/errors/humanizeActionError";

/**
 * Pure payload builder for workflow-failure notifications.
 *
 * One shape consumed by every channel (in-app, email, Slack, Discord, SMS).
 * Channels render this into their own format (in-app row, HTML email, Slack
 * block kit, Discord embed, SMS string) but never re-derive the CTA URL or
 * the body text — that's centralized here so the user sees consistent
 * messaging across surfaces.
 *
 * Per V2 notifications platform plan §1 (Target architecture) — the builder
 * is pure (no I/O, no clients) so channels are trivially testable and the
 * payload is deterministic given the same input.
 */

export interface WorkflowFailurePayload {
  workflowId: string;
  workflowName: string;
  runId: string;
  errorClassification: HumanizedError;
  /** App-internal URL the channel CTA links to. Provider-specific channels
   *  (email, Slack, Discord) will prefix with the deployment's public origin. */
  ctaUrl: string;
  ctaLabel: string;
}

export interface BuildWorkflowFailurePayloadInput {
  workflowId: string;
  workflowName: string;
  runId: string;
  errorClassification: HumanizedError;
}

export function buildWorkflowFailurePayload(
  input: BuildWorkflowFailurePayloadInput,
): WorkflowFailurePayload {
  return {
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    runId: input.runId,
    errorClassification: input.errorClassification,
    ctaUrl: ctaUrlFor(input.errorClassification.action, input.workflowId, input.runId),
    ctaLabel: ctaLabelFor(input.errorClassification.action),
  };
}

/**
 * Action → CTA URL routing. Mirrors the humanizer's action enum so a
 * single classified failure surfaces a consistent CTA across channels.
 *
 * Defaults (no action set on the humanized error) → run-history fallback,
 * mirroring V1's "if action is null, deep-link to history" behavior.
 */
function ctaUrlFor(
  action: HumanizedError["action"],
  workflowId: string,
  runId: string,
): string {
  switch (action) {
    case "reconnect":
      return "/apps";
    case "upgrade_plan":
      // CR-FAILREASON-2 — the billing/plan surface is /account (there is no
      // /subscription route). Matches the in-app failedRunCta destination.
      return "/account";
    // CR-FAILREASON-1 — retry_later + contact_support have no dedicated
    // destination yet (no retry endpoint / support route to link safely), so
    // they deep-link to the run like open_node / no-action. No invented CTA.
    case "open_node":
    case "retry_later":
    case "contact_support":
    case undefined:
      return `/workflows/${workflowId}?historyRun=${runId}`;
  }
}

function ctaLabelFor(action: HumanizedError["action"]): string {
  switch (action) {
    case "reconnect":
      return "Reconnect";
    case "upgrade_plan":
      return "Upgrade plan";
    case "open_node":
      return "View workflow";
    // CR-FAILREASON-1 — no dedicated retry/support CTA yet; link to the run.
    case "retry_later":
    case "contact_support":
    case undefined:
      return "View run";
  }
}

/**
 * Plain-text body shared across channels: description + hint inlined when
 * present. Hint is the load-bearing action recommendation ("Reconnect Slack",
 * "Pick a different channel") — it always pairs with the description.
 *
 * Channels that have richer rendering (email HTML, Slack blocks) may break
 * this back into separate fields by reading payload.errorClassification
 * directly; this helper exists for one-text-blob channels (SMS, in-app
 * body, plain-text email).
 */
export function buildPlainTextBody(err: HumanizedError): string {
  // V2-READY-8: mirror the run-detail `toSafeStepError` guard. The generic
  // humanizer fallback (title === GENERIC_ACTION_ERROR_TITLE) is the ONE branch
  // whose `description` echoes the raw thrown handler message — which can carry
  // account / provider-account ids, emails, tokens, scopes, or raw provider
  // bodies. Surface the safe generic title instead of that raw description, so
  // the notification feed matches the no-leak posture the run-detail endpoint
  // already enforces. Every typed classification keeps its useful, identifier-
  // free description (+ hint).
  if (err.title === GENERIC_ACTION_ERROR_TITLE) return err.title;
  if (err.hint) return `${err.description} ${err.hint}`;
  return err.description;
}
