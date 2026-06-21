/**
 * Tests for features/account/McpTokensPanel (Slice 4.PUBLIC-MCP-SETTINGS-UI).
 *
 * The owner/admin MCP-token manager: list safe metadata, create with a ONE-TIME
 * raw-token reveal + ready-to-paste client config, copy, dismiss (raw token gone),
 * revoke with confirmation, account-scope clarity, and the frozen read-only state.
 * The client (`@/lib/api/mcp`) is mocked — these tests own the UI behavior + the
 * no-leak guarantees (raw token only after create, never `token_hash`).
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McpTokensPanel } from "@/features/account/McpTokensPanel";
import type { McpTokenView } from "@/lib/api/mcp";

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockRevoke = jest.fn();
jest.mock("@/lib/api/mcp", () => {
  class McpApiError extends Error {
    code: string;
    status: number;
    constructor(message: string, code = "UNKNOWN", status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    McpApiError,
    MCP_ENDPOINT_URL: "https://mcp.chainreact.app/mcp",
    MCP_READ_SCOPES: ["accounts:read", "workflows:read", "runs:read", "integrations:read"],
    listMcpTokens: (...a: unknown[]) => mockList(...a),
    createMcpToken: (...a: unknown[]) => mockCreate(...a),
    revokeMcpToken: (...a: unknown[]) => mockRevoke(...a),
  };
});

import { McpApiError } from "@/lib/api/mcp";

function token(over: Partial<McpTokenView> = {}): McpTokenView {
  return {
    id: "t1",
    name: "Claude Desktop",
    prefix: "crmcp_ab12",
    scopes: ["workflows:read", "runs:read"],
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

describe("McpTokensPanel — list + safe fields", () => {
  it("shows the empty state when there are no tokens", async () => {
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    expect(await screen.findByTestId("mcp-tokens-empty")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith("a1");
  });

  it("renders only safe metadata (name, prefix, account, scopes, dates) and never token_hash", async () => {
    mockList.mockResolvedValue([
      token({ lastUsedAt: "2026-06-10T00:00:00Z" }),
      token({ id: "t2", name: "old", status: "revoked" }),
    ]);
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    const row = await screen.findByTestId("mcp-token-row-t1");
    expect(row).toHaveTextContent("Claude Desktop");
    expect(row).toHaveTextContent("crmcp_ab12");
    expect(within(row).getByText("Active")).toBeInTheDocument();
    // Account scope is shown per token (req #5 / #8).
    expect(within(row).getByTestId("mcp-token-account-t1")).toHaveTextContent("Northwind Labs");
    expect(row).toHaveTextContent("workflows:read");
    expect(within(screen.getByTestId("mcp-token-row-t2")).getByText("Revoked")).toBeInTheDocument();
    // No secret field is ever rendered.
    const panel = screen.getByTestId("mcp-tokens-panel");
    expect(panel).not.toHaveTextContent(/token_hash/i);
    expect(panel).not.toHaveTextContent(/tokenHash/);
  });

  it("renders a load error with a working retry", async () => {
    mockList.mockRejectedValueOnce(new McpApiError("boom", "SERVER_ERROR", 500));
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    expect(await screen.findByTestId("mcp-tokens-load-error")).toHaveTextContent("boom");
    mockList.mockResolvedValueOnce([token()]);
    await userEvent.click(screen.getByTestId("mcp-tokens-retry"));
    expect(await screen.findByTestId("mcp-token-row-t1")).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});

describe("McpTokensPanel — create, one-time reveal + client config", () => {
  it("creates a token and reveals the raw token exactly once with the warning", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: token(), token: "crmcp_THE_RAW_SECRET_VALUE" });
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");

    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.type(screen.getByTestId("mcp-token-name-input"), "Claude Desktop");
    await user.click(screen.getByTestId("mcp-token-create-submit"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith("a1", { name: "Claude Desktop" }),
    );
    const reveal = await screen.findByTestId("mcp-token-reveal");
    expect(within(reveal).getByTestId("mcp-token-reveal-value")).toHaveValue(
      "crmcp_THE_RAW_SECRET_VALUE",
    );
    expect(within(reveal).getByTestId("mcp-token-reveal-warning")).toHaveTextContent(
      "Copy this token now. You will not be able to see it again.",
    );
    // The list is refreshed after create.
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("shows a copyable client config that uses the MCP server URL and inlines the token", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: token(), token: "crmcp_RAW" });
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");
    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.type(screen.getByTestId("mcp-token-name-input"), "Cursor");
    await user.click(screen.getByTestId("mcp-token-create-submit"));

    const config = await screen.findByTestId("mcp-token-config");
    expect(config).toHaveTextContent("https://mcp.chainreact.app/mcp");
    expect(config).toHaveTextContent('"mcpServers"');
    expect(config).toHaveTextContent("Bearer crmcp_RAW");

    await user.click(screen.getByTestId("mcp-token-config-copy"));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("https://mcp.chainreact.app/mcp");
    expect(copied).toContain("Bearer crmcp_RAW");
  });

  it("makes account scope clear in the reveal", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: token(), token: "crmcp_RAW" });
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");
    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.type(screen.getByTestId("mcp-token-name-input"), "Cursor");
    await user.click(screen.getByTestId("mcp-token-create-submit"));

    const reveal = await screen.findByTestId("mcp-token-reveal");
    expect(reveal).toHaveTextContent("Northwind Labs");
    expect(reveal).toHaveTextContent(/does not follow your active-account changes/i);
  });

  it("rejects an empty name without calling the API", async () => {
    const user = userEvent.setup();
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");
    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.click(screen.getByTestId("mcp-token-create-submit"));
    expect(screen.getByTestId("mcp-token-create-error")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("copies the raw token to the clipboard", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: token(), token: "crmcp_SECRET" });
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");
    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.type(screen.getByTestId("mcp-token-name-input"), "Claude");
    await user.click(screen.getByTestId("mcp-token-create-submit"));
    await screen.findByTestId("mcp-token-reveal");

    await user.click(screen.getByTestId("mcp-token-reveal-copy"));
    expect(await navigator.clipboard.readText()).toBe("crmcp_SECRET");
    await waitFor(() =>
      expect(screen.getByTestId("mcp-token-reveal-copy")).toHaveTextContent(/copied/i),
    );
  });

  it("discards the raw token + config from the UI when the reveal is dismissed", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({ metadata: token(), token: "crmcp_SECRET" });
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");
    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.type(screen.getByTestId("mcp-token-name-input"), "Claude");
    await user.click(screen.getByTestId("mcp-token-create-submit"));
    await screen.findByTestId("mcp-token-reveal");

    await user.click(screen.getByTestId("mcp-token-reveal-dismiss"));
    expect(screen.queryByTestId("mcp-token-reveal")).toBeNull();
    expect(screen.queryByTestId("mcp-token-config")).toBeNull();
    expect(screen.getByTestId("mcp-tokens-panel")).not.toHaveTextContent("crmcp_SECRET");
  });

  it("surfaces a create failure inline and reveals nothing", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(new McpApiError("nope", "FORBIDDEN", 403));
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-tokens-empty");
    await user.click(screen.getByTestId("mcp-token-create-open"));
    await user.type(screen.getByTestId("mcp-token-name-input"), "Claude");
    await user.click(screen.getByTestId("mcp-token-create-submit"));
    expect(await screen.findByTestId("mcp-token-create-error")).toHaveTextContent("nope");
    expect(screen.queryByTestId("mcp-token-reveal")).toBeNull();
  });
});

describe("McpTokensPanel — revoke", () => {
  it("requires confirmation, then calls the revoke API and refreshes the list", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValueOnce([token()]); // initial
    mockList.mockResolvedValueOnce([token({ status: "revoked" })]); // after revoke
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-token-row-t1");

    await user.click(screen.getByTestId("mcp-token-revoke-t1"));
    expect(screen.getByTestId("mcp-token-revoke-confirm-row-t1")).toBeInTheDocument();
    expect(mockRevoke).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("mcp-token-revoke-confirm-t1"));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith("a1", "t1"));
    await waitFor(() =>
      expect(within(screen.getByTestId("mcp-token-row-t1")).getByText("Revoked")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("mcp-token-revoke-t1")).toBeNull();
  });

  it("cancel keeps the token and calls nothing", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([token()]);
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen={false} />);
    await screen.findByTestId("mcp-token-row-t1");
    await user.click(screen.getByTestId("mcp-token-revoke-t1"));
    await user.click(screen.getByTestId("mcp-token-revoke-cancel-t1"));
    expect(screen.queryByTestId("mcp-token-revoke-confirm-row-t1")).toBeNull();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

describe("McpTokensPanel — frozen (read-only)", () => {
  it("shows the frozen note, hides create + revoke, keeps the list", async () => {
    mockList.mockResolvedValue([token()]);
    render(<McpTokensPanel accountId="a1" accountName="Northwind Labs" frozen />);
    await screen.findByTestId("mcp-token-row-t1");
    expect(screen.getByTestId("mcp-tokens-frozen")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-token-create-open")).toBeNull();
    expect(screen.queryByTestId("mcp-token-revoke-t1")).toBeNull();
  });
});
