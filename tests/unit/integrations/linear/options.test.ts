/**
 * @jest-environment node
 *
 * Linear option resolvers (CS-6B). Value/label mappings are asserted against the
 * REAL captured evidence shapes (mcp-evidence.json). The only mocked boundary is
 * the MCP tool call (injected deps); everything else is the real resolver.
 * Proves: id→value + display→label mapping, NO email leakage, pagination
 * (hasNextPage→hasMore), server-side search args, and disconnected/auth mapping.
 */
import { makeLinearTeamsResolver } from "@/integrations/linear/options/teams";
import { makeLinearAssigneesResolver } from "@/integrations/linear/options/assignees";
import { makeLinearLabelsResolver } from "@/integrations/linear/options/labels";
import { makeLinearProjectsResolver } from "@/integrations/linear/options/projects";
import { makeLinearIssueStatusesResolver } from "@/integrations/linear/options/statuses";
import type { McpResolverDeps } from "@/integrations/_shared/mcp";
import type { OptionsResolverContext } from "@/services/options/types";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

let lastCall: { tool: string; args: Record<string, unknown> } | null = null;

/** Fake MCP boundary: a client whose callTool returns `structuredContent`. */
function deps(structuredContent: unknown, opts: { throwOnCall?: unknown } = {}): McpResolverDeps {
  return {
    createClient: (() => ({
      callTool: async (tool: string, args: Record<string, unknown>) => {
        lastCall = { tool, args };
        if (opts.throwOnCall) throw opts.throwOnCall;
        return { structuredContent };
      },
    })) as never,
    // Honor the contract minimally: run apiCall once with a token.
    refreshAndRetry: (async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok")) as never,
  };
}

function ctx(over: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "u1",
    integration: { accountId: "acct-1", provider: "linear", providerAccountId: "linu-1" } as never,
    q: "",
    deps: {},
    ...over,
  };
}

beforeEach(() => {
  lastCall = null;
});

describe("linear:teams", () => {
  it("maps id→value, name→label, sorted, hasMore from hasNextPage", async () => {
    const r = makeLinearTeamsResolver(
      deps({ teams: [{ id: "t2", name: "Platform" }, { id: "t1", name: "Engineering" }], hasNextPage: true }),
    );
    const res = await r.resolve(ctx());
    expect(res.items).toEqual([
      { value: "t1", label: "Engineering" },
      { value: "t2", label: "Platform" },
    ]);
    expect(res.hasMore).toBe(true);
    expect(lastCall).toMatchObject({ tool: "list_teams", args: { limit: 50 } });
  });

  it("passes a server-side query when the search box is used", async () => {
    const r = makeLinearTeamsResolver(deps({ teams: [], hasNextPage: false }));
    await r.resolve(ctx({ q: "eng" }));
    expect(lastCall!.args).toMatchObject({ query: "eng" });
  });
});

describe("linear:assignees", () => {
  it("labels with displayName and NEVER exposes email", async () => {
    const r = makeLinearAssigneesResolver(
      deps({ users: [{ id: "u1", name: "Ada Lovelace", displayName: "ada", email: "ada@example.com", isActive: true }], hasNextPage: false }),
    );
    const res = await r.resolve(ctx());
    expect(res.items).toEqual([{ value: "u1", label: "ada" }]);
    expect(JSON.stringify(res.items)).not.toContain("ada@example.com");
  });

  it("falls back to name when displayName is missing", async () => {
    const r = makeLinearAssigneesResolver(deps({ users: [{ id: "u2", name: "Grace" }], hasNextPage: false }));
    expect((await r.resolve(ctx())).items).toEqual([{ value: "u2", label: "Grace" }]);
  });
});

describe("linear:labels", () => {
  it("maps id→value, name→label; searches on `name`", async () => {
    const r = makeLinearLabelsResolver(
      deps({ labels: [{ id: "l1", name: "bug", color: "#f00", description: null }], hasNextPage: false }),
    );
    const res = await r.resolve(ctx({ q: "bu" }));
    expect(res.items).toEqual([{ value: "l1", label: "bug" }]);
    expect(lastCall!.args).toMatchObject({ name: "bu" });
  });
});

describe("linear:projects (CS-6C)", () => {
  it("maps id→value, name→label; optional team filter from deps; hasMore", async () => {
    const r = makeLinearProjectsResolver(
      deps({ projects: [{ id: "p2", name: "Roadmap" }, { id: "p1", name: "Delete Me" }], hasNextPage: true }),
    );
    const res = await r.resolve(ctx({ deps: { team: "t1" } }));
    expect(res.items).toEqual([
      { value: "p1", label: "Delete Me" },
      { value: "p2", label: "Roadmap" },
    ]);
    expect(res.hasMore).toBe(true);
    // team from deps flows to the tool as a cascade filter.
    expect(lastCall).toMatchObject({ tool: "list_projects", args: { limit: 50, team: "t1" } });
  });

  it("omits the team arg when no team is selected (lists all projects)", async () => {
    const r = makeLinearProjectsResolver(deps({ projects: [], hasNextPage: false }));
    await r.resolve(ctx());
    expect(lastCall!.args).not.toHaveProperty("team");
  });
});

describe("linear:issue_statuses (CS-6C)", () => {
  it("parses a TOP-LEVEL array result; maps id→value, name→label; team-scoped", async () => {
    // list_issue_statuses returns a bare array (not { key: [...] }).
    const r = makeLinearIssueStatusesResolver(
      deps([
        { id: "s2", type: "started", name: "In Progress" },
        { id: "s1", type: "backlog", name: "Backlog" },
      ]),
    );
    const res = await r.resolve(ctx({ deps: { team: "t1" } }));
    expect(res.items).toEqual([
      { value: "s1", label: "Backlog" },
      { value: "s2", label: "In Progress" },
    ]);
    expect(lastCall).toMatchObject({ tool: "list_issue_statuses", args: { team: "t1" } });
  });

  it("declares team as a required dependency (route enforces 'choose a team first')", () => {
    expect(makeLinearIssueStatusesResolver().requiredDeps).toEqual(["team"]);
  });
});

describe("error mapping", () => {
  it("no integration → INTEGRATION_DISCONNECTED", async () => {
    const r = makeLinearTeamsResolver(deps({ teams: [] }));
    await expect(r.resolve(ctx({ integration: null }))).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("auth failure → INTEGRATION_DISCONNECTED (reconnect)", async () => {
    const r = makeLinearTeamsResolver(deps({}, { throwOnCall: new Unauthorized401Error() }));
    await expect(r.resolve(ctx())).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("rows without an id are skipped (never a blank option)", async () => {
    const r = makeLinearTeamsResolver(deps({ teams: [{ name: "no-id" }, { id: "t1", name: "Eng" }], hasNextPage: false }));
    expect((await r.resolve(ctx())).items).toEqual([{ value: "t1", label: "Eng" }]);
  });
});
