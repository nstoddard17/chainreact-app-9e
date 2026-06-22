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
  | "LIVE_NOT_RUN"
  | "MISSING_FIXTURE"
  | "BLOCKED_ENV"
  | "FAIL"
  | "BUG"
  | "SANDBOX_REQUIRED"
  | "UNSAFE_NO_HARNESS";

export const CERTIFICATION_STATUSES: readonly CertificationStatus[] = [
  "LIVE_PASS",
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

/** Compact builder for a batch of records that share status/note/date. */
function records(
  status: CertificationStatus,
  note: string,
  date: string,
  keys: readonly (readonly [string, string])[],
): CertificationRecord[] {
  return keys.map(([provider, action]) => ({ provider, action, status, date, note }));
}

const LIVE = "2026-06-20";
const LIVE_AUTODISCOVERY = "2026-06-21";
const SMOKE_WRITE = "2026-06-22";

/**
 * The certification matrix seed. Actions NOT listed here are derived at read
 * time: a registered action with a fixture defaults to `LIVE_NOT_RUN`; one with
 * no fixture defaults to `MISSING_FIXTURE` (a gap). Conservative by design —
 * over-listing `LIVE_PASS` would wrongly skip; under-listing only re-runs (safe).
 *
 * `native:format_transformer` is deliberately NOT certified — it is the
 * always-run baseline that proves the live harness path is real every sweep.
 */
export const CERTIFICATIONS: readonly CertificationRecord[] = [
  ...records("LIVE_PASS", "live read verified", LIVE, [
    ["slack", "list_channels"],
    ["slack", "list_users"],
    ["slack", "list_scheduled_messages"],
    ["slack", "get_channel_info"],
    ["slack", "get_messages"],
    ["slack", "get_user_info"],
    ["slack", "get_thread_messages"],
    ["slack", "get_file_info"],
    ["airtable", "get_base_schema"],
    ["airtable", "get_table_schema"],
    ["airtable", "list_records"],
    ["airtable", "find_record"],
    ["airtable", "get_record"],
    ["google-sheets", "get_sheet_metadata"],
    ["google-sheets", "read_rows"],
    ["google-sheets", "get_cell_value"],
    ["google-sheets", "find_row"],
    ["google-drive", "list_files"],
    ["google-drive", "get_file_metadata"],
    ["google-drive", "search_files"],
    ["gmail", "list_labels"],
    ["gmail", "get_profile"],
    ["gmail", "search_emails"],
    ["microsoft-outlook", "list_folders"],
    ["microsoft-outlook", "get_profile"],
    ["microsoft-outlook", "fetch_emails"],
    ["notion", "search"],
    ["notion", "list_users"],
    ["notion", "query_database"],
    ["notion", "get_page"],
    ["microsoft-teams", "get_channel_details"],
    ["microsoft-teams", "get_team_members"],
    ["microsoft-teams", "list_teams"],
    ["microsoft-teams", "list_channels"],
    ["microsoft-teams", "list_channel_messages"],
    // Excel verified after fixing the get_workbooks OneDrive $filter bug (the
    // failure was an unsupported server-side `$filter` on /drive/root/children,
    // NOT a missing drive — see workbooksList.ts).
    ["microsoft-excel", "get_workbooks"],
    ["microsoft-excel", "get_worksheets"],
    ["microsoft-excel", "read_range"],
    ["microsoft-excel", "read_table_rows"],
    ["microsoft-excel", "find_row"],
  ]),
  ...records("LIVE_PASS", "live write verified (dedicated smoke channel)", LIVE, [
    ["slack", "send_channel_message"],
  ]),
  // Tier-1 selector auto-discovery slice — these read live-verified after the
  // harness gained real connection checks + selector auto-discovery (no manual
  // SMOKE_<PROVIDER>_* selector env needed). Connected providers on the smoke
  // account; selectors auto-discovered from each provider's own list/search APIs.
  ...records("LIVE_PASS", "live read verified (auto-discovered selectors)", LIVE_AUTODISCOVERY, [
    ["hubspot", "get_companies"],
    ["hubspot", "get_contacts"],
    ["hubspot", "get_deals"],
    ["hubspot", "get_line_items"],
    ["hubspot", "get_owners"],
    ["hubspot", "get_products"],
    ["hubspot", "get_tickets"],
    ["dropbox", "list_folder"],
    ["dropbox", "get_file_metadata"],
    ["google-calendar", "list_events"],
    ["google-docs", "get_document"],
    ["mailchimp", "get_campaign"],
    ["mailchimp", "get_campaign_stats"],
    ["mailchimp", "get_subscribers"],
    ["microsoft-onedrive", "list_items"],
    ["microsoft-onenote", "list_notebooks"],
    ["microsoft-onenote", "list_sections"],
    ["microsoft-onenote", "list_pages"],
    ["microsoft-onenote", "get_notebook_details"],
    ["microsoft-onenote", "get_section_details"],
    ["microsoft-onenote", "get_page_content"],
    ["microsoft-outlook-calendar", "list_events"],
    // FB-FIX: was a BUG (live 400 code=100). Root cause was the fixture's default
    // metric `page_impressions`, removed by Meta's 2024 Page Insights deprecation
    // — NOT a selector or permission issue (pageId auto-discovers, read_insights
    // is granted). Switched to the still-valid `page_post_engagements`; now live-
    // verified on the smoke page (day window).
    ["facebook", "get_page_insights"],
    // TIER1-CLEANUP: new option-source pickers let these auto-discover their
    // previously env-only selectors — mailchimp:members (audience→member email),
    // notion:users (workspace user id), notion:pages (search→page/block id). All
    // live-verified after wiring; reuse existing read wrappers, no new transport.
    ["mailchimp", "get_subscriber"],
    ["notion", "get_user"],
    ["notion", "list_comments"],
    // ONEDRIVE-GETFILE-DISCOVERY: get_file's itemId now auto-discovers via the
    // flat `microsoft-onedrive:files` picker (root files first + bounded folder
    // descent), replacing the folder->items cascade that landed on an empty
    // first folder. Live-verified — discovers a real file with no manual env.
    ["microsoft-onedrive", "get_file"],
  ]),
  // SMOKE-WRITE pilot — the write harness is wired + was exercised LIVE (a real
  // create attempt the provider safely rejected, creating nothing). A clean
  // LIVE_PASS is blocked pending a confirmed DEDICATED smoke base/table + the
  // primary-field env, since the configured base is a real working base, not a
  // throwaway. Trello pilot blocked: not connected on the smoke account.
  ...records(
    "BLOCKED_ENV",
    "write pilot wired; needs dedicated smoke base/table + SMOKE_AIRTABLE_TEXT_FIELD",
    SMOKE_WRITE,
    [["airtable", "create_record"]],
  ),
];

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
  return getCertification(provider, action, certs)?.status === "LIVE_PASS";
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
      livePass: cur.livePass + (row.status === "LIVE_PASS" ? 1 : 0),
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
  const staleCerts = certs
    .map((c) => actionKey(c.provider, c.action))
    .filter((k) => !registeredKeys.has(k))
    .sort();

  return {
    rows,
    perProvider: [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
    totals: {
      registered: rows.length,
      livePass: count("LIVE_PASS"),
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
