import { NextResponse } from "next/server";
import { CreateDashboardBodySchema } from "@/contracts/analytics";
import {
  listOrSeedDashboards,
  createDashboard,
} from "@/services/analytics/dashboards";
import { requireAccount, parseBody } from "../_shared";

/**
 * /api/analytics/dashboards (Slice ANALYTICS-1).
 *   GET  — list the active account's saved dashboards, seeding the default
 *          "Overview" board on first access.
 *   POST — create a new dashboard in the active account.
 *
 * Account scope is the caller's resolved ACTIVE account (never client-supplied).
 * Writes run through the service-role repo after this membership gate.
 */
export async function GET() {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const dashboards = await listOrSeedDashboards(auth.accountId, auth.userId);
  return NextResponse.json({ dashboards });
}

export async function POST(request: Request) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const body = await parseBody(request, CreateDashboardBodySchema);
  if (!body.ok) return body.response;
  const dashboard = await createDashboard(auth.accountId, auth.userId, {
    name: body.data.name,
    ...(body.data.widgets !== undefined ? { widgets: body.data.widgets } : {}),
  });
  return NextResponse.json({ dashboard }, { status: 201 });
}
