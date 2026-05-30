/**
 * UI-safe notification shape passed to the top-bar `NotificationBell`
 * popover (Slice 4.NOTIFICATIONS-POPOVER-1).
 *
 * Intentionally narrower than the repository's `NotificationRecord`:
 *   - omits `userId` (always the calling user)
 *   - omits `type` + `metadata` (private payload; not needed for the
 *     popover row)
 *   - flattens `readAt: string | null` to `isUnread: boolean`
 *
 * Pages (server components) fetch `NotificationRecord[]` via the
 * repository, then map each row to a `NotificationPreview` before
 * passing to `<AppShell recentNotifications={…}>`. The mapper lives at
 * `app/notifications/notificationPreview.ts` — components/ cannot
 * import from repositories/ (project-structure-and-module-boundaries
 * §4), so the type definition is intentionally repo-independent.
 */
export type NotificationPreviewSeverity = "warning" | "error";

export interface NotificationPreview {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationPreviewSeverity;
  /** Where the row's link points. `null` = no link, render as static row. */
  readonly actionUrl: string | null;
  /** `true` while the underlying row's `read_at` is still NULL. */
  readonly isUnread: boolean;
  /** ISO-8601 timestamp from `created_at`; used for the relative-time label. */
  readonly createdAt: string;
}
