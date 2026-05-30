import { NextResponse } from "next/server";
import { TokenIngestVerificationError } from "@/contracts/integration";
import { handleTokenIngest } from "@/services/oauth/dispatcher";
import { InvalidStateError } from "@/services/oauth/state";
import { createClient } from "@/utils/supabase/server";

/**
 * Token-ingest endpoint (Slice 17+).
 *
 * Receives a token captured by the V2 client ingest page from the URL
 * fragment, verifies it server-side via the dispatcher, and persists the
 * resulting integration row.
 *
 * Thin route per project-structure-and-module-boundaries.md §5 — parses
 * input, verifies session, dispatches to the service, formats response.
 * No business logic here.
 *
 * Request: POST with `{ state: string, token: string }` JSON body.
 *
 * Responses:
 *   - 200: `{ redirect: "/apps?integration=connected&provider=<provider>" }`.
 *   - 400: missing fields, invalid state, or token rejected by provider.
 *   - 401: unauthenticated.
 *   - 502: transient provider verifier failure (network / 5xx).
 *   - 500: unexpected server error.
 *
 * Security:
 *   - Token never appears in response bodies or in logged error
 *     messages. `TokenIngestVerificationError.message` is constructed
 *     without the token; the route surfaces only `error.reason`.
 *   - State is single-use and atomic-deleted by the dispatcher BEFORE
 *     the verify call.
 *   - Session user is cross-checked against the state JWT's userId
 *     inside the dispatcher.
 */
interface IngestBody {
  state: unknown;
  token: unknown;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

  let parsed: IngestBody;
  try {
    const text = await request.text();
    if (!text.trim()) {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const raw = JSON.parse(text) as unknown;
    if (!isObjectLike(raw)) {
      return NextResponse.json(
        { error: "request body must be a JSON object" },
        { status: 400 },
      );
    }
    parsed = { state: raw.state, token: raw.token };
  } catch {
    return NextResponse.json(
      { error: "request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (typeof parsed.state !== "string" || parsed.state.length === 0) {
    return NextResponse.json({ error: "state required" }, { status: 400 });
  }
  if (typeof parsed.token !== "string" || parsed.token.length === 0) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  try {
    await handleTokenIngest({
      userId: user.id,
      provider,
      state: parsed.state,
      token: parsed.token,
    });
    const redirect = `/apps?integration=connected&provider=${encodeURIComponent(provider)}`;
    return NextResponse.json({ redirect });
  } catch (err) {
    if (err instanceof InvalidStateError) {
      return NextResponse.json({ error: "invalid state" }, { status: 400 });
    }
    if (err instanceof TokenIngestVerificationError) {
      return NextResponse.json({ error: err.reason }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "ingest failed";
    const status = /verify failed|fetch failed|network|ETIMEDOUT|ECONNRESET/i.test(
      message,
    )
      ? 502
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
