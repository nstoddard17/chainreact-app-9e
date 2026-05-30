import Link from "next/link";

/**
 * Notification bell with real unread-count badge for the authenticated
 * app-shell top bar (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Links to `/notifications` — the existing real route. The badge
 * renders only when `unreadCount > 0`; at zero we show the bell alone
 * (no fabricated "0" pill, no permanent badge). Count is fetched once
 * server-side per page render via the existing
 * `notificationsRepo.countUnreadForUser` helper — no client API call,
 * no polling. The badge updates on the next page navigation (Next.js
 * `revalidatePath` after the user marks notifications read in the
 * Notifications page's existing server actions).
 *
 * Counts > 99 are displayed as `99+` to keep the badge compact and to
 * avoid leaking large internal numbers into the UI.
 */
interface Props {
  unreadCount: number;
}

function formatBadge(count: number): string {
  if (count > 99) return "99+";
  return count.toString();
}

export function NotificationBell({ unreadCount }: Props) {
  const showBadge = unreadCount > 0;
  return (
    <Link
      href="/notifications"
      data-testid="app-shell-notification-bell"
      data-unread-count={unreadCount}
      aria-label={
        showBadge
          ? `Notifications (${unreadCount} unread)`
          : "Notifications"
      }
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
    </Link>
  );
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
