/**
 * Tests for the API & webhooks section (Slice 4.API-KEYS-FOUNDATION-4 / FK-3).
 *
 * The API keys panel is now REAL for owner/admin (rendered via ApiKeysPanel over
 * the FK-2 routes); members and the no-active-account case get a read-only note.
 * The Webhooks panel stays an honest "coming soon" — no fake endpoints/logs. The
 * raw key / `key_hash` are never rendered in the section. See
 * docs/slices/phase-4/api-keys-foundation-plan.md.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { ApiSection } from "@/features/account/AccountSections";
import type { AccountSummary } from "@/lib/api/accounts";

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockRevoke = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  class AccountApiError extends Error {
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
    LAUNCH_API_KEY_SCOPE: "workflows:trigger",
    listApiKeys: (...a: unknown[]) => mockList(...a),
    createApiKey: (...a: unknown[]) => mockCreate(...a),
    revokeApiKey: (...a: unknown[]) => mockRevoke(...a),
  };
});

function active(
  type: AccountSummary["type"],
  role: AccountSummary["role"],
  name = "Acct",
) {
  return { name, type, role };
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockCreate.mockReset();
  mockRevoke.mockReset();
});

describe("ApiSection — role gating", () => {
  it("renders the real key manager for an owner with an account", async () => {
    render(<ApiSection active={active("team", "owner", "Acme")} accountId="a1" frozen={false} />);
    expect(await screen.findByTestId("api-keys-panel")).toBeInTheDocument();
    expect(await screen.findByTestId("api-key-create-open")).toBeInTheDocument();
    await waitFor(() => expect(mockList).toHaveBeenCalledWith("a1"));
  });

  it("renders the manager for an admin", async () => {
    render(<ApiSection active={active("team", "admin", "Acme")} accountId="a1" frozen={false} />);
    expect(await screen.findByTestId("api-keys-panel")).toBeInTheDocument();
  });

  it("shows a read-only note for a member — no panel, no create control", () => {
    render(<ApiSection active={active("team", "member", "Acme")} accountId="a1" frozen={false} />);
    expect(screen.getByTestId("api-keys-member-note")).toHaveTextContent(/owners and admins/i);
    expect(screen.queryByTestId("api-keys-panel")).toBeNull();
    expect(screen.queryByTestId("api-key-create-open")).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("shows the no-active-account note when no account id is resolved", () => {
    render(<ApiSection active={active("team", "owner")} accountId={null} frozen={false} />);
    expect(screen.getByTestId("api-keys-member-note")).toHaveTextContent(/no active account/i);
    expect(screen.queryByTestId("api-keys-panel")).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("ApiSection — frozen account (owner)", () => {
  it("renders the list read-only — frozen note, no create control", async () => {
    render(<ApiSection active={active("team", "owner", "Acme")} accountId="a1" frozen />);
    expect(await screen.findByTestId("api-keys-frozen")).toBeInTheDocument();
    expect(screen.queryByTestId("api-key-create-open")).toBeNull();
  });
});

describe("ApiSection — account scoping + labels", () => {
  it("renders the active account name + Team label", async () => {
    render(<ApiSection active={active("team", "owner", "Acme")} accountId="a1" frozen={false} />);
    expect(screen.getByTestId("api-account-name")).toHaveTextContent("Acme");
    expect(screen.getByTestId("api-account-type")).toHaveTextContent("Team");
    // Let the panel's initial load settle (avoids an act() warning).
    await screen.findByTestId("api-keys-panel");
  });

  it("labels an organization account as Business (never Organization)", () => {
    render(
      <ApiSection active={active("organization", "member", "Acme Biz")} accountId="a1" frozen={false} />,
    );
    const section = screen.getByTestId("account-section-api");
    expect(screen.getByTestId("api-account-type")).toHaveTextContent("Business");
    expect(section).not.toHaveTextContent(/Organization/);
  });
});

describe("ApiSection — webhooks + no-leak", () => {
  it("keeps the Webhooks panel coming-soon and separate from provider webhooks", () => {
    render(<ApiSection active={active("team", "member", "Acme")} accountId="a1" frozen={false} />);
    expect(screen.getByText("Webhooks")).toBeInTheDocument();
    const copy = screen.getByTestId("api-webhooks-copy");
    expect(copy).toHaveTextContent(/your own URLs/i);
    expect(copy).toHaveTextContent(/provider webhooks/i);
    expect(within(screen.getByTestId("account-section-api")).getByTestId("account-coming-soon"))
      .toBeInTheDocument();
  });

  it("renders no raw key material or key_hash for an owner with keys", async () => {
    mockList.mockResolvedValue([
      {
        id: "k1",
        name: "CI",
        prefix: "crk_live_ab12…wxyz",
        scopes: ["workflows:trigger"],
        status: "active",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-06-01T00:00:00Z",
      },
    ]);
    render(<ApiSection active={active("team", "owner", "Acme")} accountId="a1" frozen={false} />);
    await screen.findByTestId("api-key-row-k1");
    const section = screen.getByTestId("account-section-api");
    // The display prefix is fine; a full raw secret or key_hash must never appear.
    expect(section).not.toHaveTextContent(/key_hash/i);
    expect(section).not.toHaveTextContent(/crk_live_[A-Za-z0-9_-]{20,}/);
  });
});
