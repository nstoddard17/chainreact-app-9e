"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  AccountUsageSummary,
  UsageDimensionSummary,
} from "@/core/billing/accountUsageSummary";

/**
 * Header usage meter (Slice HEADER-USAGE-VISIBILITY-1).
 *
 * Compact top-bar readout of the ACTIVE account's remaining workflow tasks and
 * AI credits this billing period — the "task-usage progress meter" the original
 * top-bar design called for, shippable now that both pools are real
 * (`account_billing` tasks + AI credits). Self-fetches `GET /api/account/usage`
 * on mount (the AccountSwitcher idiom — no per-page prop threading), which
 * returns the same `computeAccountUsageSummary` shape Account Settings renders,
 * so the header can never disagree with the billing page.
 *
 * Honest by construction: renders NOTHING until real data arrives, and a
 * dimension renders only when `available` — a failed fetch / missing billing
 * row shows no meter, never faked zeros. Near-limit (≥80%) and exhausted
 * dimensions go amber. The whole control links to Plan & billing for detail.
 * Account switches reload the page (useAccountSwitcher), which re-fetches.
 */

interface UsageResponse {
  usage?: AccountUsageSummary;
}

function meterTitle(usage: AccountUsageSummary): string {
  const parts: string[] = [];
  const dim = (label: string, d: UsageDimensionSummary) => {
    const resets = d.resetsAt
      ? ` (resets ${new Date(d.resetsAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })})`
      : "";
    parts.push(`${label}: ${d.used} of ${d.limit} used${resets}`);
  };
  if (usage.tasks.available) dim("Tasks", usage.tasks);
  if (usage.aiCredits.available) dim("AI credits", usage.aiCredits);
  if (usage.internalFree) parts.push("Internal account — tracked, not billed");
  return parts.join(" · ");
}

export function UsageMeter() {
  const [usage, setUsage] = useState<AccountUsageSummary | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/usage")
      .then((r) => (r.ok ? (r.json() as Promise<UsageResponse>) : null))
      .then((body) => {
        if (alive && body?.usage) setUsage(body.usage);
      })
      // Fail-quiet: no meter is better than a broken/fake one in the header.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const tasks = usage?.tasks.available ? usage.tasks : null;
  const aiCredits = usage?.aiCredits.available ? usage.aiCredits : null;
  if (!usage || (!tasks && !aiCredits)) return null;

  /*
    RESPONSIVE-FOUNDATION-1 — the meter used to be `hidden … lg:flex`, i.e. below
    1024px the account's remaining usage simply disappeared with no replacement.
    That is a hard cut, not a responsive behaviour, and it hides exactly the
    information a user near their limit needs.

    Two presentations of the SAME fetched data now render, and CSS picks one — no
    second fetch, no duplicated state, no viewport JavaScript in the shell:

      >= lg   the full labelled bars, unchanged.
      < lg    a compact pill showing the SMALLEST remaining pool as a number,
              because "what am I about to run out of?" is the only question the
              bar answers at a glance. It keeps the same link, the same tooltip
              (every dimension, in full) and the same amber near-limit signal.

    The primary/critical dimension is chosen by lowest remaining headroom rather
    than by hard-coding Tasks, so an account that exhausts AI credits first still
    sees the number that matters.
  */
  const critical = pickCriticalDimension(tasks, aiCredits);

  return (
    <>
      <Link
        href="/account?section=billing"
        data-testid="usage-meter"
        title={meterTitle(usage)}
        aria-label="Account usage — open plan and billing"
        className="hidden shrink-0 items-center gap-3 rounded-md border border-border bg-background px-2.5 py-1.5 hover:border-foreground/30 lg:flex"
      >
        {tasks && <MeterSegment label="Tasks" dim={tasks} testId="usage-meter-tasks" />}
        {aiCredits && (
          <MeterSegment label="AI" dim={aiCredits} testId="usage-meter-ai" />
        )}
      </Link>
      {critical && (
        <Link
          href="/account?section=billing"
          data-testid="usage-meter-compact"
          data-dimension={critical.key}
          title={meterTitle(usage)}
          aria-label={`Account usage — ${critical.dim.remaining.toLocaleString()} ${critical.label} left. Open plan and billing`}
          className={
            "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums lg:hidden " +
            (critical.dim.nearLimit || critical.dim.overLimit
              ? "border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border bg-background text-muted-foreground hover:border-foreground/30")
          }
        >
          <span aria-hidden>{critical.short}</span>
          <span>{critical.dim.remaining.toLocaleString()}</span>
        </Link>
      )}
    </>
  );
}

/**
 * The dimension a narrow header should surface: whichever pool the account is
 * closest to exhausting. Ties and single-dimension accounts fall back to
 * whichever is available, so the compact pill is never empty when the full meter
 * would have rendered something.
 */
function pickCriticalDimension(
  tasks: UsageDimensionSummary | null,
  aiCredits: UsageDimensionSummary | null,
): { key: "tasks" | "ai"; label: string; short: string; dim: UsageDimensionSummary } | null {
  const candidates: Array<{
    key: "tasks" | "ai";
    label: string;
    short: string;
    dim: UsageDimensionSummary;
  }> = [];
  if (tasks) candidates.push({ key: "tasks", label: "tasks", short: "Tasks", dim: tasks });
  if (aiCredits) candidates.push({ key: "ai", label: "AI credits", short: "AI", dim: aiCredits });
  if (candidates.length === 0) return null;
  return candidates.reduce((worst, next) =>
    next.dim.percentUsed > worst.dim.percentUsed ? next : worst,
  );
}

function MeterSegment({
  label,
  dim,
  testId,
}: {
  label: string;
  dim: UsageDimensionSummary;
  testId: string;
}) {
  const warn = dim.nearLimit || dim.overLimit;
  return (
    <span data-testid={testId} className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className="h-1 w-14 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={dim.percentUsed}
      >
        <span
          className={
            warn ? "block h-full rounded-full bg-amber-500" : "block h-full rounded-full bg-primary"
          }
          style={{ width: `${dim.percentUsed}%` }}
        />
      </span>
      <span
        data-testid={`${testId}-remaining`}
        className={
          warn
            ? "whitespace-nowrap text-[10px] font-semibold text-amber-600 dark:text-amber-400"
            : "whitespace-nowrap text-[10px] text-muted-foreground"
        }
      >
        {dim.remaining.toLocaleString()} left
      </span>
    </span>
  );
}
