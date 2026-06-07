/**
 * Tests for the read-only Plan & billing section (Slice 4.ACCOUNT-SETTINGS-BILLING-2
 * / BILL-1). Pure render — billing/limit facts are injected as props (the page
 * resolves them from account_billing + the limit helpers). No Stripe, no fake data.
 */
import { render, screen, within } from "@testing-library/react";
import { BillingSection, type AccountBillingView } from "@/features/account/AccountSections";
import type { AccountSummary } from "@/lib/api/accounts";

// The interactive personal-plan panel fetches on mount; keep it in its loading state so
// BillingSection gating can be asserted by the panel container's presence/absence.
jest.mock("@/lib/api/personalBilling", () => ({
  getPersonalBillingState: jest.fn(() => new Promise(() => {})),
  setPersonalCancelAtPeriodEnd: jest.fn(),
}));

function active(type: AccountSummary["type"], name = "Acct", role: "owner" | "admin" | "member" = "owner") {
  return { name, type, role };
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

  it("prefers the explicit stored plan over the type default (CS-1)", () => {
    // A personal account on the Pro plan shows "Pro", not the type-default "Free".
    renderBilling(active("personal", "Personal"), { plan: "pro" });
    expect(screen.getByTestId("billing-tier")).toHaveTextContent("Pro");
  });

  it("falls back to the type-default label when no explicit plan is provided", () => {
    renderBilling(active("personal"), { plan: null });
    expect(screen.getByTestId("billing-tier")).toHaveTextContent("Free");
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

describe("BillingSection — lifecycle status (CS-5)", () => {
  it("shows NO status banner for a healthy active plan", () => {
    renderBilling(active("personal"), { plan: "pro", planStatus: "active" });
    expect(screen.queryByTestId("billing-status")).toBeNull();
  });

  it("shows a past_due warning that keeps access (never says blocked)", () => {
    renderBilling(active("personal"), { plan: "pro", planStatus: "past_due" });
    const banner = screen.getByTestId("billing-status");
    expect(banner).toHaveAttribute("data-level", "warning");
    expect(screen.getByTestId("billing-status-label")).toHaveTextContent(/past due/i);
    expect(banner).toHaveTextContent(/still active/i);
    expect(banner).not.toHaveTextContent(/blocked|cannot run|can.t run/i);
  });

  it("shows a canceled warning with no auto-downgrade language", () => {
    renderBilling(active("organization"), {
      plan: "business",
      planStatus: "canceled",
      memberLimit: 25,
      memberCount: 2,
      folderLimit: 250,
    });
    const banner = screen.getByTestId("billing-status");
    expect(screen.getByTestId("billing-status-label")).toHaveTextContent("Canceled");
    expect(banner).toHaveTextContent(/still have access/i);
    // Business label is never the raw "Organization" word.
    expect(screen.getByTestId("account-section-billing")).not.toHaveTextContent(/Organization/);
  });

  it("shows cancel_at_period_end copy + an 'Access ends' dated row", () => {
    renderBilling(active("personal"), {
      plan: "pro",
      planStatus: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-07-15T00:00:00Z",
    });
    expect(screen.getByTestId("billing-status-label")).toHaveTextContent(/cancel/i);
    const periodRow = screen.getByTestId("billing-period-end");
    expect(periodRow).toHaveAttribute("data-kind", "ends");
    expect(periodRow).toHaveTextContent(/July 15, 2026/);
  });

  it("shows a 'Renews on' dated row for a healthy active subscription", () => {
    renderBilling(active("personal"), {
      plan: "pro",
      planStatus: "active",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
    });
    const periodRow = screen.getByTestId("billing-period-end");
    expect(periodRow).toHaveAttribute("data-kind", "renews");
    expect(periodRow).toHaveTextContent(/August 1, 2026/);
  });

  it("renders no payment/checkout controls even with a status banner (warn-only)", () => {
    renderBilling(active("personal"), { plan: "pro", planStatus: "past_due" });
    const section = screen.getByTestId("account-section-billing");
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(within(section).queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("BillingSection — personal-plan panel gating (PPT-3)", () => {
  const ACCT = "acct-1";

  it("renders the personal-plan panel for a personal owner when the flag is ON", () => {
    render(
      <BillingSection
        active={active("personal")}
        accountId={ACCT}
        billing={{ ...baseBilling, platformBillingEnabled: true }}
      />,
    );
    expect(screen.getByTestId("personal-plan-panel")).toBeInTheDocument();
  });

  it("does NOT render the panel when the platform-billing flag is OFF", () => {
    render(
      <BillingSection
        active={active("personal")}
        accountId={ACCT}
        billing={{ ...baseBilling, platformBillingEnabled: false }}
      />,
    );
    expect(screen.queryByTestId("personal-plan-panel")).toBeNull();
  });

  it("does NOT render the panel for a Team/Business account", () => {
    render(
      <BillingSection
        active={active("organization")}
        accountId={ACCT}
        billing={{ ...baseBilling, platformBillingEnabled: true, memberLimit: 25, memberCount: 2, folderLimit: 250 }}
      />,
    );
    expect(screen.queryByTestId("personal-plan-panel")).toBeNull();
  });

  it("does NOT render the panel for a non-owner/admin member", () => {
    render(
      <BillingSection
        active={active("personal", "Personal", "member")}
        accountId={ACCT}
        billing={{ ...baseBilling, platformBillingEnabled: true }}
      />,
    );
    expect(screen.queryByTestId("personal-plan-panel")).toBeNull();
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
