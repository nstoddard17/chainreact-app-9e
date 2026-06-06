import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  listApiKeys,
  createApiKey,
  MAX_API_KEY_NAME_LENGTH,
  type CreateApiKeyReason,
} from "@/services/apiKeys/management";

/**
 * /api/accounts/[id]/api-keys (Slice 4.API-KEYS-FOUNDATION-3 / FK-2).
 *   GET  — list this account's API-key METADATA (owner/admin). Never `key_hash`.
 *   POST — create a key (owner/admin); the raw key is returned EXACTLY ONCE.
 *
 * Owner/admin-only at launch (an API key acts as the whole account, so minting /
 * viewing it is an administrative act). Reads go through the FK-1 service-role repo
 * projection (the table grants `authenticated` nothing); no client-side SELECT.
 * No `key_hash` or raw key ever appears in a list response; the raw key appears
 * only in the create response. No OAuth/integration token is touched.
 */

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

const CreateApiKeyBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "A key name is required.")
      .max(MAX_API_KEY_NAME_LENGTH, `Name must be ${MAX_API_KEY_NAME_LENGTH} characters or fewer.`),
    scopes: z.array(z.string()).min(1, "At least one scope is required."),
    expiresAt: z.string().datetime("expiresAt must be an ISO-8601 timestamp.").nullable().optional(),
  })
  .strict(); // reject unknown keys → a caller can't set prefix/hash/createdBy/etc.

function createFailure(reason: CreateApiKeyReason): NextResponse {
  switch (reason) {
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "invalid_name":
      return NextResponse.json({ error: "Invalid key name.", code: "INVALID_NAME" }, { status: 400 });
    case "invalid_scopes":
      return NextResponse.json({ error: "Unknown scope.", code: "INVALID_SCOPES" }, { status: 400 });
    case "scope_not_enabled":
      return NextResponse.json(
        { error: "That scope is not available yet. Only 'workflows:trigger' is supported.", code: "SCOPE_NOT_ENABLED" },
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

  const apiKeys = await listApiKeys({ accountId });
  return NextResponse.json({ apiKeys });
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

  const body = await parseAccountBody(request, CreateApiKeyBodySchema);
  if (!body.ok) return body.response;

  const result = await createApiKey({
    accountId,
    createdByUserId: auth.userId,
    name: body.data.name,
    scopes: body.data.scopes,
    expiresAt: body.data.expiresAt ?? null,
  });
  if (!result.ok) return createFailure(result.reason);

  // One-time reveal: `key` (the raw secret) is returned ONLY here, never again.
  return NextResponse.json({ apiKey: result.key, key: result.rawKey }, { status: 201 });
}
