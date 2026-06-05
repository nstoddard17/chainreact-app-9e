/**
 * Tests for features/team/AccountSwitcher tier labels
 * (Slice 4.ACCOUNT-LABELS-1).
 *
 * The Team-page account switcher must surface the internal `organization` type
 * as **Business**, never the raw "Organization" word — via the shared
 * `accountTypeLabel`. The typed client is mocked; we assert label rendering only.
 */
import { render, screen, within } from "@testing-library/react";
import { AccountSwitcher } from "@/features/team/AccountSwitcher";
import type { AccountSummary } from "@/lib/api/accounts";

jest.mock("@/lib/api/accounts", () => {
  const actual = jest.requireActual("@/lib/api/accounts");
  return { ...actual, setActiveAccount: jest.fn(), createTeam: jest.fn() };
});

function acct(over: Partial<AccountSummary> & { id: string; name: string }): AccountSummary {
  return { type: "personal", role: "owner", isActive: false, deletionStatus: "active", ...over };
}

describe("features/team AccountSwitcher — tier labels", () => {
  it("labels an internal organization account as Business (never Organization)", () => {
    render(
      <AccountSwitcher
        accounts={[
          acct({ id: "p1", name: "Personal", type: "personal", isActive: true }),
          acct({ id: "o1", name: "Acme Biz", type: "organization", role: "owner" }),
        ]}
        activeAccountId="p1"
        onChanged={() => {}}
      />,
    );
    const orgRow = screen.getByTestId("team-account-o1");
    expect(within(orgRow).getByText(/Business · owner/)).toBeInTheDocument();
    expect(orgRow).not.toHaveTextContent("Organization");
  });

  it("labels team and personal accounts correctly", () => {
    render(
      <AccountSwitcher
        accounts={[
          acct({ id: "p1", name: "Personal", type: "personal", isActive: true }),
          acct({ id: "t1", name: "Acme", type: "team", role: "admin" }),
        ]}
        activeAccountId="p1"
        onChanged={() => {}}
      />,
    );
    expect(within(screen.getByTestId("team-account-t1")).getByText(/Team · admin/)).toBeInTheDocument();
    expect(within(screen.getByTestId("team-account-p1")).getByText(/Personal · owner/)).toBeInTheDocument();
  });
});
