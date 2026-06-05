/**
 * Tests for features/team/OverviewSection tier-label copy
 * (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-6 / TL-5).
 *
 * The internal account type stays `organization`, but the UI must surface the
 * tier as **Business** — never the raw "Organization" word. Child components
 * (switcher + account actions) are stubbed so this isolates the label.
 */
import { render, screen } from "@testing-library/react";
import { OverviewSection } from "@/features/team/OverviewSection";
import type { AccountSummary } from "@/lib/api/accounts";

jest.mock("@/features/team/AccountSwitcher", () => ({
  AccountSwitcher: () => null,
}));
jest.mock("@/features/team/AccountActions", () => ({
  AccountActions: () => null,
}));

const org: AccountSummary = {
  id: "o1",
  name: "Acme Biz",
  type: "organization",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};

function renderOverview() {
  return render(
    <OverviewSection
      accounts={[org]}
      activeAccountId="o1"
      active={org}
      isTeam
      members={[]}
      seatsUsed={1}
      memberCap={null}
      teamMaxMembers={5}
      onChanged={() => {}}
    />,
  );
}

describe("OverviewSection — Business tier label", () => {
  it("labels an internal `organization` account as Business, not Organization", () => {
    renderOverview();
    const overview = screen.getByTestId("team-overview");
    expect(overview).toHaveTextContent(/Business/);
    expect(overview).not.toHaveTextContent(/Organization/);
  });

  it("renders the Business plan line for an uncapped account", () => {
    renderOverview();
    expect(screen.getByTestId("team-overview")).toHaveTextContent(/Business plan/);
  });
});
