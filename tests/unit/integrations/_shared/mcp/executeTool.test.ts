/**
 * @jest-environment node
 *
 * Shared MCP executor (CS-3 LINEAR-1) — the ONE seam every MCP-catalog action
 * reaches a server through. Mocks ONLY the external boundary (a fake MCP client
 * + a refreshAndRetry test double that honors the 401→refresh→retry contract);
 * everything else is the real executor. Proves:
 *   - arg mapping + refreshAndRetry wiring (provider, providerAccountId=null)
 *   - pre-send drift refusal (hash mismatch / vanished tool) — callTool NEVER runs
 *   - bounded output normalization (text + structured; undeclared keys dropped;
 *     type mismatch / missing structured fail honestly)
 *   - transport bounds passed to the client (timeout + maxResponseBytes)
 *   - error mapping: McpAuthError → refresh path; McpPermissionError → scope error
 *   - idempotency flag threaded to callTool
 */
import { schemaHash } from "@/core/mcpCompile";
import {
  executeMcpTool,
  normalizeOutput,
  type ExecuteMcpToolInput,
} from "@/integrations/_shared/mcp/executeTool";
import {
  McpAuthError,
  McpPermissionError,
  McpProtocolError,
  McpSchemaDriftError,
  McpToolNotFoundError,
  type McpCallToolResult,
  type McpClientOptions,
  type McpListToolsResult,
} from "@/integrations/_shared/mcp";
import {
  Unauthorized401Error,
  InsufficientScopeError,
} from "@/services/oauth/refreshAndRetry";

// A pinned input schema + its certified hash (drift pin).
const PINNED_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, team: { type: "string" } },
  required: ["title", "team"],
  additionalProperties: false,
} as const;
const PINNED_HASH = schemaHash(PINNED_SCHEMA as Record<string, unknown>);

interface FakeClientConfig {
  listTools?: McpListToolsResult;
  listToolsThrow?: unknown;
  callToolResult?: McpCallToolResult;
  callToolThrow?: unknown;
}

class FakeClient {
  listToolsCalls = 0;
  callToolCalls: Array<{ name: string; args: Record<string, unknown>; opts: { idempotent?: boolean } }> = [];
  constructor(readonly opts: McpClientOptions, private readonly cfg: FakeClientConfig) {}
  async listTools(): Promise<McpListToolsResult> {
    this.listToolsCalls++;
    if (this.cfg.listToolsThrow) throw this.cfg.listToolsThrow;
    return (
      this.cfg.listTools ?? {
        tools: [{ name: "save_issue", description: "", inputSchema: PINNED_SCHEMA as Record<string, unknown> }],
      }
    );
  }
  async callTool(name: string, args: Record<string, unknown>, opts: { idempotent?: boolean }): Promise<McpCallToolResult> {
    this.callToolCalls.push({ name, args, opts });
    if (this.cfg.callToolThrow) throw this.cfg.callToolThrow;
    return this.cfg.callToolResult ?? { content: [{ type: "text", text: "ok" }] };
  }
}

/** refreshAndRetry test double honoring the contract: one refresh+retry on 401. */
function fakeRefresh(capture?: { args?: Record<string, unknown>; tokens?: string[] }) {
  return (async (input: {
    accountId: string;
    provider: string;
    providerAccountId?: string | null;
    apiCall: (t: string) => Promise<unknown>;
  }) => {
    if (capture) capture.args = { accountId: input.accountId, provider: input.provider, providerAccountId: input.providerAccountId ?? null };
    try {
      capture?.tokens?.push("tok-1");
      return await input.apiCall("tok-1");
    } catch (e) {
      if (e instanceof Unauthorized401Error) {
        capture?.tokens?.push("tok-2");
        return await input.apiCall("tok-2");
      }
      throw e;
    }
  }) as never;
}

function baseInput(over: Partial<ExecuteMcpToolInput> = {}): ExecuteMcpToolInput {
  return {
    provider: "linear",
    serverUrl: "https://mcp.linear.app/mcp",
    tool: "save_issue",
    accountId: "acct-1",
    args: { title: "T", team: "Core" },
    pinnedSchemaHash: PINNED_HASH,
    output: { kind: "text" },
    idempotent: false,
    ...over,
  };
}

let lastClient: FakeClient | null = null;
function clientFactory(cfg: FakeClientConfig) {
  return (opts: McpClientOptions) => {
    lastClient = new FakeClient(opts, cfg);
    return lastClient as never;
  };
}

beforeEach(() => {
  lastClient = null;
});

describe("happy path + wiring", () => {
  it("lists tools, verifies the pin, calls the tool, returns a bounded text output", async () => {
    const capture: { args?: Record<string, unknown> } = {};
    const res = await executeMcpTool(baseInput(), {
      createClient: clientFactory({ callToolResult: { content: [{ type: "text", text: "Created LIN-42" }] } }),
      refreshAndRetry: fakeRefresh(capture),
    });
    expect(res.output).toEqual({ text: "Created LIN-42" });
    expect(lastClient!.callToolCalls).toHaveLength(1);
    expect(lastClient!.callToolCalls[0]!.name).toBe("save_issue");
    expect(lastClient!.callToolCalls[0]!.args).toEqual({ title: "T", team: "Core" });
    // refreshAndRetry wiring: provider + personal-provider providerAccountId=null.
    expect(capture.args).toEqual({ accountId: "acct-1", provider: "linear", providerAccountId: null });
  });

  it("threads idempotency + transport bounds to the client", async () => {
    await executeMcpTool(baseInput({ idempotent: true }), {
      createClient: clientFactory({}),
      refreshAndRetry: fakeRefresh(),
      timeoutMs: 12_345,
      maxResponseBytes: 4242,
    });
    expect(lastClient!.callToolCalls[0]!.opts).toEqual({ idempotent: true });
    expect(lastClient!.opts.endpoint).toBe("https://mcp.linear.app/mcp");
    expect(lastClient!.opts.serverLabel).toBe("Linear");
    expect(lastClient!.opts.timeoutMs).toBe(12_345);
    expect(lastClient!.opts.maxResponseBytes).toBe(4242);
  });
});

describe("drift refusal (fail closed, pre-send)", () => {
  it("refuses when the live schema hash != the pinned hash — callTool never runs", async () => {
    const driftedSchema = { ...PINNED_SCHEMA, properties: { title: { type: "string" } }, required: ["title"] };
    await expect(
      executeMcpTool(baseInput(), {
        createClient: clientFactory({
          listTools: { tools: [{ name: "save_issue", description: "", inputSchema: driftedSchema as Record<string, unknown> }] },
        }),
        refreshAndRetry: fakeRefresh(),
      }),
    ).rejects.toBeInstanceOf(McpSchemaDriftError);
    expect(lastClient!.callToolCalls).toHaveLength(0);
  });

  it("refuses when the pinned tool has vanished from the live catalog", async () => {
    await expect(
      executeMcpTool(baseInput(), {
        createClient: clientFactory({ listTools: { tools: [{ name: "something_else", description: "", inputSchema: {} }] } }),
        refreshAndRetry: fakeRefresh(),
      }),
    ).rejects.toBeInstanceOf(McpToolNotFoundError);
    expect(lastClient!.callToolCalls).toHaveLength(0);
  });

  it("runs normally when the live schema matches the pin", async () => {
    const res = await executeMcpTool(baseInput(), {
      createClient: clientFactory({ callToolResult: { content: [{ type: "text", text: "ok" }] } }),
      refreshAndRetry: fakeRefresh(),
    });
    expect(res.output).toEqual({ text: "ok" });
    expect(lastClient!.callToolCalls).toHaveLength(1);
  });
});

describe("error mapping", () => {
  it("McpAuthError → Unauthorized401Error drives one refresh+retry, then succeeds", async () => {
    let calls = 0;
    const factory = (opts: McpClientOptions) => {
      // First client (tok-1) throws auth on callTool; second (tok-2) succeeds.
      const cfg: FakeClientConfig =
        calls === 0
          ? { callToolThrow: new McpAuthError("Linear") }
          : { callToolResult: { content: [{ type: "text", text: "retried-ok" }] } };
      calls++;
      lastClient = new FakeClient(opts, cfg);
      return lastClient as never;
    };
    const res = await executeMcpTool(baseInput(), { createClient: factory, refreshAndRetry: fakeRefresh() });
    expect(res.output).toEqual({ text: "retried-ok" });
    expect(calls).toBe(2);
  });

  it("McpPermissionError → InsufficientScopeError (not caught by refresh)", async () => {
    await expect(
      executeMcpTool(baseInput(), {
        createClient: clientFactory({ callToolThrow: new McpPermissionError("Linear", "save_issue") }),
        refreshAndRetry: fakeRefresh(),
      }),
    ).rejects.toBeInstanceOf(InsufficientScopeError);
  });

  it("other MCP errors propagate for engine classification (no {success:false} envelope)", async () => {
    await expect(
      executeMcpTool(baseInput(), {
        createClient: clientFactory({ callToolThrow: new McpProtocolError("Linear", "boom") }),
        refreshAndRetry: fakeRefresh(),
      }),
    ).rejects.toBeInstanceOf(McpProtocolError);
  });
});

describe("bounded output normalization", () => {
  const label = "Linear";
  it("text kind joins all text blocks", () => {
    expect(normalizeOutput({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }, { kind: "text" }, label)).toEqual({
      text: "a\nb",
    });
  });

  it("text kind falls back to stringified structuredContent", () => {
    expect(normalizeOutput({ structuredContent: { id: "x" } }, { kind: "text" }, label)).toEqual({ text: '{"id":"x"}' });
  });

  it("structured kind projects ONLY declared keys — raw response never spread", () => {
    const out = normalizeOutput(
      { structuredContent: { id: "LIN-1", identifier: "LIN-1", url: "https://linear.app/x", secret: "leak" } },
      { kind: "structured", fields: [{ name: "id", type: "string" }, { name: "identifier", type: "string" }] },
      label,
    );
    expect(out).toEqual({ id: "LIN-1", identifier: "LIN-1" });
    expect(out).not.toHaveProperty("url");
    expect(out).not.toHaveProperty("secret");
  });

  it("structured kind reads a JSON text block when no structuredContent is present", () => {
    const out = normalizeOutput(
      { content: [{ type: "text", text: '{"id":"LIN-9","extra":1}' }] },
      { kind: "structured", fields: [{ name: "id", type: "string" }] },
      label,
    );
    expect(out).toEqual({ id: "LIN-9" });
  });

  it("absent declared field → null (not omitted, not undefined)", () => {
    expect(
      normalizeOutput({ structuredContent: { id: "x" } }, { kind: "structured", fields: [{ name: "id", type: "string" }, { name: "title", type: "string" }] }, label),
    ).toEqual({ id: "x", title: null });
  });

  it("declared field present with the wrong type fails honestly", () => {
    expect(() =>
      normalizeOutput({ structuredContent: { count: "not-a-number" } }, { kind: "structured", fields: [{ name: "count", type: "number" }] }, label),
    ).toThrow(McpProtocolError);
  });

  it("structured kind with no structured payload fails honestly", () => {
    expect(() =>
      normalizeOutput({ content: [{ type: "text", text: "just prose, not json" }] }, { kind: "structured", fields: [{ name: "id", type: "string" }] }, label),
    ).toThrow(McpProtocolError);
  });

  it("fileRef output type is refused until the file-output contract is wired", () => {
    expect(() =>
      normalizeOutput({ structuredContent: { file: { some: "ref" } } }, { kind: "structured", fields: [{ name: "file", type: "fileRef" }] }, label),
    ).toThrow(McpProtocolError);
  });
});
