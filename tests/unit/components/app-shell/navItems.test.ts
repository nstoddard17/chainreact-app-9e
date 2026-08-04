/** @jest-environment node */
/**
 * Tests for components/app-shell/navItems (Slice 4.APP-SHELL-1).
 *
 * Pins:
 *   - Only routes that exist as real pages today are in the list.
 *   - Active-state predicate handles exact, sub-route, and false-prefix
 *     cases correctly.
 */
import { APP_SHELL_NAV_ITEMS, isNavItemActive } from "@/components/app-shell/navItems";

describe("APP_SHELL_NAV_ITEMS", () => {
  it("only contains real V2 routes (no fake/coming-soon entries)", () => {
    // `/notifications` is deliberately NOT in the rail nav — the top-bar
    // NotificationBell with real unread badge is the canonical entry
    // point, so a rail row would be duplicative.
    // `/runs` joined the rail in Slice 4.RUNS-PAGE-1 (read-only history).
    // `/team` joined the rail in Slice 4.TEAM-PAGE-1 (account/team management).
    // `/templates` joined the rail in Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 (live marketplace).
    // TEST-REDUNDANCY-REMOVAL-1 — pinned as the full {id,label,href} shape
    // rather than hrefs alone. This absorbs the five per-route tests that
    // used to follow ("does NOT include /notifications", and the id+label
    // checks for /templates, /runs, /analytics, /team): an unapproved entry
    // appearing, an approved one disappearing, or any id/label drift now
    // fails HERE, in one place, with the whole list in the diff.
    expect(
      APP_SHELL_NAV_ITEMS.map((i) => ({
        id: i.id,
        label: i.label,
        href: i.href,
      })),
    ).toEqual([
      { id: "workflows", label: "Workflows", href: "/workflows" },
      { id: "templates", label: "Templates", href: "/templates" },
      { id: "apps", label: "Apps", href: "/apps" },
      { id: "runs", label: "Runs", href: "/runs" },
      { id: "analytics", label: "Analytics", href: "/analytics" },
      { id: "team", label: "Team", href: "/team" },
    ]);
    for (const item of APP_SHELL_NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href.startsWith("#")).toBe(false);
      // The rail is icon-forward: an entry without a glyph renders blank.
      expect(item.icon).toBeTruthy();
    }
  });

  it("every item has a stable id, label, and absolute href", () => {
    for (const item of APP_SHELL_NAV_ITEMS) {
      expect(item.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.length).toBeGreaterThan(1);
    }
  });
});

describe("isNavItemActive", () => {
  it("exact-path match wins", () => {
    expect(isNavItemActive("/workflows", "/workflows")).toBe(true);
    expect(isNavItemActive("/apps", "/apps")).toBe(true);
  });

  it("sub-route with segment boundary keeps the parent active", () => {
    expect(isNavItemActive("/workflows", "/workflows/abc")).toBe(true);
    expect(isNavItemActive("/workflows", "/workflows/abc/edit")).toBe(true);
  });

  it("false prefix WITHOUT a segment boundary does NOT match", () => {
    expect(isNavItemActive("/workflows", "/workflowsxyz")).toBe(false);
    expect(isNavItemActive("/apps", "/appsxyz")).toBe(false);
  });

  it("unrelated paths do not match", () => {
    expect(isNavItemActive("/workflows", "/apps")).toBe(false);
    expect(isNavItemActive("/workflows", "/")).toBe(false);
    expect(isNavItemActive("/workflows", "")).toBe(false);
  });
});
