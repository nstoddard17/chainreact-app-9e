import { NextResponse } from "next/server";
import {
  requireAuthedUserId,
  parseAccountBody,
  UpdateBuilderViewBodySchema,
} from "@/app/api/account/_shared";
import {
  getOwnDefaultBuilderView,
  updateOwnDefaultBuilderView,
} from "@/services/accounts/builderViewPreference";

/**
 * GET / PATCH /api/account/builder-view (BUILDER-VIEW-DEFAULT-1).
 *
 * Read / update the caller's OWN default builder view ("visual" | "document"
 * | null = ask on new workflows). Self-scoped: the user id comes from the
 * verified session, never the body, so a caller can only ever touch their own
 * `user_profiles` row (also RLS-gated by `user_profiles_{select,update}_own`).
 * A pure per-user UI preference — no workflow, account, or billing state.
 */
export async function GET(): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const defaultBuilderView = await getOwnDefaultBuilderView(auth.userId);
  return NextResponse.json({ ok: true, defaultBuilderView });
}

export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const body = await parseAccountBody(request, UpdateBuilderViewBodySchema);
  if (!body.ok) return body.response;

  const defaultBuilderView = await updateOwnDefaultBuilderView(
    auth.userId,
    body.data.defaultBuilderView,
  );

  console.info(
    JSON.stringify({
      event: "account.builder_view_default.updated",
      // Categorical preference only — no user content.
    }),
  );

  return NextResponse.json({ ok: true, defaultBuilderView });
}
