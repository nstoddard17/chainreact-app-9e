import { NextResponse } from "next/server";
import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";
import type { WorkflowCreatorContext } from "@/services/options/types";
import {
  diagnoseProviderConnection,
  noAccountAccessDto,
} from "@/services/diagnostics/integrationConnection";
import { applyDiagnosticsGate } from "../_shared";

/**
 * POST /api/internal/diagnostics/integration-connection — thin gated shell over
 * the `diagnoseProviderConnection` capability (Slice 4.MCP-STAGE-2B-2, CS-2;
 * brain extracted to `services/diagnostics/integrationConnection.ts`).
 *
 * The route owns ONLY the MCP-adapter boundary: the machine bearer gate
 * (`applyDiagnosticsGate` — default OFF → 404, prod-lock → 404, bad bearer → 401,
 * token never echoed), input validation, locator resolution, and JSON
 * serialization. All membership authz, personal-provider provenance, stored-state
 * reads, the pure derivation, and sanitized DTO assembly live in the capability
 * service, so the future React Agent can reuse the same brain in-process. No
 * `requireUser` (no cookie); the subject is the explicit `userId`.
 *
 * OPEN QUESTION (OQ-C, logged in the 2B-4 plan, NOT fixed here): the workflow →
 * creator/account resolution below uses `resolveWorkflowCreatorContext`, which
 * reads through the RLS-scoped `workflows.getById`. In a sessionless MCP call
 * there is no cookie, so a workflow-scoped lookup can degrade to
 * NO_ACCOUNT_ACCESS. The whole-workflow capability (`diagnoseWorkflowConnections`)
 * deliberately resolves via the SERVICE-ROLE `workflows.getByIdServiceRole`
 * instead; this single-provider route keeps its current RLS behavior unchanged.
 *
 * NEVER returned: token blobs, plaintext token, `connectedByUserId`,
 * `providerAccountId`, `displayName`, raw `accountMetadata`, the full granted
 * scope list, raw provider bodies, env, or the exact expiry timestamp.
 */

const PROVIDER_RE = /^[a-z][a-z0-9_-]*$/;

const badInput = (): NextResponse =>
  NextResponse.json({ error: "invalid_input" }, { status: 400 });

export async function POST(request: Request): Promise<Response> {
  const gate = applyDiagnosticsGate(request);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badInput();
  }
  if (typeof body !== "object" || body === null) return badInput();
  const b = body as Record<string, unknown>;

  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!userId) return badInput();

  const provider = typeof b.provider === "string" ? b.provider.trim() : "";
  if (!PROVIDER_RE.test(provider)) return badInput();

  const providedAccountId =
    typeof b.accountId === "string" && b.accountId.trim().length > 0
      ? b.accountId.trim()
      : null;
  const workflowId =
    typeof b.workflowId === "string" && b.workflowId.trim().length > 0
      ? b.workflowId.trim()
      : null;
  const integrationId =
    typeof b.integrationId === "string" && b.integrationId.trim().length > 0
      ? b.integrationId.trim()
      : null;

  // Exactly one locator is required.
  if (!providedAccountId && !workflowId) return badInput();

  // ── Resolve the account context (and creator provenance when workflow-scoped). ──
  let accountId: string | null = providedAccountId;
  let workflowCreator: WorkflowCreatorContext | null = null;
  if (workflowId) {
    workflowCreator = await resolveWorkflowCreatorContext(workflowId);
    if (workflowCreator === null) {
      // Can't establish the workflow's account → can't authorize. No row fetched.
      return NextResponse.json(noAccountAccessDto(provider, providedAccountId));
    }
    if (providedAccountId && providedAccountId !== workflowCreator.accountId) {
      return badInput(); // contradictory locators
    }
    accountId = workflowCreator.accountId;
  }

  const dto = await diagnoseProviderConnection({
    subjectUserId: userId,
    provider,
    accountId: accountId as string, // non-null: one locator was present and resolved
    workflowCreator,
    integrationId,
  });
  return NextResponse.json(dto);
}
