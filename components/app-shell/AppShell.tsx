import type { ReactNode } from "react";
import { AppMobileBar } from "./AppMobileBar";
import { AppRail } from "./AppRail";
import { AppTopBar } from "./AppTopBar";
import type { NotificationPreview } from "./notificationPreview";

/**
 * Authenticated app shell (Slice 4.APP-SHELL-1;
 * dark dashboard + rail + top bar rewrite in
 * 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Layout (≥ md): left vertical icon rail + content column. Content
 * column starts with a sticky top bar (page context + notification
 * bell + user menu) below which the page content scrolls.
 * Layout (< md): rail hidden; thin top bar (hamburger + brand + page
 * context + bell + user menu); nav goes through the mobile drawer.
 *
 * The root carries `data-app-surface="dark"` so the dark dashboard
 * palette (defined in `app/globals.css`) re-themes the app HSL tokens
 * (`--background` / `--card` / `--border` / `--muted` / …) for every
 * component nested inside. Existing `bg-card` / `text-foreground` /
 * `border-border` classes on page components automatically render dark
 * without per-component rewrites.
 *
 * **Architecture (locked with the user):** shared component, NOT a
 * Next.js route group. Authenticated pages (`/workflows`, `/apps`,
 * `/notifications`) wrap their existing `<main>` in `<AppShell
 * userEmail={…} unreadNotifications={…} recentNotifications={…}>`.
 * URLs and import paths stay unchanged; the builder route
 * (`/workflows/[id]`) and marketing route (`/`) are untouched.
 *
 * `recentNotifications` is the (≤ 5) most-recent feed seeded into the
 * top-bar bell popover (Slice 4.NOTIFICATIONS-POPOVER-1). Pages map
 * their `notificationsRepo.listForUser(...)` rows through
 * `toNotificationPreview()` before passing them here; this keeps the
 * client-side bell free of any `@/repositories/**` dependency.
 *
 * Auth is the caller's responsibility — the shell ASSUMES it's
 * rendering inside a server component that has already verified
 * `auth.getUser()` and gated on it.
 */
interface Props {
  userEmail: string;
  unreadNotifications: number;
  recentNotifications: readonly NotificationPreview[];
  children: ReactNode;
}

export function AppShell({
  userEmail,
  unreadNotifications,
  recentNotifications,
  children,
}: Props) {
  return (
    <div
      data-testid="app-shell-root"
      data-app-surface="dark"
      className="flex min-h-screen bg-background text-foreground"
    >
      <AppRail />
      {/*
        RESPONSIVE-FOUNDATION-1 — `min-w-0` on the content column is load-bearing
        and stays exactly as it is. It is what lets the column shrink below its
        content instead of widening the shell.

        Deliberately NOT adding `overflow-x-clip`/`hidden` here. Clipping would
        make the harness's document-level scrollWidth assertion pass while a
        child was still overflowing underneath — the check would go green by
        hiding the bug rather than by the bug being fixed. Overflow is fixed at
        its causes (see AppTopBar, TemplatesDashboard, TemplateCard); the harness
        then measures both the document AND each bounded region.
      */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppMobileBar
          userEmail={userEmail}
          unreadNotifications={unreadNotifications}
          recentNotifications={recentNotifications}
        />
        <AppTopBar
          userEmail={userEmail}
          unreadNotifications={unreadNotifications}
          recentNotifications={recentNotifications}
        />
        {children}
      </div>
    </div>
  );
}
