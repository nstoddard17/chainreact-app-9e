import { NextResponse } from "next/server";
import { z } from "zod";
import { getById } from "@/repositories/workflows";
import { appendMessageForWorkflow } from "@/repositories/builderAgentThreads";
import {
  sanitizeAgentMessageForPersist,
  SanitizeAgentMessageError,
} from "@/services/ai/builderAgent/sanitizeAgentMessage";
import {
  buildPersistenceErrorBody,
  formatPersistenceErrorForDev,
} from "@/core/ai/builderAgentPersistenceDiagnostics";
import { parseJsonBody, requireUser } from "../../../../_shared";

/**
 * POST /api/workflows/[id]/ai/thread/messages — append one sanitized message
 * to the persistent Builder Agent thread for the (user, workflow) pair
 * (Slice 4.AI-23).
 *
 * The client (React Agent panel) explicitly persists each chat-rendered
 * message via this route — see `features/workflow-builder/hooks/useBuilderAi.ts`.
 * The server NEVER trusts the client: it re-validates the role/kind allowlist
 * and re-sanitizes `content` + `safePayload` server-side before insert.
 *
 * The validation here intentionally STRIPS unknown / forbidden top-level keys
 * via `.passthrough()` + sanitizer instead of rejecting them; that keeps the
 * client + server forward-compatible if the planner adds a new safe field
 * before the server's allowlist learns about it. (Strict rejection happens
 * only for the role/kind enum + obvious shape errors.) Secrets / proposedPatch
 * / raw config keys never reach the database because the sanitizer drops them
 * regardless of the schema-validation outcome.
 */

const SafePayloadSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .nullable();

const AppendMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  kind: z.enum([
    "prompt",
    "followup",
    "plan_result",
    "needs_input",
    "applied",
    "apply_failure",
    "error",
    "system_notice",
  ]),
  content: z.string().nullable().optional(),
  safePayload: SafePayloadSchema,
});

export async function POST(
  request: Request,
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

  const body = await parseJsonBody(request, AppendMessageSchema);
  if (!body.ok) return body.response;

  let sanitized;
  try {
    sanitized = sanitizeAgentMessageForPersist({
      role: body.data.role,
      kind: body.data.kind,
      content: body.data.content ?? null,
      safePayload: body.data.safePayload ?? null,
    });
  } catch (err) {
    if (err instanceof SanitizeAgentMessageError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Could not sanitize message for persistence." },
      { status: 400 },
    );
  }

  // AI-25 follow-up — log a dev-friendly diagnostic on persistence
  // failure (missing AI-23 migration in local dev surfaces as a
  // schema-cache error here). Return a structured 500 so the client
  // can distinguish persistence failures from auth / validation.
  let record;
  try {
    record = await appendMessageForWorkflow({
      userId: auth.userId,
      workflowId: id,
      message: sanitized,
    });
  } catch (err) {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      console.error(
        formatPersistenceErrorForDev(err, {
          route: "POST /api/workflows/[id]/ai/thread/messages",
          op: "append",
        }),
      );
    }
    return NextResponse.json(
      buildPersistenceErrorBody(err, "Failed to persist Builder Agent message."),
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      message: {
        id: record.id,
        role: record.role,
        kind: record.kind,
        content: record.content,
        safePayload: record.safePayload,
        createdAt: record.createdAt,
      },
    },
    { status: 201 },
  );
}
