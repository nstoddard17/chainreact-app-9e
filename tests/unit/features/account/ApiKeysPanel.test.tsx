/**
 * Tests for features/account/ApiKeysPanel (Slice 4.API-KEYS-FOUNDATION-4 / FK-3).
 *
 * The owner/admin key manager: list metadata, create with a ONE-TIME raw-secret
 * reveal, copy, dismiss (raw key gone), revoke with confirmation, and the frozen
 * read-only state. The FK-2 client (`@/lib/api/accounts`) is mocked — these tests
 * own the UI behavior + the no-leak guarantees (raw key only after create, never
 * `key_hash`, never persisted).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiKeysPanel } from "@/features/account/ApiKeysPanel";
import type { ApiKeyMetadataView } from "@/lib/api/accounts";

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

import { AccountApiError } from "@/lib/api/accounts";

function key(over: Partial<ApiKeyMetadataView> = {}): ApiKeyMetadataView {
  return {
    id: "k1",
    name: "CI deploy",
    prefix: "crk_live_ab12…wxyz",
    scopes: ["workflows:trigger"],
    status: "active",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([]);
  mockCreate.mockReset();
  mockRevoke.mockReset().mockResolvedValue(undefined);
});

describe("ApiKeysPanel — list states", () => {
  it("shows the empty state when there are no keys", async () => {
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    expect(await screen.findByTestId("api-keys-empty")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith("a1");
  });

  it("renders key metadata (name, prefix, status) and never key_hash", async () => {
    mockList.mockResolvedValue([key(), key({ id: "k2", name: "old", status: "revoked" })]);
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    const row = await screen.findByTestId("api-key-row-k1");
    expect(row).toHaveTextContent("CI deploy");
    expect(row).toHaveTextContent("crk_live_ab12…wxyz");
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(screen.getByTestId("api-key-row-k2")).getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByTestId("api-keys-panel")).not.toHaveTextContent(/key_hash/i);
  });

  it("renders a load error with a working retry", async () => {
    mockList.mockRejectedValueOnce(new AccountApiError("boom", "SERVER_ERROR", 500));
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    expect(await screen.findByTestId("api-keys-load-error")).toHaveTextContent("boom");
    mockList.mockResolvedValueOnce([key()]);
    await userEvent.click(screen.getByTestId("api-keys-retry"));
    expect(await screen.findByTestId("api-key-row-k1")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});

describe("ApiKeysPanel — create + one-time reveal", () => {
  it("creates a key with name + workflows:trigger scope and reveals the raw key once", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: key(), key: "crk_live_THE_RAW_SECRET_VALUE" });
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-keys-empty");

    await user.click(screen.getByTestId("api-key-create-open"));
    await user.type(screen.getByTestId("api-key-name-input"), "CI deploy");
    await user.click(screen.getByTestId("api-key-create-submit"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith("a1", {
        name: "CI deploy",
        scopes: ["workflows:trigger"],
        expiresAt: null,
      }),
    );
    const reveal = await screen.findByTestId("api-key-reveal");
    expect(within(reveal).getByTestId("api-key-reveal-value")).toHaveValue(
      "crk_live_THE_RAW_SECRET_VALUE",
    );
    expect(within(reveal).getByTestId("api-key-reveal-warning")).toHaveTextContent(
      /won.t be able to see it again/i,
    );
    // The list is refreshed after create.
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty name without calling the API", async () => {
    const user = userEvent.setup();
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-keys-empty");
    await user.click(screen.getByTestId("api-key-create-open"));
    await user.click(screen.getByTestId("api-key-create-submit"));
    expect(screen.getByTestId("api-key-create-error")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("copies the raw key to the clipboard", async () => {
    // userEvent.setup() installs a working clipboard stub we can read back.
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: key(), key: "crk_live_SECRET" });
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-keys-empty");
    await user.click(screen.getByTestId("api-key-create-open"));
    await user.type(screen.getByTestId("api-key-name-input"), "CI");
    await user.click(screen.getByTestId("api-key-create-submit"));
    await screen.findByTestId("api-key-reveal");

    await user.click(screen.getByTestId("api-key-reveal-copy"));
    expect(await navigator.clipboard.readText()).toBe("crk_live_SECRET");
    await waitFor(() =>
      expect(screen.getByTestId("api-key-reveal-copy")).toHaveTextContent(/copied/i),
    );
  });

  it("discards the raw key from the UI when the reveal is dismissed", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: key(), key: "crk_live_SECRET" });
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-keys-empty");
    await user.click(screen.getByTestId("api-key-create-open"));
    await user.type(screen.getByTestId("api-key-name-input"), "CI");
    await user.click(screen.getByTestId("api-key-create-submit"));
    await screen.findByTestId("api-key-reveal");

    await user.click(screen.getByTestId("api-key-reveal-dismiss"));
    expect(screen.queryByTestId("api-key-reveal")).toBeNull();
    expect(screen.getByTestId("api-keys-panel")).not.toHaveTextContent("crk_live_SECRET");
  });

  it("surfaces a create failure inline and reveals nothing", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(new AccountApiError("nope", "FORBIDDEN", 403));
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-keys-empty");
    await user.click(screen.getByTestId("api-key-create-open"));
    await user.type(screen.getByTestId("api-key-name-input"), "CI");
    await user.click(screen.getByTestId("api-key-create-submit"));
    expect(await screen.findByTestId("api-key-create-error")).toHaveTextContent("nope");
    expect(screen.queryByTestId("api-key-reveal")).toBeNull();
  });
});

describe("ApiKeysPanel — revoke", () => {
  it("requires confirmation, then calls DELETE and refreshes the list", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce([key()]); // initial
    mockList.mockResolvedValueOnce([key({ status: "revoked" })]); // after revoke
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-key-row-k1");

    await user.click(screen.getByTestId("api-key-revoke-k1"));
    // Inline confirmation appears; nothing called yet.
    expect(screen.getByTestId("api-key-revoke-confirm-k1")).toBeInTheDocument();
    expect(mockRevoke).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("api-key-revoke-confirm-k1"));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith("a1", "k1"));
    // List refreshed → row now shows revoked + no revoke control.
    await waitFor(() =>
      expect(within(screen.getByTestId("api-key-row-k1")).getByText("Revoked")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("api-key-revoke-k1")).toBeNull();
  });

  it("cancel keeps the key and calls nothing", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([key()]);
    render(<ApiKeysPanel accountId="a1" frozen={false} />);
    await screen.findByTestId("api-key-row-k1");
    await user.click(screen.getByTestId("api-key-revoke-k1"));
    await user.click(screen.getByTestId("api-key-revoke-cancel-k1"));
    expect(screen.queryByTestId("api-key-revoke-confirm-k1")).toBeNull();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

describe("ApiKeysPanel — frozen (read-only)", () => {
  it("shows the frozen note, hides create + revoke, keeps the list", async () => {
    mockList.mockResolvedValue([key()]);
    render(<ApiKeysPanel accountId="a1" frozen />);
    await screen.findByTestId("api-key-row-k1");
    expect(screen.getByTestId("api-keys-frozen")).toBeInTheDocument();
    expect(screen.queryByTestId("api-key-create-open")).toBeNull();
    expect(screen.queryByTestId("api-key-revoke-k1")).toBeNull();
  });
});
