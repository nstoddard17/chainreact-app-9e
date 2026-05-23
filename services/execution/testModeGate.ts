import { getActionMeta } from "@/services/discovery/_registry";
import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Slice 3.SEC-2 — Engine test-mode gate.
 *
 * Decides whether a given (provider, type) action handler should be SHORT-
 * CIRCUITED instead of invoked when the engine is running in test mode.
 * Centralizes the rule so the engine, future per-handler escape hatches,
 * and tests all consult ONE function.
 *
 * Background: the SEC-1 audit (docs/slices/security/workflow-builder-data-
 * security-audit.md F-C1) flagged that the engine has no test-mode and the
 * "run-now" button hits real provider APIs. SEC-2A introduced the
 * `ActionMeta` risk fields (`isDestructive` / `requiresConfirmation` /
 * `riskLevel`); this module is the consumer that turns metadata into a
 * runtime safety decision.
 *
 * BLOCK rule (in test mode, an action is blocked when ANY of):
 *   1. `riskLevel === "high"` — catches Stripe writes (create/update/
 *      cancel/refund/capture/confirm payment intents and subscriptions),
 *      all delete/archive actions, and `native:http_request` (arbitrary
 *      egress sink, F-C2 of the audit).
 *   2. `requiresIntegration === true` — every external-provider write
 *      AND every external-provider read. Reads are blocked because (a)
 *      they consume rate limit, (b) they bleed real provider data into
 *      test-run history, and (c) the V2 audit's "safer rule" recommends
 *      blocking all external traffic by default in test mode.
 *
 * What is ALLOWED in test mode:
 *   - Native logic/transform actions: `native:delay`, `native:format_
 *     transformer`, `native:if_then_condition`, `native:router`. All
 *     four have `requiresIntegration: false` AND `riskLevel: "low"`.
 *   - `native:http_request` is EXPLICITLY blocked (riskLevel "high")
 *     because it is the one native action that performs external egress.
 *
 * Defense-in-depth: even though the SEC-2A consistency guard ensures
 * `isDestructive: true` ⇒ `riskLevel: "high"`, we still check
 * `isDestructive` directly. The cost is a single field read; the benefit
 * is that a future schema bug or hand-edited meta cannot bypass the gate.
 *
 * Metadata-missing fallback: if a handler is registered but no meta is
 * declared for that (provider, type), the gate FAILS CLOSED — the action
 * is BLOCKED in test mode. This is the safer default per the SEC-1
 * audit's no-go criterion #1.
 */

export type TestModeBlockReason =
  /** Action's risk metadata classifies it as high risk. */
  | "TEST_MODE_HIGH_RISK_BLOCKED"
  /** Action requires an external integration (provider API call). */
  | "TEST_MODE_EXTERNAL_ACTION_BLOCKED"
  /** Action meta is missing from the discovery registry — fail closed. */
  | "TEST_MODE_UNKNOWN_ACTION_BLOCKED"
  /** Action explicitly flagged destructive (defense in depth). */
  | "TEST_MODE_DESTRUCTIVE_BLOCKED"
  /** Action requires user confirmation (defense in depth). */
  | "TEST_MODE_CONFIRMATION_REQUIRED_BLOCKED";

export interface TestModeDecision {
  /** When true, engine must NOT invoke the handler. */
  blocked: boolean;
  /** Reason code for the persisted step output. Absent when `blocked` is false. */
  reason?: TestModeBlockReason;
}

/**
 * The single decision function. Pure — takes only the (provider, type)
 * tuple and consults the discovery registry. Inject a custom resolver in
 * tests via `decideTestModeBlockWith` if you need to mock the meta source.
 */
export function decideTestModeBlock(
  provider: string,
  type: string,
): TestModeDecision {
  return decideTestModeBlockWith(provider, type, getActionMeta);
}

/**
 * Test-friendly variant. Engine code calls `decideTestModeBlock`; tests
 * inject a custom meta resolver here so we don't have to mock the entire
 * discovery registry module to exercise gate logic.
 */
export function decideTestModeBlockWith(
  provider: string,
  type: string,
  metaResolver: (key: string) => ActionMeta | undefined,
): TestModeDecision {
  const key = `${provider}:${type}`;
  const meta = metaResolver(key);

  // Fail closed: no meta means we cannot reason about safety. Defensive
  // default per the SEC-1 audit's no-go gates (§10.1).
  if (!meta) {
    return { blocked: true, reason: "TEST_MODE_UNKNOWN_ACTION_BLOCKED" };
  }

  // Defense-in-depth checks first. The contract enforces that
  // `isDestructive` and `requiresConfirmation` both imply `riskLevel:
  // "high"`, so these branches are redundant against well-formed metas —
  // but the reason code is more specific, which surfaces better in run
  // history.
  if (meta.isDestructive) {
    return { blocked: true, reason: "TEST_MODE_DESTRUCTIVE_BLOCKED" };
  }
  if (meta.requiresConfirmation) {
    return {
      blocked: true,
      reason: "TEST_MODE_CONFIRMATION_REQUIRED_BLOCKED",
    };
  }
  if (meta.riskLevel === "high") {
    return { blocked: true, reason: "TEST_MODE_HIGH_RISK_BLOCKED" };
  }
  if (meta.requiresIntegration) {
    return { blocked: true, reason: "TEST_MODE_EXTERNAL_ACTION_BLOCKED" };
  }

  return { blocked: false };
}

/**
 * Deterministic step output written into `workflow_runs.steps[].output`
 * for a test-mode skipped step. Shape is stable so the builder UI and
 * downstream variable picker have a predictable surface, AND downstream
 * nodes that read `{{<nodeId>.<anything>}}` don't blow up with
 * MISSING_VARIABLE during test runs.
 *
 * Intentionally does NOT include fake provider ids. A downstream node
 * that expects `{{prev.paymentIntentId}}` will fail strict resolution at
 * runtime — the engine's test-mode-specific failure path surfaces a
 * clear error rather than silently substituting a fake.
 */
export interface TestModeMockOutput {
  readonly testMode: true;
  readonly actionSkipped: true;
  readonly reason: TestModeBlockReason;
  readonly provider: string;
  readonly type: string;
}

export function buildTestModeMockOutput(
  provider: string,
  type: string,
  reason: TestModeBlockReason,
): TestModeMockOutput {
  return {
    testMode: true,
    actionSkipped: true,
    reason,
    provider,
    type,
  };
}
