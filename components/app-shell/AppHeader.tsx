import { AppBrand } from "./AppBrand";
import { AppMobileNav } from "./AppMobileNav";
import { AppNav } from "./AppNav";
import { UserMenu } from "./UserMenu";

/**
 * Sticky top header for the authenticated app shell
 * (Slice 4.APP-SHELL-1; design-parity tune in
 * 4.APP-SHELL-DESIGN-PARITY-1).
 *
 * Composes: brand → primary nav (desktop) / hamburger (mobile) →
 * user menu. The header style mirrors the Connections / Workflows
 * design `TopBar` idiom (`src/workflows-page.jsx`): a solid `bg-card`
 * strip with a hard `border-b border-border` and a fixed 56px (`h-14`)
 * height — no backdrop blur (the design always used a solid panel
 * because the rail behind it is opaque).
 *
 * Inner container is `max-w-7xl` so the header gutters line up with
 * the widest dashboard page (Apps). Narrower pages (Workflows uses
 * `max-w-6xl`) sit inside this same outer rhythm and look naturally
 * centered.
 *
 * Server component — the only client islands are `AppNav` (uses
 * `usePathname`), `AppMobileNav` (popover state), and `UserMenu`
 * (popover state).
 */
interface Props {
  userEmail: string;
}

export function AppHeader({ userEmail }: Props) {
  return (
    <header
      data-testid="app-shell-header"
      className="sticky top-0 z-40 h-14 border-b border-border bg-card"
    >
      <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <AppMobileNav />
          <AppBrand />
        </div>
        <AppNav />
        <div className="flex items-center gap-2">
          <UserMenu userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}
