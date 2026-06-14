/**
 * Persistent Builder Agent thread / workflow-scoped chat history client
 * (Slice 4.AI-23; extracted from the monolithic `lib/api/ai.ts` in Slice
 * 4.AI-REPAIR-CLEANUP-1 — refactor only, no behavior change).
 *
 * The React Agent rail loads its prior conversation through
 * `getBuilderAgentThread(workflowId)`, appends each chat-rendered message via
 * `appendBuilderAgentMessage(...)`, and clears the thread on the panel's "Clear
 * conversation" / "Plan another change" handler via
 * `clearBuilderAgentThread(...)`.
 *
 * Persistence is INTENTIONALLY a separate surface from `planWorkflow` /
 * `applyWorkflowPatch` — the plan/apply routes never persist on their own (the
 * AI-11/AI-21 invariant). This client/server pair is the only place Builder Agent
 * chat history is written.
 *
 * The persisted-message shape mirrors the sanitized projection the server
 * stores: `role` + `kind` + optional `content` + an allowlisted `safePayload`
 * projection of the AI route result. NEVER include `proposedPatch`, raw model
 * output, raw configs, secrets, or tokens — the server sanitizer drops them, but
 * the client should avoid even sending them.
 */

import { fetchJson } from "./shared";

export type BuilderAgentMessageRole = "user" | "assistant";

export type BuilderAgentMessageKind =
  | "prompt"
  | "followup"
  | "plan_result"
  | "needs_input"
  | "applied"
  | "apply_failure"
  | "error"
  | "system_notice";

export interface BuilderAgentPersistedMessage {
  readonly id: string;
  readonly role: BuilderAgentMessageRole;
  readonly kind: BuilderAgentMessageKind;
  readonly content: string | null;
  readonly safePayload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface BuilderAgentThreadSummary {
  readonly id: string;
  readonly workflowId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BuilderAgentThreadResponse {
  readonly thread: BuilderAgentThreadSummary;
  readonly messages: readonly BuilderAgentPersistedMessage[];
}

export interface AppendBuilderAgentMessageInput {
  readonly role: BuilderAgentMessageRole;
  readonly kind: BuilderAgentMessageKind;
  readonly content?: string | null;
  readonly safePayload?: Readonly<Record<string, unknown>> | null;
}

export async function getBuilderAgentThread(
  workflowId: string,
): Promise<BuilderAgentThreadResponse> {
  return fetchJson<BuilderAgentThreadResponse>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/thread`,
    { method: "GET" },
  );
}

export async function appendBuilderAgentMessage(
  workflowId: string,
  input: AppendBuilderAgentMessageInput,
): Promise<BuilderAgentPersistedMessage> {
  const res = await fetchJson<{ readonly message: BuilderAgentPersistedMessage }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/thread/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return res.message;
}

export async function clearBuilderAgentThread(
  workflowId: string,
): Promise<{ readonly ok: boolean; readonly deletedCount: number }> {
  return fetchJson<{ ok: boolean; deletedCount: number }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/ai/thread`,
    { method: "DELETE" },
  );
}
