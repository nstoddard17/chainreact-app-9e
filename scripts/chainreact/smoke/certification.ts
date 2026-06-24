/**
 * Action smoke harness — Provider Action CERTIFICATION matrix (pure core).
 *
 * Durable, version-controlled record of which provider/action smoke fixtures
 * have already passed LIVE verification — so the live runner can SKIP actions
 * already certified `LIVE_PASS` by default and conserve task budget + provider
 * API calls (no re-running a green action every sweep). Re-running is opt-in via
 * `SMOKE_RERUN_PASSED=1` (a regression / release-candidate full sweep).
 *
 * SAFETY — this file is a committed artifact, so it holds SAFE FACTS ONLY:
 *   - the provider/action key,
 *   - a status enum,
 *   - an optional ISO date / git short-commit,
 *   - an optional SHORT sanitized note.
 * It MUST NEVER contain secrets, tokens, selector values (base/table/record/
 * spreadsheet/workbook/team/channel/db/page ids), account ids, run ids, workflow
 * ids, provider payloads, email/message bodies, cell values, Airtable/Notion
 * records, or Teams member PII. A unit test guards this.
 *
 * Pure + dependency-free (same charter as `core.ts`): both the offline CLI and
 * the Jest harness import it without pulling in app/server code.
 */
import { actionKey, type FixtureDescriptor, type RegisteredAction } from "./core";

/**
 * Certification status for one provider/action.
 *   - LIVE_PASS       — passed LIVE verification; SKIPPED by default in future
 *                       live runs (re-run only with SMOKE_RERUN_PASSED=1).
 *   - LIVE_NOT_RUN    — has a fixture but never live-verified → runs by default.
 *   - MISSING_FIXTURE — registered action with no fixture yet (a coverage gap).
 *   - BLOCKED_ENV     — could not run live (account/resource/env unavailable) →
 *                       runs by default once the env appears.
 *   - FAIL            — last live run failed → runs by default (re-run after fix).
 *   - BUG             — known bug → runs by default (re-run after fix).
 *   - SANDBOX_REQUIRED — write harness: billingSensitive action that can only be
 *                       live-smoked against a confirmed test-mode/sandbox account.
 *                       Never run live without that account. Never LIVE_PASS.
 *   - UNSAFE_NO_HARNESS — write harness: neverLive action that cannot be safely
 *                       live-smoked (irreversible external effect). Unit/integration
 *                       only. Never run live. Never LIVE_PASS.
 * Only LIVE_PASS is skipped by the default planner; every other status is
 * eligible to run (SANDBOX_REQUIRED / UNSAFE_NO_HARNESS are eligible in the sense
 * that the planner never skips them, but their own gates keep them from running).
 */
export type CertificationStatus =
  | "LIVE_PASS"
  | "LIVE_PASS_CLEANED" // write pilot: created -> verified -> object DELETED (gone)
  | "LIVE_PASS_LEFT_ARTIFACT" // write pilot: created -> verified -> a harmless marked object remains (archived / no delete action)
  | "LIVE_NOT_RUN"
  | "MISSING_FIXTURE"
  | "BLOCKED_ENV"
  | "FAIL"
  | "BUG"
  | "SANDBOX_REQUIRED"
  | "UNSAFE_NO_HARNESS";

/** The three statuses that count as "passed live" (skip-by-default in live runs). */
export const LIVE_PASS_STATUSES: readonly CertificationStatus[] = [
  "LIVE_PASS",
  "LIVE_PASS_CLEANED",
  "LIVE_PASS_LEFT_ARTIFACT",
];

export const CERTIFICATION_STATUSES: readonly CertificationStatus[] = [
  "LIVE_PASS",
  "LIVE_PASS_CLEANED",
  "LIVE_PASS_LEFT_ARTIFACT",
  "LIVE_NOT_RUN",
  "MISSING_FIXTURE",
  "BLOCKED_ENV",
  "FAIL",
  "BUG",
  "SANDBOX_REQUIRED",
  "UNSAFE_NO_HARNESS",
];

/** One durable certification record. Safe facts only (see file header). */
export interface CertificationRecord {
  readonly provider: string;
  readonly action: string;
  readonly status: CertificationStatus;
  /** ISO `yyyy-mm-dd` the status was recorded (safe). */
  readonly date?: string;
  /** Git short commit for context (safe). */
  readonly commit?: string;
  /** Short sanitized note — NEVER ids / values / payloads. */
  readonly note?: string;
}

/**
 * The certification matrix SEED — the durable list of provider/action live-pass
 * records — lives in `certificationSeed.ts` (structure-only split; behavior
 * unchanged). Imported here (the lookups use it as a default arg) AND re-exported
 * so every existing `import { CERTIFICATIONS } from ".../certification"` resolves.
 */
import { CERTIFICATIONS } from "./certificationSeed";
export { CERTIFICATIONS };

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function certificationByKey(
  certs: readonly CertificationRecord[] = CERTIFICATIONS,
): ReadonlyMap<string, CertificationRecord> {
  const map = new Map<string, CertificationRecord>();
  for (const c of certs) map.set(actionKey(c.provider, c.action), c);
  return map;
}

export function getCertification(
  provider: string,
  action: string,
  certs: readonly CertificationRecord[] = CERTIFICATIONS,
): CertificationRecord | undefined {
  return certificationByKey(certs).get(actionKey(provider, action));
}

/** True when the action is certified `LIVE_PASS` (skip-by-default in live runs). */
export function isCertifiedLivePass(
  provider: string,
  action: string,
  certs: readonly CertificationRecord[] = CERTIFICATIONS,
): boolean {
  const status = getCertification(provider, action, certs)?.status;
  return status !== undefined && LIVE_PASS_STATUSES.includes(status);
}

/**
 * True when the action is a KNOWN-FAILING certification (`FAIL` or `BUG`). The
 * live runner uses this to surface known failures SEPARATELY from unexpected
 * regressions: a known FAIL/BUG still runs (eligible) and still reports FAIL in
 * the human report, but it does not flip the "no unexpected fails" gate. Re-verify
 * after a fix (then move it to LIVE_PASS).
 */
export function isCertifiedFailing(
  provider: string,
  action: string,
  certs: readonly CertificationRecord[] = CERTIFICATIONS,
): boolean {
  const status = getCertification(provider, action, certs)?.status;
  return status === "FAIL" || status === "BUG";
}

/**
 * The default live-run planner decision for ONE action: should it be
 * CERTIFIED-SKIPPED? Only `LIVE_PASS` actions are skipped, and only when NOT
 * doing an explicit rerun sweep. Never skips for any other status (so
 * LIVE_NOT_RUN / MISSING_FIXTURE / BLOCKED_ENV / FAIL / BUG all stay eligible).
 */
export function shouldCertifiedSkip(
  provider: string,
  action: string,
  rerunPassed: boolean,
  certs: readonly CertificationRecord[] = CERTIFICATIONS,
): boolean {
  if (rerunPassed) return false;
  return isCertifiedLivePass(provider, action, certs);
}

// ─── Certification matrix (enumerates ALL registered actions) ────────────────

export interface CertificationMatrixRow {
  readonly provider: string;
  readonly action: string;
  /** Explicit cert status, else derived (fixture → LIVE_NOT_RUN; none → MISSING_FIXTURE). */
  readonly status: CertificationStatus;
  readonly hasFixture: boolean;
  /** True when the status came from an explicit record (vs derived). */
  readonly explicit: boolean;
  readonly date: string | null;
  readonly commit: string | null;
  readonly note: string | null;
}

export interface CertificationProviderTotals {
  readonly provider: string;
  readonly registered: number;
  /** Sum of LIVE_PASS + LIVE_PASS_CLEANED + LIVE_PASS_LEFT_ARTIFACT. */
  readonly livePass: number;
  readonly liveNotRun: number;
  readonly missingFixture: number;
  readonly blockedEnv: number;
  readonly fail: number;
  readonly bug: number;
  readonly sandboxRequired: number;
  readonly unsafeNoHarness: number;
}

export interface CertificationMatrix {
  readonly rows: readonly CertificationMatrixRow[];
  readonly perProvider: readonly CertificationProviderTotals[];
  readonly totals: {
    readonly registered: number;
    readonly livePass: number;
    readonly liveNotRun: number;
    readonly missingFixture: number;
    readonly blockedEnv: number;
    readonly fail: number;
    readonly bug: number;
    readonly sandboxRequired: number;
    readonly unsafeNoHarness: number;
  };
  /** Cert records whose key is NOT a registered action (stale — surface, don't crash). */
  readonly staleCerts: readonly string[];
  readonly providerFilter: string | null;
}

export interface BuildCertificationMatrixOptions {
  readonly providerFilter?: string | null;
}

/**
 * Cross-reference EVERY registered action against the fixtures + the
 * certification seed. Pure: callers supply both lists (the offline CLI reads
 * them as text; the Jest harness reads the real registry). Enumerates all
 * registered actions so coverage gaps (`MISSING_FIXTURE`) stay visible.
 */
export function buildCertificationMatrix(
  registered: readonly RegisteredAction[],
  fixtures: readonly FixtureDescriptor[],
  certs: readonly CertificationRecord[] = CERTIFICATIONS,
  options: BuildCertificationMatrixOptions = {},
): CertificationMatrix {
  const providerFilter = options.providerFilter ?? null;
  const fixtureKeys = new Set(fixtures.map((f) => actionKey(f.provider, f.action)));
  const certByKey = certificationByKey(certs);
  const registeredKeys = new Set(registered.map((r) => actionKey(r.provider, r.action)));

  const rows: CertificationMatrixRow[] = [];
  for (const reg of registered) {
    if (providerFilter && reg.provider !== providerFilter) continue;
    const key = actionKey(reg.provider, reg.action);
    const hasFixture = fixtureKeys.has(key);
    const explicit = certByKey.get(key);
    const status: CertificationStatus = explicit
      ? explicit.status
      : hasFixture
        ? "LIVE_NOT_RUN"
        : "MISSING_FIXTURE";
    rows.push({
      provider: reg.provider,
      action: reg.action,
      status,
      hasFixture,
      explicit: explicit !== undefined,
      date: explicit?.date ?? null,
      commit: explicit?.commit ?? null,
      note: explicit?.note ?? null,
    });
  }
  rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.action.localeCompare(b.action));

  const byProvider = new Map<string, CertificationProviderTotals>();
  for (const row of rows) {
    const cur = byProvider.get(row.provider) ?? {
      provider: row.provider,
      registered: 0,
      livePass: 0,
      liveNotRun: 0,
      missingFixture: 0,
      blockedEnv: 0,
      fail: 0,
      bug: 0,
      sandboxRequired: 0,
      unsafeNoHarness: 0,
    };
    byProvider.set(row.provider, {
      provider: row.provider,
      registered: cur.registered + 1,
      livePass: cur.livePass + (LIVE_PASS_STATUSES.includes(row.status) ? 1 : 0),
      liveNotRun: cur.liveNotRun + (row.status === "LIVE_NOT_RUN" ? 1 : 0),
      missingFixture: cur.missingFixture + (row.status === "MISSING_FIXTURE" ? 1 : 0),
      blockedEnv: cur.blockedEnv + (row.status === "BLOCKED_ENV" ? 1 : 0),
      fail: cur.fail + (row.status === "FAIL" ? 1 : 0),
      bug: cur.bug + (row.status === "BUG" ? 1 : 0),
      sandboxRequired: cur.sandboxRequired + (row.status === "SANDBOX_REQUIRED" ? 1 : 0),
      unsafeNoHarness: cur.unsafeNoHarness + (row.status === "UNSAFE_NO_HARNESS" ? 1 : 0),
    });
  }

  const count = (s: CertificationStatus) => rows.filter((r) => r.status === s).length;
  const countLivePass = rows.filter((r) => LIVE_PASS_STATUSES.includes(r.status)).length;
  const staleCerts = certs
    .map((c) => actionKey(c.provider, c.action))
    .filter((k) => !registeredKeys.has(k))
    .sort();

  return {
    rows,
    perProvider: [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
    totals: {
      registered: rows.length,
      livePass: countLivePass,
      liveNotRun: count("LIVE_NOT_RUN"),
      missingFixture: count("MISSING_FIXTURE"),
      blockedEnv: count("BLOCKED_ENV"),
      fail: count("FAIL"),
      bug: count("BUG"),
      sandboxRequired: count("SANDBOX_REQUIRED"),
      unsafeNoHarness: count("UNSAFE_NO_HARNESS"),
    },
    staleCerts,
    providerFilter,
  };
}

// ─── Renderers ───────────────────────────────────────────────────────────────

export function renderCertificationJson(matrix: CertificationMatrix): string {
  return JSON.stringify(
    {
      kind: "certification",
      providerFilter: matrix.providerFilter,
      totals: matrix.totals,
      perProvider: matrix.perProvider,
      rows: matrix.rows,
      staleCerts: matrix.staleCerts,
    },
    null,
    2,
  );
}

const CERT_LABEL: Record<CertificationStatus, string> = {
  LIVE_PASS: "LIVE_PASS",
  LIVE_PASS_CLEANED: "PASS_CLEAN",
  LIVE_PASS_LEFT_ARTIFACT: "PASS_ARTIFACT",
  LIVE_NOT_RUN: "NOT_RUN",
  MISSING_FIXTURE: "MISSING",
  BLOCKED_ENV: "BLOCKED",
  FAIL: "FAIL",
  BUG: "BUG",
  SANDBOX_REQUIRED: "SANDBOX",
  UNSAFE_NO_HARNESS: "UNSAFE",
};

export function renderCertificationHuman(matrix: CertificationMatrix): string {
  const lines: string[] = [];
  lines.push("Action smoke — provider action certification matrix");
  const scope = matrix.providerFilter ? `provider=${matrix.providerFilter}` : "all providers";
  lines.push(`Scope: ${scope}`);
  lines.push("");
  for (const row of matrix.rows) {
    const label = CERT_LABEL[row.status].padEnd(9);
    const date = row.date ? ` (${row.date})` : "";
    const note = row.note ? `  — ${row.note}` : "";
    lines.push(`  ${label} ${row.provider}:${row.action}${date}${note}`);
  }
  lines.push("");
  lines.push("Per-provider (registered / LIVE_PASS / NOT_RUN / MISSING / BLOCKED / FAIL / BUG):");
  for (const p of matrix.perProvider) {
    lines.push(
      `  ${p.provider}: ${p.registered} / ${p.livePass} / ${p.liveNotRun} / ${p.missingFixture} / ` +
        `${p.blockedEnv} / ${p.fail} / ${p.bug}`,
    );
  }
  lines.push("");
  const t = matrix.totals;
  lines.push(
    `Totals: ${t.registered} registered, ${t.livePass} LIVE_PASS, ${t.liveNotRun} not-run, ` +
      `${t.missingFixture} missing-fixture, ${t.blockedEnv} blocked-env, ${t.fail} fail, ${t.bug} bug, ` +
      `${t.sandboxRequired} sandbox-required, ${t.unsafeNoHarness} unsafe-no-harness.`,
  );
  lines.push(
    "Default live runs SKIP LIVE_PASS actions (CERT-SKIP). Re-run them with SMOKE_RERUN_PASSED=1.",
  );
  if (matrix.staleCerts.length > 0) {
    lines.push("");
    lines.push(`Stale certifications (no registered action — clean up): ${matrix.staleCerts.join(", ")}`);
  }
  return lines.join("\n");
}
