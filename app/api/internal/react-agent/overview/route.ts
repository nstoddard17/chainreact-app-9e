import { NextResponse } from "next/server";
import {
  REACT_AGENT_SECTIONS,
  type ReactAgentOverview,
} from "@/contracts/internalReactAgent";
import { requireInternalAdmin } from "../_shared";

/**
 * GET /api/internal/react-agent/overview — thin, read-only, internal-admin-gated
 * shell over the React Agent feedback dashboard (INTERNAL-FEEDBACK-1).
 *
 * Gated by `requireInternalAdmin()`: anyone who is not a ChainReact internal
 * admin (including signed-out users and customer account owners/admins) gets a
 * 404. This slice returns NO metrics — only `status: "not_connected"` plus the
 * planned section list, so the dashboard renders honest empty states. Future
 * slices fill in real, privacy-reviewed aggregates behind the same gate.
 */
export async function GET(): Promise<Response> {
  const auth = await requireInternalAdmin();
  if (!auth.ok) return auth.response;

  const body: ReactAgentOverview = {
    status: "not_connected",
    sections: REACT_AGENT_SECTIONS,
  };
  return NextResponse.json(body);
}
