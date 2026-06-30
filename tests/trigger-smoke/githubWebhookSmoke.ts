/**
 * Trigger-smoke harness — GitHub WEBHOOK trigger dispatch path (Lane C, direct-seed).
 *
 * First DIRECT-SEEDED HMAC webhook smoke. Certifies the full real RECEIPT/DISPATCH
 * path for `github:new_commit` (canonical eventType `new_commit`) with a fully
 * synthetic, HMAC-signed GitHub push delivery.
 *
 * DIRECT-SEED CONTRACT (read this — it is the honest scope boundary):
 *   Unlike Slack (whose registration is a pure trigger_resources upsert with no
 *   activation hook), GitHub's real `registerWorkflowTriggers` runs an activation
 *   hook that calls the GitHub API to CREATE a repo webhook subscription (needs a
 *   connected integration + a real repository). That is OUT OF SCOPE and unsafe for
 *   a smoke. So this harness DIRECT-SEEDS the minimum `trigger_resources` row the
 *   receive route + dispatcher look up (provider `github`, eventType `new_commit`,
 *   keyed by workflowId + nodeId), WITHOUT running the activation hook and WITHOUT
 *   any GitHub API call. Cleanup deletes that row directly (no deactivation hook,
 *   so still no GitHub API).
 *
 *   THIS CERTIFIES: receive → HMAC verify → normalize → dispatchTriggerEvent →
 *   dedup → durable enqueue → drain → terminal run. THIS DOES NOT CERTIFY GitHub
 *   provider-side subscription activation (webhook create/delete via the GitHub API)
 *   — that is a separate, un-smoked surface. The cert is recorded honestly as a
 *   route/dispatch synthetic-webhook certification, not an activation certification.
 *
 * WHY github:new_commit:
 *   - HMAC-signed webhook (`X-Hub-Signature-256` = `sha256=<hex>` over the raw body,
 *     keyed with the global `GITHUB_WEBHOOK_SECRET` — a synthesizable secret),
 *   - the push payload is self-contained (normalize does NO provider fetch),
 *     and is fully smoke-minted (synthetic owner / repo / commit sha / message),
 *   - no commerce / billing, no send / broadcast, no raw bytes,
 *   - deterministic `X-GitHub-Delivery` UUID → dedup is provable.
 *
 * Real path per run:
 *   create active {github:new_commit → native no-op} workflow → DIRECT-SEED the
 *   trigger_resources row (assert event_type == `new_commit`) → BASELINE: 0 runs →
 *   build a synthetic `push` body, sign it with the REAL `GITHUB_WEBHOOK_SECRET`
 *   (Slack-parallel signer, production verification UNWEAKENED), POST it to the REAL
 *   `POST /api/webhooks/github?workflowId=&nodeId=` (real verify → normalize →
 *   dispatchTriggerEvent → dedup → enqueue) → exactly ONE run whose trigger_event
 *   identifies the synthetic delivery (deliveryId + repo + commit sha marker) →
 *   drain → terminal `succeeded` → RE-SEND the same delivery id → dedup keeps it at
 *   ONE run → delete the seeded trigger_resources row + workflow + synthetic dedup
 *   row → 0 leaked.
 *
 * Every DB / route / dispatch touchpoint is behind injected `GitHubWebhookSmokeDeps`
 * so this orchestrator is fully unit-testable with fakes; real wiring lives in
 * githubWebhookSmokeDeps.ts and only runs in the gated dev integration test.
 */
import {
  WorkflowDefinitionSchema,
  type WorkflowDefinition,
} from "@/contracts/workflowDefinition";

export const GITHUB_WEBHOOK_SMOKE_TRIGGER_NODE_ID = "smoke-github-webhook-trigger";
export const GITHUB_WEBHOOK_SMOKE_ACTION_NODE_ID = "smoke-noop-action";

/** Canonical dispatch event type for github:new_commit (bare; what normalize emits). */
export const GITHUB_NEW_COMMIT_EVENT_TYPE = "new_commit";

export interface GitHubWebhookSmokeWorkflow {
  readonly definition: WorkflowDefinition;
  readonly triggerNodeId: string;
  readonly actionNodeId: string;
  readonly name: string;
}

/** Build the smoke workflow: github:new_commit webhook trigger → native no-op. */
export function buildGitHubNewCommitSmokeWorkflow(): GitHubWebhookSmokeWorkflow {
  const definition = WorkflowDefinitionSchema.parse({
    nodes: [
      {
        id: GITHUB_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        kind: "trigger",
        provider: "github",
        type: GITHUB_NEW_COMMIT_EVENT_TYPE,
        // `repository` is a REQUIRED builder field — a fixed synthetic value
        // satisfies the pre-execution readiness gate (MISSING_REQUIRED_FIELDS).
        // It is NOT a real repo and the receive route never reads it (only the
        // optional `branch` filter is read at receipt); `branch` is left unset so
        // every synthetic push dispatches. The per-run synthetic repo identity
        // lives in the push payload, not here.
        config: { repository: "crsmoke-owner/crsmoke-repo" },
        position: { x: 0, y: 0 },
      },
      {
        id: GITHUB_WEBHOOK_SMOKE_ACTION_NODE_ID,
        kind: "action",
        provider: "native",
        // Unary is_falsy on a truthy literal with onFalse:"skip" → evaluates false →
        // engine takes the NULL branch → terminal 'succeeded', zero external effect.
        type: "if_then_condition",
        config: { input: "smoke", operator: "is_falsy", onFalse: "skip" },
        position: { x: 0, y: 160 },
      },
    ],
    edges: [
      {
        id: "smoke-github-webhook-edge",
        from: GITHUB_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
        to: GITHUB_WEBHOOK_SMOKE_ACTION_NODE_ID,
      },
    ],
  });
  return {
    definition,
    triggerNodeId: GITHUB_WEBHOOK_SMOKE_TRIGGER_NODE_ID,
    actionNodeId: GITHUB_WEBHOOK_SMOKE_ACTION_NODE_ID,
    name: "trigger-smoke:github:new_commit",
  };
}

/** Synthetic GitHub push identity — fully smoke-minted, no real repo / user / bytes. */
export interface GitHubWebhookSmokeIdentity {
  /** `X-GitHub-Delivery` UUID — deterministic dedup key + TriggerEvent.eventId. */
  readonly deliveryId: string;
  /** Synthetic repo owner login. */
  readonly repoOwner: string;
  /** Synthetic repo name. */
  readonly repoName: string;
  /** Synthetic `owner/repo` full name (TriggerEvent payload.repository). */
  readonly repoFullName: string;
  /** Synthetic head commit sha — carries the run marker. */
  readonly commitSha: string;
  /** Synthetic head commit message (smoke-minted, no real content). */
  readonly commitMessage: string;
  /** Synthetic `X-GitHub-Hook-ID`. */
  readonly hookId: string;
}

export interface GitHubWebhookSmokeRun {
  readonly runId: string;
  readonly status: "succeeded" | "failed" | "running" | "queued" | null;
  /** The run's persisted trigger event payload (normalized GitHub push). */
  readonly triggerPayload: Readonly<Record<string, unknown>> | null;
  /** The run's persisted TriggerEvent.eventId (= delivery UUID). */
  readonly eventId: string | null;
  /** The run's persisted TriggerEvent.eventType. */
  readonly eventType: string | null;
}

/** Does the fired run's persisted trigger event identify the synthetic delivery? */
function identityMatches(
  run: GitHubWebhookSmokeRun,
  identity: GitHubWebhookSmokeIdentity,
): boolean {
  if (run.eventId !== identity.deliveryId) return false;
  if (run.eventType !== GITHUB_NEW_COMMIT_EVENT_TYPE) return false;
  const payload = run.triggerPayload;
  if (!payload) return false;
  if (payload.eventName !== "push") return false;
  if (payload.repository !== identity.repoFullName) return false;
  const head = payload.head_commit as Record<string, unknown> | null | undefined;
  if (!head || typeof head !== "object") return false;
  return head.id === identity.commitSha;
}

export interface GitHubWebhookSmokeDeps {
  /** Mint a fresh, unique synthetic identity (unique delivery id per run for dedup). */
  mintIdentity(): GitHubWebhookSmokeIdentity;
  createActiveSmokeWorkflow(
    workflow: GitHubWebhookSmokeWorkflow,
  ): Promise<{ workflowId: string }>;
  /**
   * DIRECT-SEED the minimum trigger_resources row the receive route + dispatcher
   * look up (provider `github`, eventType `new_commit`, keyed by workflowId+nodeId).
   * Does NOT run the activation hook → NO GitHub API call, NO real webhook created.
   * Returns the stored event_type so the smoke proves it equals the dispatch key.
   */
  seedTriggerResource(input: {
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ seededEventType: string | null }>;
  /**
   * Build a synthetic `push` body, sign it with the REAL `GITHUB_WEBHOOK_SECRET`
   * (`sha256=<hex HMAC over raw body>`), and POST it through the REAL
   * `POST /api/webhooks/github?workflowId=&nodeId=` route (real verify → normalize →
   * dispatch). Returns the route's HTTP status.
   */
  deliverSyntheticEvent(input: {
    identity: GitHubWebhookSmokeIdentity;
    workflowId: string;
    triggerNodeId: string;
  }): Promise<{ httpStatus: number }>;
  listRuns(workflowId: string): Promise<readonly GitHubWebhookSmokeRun[]>;
  drainRun(runId: string): Promise<void>;
  readRun(runId: string): Promise<GitHubWebhookSmokeRun | null>;
  /** Soft-delete the smoke workflow + DELETE the seeded trigger_resources row
   * directly (no deactivation hook → no GitHub API). */
  cleanupWorkflow(workflowId: string): Promise<void>;
  /** Delete the synthetic dedup row (provider=github, event_id) — hygiene. */
  cleanupDedup(eventId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface GitHubWebhookSmokeOptions {
  readonly afterDeliverAttempts?: number;
  readonly afterDeliverSleepMs?: number;
  readonly dedupSettleMs?: number;
}

export interface GitHubWebhookSmokeResult {
  readonly outcome: "pass" | "fail" | "skip";
  readonly reason: string | null;
  readonly triggerLabel: string;
  readonly seededEventType: string | null;
  readonly baselineRunCount: number;
  readonly deliverHttpStatus: number | null;
  readonly afterRunCount: number;
  readonly identityMatched: boolean;
  readonly terminalStatus: GitHubWebhookSmokeRun["status"] | null;
  readonly afterRedeliverRunCount: number | null;
  readonly dedupProven: boolean;
  readonly eventId: string | null;
  readonly workflowId: string | null;
  readonly cleaned: boolean;
}

const LABEL = "github:new_commit";

export async function runGitHubWebhookSmoke(
  deps: GitHubWebhookSmokeDeps,
  opts: GitHubWebhookSmokeOptions = {},
): Promise<GitHubWebhookSmokeResult> {
  const ref: { workflowId: string | null; eventId: string | null } = {
    workflowId: null,
    eventId: null,
  };
  let result: GitHubWebhookSmokeResult;
  try {
    result = await runCore(deps, opts, ref);
  } catch (err) {
    result = base(ref, { outcome: "fail", reason: (err as Error).message });
  } finally {
    // Cleanup ALWAYS runs and is NOT masked. No provider-side resource exists (no
    // real GitHub webhook was created) — only smoke-owned DB rows (workflow,
    // direct-seeded trigger_resources, runs, dedup row).
    let cleaned = true;
    if (ref.workflowId) {
      cleaned =
        (await deps.cleanupWorkflow(ref.workflowId).then(() => true).catch(() => false)) &&
        cleaned;
    }
    if (ref.eventId) {
      cleaned =
        (await deps.cleanupDedup(ref.eventId).then(() => true).catch(() => false)) &&
        cleaned;
    }
    result = { ...result!, cleaned };
  }
  return result!;
}

function base(
  ref: { workflowId: string | null; eventId: string | null },
  over: Partial<GitHubWebhookSmokeResult> & { outcome: GitHubWebhookSmokeResult["outcome"] },
): GitHubWebhookSmokeResult {
  return {
    reason: null,
    triggerLabel: LABEL,
    seededEventType: null,
    baselineRunCount: 0,
    deliverHttpStatus: null,
    afterRunCount: 0,
    identityMatched: false,
    terminalStatus: null,
    afterRedeliverRunCount: null,
    dedupProven: false,
    eventId: ref.eventId,
    workflowId: ref.workflowId,
    cleaned: false,
    ...over,
  };
}

async function runCore(
  deps: GitHubWebhookSmokeDeps,
  opts: GitHubWebhookSmokeOptions,
  ref: { workflowId: string | null; eventId: string | null },
): Promise<GitHubWebhookSmokeResult> {
  const identity = deps.mintIdentity();
  ref.eventId = identity.deliveryId;

  // 1. Active smoke workflow watching github:new_commit.
  const workflow = buildGitHubNewCommitSmokeWorkflow();
  const { workflowId } = await deps.createActiveSmokeWorkflow(workflow);
  ref.workflowId = workflowId;

  // 2. DIRECT-SEED the trigger_resources row (no activation hook, no GitHub API).
  const { seededEventType } = await deps.seedTriggerResource({
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (seededEventType !== GITHUB_NEW_COMMIT_EVENT_TYPE) {
    return base(ref, {
      outcome: "fail",
      reason: `seeded trigger_resources event_type '${seededEventType ?? "null"}', expected '${GITHUB_NEW_COMMIT_EVENT_TYPE}'`,
      seededEventType,
    });
  }

  // 3. BASELINE — no event delivered yet ⇒ no runs.
  const baselineRuns = await deps.listRuns(workflowId);
  if (baselineRuns.length !== 0) {
    return base(ref, {
      outcome: "fail",
      reason: `baseline violation: ${baselineRuns.length} run(s) before any event delivery`,
      seededEventType,
      baselineRunCount: baselineRuns.length,
    });
  }

  // 4. Deliver the synthetic signed push through the REAL receive route.
  const { httpStatus } = await deps.deliverSyntheticEvent({
    identity,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (httpStatus !== 200) {
    return base(ref, {
      outcome: "fail",
      reason: `webhook route returned HTTP ${httpStatus}, expected 200`,
      seededEventType,
      deliverHttpStatus: httpStatus,
    });
  }

  // 5. Exactly one run, bounded re-list for DB read settle.
  const attempts = Math.max(1, opts.afterDeliverAttempts ?? 5);
  const sleepMs = Math.max(0, opts.afterDeliverSleepMs ?? 200);
  let afterRuns: readonly GitHubWebhookSmokeRun[] = [];
  for (let i = 0; i < attempts; i += 1) {
    afterRuns = await deps.listRuns(workflowId);
    if (afterRuns.length >= 1) break;
    if (i < attempts - 1 && sleepMs > 0) await deps.sleep(sleepMs);
  }
  if (afterRuns.length !== 1) {
    return base(ref, {
      outcome: "fail",
      reason: `expected exactly 1 run after delivery, got ${afterRuns.length}`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: afterRuns.length,
    });
  }

  // 6. The fired run must identify the synthetic delivery (deliveryId + repo + sha).
  const fired = afterRuns[0]!;
  if (!identityMatches(fired, identity)) {
    return base(ref, {
      outcome: "fail",
      reason: `fired run did not identify the synthetic delivery (eventId=${fired.eventId ?? "null"}, eventType=${fired.eventType ?? "null"})`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
    });
  }

  // 7. Drain → terminal 'succeeded'.
  await deps.drainRun(fired.runId);
  const terminal = await deps.readRun(fired.runId);
  const terminalStatus = terminal?.status ?? null;
  if (terminalStatus !== "succeeded") {
    return base(ref, {
      outcome: "fail",
      reason: `fired run did not reach terminal 'succeeded' (got ${terminalStatus ?? "null"})`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }

  // 8. DEDUP — re-send the SAME delivery id; dispatcher must drop it (stays 1 run).
  const redeliver = await deps.deliverSyntheticEvent({
    identity,
    workflowId,
    triggerNodeId: workflow.triggerNodeId,
  });
  if (redeliver.httpStatus !== 200) {
    return base(ref, {
      outcome: "fail",
      reason: `redeliver returned HTTP ${redeliver.httpStatus}, expected 200`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
    });
  }
  const settleMs = Math.max(0, opts.dedupSettleMs ?? 500);
  if (settleMs > 0) await deps.sleep(settleMs);
  const afterRedeliver = await deps.listRuns(workflowId);
  const dedupProven = afterRedeliver.length === 1;
  if (!dedupProven) {
    return base(ref, {
      outcome: "fail",
      reason: `dedup failed: ${afterRedeliver.length} run(s) after re-sending the same delivery id (expected 1)`,
      seededEventType,
      deliverHttpStatus: httpStatus,
      afterRunCount: 1,
      identityMatched: true,
      terminalStatus,
      afterRedeliverRunCount: afterRedeliver.length,
    });
  }

  return base(ref, {
    outcome: "pass",
    seededEventType,
    deliverHttpStatus: httpStatus,
    afterRunCount: 1,
    identityMatched: true,
    terminalStatus: "succeeded",
    afterRedeliverRunCount: afterRedeliver.length,
    dedupProven: true,
  });
}
