/**
 * Tests for features/team/SettingsNav (Slice 4.TEAM-PAGE-4).
 *
 * Asserts the grouped settings sub-nav: real navigable sections (Overview /
 * Members / Roles) for a team, the active-state highlight, the member-count
 * badge, and that the "coming soon" Account items are inert (no nav callback).
 * For a personal account only Overview shows.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsNav } from "@/features/team/SettingsNav";

describe("SettingsNav — team account", () => {
  it("renders Overview / Members / Roles and the disabled Account group", () => {
    render(
      <SettingsNav section="overview" onSection={() => {}} isTeam memberCount={3} />,
    );
    expect(screen.getByTestId("team-settings-nav")).toBeInTheDocument();
    expect(screen.getByTestId("team-nav-overview")).toBeInTheDocument();
    expect(screen.getByTestId("team-nav-members")).toBeInTheDocument();
    expect(screen.getByTestId("team-nav-roles-access")).toBeInTheDocument();
    // Coming-soon Account items render, but as inert (non-button) entries.
    expect(screen.getByTestId("team-nav-soon-billing")).toHaveAttribute(
      "aria-disabled",
    );
    expect(screen.getByTestId("team-nav-soon-security")).toBeInTheDocument();
    expect(screen.getByTestId("team-nav-soon-notifications")).toBeInTheDocument();
  });

  it("marks the active section with aria-current and badges the member count", () => {
    render(
      <SettingsNav section="members" onSection={() => {}} isTeam memberCount={4} />,
    );
    expect(screen.getByTestId("team-nav-members")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("team-nav-overview")).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByTestId("team-nav-members")).toHaveTextContent("4");
  });

  it("fires onSection when a navigable section is clicked", () => {
    const onSection = jest.fn();
    render(
      <SettingsNav section="overview" onSection={onSection} isTeam memberCount={1} />,
    );
    fireEvent.click(screen.getByTestId("team-nav-roles-access"));
    expect(onSection).toHaveBeenCalledWith("roles");
  });
});

describe("SettingsNav — personal account", () => {
  it("shows only Overview (no Members/Roles, no Account group)", () => {
    render(
      <SettingsNav
        section="overview"
        onSection={() => {}}
        isTeam={false}
        memberCount={0}
      />,
    );
    expect(screen.getByTestId("team-nav-overview")).toBeInTheDocument();
    expect(screen.queryByTestId("team-nav-members")).toBeNull();
    expect(screen.queryByTestId("team-nav-roles-access")).toBeNull();
    expect(screen.queryByTestId("team-nav-soon-billing")).toBeNull();
  });
});
