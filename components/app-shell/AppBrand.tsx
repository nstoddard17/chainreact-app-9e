import Link from "next/link";
import { MarketingBrandLogo } from "@/features/marketing/MarketingBrandLogo";

/**
 * Brand mark for the authenticated app shell rail
 * (Slice 4.APP-SHELL-1; rail-style refit in
 * 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Icon-only inside the slim rail (mirrors design `sb-brand` —
 * `workflows-page.jsx:65-72`). Links to `/workflows` — the
 * authenticated landing surface; marketing `/` is the public route
 * which signed-in users redirect AWAY from.
 *
 * The mark reuses the homepage's animated `MarketingBrandLogo`
 * (glow + idle float + breathing glow + periodic sheen) so the brand
 * reads identically here and on the landing page — wordmark off, sized
 * to the rail tile. `aria-label` carries the wordmark for screen
 * readers; sighted users see a tooltip on hover.
 */
export function AppBrand() {
  return (
    <Link
      href="/workflows"
      data-testid="app-shell-brand"
      aria-label="ChainReact — Workflows"
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 transition hover:bg-muted"
    >
      <span className="relative inline-flex h-full w-full items-center justify-center overflow-hidden rounded-lg">
        <MarketingBrandLogo variant="nav" size={26} wordmark={false} />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ChainReact
      </span>
    </Link>
  );
}
