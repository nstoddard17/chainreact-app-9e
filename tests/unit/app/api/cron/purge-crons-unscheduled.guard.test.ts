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
