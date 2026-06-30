/**
 * @jest-environment node
 *
 * Tests for repositories/internalAdmins.ts (INTERNAL-FEEDBACK-1).
 *
 * Business rule: `isInternalAdmin` answers "is this user a ChainReact COMPANY
 * internal admin?" by reading the caller's OWN `internal_admins` row (RLS
 * select-own). A row present → true; absent → false; read error → false
 * (fail closed). Customer account roles are never consulted — there is no path
 * here that an account owner/admin could traverse to become an internal admin.
 *
 * The DB-level RLS (select-own, no authenticated writes) is enforced by the
 * migration and proven by gated DB tests after db:push. These unit tests prove
 * the repository's query shape + fail-closed mapping without a live DB.
 */

interface MaybeSingleResult {
  data: { user_id: string } | null;
  error: { message: string } | null;
}

function makeClient(result: MaybeSingleResult) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return builder;
    });
  Object.assign(builder, {
    select: chain("select"),
    eq: chain("eq"),
    maybeSingle: jest.fn(async () => result),
  });
  return { client: { from: jest.fn(() => builder) }, calls };
}

const mockClient: { current: { from: jest.Mock } | null } = { current: null };
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockClient.current),
}));

import { isInternalAdmin } from "@/repositories/internalAdmins";

beforeEach(() => {
  mockClient.current = null;
});

describe("isInternalAdmin", () => {
  it("returns true when the caller has an internal_admins row", async () => {
    const { client, calls } = makeClient({ data: { user_id: "u1" }, error: null });
    mockClient.current = client;

    await expect(isInternalAdmin("u1")).resolves.toBe(true);
    // Reads the internal_admins table scoped to the caller's own id.
    expect(client.from).toHaveBeenCalledWith("internal_admins");
    expect(calls.eq).toEqual(["user_id", "u1"]);
  });

  it("returns false when the signed-in user has no internal_admins row (e.g. an account owner)", async () => {
    // A customer account owner/admin signs in: they have NO internal_admins row,
    // so administering their own account grants them nothing here.
    mockClient.current = makeClient({ data: null, error: null }).client;
    await expect(isInternalAdmin("account-owner")).resolves.toBe(false);
  });

  it("fails closed (false) when the read errors", async () => {
    mockClient.current = makeClient({
      data: null,
      error: { message: "boom" },
    }).client;
    await expect(isInternalAdmin("u1")).resolves.toBe(false);
  });

  it("returns false for an empty user id without touching the database", async () => {
    const { client } = makeClient({ data: null, error: null });
    mockClient.current = client;
    await expect(isInternalAdmin("")).resolves.toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });
});
