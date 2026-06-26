/**
 * Action smoke harness — WRITE / DESTRUCTIVE phase orchestrator (pure).
 *
 * Where workflowRun.ts runs ONE action node and reports the terminal run status,
 * a mutating smoke needs a lifecycle: create a throwaway resource, confirm it,
 * then remove it — without ever leaving provider junk, sending to a real
 * destination, charging a customer, or deleting a pre-existing record.
 *
 *   setup    (optional) -> create prerequisite throwaway resource(s); record each
 *                          created object in the resource ledger.
 *   execute             -> run the action under test; capture any created id.
 *   verify   (optional) -> run an already-registered READ action keyed on the
 *                          captured id to confirm the side effect.
 *   cleanup  (always
 *             attempted) -> remove every smoke-owned ledger resource, EVEN when
 *                          execute/verify failed. Reported SEPARATELY; a cleanup
 *                          failure can never be a PASS.
 *
 * Design (mirrors workflowRun.ts):
 *   - Pure over an injected `WriteHarnessDeps.runActionStep` seam, so it
 *     unit-tests fully with fakes. The real account-scoped engine wiring is a
 *     separate, gated dep (not built in the foundation slice).
 *   - REUSES the action registry: setup/verify/cleanup are themselves registered
 *     actions. No bespoke provider transport here.
 *   - The resource ledger is the cleanup authority: a destructive/cleanup step
 *     may ONLY target a smoke-owned ledger id — deleting an arbitrary existing
 *     record is structurally impossible.
 *   - Reporting is status-only: phase outcomes + ledger COUNTS + kind labels.
 *     External ids live in memory only to drive cleanup; never printed/committed.
 *
 * Full contract: docs/slices/phase-4/readiness/write-smoke-harness-design.md.
 */
import {
  sanitizeFailureReason,
  type ProviderBoundary,
  type SmokeResult,
} from "@/scripts/chainreact/smoke/core";
import type {
  ActionSmokeFixture,
  ActionStepSpec,
  WriteHarnessSpec,
  WriteLiveClass,
} from "./contract";
import { effectiveLiveRisk, resolveFixtureConfig } from "./contract";
import { cleanupRetryPolicyFor, runCleanupStepWithRetry } from "./cleanupRetry";

/** Rich runtime status for a mutation smoke. Folds down to a SmokeResult gate. */
export type WriteSmokeStatus =
  | "PASS"
  | "FAIL"
  | "VERIFY_FAILED"
  | "CLEANUP_FAILED"
  | "SKIP"
  | "BLOCKED_ENV" // connected + gated, but a required smoke TARGET env is unset
  | "SANDBOX_REQUIRED"
  | "UNSAFE_NO_HARNESS";

export type PhaseName = "setup" | "execute" | "verify" | "cleanup";
export type PhaseOutcome = "ok" | "failed" | "skipped";

export interface PhaseResult {
  readonly phase: PhaseName;
  readonly outcome: PhaseOutcome;
  /** Sanitized reason (null on ok). Never carries ids / secrets / provider blobs. */
  readonly reason: string | null;
}

/** Ledger summary for the report — COUNTS + kind labels only, never ids. */
export interface LedgerSummary {
  readonly created: number;
  readonly cleaned: number;
  /** Created resources NOT cleaned up (provider junk left behind). */
  readonly leaked: number;
  /** Distinct kind labels of created resources (e.g. ["record"]). */
  readonly kinds: readonly string[];
}

/**
 * What became of the smoke-created object(s):
 *   - "cleaned"  — deleted (gone); the strongest cleanup. -> LIVE_PASS_CLEANED.
 *   - "archived" — a successful archive cleanup ran, but the object PERSISTS
 *                  (reversible). -> LIVE_PASS_LEFT_ARTIFACT.
 *   - "left"     — a harmless smoke object remains (no cleanup, or a best-effort
 *                  cleanup did not run). NOT a "leak". -> LIVE_PASS_LEFT_ARTIFACT.
 *   - "none"     — nothing was created (e.g. the action failed before creating).
 */
export type ArtifactDisposition = "cleaned" | "archived" | "left" | "none";

export interface WriteSmokeResult {
  readonly provider: string;
  readonly action: string;
  readonly liveClass: WriteLiveClass;
  readonly status: WriteSmokeStatus;
  readonly reason: string | null;
  readonly phases: readonly PhaseResult[];
  readonly ledger: LedgerSummary;
  /** What became of the created object — distinguishes cleaned vs harmless artifact. */
  readonly artifact: ArtifactDisposition;
  /** True when planned but no mutating seam was called. */
  readonly dryRun: boolean;
}

/** One smoke-owned resource the run created. The id is in-memory only. */
interface LedgerEntry {
  readonly resourceKey: string;
  readonly provider: string;
  readonly kind: string;
  readonly externalId: string;
  readonly marker: string;
  cleaned: boolean;
}

/**
 * In-memory ledger of resources created by THIS run. The cleanup authority: a
 * destructive step may only target an id recorded here. Never serialized.
 */
export class ResourceLedger {
  private readonly byKey = new Map<string, LedgerEntry>();

  record(entry: Omit<LedgerEntry, "cleaned">): void {
    this.byKey.set(entry.resourceKey, { ...entry, cleaned: false });
  }

  has(resourceKey: string): boolean {
    return this.byKey.has(resourceKey);
  }

  get(resourceKey: string): LedgerEntry | undefined {
    return this.byKey.get(resourceKey);
  }

  /** True when this external id was created by the run (smoke-owned). */
  isSmokeOwned(externalId: string): boolean {
    for (const e of this.byKey.values()) if (e.externalId === externalId) return true;
    return false;
  }

  markCleaned(resourceKey: string): void {
    const e = this.byKey.get(resourceKey);
    if (e) e.cleaned = true;
  }

  entries(): readonly LedgerEntry[] {
    return [...this.byKey.values()];
  }

  summary(): LedgerSummary {
    const all = this.entries();
    return {
      created: all.length,
      cleaned: all.filter((e) => e.cleaned).length,
      leaked: all.filter((e) => !e.cleaned).length,
      kinds: [...new Set(all.map((e) => e.kind))].sort(),
    };
  }
}

/** Output of running one registered action step against the (real) engine. */
export interface StepRunOutcome {
  readonly ok: boolean;
  readonly output: Readonly<Record<string, unknown>> | null;
  readonly reason: string | null;
}

/** Injected seam. The real wiring runs an account-scoped engine step; tests fake it. */
export interface WriteHarnessDeps {
  runActionStep(input: {
    readonly provider: string;
    readonly action: string;
    readonly config: Readonly<Record<string, unknown>>;
  }): Promise<StepRunOutcome>;
  /**
   * SMOKE-ONLY read-back seam for verify steps marked `smokeRead` — a bounded,
   * READ-ONLY provider call (NOT through the engine, NOT a user-facing action)
   * for providers with no registered read action to verify against. `(provider,
   * action)` selects the reader; `config` carries the (resolved) target id.
   * Absent -> a `smokeRead` verify step fails with a clear reason (never silently
   * routed to the write/engine path).
   */
  smokeReadBack?(input: {
    readonly provider: string;
    readonly action: string;
    readonly config: Readonly<Record<string, unknown>>;
  }): Promise<StepRunOutcome>;
}

export interface RunWriteSmokeOptions {
  /** ALLOW_LIVE_PROVIDER_WRITE_SMOKE — required by every mutating class. */
  readonly allowWrite?: boolean;
  /** ALLOW_DESTRUCTIVE_PROVIDER_SMOKE — required by destructiveSafe. */
  readonly allowDestructive?: boolean;
  /** Plan only; never call a mutating seam. */
  readonly dryRun?: boolean;
  /** Per-run unique token used to build the marker. Passed in (pure), not generated. */
  readonly runToken: string;
  readonly envLookup?: (name: string) => string | undefined;
  /**
   * Backoff sleep used ONLY by the bounded cleanup retry (OneNote create→delete
   * propagation lag). Injected so unit tests run instantly + assert the wait budget;
   * defaults to a real `setTimeout` sleep in the live harness. Pure otherwise.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

// ─── Gate ────────────────────────────────────────────────────────────────────

/**
 * Decide whether a mutating fixture may run live, by its `liveClass`. Returns a
 * terminal {status, reason} to SKIP/refuse, or null to proceed. Pure.
 */
export function gateWriteClass(
  spec: WriteHarnessSpec,
  options: RunWriteSmokeOptions,
  envLookup: (name: string) => string | undefined,
): { status: WriteSmokeStatus; reason: string } | null {
  if (spec.liveClass === "neverLive") {
    return { status: "UNSAFE_NO_HARNESS", reason: "neverLive — cannot be safely live-smoked (unit/integration only)" };
  }
  if (spec.liveClass === "billingSensitive") {
    const sandboxConfirmed =
      spec.requiresSandboxEnv !== undefined &&
      (envLookup(spec.requiresSandboxEnv) ?? "") !== "";
    if (!sandboxConfirmed) {
      return {
        status: "SANDBOX_REQUIRED",
        reason: `billingSensitive — needs a confirmed test-mode account (${spec.requiresSandboxEnv ?? "requiresSandboxEnv unset"})`,
      };
    }
  }
  if (options.allowWrite !== true) {
    return { status: "SKIP", reason: "write — needs ALLOW_LIVE_PROVIDER_WRITE_SMOKE" };
  }
  if (spec.liveClass === "destructiveSafe" && options.allowDestructive !== true) {
    return { status: "SKIP", reason: "destructiveSafe — needs ALLOW_DESTRUCTIVE_PROVIDER_SMOKE" };
  }
  return null;
}

// ─── Token substitution + capture (pure) ─────────────────────────────────────

const LEDGER_TOKEN = /\{\{ledger\.([A-Za-z0-9_-]+)\.id\}\}/g;
const ENV_TOKEN = /\{\{env\.([A-Za-z0-9_]+)\}\}/g;
/** Per-iteration token bound to the current id in a verifyEach / cleanupEach fan-out. */
const EACH_TOKEN = "{{each.id}}";

/** Ledger resourceKeys referenced by a step's RAW config (before resolution). */
export function ledgerRefsIn(config: Readonly<Record<string, unknown>>): string[] {
  const refs = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(LEDGER_TOKEN)) if (m[1]) refs.add(m[1]);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(config);
  return [...refs];
}

/**
 * Resolve `{{smokeMarker}}`, `{{ledger.<key>.id}}`, and `{{env.<NAME>}}` tokens in
 * a step config. Pure (env values flow in via the injected `envLookup`). A
 * `{{ledger.<key>.id}}` whose key is not in the ledger is left literal so the
 * smoke-owned guard can refuse the step; an unresolved `{{env.<NAME>}}` is left
 * literal too (the setup/execute step then fails loudly rather than silently
 * targeting the wrong resource).
 */
export function resolveStepConfig(
  config: Readonly<Record<string, unknown>>,
  marker: string,
  ledger: ResourceLedger,
  envLookup: (name: string) => string | undefined = () => undefined,
  eachId?: string,
): Readonly<Record<string, unknown>> {
  // Tokens resolve in both string VALUES and object KEYS (a provider field name
  // can itself be operator config, e.g. an Airtable primary-field name).
  const resolveStr = (s: string): string => {
    let out = s.split("{{smokeMarker}}").join(marker);
    if (eachId !== undefined) out = out.split(EACH_TOKEN).join(eachId);
    out = out.replace(LEDGER_TOKEN, (whole, key: string) => ledger.get(key)?.externalId ?? whole);
    out = out.replace(ENV_TOKEN, (whole, name: string) => {
      const val = envLookup(name);
      return val !== undefined && val !== "" ? val : whole;
    });
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return resolveStr(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[resolveStr(k)] = walk(val);
      return out;
    }
    return v;
  };
  return walk(config) as Readonly<Record<string, unknown>>;
}

/** Resolve `{{env.<NAME>}}` / `{{smokeMarker}}` in a scalar string (e.g. markerEchoPath). */
export function resolveScalarTokens(
  s: string,
  marker: string,
  envLookup: (name: string) => string | undefined,
  ledger?: ResourceLedger,
): string {
  let out = s.split("{{smokeMarker}}").join(marker);
  out = out.replace(ENV_TOKEN, (whole, name: string) => {
    const val = envLookup(name);
    return val !== undefined && val !== "" ? val : whole;
  });
  // `{{ledger.<key>.id}}` — lets a verify assertion compare against a captured id
  // (e.g. expectContains parents = the move target folder id). Only when a ledger
  // is supplied; absent -> left literal (so a missing capture fails loudly).
  if (ledger) {
    out = out.replace(LEDGER_TOKEN, (whole, key: string) => ledger.get(key)?.externalId ?? whole);
  }
  return out;
}

/**
 * The smoke-owned guard: a destructive/cleanup step may run ONLY if it references
 * at least one `{{ledger.<key>.id}}` AND every referenced key is a smoke-owned
 * ledger entry. A cleanup with no ledger reference (a literal/foreign id) is
 * refused — deleting an arbitrary existing record must be impossible.
 */
export function cleanupTargetsSmokeOwned(
  step: ActionStepSpec,
  ledger: ResourceLedger,
): boolean {
  const refs = ledgerRefsIn(step.config);
  if (refs.length === 0) return false;
  return refs.every((key) => ledger.has(key));
}

function readPath(output: Readonly<Record<string, unknown>> | null, path: string): string | null {
  if (!output) return null;
  let cur: unknown = output;
  for (const seg of path.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return null;
    }
  }
  return typeof cur === "string" ? cur : typeof cur === "number" ? String(cur) : null;
}

/**
 * Read an ARRAY of created ids out of a step output for a multi-resource capture:
 * the array lives at `idsPath`, each element's id at `idField`. Returns the ids in
 * order (empty when the path is missing / not an array / elements lack the field).
 */
function readIdsAtPath(
  output: Readonly<Record<string, unknown>> | null,
  idsPath: string,
  idField: string,
): string[] {
  const raw = rawValueAtPath(output, idsPath);
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const el of raw) {
    if (el && typeof el === "object") {
      const v = (el as Record<string, unknown>)[idField];
      if (typeof v === "string" && v.length > 0) ids.push(v);
      else if (typeof v === "number") ids.push(String(v));
    }
  }
  return ids;
}

/** Raw value at a dot-path (any type: scalar / array / object), or null. */
function rawValueAtPath(output: Readonly<Record<string, unknown>> | null, path: string): unknown {
  if (!output) return null;
  let cur: unknown = output;
  for (const seg of path.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return null;
    }
  }
  return cur ?? null;
}

/**
 * Is the unique smoke marker present at `path` in a read-back output? Handles a
 * scalar (a `title` string) AND a collection (a `blocks` / `comments` array) by
 * checking the JSON-serialized value — the marker (`crsmoke-<runToken>-`) is
 * unique enough that a substring hit is a true match, never an id collision.
 */
export function markerPresentAtPath(
  output: Readonly<Record<string, unknown>> | null,
  path: string,
  marker: string,
): boolean {
  const raw = rawValueAtPath(output, path);
  if (raw === null || raw === undefined) return false;
  const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);
  return serialized.includes(marker);
}

/**
 * Does the scalar at `path` in a read-back output equal `expected`? Used to prove
 * a STATE CHANGE the marker can't (e.g. `archived === true`). Strict for
 * booleans/numbers; a string `expected` is compared as-is (callers token-resolve
 * it first). A missing path / non-scalar value is never "equal".
 */
export function valueEqualsAtPath(
  output: Readonly<Record<string, unknown>> | null,
  path: string,
  expected: string | number | boolean,
): boolean {
  const raw = rawValueAtPath(output, path);
  if (raw === null || raw === undefined) return false;
  return raw === expected;
}

/**
 * Does the ARRAY at `path` in a read-back output CONTAIN `expected`? Used to prove
 * MEMBERSHIP by independent read-back (e.g. a card's `idLabels` contains the added
 * label id) rather than trusting the write response. A scalar (non-array) at the
 * path is treated as a single-element membership check. Missing path -> false.
 */
export function valuePresentInArrayAtPath(
  output: Readonly<Record<string, unknown>> | null,
  path: string,
  expected: string,
): boolean {
  const raw = rawValueAtPath(output, path);
  if (raw === null || raw === undefined) return false;
  if (Array.isArray(raw)) return raw.some((el) => el === expected);
  return raw === expected;
}

/**
 * Is the value at `path` a NON-EMPTY array? When `elementHasKey` is set, EVERY
 * element must also be an object carrying a truthy value at that key. Used to prove
 * a provider-TRANSFORMED side effect (e.g. an Airtable attachment field is now a
 * populated array of `{id,...}` — the uploaded URL/filename is rehosted, so only
 * "non-empty + each has a stable id" is honest). Missing / non-array / empty -> false.
 */
export function nonEmptyArrayAtPath(
  output: Readonly<Record<string, unknown>> | null,
  path: string,
  elementHasKey?: string,
): boolean {
  const raw = rawValueAtPath(output, path);
  if (!Array.isArray(raw) || raw.length === 0) return false;
  if (!elementHasKey) return true;
  return raw.every(
    (el) =>
      el !== null &&
      typeof el === "object" &&
      Boolean((el as Record<string, unknown>)[elementHasKey]),
  );
}

/**
 * Is the value at `path` PRESENT but EMPTY? Proves a CLEAR / blank side effect that
 * no marker can show (e.g. `clear_range` -> `get_cell_value` returns `value: null`).
 *
 * CONSERVATIVE on absence (distinct from `rawValueAtPath`, which conflates a missing
 * path with a null value): EVERY path segment must EXIST in the output. A missing
 * segment returns false — arbitrary object absence can never vacuously pass, so a
 * typo'd path or a sparse read-back FAILS rather than reading as "cleared". When the
 * path is present, the terminal value is "empty" iff it is `null` / `undefined` /
 * `""` (empty string) / `[]` (empty array). Any non-empty scalar / populated array /
 * object is NOT empty.
 */
export function valueEmptyAtPath(
  output: Readonly<Record<string, unknown>> | null,
  path: string,
): boolean {
  if (!output) return false; // no read-back output at all -> cannot prove emptiness
  let cur: unknown = output;
  for (const seg of path.split(".")) {
    // The segment must be an OWN key of the current object — `seg in cur` is true
    // even when the value is `null`/`undefined` (presence is what we test here).
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return false; // path segment absent -> NOT proven empty (never a vacuous pass)
    }
  }
  if (cur === null || cur === undefined) return true;
  if (typeof cur === "string") return cur === "";
  if (Array.isArray(cur)) return cur.length === 0;
  return false; // a non-empty scalar / object / number / boolean is NOT empty
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const SANITIZE = (r: string | null): string | null => sanitizeFailureReason(r);

/**
 * Apply a verify step's assertions (markerPath [+ markerSuffix] / expectEquals /
 * expectContains) to its read-back `output`, pushing a verify phase per assertion.
 * Returns true only when every DECLARED assertion passed (no assertions -> true,
 * relying on the step having returned ok). Shared by single `verify` and the
 * per-id `verifyEach` fan-out so both prove the side effect identically.
 */
function applyVerifyAssertions(
  step: ActionStepSpec,
  output: Readonly<Record<string, unknown>> | null,
  marker: string,
  envLookup: (name: string) => string | undefined,
  phases: PhaseResult[],
  label = "",
  ledger?: ResourceLedger,
): boolean {
  let ok = true;
  if (step.markerPath) {
    const echoPath = resolveScalarTokens(step.markerPath, marker, envLookup, ledger);
    // markerSuffix lets a read-back prove a SPECIFIC value (e.g. "updated"), not
    // just that the run marker is present.
    const expectedMarker = marker + (step.markerSuffix ?? "");
    const hit = markerPresentAtPath(output, echoPath, expectedMarker);
    phases.push({
      phase: "verify",
      outcome: hit ? "ok" : "failed",
      reason: hit ? `marker confirmed on read-back${label}` : `read-back did not contain the smoke marker${label}`,
    });
    if (!hit) ok = false;
  }
  if (step.expectEquals) {
    const { path } = step.expectEquals;
    const expected =
      typeof step.expectEquals.value === "string"
        ? resolveScalarTokens(step.expectEquals.value, marker, envLookup, ledger)
        : step.expectEquals.value;
    const hit = valueEqualsAtPath(output, path, expected);
    phases.push({
      phase: "verify",
      outcome: hit ? "ok" : "failed",
      reason: hit ? `read-back ${path} == expected state${label}` : `read-back ${path} did not equal the expected state${label}`,
    });
    if (!hit) ok = false;
  }
  if (step.expectContains) {
    const { path } = step.expectContains;
    // ledger-aware: the expected member may be a captured id (e.g. a move target
    // folder id) referenced as {{ledger.<key>.id}}.
    const expected = resolveScalarTokens(step.expectContains.value, marker, envLookup, ledger);
    const hit = valuePresentInArrayAtPath(output, path, expected);
    phases.push({
      phase: "verify",
      outcome: hit ? "ok" : "failed",
      reason: hit ? `read-back ${path} contains the expected member${label}` : `read-back ${path} did not contain the expected member${label}`,
    });
    if (!hit) ok = false;
  }
  if (step.expectNonEmptyArray) {
    // Path is token-resolved (env / marker / ledger) so a dynamic field name resolves.
    const path = resolveScalarTokens(step.expectNonEmptyArray.path, marker, envLookup, ledger);
    const hit = nonEmptyArrayAtPath(output, path, step.expectNonEmptyArray.elementHasKey);
    const keyNote = step.expectNonEmptyArray.elementHasKey
      ? ` (each with ${step.expectNonEmptyArray.elementHasKey})`
      : "";
    phases.push({
      phase: "verify",
      outcome: hit ? "ok" : "failed",
      reason: hit
        ? `read-back ${path} is a non-empty array${keyNote}${label}`
        : `read-back ${path} was empty / not an array${keyNote}${label}`,
    });
    if (!hit) ok = false;
  }
  if (step.expectEmpty) {
    // Path is token-resolved (env / marker / ledger) like the other assertions.
    const path = resolveScalarTokens(step.expectEmpty.path, marker, envLookup, ledger);
    const hit = valueEmptyAtPath(output, path);
    phases.push({
      phase: "verify",
      outcome: hit ? "ok" : "failed",
      reason: hit
        ? `read-back ${path} is present and empty (cleared)${label}`
        : `read-back ${path} was not present-and-empty (still set / missing path)${label}`,
    });
    if (!hit) ok = false;
  }
  return ok;
}

/**
 * Run one mutating fixture through setup -> execute -> verify -> cleanup. Never
 * throws — every failure mode becomes a structured WriteSmokeResult. Cleanup is
 * ALWAYS attempted for smoke-owned resources, and its failure is surfaced.
 */
export async function runWriteSmoke(
  fixture: ActionSmokeFixture,
  options: RunWriteSmokeOptions,
  deps: WriteHarnessDeps,
): Promise<WriteSmokeResult> {
  const spec = fixture.writeHarness;
  const envLookup = options.envLookup ?? ((n) => process.env[n]);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const ledger = new ResourceLedger();
  const phases: PhaseResult[] = [];
  const base = {
    provider: fixture.provider,
    action: fixture.action,
    liveClass: spec?.liveClass ?? "neverLive",
  } as const;

  if (!spec) {
    return {
      ...base,
      status: "FAIL",
      reason: "fixture has no writeHarness spec (author it via defineWriteSmokeFixture)",
      phases,
      ledger: ledger.summary(),
      artifact: "none",
      dryRun: false,
    };
  }

  const marker = `${spec.smokeMarker}${options.runToken}-`;

  // 1. Gate by liveClass — before ANY seam call.
  const gate = gateWriteClass(spec, options, envLookup);
  if (gate) {
    return { ...base, status: gate.status, reason: gate.reason, phases, ledger: ledger.summary(), artifact: "none", dryRun: false };
  }

  // 1b. Target gate — a missing smoke TARGET env (board/list/page/base id, NOT a
  // *_CONNECTED signal) is BLOCKED_ENV, never confused with "not connected". The
  // dev test owns the real connection check; the orchestrator owns "do I have a
  // place to safely write?". Connection-signal vars (SMOKE_*_CONNECTED) are
  // excluded — those are asserted by the real DB check, not the env.
  const targetEnv = (fixture.requiredEnv ?? []).filter((v) => !/_CONNECTED$/.test(v));
  const missingTargets = targetEnv.filter((v) => {
    const val = envLookup(v);
    return val === undefined || val === "";
  });
  if (missingTargets.length > 0) {
    return {
      ...base,
      status: "BLOCKED_ENV",
      reason: `connected but no smoke target — set ${missingTargets.join(", ")}`,
      phases,
      ledger: ledger.summary(),
      artifact: "none",
      dryRun: false,
    };
  }

  // 2. Dry-run — plan the phases, call NO mutating seam.
  if (options.dryRun === true) {
    if (spec.setup) for (const _ of spec.setup) phases.push({ phase: "setup", outcome: "skipped", reason: "dry-run" });
    phases.push({ phase: "execute", outcome: "skipped", reason: "dry-run" });
    if (spec.verify) phases.push({ phase: "verify", outcome: "skipped", reason: "dry-run" });
    if (spec.cleanup) phases.push({ phase: "cleanup", outcome: "skipped", reason: "dry-run" });
    return {
      ...base,
      status: "SKIP",
      reason: "dry-run — planned, no provider mutation",
      phases,
      ledger: ledger.summary(),
      artifact: "none",
      dryRun: true,
    };
  }

  // Helper: run a step + capture into the ledger. Returns ok + the step output
  // (output stays in memory; it is never surfaced in a report).
  const runStep = async (
    phase: PhaseName,
    step: ActionStepSpec,
  ): Promise<StepRunOutcome> => {
    const config = resolveStepConfig(step.config, marker, ledger, envLookup);
    // A `smokeRead` verify step routes to the smoke-only read-back seam — NEVER to
    // the engine/write path (a missing seam fails loud, never silently runs an
    // unknown action).
    let res: StepRunOutcome;
    if (step.smokeRead) {
      res = deps.smokeReadBack
        ? await deps.smokeReadBack({ provider: step.provider, action: step.action, config })
        : { ok: false, output: null, reason: "smoke read-back seam not available" };
    } else {
      res = await deps.runActionStep({ provider: step.provider, action: step.action, config });
    }
    if (res.ok && step.captureResource) {
      const cap = step.captureResource;
      if (cap.idsPath) {
        // MULTI-resource capture: record each created id under a derived key
        // <resourceKey><index> (record0, record1, …) — referenced later by index
        // and fanned over by verifyEach / cleanupEach.
        const ids = readIdsAtPath(res.output, cap.idsPath, cap.idField ?? "id");
        ids.forEach((id, i) => {
          ledger.record({
            resourceKey: `${cap.resourceKey}${i}`,
            provider: step.provider,
            kind: cap.kind,
            externalId: id,
            marker,
          });
        });
      } else if (cap.idPath) {
        const id = readPath(res.output, cap.idPath);
        if (id) {
          ledger.record({
            resourceKey: cap.resourceKey,
            provider: step.provider,
            kind: cap.kind,
            externalId: id,
            marker,
          });
        }
      }
    }
    phases.push({ phase, outcome: res.ok ? "ok" : "failed", reason: SANITIZE(res.reason) });
    return res;
  };

  let actionStatus: WriteSmokeStatus = "PASS";

  // 3. setup.
  for (const step of spec.setup ?? []) {
    const res = await runStep("setup", step);
    if (!res.ok) {
      actionStatus = "FAIL";
      break;
    }
  }

  // 4. execute (only if setup did not already fail). The execute config gets the
  // fixture's `configFromEnv` overlay (the same field->env mechanism the read
  // path uses) BEFORE token resolution, so e.g. a smoke listId / baseId comes
  // from env, never a hardcoded literal.
  if (actionStatus === "PASS") {
    const execStep: ActionStepSpec = {
      provider: fixture.provider,
      action: fixture.action,
      config: resolveFixtureConfig(fixture, envLookup),
      captureResource: spec.captureResource,
    };
    const exec = await runStep("execute", execStep);
    if (!exec.ok) actionStatus = "FAIL";

    // 5a. marker echo — when the created resource echoes a name/title field, the
    // harness confirms the UNIQUE smoke marker round-tripped (so we know the
    // object we will clean up is the one we just stamped). Used by pilots that
    // have no separate read-back action (e.g. Trello create_card).
    if (exec.ok && spec.markerEchoPath) {
      const echoPath = resolveScalarTokens(spec.markerEchoPath, marker, envLookup);
      const echo = readPath(exec.output, echoPath);
      const ok = echo !== null && echo.includes(marker);
      phases.push({
        phase: "verify",
        outcome: ok ? "ok" : "failed",
        reason: ok ? null : "created resource did not echo the smoke marker",
      });
      if (!ok) actionStatus = "VERIFY_FAILED";
    }

    // 5a-bis. completeAsync — the execute action returned a PENDING long-running
    // operation (e.g. Graph /copy 202 + monitor URL) instead of the created id.
    // Poll the TRUSTED monitor URL (read from the execute output) to terminal
    // completion via the smoke-only read-back seam, then capture the completed
    // resource id into the ledger so verify + cleanup can target the REAL created
    // object. A missing monitor URL / poll failure / no resulting id -> VERIFY_FAILED:
    // the run never proceeds with an uncaptured resource, so a created-but-unowned
    // object can never escape cleanup (no silent leak).
    if (actionStatus === "PASS" && spec.completeAsync) {
      const ca = spec.completeAsync;
      const monitorUrl = readPath(exec.output, ca.monitorUrlPath);
      if (!monitorUrl) {
        phases.push({ phase: "execute", outcome: "failed", reason: "async execute returned no monitor URL to complete" });
        actionStatus = "VERIFY_FAILED";
      } else {
        // The monitor URL is passed to the smoke read-back seam (a bounded, READ-ONLY
        // provider poll); the seam itself trust-gates the URL before any fetch.
        const res = deps.smokeReadBack
          ? await deps.smokeReadBack({ provider: ca.provider, action: ca.action, config: { monitorUrl } })
          : { ok: false, output: null, reason: "async completion seam not available" };
        if (!res.ok) {
          phases.push({ phase: "execute", outcome: "failed", reason: SANITIZE(res.reason) });
          actionStatus = "VERIFY_FAILED";
        } else {
          const cap = ca.captureResource;
          const id = cap.idPath ? readPath(res.output, cap.idPath) : null;
          if (id) {
            ledger.record({
              resourceKey: cap.resourceKey,
              provider: fixture.provider,
              kind: cap.kind,
              externalId: id,
              marker,
            });
            phases.push({ phase: "execute", outcome: "ok", reason: "async operation completed; resource captured" });
          } else {
            phases.push({ phase: "execute", outcome: "failed", reason: "async completion did not yield a resource id" });
            actionStatus = "VERIFY_FAILED";
          }
        }
      }
    }

    // 5b. verify (a registered read action keyed on the captured id). When the
    // verify step declares a `markerPath`, the harness reads that field from the
    // READ-BACK response and confirms the unique marker — proving the marker on
    // the persisted resource, not merely that the id exists.
    if (actionStatus === "PASS" && spec.verify) {
      const v = await runStep("verify", spec.verify);
      if (!v.ok) {
        actionStatus = "VERIFY_FAILED";
      } else if (!applyVerifyAssertions(spec.verify, v.output, marker, envLookup, phases, "", ledger)) {
        // A verify step may assert the marker on the read-back (identity, + an
        // optional markerSuffix for a specific value), a scalar STATE (expectEquals),
        // and ARRAY membership (expectContains). Each declared assertion must pass.
        actionStatus = "VERIFY_FAILED";
      }
    }

    // 5c. verifyEach — MULTI-resource: run the verify template once PER captured
    // ledger resource, binding {{each.id}} to each id. Every record's INDEPENDENT
    // read-back must satisfy the assertions, or the run is VERIFY_FAILED. All
    // captured records are checked (one failing record fails the run, but the loop
    // still reports the others' outcomes). Cleanup always follows regardless.
    if (actionStatus === "PASS" && spec.verifyEach) {
      const targets = ledger.entries();
      if (targets.length === 0) {
        phases.push({ phase: "verify", outcome: "failed", reason: "verifyEach: no captured resources to verify" });
        actionStatus = "VERIFY_FAILED";
      }
      for (const entry of targets) {
        const stepConfig = resolveStepConfig(spec.verifyEach.config, marker, ledger, envLookup, entry.externalId);
        const res = spec.verifyEach.smokeRead
          ? deps.smokeReadBack
            ? await deps.smokeReadBack({ provider: spec.verifyEach.provider, action: spec.verifyEach.action, config: stepConfig })
            : { ok: false, output: null, reason: "smoke read-back seam not available" }
          : await deps.runActionStep({ provider: spec.verifyEach.provider, action: spec.verifyEach.action, config: stepConfig });
        if (!res.ok) {
          phases.push({ phase: "verify", outcome: "failed", reason: SANITIZE(res.reason) });
          actionStatus = "VERIFY_FAILED";
          continue;
        }
        if (!applyVerifyAssertions(spec.verifyEach, res.output, marker, envLookup, phases, "", ledger)) {
          actionStatus = "VERIFY_FAILED";
        }
      }
    }

    // 5d. verifyAll — MULTI-STEP: a LIST of INDEPENDENT read-back steps, each its own
    // read action + assertions. EVERY step must pass. For a side effect that needs
    // multiple bounded facts proven (e.g. delete_row's row shift: A1 unchanged, A2 ==
    // the shifted-up row, A3 now empty). Each step runs through the same
    // engine/smokeRead routing + the same assertion engine as `verify`.
    if (actionStatus === "PASS" && spec.verifyAll) {
      for (const step of spec.verifyAll) {
        const stepConfig = resolveStepConfig(step.config, marker, ledger, envLookup);
        const res = step.smokeRead
          ? deps.smokeReadBack
            ? await deps.smokeReadBack({ provider: step.provider, action: step.action, config: stepConfig })
            : { ok: false, output: null, reason: "smoke read-back seam not available" }
          : await deps.runActionStep({ provider: step.provider, action: step.action, config: stepConfig });
        if (!res.ok) {
          phases.push({ phase: "verify", outcome: "failed", reason: SANITIZE(res.reason) });
          actionStatus = "VERIFY_FAILED";
          continue;
        }
        if (!applyVerifyAssertions(step, res.output, marker, envLookup, phases, "", ledger)) {
          actionStatus = "VERIFY_FAILED";
        }
      }
    }
  }

  // 6. cleanup — ALWAYS attempted when there are smoke-owned resources, even on
  // execute/verify failure. `cleanupKind` decides whether it is REQUIRED (delete)
  // or BEST-EFFORT (archive), and how a leftover reads.
  const cleanupKind: "delete" | "archive" | "none" =
    spec.cleanup || spec.cleanupEach ? (spec.cleanupKind ?? "delete") : "none";
  let cleanupFailed = false;
  let cleanupRan = false;
  if (spec.cleanupEach) {
    // MULTI-resource cleanup: run the cleanup template once per captured resource.
    // EVERY captured resource must clean for a PASS_CLEANED; ANY failure leaves a
    // leaked record -> not a clean pass (delete-kind -> CLEANUP_FAILED below).
    const targets = ledger.entries();
    if (targets.length === 0) {
      phases.push({ phase: "cleanup", outcome: "skipped", reason: "no smoke-owned resource to clean" });
    } else if (
      spec.crossProviderCleanup !== true &&
      targets.some((e) => e.provider !== spec.cleanupEach!.provider)
    ) {
      // Cross-provider cleanup (the cleanup provider differs from the provider that
      // CREATED the resource) must be explicitly declared (see crossProviderCleanup).
      cleanupFailed = true;
      phases.push({
        phase: "cleanup",
        outcome: "failed",
        reason: "refused — cross-provider cleanup not declared (set crossProviderCleanup)",
      });
    } else {
      let anyOk = false;
      // Eligible cleanup steps (OneNote page delete) get a bounded retry / 404-already-
      // cleaned path to absorb create→delete propagation lag; every other step keeps its
      // single-attempt behavior (policy === null). Each `entry` is a ledger resource, so
      // the cleanup target is smoke-owned by construction.
      const eachPolicy = cleanupRetryPolicyFor(spec.cleanupEach.provider, spec.cleanupEach.action);
      for (const entry of targets) {
        if (entry.cleaned) continue;
        const config = resolveStepConfig(spec.cleanupEach.config, marker, ledger, envLookup, entry.externalId);
        const res = await runCleanupStepWithRetry({
          provider: spec.cleanupEach.provider,
          action: spec.cleanupEach.action,
          config,
          targetIsSmokeOwned: true,
          runActionStep: deps.runActionStep,
          sleep,
          policy: eachPolicy,
        });
        if (res.ok) {
          anyOk = true;
          ledger.markCleaned(entry.resourceKey);
          phases.push({
            phase: "cleanup",
            outcome: "ok",
            reason: res.disposition === "already_cleaned" ? "already cleaned (404 on smoke-owned page)" : null,
          });
        } else {
          cleanupFailed = true;
          phases.push({ phase: "cleanup", outcome: "failed", reason: SANITIZE(res.reason) });
        }
      }
      // cleanupRan = at least one delete succeeded; the leaked count (any not
      // cleaned) drives the final cleaned-vs-CLEANUP_FAILED disposition.
      cleanupRan = anyOk && ledger.summary().leaked === 0;
    }
  } else if (spec.cleanup) {
    if (ledger.summary().leaked === 0) {
      // Nothing was created (or all already clean) — no cleanup to do.
      phases.push({ phase: "cleanup", outcome: "skipped", reason: "no smoke-owned resource to clean" });
    } else if (
      spec.crossProviderCleanup !== true &&
      ledgerRefsIn(spec.cleanup.config).some(
        (k) => ledger.get(k)?.provider !== spec.cleanup!.provider,
      )
    ) {
      // Cross-provider cleanup (the cleanup provider differs from the provider that
      // CREATED the targeted resource) must be explicitly declared (crossProviderCleanup).
      cleanupFailed = true;
      phases.push({
        phase: "cleanup",
        outcome: "failed",
        reason: "refused — cross-provider cleanup not declared (set crossProviderCleanup)",
      });
    } else if (!cleanupTargetsSmokeOwned(spec.cleanup, ledger)) {
      // The smoke-owned guard: refuse to run a destructive step that does not
      // target a resource THIS run created.
      cleanupFailed = true;
      phases.push({
        phase: "cleanup",
        outcome: "failed",
        reason: "refused — cleanup target is not a smoke-owned ledger resource",
      });
    } else {
      const config = resolveStepConfig(spec.cleanup.config, marker, ledger, envLookup);
      // Smoke-ownership was just asserted (cleanupTargetsSmokeOwned), so the bounded
      // retry / 404-already-cleaned path is safe to enable for eligible steps; every
      // other step keeps single-attempt behavior (policy === null).
      const res = await runCleanupStepWithRetry({
        provider: spec.cleanup.provider,
        action: spec.cleanup.action,
        config,
        targetIsSmokeOwned: true,
        runActionStep: deps.runActionStep,
        sleep,
        policy: cleanupRetryPolicyFor(spec.cleanup.provider, spec.cleanup.action),
      });
      if (res.ok) {
        cleanupRan = true;
        for (const key of ledgerRefsIn(spec.cleanup.config)) ledger.markCleaned(key);
        phases.push({
          phase: "cleanup",
          outcome: "ok",
          reason: res.disposition === "already_cleaned" ? "already cleaned (404 on smoke-owned page)" : null,
        });
      } else {
        cleanupFailed = true;
        phases.push({ phase: "cleanup", outcome: "failed", reason: SANITIZE(res.reason) });
      }
    }
  }

  // 6b. execute-is-cleanup — the action under test IS the disposition (e.g.
  // delete_record / archive_card-as-delete). When the execute step succeeded,
  // mark the ledger resources its config referenced as cleaned, so the report is
  // honest ("cleaned" / gone) instead of a false "left" leak. Skipped on execute
  // failure (actionStatus FAIL) — there the resource genuinely remains.
  let executeCleaned = false;
  if (spec.executeIsCleanup && actionStatus !== "FAIL") {
    for (const key of ledgerRefsIn(fixture.config)) ledger.markCleaned(key);
    executeCleaned = ledger.summary().created > 0;
  }

  // Disposition of the created object + final status.
  const created = ledger.summary().created;
  let artifact: ArtifactDisposition = created === 0 ? "none" : "left";
  let status: WriteSmokeStatus = actionStatus;
  let reason: string | null = null;

  if (cleanupRan) {
    artifact = cleanupKind === "archive" ? "archived" : "cleaned";
  } else if (cleanupFailed) {
    artifact = "left";
    // REQUIRED (delete) cleanup failure can never be a PASS. BEST-EFFORT (archive)
    // failure leaves a harmless marked artifact and does NOT fail the gate.
    if (cleanupKind === "delete" && (status === "PASS" || status === "VERIFY_FAILED")) {
      status = "CLEANUP_FAILED";
      reason = "required cleanup failed; smoke resource left behind";
    }
  } else if (executeCleaned) {
    artifact = "cleaned";
  }

  if (status === "FAIL") reason = reason ?? "action did not reach its expected outcome";
  else if (status === "VERIFY_FAILED") reason = reason ?? "action ran but verify could not confirm the side effect";
  else if (status === "PASS") {
    if (executeCleaned) reason = "passed; smoke object removed by the action under test";
    else if (artifact === "archived") reason = "passed; smoke object archived (reversible, persists)";
    else if (artifact === "left" && cleanupKind === "archive") reason = "passed; best-effort cleanup did not run — harmless smoke object left";
    else if (artifact === "left") reason = "passed; smoke object intentionally left (no cleanup action)";
  }

  return { ...base, status, reason, phases, ledger: ledger.summary(), artifact, dryRun: false };
}

// ─── Fold to the shared SmokeResult (so write results join the ExecutionReport) ─

const STATUS_TO_OUTCOME: Record<WriteSmokeStatus, SmokeResult["outcome"]> = {
  PASS: "pass",
  FAIL: "fail",
  VERIFY_FAILED: "fail",
  CLEANUP_FAILED: "fail",
  SKIP: "skip",
  BLOCKED_ENV: "skip",
  SANDBOX_REQUIRED: "skip",
  UNSAFE_NO_HARNESS: "skip",
};

/**
 * Status-only human report for a batch of write smokes. Phase outcomes + ledger
 * COUNTS + kind labels only — never ids/secrets/provider output.
 */
export function renderWriteSmokeHuman(results: readonly WriteSmokeResult[]): string {
  const lines: string[] = ["Write smoke — phase report"];
  lines.push("");
  for (const r of results) {
    lines.push(`  ${r.status.padEnd(16)} ${r.provider}:${r.action} [${r.liveClass}]${r.reason ? `  — ${r.reason}` : ""}`);
    for (const p of r.phases) {
      lines.push(`      ${p.phase.padEnd(8)} ${p.outcome}${p.reason ? `  — ${p.reason}` : ""}`);
    }
    // "remaining" = cleanup-required resources NOT cleaned up (a real problem only
    // when status is CLEANUP_FAILED). `artifact` separately says whether a harmless
    // smoke object was intentionally left/archived — never called a "leak".
    lines.push(
      `      created ${r.ledger.created} / cleaned ${r.ledger.cleaned} / remaining ${r.ledger.leaked}` +
        (r.ledger.kinds.length > 0 ? ` (${r.ledger.kinds.join(", ")})` : "") +
        ` | artifact: ${r.artifact}`,
    );
  }
  return lines.join("\n");
}

/**
 * Map a WriteSmokeResult to the shared SmokeResult so it folds into the existing
 * ExecutionReport gate (fail count). CLEANUP_FAILED / VERIFY_FAILED -> "fail",
 * so the gate fails and certification can never record LIVE_PASS for the run.
 */
export function foldToSmokeResult(
  fixture: ActionSmokeFixture,
  result: WriteSmokeResult,
): SmokeResult {
  const providerBoundary: ProviderBoundary = result.dryRun ? "blocked" : "live";
  // Keep the rich status visible in the reason for the human report.
  const reason =
    result.status === "PASS" ? null : SANITIZE(`${result.status}: ${result.reason ?? ""}`.trim());
  return {
    provider: fixture.provider,
    action: fixture.action,
    risk: fixture.risk,
    liveRisk: effectiveLiveRisk(fixture),
    outcome: STATUS_TO_OUTCOME[result.status],
    reason,
    runId: null,
    workflowId: null,
    providerBoundary,
  };
}
