import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { ProviderHint } from "@/contracts/integration";
import { connect } from "@/services/oauth/dispatcher";

/**
 * Initiates an OAuth connection for the authenticated user.
 *
 * Thin route per project-structure-and-module-boundaries.md §5: parses input,
 * verifies the session, dispatches to the service, formats the response.
 * No business logic in this file.
 *
 * Body shape (Slice 12 onwards):
 *   - empty body / non-JSON → no `providerHint` (default for every
 *     provider through Slice 11).
 *   - `{ "providerHint": { "shop": "mystore.myshopify.com" } }` →
 *     forwards the hint to the dispatcher. Per-tenant providers
 *     (Shopify) require this; other providers reject it with a typed
 *     400.
 *
 * `providerHint` shape constraint: `Record<string, string>` — the JWT
 * payload is signed JSON and string-valued keys are the simplest shape
 * that round-trips losslessly. Non-string values are rejected here
 * before they reach the dispatcher.
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

  // Optional providerHint from the request body. A missing / non-JSON
  // body keeps the legacy zero-arg connect contract intact for every
  // provider through Slice 11.
  let providerHint: ProviderHint | undefined;
  try {
    const text = await request.text();
    if (text.trim()) {
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        const candidate = (parsed as Record<string, unknown>).providerHint;
        if (candidate !== undefined) {
          if (
            candidate === null ||
            typeof candidate !== "object" ||
            Array.isArray(candidate)
          ) {
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
      }
    }
  } catch {
    return NextResponse.json(
      { error: "request body must be valid JSON" },
      { status: 400 },
    );
  }

  try {
    const { redirectUrl } = await connect({
      userId: user.id,
      provider,
      ...(providerHint !== undefined ? { providerHint } : {}),
    });
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth start failed" },
      { status: 400 },
    );
  }
}
