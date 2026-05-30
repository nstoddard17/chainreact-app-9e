import type { NotificationRecord } from "@/repositories/notifications";
import type { NotificationPreview } from "@/components/app-shell/notificationPreview";

/**
 * Server-side mapper from the full repository `NotificationRecord`
 * shape to the UI-safe `NotificationPreview` consumed by the
 * `NotificationBell` popover (Slice 4.NOTIFICATIONS-POPOVER-1).
 *
 * Lives under `app/notifications/` because pages (server components)
 * may import from `@/repositories/**`, while the bell (client
 * component under `components/**`) cannot. Keeping the mapper here
 * lets the type stay repo-independent in `components/app-shell/
 * notificationPreview.ts` so client code can `import type` it freely.
 *
 * The pattern matches the existing colocated server-actions file
 * (`./actions.ts`).
 */
export function toNotificationPreview(record: NotificationRecord): NotificationPreview {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    severity: record.severity,
    actionUrl: record.actionUrl,
    isUnread: record.readAt === null,
    createdAt: record.createdAt,
  };
}

/**
 * Max recent notifications to surface in the bell popover. The full
 * list lives at `/notifications` — the popover footer's "View all"
 * link is the canonical way to reach it.
 */
export const NOTIFICATION_BELL_PREVIEW_LIMIT = 5;
