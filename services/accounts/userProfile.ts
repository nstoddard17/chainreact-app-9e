import * as userProfilesRepo from "@/repositories/userProfiles";

/**
 * Profile-basics service (4.ACCOUNT-SETTINGS-3).
 *
 * The only mutable profile field today is the display name. Self-scoped: the
 * caller's user id always comes from the verified session (never request input),
 * and the repo write is RLS-gated to the caller's own row.
 */

/** Max stored display-name length. Mirrored by the route Zod + the UI maxLength. */
export const MAX_DISPLAY_NAME_LENGTH = 80;

/**
 * Normalize + persist the caller's display name. Trims; an empty/whitespace-only
 * value clears it to `null` (downstream identity reads fall back to OAuth
 * metadata). Returns the stored value so the caller can reflect the canonical
 * result. Over-length input is rejected at the route (Zod) before we get here;
 * this asserts the floor defensively.
 */
export async function updateOwnDisplayName(
  userId: string,
  rawDisplayName: string,
): Promise<{ displayName: string | null }> {
  const trimmed = rawDisplayName.trim();
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error("display name exceeds the maximum length");
  }
  const displayName = trimmed.length === 0 ? null : trimmed;
  await userProfilesRepo.updateDisplayName(userId, displayName);
  return { displayName };
}
