import type { PlanStatus, PlanTier } from "./planPolicy";

/**
 * Billing lifecycle → user-facing state (Slice 4.BILLING-PLAN-METADATA-6 / CS-5).
 *
 * Pure (no DB / I/O — core/ imports only sibling core modules). Derives the warning
 * level + copy the Billing UI shows from the synced billing facts (plan / plan_status /
 * cancel_at_period_end / current_period_end). WARNING-FIRST: it never says runs are
 * blocked — `past_due` and `canceled` keep access in CS-5 (the product decision). No
 * enforcement, no downgrade — this only describes state.
 *
 * The copy intentionally carries NO date string (locale formatting stays in the UI); the
 * helper returns the period boundary as an ISO + a `kind` so the UI labels it
 * ("Renews" vs "Ends") and formats it consistently with the rest of the page.
 */

export type BillingNoticeLevel = "none" | "info" | "warning";

export interface BillingPeriodBoundary {
  iso: string;
  /** How the UI should label the boundary: an active plan renews; everything else ends. */
  kind: "renews" | "ends";
}

export interface BillingLifecycleState {
  /** Severity for styling. `none` → no banner (healthy active / free). */
  level: BillingNoticeLevel;
  /** Short status label, e.g. "Active", "Trial", "Payment past due", "Canceled". */
  statusLabel: string;
  /** User-facing description (warn-first; never claims runs are blocked). Empty for `none`. */
  description: string;
  /** Period boundary to display, or null when unknown (safe fallback). */
  periodEnd: BillingPeriodBoundary | null;
}

export interface BillingLifecycleInput {
  plan: PlanTier;
  planStatus: PlanStatus;
  cancelAtPeriodEnd: boolean;
  /** ISO timestamp from Stripe; null/absent when no subscription period is known. */
  currentPeriodEnd: string | null;
}

function boundary(iso: string | null, kind: BillingPeriodBoundary["kind"]): BillingPeriodBoundary | null {
  return iso ? { iso, kind } : null;
}

export function deriveBillingLifecycle(input: BillingLifecycleInput): BillingLifecycleState {
  // Free has no paid subscription lifecycle — never show a billing notice for it, even
  // if a stray status slips through. (The webhook only sets paid statuses on real subs.)
  if (input.plan === "free") {
    return { level: "none", statusLabel: "Active", description: "", periodEnd: null };
  }

  switch (input.planStatus) {
    case "past_due":
      return {
        level: "warning",
        statusLabel: "Payment past due",
        // Product decision (CS-5): warn + keep running. NEVER state runs are blocked.
        description:
          "We couldn't process your last payment. Your plan is still active — update your payment method to avoid losing access.",
        periodEnd: boundary(input.currentPeriodEnd, "ends"),
      };
    case "incomplete":
      return {
        level: "warning",
        statusLabel: "Payment incomplete",
        description:
          "Your subscription setup didn't finish. Complete payment to activate your plan.",
        periodEnd: null,
      };
    case "canceled":
      return {
        level: "warning",
        statusLabel: "Canceled",
        // No auto-downgrade / no hard delete — access is retained for now (CS-5). For a Business
        // (business tier) account, cancellation PRESERVES the workspace (CS-BD-2): members,
        // folders, and workflows are kept; simplifying to a Team account is a separate, explicit,
        // owner-initiated action — never automatic. Copy stays free of "deleted"/"downgrade" words.
        description:
          input.plan === "business"
            ? "Your Business subscription was canceled. Your workspace is preserved — members, folders, and workflows are kept — and you still have access for now."
            : "Your subscription was canceled. You still have access for now — choose a plan to keep your current features.",
        periodEnd: boundary(input.currentPeriodEnd, "ends"),
      };
    case "trialing":
      return {
        level: "info",
        statusLabel: "Trial",
        description: "You're on a free trial of this plan.",
        periodEnd: boundary(input.currentPeriodEnd, "ends"),
      };
    case "active":
      if (input.cancelAtPeriodEnd) {
        return {
          level: "warning",
          statusLabel: "Active — canceling",
          description:
            "Your plan is set to cancel and won't renew. You keep access until it ends.",
          periodEnd: boundary(input.currentPeriodEnd, "ends"),
        };
      }
      return {
        level: "none",
        statusLabel: "Active",
        description: "",
        periodEnd: boundary(input.currentPeriodEnd, "renews"),
      };
  }
}
