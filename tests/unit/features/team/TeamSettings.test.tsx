/**
 * Tests for features/team/TeamSettings (Slice 4.TEAM-PAGE-3).
 *
 * Asserts the supported, truthful summary (name / type / role / plan) renders,
 * the coming-soon section lists deferred capabilities, and — critically — that
 * the settings shell exposes NO active controls (no buttons / links), so a
 * "coming soon" item can never be mistaken for a working action.
 */
import { render, screen, within } from "@testing-library/react";
import type { AccountSummary } from "@/lib/api/accounts";
import { TeamSettings } from "@/features/team/TeamSettings";

const team: AccountSummary = {
  id: "t1",
  name: "Acme Co",
  type: "team",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};

describe("TeamSettings — supported summary", () => {
  it("shows account name (read-only), type, role, and a plan/member line", () => {
    render(<TeamSettings account={team} seatsUsed={3} memberCap={5} teamMaxMembers={5} />);
    const summary = screen.getByTestId("team-settings-summary");
    expect(within(summary).getByText("Acme Co")).toBeInTheDocument();
    expect(within(summary).getByText("Team")).toBeInTheDocument();
    expect(within(summary).getByText("owner")).toBeInTheDocument();
    expect(within(summary).getByText(/Team plan · 3 of 5 members/i)).toBeInTheDocument();
  });

  it("renders the account name as plain text, not an editable input (no rename)", () => {
    render(<TeamSettings account={team} seatsUsed={1} memberCap={5} teamMaxMembers={5} />);
    const settings = screen.getByTestId("team-settings");
    expect(within(settings).queryByRole("textbox")).toBeNull();
  });
});

describe("TeamSettings — coming soon is inert", () => {
  it("lists deferred capabilities without any active control", () => {
    render(<TeamSettings account={team} seatsUsed={3} memberCap={5} teamMaxMembers={5} />);
    const cs = screen.getByTestId("team-settings-coming-soon");
    expect(within(cs).getByText("Billing & usage")).toBeInTheDocument();
    expect(within(cs).getByText("Organization upgrade")).toBeInTheDocument();
    expect(within(cs).getByText("Transfer ownership")).toBeInTheDocument();
    expect(within(cs).getByText("Leave team")).toBeInTheDocument();
    expect(within(cs).getByText("Email invites")).toBeInTheDocument();
    // No buttons or links anywhere in the settings shell — nothing is clickable.
    const settings = screen.getByTestId("team-settings");
    expect(within(settings).queryAllByRole("button")).toHaveLength(0);
    expect(within(settings).queryAllByRole("link")).toHaveLength(0);
  });
});
