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

// Slice 4.RUNS-PAGE-1 — clock-style glyph for the Runs nav item.
// Round face + simple hour/minute hands, sized to match the other rail
// icons (18×18, 1.8 stroke).
function NavIconClock() {
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
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

// Slice 4.TEAM-PAGE-1 — people glyph for the Team / account-management
// nav item. Two-figure "members" outline sized to match the other rail
// icons (18×18, 1.8 stroke).
function NavIconTeam() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

// Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 — grid/template glyph for the Templates
// marketplace nav item. The /templates route renders the live marketplace dashboard.
function NavIconTemplates() {
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
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

// Slice ANALYTICS-1 — bar-chart glyph for the Analytics nav item. The
// /analytics route renders the account-scoped customizable analytics dashboard.
function NavIconAnalytics() {
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
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="5" y="11" width="3.5" height="7" rx="1" />
      <rect x="10.25" y="6" width="3.5" height="12" rx="1" />
      <rect x="15.5" y="14" width="3.5" height="4" rx="1" />
    </svg>
  );
}

// `/notifications` is intentionally NOT in the rail nav. The top-bar
// `NotificationBell` (with real unread badge) is the canonical entry
// point — duplicating it in the rail would be visual clutter without
// adding access (every authenticated surface already exposes the bell).
// `AppPageContext` returns null on `/notifications` because the route
// isn't in this list; that's fine — the page renders its own h1.
//
// `/runs` joined the rail in Slice 4.RUNS-PAGE-1 once the page landed
// (read-only run-history surface). The order is product priority:
// Workflows (build) → Apps (connect) → Runs (observe).

export const APP_SHELL_NAV_ITEMS: ReadonlyArray<AppShellNavItem> = [
  { id: "workflows", label: "Workflows", href: "/workflows", icon: <NavIconBolt /> },
  { id: "templates", label: "Templates", href: "/templates", icon: <NavIconTemplates /> },
  { id: "apps", label: "Apps", href: "/apps", icon: <NavIconLayers /> },
  { id: "runs", label: "Runs", href: "/runs", icon: <NavIconClock /> },
  { id: "analytics", label: "Analytics", href: "/analytics", icon: <NavIconAnalytics /> },
  { id: "team", label: "Team", href: "/team", icon: <NavIconTeam /> },
];

// Activity/pulse glyph for the internal React Agent Feedback item, sized to
// match the other rail icons (18×18, 1.8 stroke).
function NavIconInternalFeedback() {
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
      <path d="M3 12h4l2.5-7 5 14 2.5-7H21" />
    </svg>
  );
}

/**
 * INTERNAL-ADMIN-ONLY nav items (ChainReact company admins seeded in
 * `internal_admins`, NOT customer account/team/org roles). Kept separate from
 * `APP_SHELL_NAV_ITEMS` so the base nav is unaffected. Rendered ONLY when the
 * caller-only internal-admin check (`useIsInternalAdmin`) returns true; the
 * `/admin/react-agent` route enforces its own server-side gate regardless.
 */
export const APP_SHELL_ADMIN_NAV_ITEMS: ReadonlyArray<AppShellNavItem> = [
  {
    id: "react-agent-feedback",
    label: "React Agent Feedback",
    href: "/admin/react-agent",
    icon: <NavIconInternalFeedback />,
  },
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
