import { NextResponse } from "next/server";
import { getById } from "@/repositories/workflows";
import {
  clearThreadForWorkflow,
  getOrCreateThreadForWorkflow,
  listMessagesForWorkflow,
} from "@/repositories/builderAgentThreads";
import {
  buildPersistenceErrorBody,
  formatPersistenceErrorForDev,
} from "@/core/ai/builderAgentPersistenceDiagnostics";
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

  // AI-25 follow-up — repo can throw if the AI-23 migration hasn't been
  // applied to the local DB ("Could not find the table … in the schema
  // cache"). Log a dev-friendly diagnostic so the missing-migration cause
  // is obvious in server output, and return a structured 500 the client
  // can recognize (separate from auth / not-found).
  let thread;
  let messages;
  try {
    thread = await getOrCreateThreadForWorkflow({
      userId: auth.userId,
      workflowId: id,
    });
    messages = await listMessagesForWorkflow(auth.userId, id);
  } catch (err) {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        formatPersistenceErrorForDev(err, {
          route: "GET /api/workflows/[id]/ai/thread",
          op: "load",
        }),
      );
    }
    return NextResponse.json(
      buildPersistenceErrorBody(err, "Failed to load Builder Agent thread."),
      { status: 500 },
    );
  }

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

  // AI-25 follow-up — same dev-visibility treatment as GET.
  let result;
  try {
    result = await clearThreadForWorkflow(auth.userId, id);
  } catch (err) {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        formatPersistenceErrorForDev(err, {
          route: "DELETE /api/workflows/[id]/ai/thread",
          op: "clear",
        }),
      );
    }
    return NextResponse.json(
      buildPersistenceErrorBody(err, "Failed to clear Builder Agent thread."),
      { status: 500 },
    );
  }
  return NextResponse.json(
    { ok: true, deletedCount: result.deletedCount },
    { status: 200 },
  );
}
