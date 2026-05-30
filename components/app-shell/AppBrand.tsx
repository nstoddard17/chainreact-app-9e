import Link from "next/link";

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
 * The real ChainReact gradient mark (`/chainreact-mark.png`, added
 * in HOMEPAGE-V2-1) sits inside a small rounded tile so the brand
 * reads as a primary identity element against the rail's dark panel.
 * `aria-label` carries the wordmark for screen readers; sighted users
 * see a tooltip on hover.
 */
export function AppBrand() {
  return (
    <Link
      href="/workflows"
      data-testid="app-shell-brand"
      aria-label="ChainReact — Workflows"
      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 transition hover:bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/chainreact-mark.png"
        alt=""
        width={26}
        height={26}
        className="h-[26px] w-[26px] object-contain"
        aria-hidden
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ChainReact
      </span>
    </Link>
  );
}
