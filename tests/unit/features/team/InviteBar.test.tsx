/**
 * Tests for features/team/InviteBar role helper (Slice 4.TEAM-PAGE-3).
 *
 * Asserts the invite role dropdown carries a plain-language explanation that
 * updates as the inviter switches between "As Member" and "As Admin", so the
 * choice is self-explanatory. Mutations aren't exercised (client mocked).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { InviteBar } from "@/features/team/InviteBar";

jest.mock("@/lib/api/accounts", () => ({
  AccountApiError: class extends Error {},
  createInvitation: jest.fn(),
}));

describe("InviteBar — role helper", () => {
  it("explains the Member role by default", () => {
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    const help = screen.getByTestId("team-invite-role-help");
    expect(help).toHaveTextContent("As Member:");
    expect(help).toHaveTextContent(/Full access to the team's workflows/i);
    expect(help).toHaveTextContent(/Can't invite or manage people/i);
  });

  it("updates the explanation to the Admin role when selected", () => {
    render(<InviteBar accountId="t1" disabled={false} onChanged={() => {}} />);
    fireEvent.change(screen.getByLabelText("Invite role"), {
      target: { value: "admin" },
    });
    const help = screen.getByTestId("team-invite-role-help");
    expect(help).toHaveTextContent("As Admin:");
    expect(help).toHaveTextContent(/invite people and manage members/i);
    expect(help).toHaveTextContent(/Can't manage owners or other admins/i);
  });
});
