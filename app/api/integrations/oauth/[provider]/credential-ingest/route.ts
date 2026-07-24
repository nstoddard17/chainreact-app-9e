import { NextResponse } from "next/server";
import { CredentialVerificationError } from "@/contracts/integration";
import { handleCredentialIngest } from "@/services/oauth/dispatcher";
import { InvalidStateError } from "@/services/oauth/state";
import { createClient } from "@/utils/supabase/server";
import { redactedOAuthErrorCode } from "../_shared";

/**
 * Credential-ingest endpoint (FLEETIO-1 — `credential_paste` providers).
 *
 * Receives the named credential set the user entered into the V2
 * credential-paste form, verifies it server-side via the dispatcher, and
 * persists the resulting integration row. Sibling of `/ingest` (token
 * flows) — deliberately a SEPARATE route + dispatcher operation so neither
 * path can reach the other's providers.
 *
 * Thin route per project-structure-and-module-boundaries.md §5 — parses
 * input, verifies session, dispatches, formats response. Field-level
 * validation against the manifest lives in the dispatcher.
 *
 * Request: POST `{ state: string, credentials: Record<string,string> }`.
 * Responses: 200 `{redirect}` · 400 (bad body / state / credentials) ·
 * 401 unauthenticated · 502 transient verifier failure · 500 other.
 *
 * Security: no credential value ever appears in a response body or logged
 * error message; the dispatcher consumes the single-use state BEFORE the
 * provider verify call and cross-checks the state JWT's user/provider.
 */
const MAX_FIELDS = 16;
const MAX_VALUE_LENGTH = 4096;

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

  let raw: unknown;
  try {
    const text = await request.text();
    if (!text.trim()) {
      return NextResponse.json({ error: "request body required" }, { status: 400 });
    }
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "request body must be valid JSON" }, { status: 400 });
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "request body must be a JSON object" }, { status: 400 });
  }
  const { state, credentials } = raw as { state?: unknown; credentials?: unknown };
  if (typeof state !== "string" || state.length === 0) {
    return NextResponse.json({ error: "state required" }, { status: 400 });
  }
  if (credentials === null || typeof credentials !== "object" || Array.isArray(credentials)) {
    return NextResponse.json({ error: "credentials object required" }, { status: 400 });
  }
  const entries = Object.entries(credentials as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_FIELDS) {
    return NextResponse.json({ error: "credentials object required" }, { status: 400 });
  }
  for (const [, value] of entries) {
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_LENGTH) {
      return NextResponse.json(
        { error: "credential values must be non-empty strings" },
        { status: 400 },
      );
    }
  }

  try {
    await handleCredentialIngest({
      userId: user.id,
      provider,
      state,
      credentials: Object.fromEntries(entries) as Record<string, string>,
    });
    const redirect = `/apps?integration=connected&provider=${encodeURIComponent(provider)}`;
    return NextResponse.json({ redirect });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return NextResponse.json({ error: "invalid state" }, { status: 400 });
    }
    if (err instanceof CredentialVerificationError) {
      return NextResponse.json({ error: err.reason }, { status: 400 });
    }
    // Same transient-vs-fatal classification + redaction as the ingest route
    // (V2-READY-21): never echo the raw message.
    const rawMessage = err instanceof Error ? err.message : "ingest failed";
    const status = /verify failed|fetch failed|network|ETIMEDOUT|ECONNRESET/i.test(rawMessage)
      ? 502
      : 500;
    const code = redactedOAuthErrorCode(
      err,
      { event: "oauth.credential_ingest_failed", provider },
      "credential_ingest_failed",
    );
    return NextResponse.json({ error: code }, { status });
  }
}
