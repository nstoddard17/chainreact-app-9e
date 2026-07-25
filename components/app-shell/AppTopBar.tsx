import { AccountSwitcher } from "./AccountSwitcher";
import { AppPageContext } from "./AppPageContext";
import { NotificationBell } from "./NotificationBell";
import { UsageMeter } from "./UsageMeter";
import { UserMenu } from "./UserMenu";
import type { NotificationPreview } from "./notificationPreview";

/**
 * Desktop top bar for the authenticated app shell
 * (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1, restored after the bare-
 * rail iteration).
 *
 * Composition mirrors the design `TopBar` idiom
 * (`workflows-page.jsx:125-230`) — sticky sub-header strip inside the
 * content column, to the right of the rail. Content is intentionally
 * scoped to what V2 can ship truthfully:
 *   - Page-context label (active primary nav item from `usePathname`).
 *   - Notification bell with real unread-count badge.
 *   - User menu.
 *
 * The workspace switcher (4.ACCOUNT-SWITCHER-1) sits on the left, ahead of the
 * page-context label, so the caller's active Personal/Team/Org account is always
 * visible + switchable.
 *
 * The design's task-usage progress meter is now REAL and included
 * (HEADER-USAGE-VISIBILITY-1): `UsageMeter` self-fetches the active
 * account's tasks + AI-credits remaining and renders nothing when the
 * data is unavailable.
 *
 * Excluded design elements (would be fake on V2 today; documented in
 * the slice plan): global ⌘K search, Help button, theme toggle.
 *
 * Server component — the user-menu popover and the page-context
 * `usePathname` reader are client islands inside the children.
 */
interface Props {
  userEmail: string;
  unreadNotifications: number;
  recentNotifications: readonly NotificationPreview[];
}

export function AppTopBar({
  userEmail,
  unreadNotifications,
  recentNotifications,
}: Props) {
  return (
    <header
      data-testid="app-shell-top-bar"
      className="sticky top-0 z-30 hidden h-14 items-center justify-between gap-4 border-b border-border bg-card px-6 md:flex"
    >
      <div className="flex min-w-0 items-center gap-3">
        <AccountSwitcher />
        <AppPageContext />
      </div>
      <div className="flex items-center gap-2">
        <UsageMeter />
        <NotificationBell
          unreadCount={unreadNotifications}
          recentNotifications={recentNotifications}
        />
        <UserMenu userEmail={userEmail} />
      </div>
    </header>
  );
}
