import { NextResponse } from "next/server";
import { UpdateDashboardBodySchema } from "@/contracts/analytics";
import { updateDashboard, deleteDashboard } from "@/services/analytics/dashboards";
import {
  requireAccount,
  authorizeDashboardWrite,
  parseBody,
  rejectInvalidWidgetLayout,
} from "../../_shared";

/**
 * /api/analytics/dashboards/[id] (Slice ANALYTICS-1).
 *   PATCH  — rename and/or atomically replace the widget layout (the "Done
 *            editing" save) and/or reorder.
 *   DELETE — remove the dashboard.
 *
 * Both authorize by MEMBERSHIP of the dashboard's owning account (404 on missing
 * / non-member — no existence leak). The widget array is Zod-validated before the
 * service-role write, so only structural, credential-free widget config is
 * persisted.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const authz = await authorizeDashboardWrite(auth.userId, id);
  if (!authz.ok) return authz.response;

  const body = await parseBody(request, UpdateDashboardBodySchema);
  if (!body.ok) return body.response;
  // Per-widget shape is Zod's job; whether the widgets fit together as a board
  // is not something a per-element schema can see (S2).
  const invalidLayout = rejectInvalidWidgetLayout(body.data.widgets);
  if (invalidLayout) return invalidLayout;

  const dashboard = await updateDashboard(id, {
    ...(body.data.name !== undefined ? { name: body.data.name } : {}),
    ...(body.data.position !== undefined ? { position: body.data.position } : {}),
    ...(body.data.widgets !== undefined ? { widgets: body.data.widgets } : {}),
  });
  return NextResponse.json({ dashboard });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAccount();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const authz = await authorizeDashboardWrite(auth.userId, id);
  if (!authz.ok) return authz.response;

  await deleteDashboard(id);
  return NextResponse.json({ ok: true });
}
