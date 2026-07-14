/**
 * @jest-environment node
 *
 * integrations/eden/auth.ts — the Eden `token_paste` auth implementation (EDEN-3).
 * Mocks ONLY the external boundary: the shared MCP client (`createMcpClient`). Proves
 * the pasted `eden_pat_` is verified via a real MCP handshake + read-tool call, that
 * auth failures map to a typed verification error, that transient failures stay generic
 * (→ 502 at the route), and that the token NEVER leaks into errors, metadata, or the
 * returned account info.
 */
import { randomBytes } from "node:crypto";

// Mock the MCP client factory but keep the REAL typed error classes (instanceof checks).
const mockInitialize = jest.fn();
const mockCallTool = jest.fn();
const mockCreateMcpClient = jest.fn();
jest.mock("@/integrations/_shared/mcp", () => {
  const actual = jest.requireActual("@/integrations/_shared/mcp");
  return { ...actual, createMcpClient: (...a: unknown[]) => mockCreateMcpClient(...a) };
});

import { edenAuth } from "@/integrations/eden/auth";
import { TokenIngestVerificationError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { McpAuthError, McpPermissionError, McpTransportError } from "@/integrations/_shared/mcp";

const TOKEN = "eden_pat_secret_value_do_not_leak_abcdef123456";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.EDEN_MCP_URL;
  mockInitialize.mockResolvedValue({ protocolVersion: "2025-06-18", serverInfo: { name: "Eden", version: "1" } });
  mockCallTool.mockResolvedValue({ structuredContent: { ok: true } });
  mockCreateMcpClient.mockReturnValue({ initialize: mockInitialize, callTool: mockCallTool });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("edenAuth.buildAuthUrl", () => {
  it("returns a V2-hosted paste page URL carrying the state (no provider redirect)", () => {
    const url = edenAuth.buildAuthUrl("STATE-XYZ", ["read"]);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://app.example.test/integrations/token-paste/eden");
    expect(u.searchParams.get("state")).toBe("STATE-XYZ");
  });
});

describe("edenAuth.verifyAndIngestToken", () => {
  it("verifies via MCP initialize + a read-only tool call, and encrypts the token", async () => {
    const result = await edenAuth.verifyAndIngestToken({ token: TOKEN, state: "s" });

    expect(mockCreateMcpClient).toHaveBeenCalledTimes(1);
    // The client is built with the pasted token as the bearer + Eden's endpoint.
    const opts = mockCreateMcpClient.mock.calls[0]![0]!;
    expect(opts.accessToken).toBe(TOKEN);
    expect(opts.endpoint).toBe("https://mcp.eden.so/mcp");

    expect(mockInitialize).toHaveBeenCalledTimes(1);
    // Token proof uses a READ-ONLY tool (safe for a read-only PAT), marked idempotent.
    expect(mockCallTool).toHaveBeenCalledWith("eden_list_schedules", {}, { idempotent: true });

    // Token is stored ENCRYPTED (round-trips) and non-refreshable.
    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    expect(result.tokens.accessTokenEncrypted).not.toContain(TOKEN);
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(TOKEN);

    // Account info carries no secret; metadata never includes the token.
    expect(JSON.stringify(result.account)).not.toContain(TOKEN);
    expect(result.account.providerAccountId).toBeTruthy();
  });

  it("honors EDEN_MCP_URL override for the endpoint", async () => {
    process.env.EDEN_MCP_URL = "https://mcp.eden.test/mcp";
    await edenAuth.verifyAndIngestToken({ token: TOKEN, state: "s" });
    expect(mockCreateMcpClient.mock.calls[0]![0]!.endpoint).toBe("https://mcp.eden.test/mcp");
  });

  it("maps an MCP auth failure to a typed TokenIngestVerificationError (token not persisted)", async () => {
    mockInitialize.mockRejectedValueOnce(new McpAuthError("Eden"));
    const err = await edenAuth.verifyAndIngestToken({ token: TOKEN, state: "s" }).catch((e) => e);
    expect(err).toBeInstanceOf(TokenIngestVerificationError);
    expect(err.message).not.toContain(TOKEN);
  });

  it("maps a read-only-token permission failure on the probe to a verification error", async () => {
    mockCallTool.mockRejectedValueOnce(new McpPermissionError("Eden", "eden_list_schedules"));
    const err = await edenAuth.verifyAndIngestToken({ token: TOKEN, state: "s" }).catch((e) => e);
    expect(err).toBeInstanceOf(TokenIngestVerificationError);
  });

  it("maps a transient transport failure to a generic (non-verification) error → route 502", async () => {
    mockCallTool.mockRejectedValueOnce(new McpTransportError("Eden", "server 503", 503));
    const err = await edenAuth.verifyAndIngestToken({ token: TOKEN, state: "s" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TokenIngestVerificationError);
    expect(err.message).not.toContain(TOKEN);
  });
});

describe("edenAuth.revoke", () => {
  it("is a best-effort no-op (Eden has no documented revoke tool)", async () => {
    await expect(edenAuth.revoke(TOKEN)).resolves.toBeUndefined();
    expect(mockCreateMcpClient).not.toHaveBeenCalled();
  });
});
