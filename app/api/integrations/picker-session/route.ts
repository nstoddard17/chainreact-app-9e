import { NextResponse } from "next/server";
import { requireUser } from "@/app/api/providers/_shared";
import { FieldResourcePickerSchema } from "@/contracts/actionMeta";
import { createPickerSession } from "@/services/integrations/pickerSession";

/**
 * POST /api/integrations/picker-session
 *
 * Mints a SHORT-LIVED provider access token for a provider-hosted resource
 * picker (Google Picker). This is the only route in the app that returns a
 * provider credential to a browser; the full rationale and the constraints that
 * keep it from becoming a general credential endpoint live in
 * `services/integrations/pickerSession.ts`.
 *
 * Route responsibilities only: authenticate, validate the picker key, delegate,
 * serialize. Two HTTP-level guarantees are owned here:
 *   - **POST, never GET** — the token never enters a URL, browser history, a
 *     referrer header, or a shared cache key.
 *   - **`Cache-Control: no-store`** — no intermediary or bfcache copy.
 *
 * Every non-auth failure is HTTP 200 with `{ok:false, code}` (same convention as
 * `/api/options/[source]`) so the field renders a typed recovery state instead
 * of a generic network error.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ ok: false, code: "PICKER_NOT_SUPPORTED", message: "Invalid request." });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const parsed = FieldResourcePickerSchema.safeParse(raw.picker);
  if (!parsed.success) {
    // Unknown/absent picker key — never falls through to a provider lookup.
    return noStore({
      ok: false,
      code: "PICKER_NOT_SUPPORTED",
      message: "This picker isn't available.",
    });
  }

  const result = await createPickerSession({
    picker: parsed.data,
    userId: auth.userId,
    workflowId: typeof raw.workflowId === "string" ? raw.workflowId : null,
    // Client-supplied node id is used only to look up the ACCEPTED per-node
    // credential owner server-side; owner identity is never trusted from the
    // client (same contract as the options route).
    nodeId: typeof raw.nodeId === "string" ? raw.nodeId : null,
  });

  return noStore(result);
}

function noStore(payload: unknown): Response {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" },
  });
}
