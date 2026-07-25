import { getHelpArticle, helpArticleForProvider } from "./helpCatalog";

/**
 * Contextual-help resolver (HELP-CENTER-CONTEXTUAL-1).
 *
 * THE single source of truth mapping product confusion points to Help Center
 * articles. Product components never hardcode `/help/<slug>` strings — they
 * describe their context and render whatever this resolver returns (or
 * nothing, when it returns null). Pure and client-safe: only the typed local
 * catalog is consulted; no registry, services, or repositories.
 *
 * Guarantees:
 *   - Every returned slug is verified against the catalog at resolve time —
 *     catalog drift yields `null`, never a broken `/help/` URL.
 *   - Mapping keys are STABLE classifications (provider ids, the persisted
 *     `HumanizedError.action` enum, onboarding step keys) — never parsed
 *     from arbitrary error text, and never derived from provider responses.
 *   - Unknown/unmapped contexts return `null`; callers must render no help
 *     control in that case.
 *
 * Deliberate `null` mappings (not gaps by accident):
 *   - run_error `review_pending` — "a connected app changed" explicitly
 *     requires NO user action; a troubleshooting link would invite one.
 *   - run_error `link_vehicles` — no vehicle-links article exists yet
 *     (deferred; the CTA already goes straight to the fix surface).
 */

export type HelpContext =
  /** A provider's connect/setup guide (Apps card, connect surfaces). */
  | { type: "provider_setup"; providerId: string }
  /** A connection that stopped working (reconnect-needed states). */
  | { type: "connection_problem" }
  /**
   * A failed run, keyed on the persisted classification's `action` enum
   * (core/errors/humanizeActionError.ts). Pass the action verbatim; an
   * absent/legacy/unknown action falls back to the general troubleshooting
   * article — EXCEPT the deliberate nulls documented above.
   */
  | { type: "run_error"; action?: string | null }
  /** Billing/usage explanations next to existing billing UI. */
  | { type: "billing"; reason: "task_usage" | "ai_credits" | "plan_change" }
  /** First-workflow onboarding checklist steps. */
  | {
      type: "onboarding";
      step: "create" | "connect" | "configure" | "test" | "activate";
    }
  /** Builder concepts with a dedicated article and a wired surface. */
  | { type: "builder_concept"; concept: "setup_issues" | "step_data" };

export interface HelpArticleLink {
  slug: string;
  href: `/help/${string}`;
  label: string;
}

/** Wrap a mapped slug into a link, verifying it exists in the catalog. */
function link(slug: string, label: string): HelpArticleLink | null {
  const article = getHelpArticle(slug);
  if (!article) return null;
  return { slug: article.slug, href: `/help/${article.slug}`, label };
}

const RUN_ERROR_GENERAL_SLUG = "troubleshoot-a-failed-run";
const RUN_ERROR_LABEL = "Read troubleshooting guide";

function resolveRunError(action: string | null | undefined): HelpArticleLink | null {
  switch (action) {
    case "reconnect":
      return link("fix-a-disconnected-app", RUN_ERROR_LABEL);
    case "open_node":
      return link("fix-workflow-setup-issues", RUN_ERROR_LABEL);
    case "upgrade_plan":
      // Covers task quota, AI credits, and plan-feature failures. The
      // persisted classification carries no engine code, so the task-usage
      // article (which cross-links AI credits) is the safe shared target —
      // refining per-code would require persisting the code (deferred).
      return link("understand-task-usage", RUN_ERROR_LABEL);
    case "review_pending":
    case "link_vehicles":
      return null; // deliberate — see module doc
    case "retry_later":
    case "contact_support":
    default:
      // Unknown/legacy/absent classification → general troubleshooting.
      return link(RUN_ERROR_GENERAL_SLUG, RUN_ERROR_LABEL);
  }
}

export function resolveHelpLink(ctx: HelpContext): HelpArticleLink | null {
  switch (ctx.type) {
    case "provider_setup": {
      const article = helpArticleForProvider(ctx.providerId);
      if (!article) return null; // no dedicated guide → no control
      return link(article.slug, "View setup guide");
    }
    case "connection_problem":
      // The disconnected-app article covers the reconnect flow itself plus
      // the per-account and who-must-reconnect rules — more on-point for a
      // broken connection than a provider's first-time setup guide (which
      // stays reachable via provider_setup on the same card).
      return link("fix-a-disconnected-app", "How to reconnect");
    case "run_error":
      return resolveRunError(ctx.action);
    case "billing":
      switch (ctx.reason) {
        case "task_usage":
          return link("understand-task-usage", "How task usage works");
        case "ai_credits":
          return link("understand-ai-credits", "How AI credits work");
        case "plan_change":
          return link("change-or-cancel-your-subscription", "How plan changes work");
        default:
          return null;
      }
    case "onboarding":
      switch (ctx.step) {
        case "create":
          return link("create-your-first-workflow", "Learn how");
        case "connect":
          return link("connect-an-app", "Learn how");
        case "configure":
          return link("configure-workflow-steps", "Learn how");
        case "test":
          return link("test-a-workflow", "Learn how");
        case "activate":
          return link("turn-on-a-workflow", "Learn how");
        default:
          return null;
      }
    case "builder_concept":
      switch (ctx.concept) {
        case "setup_issues":
          return link("fix-workflow-setup-issues", "Learn how to fix setup issues");
        case "step_data":
          return link(
            "use-data-from-an-earlier-step",
            "Learn how to use data from an earlier step",
          );
        default:
          return null;
      }
    default:
      return null;
  }
}
