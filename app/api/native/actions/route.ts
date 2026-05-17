import { NextResponse } from "next/server";
import {
  listActionMetasForProvider,
} from "@/services/discovery/_registry";
import { requireUser } from "../../providers/_shared";

/**
 * GET /api/native/actions — list native action metadata.
 *
 * Convenience endpoint over `/api/providers/native/actions`. Returned
 * shape is identical so the typed client can share its decoder. The
 * native route group exists so the builder UI can fetch native actions
 * without paying the cost of a provider lookup first.
 */

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    provider: "native",
    actions: listActionMetasForProvider("native"),
  });
}
