/**
 * REACT-AGENT-READINESS-1 — the typed "what is left before this can run?" verdict
 * for a React Agent preview / applied change.
 *
 * After the React Agent proposes (or the user applies) a workflow edit, the user
 * needs ONE clear answer: is the workflow not-ready / ready-to-test /
 * ready-to-activate, or blocked — and exactly what to do next. This is the single
 * pure decision point that produces that verdict.
 *
 * It invents NOTHING. Every input is a deterministic signal already produced by an
 * authoritative source:
 *   - `validationIssues` — the shared builder validator (`collectBuilderValidationIssues`,
 *     itself backed by `core/workflows/executionReadiness` graph + required-field rules)
 *     run against the proposed END-STATE.
 *   - `connection` — the server-resolved per-provider connection signal derived from
 *     the `diagnoseWorkflowConnections` brain (integration rows / health / scopes /
 *     provenance). Readiness NEVER claims "connected" from anything else.
 *   - `triggerChanged` / `workflowActive` — lifecycle (active-trigger change needs
 *     Reactivate → Resume, never an automatic test/activate).
 *   - `canTest` / `lastTestStatus` — builder test capability + the latest run slice.
 *
 * No-leak by construction: the inputs carry only issue CODES, author-facing
 * messages (already produced by the validator), node ids, field key/label NAMES,
 * provider ids/display names, and enum states — never config VALUES, tokens,
 * secrets, raw provider payloads, credential owner identities, or `{{...}}` resolved
 * values. The verdict it returns is the same: labels + counts + enums only.
 *
 * `core/` rule: imports only `contracts/`-level types (none needed here). Pure — no
 * React, no fetch, no services, no I/O.
 */

export type AgentReadinessStatus =
  | "not_ready"
  | "ready_to_test"
  | "ready_to_activate"
  | "blocked"
  | "unknown";

export type AgentReadinessBlockerKind =
  | "missing_required_field"
  | "missing_connection"
  | "invalid_connection"
  | "unresolved_variable"
  | "invalid_graph"
  | "lifecycle_warning"
  | "test_failed"
  | "activation_blocked"
  | "setup_warning"
  | "unknown";

export type AgentReadinessNextAction =
  | "fill_missing_fields"
  | "connect_app"
  | "reconnect_app"
  | "resolve_variables"
  | "apply_to_draft"
  | "test_workflow"
  | "retest_after_fix"
  | "activate_workflow"
  | "review_changes";

export type AgentReadinessTestStatus =
  | "not_tested"
  | "running"
  | "passed"
  | "failed";

export interface AgentReadinessBlocker {
  readonly kind: AgentReadinessBlockerKind;
  readonly nodeId?: string;
  readonly nodeLabel?: string;
  /** Config field key (internal navigation target only; never the value). */
  readonly fieldPath?: string;
  /** Author-facing field label (e.g. "To"). */
  readonly fieldLabel?: string;
  /** Plain-English description (already author-facing; carries no values/secrets). */
  readonly message: string;
  /** Plain-English next step for THIS blocker. */
  readonly nextStep: string;
  /** True = prevents the workflow from running; false = advisory only. */
  readonly blocking: boolean;
}

export interface AgentReadinessVerdict {
  readonly status: AgentReadinessStatus;
  readonly title: string;
  readonly summary: string;
  readonly blockers: readonly AgentReadinessBlocker[];
  readonly warnings: readonly AgentReadinessBlocker[];
  readonly nextActions: readonly AgentReadinessNextAction[];
  readonly lastTestStatus?: AgentReadinessTestStatus;
}

// ── Inputs ───────────────────────────────────────────────────────────────────

/**
 * Structural shape of one builder validation issue. Declared loosely (`code:
 * string`) so `core/` does not import the `BuilderValidationIssueCode` union from
 * `features/` (layer inversion). The hook passes `BuilderValidationIssue[]`, which
 * structurally matches this.
 */
export interface ReadinessValidationIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly nodeId?: string;
  readonly fieldName?: string;
}

/** Per-provider connection state, already classified + redacted from the connection brain DTO. */
export type AgentConnectionProviderState = "connected" | "missing" | "invalid";

export interface AgentConnectionProvider {
  readonly provider: string;
  /** Public manifest display name, or null when unregistered. */
  readonly name: string | null;
  /** Graph node ids that use this provider (ids only — never config). */
  readonly nodeIds: readonly string[];
  readonly state: AgentConnectionProviderState;
  /** Whether THIS user may (re)connect — drives "Reconnect" vs "ask owner" copy. */
  readonly canReconnect: boolean;
  /** Safe reason code for `invalid` (token_expired | needs_reconnect | missing_scopes | disconnected | provider_disabled). */
  readonly reasonCode?: string;
}

/**
 * The connection signal handed to readiness:
 *   - `disabled`  — connection not checked (logged-out local-only builder / no account).
 *   - `loading`   — the server resolve is in flight (never claim connected yet).
 *   - `error`     — the resolve failed (unknown; never claim connected).
 *   - `resolved`  — the authoritative per-provider verdict.
 */
export type AgentConnectionSignal =
  | { readonly state: "disabled" }
  | { readonly state: "loading" }
  | { readonly state: "error" }
  | {
      readonly state: "resolved";
      readonly providers: readonly AgentConnectionProvider[];
      readonly allConnected: boolean;
    };

export interface ComputeAgentReadinessInput {
  /** True while a readiness target exists (an edit preview is active, or a just-applied draft). */
  readonly active: boolean;
  /** Builder validation issues for the END-STATE (candidate while previewing, else the live draft). */
  readonly validationIssues: readonly ReadinessValidationIssue[];
  /** Optional nodeId → friendly label, for grouping display. */
  readonly nodeLabels?: ReadonlyMap<string, string>;
  /** The change adds / removes / replaces a trigger or edits trigger config. */
  readonly triggerChanged: boolean;
  /** The live workflow is currently `active`. */
  readonly workflowActive: boolean;
  /** A safe in-builder test run is possible (manual trigger, viewer may run, not local-only). */
  readonly canTest: boolean;
  /** When `canTest` is false, the plain-English capability reason. */
  readonly testDisabledReason?: string;
  /** Server-resolved connection signal. */
  readonly connection: AgentConnectionSignal;
  /** Latest run/test status for the change. */
  readonly lastTestStatus: AgentReadinessTestStatus;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/** Builder validation codes that are structural graph breaks. */
const GRAPH_VALIDATION_CODES: ReadonlySet<string> = new Set([
  "no_trigger",
  "multiple_triggers",
  "unreachable_node",
  "stale_edge",
  "self_loop_edge",
  "router_routes_invalid",
]);

function reasonLabel(code: string | undefined): string {
  switch (code) {
    case "token_expired":
      return "the connection expired";
    case "needs_reconnect":
      return "the connection needs to be reconnected";
    case "missing_scopes":
      return "the connection is missing required permissions";
    case "disconnected":
      return "the connection was disconnected";
    case "provider_disabled":
      return "this app isn't available";
    default:
      return "the connection needs attention";
  }
}

function mapValidationIssue(
  issue: ReadinessValidationIssue,
  nodeLabels: ReadonlyMap<string, string> | undefined,
): AgentReadinessBlocker {
  const nodeLabel = issue.nodeId ? nodeLabels?.get(issue.nodeId) : undefined;
  const base = {
    ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
    ...(nodeLabel ? { nodeLabel } : {}),
    ...(issue.fieldName ? { fieldPath: issue.fieldName } : {}),
    message: issue.message,
  };

  if (issue.code === "missing_required_field") {
    return {
      ...base,
      kind: "missing_required_field",
      nextStep: "Fill in the required field, then check again.",
      blocking: true,
    };
  }
  if (issue.code === "unconfigured_node") {
    return {
      ...base,
      kind: "missing_required_field",
      nextStep: "Choose the action/trigger for this step.",
      blocking: true,
    };
  }
  if (issue.code === "broken_variable_reference") {
    // The builder treats this as a soft warning at SAVE time, but for "can this
    // RUN?" a reference to a deleted step cannot resolve and the write-path
    // (Activate / Publish) gate rejects it — so readiness treats it as blocking.
    return {
      ...base,
      kind: "unresolved_variable",
      nextStep: "Re-pick the value from an existing step, or clear it.",
      blocking: true,
    };
  }
  if (GRAPH_VALIDATION_CODES.has(issue.code)) {
    return {
      ...base,
      kind: "invalid_graph",
      nextStep: "Fix the workflow structure (trigger and step connections).",
      blocking: true,
    };
  }
  // Unknown error codes are still surfaced (fail-safe blocking when severity=error).
  return {
    ...base,
    kind: issue.severity === "error" ? "setup_warning" : "unknown",
    nextStep: "Review this issue before running.",
    blocking: issue.severity === "error",
  };
}

function mapConnectionProvider(p: AgentConnectionProvider): AgentReadinessBlocker | null {
  if (p.state === "connected") return null;
  const name = p.name ?? p.provider;
  const firstNode = p.nodeIds[0];
  const extra = p.nodeIds.length > 1 ? ` (${p.nodeIds.length} steps)` : "";
  if (p.state === "missing") {
    return {
      ...(firstNode ? { nodeId: firstNode } : {}),
      kind: "missing_connection",
      message: `${name} isn't connected${extra}.`,
      nextStep: `Connect ${name} in Apps.`,
      blocking: true,
    };
  }
  // invalid
  return {
    ...(firstNode ? { nodeId: firstNode } : {}),
    kind: "invalid_connection",
    message: `${name}: ${reasonLabel(p.reasonCode)}${extra}.`,
    nextStep: p.canReconnect
      ? `Reconnect ${name} in Apps.`
      : `Ask a workspace owner to reconnect ${name}.`,
    blocking: true,
  };
}

// ── Compute ──────────────────────────────────────────────────────────────────

const SETUP_BLOCKER_KINDS: ReadonlySet<AgentReadinessBlockerKind> = new Set([
  "missing_required_field",
]);

function titleFor(status: AgentReadinessStatus): string {
  switch (status) {
    case "not_ready":
      return "Not ready yet";
    case "ready_to_test":
      return "Ready to test";
    case "ready_to_activate":
      return "Ready to activate";
    case "blocked":
      return "Blocked";
    case "unknown":
      return "Readiness unavailable";
  }
}

function countSummary(blockers: readonly AgentReadinessBlocker[]): string {
  const n = blockers.length;
  if (n === 0) return "";
  const noun = n === 1 ? "issue" : "issues";
  const first = blockers[0]!;
  return n === 1
    ? first.message
    : `${n} ${noun} to resolve. First: ${first.message}`;
}

/**
 * Produce the readiness verdict from deterministic signals. See module header for
 * the no-leak + source-of-truth contract.
 */
export function computeAgentReadiness(
  input: ComputeAgentReadinessInput,
): AgentReadinessVerdict {
  if (!input.active) {
    return {
      status: "unknown",
      title: titleFor("unknown"),
      summary: "No change to review.",
      blockers: [],
      warnings: [],
      nextActions: [],
      lastTestStatus: input.lastTestStatus,
    };
  }

  const blockers: AgentReadinessBlocker[] = [];
  const warnings: AgentReadinessBlocker[] = [];

  // 1. Validation issues (graph + required fields + broken variables).
  for (const issue of input.validationIssues) {
    const mapped = mapValidationIssue(issue, input.nodeLabels);
    (mapped.blocking ? blockers : warnings).push(mapped);
  }

  // 2. Connection signal (only when authoritatively resolved — never claim from loading/error).
  const connectionResolved = input.connection.state === "resolved";
  if (input.connection.state === "resolved") {
    for (const p of input.connection.providers) {
      const mapped = mapConnectionProvider(p);
      if (mapped) blockers.push(mapped);
    }
  } else if (input.connection.state === "loading") {
    warnings.push({
      kind: "setup_warning",
      message: "Checking app connections…",
      nextStep: "Hang tight while ChainReact verifies your connections.",
      blocking: false,
    });
  } else if (input.connection.state === "error") {
    warnings.push({
      kind: "setup_warning",
      message: "Couldn't verify app connections.",
      nextStep: "Connections will be re-checked when you test or activate.",
      blocking: false,
    });
  }

  // 3. Lifecycle: changing an activatable trigger on an ACTIVE workflow can't be
  // tested/activated automatically — it needs Reactivate → Resume.
  const activeTriggerChange = input.workflowActive && input.triggerChanged;
  if (activeTriggerChange) {
    blockers.push({
      kind: "lifecycle_warning",
      message: "This changes the trigger on an active workflow.",
      nextStep: "Save to deactivate, then Reactivate and Resume to go live again.",
      blocking: true,
    });
  }

  // 4. Test outcome.
  if (input.lastTestStatus === "failed") {
    blockers.push({
      kind: "test_failed",
      message: "The last test run failed.",
      nextStep: "Fix the failing step, then run the test again.",
      blocking: true,
    });
  }

  // ── Status ────────────────────────────────────────────────────────────────
  let status: AgentReadinessStatus;
  if (blockers.length > 0) {
    const allSetup = blockers.every((b) => SETUP_BLOCKER_KINDS.has(b.kind));
    status = allSetup ? "not_ready" : "blocked";
  } else {
    // No blockers. Connection must be verified-all-connected (or not-applicable on
    // the logged-out local builder) before we may claim activate-readiness.
    const connectionOkForActivate =
      input.connection.state === "disabled" ||
      (input.connection.state === "resolved" && input.connection.allConnected);

    if (input.lastTestStatus === "passed" && connectionOkForActivate) {
      status = "ready_to_activate";
    } else if (input.canTest && connectionResolved) {
      // Connections verified clean and the change is testable → invite a test.
      status = "ready_to_test";
    } else if (input.canTest) {
      // Testable, but connections still verifying — testing will exercise them.
      status = "ready_to_test";
    } else if (connectionOkForActivate) {
      // Not testable in-builder (e.g. webhook trigger) and connections are good →
      // a passed test is not a gate here; the next step is to activate.
      status = "ready_to_activate";
    } else {
      // Not testable AND connections not yet verified → wait before claiming ready.
      status = "not_ready";
    }
  }

  // ── Next actions ────────────────────────────────────────────────────────────
  const nextActions: AgentReadinessNextAction[] = [];
  const kinds = new Set(blockers.map((b) => b.kind));
  if (kinds.has("missing_required_field")) nextActions.push("fill_missing_fields");
  if (kinds.has("missing_connection")) nextActions.push("connect_app");
  if (kinds.has("invalid_connection")) nextActions.push("reconnect_app");
  if (kinds.has("unresolved_variable")) nextActions.push("resolve_variables");
  if (kinds.has("invalid_graph") || kinds.has("lifecycle_warning")) {
    nextActions.push("review_changes");
  }
  if (kinds.has("test_failed")) nextActions.push("retest_after_fix");
  if (status === "ready_to_test") nextActions.push("test_workflow");
  if (status === "ready_to_activate") nextActions.push("activate_workflow");

  // ── Summary copy ──────────────────────────────────────────────────────────
  let summary: string;
  if (status === "ready_to_activate") {
    summary =
      input.lastTestStatus === "passed"
        ? "Test passed. Required fields are filled and connections are ready."
        : "Required fields are filled and connections are ready.";
  } else if (status === "ready_to_test") {
    summary = connectionResolved
      ? "All required fields are filled and connections are ready. Run a test to confirm."
      : "All required fields are filled. Run a test to confirm.";
  } else {
    summary = countSummary(blockers);
  }

  return {
    status,
    title: titleFor(status),
    summary,
    blockers,
    warnings,
    nextActions,
    lastTestStatus: input.lastTestStatus,
  };
}
