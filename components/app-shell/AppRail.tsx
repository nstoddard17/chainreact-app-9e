import { AppBrand } from "./AppBrand";
import { AppNav } from "./AppNav";

/**
 * Desktop left rail for the authenticated app shell
 * (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Layout mirrors design `Sidebar` (`workflows-page.jsx:4-119`): a
 * slim vertical panel that stacks brand → divider → primary nav icons.
 * The user-menu avatar lives in the top bar on desktop (and in the
 * mobile bar on small viewports) — matching the design's `tb-profile`
 * placement so the rail stays icon-only and focused on navigation.
 *
 * Background uses `bg-card` (rebound to the dark panel color inside
 * `[data-app-surface="dark"]`) with a right border so the rail reads
 * as a distinct surface from the page background.
 *
 * Hidden below `md` — the mobile shell uses `<AppMobileBar>` +
 * `<AppMobileNav>` (drawer) instead.
 *
 * Server component — only its child `AppNav` carries a client island
 * (uses `usePathname`).
 */
export function AppRail() {
  return (
    <aside
      data-testid="app-shell-rail"
      aria-label="Sidebar"
      className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center gap-3 border-r border-border bg-card py-3 md:flex"
    >
      <AppBrand />
      <div className="my-1 h-px w-8 bg-border" aria-hidden />
      <AppNav />
    </aside>
  );
}
