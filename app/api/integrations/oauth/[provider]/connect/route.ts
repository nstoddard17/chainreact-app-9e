import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { ProviderHint } from "@/contracts/integration";
import { connect } from "@/services/oauth/dispatcher";
import { resolveReconnectTarget } from "@/services/integrations/reconnect";

/**
 * Initiates an OAuth connection for the authenticated user.
 *
 * Thin route per project-structure-and-module-boundaries.md §5: parses input,
 * verifies the session, dispatches to the service, formats the response.
 * No business logic in this file.
 *
 * Body shape:
 *   - empty body / non-JSON → plain Connect / Connect-another (no hint, no
 *     reconnect) — unchanged for every provider.
 *   - `{ "providerHint": { "shop": "mystore.myshopify.com" } }` → per-tenant
 *     hint (Shopify). Non-tenant providers reject it with a typed 400.
 *   - `{ "reconnect": { "integrationId": "<uuid>", "accountId": "<uuid>" } }`
 *     (Slice 4.APPS-RECONNECT) → per-account reconnect. The server resolves +
 *     authorizes the row (membership / connector, not frozen) and starts OAuth
 *     in reconnect mode; the callback refuses to refresh a different account.
 *     The client sends ONLY the opaque ids — never any identity.
 *
 * `providerHint` shape constraint: `Record<string, string>` — the JWT payload is
 * signed JSON and string-valued keys are the simplest shape that round-trips.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Parse the optional JSON body once. A missing / empty body keeps the legacy
  // zero-arg connect contract intact (plain Connect).
  let parsed: Record<string, unknown> | null = null;
  try {
    const text = await request.text();
    if (text.trim()) {
      const candidate = JSON.parse(text) as unknown;
      if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    }
  } catch {
    return NextResponse.json(
      { error: "request body must be valid JSON" },
      { status: 400 },
    );
  }

  // Optional providerHint (per-tenant providers).
  let providerHint: ProviderHint | undefined;
  if (parsed?.providerHint !== undefined) {
    const candidate = parsed.providerHint;
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return NextResponse.json(
        { error: "providerHint must be a JSON object" },
        { status: 400 },
      );
    }
    for (const v of Object.values(candidate as Record<string, unknown>)) {
      if (typeof v !== "string") {
        return NextResponse.json(
          { error: "providerHint values must be strings" },
          { status: 400 },
        );
      }
    }
    providerHint = candidate as ProviderHint;
  }

  // Optional reconnect intent (Slice 4.APPS-RECONNECT). The client supplies only
  // the opaque integration row id + the account it belongs to; the server
  // resolves and authorizes — never trusting a client-supplied owner mapping.
  let reconnectBundle:
    | { integrationId: string; accountId: string; expectedProviderAccountId: string }
    | undefined;
  if (parsed?.reconnect !== undefined) {
    const r = parsed.reconnect;
    if (r === null || typeof r !== "object" || Array.isArray(r)) {
      return NextResponse.json({ error: "reconnect must be a JSON object" }, { status: 400 });
    }
    const integrationId = (r as Record<string, unknown>).integrationId;
    const accountId = (r as Record<string, unknown>).accountId;
    if (
      typeof integrationId !== "string" ||
      integrationId.length === 0 ||
      typeof accountId !== "string" ||
      accountId.length === 0
    ) {
      return NextResponse.json(
        { error: "reconnect requires string integrationId and accountId" },
        { status: 400 },
      );
    }
    const resolved = await resolveReconnectTarget({
      provider,
      accountId,
      integrationId,
      callerUserId: user.id,
    });
    if (!resolved.ok) {
      // Typed, non-leaking mapping (mirrors the disconnect routes). A non-member
      // or cross-account id is indistinguishable from a missing row (404); a
      // member who lacks the role/connector right gets 403; a frozen account 409.
      const statusByReason = { not_found: 404, forbidden: 403, account_frozen: 409 } as const;
      return NextResponse.json(
        { error: resolved.reason },
        { status: statusByReason[resolved.reason] },
      );
    }
    reconnectBundle = {
      integrationId: resolved.integrationId,
      accountId: resolved.accountId,
      expectedProviderAccountId: resolved.expectedProviderAccountId,
    };
  }

  try {
    const { redirectUrl } = await connect({
      userId: user.id,
      provider,
      ...(providerHint !== undefined ? { providerHint } : {}),
      ...(reconnectBundle !== undefined ? { reconnect: reconnectBundle } : {}),
    });
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth start failed" },
      { status: 400 },
    );
  }
}
