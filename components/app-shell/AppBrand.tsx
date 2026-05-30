import Link from "next/link";

/**
 * Brand mark + wordmark for the authenticated app shell
 * (Slice 4.APP-SHELL-1).
 *
 * Links to `/workflows` — the authenticated landing surface. Marketing
 * `/` is the public marketing route which signed-in users redirect AWAY
 * from; clicking the brand inside the shell should land users back on
 * their real home, not bounce them through marketing.
 *
 * Uses the real ChainReact mark at `/chainreact-mark.png` (added in
 * HOMEPAGE-V2-1). On asset 404 the chip degrades to initials.
 */
export function AppBrand() {
  return (
    <Link
      href="/workflows"
      data-testid="app-shell-brand"
      aria-label="ChainReact home"
      className="inline-flex items-center gap-2 text-foreground"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/chainreact-mark.png"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 object-contain"
        aria-hidden
      />
      <span className="text-sm font-semibold tracking-tight">ChainReact</span>
    </Link>
  );
}
