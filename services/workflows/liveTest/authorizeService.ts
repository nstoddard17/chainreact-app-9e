import { randomUUID } from "node:crypto";
import * as workflowsRepo from "@/repositories/workflows";
import * as sessionsRepo from "@/repositories/liveTest/workflowLiveTestSessions";
import * as accountBillingRepo from "@/repositories/accountBilling";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isAccountFrozen } from "@/services/accounts/accountFreeze";
import { checkWorkflowReadiness } from "@/services/workflows/executionReadiness";
import { collectConnectionBindings, connectionIdsEqual } from "./connectionBindings";
import { computeWorkflowFingerprint } from "./workflowFingerprint";
import type { AuthorizeLiveTestResult } from "./types";

/**
 * Atomic live-test execution authorization (WORKFLOW-LIVE-TEST-3 §12).
 *
 * INTERNAL ONLY — no route exposes this; trusted server workers call it after a capture. It is
 * the single place a captured session becomes a run, and the full §12 checklist happens here, in
 * order, ALL server-derived:
 *
 *   re-read session → re-read saved workflow → recompute fingerprint → recompute bindings →
 *   revalidate readiness → revalidate membership → account freeze → task-limit CHECK (read-only)
 *   → atomic claim via `authorize_live_test_run`.
 *
 * The RPC is the concurrency + crash authority: claim, canonical queued-run insert, and consume
 * are ONE transaction, so duplicate captures, request retries, and concurrent workers converge
 * on the SAME run id — a second run is impossible, and a crash leaves either nothing or a fully
 * paired session+run.
 *
 * USAGE (§15): the limit check here is READ-ONLY (`getUsage`) — refusing BEFORE the session is
 * consumed leaves it recoverable in trigger_received until its TTL (upgrade → retry works). The
 * authoritative DEDUCTION stays where it always was: the engine's `executionBillingGate` at run
 * start, which receives the GATING flag (real execution ⇒ bills; a live test is never free
 * merely because the run row is labeled is_test). Nothing is deducted twice and nothing here
 * invents a billing rule.
 */
export async function authorizeLiveTestExecution(input: {
  sessionId: string;
}): Promise<AuthorizeLiveTestResult> {
  const session = await sessionsRepo.getSessionById(input.sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };

  // Retry convergence without touching the database claim: an already-consumed session answers
  // with its one run.
  if (session.consumedAt !== null && session.workflowRunId !== null) {
    return { ok: true, runId: session.workflowRunId, alreadyAuthorized: true };
  }
  if (session.status === "cancelled") return { ok: false, reason: "cancelled" };
  if (session.status === "expired" || Date.parse(session.expiresAt) <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (session.status !== "trigger_received") {
    return { ok: false, reason: "not_eligible", status: session.status };
  }

  // ── Revalidate EVERYTHING against saved state (nothing client-supplied) ────
  const workflow = await workflowsRepo.getByIdServiceRole(session.workflowId);
  if (!workflow || workflow.state === "deleted") return { ok: false, reason: "session_not_found" };

  const role = await requireAccountRole(session.userId, session.accountId, [
    "owner",
    "admin",
    "member",
  ]);
  if (!role.ok) {
    await failFromTriggerReceived(session.id, "not_authorized", "The consenting user is no longer a member of this account.");
    return { ok: false, reason: "not_authorized" };
  }

  const readiness = checkWorkflowReadiness(workflow.draftDefinition);
  if (readiness) {
    await failFromTriggerReceived(session.id, "not_ready", "The workflow is no longer ready to run.");
    return { ok: false, reason: "not_ready" };
  }

  const bindings = await collectConnectionBindings({
    accountId: workflow.accountId,
    definition: workflow.draftDefinition,
  });
  if (!bindings.ok) {
    if (bindings.reason === "no_trigger") {
      await failFromTriggerReceived(session.id, "stale_definition", "The workflow changed after the side effects were reviewed.");
      return { ok: false, reason: "stale_definition" };
    }
    await failFromTriggerReceived(
      session.id,
      "integration_unavailable",
      "A required connection is unavailable. Reconnect it and start a new live test.",
    );
    return { ok: false, reason: "integration_unavailable", provider: bindings.provider };
  }
  if (!connectionIdsEqual(bindings.connectionIds, session.connectionIds)) {
    await failFromTriggerReceived(session.id, "stale_connections", "The connected apps changed after the side effects were reviewed.");
    return { ok: false, reason: "stale_connections" };
  }
  const hash = computeWorkflowFingerprint({
    workflowId: workflow.id,
    accountId: workflow.accountId,
    definition: workflow.draftDefinition,
    connectionIds: bindings.connectionIds,
  });
  if (hash !== session.definitionHash) {
    await failFromTriggerReceived(session.id, "stale_definition", "The workflow changed after the side effects were reviewed.");
    return { ok: false, reason: "stale_definition" };
  }

  // ── Usage limits: READ-ONLY check; session stays recoverable on refusal ────
  if (await isAccountFrozen(session.accountId)) {
    await failFromTriggerReceived(session.id, "not_authorized", "This account is not available.");
    return { ok: false, reason: "not_authorized" };
  }
  const billingMode = await accountBillingRepo.getBillingModeServiceRole(session.accountId);
  if (billingMode !== "internal_free") {
    const usage = await accountBillingRepo.getUsage(session.accountId);
    if (usage && usage.tasksLimit >= 0 && usage.tasksUsed >= usage.tasksLimit) {
      // Deliberately NOT a session failure: trigger_received survives until its TTL so an
      // upgraded account can retry the SAME captured event without re-capturing.
      return { ok: false, reason: "usage_limit_reached" };
    }
  }

  // ── Atomic claim + canonical queued run + consume (one transaction) ────────
  const outcome = await sessionsRepo.authorizeExecution({
    sessionId: session.id,
    runId: randomUUID(),
    enqueuedAt: new Date().toISOString(),
  });
  if (outcome.ok) {
    return { ok: true, runId: outcome.runId, alreadyAuthorized: outcome.alreadyAuthorized };
  }
  switch (outcome.reason) {
    case "not_found":
      return { ok: false, reason: "session_not_found" };
    case "cancelled":
      return { ok: false, reason: "cancelled" };
    case "expired":
      return { ok: false, reason: "expired" };
    case "missing_captured_event":
    case "not_eligible":
      return { ok: false, reason: "not_eligible", status: session.status };
  }
}

async function failFromTriggerReceived(
  sessionId: string,
  code: "stale_definition" | "stale_connections" | "not_ready" | "not_authorized" | "integration_unavailable",
  message: string,
): Promise<void> {
  await sessionsRepo.failSession({
    sessionId,
    failureCode: code,
    failureMessage: message,
    fromStatuses: ["trigger_received"],
  });
}
