/**
 * @jest-environment node
 *
 * Tests for repositories/integrations.softDisconnectPersonalForMember
 * (Slice 4.ACCOUNT-MODEL-22C). Service-role path — mocks the service-role
 * client's query builder.
 *
 * Proves: only PERSONAL-provider rows for (accountId, connectedByUserId) are
 * soft-disconnected; account/service providers are untouched; the scope filters
 * (account_id + connected_by_user_id + disconnected_at IS NULL) are applied; and
 * the no-active-rows path is a safe no-op (idempotency).
 */
interface BuilderCapture {
  mode: "select" | "update" | null;
  patch: unknown;
  ops: Array<[string, unknown, unknown]>;
}

function makeClient(opts: {
  selectRows: Array<{ id: string; provider: string }>;
  selectError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const builders: BuilderCapture[] = [];
  const from = jest.fn(() => {
    const cap: BuilderCapture = { mode: null, patch: undefined, ops: [] };
    builders.push(cap);
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: jest.fn(() => {
        cap.mode = "select";
        return builder;
      }),
      update: jest.fn((patch: unknown) => {
        cap.mode = "update";
        cap.patch = patch;
        return builder;
      }),
      eq: jest.fn((c: string, v: unknown) => {
        cap.ops.push(["eq", c, v]);
        return builder;
      }),
      in: jest.fn((c: string, v: unknown) => {
        cap.ops.push(["in", c, v]);
        return builder;
      }),
      is: jest.fn((c: string, v: unknown) => {
        cap.ops.push(["is", c, v]);
        // Terminal — resolves to the shape matching the chain mode.
        return cap.mode === "update"
          ? Promise.resolve({ error: opts.updateError ?? null })
          : Promise.resolve({ data: opts.selectRows, error: opts.selectError ?? null });
      }),
    });
    return builder;
  });
  return { client: { from }, builders };
}

const mockClientRef: { current: ReturnType<typeof makeClient>["client"] | null } = {
  current: null,
};
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClientRef.current),
}));

import { softDisconnectPersonalForMember } from "@/repositories/integrations";

describe("softDisconnectPersonalForMember", () => {
  it("soft-disconnects ONLY personal-provider rows and reports them", async () => {
    const { client, builders } = makeClient({
      selectRows: [
        { id: "i-gmail", provider: "gmail" },
        { id: "i-slack", provider: "slack" }, // account → keep
        { id: "i-notion", provider: "notion" }, // account → keep
        { id: "i-dropbox", provider: "dropbox" },
      ],
    });
    mockClientRef.current = client;

    const result = await softDisconnectPersonalForMember({
      accountId: "team-1",
      connectedByUserId: "user-B",
      now: "2026-06-02T00:00:00Z",
    });

    expect(result.disconnectedCount).toBe(2);
    expect(result.disconnectedProviders.sort()).toEqual(["dropbox", "gmail"]);

    // Scope filters on the SELECT.
    const select = builders[0]!;
    expect(select.ops).toContainEqual(["eq", "account_id", "team-1"]);
    expect(select.ops).toContainEqual(["eq", "connected_by_user_id", "user-B"]);
    expect(select.ops).toContainEqual(["is", "disconnected_at", null]);

    // UPDATE targets exactly the personal ids, sets disconnected_at, idempotent guard.
    const update = builders[1]!;
    expect(update.mode).toBe("update");
    expect(update.patch).toEqual({ disconnected_at: "2026-06-02T00:00:00Z" });
    expect(update.ops).toContainEqual(["in", "id", ["i-gmail", "i-dropbox"]]);
    expect(update.ops).toContainEqual(["is", "disconnected_at", null]);
  });

  it("leaves account/service providers untouched (no UPDATE when only account rows)", async () => {
    const { client, builders } = makeClient({
      selectRows: [
        { id: "i-slack", provider: "slack" },
        { id: "i-stripe", provider: "stripe" },
      ],
    });
    mockClientRef.current = client;

    const result = await softDisconnectPersonalForMember({
      accountId: "team-1",
      connectedByUserId: "user-B",
    });

    expect(result).toEqual({ disconnectedCount: 0, disconnectedProviders: [] });
    // Only the SELECT builder was created — no UPDATE chain.
    expect(builders).toHaveLength(1);
    expect(builders[0]!.mode).toBe("select");
  });

  it("is a safe no-op when the member has no active rows (idempotency)", async () => {
    const { client, builders } = makeClient({ selectRows: [] });
    mockClientRef.current = client;

    const result = await softDisconnectPersonalForMember({
      accountId: "team-1",
      connectedByUserId: "user-B",
    });

    expect(result).toEqual({ disconnectedCount: 0, disconnectedProviders: [] });
    expect(builders).toHaveLength(1); // no UPDATE
  });

  it("propagates a select error", async () => {
    const { client } = makeClient({
      selectRows: [],
      selectError: { message: "boom" },
    });
    mockClientRef.current = client;
    await expect(
      softDisconnectPersonalForMember({ accountId: "team-1", connectedByUserId: "user-B" }),
    ).rejects.toThrow(/boom/);
  });
});
