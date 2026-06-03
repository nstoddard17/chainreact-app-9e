/**
 * Slice 4.ACCOUNT-MODEL-6b — cross-account isolation test.
 *
 * Asserts the load-bearing invariant of the integrations cutover: a
 * workflow on account A cannot resolve / use an integration that
 * belongs to account B. The repository's `getActiveForExecution`
 * filters by exact `account_id`; the engine + handlers thread
 * `workflow.accountId` through `input.accountId` so there is no
 * silent fallback to "any of the user's integrations" or "another
 * account's matching provider integration".
 *
 * Out-of-scope: live Postgres RLS. Those checks live in
 * `tests/integration/security/integrations-account-rls.test.ts` (live
 * DB, opt-in). This file is the unit-level contract guard.
 */
import { jest } from "@jest/globals";

const mockSelect = jest.fn();
const mockFrom = jest.fn(() => ({
  select: mockSelect,
}));
const mockClient = { from: mockFrom };

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: () => mockClient,
}));

// repository imports come after jest.mock (hoisted).
import {
  getActiveForExecution,
  type IntegrationRecord,
} from "@/repositories/integrations";

function fakeRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "int-1",
    account_id: "acct-A",
    connected_by_user_id: "user-A",
    provider: "gmail",
    provider_account_id: "alice@a.test",
    display_name: "Alice (Gmail)",
    access_token_encrypted: "ENC-A",
    refresh_token_encrypted: "ENC-R-A",
    access_token_expires_at: null,
    scopes: ["gmail.send"],
    account_metadata: {},
    disconnected_at: null,
    created_at: "2026-05-30T00:00:00Z",
    updated_at: "2026-05-30T00:00:00Z",
    ...over,
  };
}

/**
 * Build a Supabase query-builder mock whose terminal `.maybeSingle()`
 * resolves to the supplied row (or null when `match` returns null).
 *
 * The mock captures every `.eq()` filter applied so the test can
 * assert exact filter shape on the outbound query.
 */
function buildQueryMock(match: (filters: Record<string, unknown>) => unknown) {
  const filters: Record<string, unknown> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn((col: string, val: unknown) => {
    filters[col] = val;
    return builder;
  });
  builder.is = jest.fn((col: string, val: unknown) => {
    filters[`${col}_is`] = val;
    return builder;
  });
  builder.order = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(async () => ({
    data: match(filters),
    error: null,
  }));
  return { builder, filters };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockFrom.mockReset();
  mockFrom.mockImplementation(() => ({ select: mockSelect }));
});

describe("integrations cross-account isolation", () => {
  it("returns null when called with account B's id while the only matching row belongs to account A", async () => {
    // Set up the supabase mock to return a row ONLY when the
    // `account_id = acct-A` filter is applied. Account B's lookup
    // (`account_id = acct-B`) does NOT match — repository returns null.
    const { builder } = buildQueryMock((filters) => {
      if (filters.account_id === "acct-A" && filters.provider === "gmail") {
        return fakeRow();
      }
      return null;
    });
    mockSelect.mockReturnValue(builder);

    // Workflow on account B asks for a Gmail integration. The owning
    // workflow's account_id = "acct-B" — the user happens to own a
    // Gmail integration on account A as well, but the repository must
    // NOT bridge the two.
    const result = await getActiveForExecution("acct-B", "gmail", null);

    expect(result).toBeNull();
    // The exact account_id filter was applied — no silent fall-through.
    expect(builder.eq).toHaveBeenCalledWith("account_id", "acct-B");
  });

  it("returns the row only when the EXACT account_id matches", async () => {
    const { builder } = buildQueryMock((filters) =>
      filters.account_id === "acct-A" && filters.provider === "gmail"
        ? fakeRow()
        : null,
    );
    mockSelect.mockReturnValue(builder);

    const result = await getActiveForExecution("acct-A", "gmail", null);

    expect(result).not.toBeNull();
    const integration = result as IntegrationRecord;
    expect(integration.accountId).toBe("acct-A");
    expect(integration.provider).toBe("gmail");
    expect(builder.eq).toHaveBeenCalledWith("account_id", "acct-A");
  });

  it("uses the providerAccountId discriminator IN ADDITION to account_id when supplied", async () => {
    const { builder } = buildQueryMock((filters) =>
      filters.account_id === "acct-A" &&
      filters.provider === "gmail" &&
      filters.provider_account_id === "alice@a.test"
        ? fakeRow()
        : null,
    );
    mockSelect.mockReturnValue(builder);

    const result = await getActiveForExecution("acct-A", "gmail", "alice@a.test");

    expect(result).not.toBeNull();
    expect(builder.eq).toHaveBeenCalledWith("account_id", "acct-A");
    expect(builder.eq).toHaveBeenCalledWith("provider", "gmail");
    expect(builder.eq).toHaveBeenCalledWith(
      "provider_account_id",
      "alice@a.test",
    );
  });

  it("does NOT fall back to a different provider_account_id even when the V2 account matches", async () => {
    // Account A has Gmail integrations for two different mailboxes.
    // A workflow asks for `bob@a.test`. The repository must NOT
    // return `alice@a.test` as a "close enough" match.
    const { builder } = buildQueryMock((filters) =>
      filters.account_id === "acct-A" &&
      filters.provider === "gmail" &&
      filters.provider_account_id === "bob@a.test"
        ? fakeRow({ provider_account_id: "bob@a.test" })
        : null,
    );
    mockSelect.mockReturnValue(builder);

    const result = await getActiveForExecution("acct-A", "gmail", "bob@a.test");

    expect(result).not.toBeNull();
    expect((result as IntegrationRecord).providerAccountId).toBe("bob@a.test");
    expect(builder.eq).toHaveBeenCalledWith(
      "provider_account_id",
      "bob@a.test",
    );
  });

  it("never returns disconnected rows even when account_id + provider match", async () => {
    const { builder } = buildQueryMock(() => null);
    mockSelect.mockReturnValue(builder);

    const result = await getActiveForExecution("acct-A", "gmail", null);

    expect(result).toBeNull();
    // The `.is("disconnected_at", null)` predicate was applied.
    expect(builder.is).toHaveBeenCalledWith("disconnected_at", null);
  });
});
