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
    expect(APP_SHELL_NAV_ITEMS.map((i) => i.href)).toEqual([
      "/workflows",
      "/apps",
    ]);
    for (const item of APP_SHELL_NAV_ITEMS) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href.startsWith("#")).toBe(false);
    }
  });

  it("does NOT include /notifications (covered by the top-bar bell instead)", () => {
    expect(APP_SHELL_NAV_ITEMS.find((i) => i.href === "/notifications")).toBeUndefined();
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
