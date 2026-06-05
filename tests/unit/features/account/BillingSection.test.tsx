/**
 * Tests for the read-only Plan & billing section (Slice 4.ACCOUNT-SETTINGS-BILLING-2
 * / BILL-1). Pure render — billing/limit facts are injected as props (the page
 * resolves them from account_billing + the limit helpers). No Stripe, no fake data.
 */
import { render, screen, within } from "@testing-library/react";
import { BillingSection, type AccountBillingView } from "@/features/account/AccountSections";
import type { AccountSummary } from "@/lib/api/accounts";

function active(type: AccountSummary["type"], name = "Acct") {
  return { name, type, role: "owner" as const };
}

const baseBilling: AccountBillingView = {
  usage: { tasksUsed: 12, tasksLimit: 100, periodStartedAt: "2026-06-01T00:00:00Z" },
  memberLimit: null,
  memberCount: null,
  folderLimit: 10,
  frozen: false,
};

function renderBilling(
  acct: ReturnType<typeof active> | null,
  billing: Partial<AccountBillingView> = {},
) {
  return render(<BillingSection active={acct} billing={{ ...baseBilling, ...billing }} />);
}

describe("BillingSection — tier label", () => {
  it("shows Free for a personal account", () => {
    renderBilling(active("personal", "Personal"));
    expect(screen.getByTestId("billing-tier")).toHaveTextContent("Free");
  });

  it("shows Team for a team account", () => {
    renderBilling(active("team"), { memberLimit: 5, memberCount: 2, folderLimit: 100 });
    expect(screen.getByTestId("billing-tier")).toHaveTextContent("Team");
  });

  it("shows Business (never Organization) for an internal organization account", () => {
    renderBilling(active("organization"), { memberLimit: 25, memberCount: 3, folderLimit: 250 });
    const section = screen.getByTestId("account-section-billing");
    expect(screen.getByTestId("billing-tier")).toHaveTextContent("Business");
    expect(section).not.toHaveTextContent(/Organization/);
  });
});

describe("BillingSection — usage", () => {
  it("renders real task usage when provided", () => {
    renderBilling(active("personal"));
    expect(screen.getByTestId("billing-usage")).toHaveTextContent("12 / 100 tasks");
  });

  it("renders an unavailable state (not fake usage) when usage is null", () => {
    renderBilling(active("personal"), { usage: null });
    expect(screen.queryByTestId("billing-usage")).toBeNull();
    expect(screen.getByTestId("billing-usage-unavailable")).toHaveTextContent(/unavailable/i);
  });
});

describe("BillingSection — limits", () => {
  it("renders member count/limit for Team/Business", () => {
    renderBilling(active("team"), { memberLimit: 5, memberCount: 2, folderLimit: 100 });
    expect(screen.getByTestId("billing-members")).toHaveTextContent("2 of 5 members");
  });

  it("omits the members row for a personal account", () => {
    renderBilling(active("personal"), { memberLimit: null });
    expect(screen.queryByTestId("billing-members")).toBeNull();
  });

  it("renders the folder limit", () => {
    renderBilling(active("organization"), { memberLimit: 25, memberCount: 1, folderLimit: 250 });
    expect(screen.getByTestId("billing-folders")).toHaveTextContent("Up to 250 folders");
  });
});

describe("BillingSection — copy + controls", () => {
  it("shows the 'members don't need Pro' copy for Team/Business", () => {
    renderBilling(active("team"), { memberLimit: 5, memberCount: 1 });
    expect(screen.getByTestId("billing-no-pro-copy")).toHaveTextContent(/don.t need their own Pro/i);
  });

  it("does NOT show the shared-seat copy for a personal account", () => {
    renderBilling(active("personal"));
    expect(screen.queryByTestId("billing-no-pro-copy")).toBeNull();
  });

  it("exposes only coming-soon markers — no checkout/portal/payment controls", () => {
    renderBilling(active("personal"));
    const section = screen.getByTestId("account-section-billing");
    expect(within(section).getAllByTestId("account-coming-soon").length).toBeGreaterThan(0);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("BillingSection — frozen account", () => {
  it("renders a read-only pending-deletion warning and no upgrade affordance", () => {
    renderBilling(active("team"), { memberLimit: 5, memberCount: 2, frozen: true });
    expect(screen.getByTestId("billing-frozen")).toHaveTextContent(/pending deletion/i);
    // The upgrade/checkout coming-soon row is suppressed while frozen.
    expect(screen.getByTestId("account-section-billing")).not.toHaveTextContent(
      /Upgrade or change plan/i,
    );
  });
});
