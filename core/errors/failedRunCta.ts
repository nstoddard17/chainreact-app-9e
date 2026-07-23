/**
 * CR-FAILREASON-2 — pure presentation mapping from a failed run's classified
 * `action` to ONE primary next-action CTA (label + internal destination).
 *
 * This is the single place the failed-run UI surfaces (Runs page row, builder
 * run-results panel, builder Runs-tab detail) resolve the CTA for an
 * `error_classification.action`, so the label/destination never drift between
 * surfaces. It does NOT classify anything (that is `humanizeActionError`) and it
 * NEVER parses raw error strings — it switches on the already-safe action enum.
 *
 * Destinations are REAL V2 routes:
 *   - reconnect    → /apps     (the Apps / reconnect surface)
 *   - upgrade_plan → /account  (the billing / plan surface)
 *   - open_node    → /workflows/{id} (the builder; a specific node is not
 *                    addressable from every surface, so this is the safe
 *                    "fix workflow setup" fallback)
 *
 * Guidance-only actions return `href: null` (NO navigation) because no safe
 * destination exists yet:
 *   - retry_later     → the workflow re-runs on its own / the user re-runs; there
 *                       is NO retry API to wire, so this is guidance only.
 *   - review_pending  → a connected app changed and ChainReact is reviewing it;
 *                       there is NO review/status route in V2 yet (CS-4), so this
 *                       is guidance only — a real link lands with the review UI.
 *   - contact_support → there is NO support route in V2 yet; guidance only.
 *
 * Unknown / missing action → null (render no CTA — never a misleading one).
 *
 * No-leak: output is a fixed label + a static internal path (at most a workflow
 * id, which the caller already shows). It never carries tokens, provider account
 * ids, credential ids, raw provider bodies, step output, or member identities.
 */
import type { HumanizedError } from "./humanizeActionError";

export interface FailedRunCta {
  /** Primary CTA label (plain English, no provider jargon). */
  label: string;
  /**
   * Internal app route to navigate to, or `null` for a guidance-only action
   * (no safe destination exists — render as text, never as a link/button).
   */
  href: string | null;
}

export interface FailedRunCtaContext {
  /** The failed run's workflow id (used only for the open_node builder link). */
  workflowId: string;
}

export function failedRunCta(
  action: HumanizedError["action"],
  ctx: FailedRunCtaContext,
): FailedRunCta | null {
  switch (action) {
    case "reconnect":
      return { label: "Reconnect app", href: "/apps" };
    case "upgrade_plan":
      return { label: "Upgrade plan", href: "/account" };
    case "open_node":
      return {
        label: "Fix workflow setup",
        href: `/workflows/${encodeURIComponent(ctx.workflowId)}`,
      };
    case "retry_later":
      return { label: "Try again later", href: null };
    case "review_pending":
      // CS-4 — a connected app changed; ChainReact is reviewing it. Guidance
      // only (no review/status route exists yet — placeholder per the brief).
      return { label: "ChainReact is reviewing this", href: null };
    case "contact_support":
      return { label: "Contact support", href: null };
    case undefined:
    default:
      // No action, or a legacy/unknown value from an old persisted row → no CTA.
      return null;
  }
}
