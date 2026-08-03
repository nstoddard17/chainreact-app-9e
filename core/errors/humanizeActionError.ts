/**
 * Pure humanizer for engine + handler errors.
 *
 * Converts the engine's failure codes (MISSING_VARIABLE, MISSING_HANDLER,
 * HANDLER_FAILED, WORKFLOW_NOT_FOUND, TRIGGER_NODE_NOT_FOUND) and the
 * provider-specific Slack codes (channel_not_found, not_in_channel,
 * invalid_auth, http_<status>, …) into a user-facing
 * {title, description, hint?, action?, severity} shape.
 *
 * Lives in core/ because it has zero I/O and is consumed by both the
 * engine (writes the classification on the workflow_runs row) and the
 * UI (renders run history). Per project-structure §"Error humanization":
 * core/errors/humanizeActionError.ts.
 *
 * Action codes route the UI's CTA button (CR-FAILREASON-1 — one primary action
 * per failed run):
 *   - reconnect       → reconnect the app (Apps page)
 *   - open_node       → builder with the failed node focused (fix config)
 *   - retry_later     → transient failure; re-run / wait (no destructive CTA)
 *   - upgrade_plan    → /account (billing / quota; see failedRunCta.ts)
 *   - review_pending  → a connected app changed; ChainReact stopped the step and
 *                       is reviewing it (guidance only — no user action needed)
 *   - contact_support → safe default for unknown / unclassifiable failures
 *
 * RULE: when classification is uncertain, default to `contact_support` — NEVER
 * tell the user to reconnect / fix / retry when we can't safely justify it.
 */

export interface HumanizedError {
  title: string;
  description: string;
  hint?: string;
  action?:
    | "reconnect"
    | "open_node"
    | "retry_later"
    | "upgrade_plan"
    | "review_pending"
    // 5.TRUCK-BRIDGE-1 CS-6 — open the Vehicle Links screen. Its own action
    // because the fix is neither a reconnect nor a node edit: the workflow and
    // the connection are both fine, a mapping is simply missing.
    | "link_vehicles"
    | "contact_support";
  severity: "warning" | "error";
}

export interface ErrorInput {
  /**
   * Engine code (MISSING_VARIABLE, MISSING_HANDLER, HANDLER_FAILED,
   * WORKFLOW_NOT_FOUND, TRIGGER_NODE_NOT_FOUND) OR a provider-specific
   * code surfaced by a handler.
   */
  code: string;
  /** The raw error message from the engine or handler. */
  message: string;
  /** Engine-supplied details (e.g. { path, reason } for MISSING_VARIABLE). */
  details?: Readonly<Record<string, unknown>>;
}

/**
 * Title used by the generic fallback branch below — the sentinel marking an
 * unclassified failure. CR-FAILREASON-1: this branch NO LONGER echoes the raw
 * thrown `input.message` (it previously did, which leaked raw provider text into
 * the persisted classification + notifications). Its description is now a fixed,
 * identifier-free string, so EVERY branch is safe by construction. The title
 * stays exported as a sentinel for callers that branch on the generic case
 * (run-detail step diagnostics, notification body builder).
 */
export const GENERIC_ACTION_ERROR_TITLE = "Workflow step failed";

export function humanizeActionError(input: ErrorInput): HumanizedError {
  const engineHumanized = humanizeEngineCode(input);
  if (engineHumanized) return engineHumanized;

  const slackHumanized = humanizeSlackHandlerError(input);
  if (slackHumanized) return slackHumanized;

  // CR-FAILREASON-1 — unknown / unclassified failure. Default to contact_support
  // and a fixed, identifier-free description. The raw `input.message` is NEVER
  // echoed here: it can carry tokens, emails, provider account ids, or raw
  // provider bodies. "Uncertain ⇒ contact support", never a misleading action.
  return {
    title: GENERIC_ACTION_ERROR_TITLE,
    description: "This step failed for an unexpected reason.",
    hint: "Try running the workflow again; if it keeps failing, contact support.",
    action: "contact_support",
    severity: "error",
  };
}

function humanizeEngineCode(input: ErrorInput): HumanizedError | null {
  switch (input.code) {
    case "MISSING_VARIABLE": {
      const path = stringField(input.details, "path");
      const reason = stringField(input.details, "reason");
      const reasonHint =
        reason === "missing_node"
          ? "The referenced step hasn't run yet, or its node id changed."
          : reason === "array_out_of_bounds"
            ? "The referenced array index is past the end of the data."
            : "The referenced field is missing from the upstream data.";
      return {
        title: "Variable reference can't be resolved",
        description: path
          ? `Couldn't resolve {{${path}}} when running this step.`
          : "A {{...}} reference in this step couldn't be resolved.",
        hint: reasonHint,
        action: "open_node",
        severity: "error",
      };
    }
    case "MISSING_HANDLER":
      return {
        title: "No handler for this action",
        description:
          input.message ||
          "The action type configured on this node isn't recognized by the engine.",
        hint: "Pick a supported action type, or remove this node.",
        action: "open_node",
        severity: "error",
      };
    case "WORKFLOW_NOT_FOUND":
      return {
        title: "Workflow not found",
        description:
          "The workflow was deleted while a webhook event was waiting to dispatch.",
        severity: "warning",
      };
    case "TRIGGER_NODE_NOT_FOUND":
      return {
        title: "Trigger node missing",
        description:
          "The webhook fired a trigger node that no longer exists in the workflow definition. The workflow may have been edited after the event arrived.",
        hint: "Re-save the workflow to refresh trigger registration.",
        action: "open_node",
        severity: "warning",
      };
    case "BILLING_EXHAUSTED":
      return {
        title: "Task quota exhausted",
        description:
          input.message ||
          "You've reached your task quota for this billing period.",
        hint: "Upgrade your plan to keep workflows running.",
        action: "upgrade_plan",
        severity: "warning",
      };
    // AI-PROVIDER-6 — the AI-credit meter, not the task meter. Same CTA,
    // different story: the plan includes AI, the balance ran out.
    case "AI_CREDITS_EXHAUSTED":
      return {
        title: "Out of AI credits",
        description:
          input.message ||
          "This workflow uses a ChainReact AI step, and the account has no AI credits left for this billing period.",
        hint: "Upgrade your plan or wait for your credits to reset, then re-run this workflow.",
        action: "upgrade_plan",
        severity: "warning",
      };
    case "PLAN_FEATURE_REQUIRED":
      return {
        title: "Upgrade required for If/Else routing",
        description:
          input.message ||
          "This workflow uses If/Else routing, which requires Pro or higher.",
        hint: "Upgrade your plan, or remove the branching step to run this workflow.",
        action: "upgrade_plan",
        severity: "warning",
      };
    case "INVALID_BRANCH":
      return {
        title: "Branch label not found",
        description:
          input.message ||
          "This step chose a branch that isn't wired to any outgoing edge.",
        hint: "Check the branch labels on this node's outgoing edges, or update the handler's branch decision.",
        action: "open_node",
        severity: "error",
      };
    case "EXECUTION_INTERRUPTED":
      // COST-15F — a run left in 'running' past the staleness cutoff and swept
      // to failed (the engine process restarted between create + finalize).
      // CR-FAILREASON-1 — re-running is the right next step → retry_later.
      return {
        title: "Run interrupted",
        description:
          input.message ||
          "This run was interrupted before it finished — the engine likely restarted mid-execution.",
        hint: "Re-run the workflow; if this keeps happening, check engine/deploy health.",
        action: "retry_later",
        severity: "error",
      };
    case "WORKFLOW_NOT_READY":
      // Pre-dispatch readiness backstop (engine `checkWorkflowReadiness`): a step
      // is missing required config or the graph is structurally invalid. This is a
      // user-fixable setup problem → open_node. Code-derived copy only — the raw
      // readiness message is not echoed here.
      return {
        title: "Workflow needs setup",
        description:
          "This workflow has a step with missing required configuration, or its steps aren't fully connected.",
        hint: "Open the workflow and finish setting up the flagged step, then run it again.",
        action: "open_node",
        severity: "error",
      };
    case "UNMAPPED_VEHICLE":
      // 5.TRUCK-BRIDGE-1 CS-4 — `fleetio:find_linked_vehicle` found no ACTIVE
      // link for the telematics vehicle this run supplied. A SETUP gap with a
      // specific, safe fix.
      //
      // Code-derived copy ONLY. The thrown message names the vehicle id the
      // run supplied; it is deliberately NOT echoed here, because this string
      // is persisted on the run row and fans out to notifications, and it must
      // stay identifier-free like every other classified branch. An ARCHIVED
      // link and a never-created link produce identical copy — the user's next
      // step is the same, and distinguishing them would reveal that a mapping
      // once existed.
      //
      // CS-6 — `link_vehicles` now points straight at /apps/vehicle-links.
      // CS-4 deliberately emitted NO action because that surface was behind a
      // default-OFF flag and a CTA linking to a 404 is worse than no CTA. CS-6
      // enabled the flag by default, so the destination exists; the serving
      // layer still strips this action if an operator turns the flag back off
      // (see `filterVehicleLinksCta`), which keeps "never a misleading action"
      // true in both configurations.
      return {
        title: "Vehicle isn't linked yet",
        description:
          "This Motive vehicle is not linked to Fleetio yet. Link it in Apps → Vehicle Links, then run the workflow again.",
        hint: "Vehicle links are set up once per truck and reused by every workflow.",
        action: "link_vehicles",
        severity: "error",
      };
    case "INTEGRATION_REAUTH_REQUIRED":
      // CR-FAILREASON-1 — provider-agnostic auth/refresh failure normalized at the
      // engine boundary (Unauthorized401Error / IntegrationActionRequiredError).
      // Code-derived copy ONLY: the underlying error message can carry account /
      // provider-account ids, so it is NEVER echoed here.
      return {
        title: "An app needs to be reconnected",
        description:
          "A connected app rejected the request because its access expired or was revoked.",
        hint: "Reconnect the app on the Apps page; the workflow stays paused until that's done.",
        action: "reconnect",
        severity: "error",
      };
    case "INTEGRATION_SCOPE_REQUIRED":
      // CR-FAILREASON-1 — provider returned 403 because the stored token lacks a
      // required scope (InsufficientScopeError). A refresh keeps the same scopes,
      // so only re-consent (reconnect) fixes it. Code-derived copy only.
      return {
        title: "An app needs additional permission",
        description:
          "A connected app is missing a permission this step needs.",
        hint: "Reconnect the app to grant the new permission, then run it again.",
        action: "reconnect",
        severity: "error",
      };
    case "TRANSIENT_PROVIDER_ERROR":
      // CR-FAILREASON-1 — a transient provider failure normalized at the engine
      // boundary (timeout / aborted request). Retrying usually succeeds. Code-
      // derived copy only — no raw provider text echoed.
      return {
        title: "A connected app didn't respond in time",
        description:
          "The request to a connected app timed out or was interrupted.",
        hint: "Try running the workflow again in a few minutes.",
        action: "retry_later",
        severity: "warning",
      };
    case "PROVIDER_CONFLICT":
      // EXCEL-UPDATE-ROW-CONCURRENCY-4 — the document is open for editing
      // somewhere else, so the app refused the change.
      //
      // Two things this copy must do and one it must not. It states that
      // NOTHING was changed, because that is the question a user actually
      // has when a step touching their spreadsheet fails. It names the fix
      // in terms of the world ("close the file") rather than the protocol.
      // And it does NOT promise an automatic retry — there isn't one, by
      // design: Microsoft documents that a client must not resend until the
      // conflict clears. Code-derived copy only; the thrown message carries
      // provider codes and ids and is never echoed.
      return {
        title: "The file was in use",
        description:
          "A connected app wouldn't save this change because the document was being used somewhere else — usually because somebody had it open for editing. Nothing was changed.",
        hint: "Close the file, or wait a moment, then run the workflow again.",
        action: "retry_later",
        severity: "error",
      };
    case "INTEGRATION_CHANGED":
      // CS-4 MCP-DRIFT — a connected app changed its interface in a way we
      // haven't reviewed; the engine stopped the step BEFORE sending any data.
      // This is a protection, not a failure the user caused — plain language,
      // no protocol jargon, no reconnect/fix/retry (none of those help). The
      // raw drift detail stays server-side; this copy is fully code-derived.
      return {
        title: "A connected app changed",
        description:
          "This app updated how it works, so ChainReact stopped this step before sending anything. Your workflow is safe — no data was sent against a version we haven't reviewed.",
        hint: "You don't need to do anything. ChainReact is reviewing the change and will restore this step once it's certified.",
        action: "review_pending",
        severity: "warning",
      };
    case "HANDLER_FAILED":
      // Slack-ish messages get further refinement below.
      return null;
    default:
      return null;
  }
}

function humanizeSlackHandlerError(input: ErrorInput): HumanizedError | null {
  const slackCode = extractSlackCode(input.message);
  if (!slackCode) return null;

  // Auth-related codes route to Reconnect.
  if (
    slackCode === "invalid_auth" ||
    slackCode === "token_revoked" ||
    slackCode === "token_expired" ||
    slackCode === "account_inactive" ||
    slackCode === "not_authed"
  ) {
    return {
      title: "Slack needs to be reconnected",
      description:
        "Slack rejected the bot token — usually because the workspace removed the app or the OAuth flow needs to be re-run.",
      hint: "Reconnect Slack on the integrations page; the workflow stays paused until that's done.",
      action: "reconnect",
      severity: "error",
    };
  }

  if (slackCode === "channel_not_found") {
    return {
      title: "Slack channel not found",
      description:
        "Slack couldn't find the channel id this step is trying to post to.",
      hint: "Double-check the channel id and that the bot is a member.",
      action: "open_node",
      severity: "error",
    };
  }
  if (slackCode === "not_in_channel" || slackCode === "is_archived") {
    return {
      title: "Slack channel access lost",
      description:
        slackCode === "is_archived"
          ? "The Slack channel has been archived."
          : "The Slack bot has been removed from this channel.",
      hint:
        slackCode === "is_archived"
          ? "Pick a different channel or unarchive the existing one."
          : "Re-invite the bot to the channel and try again.",
      action: "open_node",
      severity: "error",
    };
  }

  if (slackCode === "rate_limited" || slackCode === "http_429") {
    return {
      title: "Slack rate limit hit",
      description:
        "Slack has temporarily throttled this app. This usually clears on its own.",
      hint: "Try running the workflow again in a few minutes.",
      action: "retry_later",
      severity: "warning",
    };
  }

  if (slackCode.startsWith("http_")) {
    // CR-FAILREASON-1 — provider 5xx / other HTTP error: transient → retry_later.
    return {
      title: "Slack API error",
      description: `Slack returned ${slackCode.replace("http_", "HTTP ")}.`,
      hint: "Try again in a moment; if it persists, check Slack's status page.",
      action: "retry_later",
      severity: "warning",
    };
  }

  // Unknown Slack code — fall back to a generic Slack message rather than the
  // raw "Slack chat.postMessage failed: <code>" string. CR-FAILREASON-1: an
  // unclassifiable provider code is uncertain → contact_support (the safe
  // default), never a misleading reconnect/fix/retry.
  return {
    title: "Slack action failed",
    description: `Slack reported: ${slackCode}`,
    action: "contact_support",
    severity: "error",
  };
}

const SLACK_PREFIX = "Slack chat.postMessage failed: ";

function extractSlackCode(message: string): string | null {
  if (!message.startsWith(SLACK_PREFIX)) return null;
  const code = message.slice(SLACK_PREFIX.length).trim();
  return code.length > 0 ? code : null;
}

function stringField(
  details: ErrorInput["details"],
  key: string,
): string | null {
  if (!details) return null;
  const value = details[key];
  return typeof value === "string" ? value : null;
}
