import type { ReactNode } from "react";

/**
 * Authenticated app-shell nav configuration
 * (Slice 4.APP-SHELL-1; icons added in 4.APP-SHELL-DARK-DESIGN-PARITY-1
 * for the icon-forward left rail).
 *
 * Every entry MUST map to a real V2 route that resolves without 404 in
 * a default-build install. The Slice 4 audit identified only three
 * authenticated dashboard surfaces: `/workflows`, `/apps`, `/notifications`.
 *
 * Adding a nav item:
 *   1. Ship the route first (`app/<route>/page.tsx` rendering real data).
 *   2. Then add `{ id, label, href, icon }` here.
 *   3. Active-state matching is prefix-with-segment-boundary
 *      (`pathname === href || pathname.startsWith(href + "/")`) so a
 *      sub-route stays highlighted on its parent's nav item.
 *
 * Do NOT add entries with `href: "#…"` or pointing at unbuilt pages —
 * the page guide forbids fake-action affordances.
 */

export interface AppShellNavItem {
  /** Stable id used as React key + as the testid suffix. */
  readonly id: string;
  /** User-facing label shown in mobile drawer + rail hover tooltip. */
  readonly label: string;
  /** Absolute V2 route. MUST resolve to a real page. */
  readonly href: string;
  /** Lucide-style monoline glyph for the icon-forward rail. */
  readonly icon: ReactNode;
}

// Tiny monoline glyph set — defined inline to avoid pulling a new icon
// dependency. Each glyph is sized at 18×18 and rendered with
// `stroke="currentColor"` so the rail's text-color cascade drives the
// tint (muted → foreground on hover → primary on active).
function NavIconBolt() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function NavIconLayers() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

// `/notifications` is intentionally NOT in the rail nav. The top-bar
// `NotificationBell` (with real unread badge) is the canonical entry
// point — duplicating it in the rail would be visual clutter without
// adding access (every authenticated surface already exposes the bell).
// `AppPageContext` returns null on `/notifications` because the route
// isn't in this list; that's fine — the page renders its own h1.

export const APP_SHELL_NAV_ITEMS: ReadonlyArray<AppShellNavItem> = [
  { id: "workflows", label: "Workflows", href: "/workflows", icon: <NavIconBolt /> },
  { id: "apps", label: "Apps", href: "/apps", icon: <NavIconLayers /> },
];

/**
 * Pathname → active-item resolution. Exact match wins; otherwise a
 * sub-route (with a `/` segment boundary) highlights the parent.
 *
 * Examples:
 *   isNavItemActive("/workflows", "/workflows")        → true
 *   isNavItemActive("/workflows", "/workflows/abc")    → true  (builder, but builder doesn't render shell)
 *   isNavItemActive("/workflows", "/workflowsxyz")     → false (no segment boundary)
 *   isNavItemActive("/apps",      "/apps?q=stripe")    → true  (pathname excludes query)
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}
