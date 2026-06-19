/**
 * Action smoke harness — single-fixture planning + execution.
 *
 * Execution goes through the SAME core the engine uses per node:
 *   1. strict pre-resolution of the config (the canonical resolveStrict — the
 *      Q2 contract; a missing variable is a fixture bug → FAIL, never silently
 *      passed to the handler),
 *   2. real handler lookup via the registry,
 *   3. handler dispatch.
 *
 * Every external touchpoint is behind an injected dep so tests drive
 * deterministic pass/fail/skip with a fake invoker (mock ONLY the provider
 * boundary, per the testing-strategy rule), while the default deps wire the REAL
 * resolver + REAL registry + a real handler call.
 */
import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import { getActionHandler } from "@/services/execution/handlers/_registry";
import type {
  ActionHandler,
  ActionHandlerInput,
  ActionHandlerResult,
} from "@/services/execution/handlers/types";
import { MissingVariableError, resolveStrict } from "@/workflow-engine/variables/resolveValue";
import {
  sanitizeFailureReason,
  type ProviderBoundary,
  type SmokeResult,
} from "@/scripts/chainreact/smoke/core";
import type { ActionSmokeFixture } from "./contract";
import { effectiveLiveRisk, fixtureKey, resolveFixtureConfig } from "./contract";

/** Injection seams — default to the real V2 internals; overridden in tests. */
export interface SmokeHarnessDeps {
  readonly getHandler: (provider: string, action: string) => ActionHandler | undefined;
  readonly resolveStrict: (value: unknown, context: { variables: Record<string, unknown> }) => unknown;
  /** The external-provider boundary. Default just calls the handler. */
  readonly invoke: (handler: ActionHandler, input: ActionHandlerInput) => Promise<ActionHandlerResult>;
  readonly envLookup: (name: string) => string | undefined;
  readonly newRunId: () => string;
}

export const defaultSmokeDeps: SmokeHarnessDeps = {
  getHandler: getActionHandler,
  resolveStrict: (value, context) => resolveStrict(value, context),
  invoke: (handler, input) => handler(input),
  envLookup: (name) => process.env[name],
  newRunId: () => randomUUID(),
};

export interface RunFixtureOptions {
  readonly includeDestructive: boolean;
  /**
   * Boundary label stamped on every result. Default "live" (the real handler is
   * dispatched). Tests injecting a fake `invoke` pass "mocked".
   */
  readonly providerBoundary?: ProviderBoundary;
}

// Synthetic provenance ids. Handlers use these only for logging/attribution; any
// handler that needs a real integration lookup is env-gated to SKIP before it
// runs, so these never reach a provider call in the default (no-creds) path.
const SMOKE_WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const SMOKE_USER_ID = "00000000-0000-4000-8000-000000000002";
const SMOKE_ACCOUNT_ID = "00000000-0000-4000-8000-000000000003";
const SMOKE_NODE_ID = "smoke-action";

function buildTriggerEvent(fixture: ActionSmokeFixture): TriggerEvent {
  return {
    provider: fixture.provider,
    eventType: "smoke.manual",
    eventId: `smoke-${fixtureKey(fixture)}`,
    occurredAt: "2026-01-01T00:00:00.000Z",
    providerAccountId: "smoke",
    payload: {},
    ...fixture.triggerEvent,
  };
}

function missingEnv(fixture: ActionSmokeFixture, deps: SmokeHarnessDeps): string[] {
  return (fixture.requiredEnv ?? []).filter((name) => {
    const v = deps.envLookup(name);
    return v === undefined || v === "";
  });
}

/**
 * Plan + (when runnable) execute one fixture. Pure-ish: all side effects flow
 * through `deps`. Never throws — every failure mode becomes a structured
 * SmokeResult so the report is deterministic.
 */
export async function runFixture(
  fixture: ActionSmokeFixture,
  options: RunFixtureOptions,
  deps: SmokeHarnessDeps = defaultSmokeDeps,
): Promise<SmokeResult> {
  const base = {
    provider: fixture.provider,
    action: fixture.action,
    risk: fixture.risk,
    liveRisk: effectiveLiveRisk(fixture),
    providerBoundary: options.providerBoundary ?? "live",
  };

  // 1. Destructive gate — never run a destructive fixture without explicit opt-in.
  if (fixture.risk === "destructive" && !options.includeDestructive) {
    return { ...base, outcome: "skip", reason: "destructive — pass includeDestructive to run", runId: null };
  }

  // 2. Missing test connection / env → SKIP (not FAIL). Safe-by-default.
  const missing = missingEnv(fixture, deps);
  if (missing.length > 0) {
    return { ...base, outcome: "skip", reason: `missing env: ${missing.join(", ")}`, runId: null };
  }

  // 3. Handler lookup (real registry).
  const handler = deps.getHandler(fixture.provider, fixture.action);
  if (!handler) {
    return { ...base, outcome: "fail", reason: "no registered handler for this action", runId: null };
  }

  // 4. Strict pre-resolution of config (the Q2 engine contract). Env-config
  // overlay first, so a config field sourced from env (e.g. a channel id) is in
  // place before resolution.
  const triggerEvent = buildTriggerEvent(fixture);
  const variables: Record<string, unknown> = { trigger: triggerEvent, ...(fixture.variables ?? {}) };
  const effectiveConfig = resolveFixtureConfig(fixture, deps.envLookup);
  let resolvedConfig: Readonly<Record<string, unknown>>;
  try {
    resolvedConfig = (deps.resolveStrict(effectiveConfig, { variables }) ?? {}) as Readonly<
      Record<string, unknown>
    >;
  } catch (err) {
    const reason =
      err instanceof MissingVariableError
        ? `unresolved variable ${err.path} (${err.reason}) — fixture config or variables are incomplete`
        : `config resolution crashed: ${(err as Error).message}`;
    return { ...base, outcome: "fail", reason, runId: null };
  }

  // 5. Dispatch through the (injected) provider boundary + classify vs expectation.
  const runId = deps.newRunId();
  const input: ActionHandlerInput = {
    workflowId: SMOKE_WORKFLOW_ID,
    userId: SMOKE_USER_ID,
    accountId: SMOKE_ACCOUNT_ID,
    runId,
    nodeId: SMOKE_NODE_ID,
    config: resolvedConfig,
    triggerEvent,
    testMode: false,
  };

  try {
    await deps.invoke(handler, input);
    if (fixture.expect.outcome === "success") {
      return { ...base, outcome: "pass", reason: null, runId };
    }
    return { ...base, outcome: "fail", reason: "expected a failure but the action succeeded", runId };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    if (fixture.expect.outcome === "failure") {
      const want = fixture.expect.errorIncludes;
      if (want && !message.includes(want)) {
        return {
          ...base,
          outcome: "fail",
          reason: sanitizeFailureReason(`expected failure containing "${want}", got: ${message}`),
          runId,
        };
      }
      return { ...base, outcome: "pass", reason: null, runId };
    }
    return { ...base, outcome: "fail", reason: sanitizeFailureReason(message), runId };
  }
}
