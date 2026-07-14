/**
 * @jest-environment node
 *
 * integrations/_shared/eden/api/_client.ts — the MCP → refreshAndRetry seam. Mocks ONLY the
 * shared MCP client boundary. Proves auth/permission failures map to the engine's reconnect
 * contract and that Eden's `{ ok, ... }` envelope is parsed from structured/text results.
 */
const mockCallTool = jest.fn();
const mockCreateMcpClient = jest.fn((..._a: unknown[]) => ({ callTool: mockCallTool }));
jest.mock("@/integrations/_shared/mcp", () => {
  const actual = jest.requireActual("@/integrations/_shared/mcp");
  return { ...actual, createMcpClient: (...a: unknown[]) => mockCreateMcpClient(...a) };
});

import { edenCallTool, parseEdenEnvelope } from "@/integrations/_shared/eden/api/_client";
import { Unauthorized401Error, InsufficientScopeError } from "@/services/oauth/refreshAndRetry";
import { McpAuthError, McpPermissionError, McpTransportError } from "@/integrations/_shared/mcp";

const TOKEN = "eden_pat_secret_zzz";

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EDEN_MCP_URL;
});

describe("parseEdenEnvelope", () => {
  it("reads a JSON text content block", () => {
    expect(parseEdenEnvelope({ content: [{ type: "text", text: '{"ok":true,"x":1}' }] })).toEqual({ ok: true, x: 1 });
  });
  it("prefers structuredContent when present", () => {
    expect(parseEdenEnvelope({ structuredContent: { ok: true, y: 2 } })).toEqual({ ok: true, y: 2 });
  });
});

describe("edenCallTool", () => {
  it("returns the parsed envelope and passes tool + args + idempotent through", async () => {
    mockCallTool.mockResolvedValue({ content: [{ type: "text", text: '{"ok":true,"workspaces":[]}' }] });
    const env = await edenCallTool({ accessToken: TOKEN, tool: "eden_list_workspaces", args: { a: 1 }, idempotent: true });
    expect(env.ok).toBe(true);
    expect(mockCreateMcpClient).toHaveBeenCalledWith(expect.objectContaining({ accessToken: TOKEN, endpoint: "https://mcp.eden.so/mcp" }));
    expect(mockCallTool).toHaveBeenCalledWith("eden_list_workspaces", { a: 1 }, { idempotent: true });
  });

  it("defaults writes to idempotent:false", async () => {
    mockCallTool.mockResolvedValue({ structuredContent: { ok: true } });
    await edenCallTool({ accessToken: TOKEN, tool: "eden_create_board", args: {} });
    expect(mockCallTool).toHaveBeenCalledWith("eden_create_board", {}, { idempotent: false });
  });

  it("maps McpAuthError → Unauthorized401Error (drives non-refreshable reconnect)", async () => {
    mockCallTool.mockRejectedValue(new McpAuthError("Eden"));
    await expect(edenCallTool({ accessToken: TOKEN, tool: "t", args: {} })).rejects.toBeInstanceOf(Unauthorized401Error);
  });

  it("maps McpPermissionError (read-only token on write) → InsufficientScopeError", async () => {
    mockCallTool.mockRejectedValue(new McpPermissionError("Eden", "eden_create_board"));
    const err = await edenCallTool({ accessToken: TOKEN, tool: "eden_create_board", args: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(InsufficientScopeError);
    expect(err.message).not.toContain(TOKEN);
  });

  it("propagates other transport errors unchanged", async () => {
    mockCallTool.mockRejectedValue(new McpTransportError("Eden", "server 503", 503));
    await expect(edenCallTool({ accessToken: TOKEN, tool: "t", args: {} })).rejects.toBeInstanceOf(McpTransportError);
  });

  it("honors EDEN_MCP_URL override", async () => {
    process.env.EDEN_MCP_URL = "https://mcp.eden.test/mcp";
    mockCallTool.mockResolvedValue({ structuredContent: { ok: true } });
    await edenCallTool({ accessToken: TOKEN, tool: "t", args: {} });
    expect(mockCreateMcpClient).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://mcp.eden.test/mcp" }));
  });
});
