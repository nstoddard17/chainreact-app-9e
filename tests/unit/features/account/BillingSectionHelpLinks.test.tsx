/**
 * HELP-CENTER-CONTEXTUAL-1 — billing-surface Help Center links.
 *
 * Pins: usage explanation links render ONLY in warned/blocked states (a
 * normal usage row gains nothing), they point at the correct articles, the
 * plan-change link accompanies the cancel panel, and existing primary
 * billing UI (tier chip, usage figures) is unchanged.
 */
import { render, screen } from "@testing-library/react";
import { BillingSection, type AccountBillingView } from "@/features/account/AccountSections";
import type { AccountSummary } from "@/lib/api/accounts";

jest.mock("@/lib/api/personalBilling", () => ({
  getPersonalBillingState: jest.fn(() => new Promise(() => {})),
  setPersonalCancelAtPeriodEnd: jest.fn(),
}));

jest.mock("@/features/account/CheckoutChoiceButton", () => ({
  CheckoutChoiceButton: (props: Record<string, unknown>) => (
    <button data-testid="ccb">{props.label as string}</button>
  ),
}));

// The shared-account cancel panel fetches billing state on mount; keep it
// pending so the row (and our adjacent help link) can be asserted statically.
jest.mock("@/features/account/SubscriptionCancelPanel", () => ({
  SubscriptionCancelPanel: () => <div data-testid="mock-cancel-panel" />,
}));

function active(
  type: AccountSummary["type"],
  name = "Acct",
  role: "owner" | "admin" | "member" = "owner",
) {
  return { name, type, role };
}

const baseBilling: AccountBillingView = {
  usage: { tasksUsed: 12, tasksLimit: 100, periodStartedAt: "2026-06-01T00:00:00Z" },
  memberLimit: null,
  memberCount: null,
  folderLimit: 10,
  frozen: false,
};

const NOW = new Date("2026-06-09T00:00:00Z");

function renderBilling(
  acct: ReturnType<typeof active> | null,
  billing: Partial<AccountBillingView> = {},
  accountId?: string,
) {
  return render(
    <BillingSection
      active={acct}
      billing={{ ...baseBilling, ...billing }}
      now={NOW}
      accountId={accountId}
    />,
  );
}

describe("BillingSection — task-usage help link", () => {
  it("renders the task-usage article link when the account is over its limit", () => {
    renderBilling(active("personal"), {
      usage: { tasksUsed: 100, tasksLimit: 100, periodStartedAt: "2026-06-01T00:00:00Z" },
    });
    const help = screen.getByTestId("billing-usage-help-link");
    expect(help).toHaveAttribute("href", "/help/understand-task-usage");
    expect(help).toHaveTextContent("How task usage works");
    // Existing usage figure unchanged.
    expect(screen.getByTestId("billing-usage")).toHaveTextContent("100 / 100 tasks");
  });

  it("renders the link in the near-limit warning state too", () => {
    renderBilling(active("personal"), {
      usage: { tasksUsed: 95, tasksLimit: 100, periodStartedAt: "2026-06-01T00:00:00Z" },
    });
    expect(screen.getByTestId("billing-usage-help-link")).toBeInTheDocument();
  });

  it("does NOT render usage help in a normal, non-blocked state", () => {
    renderBilling(active("personal"));
    expect(screen.queryByTestId("billing-usage-help-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("billing-ai-credits-help-link")).not.toBeInTheDocument();
  });
});

describe("BillingSection — AI-credits help link", () => {
  it("renders the AI-credits article link when credits are exhausted", () => {
    renderBilling(active("personal"), {
      aiCredits: { used: 50, limit: 50, periodStartedAt: "2026-06-01T00:00:00Z" },
    });
    const help = screen.getByTestId("billing-ai-credits-help-link");
    expect(help).toHaveAttribute("href", "/help/understand-ai-credits");
    expect(help).toHaveTextContent("How AI credits work");
  });
});

describe("BillingSection — plan-change help link", () => {
  it("accompanies the shared-account cancel panel and points at the subscription article", () => {
    renderBilling(active("team"), { memberLimit: 5, memberCount: 2 }, "acct-1");
    expect(screen.getByTestId("mock-cancel-panel")).toBeInTheDocument();
    const help = screen.getByTestId("billing-plan-change-help-link");
    expect(help).toHaveAttribute("href", "/help/change-or-cancel-your-subscription");
    expect(help).toHaveTextContent("How plan changes work");
  });

  it("absent when the cancel row itself is absent (member role)", () => {
    renderBilling(active("team", "Acct", "member"), { memberLimit: 5, memberCount: 2 }, "acct-1");
    expect(screen.queryByTestId("billing-plan-change-help-link")).not.toBeInTheDocument();
  });
});
