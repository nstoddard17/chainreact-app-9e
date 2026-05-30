/**
 * Tests for components/app-shell/NotificationBell
 * (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Pure presentational — receives `unreadCount` from the server page
 * (which fetched it via `notificationsRepo.countUnreadForUser`). Pins:
 *   - Always renders a real link to `/notifications`.
 *   - Badge renders ONLY when count > 0 (no fake "0" pill).
 *   - Counts > 99 display as "99+".
 *   - aria-label reflects the unread state ("Notifications" vs
 *     "Notifications (N unread)").
 *   - `data-unread-count` carries the raw count for downstream tests /
 *     instrumentation.
 */
import { render, screen } from "@testing-library/react";

import { NotificationBell } from "@/components/app-shell/NotificationBell";

describe("NotificationBell", () => {
  it("renders a real link to /notifications", () => {
    render(<NotificationBell unreadCount={0} />);
    const bell = screen.getByTestId("app-shell-notification-bell");
    expect(bell).toHaveAttribute("href", "/notifications");
  });

  it("hides the badge when unreadCount === 0", () => {
    render(<NotificationBell unreadCount={0} />);
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
    render(<NotificationBell unreadCount={3} />);
    expect(
      screen.getByTestId("app-shell-notification-bell-badge"),
    ).toHaveTextContent("3");
    expect(screen.getByTestId("app-shell-notification-bell")).toHaveAttribute(
      "aria-label",
      "Notifications (3 unread)",
    );
  });

  it("caps the displayed badge at 99+ for large counts", () => {
    render(<NotificationBell unreadCount={250} />);
    expect(
      screen.getByTestId("app-shell-notification-bell-badge"),
    ).toHaveTextContent("99+");
    // Raw count still on data attribute for instrumentation.
    expect(screen.getByTestId("app-shell-notification-bell")).toHaveAttribute(
      "data-unread-count",
      "250",
    );
  });
});
