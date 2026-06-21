/**
 * Tests for features/account/DeveloperSection (Slice 4.PUBLIC-MCP-SETTINGS-UI).
 *
 * The Settings → Developer section gate: owner/admin on a resolved account see the
 * MCP-token manager; members see a restricted explainer and CANNOT create tokens;
 * the section makes account scope clear and shows the MCP server URL + explanation.
 * The child `McpTokensPanel` (which fetches) is mocked to a sentinel so these tests
 * own the GATE + scope copy only.
 */
import { render, screen } from "@testing-library/react";
import { DeveloperSection } from "@/features/account/DeveloperSection";
import type { ActiveAccountView } from "@/features/account/settingsRows";

jest.mock("@/features/account/McpTokensPanel", () => ({
  McpTokensPanel: (props: { accountId: string; accountName: string; frozen: boolean }) => (
    <div
      data-testid="mock-mcp-tokens-panel"
      data-account-id={props.accountId}
      data-account-name={props.accountName}
      data-frozen={String(props.frozen)}
    />
  ),
}));

function active(role: ActiveAccountView["role"]): ActiveAccountView {
  return { name: "Northwind Labs", type: "team", role };
}

describe("DeveloperSection — owner/admin can manage tokens", () => {
  it.each(["owner", "admin"] as const)(
    "renders the token manager for a team/org %s",
    (role) => {
      render(<DeveloperSection active={active(role)} accountId="acc-1" frozen={false} />);
      const panel = screen.getByTestId("mock-mcp-tokens-panel");
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute("data-account-id", "acc-1");
      expect(panel).toHaveAttribute("data-account-name", "Northwind Labs");
      // Members-only restriction note is absent for owners/admins.
      expect(screen.queryByTestId("mcp-tokens-member-note")).toBeNull();
    },
  );

  it("makes account scope explicit and shows the account name + type", () => {
    render(<DeveloperSection active={active("owner")} accountId="acc-1" frozen={false} />);
    expect(screen.getByTestId("mcp-account-name")).toHaveTextContent("Northwind Labs");
    expect(screen.getByTestId("mcp-account-type")).toBeInTheDocument();
    const section = screen.getByTestId("account-section-developer");
    expect(section).toHaveTextContent(/does not follow your active-account changes/i);
  });

  it("shows the MCP server URL and the connect explanation", () => {
    render(<DeveloperSection active={active("owner")} accountId="acc-1" frozen={false} />);
    expect(screen.getByTestId("mcp-server-url")).toHaveTextContent(
      "https://mcp.chainreact.app/mcp",
    );
    expect(screen.getByTestId("account-section-developer")).toHaveTextContent(
      "Use this URL to connect ChainReact to an MCP-compatible LLM client.",
    );
  });

  it("forwards the frozen (read-only) state to the panel", () => {
    render(<DeveloperSection active={active("owner")} accountId="acc-1" frozen />);
    expect(screen.getByTestId("mock-mcp-tokens-panel")).toHaveAttribute("data-frozen", "true");
  });
});

describe("DeveloperSection — members cannot create tokens", () => {
  it("shows the restricted explainer and NO token manager for a member", () => {
    render(<DeveloperSection active={active("member")} accountId="acc-1" frozen={false} />);
    expect(screen.queryByTestId("mock-mcp-tokens-panel")).toBeNull();
    expect(screen.getByTestId("mcp-tokens-member-note")).toHaveTextContent(
      /owners and admins manage/i,
    );
  });

  it("shows the no-active-account note when there is no account id", () => {
    render(<DeveloperSection active={null} accountId={null} frozen={false} />);
    expect(screen.queryByTestId("mock-mcp-tokens-panel")).toBeNull();
    expect(screen.getByTestId("mcp-tokens-member-note")).toHaveTextContent(
      /no active account/i,
    );
  });
});
