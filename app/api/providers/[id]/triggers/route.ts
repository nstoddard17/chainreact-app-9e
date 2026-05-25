import { NextResponse } from "next/server";
import { getProvider } from "@/integrations/_registry";
import {
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { requireUser } from "../../_shared";

/**
 * GET /api/providers/[id]/triggers — list trigger metadata for one provider.
 *
 * Same shape rules as the actions route: 404 on unknown manifest +
 * non-native, empty array is valid, native resolves 200.
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
    triggers: listTriggerMetasForProvider(id),
  });
}
