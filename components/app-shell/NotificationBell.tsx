"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { markAllNotificationsRead } from "@/app/notifications/actions";
import type { NotificationPreview } from "./notificationPreview";

/**
 * Top-bar notification bell with popover dropdown
 * (Slice 4.NOTIFICATIONS-POPOVER-1; supersedes the link-only bell
 * from 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Clicking the bell opens a Radix popover that shows the user's
 * most-recent notifications (default 5, capped at
 * `NOTIFICATION_BELL_PREVIEW_LIMIT`). The popover is the canonical
 * entry — Notifications is no longer in the primary side rail. The
 * full `/notifications` route is preserved as a fallback and reached
 * via the popover footer's "View all" link.
 *
 * Data flow: parent (server component) calls
 * `notificationsRepo.listForUser(userId, { limit })`, maps each row
 * via `toNotificationPreview()`, then passes the UI-safe array here
 * alongside the unread count. No client API calls, no polling — the
 * popover reflects the snapshot taken at page render. Mark-all-read
 * is wired to the existing `markAllNotificationsRead` server action
 * which revalidates `/` and `/notifications`, so the badge + list
 * refresh on the next navigation.
 *
 * Counts > 99 are displayed as `99+` to keep the badge compact and to
 * avoid leaking large internal numbers into the UI.
 */
interface Props {
  unreadCount: number;
  recentNotifications: readonly NotificationPreview[];
}

function formatBadge(count: number): string {
  if (count > 99) return "99+";
  return count.toString();
}

export function NotificationBell({ unreadCount, recentNotifications }: Props) {
  const [open, setOpen] = useState(false);
  const showBadge = unreadCount > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="app-shell-notification-bell"
          data-unread-count={unreadCount}
          aria-label={
            showBadge
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          aria-expanded={open}
          aria-haspopup="dialog"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <BellIcon />
          {showBadge && (
            <span
              data-testid="app-shell-notification-bell-badge"
              className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
            >
              {formatBadge(unreadCount)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        // PopoverContent portals to document.body, OUTSIDE the
        // AppShell's `[data-app-surface="dark"]` ancestor; re-apply the
        // attribute so the dark HSL re-themes match the portaled node
        // directly (same trick as UserMenu).
        data-app-surface="dark"
        data-testid="app-shell-notification-bell-content"
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">
            Notifications
          </span>
          {showBadge && (
            <form action={markAllNotificationsRead}>
              <button
                type="submit"
                data-testid="app-shell-notification-bell-mark-all-read"
                className="rounded px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Mark all read
              </button>
            </form>
          )}
        </div>
        {recentNotifications.length === 0 ? (
          <p
            data-testid="app-shell-notification-bell-empty"
            className="px-3 py-6 text-center text-sm text-muted-foreground"
          >
            No notifications yet.
          </p>
        ) : (
          <ul
            data-testid="app-shell-notification-bell-list"
            className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto"
          >
            {recentNotifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onActivate={() => setOpen(false)}
              />
            ))}
          </ul>
        )}
        <div className="border-t border-border px-3 py-2">
          <Link
            href="/notifications"
            data-testid="app-shell-notification-bell-view-all"
            onClick={() => setOpen(false)}
            className="block w-full rounded px-2 py-1.5 text-center text-xs font-medium text-primary hover:bg-muted"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  notification,
  onActivate,
}: {
  notification: NotificationPreview;
  onActivate: () => void;
}) {
  const severityDotClass =
    notification.severity === "error"
      ? "bg-destructive"
      : "bg-amber-500 dark:bg-amber-400";
  const titleClass = notification.isUnread
    ? "truncate text-sm font-semibold text-foreground"
    : "truncate text-sm font-medium text-muted-foreground";
  const time = formatRelativeTime(notification.createdAt);

  const inner = (
    <>
      <span
        aria-hidden
        data-testid={`app-shell-notification-bell-row-${notification.id}-dot`}
        className={
          "mt-1.5 h-2 w-2 shrink-0 rounded-full " +
          (notification.isUnread ? severityDotClass : "border border-border")
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className={titleClass}>{notification.title}</span>
          {time && (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {time}
            </span>
          )}
        </div>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {notification.body}
        </span>
      </div>
    </>
  );

  const className =
    "flex items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted";

  if (notification.actionUrl) {
    return (
      <li>
        <Link
          href={notification.actionUrl}
          onClick={onActivate}
          data-testid={`app-shell-notification-bell-row-${notification.id}`}
          data-unread={notification.isUnread ? "true" : "false"}
          className={className}
        >
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li
      data-testid={`app-shell-notification-bell-row-${notification.id}`}
      data-unread={notification.isUnread ? "true" : "false"}
      className={className}
    >
      {inner}
    </li>
  );
}

/**
 * Compact relative-time label for popover rows. Computed at render
 * time — the popover unmounts when closed, so each open recomputes
 * against the current clock. Falls back to an empty string if the
 * timestamp doesn't parse (safer than a fabricated label).
 */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString();
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
