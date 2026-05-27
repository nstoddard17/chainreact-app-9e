import { NextResponse } from "next/server";
import { getById } from "@/repositories/workflows";
import {
  clearThreadForWorkflow,
  getOrCreateThreadForWorkflow,
  listMessagesForWorkflow,
} from "@/repositories/builderAgentThreads";
import { requireUser } from "../../../_shared";

/**
 * GET / DELETE /api/workflows/[id]/ai/thread — Builder Agent thread surface
 * (Slice 4.AI-23). Workflow-scoped persistent chat history for the React
 * Agent rail.
 *
 *   GET    → loads the (user, workflow) thread + its messages in chronological
 *            order. The route is the only place messages are read for UI; it
 *            never leaks raw model output / proposedPatch / config — the
 *            inserts already passed through the sanitizer and the response
 *            is shaped to a value-free public projection.
 *   DELETE → clears the persisted history. Idempotent: a clear on a never-
 *            opened workflow is a no-op (deletedCount: 0). The thread row
 *            itself survives so (user, workflow) → thread is stable.
 *
 * Auth: `requireUser` (401 on no session). Workflow ownership is verified
 * with `workflows.getById` + `record.userId === auth.userId` (404 on miss /
 * not owned — same no-existence-leak convention the plan / apply routes use).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || id.trim() === "") {
    return NextResponse.json({ error: "Workflow id is required." }, { status: 400 });
  }

  const workflow = await getById(id);
  if (!workflow || workflow.userId !== auth.userId) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const thread = await getOrCreateThreadForWorkflow({
    userId: auth.userId,
    workflowId: id,
  });
  const messages = await listMessagesForWorkflow(auth.userId, id);

  return NextResponse.json(
    {
      thread: {
        id: thread.id,
        workflowId: thread.workflowId,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        kind: m.kind,
        content: m.content,
        safePayload: m.safePayload,
        createdAt: m.createdAt,
      })),
    },
    { status: 200 },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || id.trim() === "") {
    return NextResponse.json({ error: "Workflow id is required." }, { status: 400 });
  }

  const workflow = await getById(id);
  if (!workflow || workflow.userId !== auth.userId) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  const result = await clearThreadForWorkflow(auth.userId, id);
  return NextResponse.json(
    { ok: true, deletedCount: result.deletedCount },
    { status: 200 },
  );
}
