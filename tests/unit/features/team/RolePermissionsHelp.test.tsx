/**
 * Tests for features/team/RolePermissionsHelp (Slice 4.TEAM-PAGE-3).
 *
 * Asserts the always-visible product truth (roles gate member management, not
 * workspace access), the collapsed-by-default detail, and the per-role
 * breakdown with the Admin-can't-manage-Owners/Admins clarification.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { RolePermissionsHelp } from "@/features/team/RolePermissionsHelp";

describe("RolePermissionsHelp", () => {
  it("always shows the scope note: roles gate people management, not workspace access", () => {
    render(<RolePermissionsHelp />);
    expect(
      screen.getByText(/Roles only control who can manage people/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/full access to the team's workflows/i)).toBeInTheDocument();
  });

  it("keeps the per-role detail collapsed until toggled", () => {
    render(<RolePermissionsHelp />);
    expect(screen.queryByTestId("team-role-help-detail")).toBeNull();
    fireEvent.click(screen.getByTestId("team-role-help-toggle"));
    expect(screen.getByTestId("team-role-help-detail")).toBeInTheDocument();
  });

  it("explains Owner / Admin / Member, incl. Admin can't manage owners or admins", () => {
    render(<RolePermissionsHelp />);
    fireEvent.click(screen.getByTestId("team-role-help-toggle"));
    const detail = screen.getByTestId("team-role-help-detail");
    expect(detail).toHaveTextContent("Owner");
    expect(detail).toHaveTextContent("Admin");
    expect(detail).toHaveTextContent("Member");
    expect(detail).toHaveTextContent(/Manage the owner or other admins/i);
    expect(detail).toHaveTextContent(/Can't invite or manage people/i);
  });
});
