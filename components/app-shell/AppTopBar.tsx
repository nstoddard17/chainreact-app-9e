import { AppPageContext } from "./AppPageContext";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

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
 * Excluded design elements (would be fake on V2 today; documented in
 * the slice plan): global ⌘K search, task-usage progress meter, Help
 * button, theme toggle, workspace switcher / breadcrumb.
 *
 * Server component — the user-menu popover and the page-context
 * `usePathname` reader are client islands inside the children.
 */
interface Props {
  userEmail: string;
  unreadNotifications: number;
}

export function AppTopBar({ userEmail, unreadNotifications }: Props) {
  return (
    <header
      data-testid="app-shell-top-bar"
      className="sticky top-0 z-30 hidden h-14 items-center justify-between gap-4 border-b border-border bg-card px-6 md:flex"
    >
      <div className="flex min-w-0 items-center gap-3">
        <AppPageContext />
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell unreadCount={unreadNotifications} />
        <UserMenu userEmail={userEmail} />
      </div>
    </header>
  );
}
