/**
 * Tests for features/team/RolesTable (Slice 4.TEAM-PAGE-4).
 *
 * The design-faithful roles matrix must communicate the REAL ChainReact model:
 *   - all three roles (Owner/Admin/Member) appear as columns,
 *   - "Use workflows & apps" is ✓ for ALL roles (roles don't gate access),
 *   - Member can't invite, Admin manages members only (✓*),
 *   - owner-only controls render as "Later", never an active ✓,
 *   - the scope note + footnotes spell out the honest truth.
 */
import { render, screen, within } from "@testing-library/react";
import { RolesTable } from "@/features/team/RolesTable";

describe("RolesTable", () => {
  beforeEach(() => render(<RolesTable />));

  it("shows all three real roles as columns", () => {
    expect(screen.getByTestId("team-role-badge-owner")).toBeInTheDocument();
    expect(screen.getByTestId("team-role-badge-admin")).toBeInTheDocument();
    expect(screen.getByTestId("team-role-badge-member")).toBeInTheDocument();
  });

  it("grants workspace access to EVERY role (roles don't gate workflows/apps)", () => {
    const row = screen.getByTestId("team-cap-use");
    expect(within(row).getAllByLabelText("Yes")).toHaveLength(3);
  });

  it("lets Owner+Admin invite but not Member", () => {
    const row = screen.getByTestId("team-cap-invite");
    expect(within(row).getAllByLabelText("Yes")).toHaveLength(2);
    expect(within(row).getAllByLabelText("No")).toHaveLength(1);
  });

  it("marks Admin as managing members only (✓*), not a full yes", () => {
    const row = screen.getByTestId("team-cap-manage");
    expect(within(row).getByLabelText("Members only")).toBeInTheDocument();
  });

  it("renders owner-only controls as 'Later', never an active capability", () => {
    const row = screen.getByTestId("team-cap-owner");
    expect(within(row).getByText("Later")).toBeInTheDocument();
    expect(within(row).queryAllByLabelText("Yes")).toHaveLength(0);
  });

  it("states the honest scope: roles gate people management, not workspace access", () => {
    expect(
      screen.getByText(/full access to the team's workflows/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/coming later/i)).toBeInTheDocument();
  });
});
