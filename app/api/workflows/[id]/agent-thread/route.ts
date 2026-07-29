import { NextResponse } from "next/server";
import {
  AGENT_THREAD_MESSAGE_LIMIT,
  AppendAgentMessageRequestSchema,
  type GetAgentThreadResponse,
  type PersistedAgentMessage,
} from "@/contracts/builderAgentMessage";
import {
  appendMessageForWorkflow,
  clearThreadForWorkflow,
  getOrCreateThreadForWorkflow,
  listMessagesForWorkflow,
  type BuilderAgentMessageRecord,
} from "@/repositories/builderAgentThreads";
import {
  SanitizeAgentMessageError,
  sanitizeAgentMessageForPersist,
} from "@/services/ai/builderAgent/sanitizeAgentMessage";
import { buildPersistenceErrorBody } from "@/core/ai/builderAgentPersistenceDiagnostics";
import { loadWorkflowForMember, parseJsonBody, requireUser } from "../../_shared";

/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — the workflow-scoped React Agent
 * conversation thread.
 *
 *   GET    → restore the transcript for this workflow (deterministic, no model
 *            call, no AI credits — reading history is never a billable event).
 *   POST   → append ONE sanitized turn (idempotent on `clientMessageId`).
 *   DELETE → clear the transcript (the thread row survives).
 *
 * Thin shell, in the house pattern: auth → account-member gate (404 no-leak,
 * so a non-member cannot even learn the workflow exists) → sanitize → repository.
 * `user_id` comes from the session and `workflow_id` from the route param; the
 * request body never supplies ownership. RLS (own user AND membership in the
 * workflow's account) is the backstop underneath the explicit gate.
 *
 * Nothing here restores a guided stage: the stage is derived from the saved
 * workflow + current readiness, and this route deliberately has no concept of it.
 */

function toDto(record: BuilderAgentMessageRecord): PersistedAgentMessage {
  return {
    id: record.id,
    role: record.role,
    kind: record.kind,
    content: record.content,
    safePayload: record.safePayload,
    clientMessageId: record.clientMessageId,
    requestId: record.requestId,
    agentChangeId: record.agentChangeId,
    baseGraphVersion: record.baseGraphVersion,
    proposal: record.proposal,
    createdAt: record.createdAt,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  try {
    const messages = await listMessagesForWorkflow(auth.userId, id, {
      limit: AGENT_THREAD_MESSAGE_LIMIT,
    });
    const thread = await getOrCreateThreadForWorkflow({
      userId: auth.userId,
      workflowId: id,
    });
    const body: GetAgentThreadResponse = {
      thread: {
        id: thread.id,
        workflowId: thread.workflowId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      messages: messages.map(toDto),
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      buildPersistenceErrorBody(err, "Couldn't load the conversation."),
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody(request, AppendAgentMessageRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  let sanitized;
  try {
    sanitized = sanitizeAgentMessageForPersist({
      role: parsed.data.role,
      kind: parsed.data.kind,
      content: parsed.data.content ?? null,
      safePayload: parsed.data.safePayload ?? null,
      clientMessageId: parsed.data.clientMessageId ?? null,
      requestId: parsed.data.requestId ?? null,
      agentChangeId: parsed.data.agentChangeId ?? null,
      baseGraphVersion: parsed.data.baseGraphVersion ?? null,
      proposal: parsed.data.proposal ?? null,
    });
  } catch (err) {
    if (err instanceof SanitizeAgentMessageError) {
      return NextResponse.json(
        { error: "Message could not be stored.", code: err.code },
        { status: 400 },
      );
    }
    throw err;
  }

  try {
    const record = await appendMessageForWorkflow({
      userId: auth.userId,
      workflowId: id,
      message: sanitized,
    });
    return NextResponse.json(toDto(record), { status: 201 });
  } catch (err) {
    return NextResponse.json(
      buildPersistenceErrorBody(err, "Couldn't save the conversation."),
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const loaded = await loadWorkflowForMember(id, auth.userId);
  if (!loaded.ok) return loaded.response;

  try {
    const { deletedCount } = await clearThreadForWorkflow(auth.userId, id);
    return NextResponse.json({ deletedCount });
  } catch (err) {
    return NextResponse.json(
      buildPersistenceErrorBody(err, "Couldn't clear the conversation."),
      { status: 500 },
    );
  }
}
