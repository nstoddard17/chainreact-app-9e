import { NextResponse } from "next/server";
import { getProvider } from "@/integrations/_registry";
import {
  listActionMetasForProvider,
} from "@/services/discovery/_registry";
import { requireUser } from "../../_shared";

/**
 * GET /api/providers/[id]/actions — list action metadata for one provider.
 *
 * Shape (stable):
 *   { provider: string; actions: ActionMeta[] }
 *
 * 404 when the provider id is unknown to the manifest registry AND has
 * no metadata. The synthetic "native" provider has no manifest entry
 * but does have metadata — it MUST resolve 200.
 *
 * Empty `actions: []` is a valid response — a manifest-registered
 * provider that has not yet shipped Phase-3 metadata.
 */

const NATIVE_PROVIDER_ID = "native";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const isNative = id === NATIVE_PROVIDER_ID;
  const manifest = isNative ? null : getProvider(id);
  if (!isNative && !manifest) {
    return NextResponse.json(
      { error: `Provider '${id}' not found.`, code: "PROVIDER_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    provider: id,
    actions: listActionMetasForProvider(id),
  });
}
