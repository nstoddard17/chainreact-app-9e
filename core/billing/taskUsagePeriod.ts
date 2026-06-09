/**
 * Pure current-period task-usage view.
 *
 * Mirrors the SQL period anchor `account_billing_period_start`
 * (supabase/migrations/20260620000000_lazy_task_period_rollover.sql) so the UI
 * shows the SAME effective period the lazy-rollover deduct/reserve RPCs enforce.
 *
 * Billing periods are anchored to `account_billing.period_started_at` (NOT the
 * calendar month) and roll monthly. Rollover is LAZY: the deduct/reserve RPC
 * resets `tasks_used`/`tasks_reserved` and advances the anchor on the next
 * billing mutation — so a stored row whose period has already elapsed still
 * carries LAST period's `tasks_used` until the next run. Reading the raw row
 * would make a monthly cap look like a lifetime cap.
 *
 * This helper computes the EFFECTIVE current-period view from the original
 * anchor + "now": if the period has elapsed, effective used is 0 (exactly what
 * the next deduct will reset it to) and the anchor advances to the current
 * period. So the displayed "X / Y tasks", "N remaining", and "resets <date>"
 * always reflect what the user can actually do right now — no pre-mutation
 * display mismatch.
 *
 * Pure: all inputs are passed in (including `now`); no clock read, no I/O.
 * `tasks_reserved` is intentionally NOT part of this view — it is an internal
 * reservation counter (reserve/reconcile is flag-OFF) and is not exposed to
 * the client billing DTO.
 */

export interface TaskUsageView {
  /** Effective current-period tasks used (0 when the stored period has elapsed). */
  tasksUsed: number;
  tasksLimit: number;
  /** max(0, limit − effective used). */
  tasksRemaining: number;
  /** Effective current-period start, ISO; null when the anchor is unknown. */
  periodStart: string | null;
  /** Next reset boundary (current period start + 1 month), ISO; null when unknown. */
  resetsAt: string | null;
  /** True when the stored period had already elapsed (display reflects the pending reset). */
  rolledOver: boolean;
  /** True when no tasks remain in the effective current period. */
  exhausted: boolean;
}

/**
 * Add `n` whole months to a UTC date, clamping the day to the target month's
 * last day (Jan 31 + 1mo → Feb 28/29). Matches Postgres `make_interval(months
 * => n)` semantics used by the SQL anchor helper.
 */
function addMonthsUTC(date: Date, n: number): Date {
  const monthIndex = date.getUTCMonth() + n;
  const targetYear = date.getUTCFullYear() + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Largest monthly anchor `<= now`, computed from the ORIGINAL anchor (advances
 * straight to the current period, never one month at a time). Returns the
 * number of whole months elapsed since the anchor (>= 0). Mirrors the SQL
 * `v_months` computation + the back-off-one-month clamp.
 */
function monthsElapsed(anchor: Date, now: Date): number {
  let months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  if (months < 0) return 0; // anchor in the future (clock skew) → still period 0
  if (addMonthsUTC(anchor, months).getTime() > now.getTime()) months -= 1;
  return months < 0 ? 0 : months;
}

export function computeTaskUsageView(input: {
  tasksUsed: number;
  tasksLimit: number;
  periodStartedAt: string | null;
  now: Date;
}): TaskUsageView {
  const { tasksUsed, tasksLimit, periodStartedAt, now } = input;

  if (periodStartedAt === null) {
    const remaining = Math.max(0, tasksLimit - tasksUsed);
    return {
      tasksUsed,
      tasksLimit,
      tasksRemaining: remaining,
      periodStart: null,
      resetsAt: null,
      rolledOver: false,
      exhausted: remaining <= 0,
    };
  }

  const anchor = new Date(periodStartedAt);
  if (Number.isNaN(anchor.getTime())) {
    // Unparseable anchor — degrade to a no-period view rather than throw.
    const remaining = Math.max(0, tasksLimit - tasksUsed);
    return {
      tasksUsed,
      tasksLimit,
      tasksRemaining: remaining,
      periodStart: null,
      resetsAt: null,
      rolledOver: false,
      exhausted: remaining <= 0,
    };
  }

  const months = monthsElapsed(anchor, now);
  const periodStart = addMonthsUTC(anchor, months);
  const resetsAt = addMonthsUTC(anchor, months + 1);
  const rolledOver = months >= 1;
  const effectiveUsed = rolledOver ? 0 : tasksUsed;
  const remaining = Math.max(0, tasksLimit - effectiveUsed);

  return {
    tasksUsed: effectiveUsed,
    tasksLimit,
    tasksRemaining: remaining,
    periodStart: periodStart.toISOString(),
    resetsAt: resetsAt.toISOString(),
    rolledOver,
    exhausted: remaining <= 0,
  };
}
