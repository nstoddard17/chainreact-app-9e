/**
 * @jest-environment node
 *
 * V2-READY-38 — destructive-purge scheduling tripwire.
 *
 * The three purge crons permanently DELETE or ANONYMIZE user / account /
 * workflow / billing data. Unlike the janitorial reconcilers (sweep-stale-runs,
 * cleanup-workflow-files), they MUST NOT be auto-scheduled in `vercel.json`
 * until a deliberate production + legal/ops decision is made (see
 * docs/slices/phase-4/readiness/v2-ready-38-purge-cron-audit.md). They are
 * flag-gated OFF by default; pre-wiring a schedule would couple "the schedule
 * exists" with "someone flips the flag" — exactly what we want to avoid for
 * destructive automation on real customer data.
 *
 * This test fails LOUDLY if any of them is added to `vercel.json`. If you are
 * intentionally enabling one (per the re-enable checklist in the audit doc),
 * remove its path here AND add a normal schedule guard for it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DESTRUCTIVE_PURGE_PATHS = [
  "/api/cron/purge-pending-deletions",
  "/api/cron/purge-trashed-workflows",
  "/api/cron/purge-anonymized-ledgers",
] as const;

function readCronPaths(): string[] {
  const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  const crons =
    (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
  return crons.map((c) => c.path);
}

describe("destructive purge crons are NOT scheduled in vercel.json (V2-READY-38)", () => {
  it.each(DESTRUCTIVE_PURGE_PATHS)(
    "does not auto-schedule %s (flag-gated, deliberate enable only)",
    (path) => {
      expect(readCronPaths()).not.toContain(path);
    },
  );
});

/**
 * ACCOUNT-BILLING-LIFECYCLE-2 — the counterpart guard.
 *
 * The durable retry for "we froze the account but Stripe was unreachable" MUST be scheduled,
 * or a departing customer keeps being charged indefinitely. It deliberately lives on its own
 * route rather than on `purge-pending-deletions`, precisely so that scheduling it does not
 * weaken the V2-READY-38 tripwire above: the scheduled route is structurally incapable of
 * purging (see `reconcile-deletion-billing.route.test.ts` → "structurally non-destructive").
 */
const RECONCILE_PATH = "/api/cron/reconcile-deletion-billing";

describe("the non-destructive billing reconciliation cron IS scheduled", () => {
  it("appears in vercel.json exactly once", () => {
    const paths = readCronPaths();
    expect(paths.filter((p) => p === RECONCILE_PATH)).toHaveLength(1);
  });

  it("runs hourly — the documented cadence", () => {
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const crons =
      (JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> }).crons ?? [];
    const entry = crons.find((c) => c.path === RECONCILE_PATH);
    // Hourly bounds "still being billed after a Stripe outage clears" to <= 1 hour, while
    // costing one indexed query per tick that usually returns zero rows.
    expect(entry?.schedule).toBe("0 * * * *");
  });

  it("is a different route from the destructive purge cron", () => {
    // If these ever collapse into one path, scheduling would re-couple "a schedule exists"
    // with "someone flipped the purge flag" — the exact risk V2-READY-38 exists to prevent.
    expect(DESTRUCTIVE_PURGE_PATHS).not.toContain(RECONCILE_PATH);
  });
});
