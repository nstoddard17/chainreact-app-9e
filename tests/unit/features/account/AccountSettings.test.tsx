/**
 * Tests for features/account/AccountSettings (Slice 4.ACCOUNT-SETTINGS-1;
 * settings shell + left sub-nav in 4.ACCOUNT-SETTINGS-2).
 *
 * Covers the settings shell (grouped left nav + section switching + deep-link),
 * the Account overview, the honest placeholder sections (no fake working
 * controls), and the preserved personal-account deletion flow (typed phrase +
 * password → request, pending + cancel, owned-Team/Business blocker). The
 * deletion client and next/link are mocked.
 */
import type { ComponentProps, ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "@/features/account/AccountSettings";
import type { AccountSummary } from "@/lib/api/accounts";

const mockRequest = jest.fn();
const mockCancel = jest.fn();
const mockUpdateDisplayName = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  class AccountDeletionError extends Error {
    code: string;
    status: number;
    ownedAccounts?: unknown;
    constructor(message: string, code = "UNKNOWN", status = 500, ownedAccounts?: unknown) {
      super(message);
      this.code = code;
      this.status = status;
      this.ownedAccounts = ownedAccounts;
    }
  }
  class AccountApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "VALIDATION", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    AccountDeletionError,
    AccountApiError,
    requestAccountDeletion: (...a: unknown[]) => mockRequest(...a),
    cancelAccountDeletion: (...a: unknown[]) => mockCancel(...a),
    updateDisplayName: (...a: unknown[]) => mockUpdateDisplayName(...a),
    changePassword: jest.fn().mockResolvedValue(undefined),
    getNotificationPreferences: jest.fn().mockResolvedValue({
      productUpdates: false,
      workflowAlerts: true,
      teamActivity: true,
    }),
    updateNotificationPreferences: jest.fn().mockResolvedValue({
      productUpdates: false,
      workflowAlerts: true,
      teamActivity: true,
    }),
  };
});

import { AccountDeletionError } from "@/lib/api/accounts";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const personalActive: AccountSummary = {
  id: "p1",
  name: "Personal",
  type: "personal",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};
const teamActive: AccountSummary = {
  id: "t1",
  name: "Acme",
  type: "team",
  role: "admin",
  isActive: true,
  deletionStatus: "active",
};
const orgActive: AccountSummary = {
  id: "o1",
  name: "Acme Biz",
  type: "organization",
  role: "owner",
  isActive: true,
  deletionStatus: "active",
};

function view(a: AccountSummary) {
  return { name: a.name, type: a.type, role: a.role };
}

type Overrides = Partial<ComponentProps<typeof AccountSettings>>;
function renderSettings(overrides: Overrides = {}) {
  return render(
    <AccountSettings
      active={view(personalActive)}
      isPersonal
      deletionStatus="active"
      purgeAfter={null}
      userEmail="me@x.io"
      displayName={null}
      emailVerified
      signInMethod="Email & password"
      billing={{
        usage: { tasksUsed: 0, tasksLimit: 100, periodStartedAt: null },
        memberLimit: null,
        memberCount: null,
        folderLimit: 10,
        frozen: false,
      }}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  mockRequest.mockReset();
  mockCancel.mockReset();
});

describe("AccountSettings — settings shell + nav", () => {
  it("renders the grouped left nav with every section item", () => {
    renderSettings();
    const nav = screen.getByTestId("account-settings-nav");
    expect(within(nav).getByText("Personal")).toBeInTheDocument();
    expect(within(nav).getByText("Workspace")).toBeInTheDocument();
    expect(within(nav).getByText("Account control")).toBeInTheDocument();
    for (const id of ["profile", "account", "notifications", "security", "billing", "api", "danger-zone"]) {
      expect(screen.getByTestId(`account-nav-${id}`)).toBeInTheDocument();
    }
  });

  it("defaults to the Account section (overview)", () => {
    renderSettings();
    expect(screen.getByTestId("account-section-account")).toBeInTheDocument();
    expect(screen.getByTestId("account-nav-account")).toHaveAttribute("aria-current", "page");
  });

  it("switches sections when a nav item is clicked", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByTestId("account-nav-security"));
    expect(screen.getByTestId("account-section-security")).toBeInTheDocument();
    expect(screen.queryByTestId("account-section-account")).toBeNull();
  });

  it("deep-links to a section via initialSection", () => {
    renderSettings({ initialSection: "danger-zone" });
    expect(screen.getByTestId("account-deletion-card")).toBeInTheDocument();
  });
});

describe("AccountSettings — Account overview", () => {
  it("renders the active account overview (name + type + role)", () => {
    renderSettings();
    const section = screen.getByTestId("account-section-account");
    expect(within(section).getByTestId("account-type-label")).toHaveTextContent("Personal");
  });

  it("labels an internal organization account as Business (never Organization)", () => {
    renderSettings({ active: view(orgActive), isPersonal: false });
    const section = screen.getByTestId("account-section-account");
    expect(within(section).getByTestId("account-type-label")).toHaveTextContent("Business");
    expect(section).not.toHaveTextContent(/Organization/);
  });

  it("shows the Team-page pointer for a Team active account", () => {
    renderSettings({ active: view(teamActive), isPersonal: false });
    expect(screen.getByTestId("account-team-pointer")).toHaveTextContent(
      /manage members, ownership transfer, and leave team from the Team page/i,
    );
    expect(screen.getByTestId("account-team-link")).toHaveAttribute("href", "/team");
  });
});

describe("AccountSettings — placeholder sections expose no fake controls", () => {
  it.each([
    ["billing", "account-section-billing"],
    ["api", "account-section-api"],
  ])("%s shows coming-soon and no working inputs/buttons", async (navId, sectionId) => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByTestId(`account-nav-${navId}`));
    const section = screen.getByTestId(sectionId);
    expect(within(section).getAllByTestId("account-coming-soon").length).toBeGreaterThan(0);
    // No interactive controls inside placeholder section bodies.
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(section).queryAllByRole("switch")).toHaveLength(0);
    expect(within(section).queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("profile + security surface the signed-in email read-only", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByTestId("account-nav-profile"));
    expect(screen.getByTestId("account-section-profile")).toHaveTextContent("me@x.io");
    await user.click(screen.getByTestId("account-nav-security"));
    expect(screen.getByTestId("account-section-security")).toHaveTextContent("me@x.io");
  });

  it("billing shows the Business tier (never Organization) for an organization account", async () => {
    const user = userEvent.setup();
    renderSettings({ active: view(orgActive), isPersonal: false });
    await user.click(screen.getByTestId("account-nav-billing"));
    const section = screen.getByTestId("account-section-billing");
    expect(screen.getByTestId("billing-tier")).toHaveTextContent("Business");
    expect(section).not.toHaveTextContent(/Organization/);
  });
});

describe("AccountSettings — Security & access (read-only)", () => {
  async function openSecurity(overrides: Overrides = {}) {
    const user = userEvent.setup();
    renderSettings(overrides);
    await user.click(screen.getByTestId("account-nav-security"));
    return screen.getByTestId("account-section-security");
  }

  it("renders email, sign-in method, and password status", async () => {
    const section = await openSecurity();
    expect(section).toHaveTextContent("me@x.io");
    expect(screen.getByTestId("security-signin-method")).toHaveTextContent("Email & password");
    expect(screen.getByTestId("security-password-status")).toHaveTextContent("Set");
  });

  it("shows Verified when the email is verified", async () => {
    await openSecurity({ emailVerified: true });
    expect(screen.getByTestId("security-email-status")).toHaveTextContent(/verified/i);
    expect(screen.getByTestId("security-email-status")).not.toHaveTextContent(/unverified/i);
  });

  it("shows Unverified when the email is not verified", async () => {
    await openSecurity({ emailVerified: false });
    expect(screen.getByTestId("security-email-status")).toHaveTextContent(/unverified/i);
  });

  it("renders identically for a Team/Business active account (per-user, not per-account)", async () => {
    const section = await openSecurity({ active: view(teamActive), isPersonal: false });
    expect(section).toHaveTextContent("me@x.io");
    expect(screen.getByTestId("security-signin-method")).toHaveTextContent("Email & password");
    expect(screen.getByTestId("security-password-status")).toHaveTextContent("Set");
  });

  it("exposes no fake toggles; the only real control is Change password", async () => {
    const section = await openSecurity();
    // No switches, and the password inputs aren't mounted until the form opens.
    expect(within(section).queryAllByRole("switch")).toHaveLength(0);
    expect(within(section).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(section).getByTestId("security-change-password-open")).toBeInTheDocument();
    expect(within(section).getAllByTestId("account-coming-soon").length).toBeGreaterThan(0);
  });

  it("deep-links to Security via initialSection", () => {
    renderSettings({ initialSection: "security" });
    expect(screen.getByTestId("account-section-security")).toBeInTheDocument();
  });
});

describe("AccountSettings — Danger zone (deletion preserved)", () => {
  function renderDanger(overrides: Overrides = {}) {
    return renderSettings({ initialSection: "danger-zone", ...overrides });
  }

  it("requires the typed phrase and a password before the confirm enables", async () => {
    const user = userEvent.setup();
    renderDanger();
    await user.click(screen.getByTestId("account-delete-open"));
    const confirm = screen.getByTestId("account-delete-confirm");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId("account-delete-password"), "hunter2");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    expect(confirm).toBeEnabled();
  });

  it("submits the request and renders the pending/scheduled state with a cancel", async () => {
    mockRequest.mockResolvedValue({
      deletionStatus: "pending_deletion",
      requestedAt: "2026-06-05T00:00:00Z",
      purgeAfter: "2026-07-05T00:00:00Z",
    });
    const user = userEvent.setup();
    renderDanger();
    await user.click(screen.getByTestId("account-delete-open"));
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    await user.type(screen.getByTestId("account-delete-password"), "pw");
    await user.click(screen.getByTestId("account-delete-confirm"));

    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith({ password: "pw", confirmText: "delete my account" }),
    );
    const pending = await screen.findByTestId("account-deletion-pending");
    expect(pending).toHaveTextContent(/pending deletion/i);
    expect(pending).toHaveTextContent(/July 5, 2026/);
    expect(screen.getByTestId("account-deletion-cancel")).toBeInTheDocument();
  });

  it("renders an already-pending account as frozen with a cancel (no destructive form)", () => {
    renderDanger({ deletionStatus: "pending_deletion", purgeAfter: "2026-07-05T00:00:00Z" });
    expect(screen.getByTestId("account-deletion-pending")).toBeInTheDocument();
    expect(screen.getByTestId("account-deletion-cancel")).toBeInTheDocument();
    expect(screen.queryByTestId("account-delete-open")).toBeNull();
  });

  it("cancel deletion calls the cancel API and restores the active state", async () => {
    mockCancel.mockResolvedValue({ deletionStatus: "active", requestedAt: null, purgeAfter: null });
    const user = userEvent.setup();
    renderDanger({ deletionStatus: "pending_deletion", purgeAfter: "2026-07-05T00:00:00Z" });
    await user.click(screen.getByTestId("account-deletion-cancel"));
    await waitFor(() => expect(mockCancel).toHaveBeenCalled());
    expect(await screen.findByTestId("account-delete-open")).toBeInTheDocument();
    expect(screen.queryByTestId("account-deletion-pending")).toBeNull();
  });

  it("renders the request re-auth error inline and keeps the form open", async () => {
    mockRequest.mockRejectedValue(
      new AccountDeletionError("Password confirmation failed.", "REAUTH_FAILED", 401),
    );
    const user = userEvent.setup();
    renderDanger();
    await user.click(screen.getByTestId("account-delete-open"));
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    await user.type(screen.getByTestId("account-delete-password"), "wrong");
    await user.click(screen.getByTestId("account-delete-confirm"));

    expect(await screen.findByTestId("account-deletion-error")).toHaveTextContent(
      /password confirmation failed/i,
    );
    expect(screen.getByTestId("account-delete-form")).toBeInTheDocument();
  });

  it("renders the owned Team/Business blocker with Business label + Team link", async () => {
    mockRequest.mockRejectedValue(
      new AccountDeletionError(
        "Transfer ownership or delete the Team/Business accounts you own…",
        "ACCOUNT_HAS_OWNED_TEAMS",
        409,
        [
          { id: "t1", name: "Acme Team", type: "team", typeLabel: "Team" },
          { id: "o1", name: "Acme Biz", type: "organization", typeLabel: "Business" },
        ],
      ),
    );
    const user = userEvent.setup();
    renderDanger();
    await user.click(screen.getByTestId("account-delete-open"));
    await user.type(screen.getByTestId("account-delete-confirm-input"), "delete my account");
    await user.type(screen.getByTestId("account-delete-password"), "pw");
    await user.click(screen.getByTestId("account-delete-confirm"));

    const blocked = await screen.findByTestId("account-deletion-blocked");
    expect(blocked).toHaveTextContent(/transfer ownership or delete these accounts/i);
    expect(screen.getByTestId("account-owned-o1")).toHaveTextContent("Business");
    expect(blocked).not.toHaveTextContent(/Organization/);
    expect(screen.getByTestId("account-blocked-team-link")).toHaveAttribute("href", "/team");
  });

  it("shows a non-destructive note (no delete form) for a Team active account", () => {
    renderDanger({ active: view(teamActive), isPersonal: false });
    expect(screen.getByTestId("account-danger-non-personal")).toBeInTheDocument();
    expect(screen.queryByTestId("account-delete-open")).toBeNull();
    expect(screen.queryByTestId("account-deletion-card")).toBeNull();
  });
});
