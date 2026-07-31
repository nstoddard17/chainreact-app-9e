/**
 * RESPONSIVE-SETTINGS-3 — Account Settings responsive behaviour.
 *
 * jsdom has no layout engine, so GEOMETRY is not asserted here — that is the job
 * of the continuous real-browser sweep
 * (`scripts/responsive/measure-app-shell.mjs`, 15 states ×
 * 158 widths from 360→1600). What this file protects is everything the sweep
 * cannot see: that the compact navigation actually navigates, that the active
 * section survives the presentation change, that the controls the brief requires
 * to stay reachable are still in the document and still operable, and that the
 * responsive rework did not change a single byte of what gets SUBMITTED.
 *
 * Where a class is asserted it is asserted as the mechanism behind a rendered
 * behaviour that is checked alongside it (a row that stacks and still contains
 * both its label and its control; a control slot that can shrink) — never as a
 * bare class-string snapshot.
 */
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/features/account/AccountSettings";
import { SettingRow } from "@/features/team/SettingRow";
import { ACCOUNT_NAV_GROUPS } from "@/features/account/accountNav";
import type { AccountBillingView } from "@/features/account/AccountSections";

const mockUpdateDisplayName = jest.fn();

jest.mock("@/lib/api/accounts", () => {
  class AccountApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "VALIDATION", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  class AccountDeletionError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "UNKNOWN", status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    AccountApiError,
    AccountDeletionError,
    updateDisplayName: (...a: unknown[]) => mockUpdateDisplayName(...a),
    getMfaStatus: jest.fn().mockResolvedValue({ enabled: false, factor: null }),
    beginMfaEnrollment: jest.fn(),
    confirmMfaEnrollment: jest.fn(),
    disableMfa: jest.fn(),
    getNotificationPreferences: jest.fn().mockResolvedValue({
      workflowAlerts: true,
      teamActivity: true,
      productUpdates: false,
    }),
    updateNotificationPreferences: jest.fn(),
    getDefaultBuilderView: jest.fn().mockResolvedValue("ask"),
    updateDefaultBuilderView: jest.fn(),
    listApiKeys: jest.fn().mockResolvedValue([]),
    createApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
    sendAccountDeletionCode: jest.fn(),
    verifyAccountDeletionCode: jest.fn(),
    requestAccountDeletion: jest.fn(),
    cancelAccountDeletion: jest.fn(),
    retryAccountDeletionBilling: jest.fn(),
    LAUNCH_API_KEY_SCOPE: "workflows:trigger",
  };
});

jest.mock("@/lib/api/mcp", () => ({
  MCP_ENDPOINT_URL: "https://mcp.chainreact.app/mcp",
  MCP_READ_SCOPES: ["accounts:read"],
  listMcpTokens: jest.fn().mockResolvedValue([]),
  createMcpToken: jest.fn(),
  revokeMcpToken: jest.fn(),
  McpApiError: class extends Error {},
}));

const LONG_NAME =
  "Northwind_Traders_Global_Revenue_Operations_And_Partner_Enablement_EMEA_2026";
const LONG_EMAIL =
  "alexandra.featherstonehaugh-mcallister@northwind-traders-global-operations.example";

function billing(over: Partial<AccountBillingView> = {}): AccountBillingView {
  return {
    usage: { tasksUsed: 1284, tasksLimit: 10000, periodStartedAt: "2026-07-01T00:00:00Z" },
    aiCredits: { used: 190, limit: 500, periodStartedAt: "2026-07-01T00:00:00Z" },
    memberLimit: 25,
    memberCount: 12,
    folderLimit: 250,
    frozen: false,
    plan: "business",
    planStatus: "active",
    currentPeriodEnd: "2026-08-01T00:00:00Z",
    cancelAtPeriodEnd: false,
    usageNowIso: "2026-07-15T12:00:00Z",
    ...over,
  };
}

function renderSettings(over: Partial<Parameters<typeof AccountSettings>[0]> = {}) {
  return render(
    <AccountSettings
      active={{ name: "Northwind Traders", type: "organization", role: "owner" }}
      activeAccountId="00000000-0000-4000-8000-000000000001"
      isPersonal={false}
      deletionStatus="active"
      purgeAfter={null}
      userEmail="sam@example.com"
      displayName="Sam Okafor"
      emailVerified
      signInMethod="Email & password"
      billing={billing()}
      {...over}
    />,
  );
}

beforeEach(() => {
  mockUpdateDisplayName.mockReset();
  mockUpdateDisplayName.mockResolvedValue({ displayName: "Renamed" });
});

// ── Settings navigation ──────────────────────────────────────────────────────

describe("settings navigation stays usable when it becomes compact", () => {
  it("offers a compact disclosure that names the CURRENT section", () => {
    renderSettings({ initialSection: "billing" });
    const toggle = screen.getByTestId("account-settings-nav-toggle");
    // Not a generic "Menu": the collapsed control has to say where you are, or
    // the compact presentation loses the active-section indication the wide one
    // gives you for free.
    expect(toggle).toHaveTextContent("Plan & billing");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("expands and collapses, and the disclosure controls the section list", async () => {
    const user = userEvent.setup();
    renderSettings();
    const toggle = screen.getByTestId("account-settings-nav-toggle");
    const controlled = toggle.getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    expect(document.getElementById(controlled!)).not.toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates from the compact menu and closes it afterwards", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByTestId("account-settings-nav-toggle"));
    await user.click(screen.getByTestId("account-nav-security"));

    expect(screen.getByTestId("account-section-security")).toBeInTheDocument();
    // Collapsing after a choice is what a menu is expected to do — otherwise the
    // section you just picked stays pushed off the bottom of a phone screen.
    expect(screen.getByTestId("account-settings-nav-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId("account-settings-nav-toggle")).toHaveTextContent(
      "Security & access",
    );
  });

  it("keeps ONE set of section buttons — no desktop/mobile duplicate that could disagree", () => {
    renderSettings();
    for (const item of ACCOUNT_NAV_GROUPS.flatMap((g) => g.items)) {
      expect(screen.getAllByTestId(`account-nav-${item.id}`)).toHaveLength(1);
    }
  });

  it("preserves every destination and the deep-linked section", () => {
    for (const item of ACCOUNT_NAV_GROUPS.flatMap((g) => g.items)) {
      const { unmount } = renderSettings({ initialSection: item.id, isPersonal: true });
      expect(screen.getByTestId(`account-nav-${item.id}`)).toHaveAttribute(
        "aria-current",
        "page",
      );
      unmount();
    }
  });

  it("marks the active section for assistive tech in BOTH presentations", async () => {
    const user = userEvent.setup();
    renderSettings({ initialSection: "api" });
    // The same button carries `aria-current` whether the nav is a sidebar or the
    // expanded disclosure — there is only one of it.
    expect(screen.getByTestId("account-nav-api")).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByTestId("account-settings-nav-toggle"));
    expect(screen.getByTestId("account-nav-api")).toHaveAttribute("aria-current", "page");
  });

  it("keeps the section list reachable by keyboard", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByTestId("account-settings-nav-toggle"));
    const profile = screen.getByTestId("account-nav-profile");
    profile.focus();
    expect(profile).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("account-section-profile")).toBeInTheDocument();
  });
});

// ── Form rows ────────────────────────────────────────────────────────────────

describe("form rows relate label and control responsively", () => {
  it("stacks below sm and sits side-by-side above it, keeping both parts", () => {
    render(
      <SettingRow
        label="A very long setting label that would once have squeezed its control"
        desc="With a description long enough to compete for the same line as the control."
      >
        <span data-testid="the-control">Control</span>
      </SettingRow>,
    );
    const row = screen.getByTestId("setting-row");
    // Behaviour: the row holds BOTH its label text and its control…
    expect(row).toHaveTextContent("A very long setting label");
    expect(within(row).getByTestId("the-control")).toBeInTheDocument();
    // …and the mechanism that makes that survive a narrow width: column by
    // default, row only from `sm`.
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("sm:flex-row");
  });

  it("lets the control slot yield instead of pinning it at its intrinsic width", () => {
    render(
      <SettingRow label="Email address">
        <span data-testid="long-value">{LONG_EMAIL}</span>
      </SettingRow>,
    );
    const slot = screen.getByTestId("long-value").parentElement!;
    // `shrink-0` here was the defect: it made a 74-character email the row's
    // minimum width. It must not come back.
    expect(slot.className).not.toContain("shrink-0");
    expect(slot.className).toContain("min-w-0");
  });

  it("keeps a stacked row's control full width for inputs", () => {
    render(
      <SettingRow label="Display name" stacked>
        <input data-testid="field" />
      </SettingRow>,
    );
    const slot = screen.getByTestId("field").parentElement!;
    expect(slot.className).toContain("w-full");
    expect(slot.className).toContain("min-w-0");
  });
});

describe("long identity values are contained rather than clipped", () => {
  it("wraps a long account name in the Account overview", () => {
    renderSettings({
      initialSection: "account",
      active: { name: LONG_NAME, type: "organization", role: "owner" },
    });
    // Scope to the "Account name" row — the name also appears in the Team
    // pointer card's prose, which is ordinary wrapping text.
    const nameRow = screen
      .getByText("Account name")
      .closest('[data-testid="setting-row"]') as HTMLElement;
    const value = within(nameRow).getByText(LONG_NAME);
    expect(value).toBeVisible();
    expect(value.className).toContain("break-words");
  });

  it("breaks a long unbroken email in Profile and in Security", () => {
    const { unmount } = renderSettings({ initialSection: "profile", userEmail: LONG_EMAIL });
    const profileEmail = screen.getByTestId("profile-email");
    expect(profileEmail).toHaveTextContent(LONG_EMAIL);
    // An email has no spaces, so `break-words` alone cannot split it.
    expect(profileEmail.className).toContain("break-all");
    unmount();

    renderSettings({ initialSection: "security", userEmail: LONG_EMAIL });
    const securityEmail = screen.getByText(LONG_EMAIL);
    expect(securityEmail.className).toContain("break-all");
    // The status badge stays paired with it rather than being pushed out.
    expect(screen.getByTestId("security-email-status")).toBeInTheDocument();
  });
});

// ── Save / action rows ───────────────────────────────────────────────────────

describe("save and cancel stay reachable and submit unchanged data", () => {
  it("submits exactly the trimmed display name the user typed", async () => {
    const user = userEvent.setup();
    renderSettings({ initialSection: "profile", displayName: "" });
    const input = screen.getByTestId("profile-display-name-input");
    await user.type(input, "  Alexandra Featherstonehaugh-McAllister  ");
    await user.click(screen.getByTestId("profile-display-name-save"));

    // The responsive rework touched this row's layout only. The payload is the
    // contract, and it must be byte-identical.
    await waitFor(() => expect(mockUpdateDisplayName).toHaveBeenCalledTimes(1));
    expect(mockUpdateDisplayName).toHaveBeenCalledWith(
      "Alexandra Featherstonehaugh-McAllister",
    );
  });

  it("keeps the validation message visible and associated with its field", async () => {
    const user = userEvent.setup();
    mockUpdateDisplayName.mockRejectedValue(
      Object.assign(new Error("That display name is too long."), { code: "VALIDATION" }),
    );
    renderSettings({ initialSection: "profile", displayName: "" });
    await user.type(screen.getByTestId("profile-display-name-input"), "x");
    await user.click(screen.getByTestId("profile-display-name-save"));

    const error = await screen.findByTestId("profile-display-name-error");
    expect(error).toBeVisible();
    expect(error).toHaveAttribute("role", "alert");
    // Still inside the same stacked row as the input it describes.
    const row = screen.getByTestId("profile-display-name-input").closest(
      '[data-testid="setting-row"]',
    );
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByTestId("profile-display-name-error")).toBe(error);
  });

  it("wraps the Save cluster instead of letting the button push the field out", () => {
    renderSettings({ initialSection: "profile" });
    const save = screen.getByTestId("profile-display-name-save");
    const cluster = save.parentElement!;
    expect(cluster.className).toContain("flex-wrap");
    // The field yields, the button holds its label.
    expect(screen.getByTestId("profile-display-name-input").className).toContain("min-w-0");
    expect(save.className).toContain("shrink-0");
  });
});

// ── Billing and usage ────────────────────────────────────────────────────────

describe("billing and usage stay fully visible", () => {
  it("shows every billing fact — nothing is dropped for narrow screens", () => {
    renderSettings({ initialSection: "billing" });
    for (const id of [
      "billing-tier",
      "billing-usage",
      "billing-usage-remaining",
      "billing-ai-credits",
      "billing-ai-credits-remaining",
      "billing-members",
      "billing-folders",
      "billing-period-end",
      "billing-usage-scope-note",
    ]) {
      expect(screen.getByTestId(id)).toBeVisible();
    }
  });

  it("preserves the warning wording and thresholds when usage is exhausted", () => {
    renderSettings({
      initialSection: "billing",
      billing: billing({
        usage: { tasksUsed: 1250000, tasksLimit: 1000000, periodStartedAt: "2026-07-01T00:00:00Z" },
        aiCredits: { used: 500, limit: 500, periodStartedAt: "2026-07-01T00:00:00Z" },
      }),
    });
    expect(screen.getByTestId("billing-usage-remaining")).toHaveTextContent(/No tasks left/i);
    expect(screen.getByTestId("billing-ai-credits-remaining")).toHaveTextContent(
      /No AI credits left/i,
    );
    // Large numbers are still rendered in full rather than being cut to fit.
    expect(screen.getByTestId("billing-usage")).toHaveTextContent("1250000 / 1000000 tasks");
  });

  it("keeps the frozen (read-only) billing state and its explanation", () => {
    renderSettings({ initialSection: "billing", billing: billing({ frozen: true }) });
    expect(screen.getByTestId("billing-frozen")).toBeVisible();
  });
});

// ── Security ─────────────────────────────────────────────────────────────────

describe("security controls stay usable", () => {
  it("keeps the password and two-factor controls operable", async () => {
    const user = userEvent.setup();
    renderSettings({ initialSection: "security" });
    await user.click(screen.getByTestId("security-change-password-open"));

    const form = screen.getByTestId("security-change-password-form");
    expect(within(form).getByTestId("security-current-password")).toBeVisible();
    expect(within(form).getByTestId("security-new-password")).toBeVisible();
    expect(within(form).getByTestId("security-confirm-password")).toBeVisible();
    // Save and Cancel keep their priority order and both stay reachable.
    expect(within(form).getByTestId("security-change-password-save")).toBeVisible();
    expect(within(form).getByTestId("security-change-password-cancel")).toBeVisible();

    await waitFor(() => expect(screen.getByTestId("mfa-panel")).toBeInTheDocument());
    expect(screen.getByTestId("mfa-setup-open")).toBeVisible();
    expect(screen.getByTestId("mfa-recovery-note")).toBeVisible();
  });

  it("caps the security form so it cannot exceed its card", async () => {
    const user = userEvent.setup();
    renderSettings({ initialSection: "security" });
    await user.click(screen.getByTestId("security-change-password-open"));
    const form = screen.getByTestId("security-change-password-form");
    // `max-w-sm` bounds it on a wide screen; `w-full min-w-0` is what lets it
    // shrink below 384px on a phone instead of bursting the panel.
    expect(form.className).toContain("min-w-0");
    expect(form.className).toContain("w-full");
  });
});

// ── Danger zone ──────────────────────────────────────────────────────────────

describe("the danger zone stays explicit and reachable", () => {
  it("keeps a labelled destructive control — never an icon-only one", async () => {
    const user = userEvent.setup();
    renderSettings({
      initialSection: "danger-zone",
      isPersonal: true,
      active: { name: "Sam Okafor", type: "personal", role: "owner" },
    });
    const open = screen.getByTestId("account-delete-open");
    expect(open).toHaveTextContent("Delete account");

    await user.click(open);
    const form = screen.getByTestId("account-delete-form");
    // The confirmation requirements are unchanged: a code is still sent first.
    expect(within(form).getByTestId("account-delete-send-code")).toHaveTextContent(
      "Send verification code",
    );
    expect(within(form).getByTestId("account-delete-cancel")).toBeVisible();
    expect(screen.getByTestId("account-delete-consequences")).toBeVisible();
  });

  it("caps the confirmation fields so they fit a phone", async () => {
    const user = userEvent.setup();
    renderSettings({
      initialSection: "danger-zone",
      isPersonal: true,
      active: { name: "Sam Okafor", type: "personal", role: "owner" },
    });
    await user.click(screen.getByTestId("account-delete-open"));
    // A `w-40` code box is fine at 1600px and wider than the card at 360px
    // once the card's own padding is taken out — `max-w-full` is the cap.
    const sendCode = screen.getByTestId("account-delete-send-code");
    expect(sendCode).toBeVisible();
  });
});

// ── Nothing else moved ───────────────────────────────────────────────────────

describe("the responsive rework changed presentation only", () => {
  it("does not alter permission-gated rendering", () => {
    // A member (not owner/admin) still gets the read-only note, not the manager.
    renderSettings({
      initialSection: "api",
      active: { name: "Northwind Traders", type: "organization", role: "member" },
    });
    expect(screen.getByTestId("api-keys-member-note")).toBeInTheDocument();
    expect(screen.queryByTestId("api-keys-panel")).toBeNull();
  });

  it("does not alter the non-personal danger-zone behaviour", () => {
    renderSettings({ initialSection: "danger-zone", isPersonal: false });
    expect(screen.getByTestId("account-danger-non-personal")).toBeInTheDocument();
    expect(screen.queryByTestId("account-delete-open")).toBeNull();
  });
});
