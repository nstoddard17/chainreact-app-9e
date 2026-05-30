/**
 * Tests for components/app-shell/NotificationBell
 * (Slice 4.NOTIFICATIONS-POPOVER-1; supersedes the link-only tests
 * from 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Pins (presentational + interactive):
 *   - Trigger is a button (NOT a link) and toggles popover open/close.
 *   - Badge renders ONLY when count > 0 (no fake "0" pill).
 *   - Counts > 99 display as "99+".
 *   - aria-label reflects unread state ("Notifications" vs
 *     "Notifications (N unread)").
 *   - `data-unread-count` carries the raw count for instrumentation.
 *   - Popover shows the honest empty state when `recentNotifications`
 *     is empty.
 *   - Popover renders rows from real fixture data — title, body,
 *     unread indicator, link only when `actionUrl` is set.
 *   - "Mark all read" form ONLY renders when there are unread items
 *     (real server-action wiring; mocked at the import boundary).
 *   - "View all" link points at `/notifications`.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { NotificationPreview } from "@/components/app-shell/notificationPreview";

const mockMarkAllRead = jest.fn();
jest.mock("@/app/notifications/actions", () => ({
  markAllNotificationsRead: () => mockMarkAllRead(),
}));

import { NotificationBell } from "@/components/app-shell/NotificationBell";

function fixturePreview(
  overrides: Partial<NotificationPreview> = {},
): NotificationPreview {
  return {
    id: overrides.id ?? "n-1",
    title: overrides.title ?? "Workflow failed",
    body: overrides.body ?? "Run failed at step 3.",
    severity: overrides.severity ?? "error",
    actionUrl: overrides.actionUrl ?? null,
    isUnread: overrides.isUnread ?? true,
    createdAt:
      overrides.createdAt ?? new Date(Date.now() - 5 * 60_000).toISOString(),
  };
}

beforeEach(() => {
  mockMarkAllRead.mockReset();
});

describe("NotificationBell — trigger surface", () => {
  it("renders the trigger as a button (not a link) so the popover opens in place", () => {
    render(<NotificationBell unreadCount={0} recentNotifications={[]} />);
    const trigger = screen.getByTestId("app-shell-notification-bell");
    expect(trigger.tagName.toLowerCase()).toBe("button");
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger.getAttribute("href")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("hides the badge when unreadCount === 0", () => {
    render(<NotificationBell unreadCount={0} recentNotifications={[]} />);
    expect(
      screen.queryByTestId("app-shell-notification-bell-badge"),
    ).toBeNull();
    expect(screen.getByTestId("app-shell-notification-bell")).toHaveAttribute(
      "data-unread-count",
      "0",
    );
    expect(screen.getByTestId("app-shell-notification-bell")).toHaveAttribute(
      "aria-label",
      "Notifications",
    );
  });

  it("renders the badge text + an unread-flavored aria-label when count > 0", () => {
    render(<NotificationBell unreadCount={3} recentNotifications={[]} />);
    expect(
      screen.getByTestId("app-shell-notification-bell-badge"),
    ).toHaveTextContent("3");
    expect(screen.getByTestId("app-shell-notification-bell")).toHaveAttribute(
      "aria-label",
      "Notifications (3 unread)",
    );
  });

  it("caps the displayed badge at 99+ for large counts (raw count still on data attribute)", () => {
    render(<NotificationBell unreadCount={250} recentNotifications={[]} />);
    expect(
      screen.getByTestId("app-shell-notification-bell-badge"),
    ).toHaveTextContent("99+");
    expect(screen.getByTestId("app-shell-notification-bell")).toHaveAttribute(
      "data-unread-count",
      "250",
    );
  });
});

describe("NotificationBell — popover behavior", () => {
  it("clicking the trigger opens the popover (aria-expanded flips, content portaled in)", async () => {
    const user = userEvent.setup();
    render(<NotificationBell unreadCount={0} recentNotifications={[]} />);
    const trigger = screen.getByTestId("app-shell-notification-bell");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByTestId("app-shell-notification-bell-content"),
    ).toBeInTheDocument();
  });

  it("renders the honest empty state when there are no recent notifications", async () => {
    const user = userEvent.setup();
    render(<NotificationBell unreadCount={0} recentNotifications={[]} />);
    await user.click(screen.getByTestId("app-shell-notification-bell"));
    expect(
      screen.getByTestId("app-shell-notification-bell-empty"),
    ).toHaveTextContent(/no notifications yet\.?/i);
    expect(
      screen.queryByTestId("app-shell-notification-bell-list"),
    ).toBeNull();
  });

  it("renders recent rows from real fixture data — title + body + unread data attribute", async () => {
    const user = userEvent.setup();
    const recent: NotificationPreview[] = [
      fixturePreview({ id: "n-1", title: "Workflow failed", body: "Step 3 errored." }),
      fixturePreview({
        id: "n-2",
        title: "Reconnect Gmail",
        body: "Token expired.",
        severity: "warning",
        isUnread: false,
      }),
    ];
    render(<NotificationBell unreadCount={1} recentNotifications={recent} />);
    await user.click(screen.getByTestId("app-shell-notification-bell"));
    const list = screen.getByTestId("app-shell-notification-bell-list");
    expect(list).toBeInTheDocument();
    expect(screen.getByText("Workflow failed")).toBeInTheDocument();
    expect(screen.getByText("Step 3 errored.")).toBeInTheDocument();
    expect(screen.getByText("Reconnect Gmail")).toBeInTheDocument();
    expect(
      screen.getByTestId("app-shell-notification-bell-row-n-1"),
    ).toHaveAttribute("data-unread", "true");
    expect(
      screen.getByTestId("app-shell-notification-bell-row-n-2"),
    ).toHaveAttribute("data-unread", "false");
  });

  it("wraps a row in an anchor ONLY when `actionUrl` is set — no fake link affordance otherwise", async () => {
    const user = userEvent.setup();
    const recent: NotificationPreview[] = [
      fixturePreview({
        id: "with-link",
        title: "Has link",
        actionUrl: "/workflows/wf_42",
      }),
      fixturePreview({
        id: "no-link",
        title: "No link",
        actionUrl: null,
      }),
    ];
    render(<NotificationBell unreadCount={2} recentNotifications={recent} />);
    await user.click(screen.getByTestId("app-shell-notification-bell"));
    const linked = screen.getByTestId("app-shell-notification-bell-row-with-link");
    expect(linked.tagName.toLowerCase()).toBe("a");
    expect(linked).toHaveAttribute("href", "/workflows/wf_42");
    const unlinked = screen.getByTestId("app-shell-notification-bell-row-no-link");
    expect(unlinked.tagName.toLowerCase()).not.toBe("a");
    expect(unlinked.getAttribute("href")).toBeNull();
  });

  it("renders 'Mark all read' ONLY when unreadCount > 0 (the underlying server action is the real one)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <NotificationBell unreadCount={0} recentNotifications={[]} />,
    );
    await user.click(screen.getByTestId("app-shell-notification-bell"));
    expect(
      screen.queryByTestId("app-shell-notification-bell-mark-all-read"),
    ).toBeNull();
    unmount();

    render(
      <NotificationBell
        unreadCount={2}
        recentNotifications={[fixturePreview({ id: "n-1" })]}
      />,
    );
    await user.click(screen.getByTestId("app-shell-notification-bell"));
    const markAllButton = screen.getByTestId(
      "app-shell-notification-bell-mark-all-read",
    );
    expect(markAllButton.tagName.toLowerCase()).toBe("button");
    expect(markAllButton.getAttribute("type")).toBe("submit");
    expect(markAllButton.closest("form")).not.toBeNull();
  });

  it("'View all' footer links to /notifications (preserves the route as a fallback)", async () => {
    const user = userEvent.setup();
    render(<NotificationBell unreadCount={0} recentNotifications={[]} />);
    await user.click(screen.getByTestId("app-shell-notification-bell"));
    const viewAll = screen.getByTestId("app-shell-notification-bell-view-all");
    expect(viewAll).toHaveAttribute("href", "/notifications");
  });
});
