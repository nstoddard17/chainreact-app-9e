/**
 * @jest-environment node
 *
 * Tests for the 4 Asana options resolvers — Slice 5.ASANA-1.
 *
 * Covers: registration, success mapping (labels/values/hasMore),
 * disconnected short-circuit, sanitized error mapping (401-family →
 * INTEGRATION_DISCONNECTED, 403/insufficient-scope →
 * PROVIDER_REAUTH_REQUIRED, other → PROVIDER_ERROR with no provider-raw
 * text), q filtering + alpha sort, and no-email-in-users-labels.
 *
 * Personal-credential denial (NOT_WORKFLOW_OWNER / OWNER_MUST_CONNECT)
 * is enforced centrally in services/options/resolveOptionsSource.ts and
 * covered by tests/unit/app/api/options/options-route.test.ts; the
 * `asana: "personal"` classification that engages it is asserted in
 * tests/unit/integrations/asana/manifest.test.ts.
 */
const mockRefreshAndRetry = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  class InsufficientScopeError extends Error {}
  class IntegrationActionRequiredError extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    InsufficientScopeError,
    IntegrationActionRequiredError,
  };
});

import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
} from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError } from "@/services/options/types";
import { getOptionsResolver } from "@/services/options/_registry";
import { asanaWorkspacesResolver } from "@/integrations/asana/options/workspaces";
import { asanaProjectsResolver } from "@/integrations/asana/options/projects";
import { asanaUsersResolver } from "@/integrations/asana/options/users";
import { asanaTasksResolver } from "@/integrations/asana/options/tasks";

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    integration: {
      id: "int-1",
      accountId: "acct-1",
      connectedByUserId: "user-1",
      provider: "asana",
      providerAccountId: "marcus@example.test",
      displayName: "Marcus",
      accessTokenEncrypted: "enc",
      refreshTokenEncrypted: "enc-r",
      accessTokenExpiresAt: null,
      scopes: [],
      accountMetadata: {},
      disconnectedAt: null,
      createdAt: "",
      updatedAt: "",
    },
    q: "",
    deps: {},
    ...overrides,
  } as never;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("registration", () => {
  it("all 4 Asana resolvers are registered under their source keys", () => {
    expect(getOptionsResolver("asana:workspaces")).toBe(asanaWorkspacesResolver);
    expect(getOptionsResolver("asana:projects")).toBe(asanaProjectsResolver);
    expect(getOptionsResolver("asana:users")).toBe(asanaUsersResolver);
    expect(getOptionsResolver("asana:tasks")).toBe(asanaTasksResolver);
  });

  it("declares the cascade deps the builder fields use", () => {
    expect(asanaWorkspacesResolver.requiredDeps).toBeUndefined();
    expect(asanaProjectsResolver.requiredDeps).toEqual(["workspaceId"]);
    expect(asanaUsersResolver.requiredDeps).toEqual(["workspaceId"]);
    expect(asanaTasksResolver.requiredDeps).toEqual(["projectId"]);
  });
});

describe("asana:workspaces", () => {
  it("maps gid/name to value/label, sorts alphabetically, forwards hasMore", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { gid: "w-2", name: "Zeta Corp" },
        { gid: "w-1", name: "Acme" },
        { gid: "", name: "dropped" },
      ],
      hasMore: true,
    });
    const result = await asanaWorkspacesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "w-1", label: "Acme" },
      { value: "w-2", label: "Zeta Corp" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("throws INTEGRATION_DISCONNECTED without a connection (no fetch)", async () => {
    await expect(
      asanaWorkspacesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps auth-required failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "asana",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      asanaWorkspacesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps insufficient-scope (403) to PROVIDER_REAUTH_REQUIRED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new InsufficientScopeError("403"),
    );
    await expect(
      asanaWorkspacesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "PROVIDER_REAUTH_REQUIRED" });
  });

  it("maps other failures to PROVIDER_ERROR without provider-raw text", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("raw asana body with sensitive detail"),
    );
    let caught: unknown;
    try {
      await asanaWorkspacesResolver.resolve(ctx());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as Error).message).not.toContain("sensitive detail");
  });
});

describe("asana:projects", () => {
  it("passes the workspace dep + filters by q", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { gid: "p-1", name: "Launch Plan", archived: false },
        { gid: "p-2", name: "Ops Board", archived: false },
      ],
      hasMore: false,
    });
    const result = await asanaProjectsResolver.resolve(
      ctx({ deps: { workspaceId: "w-1" }, q: "launch" }),
    );
    expect(result.items).toEqual([{ value: "p-1", label: "Launch Plan" }]);
  });
});

describe("asana:users", () => {
  it("labels are names only — no emails in the browser payload", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { gid: "u-1", name: "Alice" },
        { gid: "u-2", name: null },
      ],
      hasMore: false,
    });
    const result = await asanaUsersResolver.resolve(
      ctx({ deps: { workspaceId: "w-1" } }),
    );
    expect(result.items).toEqual([
      { value: "u-1", label: "Alice" },
      { value: "u-2", label: "u-2" },
    ]);
    expect(JSON.stringify(result.items)).not.toMatch(/@/);
  });
});

describe("asana:tasks", () => {
  it("marks completed tasks with a description hint", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { gid: "t-1", name: "Open task", completed: false },
        { gid: "t-2", name: "Done task", completed: true },
      ],
      hasMore: true,
    });
    const result = await asanaTasksResolver.resolve(
      ctx({ deps: { projectId: "p-1" } }),
    );
    expect(result.items).toEqual([
      { value: "t-2", label: "Done task", description: "Completed" },
      { value: "t-1", label: "Open task" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("maps provider failure to a sanitized PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("boom"));
    await expect(
      asanaTasksResolver.resolve(ctx({ deps: { projectId: "p-1" } })),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
