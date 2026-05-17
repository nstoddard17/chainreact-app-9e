import { NextResponse } from "next/server";
import {
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";
import { requireUser } from "../../providers/_shared";

/**
 * GET /api/native/triggers — list native trigger metadata.
 *
 * Convenience endpoint over `/api/providers/native/triggers`. Same
 * shape as the providers/[id]/triggers route.
 */

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    provider: "native",
    triggers: listTriggerMetasForProvider("native"),
  });
}
