import { AppBrand } from "./AppBrand";
import { AppMobileNav } from "./AppMobileNav";
import { AppPageContext } from "./AppPageContext";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import type { NotificationPreview } from "./notificationPreview";

/**
 * Mobile-only top bar for the authenticated app shell
 * (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Below `md` the rail is hidden; this thin sticky bar carries the
 * hamburger (→ `AppMobileNav` drawer) + brand + page-context label +
 * notification bell + user-menu avatar so every affordance the desktop
 * shell exposes stays reachable on small viewports.
 *
 * NO top utility content beyond what V2 can ship truthfully — same
 * scope rules as the desktop `AppTopBar`: no search, no task meter,
 * no help link, no theme toggle. The workspace switcher
 * (4.ACCOUNT-SWITCHER-1) lives in the desktop top bar; on mobile it
 * lives in the nav drawer (`AppMobileNav` → `AppMobileAccountSwitcher`,
 * 4.ACCOUNT-SWITCHER-MOBILE-1) rather than this space-constrained bar.
 *
 * Server component.
 */
interface Props {
  userEmail: string;
  unreadNotifications: number;
  recentNotifications: readonly NotificationPreview[];
}

export function AppMobileBar({
  userEmail,
  unreadNotifications,
  recentNotifications,
}: Props) {
  return (
    <header
      data-testid="app-shell-mobile-bar"
      className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card px-3 md:hidden"
    >
      {/*
        RESPONSIVE-PAGES-2 — the same defect the desktop bar had, and the one
        flagged as a follow-up last batch. The identity group could shrink but
        had no `flex-1`, and the control cluster had neither `min-w-0` nor
        `shrink-0` — so on a 360px phone the hamburger, brand and page label
        together pushed the bell and avatar toward the edge instead of the label
        yielding. `flex-1 min-w-0` here plus `shrink-0` on the controls makes the
        page label the part that truncates, which is the only piece that can be
        shortened without losing a function.
      */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <AppMobileNav />
        <AppBrand />
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        <AppPageContext />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NotificationBell
          unreadCount={unreadNotifications}
          recentNotifications={recentNotifications}
        />
        <UserMenu userEmail={userEmail} />
      </div>
    </header>
  );
}
