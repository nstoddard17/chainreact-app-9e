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

export function fixtureKey(fixture: Pick<ActionSmokeFixture, "provider" | "action">): string {
  return `${fixture.provider}:${fixture.action}`;
}
