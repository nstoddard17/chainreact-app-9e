/**
 * Action smoke harness — shared PURE core.
 *
 * This module is deliberately dependency-free: no `@/` app imports, no `node:`
 * imports, no filesystem, no network, no execution. It holds the small set of
 * pure functions + types shared between two consumers that live in different
 * runtimes:
 *
 *   1. The offline operator CLI (`chainreact smoke actions`) — reads the handler
 *      inventory + fixtures as TEXT and produces a dry-run inventory. It compiles
 *      to runnable CommonJS via scripts/chainreact/tsconfig.json and MUST NOT pull
 *      in the app runtime (the CLI's standing charter — no execution / no DB / no
 *      network).
 *
 *   2. The Jest execution harness (`tests/smoke-actions/`) — imports this via
 *      `@/scripts/chainreact/smoke/core` and reuses the SAME classification +
 *      report shapes so the dry-run inventory and the real execution report agree
 *      on risk classification, destructive gating, and JSON layout.
 *
 * Keeping this layer pure is what lets both consumers share one source of truth
 * for "what counts as destructive", "what the JSON looks like", and "how totals
 * are computed" without the CLI importing server-only code or a second registry.
 */

export type ActionRisk = "read" | "write" | "destructive";

export const ACTION_RISKS: readonly ActionRisk[] = ["read", "write", "destructive"];

export function isActionRisk(value: unknown): value is ActionRisk {
  return typeof value === "string" && (ACTION_RISKS as readonly string[]).includes(value);
}

/** A real, registered executable action (one (provider, type) handler entry). */
export interface RegisteredAction {
  readonly provider: string;
  readonly action: string;
}

/**
 * The text-extractable subset of a fixture the inventory needs. The full
 * `ActionSmokeFixture` (with config / triggerEvent / expectations) lives in the
 * Jest harness; the offline CLI only parses these three fields from fixture text.
 */
export interface FixtureDescriptor {
  readonly provider: string;
  readonly action: string;
  readonly risk: ActionRisk;
  /** Env var names a REAL execution needs; their absence makes a run SKIP. */
  readonly requiredEnv: readonly string[];
}

export function actionKey(provider: string, action: string): string {
  return `${provider}:${action}`;
}

// ─── Destructive classification (the req #7 safety net) ──────────────────────

/**
 * Leading verbs that denote unambiguous, hard-to-reverse data loss. Kept
 * deliberately CONSERVATIVE: only verbs where mis-classifying as non-destructive
 * is a real safety problem. Reversible-ish operations (`remove_*`, `archive_*`,
 * `cancel_*`, `unsubscribe_*`) are intentionally NOT auto-flagged — the fixture
 * author classifies those by intent. The point of this list is to make it
 * impossible to ship a `delete_*` / `purge_*` fixture marked `read`/`write`.
 */
const OBVIOUSLY_DESTRUCTIVE_VERBS: readonly string[] = [
  "delete",
  "destroy",
  "purge",
  "drop",
  "wipe",
  "revoke",
];

/**
 * True when an action's type LOOKS obviously destructive by its leading verb
 * (e.g. `delete_message`, `purge_records`). Heuristic by design — it is a guard
 * rail, not a classifier. The full risk classification is author-declared in the
 * fixture; this only refuses the dangerous mismatch.
 */
export function classifyObviouslyDestructive(action: string): boolean {
  const head = action.toLowerCase().split(/[_-]/)[0] ?? "";
  return OBVIOUSLY_DESTRUCTIVE_VERBS.includes(head);
}

/**
 * Validate a single fixture descriptor against the real registry + the
 * destructive guard. Returns a list of human-readable violation strings (empty =
 * valid). Shared by the CLI inventory and the Jest fixtures-valid test so both
 * enforce the same rules.
 */
export function validateFixtureDescriptor(
  desc: FixtureDescriptor,
  registeredKeys: ReadonlySet<string>,
): string[] {
  const violations: string[] = [];
  const key = actionKey(desc.provider, desc.action);

  if (!isActionRisk(desc.risk)) {
    violations.push(`${key}: risk "${String(desc.risk)}" is not one of read|write|destructive.`);
  }
  if (!registeredKeys.has(key)) {
    violations.push(`${key}: no registered action handler — fixture targets an unknown action.`);
  }
  if (classifyObviouslyDestructive(desc.action) && desc.risk !== "destructive") {
    violations.push(
      `${key}: action looks destructive (verb "${desc.action.split(/[_-]/)[0]}") but is classified "${desc.risk}". ` +
        `Set risk: "destructive" (it requires --include-destructive to run).`,
    );
  }
  return violations;
}

// ─── Dry-run inventory ───────────────────────────────────────────────────────

export type InventoryStatus = "fixture-backed" | "missing-fixture" | "skipped";

export interface InventoryRow {
  readonly provider: string;
  readonly action: string;
  readonly status: InventoryStatus;
  readonly risk: ActionRisk | null;
  /** True when the fixture declares env it needs to actually run. */
  readonly envGated: boolean;
  readonly requiredEnv: readonly string[];
  /** Present when status is "skipped" (or a fixture-backed env note). */
  readonly note: string | null;
}

export interface ProviderTotals {
  readonly provider: string;
  readonly registered: number;
  readonly fixtureBacked: number;
  readonly missingFixture: number;
  readonly skipped: number;
}

export interface InventoryReport {
  readonly rows: readonly InventoryRow[];
  readonly perProvider: readonly ProviderTotals[];
  readonly totals: {
    readonly registered: number;
    readonly fixtureBacked: number;
    readonly missingFixture: number;
    readonly skipped: number;
  };
  readonly violations: readonly string[];
  readonly providerFilter: string | null;
  readonly includeDestructive: boolean;
}

export interface BuildInventoryOptions {
  readonly providerFilter?: string | null;
  readonly includeDestructive?: boolean;
  /** When set, restrict to these (provider:action) keys (used by --changed). */
  readonly onlyKeys?: ReadonlySet<string> | null;
}

/**
 * Cross-reference the real registered actions against the fixtures on disk and
 * produce the dry-run inventory. Pure: callers supply both lists. Deterministic
 * ordering (provider asc, action asc) so JSON + snapshots are stable.
 */
export function buildInventory(
  registered: readonly RegisteredAction[],
  fixtures: readonly FixtureDescriptor[],
  options: BuildInventoryOptions = {},
): InventoryReport {
  const providerFilter = options.providerFilter ?? null;
  const includeDestructive = options.includeDestructive ?? false;
  const onlyKeys = options.onlyKeys ?? null;

  const registeredKeys = new Set(registered.map((r) => actionKey(r.provider, r.action)));
  const fixtureByKey = new Map<string, FixtureDescriptor>();
  for (const f of fixtures) fixtureByKey.set(actionKey(f.provider, f.action), f);

  const matches = (provider: string, action: string): boolean => {
    if (providerFilter && provider !== providerFilter) return false;
    if (onlyKeys && !onlyKeys.has(actionKey(provider, action))) return false;
    return true;
  };

  const rows: InventoryRow[] = [];
  for (const reg of registered) {
    if (!matches(reg.provider, reg.action)) continue;
    const key = actionKey(reg.provider, reg.action);
    const fixture = fixtureByKey.get(key);

    if (!fixture) {
      rows.push({
        provider: reg.provider,
        action: reg.action,
        status: "missing-fixture",
        risk: null,
        envGated: false,
        requiredEnv: [],
        note: null,
      });
      continue;
    }

    const envGated = fixture.requiredEnv.length > 0;
    if (fixture.risk === "destructive" && !includeDestructive) {
      rows.push({
        provider: reg.provider,
        action: reg.action,
        status: "skipped",
        risk: fixture.risk,
        envGated,
        requiredEnv: fixture.requiredEnv,
        note: "destructive — pass --include-destructive to run",
      });
      continue;
    }

    rows.push({
      provider: reg.provider,
      action: reg.action,
      status: "fixture-backed",
      risk: fixture.risk,
      envGated,
      requiredEnv: fixture.requiredEnv,
      note: envGated
        ? `requires env: ${fixture.requiredEnv.join(", ")} (skips at run time if unset)`
        : null,
    });
  }

  rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.action.localeCompare(b.action));

  // Per-provider totals (over the FILTERED rows).
  const byProvider = new Map<string, ProviderTotals>();
  for (const row of rows) {
    const cur = byProvider.get(row.provider) ?? {
      provider: row.provider,
      registered: 0,
      fixtureBacked: 0,
      missingFixture: 0,
      skipped: 0,
    };
    const next: ProviderTotals = {
      provider: row.provider,
      registered: cur.registered + 1,
      fixtureBacked: cur.fixtureBacked + (row.status === "fixture-backed" ? 1 : 0),
      missingFixture: cur.missingFixture + (row.status === "missing-fixture" ? 1 : 0),
      skipped: cur.skipped + (row.status === "skipped" ? 1 : 0),
    };
    byProvider.set(row.provider, next);
  }
  const perProvider = [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider));

  // Validation runs over ALL fixtures (not just the filtered view) so a bad
  // fixture for another provider still surfaces — it is a repo-wide guard.
  const violations: string[] = [];
  for (const f of fixtures) {
    violations.push(...validateFixtureDescriptor(f, registeredKeys));
  }

  return {
    rows,
    perProvider,
    totals: {
      registered: rows.length,
      fixtureBacked: rows.filter((r) => r.status === "fixture-backed").length,
      missingFixture: rows.filter((r) => r.status === "missing-fixture").length,
      skipped: rows.filter((r) => r.status === "skipped").length,
    },
    violations: violations.sort(),
    providerFilter,
    includeDestructive,
  };
}

// ─── Renderers (shared JSON shape) ───────────────────────────────────────────

export function renderInventoryJson(report: InventoryReport): string {
  // Stable key order for deterministic, machine-readable output.
  return JSON.stringify(
    {
      mode: "inventory",
      providerFilter: report.providerFilter,
      includeDestructive: report.includeDestructive,
      totals: report.totals,
      perProvider: report.perProvider,
      rows: report.rows,
      violations: report.violations,
    },
    null,
    2,
  );
}

const STATUS_LABEL: Record<InventoryStatus, string> = {
  "fixture-backed": "FIXTURE",
  "missing-fixture": "MISSING",
  skipped: "SKIP",
};

export function renderInventoryHuman(report: InventoryReport): string {
  const lines: string[] = [];
  lines.push("Action smoke — dry-run inventory");
  const scope = report.providerFilter ? `provider=${report.providerFilter}` : "all providers";
  lines.push(`Scope: ${scope}${report.includeDestructive ? " (incl. destructive)" : ""}`);
  lines.push("");

  if (report.rows.length === 0) {
    lines.push("No registered actions matched the current scope.");
  } else {
    for (const row of report.rows) {
      const label = STATUS_LABEL[row.status].padEnd(7);
      const riskTag = row.risk ? ` [${row.risk}]` : "";
      const note = row.note ? `  — ${row.note}` : "";
      lines.push(`  ${label} ${row.provider}:${row.action}${riskTag}${note}`);
    }
  }

  lines.push("");
  lines.push("Per-provider totals (registered / fixture / missing / skipped):");
  for (const p of report.perProvider) {
    lines.push(
      `  ${p.provider}: ${p.registered} / ${p.fixtureBacked} / ${p.missingFixture} / ${p.skipped}`,
    );
  }

  lines.push("");
  lines.push(
    `Totals: ${report.totals.registered} registered, ${report.totals.fixtureBacked} fixture-backed, ` +
      `${report.totals.missingFixture} missing, ${report.totals.skipped} skipped.`,
  );

  if (report.violations.length > 0) {
    lines.push("");
    lines.push(`Fixture violations (${report.violations.length}):`);
    for (const v of report.violations) lines.push(`  ✗ ${v}`);
  }

  lines.push("");
  lines.push(
    "Execution is not run here (the CLI is offline by charter). To actually run",
  );
  lines.push(
    "fixture-backed actions through real V2 internals: npm test -- tests/integration/smoke-actions",
  );
  return lines.join("\n");
}

// ─── Execution report (shared by the Jest harness) ───────────────────────────

export type SmokeOutcome = "pass" | "fail" | "skip";

/**
 * Which runtime executed the fixture:
 *   - "handler"        — fast handler-dispatch mode (strict resolve -> real
 *                        handler, injectable provider boundary). No workflow / DB.
 *   - "workflow-test"  — full manual run-now mode in engine TEST mode (external
 *                        and destructive handlers are blocked by testModeGate).
 *   - "workflow-live"  — full manual run-now mode in REAL mode (external provider
 *                        handlers actually run). Opt-in + heavily gated.
 */
export type SmokeMode = "handler" | "workflow-test" | "workflow-live";

/**
 * What boundary the provider handler hit on this run:
 *   - "blocked" — engine test mode short-circuited the external handler (no call).
 *   - "mocked"  — a fake/injected boundary stood in for the provider (unit tests).
 *   - "live"    — the real provider handler ran against the real API.
 */
export type ProviderBoundary = "blocked" | "mocked" | "live";

export interface SmokeResult {
  readonly provider: string;
  readonly action: string;
  readonly risk: ActionRisk;
  readonly outcome: SmokeOutcome;
  /** Skip / fail reason (null on pass). Always sanitized — never carries secrets. */
  readonly reason: string | null;
  /** Run id when an execution produced one (null otherwise). */
  readonly runId: string | null;
  /** Temporary workflow id (workflow mode only; null otherwise). */
  readonly workflowId?: string | null;
  /** Which provider boundary this result used. */
  readonly providerBoundary?: ProviderBoundary;
}

/**
 * Redact secret-shaped substrings + bound the length of any reason that may have
 * passed through provider-derived text. Defense-in-depth: the harness already
 * only surfaces humanized titles / engine codes, but a handler error message can
 * carry a provider string, so every reason that touches untrusted text runs
 * through here before it reaches a report. Idempotent.
 */
export function sanitizeFailureReason(reason: string | null): string | null {
  if (reason === null) return null;
  let s = reason;
  // URLs first (signed URLs can embed long tokens we'd otherwise miss).
  s = s.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  // Slack tokens (xoxb-/xoxp-/…), bearer tokens, then any long opaque blob.
  s = s.replace(/xox[abprs]-[A-Za-z0-9-]+/gi, "[redacted-token]");
  s = s.replace(/\bBearer\s+\S+/gi, "Bearer [redacted-token]");
  s = s.replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]");
  const MAX = 200;
  if (s.length > MAX) s = `${s.slice(0, MAX)}…`;
  return s;
}

export interface ExecutionProviderTotals {
  readonly provider: string;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
}

export interface ExecutionReport {
  readonly mode: SmokeMode;
  readonly results: readonly SmokeResult[];
  readonly perProvider: readonly ExecutionProviderTotals[];
  readonly totals: { readonly pass: number; readonly fail: number; readonly skip: number };
  /** True when there were zero FAIL results (the smoke gate). */
  readonly ok: boolean;
}

export function buildExecutionReport(
  results: readonly SmokeResult[],
  mode: SmokeMode = "handler",
): ExecutionReport {
  const sorted = [...results].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.action.localeCompare(b.action),
  );
  const byProvider = new Map<string, ExecutionProviderTotals>();
  for (const r of sorted) {
    const cur = byProvider.get(r.provider) ?? { provider: r.provider, pass: 0, fail: 0, skip: 0 };
    byProvider.set(r.provider, {
      provider: r.provider,
      pass: cur.pass + (r.outcome === "pass" ? 1 : 0),
      fail: cur.fail + (r.outcome === "fail" ? 1 : 0),
      skip: cur.skip + (r.outcome === "skip" ? 1 : 0),
    });
  }
  const totals = {
    pass: sorted.filter((r) => r.outcome === "pass").length,
    fail: sorted.filter((r) => r.outcome === "fail").length,
    skip: sorted.filter((r) => r.outcome === "skip").length,
  };
  return {
    mode,
    results: sorted,
    perProvider: [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider)),
    totals,
    ok: totals.fail === 0,
  };
}

export function renderExecutionJson(report: ExecutionReport): string {
  return JSON.stringify(
    {
      kind: "execution",
      mode: report.mode,
      ok: report.ok,
      totals: report.totals,
      perProvider: report.perProvider,
      results: report.results,
    },
    null,
    2,
  );
}

const OUTCOME_LABEL: Record<SmokeOutcome, string> = {
  pass: "PASS",
  fail: "FAIL",
  skip: "SKIP",
};

export function renderExecutionHuman(report: ExecutionReport): string {
  const lines: string[] = [];
  lines.push(`Action smoke — execution report (mode: ${report.mode})`);
  lines.push("");
  for (const r of report.results) {
    const label = OUTCOME_LABEL[r.outcome].padEnd(5);
    const boundary = r.providerBoundary ? ` {${r.providerBoundary}}` : "";
    const reason = r.reason ? `  — ${r.reason}` : "";
    const ids = [
      r.workflowId ? `wf ${r.workflowId}` : null,
      r.runId ? `run ${r.runId}` : null,
    ].filter(Boolean);
    const idTag = ids.length > 0 ? `  (${ids.join(", ")})` : "";
    lines.push(`  ${label} ${r.provider}:${r.action} [${r.risk}]${boundary}${reason}${idTag}`);
  }
  lines.push("");
  lines.push("Per-provider totals (pass / fail / skip):");
  for (const p of report.perProvider) {
    lines.push(`  ${p.provider}: ${p.pass} / ${p.fail} / ${p.skip}`);
  }
  lines.push("");
  lines.push(
    `Totals: ${report.totals.pass} pass, ${report.totals.fail} fail, ${report.totals.skip} skip. ` +
      `Gate: ${report.ok ? "OK" : "FAILED"}.`,
  );
  return lines.join("\n");
}
