import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { countIncomingCredentialRequests } from "@/services/teamCredentials/credentialRequestsInbox";
import { isNodeCredentialReassignmentEnabled } from "@/services/teamCredentials/flags";
import type { NotificationPreview } from "@/components/app-shell/notificationPreview";
import { NOTIFICATION_BELL_PREVIEW_LIMIT } from "./notificationPreview";

/**
 * Derived NotificationBell notice for pending credential-reassignment requests
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-9 / CS-8).
 *
 * The Team-page `CredentialRequestsPanel` (CS-7) is the consent surface; this adds
 * ACTIVE discovery — a count-only, NON-PERSISTED bell row so the target sees
 * pending requests without first visiting the Team page. It is derived per render
 * from the live pending-request count (not a `notifications` table row), so there
 * is no new `notification_type` / migration.
 *
 * Server-only helper. Each authenticated page that feeds the bell calls
 * {@link applyCredentialRequestNotice} to merge this into its already-loaded
 * persisted bell data; no component, prop, or endpoint changes are required.
 *
 * Guarantees:
 *   - Flag OFF (default) → empty notice WITHOUT resolving the account or touching
 *     the DB — zero added cost when the feature is disabled.
 *   - Self-scoped: counts only requests targeting `userId` on their active account.
 *   - No-leak: the row is COUNT-ONLY — no workflow name, provider, requester, or
 *     any provider account identity (label / email / scope / token).
 *   - Fail-quiet: any resolution / count error yields the empty notice so the app
 *     shell bell is never broken by this feature.
 */

/** Synthetic (non-persisted) bell row id for the credential-request summary. */
export const CREDENTIAL_REQUEST_NOTICE_ID = "credential-requests";

export interface CredentialRequestNotice {
  /** Number of pending requests targeting the caller on the active account. */
  count: number;
  /** The derived bell row, or null when there is nothing to show. */
  item: NotificationPreview | null;
}

export async function getCredentialRequestBellNotice(
  userId: string,
): Promise<CredentialRequestNotice> {
  if (!isNodeCredentialReassignmentEnabled()) return { count: 0, item: null };
  try {
    const resolved = await resolveActiveAccount(userId);
    if (!resolved.ok) return { count: 0, item: null };
    const count = await countIncomingCredentialRequests({
      accountId: resolved.account.id,
      userId,
    });
    if (count <= 0) return { count: 0, item: null };
    return { count, item: buildNoticeItem(count) };
  } catch {
    return { count: 0, item: null };
  }
}

function buildNoticeItem(count: number): NotificationPreview {
  const plural = count === 1 ? "" : "s";
  return {
    id: CREDENTIAL_REQUEST_NOTICE_ID,
    title: `${count} credential reassignment request${plural}`,
    body: "A teammate asked to run a workflow step under your connection. Review on the Team page.",
    severity: "warning",
    actionUrl: "/team",
    isUnread: true,
    // Synthetic, non-persisted indicator — no real event time. An empty string
    // makes the bell omit the relative-time label (it parses to NaN → "") rather
    // than show a fabricated "just now".
    createdAt: "",
  };
}

/**
 * Merge the credential-request notice into a page's already-loaded persisted bell
 * data. Returns the inputs UNCHANGED when there is no pending notice (flag off /
 * none pending / resolution failed), so the bell is byte-identical to today.
 * Otherwise the count is added to the badge total and the derived row is prepended
 * (then re-capped to the popover preview limit).
 */
export async function applyCredentialRequestNotice(
  userId: string,
  unreadNotifications: number,
  recentNotifications: readonly NotificationPreview[],
): Promise<{
  unreadNotifications: number;
  recentNotifications: readonly NotificationPreview[];
}> {
  const notice = await getCredentialRequestBellNotice(userId);
  if (!notice.item) return { unreadNotifications, recentNotifications };
  return {
    unreadNotifications: unreadNotifications + notice.count,
    recentNotifications: [notice.item, ...recentNotifications].slice(
      0,
      NOTIFICATION_BELL_PREVIEW_LIMIT,
    ),
  };
}
