/**
 * Action smoke harness — fixture CONTRACT (Jest-runtime side).
 *
 * The full typed fixture lives here (the offline CLI only parses the
 * provider/action/risk/requiredEnv subset from text — see
 * scripts/chainreact/smoke/inventory.ts). A fixture describes ONE registered
 * action: the config to run it with, the upstream/trigger context that config
 * resolves against, the env it needs for a real run, and the expected outcome.
 *
 * Risk classes (shared with the CLI core):
 *   - read        — no external mutation (lists, gets, pure transforms).
 *   - write       — creates/updates external state (send message, create record).
 *   - destructive — hard-to-reverse data loss (delete/purge). Never run unless
 *                   the operator opts in with --include-destructive.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionRisk } from "@/scripts/chainreact/smoke/core";

export type { ActionRisk } from "@/scripts/chainreact/smoke/core";

export interface ActionSmokeExpectation {
  /** What a real run should produce. */
  readonly outcome: "success" | "failure";
  /** When outcome is "failure", require the thrown message to include this. */
  readonly errorIncludes?: string;
}

/**
 * Write-harness safety class (richer than `risk` / `liveRisk`). Decides which
 * live opt-ins a MUTATING fixture needs and whether it can be live-smoked at all.
 * See docs/slices/phase-4/readiness/write-smoke-harness-design.md.
 *   - writeSafe        — creates/updates only a throwaway resource the run owns;
 *                        can verify + clean up. Needs the write gate.
 *   - sendSafe         — sends/notifies; can ONLY target a controlled smoke
 *                        destination (env-pinned channel/mailbox). No provider
 *                        cleanup (a sent message is delivered). Needs the write gate.
 *   - destructiveSafe  — deletes/archives only a resource created by the SAME run.
 *                        Needs the write + destructive gates AND a smoke-owned
 *                        ledger resource.
 *   - billingSensitive — charges / customers / subscriptions. SKIPPED
 *                        (SANDBOX_REQUIRED) unless a dedicated test-mode account
 *                        is confirmed via `requiresSandboxEnv`.
 *   - neverLive        — cannot be safely live-smoked (irreversible external
 *                        broadcast / real-world effect). UNSAFE_NO_HARNESS;
 *                        unit/integration only.
 */
export type WriteLiveClass =
  | "writeSafe"
  | "sendSafe"
  | "destructiveSafe"
  | "billingSensitive"
  | "neverLive";

/** How to read a created external id out of a step's output into the ledger. */
export interface CaptureSpec {
  /** Stable key the ledger stores this resource under (referenced by later steps). */
  readonly resourceKey: string;
  /** Dot-path into the step output holding the external id (e.g. "id", "page.id"). */
  readonly idPath: string;
  /** Human kind label for the report (e.g. "record", "page", "card"). NEVER the id. */
  readonly kind: string;
}

/**
 * A registered action run as a setup / verify / cleanup step. Its config may
 * reference the run marker via `{{smokeMarker}}` and a prior captured id via
 * `{{ledger.<resourceKey>.id}}` — resolved by the harness (not the engine).
 */
export interface ActionStepSpec {
  readonly provider: string;
  readonly action: string;
  readonly config: Readonly<Record<string, unknown>>;
  /** When this step creates a resource, how to capture its id into the ledger. */
  readonly captureResource?: CaptureSpec;
}

/**
 * Mutation-smoke spec layered onto a fixture. Present only on write/destructive
 * fixtures; absent on read fixtures (the read path ignores it entirely).
 */
export interface WriteHarnessSpec {
  readonly liveClass: WriteLiveClass;
  /** Unique prefix stamped onto created names/text so leaked junk is recognizable. */
  readonly smokeMarker: string;
  /** Registered actions that create prerequisite throwaway resources. */
  readonly setup?: readonly ActionStepSpec[];
  /** How to capture the execute action's created resource id into the ledger. */
  readonly captureResource?: CaptureSpec;
  /** A registered READ action keyed on a captured id (confirms the side effect). */
  readonly verify?: ActionStepSpec;
  /** A registered destructive action keyed on a captured id (removes the resource). */
  readonly cleanup?: ActionStepSpec;
  /** billingSensitive only: env var that confirms a test-mode/sandbox account. */
  readonly requiresSandboxEnv?: string;
}

export interface ActionSmokeFixture {
  /** Provider id — matches the integrations/<provider> folder + handler entry. */
  readonly provider: string;
  /** Action type — matches the registered handler `type` (e.g. send_channel_message). */
  readonly action: string;
  readonly risk: ActionRisk;
  /** Node config; may contain `{{trigger.*}}` / `{{nodeId.*}}` references. */
  readonly config: Readonly<Record<string, unknown>>;
  /** Upstream node outputs available for resolution (keyed by node id). */
  readonly variables?: Readonly<Record<string, unknown>>;
  /** Overrides merged over the default synthetic trigger event. */
  readonly triggerEvent?: Partial<TriggerEvent>;
  /**
   * Env vars a REAL run needs (test connection ids, tokens-by-proxy, channel
   * ids, …). If ANY is unset the run SKIPs (never fails) — this is how the
   * harness stays safe without connected-provider credentials.
   */
  readonly requiredEnv?: readonly string[];
  /**
   * Maps a config FIELD to an ENV VAR NAME. At run time the harness overlays the
   * env value onto `config[field]` (so a real channel id / base id comes from env,
   * never a hardcoded literal). Each mapped env var should also appear in
   * `requiredEnv` so a missing one SKIPs before any workflow is created.
   */
  readonly configFromEnv?: Readonly<Record<string, string>>;
  /**
   * Opt-in marker: may this fixture run in LIVE-connected workflow mode (real
   * provider call, not engine test mode)? Only `liveSafe: true` fixtures run when
   * the harness is in workflow-live mode — everything else SKIPs. Reserve this for
   * read-only or low-risk actions against a throwaway smoke resource. Absent /
   * false → never runs live. A destructive action must NEVER be liveSafe.
   */
  readonly liveSafe?: boolean;
  /**
   * Live-mode risk classification, gating which env opt-ins live mode requires:
   *   - "read"        — runs with ALLOW_LIVE_PROVIDER_SMOKE.
   *   - "write"       — also needs ALLOW_LIVE_PROVIDER_WRITE_SMOKE.
   *   - "destructive" — needs the destructive double-opt-in (includeDestructive +
   *                     ALLOW_DESTRUCTIVE_PROVIDER_SMOKE).
   * Defaults to `risk` when omitted (fail-safe: a write fixture can't be treated
   * as a read by forgetting to set it).
   */
  readonly liveRisk?: ActionRisk;
  readonly expect: ActionSmokeExpectation;
  /**
   * Mutation-smoke spec — present only on write/destructive fixtures run through
   * the write harness (tests/smoke-actions/writeHarness.ts). Absent on read
   * fixtures; the read path never looks at it. Additive: existing fixtures and
   * consumers are unaffected.
   */
  readonly writeHarness?: WriteHarnessSpec;
  /** Optional free-text note for the runbook / report context. */
  readonly notes?: string;
}

/** Live-mode risk for gating: explicit `liveRisk`, else fall back to `risk`. */
export function effectiveLiveRisk(fixture: ActionSmokeFixture): ActionRisk {
  return fixture.liveRisk ?? fixture.risk;
}

/**
 * Effective config = the fixture config with `configFromEnv` env values overlaid.
 * Only overlays present, non-empty env values; missing ones are expected to be
 * caught by the `requiredEnv` SKIP. Pure.
 */
export function resolveFixtureConfig(
  fixture: ActionSmokeFixture,
  envLookup: (name: string) => string | undefined,
): Readonly<Record<string, unknown>> {
  const overlay: Record<string, unknown> = {};
  for (const [field, envName] of Object.entries(fixture.configFromEnv ?? {})) {
    const v = envLookup(envName);
    if (v !== undefined && v !== "") overlay[field] = v;
  }
  return { ...fixture.config, ...overlay };
}

/** Identity helper that pins the fixture type at authoring time. */
export function defineActionSmokeFixture(fixture: ActionSmokeFixture): ActionSmokeFixture {
  return fixture;
}

/**
 * Identity helper for a MUTATING fixture — pins the fixture type AND requires the
 * `writeHarness` spec at authoring time (a write fixture without a phase plan is
 * an authoring bug). Returns the same widened `ActionSmokeFixture` so it drops
 * into `ALL_SMOKE_FIXTURES` unchanged.
 */
export function defineWriteSmokeFixture(
  fixture: ActionSmokeFixture & { readonly writeHarness: WriteHarnessSpec },
): ActionSmokeFixture {
  return fixture;
}

export function fixtureKey(fixture: Pick<ActionSmokeFixture, "provider" | "action">): string {
  return `${fixture.provider}:${fixture.action}`;
}
