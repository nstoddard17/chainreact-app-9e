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
  readonly expect: ActionSmokeExpectation;
  /** Optional free-text note for the runbook / report context. */
  readonly notes?: string;
}

/** Identity helper that pins the fixture type at authoring time. */
export function defineActionSmokeFixture(fixture: ActionSmokeFixture): ActionSmokeFixture {
  return fixture;
}

export function fixtureKey(fixture: Pick<ActionSmokeFixture, "provider" | "action">): string {
  return `${fixture.provider}:${fixture.action}`;
}
