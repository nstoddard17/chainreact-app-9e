import { NextResponse } from "next/server";
import {
  getReactAgentMetrics,
  MetricsRangeError,
} from "@/services/admin/reactAgentMetrics";
import { requireInternalAdmin } from "../_shared";

/**
 * GET /api/internal/react-agent/metrics — internal-admin-only React Agent metrics
 * (INTERNAL-FEEDBACK-2). Thin: gate → parse optional `from`/`to` → delegate to the
 * service → serialize. Same `requireInternalAdmin` gate as the rest of the surface,
 * so anon / non-admin (incl. customer account owners/admins) get a 404. The
 * service-role aggregation lives in the repository, never referenced here.
 *
 * Returns aggregate counts only (see ReactAgentMetrics). Invalid date range → 400.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireInternalAdmin();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  try {
    const metrics = await getReactAgentMetrics({
      from: params.get("from"),
      to: params.get("to"),
    });
    return NextResponse.json(metrics);
  } catch (err) {
    if (err instanceof MetricsRangeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "metrics_unavailable" }, { status: 500 });
  }
}
