import type { AgentWorkflowDiagnosis } from "@/lib/api/ai";

/**
 * Slice 4.CHECK-ACTIONS-1 — derive the "Needs setup" actionable cards from a safe
 * diagnosis DTO.
 *
 * Pure + deterministic: reads ONLY the already-sanitized `source: "connection"`
 * findings (provider slug + public provider name + ConnectionStatus code), maps each
 * to friendly, value-free guidance, and decides whether the current user can act on
 * it via the existing Apps page (`/apps`) — the SAME safe destination the builder's
 * combobox-field "Reconnect … in Apps" guidance already uses. No model call, no I/O,
 * no AI credits.
 *
 * Product mapping (mirrors the deterministic `connectionTitle` codes the agent
 * diagnosis emits):
 *   - Reconnect-actionable (DISCONNECTED / RECONNECT_REQUIRED / TOKEN_EXPIRED /
 *     MISSING_SCOPES) → guidance + an `/apps` connect/reconnect link. The Apps page
 *     enforces who may actually reconnect (account-provider = owner/admin, personal =
 *     connector), so the link is never a broken affordance.
 *   - Guidance-only (NOT_WORKFLOW_OWNER / PROVIDER_DISABLED / PROVIDER_UNKNOWN /
 *     anything unrecognized) → safe next-step text with NO button (the current user
 *     can't fix it from their own account, or reconnecting wouldn't help).
 *
 * No-leak: the only identifier rendered is the provider's PUBLIC display name (or its
 * slug as a fallback) — both already deemed safe by the diagnosis DTO. Raw codes, node
 * ids, field keys, scope constant names, account/integration ids, tokens, and provider
 * error strings are NEVER surfaced.
 */

/** An actionable affordance — currently only a link to the existing Apps page. */
export interface SetupFindingAction {
  readonly href: "/apps";
  readonly label: string;
}

export interface SetupFindingCard {
  /** Stable React key (provider slug + code). Not rendered. */
  readonly key: string;
  /** Friendly provider name (public name preferred, slug fallback). Safe to render. */
  readonly providerLabel: string;
  /** ConnectionStatus code — used for classification ONLY, never rendered as text. */
  readonly code: string;
  readonly severity: "error" | "warning";
  /** Deterministic, value-free guidance sentence. */
  readonly message: string;
  /** When set, a safe affordance the user can act on; null → guidance-only (no button). */
  readonly action: SetupFindingAction | null;
}

/** Codes a member can resolve themselves by (re)connecting through the Apps page. */
const RECONNECT_ACTIONABLE_CODES: ReadonlySet<string> = new Set([
  "DISCONNECTED",
  "RECONNECT_REQUIRED",
  "TOKEN_EXPIRED",
  "MISSING_SCOPES",
]);

/** Build the friendly guidance sentence for one connection finding. */
function setupMessage(code: string, provider: string): string {
  switch (code) {
    case "DISCONNECTED":
      return `${provider} isn't connected yet. Connect it before this workflow can run.`;
    case "RECONNECT_REQUIRED":
      return `${provider} needs to be reconnected before this workflow can run.`;
    case "TOKEN_EXPIRED":
      return `${provider}'s access has expired. It may refresh automatically on the next run — if runs keep failing, reconnect it.`;
    case "MISSING_SCOPES":
      return `${provider} is missing some permissions this workflow needs. Reconnect it to grant them.`;
    case "NOT_WORKFLOW_OWNER":
      return `${provider} is connected by the workflow's creator. They'll need to reconnect it — it can't be done from your account.`;
    case "PROVIDER_DISABLED":
      return `${provider} is temporarily unavailable. This usually resolves on its own; try again later.`;
    default:
      // PROVIDER_UNKNOWN / anything unrecognized — safe, generic next step, no button.
      return `${provider} needs attention before this workflow can run.`;
  }
}

/** Action verb for the `/apps` link — "Connect" for a never-connected provider, else "Reconnect". */
function actionLabel(code: string, provider: string): string {
  const verb = code === "DISCONNECTED" ? "Connect" : "Reconnect";
  return `${verb} ${provider} in Apps`;
}

/**
 * Map a diagnosis to its ordered "Needs setup" cards (in finding order). Returns an
 * empty array when there are no connection findings, so the caller renders nothing.
 */
export function setupFindingCards(
  diagnosis: AgentWorkflowDiagnosis | null | undefined,
): SetupFindingCard[] {
  const out: SetupFindingCard[] = [];
  for (const finding of diagnosis?.findings ?? []) {
    if (finding.source !== "connection") continue;
    const code = finding.code;
    const providerLabel =
      (finding.providerName && finding.providerName.length > 0
        ? finding.providerName
        : finding.provider) ?? "This connection";
    const severity: "error" | "warning" = finding.severity === "warning" ? "warning" : "error";
    const reconnectActionable = RECONNECT_ACTIONABLE_CODES.has(code);

    // CHECK-ACTIONS-3 — when the diagnosis knows the current user CANNOT (re)connect
    // this credential (`canReconnect === false`: e.g. an account/service provider a
    // non-owner member can't re-authorize, or someone else's personal connection),
    // a reconnect-actionable finding becomes guidance-only — no broken Apps button.
    // When `canReconnect` is true or absent (no signal), behavior is unchanged: the
    // existing generic Apps action is offered.
    if (reconnectActionable && finding.canReconnect === false) {
      out.push({
        key: `${finding.provider ?? "?"}:${code}`,
        providerLabel,
        code,
        severity,
        message: `Ask the workflow owner or connection owner to reconnect ${providerLabel}.`,
        action: null,
      });
      continue;
    }

    const action: SetupFindingAction | null = reconnectActionable
      ? { href: "/apps", label: actionLabel(code, providerLabel) }
      : null;
    out.push({
      key: `${finding.provider ?? "?"}:${code}`,
      providerLabel,
      code,
      severity,
      message: setupMessage(code, providerLabel),
      action,
    });
  }
  return out;
}
