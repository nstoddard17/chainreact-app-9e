/**
 * Authenticated app-shell nav configuration (Slice 4.APP-SHELL-1).
 *
 * Every entry MUST map to a real V2 route that resolves without 404 in
 * a default-build install. The Slice 4 audit identified only three
 * authenticated dashboard surfaces: `/workflows`, `/apps`, `/notifications`.
 *
 * Adding a nav item:
 *   1. Ship the route first (`app/<route>/page.tsx` rendering real data).
 *   2. Then add `{ id, label, href }` here.
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
  /** User-facing label shown in desktop + mobile nav. */
  readonly label: string;
  /** Absolute V2 route. MUST resolve to a real page. */
  readonly href: string;
}

export const APP_SHELL_NAV_ITEMS: ReadonlyArray<AppShellNavItem> = [
  { id: "workflows", label: "Workflows", href: "/workflows" },
  { id: "apps", label: "Apps", href: "/apps" },
  { id: "notifications", label: "Notifications", href: "/notifications" },
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
