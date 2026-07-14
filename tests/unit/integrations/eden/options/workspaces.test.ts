/**
 * @jest-environment node
 *
 * `eden:workspaces` options resolver (EDEN-4). Mocks the API wrapper + token decryption. Proves it
 * maps to { value:id, label:name }, sorts, filters by q, and sanitizes errors — no token/email leak.
 */
const mockListWorkspaces = jest.fn();
jest.mock("@/integrations/_shared/eden/api/workspaces", () => ({
  listWorkspaces: (...a: unknown[]) => mockListWorkspaces(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({ decryptToken: () => "decrypted-token" }));

import { edenWorkspacesResolver } from "@/integrations/eden/options/workspaces";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError } from "@/services/options/types";

const ctx = (q = "") => ({
  userId: "u",
  integration: { accessTokenEncrypted: "enc" } as never,
  q,
  deps: {},
});

beforeEach(() => jest.clearAllMocks());

it("maps workspaces to sorted {value,label} items (no email, no token)", async () => {
  mockListWorkspaces.mockResolvedValue({
    workspaces: [
      { id: "w2", name: "Zeta", slug: "zeta", role: "owner" },
      { id: "w1", name: "Alpha", slug: "alpha", role: "member" },
    ],
    defaultWorkspaceId: "w1",
  });
  const res = await edenWorkspacesResolver.resolve(ctx());
  expect(res.items).toEqual([
    { value: "w1", label: "Alpha" },
    { value: "w2", label: "Zeta" },
  ]);
  expect(res.hasMore).toBe(false);
  expect(JSON.stringify(res.items)).not.toContain("decrypted-token");
});

it("filters by q (case-insensitive)", async () => {
  mockListWorkspaces.mockResolvedValue({
    workspaces: [{ id: "w1", name: "Alpha", slug: "a", role: "owner" }, { id: "w2", name: "Beta", slug: "b", role: "owner" }],
    defaultWorkspaceId: null,
  });
  const res = await edenWorkspacesResolver.resolve(ctx("bet"));
  expect(res.items).toEqual([{ value: "w2", label: "Beta" }]);
});

it("maps a 401 to a sanitized INTEGRATION_DISCONNECTED (no raw error/token)", async () => {
  mockListWorkspaces.mockRejectedValue(new Unauthorized401Error("Eden 401"));
  const err = await edenWorkspacesResolver.resolve(ctx()).catch((e) => e);
  expect(err).toBeInstanceOf(OptionsResolverError);
  expect(err.code).toBe("INTEGRATION_DISCONNECTED");
});

it("throws INTEGRATION_DISCONNECTED when no integration is present", async () => {
  const err = await edenWorkspacesResolver.resolve({ ...ctx(), integration: null }).catch((e) => e);
  expect(err).toBeInstanceOf(OptionsResolverError);
  expect(err.code).toBe("INTEGRATION_DISCONNECTED");
  expect(mockListWorkspaces).not.toHaveBeenCalled();
});
