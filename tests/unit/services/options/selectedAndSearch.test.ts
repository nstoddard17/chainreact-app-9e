/**
 * @jest-environment node
 *
 * QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1 — the generic options contract's
 * additive `selected` passthrough, plus the end-to-end proof that a customer
 * beyond the first 100 records is reachable through the real resolution path.
 *
 * The ONLY mock is the Intuit HTTP boundary (`quickbooksRequest`) and the
 * integration repo. `resolveOptionsSource` → registry → the real
 * `quickbooks:customers` resolver → the real `customerList` wrapper all run.
 */
const mockQuickbooksRequest = jest.fn();
jest.mock("@/integrations/_shared/quickbooks/api/_request", () => {
  const actual = jest.requireActual("@/integrations/_shared/quickbooks/api/_request");
  return {
    ...actual,
    quickbooksRequest: (...args: unknown[]) => mockQuickbooksRequest(...args),
  };
});
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
  markNeedsReconnect: jest.fn(() => Promise.resolve(false)),
  clearNeedsReconnect: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  resolveEffectiveNodeOwner: jest.fn(() => Promise.resolve(null)),
}));
jest.mock("@/repositories/workflows", () => ({ getById: jest.fn() }));
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: jest.fn(async (userId: string) => ({
    id: `acct-${userId}`,
    type: "personal" as const,
    ownerUserId: userId,
    createdAt: "2026-05-30T00:00:00Z",
    updatedAt: "2026-05-30T00:00:00Z",
  })),
}));
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("tok_test"),
  };
});

import {
  MAX_SELECTED_VALUES,
  MAX_SELECTED_VALUE_LENGTH,
  resolveOptionsSource,
} from "@/services/options/resolveOptionsSource";
import { getOptionsResolver } from "@/services/options/_registry";
import type { OptionsResolverContext } from "@/services/options/types";

/**
 * A 150-customer company. Position 101+ is exactly what the old resolver
 * could never reach: it fetched rows 1-100 and filtered locally, so a search
 * for "Customer 137" returned nothing.
 */
const ALL = Array.from({ length: 150 }, (_, i) => ({
  Id: String(i + 1),
  // Zero-padded so QuickBooks' DisplayName ordering matches numeric order.
  DisplayName: `Customer ${String(i + 1).padStart(3, "0")}`,
}));

/** Serve ALL through a realistic QuickBooks query endpoint. */
function armQuickbooks(): void {
  mockQuickbooksRequest.mockImplementation(
    async (input: { query: URLSearchParams }) => {
      const stmt = input.query.get("query")!;
      const idIn = /Id in \(([^)]*)\)/.exec(stmt);
      if (idIn) {
        const ids = idIn[1]!.split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
        return { QueryResponse: { Customer: ALL.filter((c) => ids.includes(c.Id)) } };
      }
      const like = /DisplayName LIKE '%(.*?)%'/.exec(stmt);
      let rows = ALL;
      if (like) {
        // Undo the wrapper's escaping to recover the literal term, then match
        // case-insensitively — the certified provider semantics.
        const term = like[1]!.replace(/\\(.)/g, "$1").toLowerCase();
        rows = rows.filter((c) => c.DisplayName.toLowerCase().includes(term));
      }
      const start = Number(/STARTPOSITION (\d+)/.exec(stmt)?.[1] ?? "1");
      const max = Number(/MAXRESULTS (\d+)/.exec(stmt)?.[1] ?? "100");
      return { QueryResponse: { Customer: rows.slice(start - 1, start - 1 + max) } };
    },
  );
}

const INPUT = {
  source: "quickbooks:customers",
  userId: "u-1",
  q: "",
  deps: {},
  workflowId: null,
  nodeId: null,
};

beforeEach(() => {
  mockQuickbooksRequest.mockReset();
  mockGetActiveForExecution.mockReset().mockResolvedValue({
    id: "int-1",
    accountId: "acct-1",
    provider: "quickbooks",
    providerAccountId: "913035",
    accountMetadata: {},
  });
  armQuickbooks();
});

describe("reaching a customer beyond the first 100", () => {
  it("returns only a bounded first page when nothing is searched", async () => {
    const { response } = await resolveOptionsSource(INPUT);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items).toHaveLength(100);
    expect(response.hasMore).toBe(true);
    // The browser is NOT sent all 150 records.
    expect(response.items.length).toBeLessThan(ALL.length);
  });

  it("finds customer #137 — unreachable before this batch", async () => {
    const { response } = await resolveOptionsSource({ ...INPUT, q: "Customer 137" });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items).toEqual([{ value: "137", label: "Customer 137" }]);
  });

  it("finds a customer whose match is interior, not a prefix", async () => {
    const { response } = await resolveOptionsSource({ ...INPUT, q: "149" });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items.map((i) => i.value)).toEqual(["149"]);
  });

  it("keeps the provider call bounded to a single page per search", async () => {
    await resolveOptionsSource({ ...INPUT, q: "Customer" });
    // One page request; no hidden loop walking the whole catalog.
    expect(mockQuickbooksRequest).toHaveBeenCalledTimes(1);
    const stmt = (mockQuickbooksRequest.mock.calls[0]![0] as { query: URLSearchParams })
      .query.get("query")!;
    expect(stmt).toContain("MAXRESULTS 100");
  });

  it("an empty search never triggers an unbounded account scan", async () => {
    await resolveOptionsSource(INPUT);
    expect(mockQuickbooksRequest).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list for a no-match search", async () => {
    const { response } = await resolveOptionsSource({ ...INPUT, q: "zzz-nobody" });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items).toEqual([]);
    expect(response.hasMore).toBe(false);
  });

  it("never returns duplicate option values", async () => {
    const { response } = await resolveOptionsSource({
      ...INPUT,
      q: "Customer",
      selected: ["137"],
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    const values = response.items.map((i) => i.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("selected-value label resolution", () => {
  it("labels a saved selection that is not in the current page", async () => {
    const { response } = await resolveOptionsSource({ ...INPUT, selected: ["137"] });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items[0]).toEqual({ value: "137", label: "Customer 137" });
  });

  it("survives a search that does not match the selection", async () => {
    const { response } = await resolveOptionsSource({
      ...INPUT,
      q: "Customer 001",
      selected: ["137"],
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items.map((i) => i.value)).toEqual(["137", "1"]);
  });
});

describe("selected normalization is bounded and shared", () => {
  const seen: OptionsResolverContext[] = [];
  beforeEach(() => {
    seen.length = 0;
    const real = getOptionsResolver("quickbooks:customers")!;
    jest.spyOn(real, "resolve").mockImplementation(async (ctx) => {
      seen.push(ctx);
      return { items: [], hasMore: false };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("always passes an array, even when the caller sends nothing", async () => {
    await resolveOptionsSource(INPUT);
    expect(seen[0]!.selected).toEqual([]);
  });

  it("trims, drops empties and de-duplicates", async () => {
    await resolveOptionsSource({
      ...INPUT,
      selected: [" 42 ", "42", "", "   ", "43"],
    });
    expect(seen[0]!.selected).toEqual(["42", "43"]);
  });

  it("caps the number of values", async () => {
    await resolveOptionsSource({
      ...INPUT,
      selected: Array.from({ length: 60 }, (_, i) => `id-${i}`),
    });
    expect(seen[0]!.selected).toHaveLength(MAX_SELECTED_VALUES);
  });

  it("caps the length of each value", async () => {
    await resolveOptionsSource({ ...INPUT, selected: ["x".repeat(500)] });
    expect(seen[0]!.selected![0]!.length).toBe(MAX_SELECTED_VALUE_LENGTH);
  });

  it("still clamps q independently", async () => {
    await resolveOptionsSource({ ...INPUT, q: `  ${"y".repeat(500)}  ` });
    expect(seen[0]!.q.length).toBe(256);
  });
});

describe("backward compatibility", () => {
  it("a resolver that ignores `selected` behaves exactly as before", async () => {
    const real = getOptionsResolver("quickbooks:customers")!;
    const legacy = jest
      .spyOn(real, "resolve")
      // A pre-existing resolver signature: reads only q/deps/integration.
      .mockImplementation(async (ctx) => ({
        items: [{ value: "1", label: `q=${ctx.q}` }],
        hasMore: false,
      }));
    const { response } = await resolveOptionsSource({
      ...INPUT,
      q: "abc",
      selected: ["ignored"],
    });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.items).toEqual([{ value: "1", label: "q=abc" }]);
    legacy.mockRestore();
  });

  it("omitting `selected` entirely is valid input", async () => {
    const { response } = await resolveOptionsSource(INPUT);
    expect(response.ok).toBe(true);
  });
});

describe("account and realm scoping", () => {
  it("resolves the realm from the stored connection, never from the caller", async () => {
    await resolveOptionsSource({ ...INPUT, q: "Customer 137" });
    expect(mockGetActiveForExecution).toHaveBeenCalledWith(
      expect.any(String),
      "quickbooks",
      null,
    );
    const input = mockQuickbooksRequest.mock.calls[0]![0] as { realmId: string };
    expect(input.realmId).toBe("913035");
  });

  it("reports INTEGRATION_DISCONNECTED without a connection and makes no provider call", async () => {
    mockGetActiveForExecution.mockResolvedValue(null);
    const { response } = await resolveOptionsSource(INPUT);
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockQuickbooksRequest).not.toHaveBeenCalled();
  });

  it("emits no customer contact or financial data", async () => {
    mockQuickbooksRequest.mockResolvedValue({
      QueryResponse: {
        Customer: [
          {
            Id: "42",
            DisplayName: "Acme Corp",
            PrimaryEmailAddr: { Address: "ap@acme.test" },
            PrimaryPhone: { FreeFormNumber: "555-0100" },
            Balance: 1234.56,
            BillAddr: { Line1: "1 Secret Way" },
          },
        ],
      },
    });
    const { response } = await resolveOptionsSource(INPUT);
    const json = JSON.stringify(response);
    for (const leak of ["ap@acme.test", "555-0100", "1234.56", "1 Secret Way", "913035", "tok_test"]) {
      expect(json).not.toContain(leak);
    }
  });
});
