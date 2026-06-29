import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";
import type { AccountSummary } from "@/lib/api/accounts";
import { planTierLabel, type PlanTier, type PlanStatus } from "@/core/billing/planPolicy";
import { deriveBillingLifecycle } from "@/core/billing/billingLifecycle";
import { computeAccountUsageSummary, type BillingDisplayMode } from "@/core/billing/accountUsageSummary";
import { PersonalPlanPanel } from "./PersonalPlanPanel";
import { PersonalUpgradePanel } from "./PersonalUpgradePanel";
import { BusinessUpgradePanel } from "./BusinessUpgradePanel";
import { BusinessDowngradePanel } from "./BusinessDowngradePanel";
import { ManageBillingButton } from "./ManageBillingButton";
import { ComingSoonRow, ReadOnlyRow, type ActiveAccountView } from "./settingsRows";

/**
 * Plan & billing section body (extracted from AccountSections.tsx in
 * 4.ACCOUNT-SETTINGS-BILLING-REFACTOR-1 — behavior unchanged).
 *
 * Read-only billing overview (tier / usage / member + folder caps) + the CS-5 warn-first
 * lifecycle banner + period row, plus the PPT-3 interactive PersonalPlanPanel for an
 * owner/admin on a personal account. Billing is live (no feature-flag gate). No fake
 * checkout/payment controls; Business is labeled "Business", never "Organization".
 */

/** Account billing/limit facts the page resolves for the ACTIVE account. */
export interface AccountBillingView {
  /** Real task usage from `account_billing`, or null when unavailable. */
  usage: { tasksUsed: number; tasksLimit: number; periodStartedAt: string | null } | null;
  /**
   * Real AI-credit usage from `account_billing` (separate billing dimension from tasks),
   * or null when unavailable. AI credits meter paid model calls (Builder AI Q&A / Explain
   * / planner / repair); deterministic checks are free and never deduct. Optional so the
   * pre-active fallback view and existing callers/tests don't have to supply it.
   */
  aiCredits?: { used: number; limit: number; periodStartedAt: string | null } | null;
  /** Total-member cap (team/business); null for personal / uncapped. */
  memberLimit: number | null;
  /** Current member count (team/business), or null when not loaded/applicable. */
  memberCount: number | null;
  /** Workflow-folder cap for the active account's tier. */
  folderLimit: number;
  /** True when the active account is pending deletion (frozen). */
  frozen: boolean;
  /**
   * Explicit billing tier from `account_billing.plan` (CS-1). When present it is the
   * source of truth for the displayed tier (e.g. a personal account on `pro` shows
   * "Pro"); when null/absent the label falls back to the account-type default.
   */
  plan?: PlanTier | null;
  /** Subscription lifecycle status (CS-5) — drives the warning banner copy. */
  planStatus?: PlanStatus | null;
  /** ISO subscription period end (CS-5); null when no subscription. */
  currentPeriodEnd?: string | null;
  /** Whether the subscription is set to cancel at period end (CS-5). */
  cancelAtPeriodEnd?: boolean | null;
  /** ENABLE_BUSINESS_DOWNGRADE (CS-BD-3) — dark-launch gate for the destructive Business → Team
   *  downgrade. When false (default), the downgrade affordance is hidden (the route also 404s). */
  businessDowngradeEnabled?: boolean;
  /** The viewer's personal account id (BU-4) — lets the Business upgrade run the
   *  Personal-Pro choice dialog. Null when unavailable. */
  personalAccountId?: string | null;
  /**
   * Display-only billing status (BILLING-USAGE-VISIBILITY-1). `internal_free` →
   * the active account is internal and tracked-but-not-billed (no Stripe state).
   * Read service-side from `account_billing.billing_mode` for the membership-scoped
   * active account. Defaults to "standard" when absent so existing callers/tests are
   * unaffected. NOT a subscription state and carries no Stripe ids / audit reason.
   */
  billingMode?: BillingDisplayMode;
}

/**
 * Billing tier label (NOT the account-type label): a personal account is the
 * **Free** tier until Pro plan metadata exists; team → Team; organization →
 * Business. Never surfaces the raw "Organization" word.
 */
function billingTierLabel(type: AccountSummary["type"]): string {
  if (type === "personal") return "Free";
  if (type === "organization") return "Business";
  return "Team";
}

export function BillingSection({
  active,
  accountId,
  billing,
  now,
}: {
  active: ActiveAccountView | null;
  /** The active account's id (for the personal-plan panel routes). */
  accountId?: string | null;
  billing: AccountBillingView;
  /** Injectable "now" for deterministic current-period derivation in tests. */
  now?: Date;
}) {
  // PPT-3: the interactive personal-plan panel renders for an owner/admin on a personal
  // account. Billing is live (no flag gate).
  const showPersonalPlan =
    Boolean(accountId) &&
    active?.type === "personal" &&
    (active.role === "owner" || active.role === "admin");
  // BU-4: the Team → Business upgrade action shows for an owner/admin on a (non-frozen)
  // Team account. An organization (already Business), personal account, or member never sees it.
  const showBusinessUpgrade =
    Boolean(accountId) &&
    !billing.frozen &&
    active?.type === "team" &&
    (active.role === "owner" || active.role === "admin");
  // 4.PLATFORM-BILLING-UI-1: Personal Free → Pro upgrade. Owner/admin on a personal account
  // whose current plan is Free (or unset), not frozen. Hidden for paid Pro (handled by
  // PersonalPlanPanel), team/business, members, or frozen. Personal Pro is live (no flag).
  const showPersonalUpgrade =
    Boolean(accountId) &&
    !billing.frozen &&
    active?.type === "personal" &&
    (active.role === "owner" || active.role === "admin") &&
    (billing.plan == null || billing.plan === "free");
  // 4.PLATFORM-BILLING-UI-1: "Manage billing" portal. Shown only when a Stripe subscription
  // has actually been synced — `currentPeriodEnd` is written ONLY by the CS-4 webhook from a
  // real subscription, so it is a reliable "a Stripe customer exists / the portal will work"
  // signal (account-type default plans like Team carry no such period). Owner/admin, not frozen.
  const showManageBilling =
    Boolean(accountId) &&
    !billing.frozen &&
    (active?.role === "owner" || active?.role === "admin") &&
    billing.currentPeriodEnd != null;
  // CS-BD-3: the destructive Business → Team downgrade. OWNER-only (admins/members never see it),
  // on a non-frozen organization (Business) account, gated on the ENABLE_BUSINESS_DOWNGRADE
  // dark-launch flag (still flag-gated — destructive). The backend route is itself owner-only.
  const showBusinessDowngrade =
    Boolean(billing.businessDowngradeEnabled) &&
    Boolean(accountId) &&
    !billing.frozen &&
    active?.type === "organization" &&
    active.role === "owner";
  const isShared = active != null && active.type !== "personal";
  // CS-1: prefer the explicit stored plan; fall back to the account-type default.
  const tier = active
    ? billing.plan
      ? planTierLabel(billing.plan)
      : billingTierLabel(active.type)
    : "—";
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  // Effective CURRENT-period usage for BOTH billing dimensions — one display-safe
  // summary (BILLING-USAGE-VISIBILITY-1). It mirrors the lazy-rollover SQL anchor so a
  // stored row whose period already elapsed shows the reset (0 used) the next run will
  // apply, never stale lifetime-looking usage, and adds percent + near/over-limit flags.
  // AI credits reset the SAME monthly way on their own anchor, so the shared period math
  // covers both. `available` is true exactly when the dimension's facts were provided.
  const usageSummary = computeAccountUsageSummary({
    billingMode: billing.billingMode ?? "standard",
    tasks: billing.usage
      ? {
          used: billing.usage.tasksUsed,
          limit: billing.usage.tasksLimit,
          periodStartedAt: billing.usage.periodStartedAt,
        }
      : null,
    aiCredits: billing.aiCredits
      ? {
          used: billing.aiCredits.used,
          limit: billing.aiCredits.limit,
          periodStartedAt: billing.aiCredits.periodStartedAt,
        }
      : null,
    now: now ?? new Date(),
  });
  const taskUsage = usageSummary.tasks;
  const aiCreditsUsage = usageSummary.aiCredits;
  const resetsOn = taskUsage.resetsAt != null ? formatDate(taskUsage.resetsAt) : null;
  const aiCreditsResetsOn =
    aiCreditsUsage.resetsAt != null ? formatDate(aiCreditsUsage.resetsAt) : null;

  // CS-5: derive the warning-first lifecycle state from the synced billing facts. Only
  // shown when we have an explicit plan + status (paid accounts); free/active stays
  // banner-less. Never blocks runs — copy is warn-first by design.
  const lifecycle =
    active && billing.plan && billing.planStatus
      ? deriveBillingLifecycle({
          plan: billing.plan,
          planStatus: billing.planStatus,
          cancelAtPeriodEnd: billing.cancelAtPeriodEnd ?? false,
          currentPeriodEnd: billing.currentPeriodEnd ?? null,
        })
      : null;
  const lifecycleBanner = lifecycle && lifecycle.level !== "none" ? lifecycle : null;
  const periodEnd = lifecycle?.periodEnd ?? null;

  return (
    <div data-testid="account-section-billing" className="flex flex-col gap-5">
      {billing.frozen && (
        <div
          data-testid="billing-frozen"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <p className="text-sm font-semibold text-foreground">
            This account is pending deletion.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Billing is read-only while the account is frozen.
          </p>
        </div>
      )}

      {lifecycleBanner && (
        <div
          data-testid="billing-status"
          data-level={lifecycleBanner.level}
          className={
            lifecycleBanner.level === "warning"
              ? "rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 dark:border-amber-400/30 dark:bg-amber-400/10"
              : "rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 dark:border-blue-400/30 dark:bg-blue-400/10"
          }
        >
          <p data-testid="billing-status-label" className="text-sm font-semibold text-foreground">
            {lifecycleBanner.statusLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{lifecycleBanner.description}</p>
        </div>
      )}

      {usageSummary.internalFree && (
        <div
          data-testid="billing-internal-free"
          className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 dark:border-blue-400/30 dark:bg-blue-400/10"
        >
          <p className="text-sm font-semibold text-foreground">Internal account</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Usage is tracked but not billed. No subscription or payment applies to this
            account.
          </p>
        </div>
      )}

      <Panel
        title="Plan & billing"
        desc="Manage your plan, usage, and billing."
      >
        {active && (
          <ReadOnlyRow label="Account" value={active.name} />
        )}
        <SettingRow label="Plan" desc="Your current tier.">
          <span
            data-testid="billing-tier"
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
          >
            {tier}
          </span>
        </SettingRow>

        {billing.usage && taskUsage.available ? (
          <SettingRow
            label="Task usage"
            desc={
              resetsOn
                ? `This billing period — resets ${resetsOn}.`
                : "This billing period."
            }
          >
            <span className="flex flex-col items-end gap-0.5 text-sm">
              <span data-testid="billing-usage" className="font-medium text-foreground">
                {taskUsage.used} / {taskUsage.limit} tasks
              </span>
              <span
                data-testid="billing-usage-remaining"
                className={
                  taskUsage.overLimit || taskUsage.nearLimit
                    ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                    : "text-xs text-muted-foreground"
                }
              >
                {taskUsage.overLimit
                  ? resetsOn
                    ? `No tasks left. Resets ${resetsOn}`
                    : "No tasks left this period"
                  : taskUsage.nearLimit
                    ? `Running low: ${taskUsage.remaining} left (${taskUsage.percentUsed}% used)`
                    : `${taskUsage.remaining} remaining (${taskUsage.percentUsed}% used)`}
              </span>
            </span>
          </SettingRow>
        ) : (
          <ReadOnlyRow
            label="Task usage"
            value={
              <span data-testid="billing-usage-unavailable" className="text-muted-foreground">
                Usage unavailable
              </span>
            }
          />
        )}

        {billing.aiCredits && aiCreditsUsage.available ? (
          <SettingRow
            label="AI credits"
            desc={
              aiCreditsResetsOn
                ? `Paid AI features (Builder AI Q&A / Explain) — resets ${aiCreditsResetsOn}. Checks stay free.`
                : "Paid AI features (Builder AI Q&A / Explain). Deterministic checks stay free."
            }
          >
            <span className="flex flex-col items-end gap-0.5 text-sm">
              <span data-testid="billing-ai-credits" className="font-medium text-foreground">
                {aiCreditsUsage.used} / {aiCreditsUsage.limit} credits
              </span>
              <span
                data-testid="billing-ai-credits-remaining"
                className={
                  aiCreditsUsage.overLimit || aiCreditsUsage.nearLimit
                    ? "text-xs font-medium text-amber-600 dark:text-amber-400"
                    : "text-xs text-muted-foreground"
                }
              >
                {aiCreditsUsage.overLimit
                  ? aiCreditsResetsOn
                    ? `No AI credits left. Resets ${aiCreditsResetsOn}`
                    : "No AI credits left this period"
                  : aiCreditsUsage.nearLimit
                    ? `Running low: ${aiCreditsUsage.remaining} left (${aiCreditsUsage.percentUsed}% used)`
                    : `${aiCreditsUsage.remaining} remaining (${aiCreditsUsage.percentUsed}% used)`}
              </span>
            </span>
          </SettingRow>
        ) : (
          billing.aiCredits === null && (
            <ReadOnlyRow
              label="AI credits"
              value={
                <span
                  data-testid="billing-ai-credits-unavailable"
                  className="text-muted-foreground"
                >
                  Usage unavailable
                </span>
              }
            />
          )
        )}

        {/* BILLING-USAGE-VISIBILITY-1 — make it explicit that the counts above are the
            ACCOUNT's shared usage, not the current user's personal usage. True for
            personal (one member) and shared (team/business) accounts alike. */}
        {taskUsage.available && (
          <p data-testid="billing-usage-scope-note" className="text-[11px] text-muted-foreground">
            Usage is counted at the account level and shared by everyone in this account,
            not tracked per member.
          </p>
        )}

        {billing.memberLimit !== null && (
          <ReadOnlyRow
            label="Members"
            desc="Billed as one account with shared usage."
            value={
              <span data-testid="billing-members">
                {billing.memberCount != null ? `${billing.memberCount} of ` : "Up to "}
                {billing.memberLimit} members
              </span>
            }
          />
        )}

        <ReadOnlyRow
          label="Folders"
          value={<span data-testid="billing-folders">Up to {billing.folderLimit} folders</span>}
        />

        {isShared && (
          <SettingRow label="Seats" stacked>
            <p data-testid="billing-no-pro-copy" className="text-xs text-muted-foreground">
              Team and Business are billed as one account with shared usage —
              members don&apos;t need their own Pro.
            </p>
          </SettingRow>
        )}

        {periodEnd ? (
          <ReadOnlyRow
            label={periodEnd.kind === "renews" ? "Renews on" : "Access ends"}
            value={
              <span data-testid="billing-period-end" data-kind={periodEnd.kind}>
                {formatDate(periodEnd.iso)}
              </span>
            }
          />
        ) : null}

        {showPersonalPlan && accountId && (
          <SettingRow label="Personal plan" stacked>
            <PersonalPlanPanel accountId={accountId} frozen={billing.frozen} />
          </SettingRow>
        )}

        {showPersonalUpgrade && accountId && (
          <SettingRow label="Upgrade plan" stacked>
            <PersonalUpgradePanel accountId={accountId} frozen={billing.frozen} />
          </SettingRow>
        )}

        {showBusinessUpgrade && accountId && (
          <SettingRow label="Upgrade plan" stacked>
            <BusinessUpgradePanel
              accountId={accountId}
              personalAccountId={billing.personalAccountId ?? accountId}
              frozen={billing.frozen}
            />
          </SettingRow>
        )}

        {showManageBilling && accountId && (
          <SettingRow label="Billing" desc="Update payment method, view invoices, or cancel.">
            <ManageBillingButton accountId={accountId} frozen={billing.frozen} />
          </SettingRow>
        )}

        {showBusinessDowngrade && accountId && (
          <SettingRow label="Downgrade plan" stacked>
            <BusinessDowngradePanel accountId={accountId} frozen={billing.frozen} />
          </SettingRow>
        )}

        {/* When the portal is available it covers payment method + invoices — don't
            contradict it with "coming soon" rows. */}
        {!showManageBilling && (
          <>
            <ComingSoonRow label="Payment method" desc="Manage your card — coming soon." />
            <ComingSoonRow label="Invoices" desc="Download past invoices — coming soon." />
          </>
        )}
        {!billing.frozen && !showBusinessUpgrade && !showPersonalUpgrade && (
          <ComingSoonRow
            label="Upgrade or change plan"
            desc="Checkout and plan changes — coming soon."
          />
        )}
        {!periodEnd && (
          <ComingSoonRow label="Next billing date" desc="Available once paid plans launch." />
        )}
      </Panel>
    </div>
  );
}
