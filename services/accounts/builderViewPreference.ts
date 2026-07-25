import type { DefaultBuilderView } from "@/contracts/builderViewPreference";
import {
  getDefaultBuilderView,
  updateDefaultBuilderView,
} from "@/repositories/userProfiles";

/**
 * Per-user default-builder-view preference (BUILDER-VIEW-DEFAULT-1).
 *
 * Thin self-scoped pass-throughs, mirroring notificationPreferences.ts: the
 * caller's verified user id comes from the route layer, the repo's session
 * client + RLS guarantee the write can only touch the caller's own row.
 * `null` clears the default → the builder asks again on new workflows.
 */
export async function getOwnDefaultBuilderView(
  userId: string,
): Promise<DefaultBuilderView> {
  return getDefaultBuilderView(userId);
}

export async function updateOwnDefaultBuilderView(
  userId: string,
  view: DefaultBuilderView,
): Promise<DefaultBuilderView> {
  await updateDefaultBuilderView(userId, view);
  return view;
}
