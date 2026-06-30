/**
 * Trigger-smoke harness — REAL GitHub WEBHOOK deps (server-only test helper).
 *
 * Wires the injected `GitHubWebhookSmokeDeps` to the real V2 internals:
 *   - createActiveSmokeWorkflow → service-role INSERT into `workflows`
 *     (state="active" + draft_definition). Same pattern as the Slack/scheduled
 *     smokes; the activation API's preconditions are not part of the dispatch
 *     surface under test.
 *   - seedTriggerResource → DIRECT `triggerResourcesRepo.upsert` of the minimum
 *     row the receive route + dispatcher look up (provider `github`, eventType
 *     `new_commit`, keyed by workflowId+nodeId, empty config = no branch filter).
 *     This DELIBERATELY does NOT run the real `registerWorkflowTriggers`, whose
 *     GitHub activation hook would call the GitHub API to CREATE a repo webhook
 *     (needs a connected integration + a real repo). NO GitHub API is touched.
 *   - deliverSyntheticEvent → builds a synthetic `push` body, signs it with the
 *     REAL `GITHUB_WEBHOOK_SECRET` (`X-Hub-Signature-256: sha256=<hex HMAC over the
 *     raw body>` — GitHub's documented scheme, production verification UNCHANGED),
 *     and POSTs it to the REAL `POST /api/webhooks/github?workflowId=&nodeId=` route
 *     (receive → verify → normalize → dispatchTriggerEvent → dedup → enqueue).
 *   - listRuns/readRun → service-role diagnostics readers (incl. non-terminal),
 *     surfacing the persisted `trigger_event` so identity is verifiable.
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow → DIRECT `triggerResourcesRepo.deleteByWorkflow` (NO
 *     deactivation hook → no GitHub API) + a service-role soft-delete of the
 *     workflow.
 *   - cleanupDedup → service-role delete of the synthetic webhook_event_dedup row.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { POST as githubWebhookRoute } from "@/app/api/webhooks/github/route";
import {
  GITHUB_NEW_COMMIT_EVENT_TYPE,
  type GitHubWebhookSmokeDeps,
  type GitHubWebhookSmokeIdentity,
  type GitHubWebhookSmokeRun,
} from "./githubWebhookSmoke";

export interface RealGitHubWebhookSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

function mapStatus(s: string | null | undefined): GitHubWebhookSmokeRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): GitHubWebhookSmokeRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

function buildSyntheticPushBody(identity: GitHubWebhookSmokeIdentity): string {
  // A minimal but realistic GitHub `push` payload. Every value is smoke-minted —
  // synthetic owner / repo / sha / message; no real repository or user data.
  return JSON.stringify({
    ref: "refs/heads/main",
    before: "0000000000000000000000000000000000000000",
    after: identity.commitSha,
    created: false,
    deleted: false,
    forced: false,
    repository: {
      full_name: identity.repoFullName,
      name: identity.repoName,
      owner: { login: identity.repoOwner, name: identity.repoOwner },
    },
    pusher: { name: identity.repoOwner, email: "smoke@example.invalid" },
    sender: { login: identity.repoOwner },
    head_commit: {
      id: identity.commitSha,
      message: identity.commitMessage,
      timestamp: "2026-06-29T00:00:00Z",
      author: { name: identity.repoOwner, email: "smoke@example.invalid", username: identity.repoOwner },
    },
    commits: [
      {
        id: identity.commitSha,
        message: identity.commitMessage,
        timestamp: "2026-06-29T00:00:00Z",
        author: { name: identity.repoOwner, email: "smoke@example.invalid", username: identity.repoOwner },
      },
    ],
  });
}

function signGitHubBody(rawBody: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

export function makeRealGitHubWebhookSmokeDeps(
  config: RealGitHubWebhookSmokeDepsConfig,
): GitHubWebhookSmokeDeps {
  const { supabase, accountId, userId } = config;

  return {
    mintIdentity(): GitHubWebhookSmokeIdentity {
      const rand = randomUUID().slice(0, 8);
      const owner = `crsmoke-owner-${rand}`;
      const name = `crsmoke-repo-${rand}`;
      // A 40-hex sha carrying the run marker (right-padded to a plausible sha length).
      const sha = (`crsmoke${rand}`.replace(/[^0-9a-f]/g, "0") + "0".repeat(40)).slice(0, 40);
      return {
        deliveryId: randomUUID(),
        repoOwner: owner,
        repoName: name,
        repoFullName: `${owner}/${name}`,
        commitSha: sha,
        commitMessage: `crsmoke synthetic commit ${rand}`,
        hookId: `crsmoke-hook-${rand}`,
      };
    },

    async createActiveSmokeWorkflow(workflow) {
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: workflow.name,
          state: "active",
          draft_definition: workflow.definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error(
          `github-webhook-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async seedTriggerResource({ workflowId, triggerNodeId }) {
      // DIRECT-SEED only — no activation hook, no GitHub API, no real webhook.
      await triggerResourcesRepo.upsert({
        workflowId,
        userId,
        provider: "github",
        eventType: GITHUB_NEW_COMMIT_EVENT_TYPE,
        nodeId: triggerNodeId,
        config: {},
      });
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      return { seededEventType: row?.eventType ?? null };
    },

    async deliverSyntheticEvent({ identity, workflowId, triggerNodeId }) {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        throw new Error("github-webhook-smoke: GITHUB_WEBHOOK_SECRET is not set.");
      }
      const rawBody = buildSyntheticPushBody(identity);
      const signature = signGitHubBody(rawBody, secret);
      const params = new URLSearchParams({ workflowId, nodeId: triggerNodeId });
      const request = new Request(
        `http://localhost/api/webhooks/github?${params.toString()}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-github-event": "push",
            "x-github-delivery": identity.deliveryId,
            "x-github-hook-id": identity.hookId,
            "x-hub-signature-256": signature,
          },
          body: rawBody,
        },
      );
      const res = await githubWebhookRoute(request);
      return { httpStatus: res.status };
    },

    async listRuns(workflowId) {
      const runs = await listByWorkflowServiceRole(workflowId, {
        includeRunning: true,
        limit: 50,
      });
      return runs.map(toSmokeRun);
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      return rec ? toSmokeRun(rec) : null;
    },

    async cleanupWorkflow(workflowId) {
      // Delete the direct-seeded trigger_resources row WITHOUT the deactivation
      // hook (which for GitHub would attempt a GitHub API webhook-delete). No
      // provider-side resource exists, so a direct delete is correct and safe.
      await triggerResourcesRepo.deleteByWorkflow(workflowId).catch(() => {});
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.github-webhook.cleanup_failed",
            workflowId,
            error: error.message,
          }),
        );
      }
    },

    async cleanupDedup(eventId) {
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "github")
        .eq("event_id", eventId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.github-webhook.dedup_cleanup_failed",
            error: error.message,
          }),
        );
      }
    },

    async sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}
