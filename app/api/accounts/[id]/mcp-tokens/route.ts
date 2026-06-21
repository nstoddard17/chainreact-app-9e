import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  listMcpTokens,
  createMcpToken,
  MAX_MCP_TOKEN_NAME_LENGTH,
  type CreateMcpTokenReason,
} from "@/services/mcp/tokens";

/**
 * /api/accounts/[id]/mcp-tokens (Slice 4.PUBLIC-MCP-9).
 *   GET  — list this account's MCP-token METADATA (owner/admin). Never `token_hash`.
 *   POST — create a token (owner/admin); the raw token is returned EXACTLY ONCE.
 *
 * Owner/admin-only at launch (an MCP token grants read access to the whole
 * account's workflows/runs/integrations, so minting/viewing it is administrative).
 * Reads go through the service-role repo projection (the table grants
 * `authenticated` nothing); no client-side SELECT. No `token_hash` or raw token ever
 * appears in a list response; the raw token appears only in the create response. No
 * OAuth/integration token is touched.
 */

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

const CreateMcpTokenBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "A token name is required.")
      .max(MAX_MCP_TOKEN_NAME_LENGTH, `Name must be ${MAX_MCP_TOKEN_NAME_LENGTH} characters or fewer.`),
    scopes: z.array(z.string()).optional(),
    expiresAt: z.string().datetime("expiresAt must be an ISO-8601 timestamp.").nullable().optional(),
  })
  .strict(); // reject unknown keys → a caller can't set prefix/hash/createdBy/etc.

function createFailure(reason: CreateMcpTokenReason): NextResponse {
  switch (reason) {
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "invalid_name":
      return NextResponse.json({ error: "Invalid token name.", code: "INVALID_NAME" }, { status: 400 });
    case "invalid_scopes":
      return NextResponse.json({ error: "Unknown scope.", code: "INVALID_SCOPES" }, { status: 400 });
    case "scope_not_enabled":
      return NextResponse.json(
        { error: "That scope is not available.", code: "SCOPE_NOT_ENABLED" },
        { status: 400 },
      );
    case "invalid_expiry":
      return NextResponse.json(
        { error: "expiresAt must be a future timestamp.", code: "INVALID_EXPIRY" },
        { status: 400 },
      );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const tokens = await listMcpTokens({ accountId });
  return NextResponse.json({ tokens });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, CreateMcpTokenBodySchema);
  if (!body.ok) return body.response;

  const result = await createMcpToken({
    accountId,
    createdByUserId: auth.userId,
    name: body.data.name,
    scopes: body.data.scopes,
    expiresAt: body.data.expiresAt ?? null,
  });
  if (!result.ok) return createFailure(result.reason);

  // One-time reveal: `token` (the raw secret) is returned ONLY here, never again.
  return NextResponse.json({ token: result.token, rawToken: result.rawToken }, { status: 201 });
}
