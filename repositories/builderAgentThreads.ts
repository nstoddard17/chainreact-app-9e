import { createClient } from "@/utils/supabase/server";
import type {
  AgentMessageKind,
  AgentMessageRole,
  SanitizedAgentMessage,
} from "@/contracts/builderAgentMessage";

/**
 * Repository for builder_agent_threads + builder_agent_messages (Slice 4.AI-23,
 * repaired + reused by REACT-AGENT-CONVERSATION-PERSISTENCE-1).
 *
 * Persistent React Agent threads (workflow-scoped conversation history). All
 * reads + writes go through the SSR-cookie client so RLS gates every row to
 * `auth.uid() = user_id` AND membership in the workflow's account — no
 * service-role escape hatch is needed because persistence happens IN the
 * user-authenticated route. The repository copies `(user_id, workflow_id)` from
 * the thread row onto every message at insert time so the RLS predicate stays
 * cheap (no JOIN through threads).
 *
 * NEVER persist raw model outputs / proposedPatch / configs / secrets — the
 * sanitizer at `services/ai/builderAgent/sanitizeAgentMessage.ts` is the only
 * surface that produces `SanitizedAgentMessage`, and this layer accepts that
 * type ONLY. Routes must sanitize before reaching here.
 */

export interface BuilderAgentThreadRecord {
  id: string;
  userId: string;
  workflowId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface BuilderAgentMessageRecord {
  id: string;
  threadId: string;
  userId: string;
  workflowId: string;
  role: AgentMessageRole;
  kind: AgentMessageKind;
  content: string | null;
  safePayload: Readonly<Record<string, unknown>>;
  /** REACT-AGENT-CONVERSATION-PERSISTENCE-1 — idempotency key for this turn. */
  clientMessageId: string | null;
  requestId: string | null;
  /** Reference to the canonical `agent_change_history` lifecycle row. */
  agentChangeId: string | null;
  baseGraphVersion: string | null;
  proposal: Readonly<Record<string, unknown>> | null;
  createdAt: string;
}

interface BuilderAgentThreadsRow {
  id: string;
  user_id: string;
  workflow_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface BuilderAgentMessagesRow {
  id: string;
  thread_id: string;
  user_id: string;
  workflow_id: string;
  role: AgentMessageRole;
  kind: AgentMessageKind;
  content: string | null;
  safe_payload: Record<string, unknown>;
  client_message_id: string | null;
  request_id: string | null;
  agent_change_id: string | null;
  base_graph_version: string | null;
  proposal: Record<string, unknown> | null;
  created_at: string;
}

function threadRowToRecord(row: BuilderAgentThreadsRow): BuilderAgentThreadRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function messageRowToRecord(
  row: BuilderAgentMessagesRow,
): BuilderAgentMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    role: row.role,
    kind: row.kind,
    content: row.content,
    safePayload: row.safe_payload ?? {},
    clientMessageId: row.client_message_id ?? null,
    requestId: row.request_id ?? null,
    agentChangeId: row.agent_change_id ?? null,
    baseGraphVersion: row.base_graph_version ?? null,
    proposal: row.proposal ?? null,
    createdAt: row.created_at,
  };
}

// ── threads ────────────────────────────────────────────────────────────────

export interface GetOrCreateThreadInput {
  userId: string;
  workflowId: string;
}

/**
 * Idempotent get-or-create for the (user, workflow) thread row. The migration
 * declares `UNIQUE (user_id, workflow_id)` so the upsert/select pair is
 * race-safe at the DB level — a concurrent insert from a parallel tab returns
 * the existing row instead of creating a duplicate.
 */
export async function getOrCreateThreadForWorkflow(
  input: GetOrCreateThreadInput,
): Promise<BuilderAgentThreadRecord> {
  const supabase = await createClient();

  const existing = await supabase
    .from("builder_agent_threads")
    .select("*")
    .eq("user_id", input.userId)
    .eq("workflow_id", input.workflowId)
    .maybeSingle<BuilderAgentThreadsRow>();
  if (existing.error) {
    throw new Error(
      `builderAgentThreads.getOrCreateThreadForWorkflow read failed: ${existing.error.message}`,
    );
  }
  if (existing.data) return threadRowToRecord(existing.data);

  const created = await supabase
    .from("builder_agent_threads")
    .insert({ user_id: input.userId, workflow_id: input.workflowId })
    .select()
    .single<BuilderAgentThreadsRow>();
  if (created.error || !created.data) {
    // Lost a race: re-read.
    const reread = await supabase
      .from("builder_agent_threads")
      .select("*")
      .eq("user_id", input.userId)
      .eq("workflow_id", input.workflowId)
      .maybeSingle<BuilderAgentThreadsRow>();
    if (reread.data) return threadRowToRecord(reread.data);
    throw new Error(
      `builderAgentThreads.getOrCreateThreadForWorkflow insert failed: ${
        created.error?.message ?? "no row returned"
      }`,
    );
  }
  return threadRowToRecord(created.data);
}

// ── messages ───────────────────────────────────────────────────────────────

export interface ListMessagesOptions {
  /** Optional row cap (defense against unbounded history loads). Default 500. */
  limit?: number;
}

/**
 * List messages for the (user, workflow) thread in chronological order
 * (oldest first — the UI renders top-to-bottom).
 */
export async function listMessagesForWorkflow(
  userId: string,
  workflowId: string,
  opts: ListMessagesOptions = {},
): Promise<readonly BuilderAgentMessageRecord[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 500, 1_000);
  const { data, error } = await supabase
    .from("builder_agent_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(
      `builderAgentThreads.listMessagesForWorkflow failed: ${error.message}`,
    );
  }
  return (data ?? []).map((r) => messageRowToRecord(r as BuilderAgentMessagesRow));
}

export interface AppendMessageInput {
  userId: string;
  workflowId: string;
  /** Already-sanitized payload from `sanitizeAgentMessageForPersist`. */
  message: SanitizedAgentMessage;
}

/**
 * Append one sanitized message.
 *
 * IDEMPOTENT on `(thread_id, client_message_id)`: the migration declares a
 * partial UNIQUE index there, so a retried/duplicated POST for the same logical
 * turn returns the ALREADY-STORED row instead of adding a second transcript
 * entry. Messages stay immutable — a conflicting write is re-read, never
 * updated. Omitting the key falls back to a plain insert (legacy callers).
 */
export async function appendMessageForWorkflow(
  input: AppendMessageInput,
): Promise<BuilderAgentMessageRecord> {
  // Ensure a thread exists; reuse on repeat calls.
  const thread = await getOrCreateThreadForWorkflow({
    userId: input.userId,
    workflowId: input.workflowId,
  });
  const supabase = await createClient();
  const clientMessageId = input.message.clientMessageId;
  if (clientMessageId) {
    const existing = await supabase
      .from("builder_agent_messages")
      .select("*")
      .eq("thread_id", thread.id)
      .eq("client_message_id", clientMessageId)
      .maybeSingle<BuilderAgentMessagesRow>();
    if (existing.data) return messageRowToRecord(existing.data);
  }
  const { data, error } = await supabase
    .from("builder_agent_messages")
    .insert({
      thread_id: thread.id,
      user_id: input.userId,
      workflow_id: input.workflowId,
      role: input.message.role,
      kind: input.message.kind,
      content: input.message.content,
      safe_payload: input.message.safePayload,
      client_message_id: clientMessageId,
      request_id: input.message.requestId,
      agent_change_id: input.message.agentChangeId,
      base_graph_version: input.message.baseGraphVersion,
      proposal: input.message.proposal,
    })
    .select()
    .single<BuilderAgentMessagesRow>();
  if (error || !data) {
    // Lost an idempotency race with a concurrent tab: the unique index rejected
    // the duplicate, so the winning row is authoritative — re-read it.
    if (clientMessageId) {
      const reread = await supabase
        .from("builder_agent_messages")
        .select("*")
        .eq("thread_id", thread.id)
        .eq("client_message_id", clientMessageId)
        .maybeSingle<BuilderAgentMessagesRow>();
      if (reread.data) return messageRowToRecord(reread.data);
    }
    throw new Error(
      `builderAgentThreads.appendMessageForWorkflow failed: ${
        error?.message ?? "no row returned"
      }`,
    );
  }
  // Bump the thread's updated_at so the user_idx ordering stays meaningful.
  // Best-effort — we never block the message insert on the thread bump.
  await supabase
    .from("builder_agent_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", thread.id);
  return messageRowToRecord(data);
}

/**
 * Clear all messages for the (user, workflow) thread; the thread row itself
 * survives so (user, workflow) → thread mapping is stable across clears.
 * Idempotent: returns silently if no thread exists.
 */
export async function clearThreadForWorkflow(
  userId: string,
  workflowId: string,
): Promise<{ deletedCount: number }> {
  const supabase = await createClient();
  // Resolve thread → delete messages (FK ON DELETE CASCADE also works, but
  // we want to preserve the thread row, so DELETE FROM messages directly).
  const { data, error } = await supabase
    .from("builder_agent_messages")
    .delete()
    .eq("user_id", userId)
    .eq("workflow_id", workflowId)
    .select("id");
  if (error) {
    throw new Error(
      `builderAgentThreads.clearThreadForWorkflow failed: ${error.message}`,
    );
  }
  return { deletedCount: data?.length ?? 0 };
}
