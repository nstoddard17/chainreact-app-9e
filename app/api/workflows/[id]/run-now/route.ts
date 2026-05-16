import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import * as workflowsRepo from "@/repositories/workflows";
import { enqueueRun } from "@/services/execution/enqueue";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
  ManualTriggerPayloadSchema,
} from "@/integrations/native/triggers/manualTrigger";
import { requireUser } from "../../_shared";

/**
 * POST /api/workflows/[id]/run-now — Native-nodes Slice 2 Commit 1.
 *
 * Manual-trigger entry point per
 * docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §4 (NPD-N1).
 *
 * Authentication / authorization:
 *   - `requireUser()` — signed-in Supabase user only (401 otherwise).
 *   - Owner-only check: `workflow.userId === auth.userId` (403 otherwise).
 *   - Workflow state ∈ {active, paused, draft}. Other states return 409.
 *
 * Body:
 *   - JSON, schema-validated against ManualTriggerPayloadSchema.
 *   - Cap 256 KiB via the `content-length` header — exceeds → 413.
 *   - Missing body / `{}` defaults to `{ inputs: {} }`.
 *
 * Output:
 *   - 202 Accepted — `{ runId, enqueuedAt }`. Engine runs asynchronously
 *     after enqueue; failures surface via workflow_runs.status + the
 *     existing notification orchestrator.
 *
 * Bypasses `dispatchTriggerEvent` (which does dedup + state gate +
 * trigger_resources lookup) because the route already knows
 * `workflowId + triggerNodeId` from the URL + workflow lookup, has
 * authenticated the caller, and the state gate is enforced here.
 */

const BODY_BYTES_CAP = 256 * 1024;

const ALLOWED_STATES: ReadonlySet<string> = new Set([
  "active",
  "paused",
  "draft",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const workflow = await workflowsRepo.getById(id);
  if (!workflow || workflow.state === "deleted") {
    return NextResponse.json(
      { error: "Workflow not found." },
      { status: 404 },
    );
  }
  if (workflow.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!ALLOWED_STATES.has(workflow.state)) {
    return NextResponse.json(
      {
        error: `Workflow state '${workflow.state}' does not accept run-now.`,
        state: workflow.state,
      },
      { status: 409 },
    );
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (
    contentLengthHeader !== null &&
    Number(contentLengthHeader) > BODY_BYTES_CAP
  ) {
    return NextResponse.json(
      { error: "Payload too large." },
      { status: 413 },
    );
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    rawBody = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = ManualTriggerPayloadSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid manual trigger payload.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const triggerNode = workflow.draftDefinition.nodes.find(
    (n) =>
      n.kind === "trigger" &&
      n.provider === MANUAL_TRIGGER_PROVIDER &&
      n.type === MANUAL_TRIGGER_EVENT_TYPE,
  );
  if (!triggerNode) {
    return NextResponse.json(
      { error: "Workflow has no manual_trigger node." },
      { status: 422 },
    );
  }

  const event: TriggerEvent = {
    provider: MANUAL_TRIGGER_PROVIDER,
    eventType: MANUAL_TRIGGER_EVENT_TYPE,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    accountId: "system",
    payload: parsed.data,
  };

  const enqueued = await enqueueRun({
    workflowId: workflow.id,
    triggerNodeId: triggerNode.id,
    event,
  });

  return NextResponse.json(
    { runId: enqueued.runId, enqueuedAt: enqueued.enqueuedAt },
    { status: 202 },
  );
}
