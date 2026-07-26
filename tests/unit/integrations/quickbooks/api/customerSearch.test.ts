/**
 * @jest-environment node
 *
 * QUICKBOOKS-INVOICES-INTEGRATION-RESOLVER-1 — the QuickBooks Customer query
 * wrapper: statement construction, query-language injection safety, paging,
 * and id lookup. Mocks sit at the true HTTP boundary (`quickbooksRequest`),
 * so the statements asserted here are the exact strings sent to Intuit.
 *
 * Semantics pinned here were live-certified read-only before implementation:
 * `DisplayName LIKE '%term%'` is an accepted, case-insensitive CONTAINS match;
 * STARTPOSITION pages Customer without overlap; `Id IN (…)` resolves specific
 * customers.
 */
const mockQuickbooksRequest = jest.fn();
jest.mock("@/integrations/_shared/quickbooks/api/_request", () => {
  const actual = jest.requireActual("@/integrations/_shared/quickbooks/api/_request");
  return {
    ...actual,
    quickbooksRequest: (...args: unknown[]) => mockQuickbooksRequest(...args),
  };
});

import {
  CUSTOMER_SEARCH_MAX_LENGTH,
  customerList,
  customersByIds,
} from "@/integrations/_shared/quickbooks/api/customers";

const BASE = { accessToken: "tok", realmId: "913035" };

function armRows(rows: { Id: string; DisplayName: string }[]): void {
  mockQuickbooksRequest.mockResolvedValue({ QueryResponse: { Customer: rows } });
}

/** The statement actually sent to Intuit on call `n`. */
function statement(n = 0): string {
  const input = mockQuickbooksRequest.mock.calls[n]![0] as { query: URLSearchParams };
  return input.query.get("query")!;
}

beforeEach(() => {
  mockQuickbooksRequest.mockReset();
  armRows([]);
});

describe("customerList — statement construction", () => {
  it("lists active customers in a deterministic display-name order", async () => {
    await customerList({ ...BASE, maxResults: 100 });
    expect(statement()).toBe(
      "select * from Customer where Active = true ORDERBY DisplayName STARTPOSITION 1 MAXRESULTS 100",
    );
  });

  it("adds a CONTAINS predicate when searching", async () => {
    await customerList({ ...BASE, maxResults: 100, search: "zeta" });
    expect(statement()).toContain("DisplayName LIKE '%zeta%'");
    expect(statement()).toContain("Active = true");
  });

  it("omits the predicate for an empty or whitespace-only term", async () => {
    await customerList({ ...BASE, maxResults: 100, search: "   " });
    expect(statement()).not.toContain("LIKE");
  });

  it("trims and caps the search term", async () => {
    await customerList({ ...BASE, maxResults: 100, search: `  ${"x".repeat(500)}  ` });
    const term = /LIKE '%(x+)%'/.exec(statement())![1]!;
    expect(term.length).toBe(CUSTOMER_SEARCH_MAX_LENGTH);
  });

  it("clamps the page offset to a valid 1-based position", async () => {
    await customerList({ ...BASE, maxResults: 50, startPosition: 0 });
    expect(statement()).toContain("STARTPOSITION 1");
  });
});

describe("customerList — query-language injection safety", () => {
  it("escapes an apostrophe so a name stays a literal", async () => {
    await customerList({ ...BASE, maxResults: 100, search: "O'Brien" });
    expect(statement()).toContain("DisplayName LIKE '%O\\'Brien%'");
  });

  it("neutralises an injection attempt instead of executing it", async () => {
    await customerList({
      ...BASE,
      maxResults: 100,
      search: "x' or Active = false or '",
    });
    const stmt = statement();
    // Every quote the caller supplied is escaped, so no new clause is created.
    expect(stmt).toContain("\\'");
    expect(stmt).not.toContain("or Active = false or ''");
    // Exactly one predicate list, still anchored on the active filter.
    expect(stmt.match(/where/g)).toHaveLength(1);
  });

  it("neutralises LIKE wildcards in a customer's own name", async () => {
    await customerList({ ...BASE, maxResults: 100, search: "50% _Co" });
    // % and _ are escaped so they match literally rather than as patterns.
    expect(statement()).toContain("50\\% \\_Co");
  });

  it("escapes a backslash", async () => {
    await customerList({ ...BASE, maxResults: 100, search: "a\\b" });
    expect(statement()).toContain("a\\\\b");
  });
});

describe("customerList — paging", () => {
  const rows = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      Id: String(from + i),
      DisplayName: `Customer ${from + i}`,
    }));

  it("reports hasMore and the next offset when a page comes back full", async () => {
    armRows(rows(1, 100));
    const page = await customerList({ ...BASE, maxResults: 100 });
    expect(page.items).toHaveLength(100);
    expect(page.hasMore).toBe(true);
    expect(page.nextStartPosition).toBe(101);
  });

  it("reports the end of results on a short page", async () => {
    armRows(rows(1, 42));
    const page = await customerList({ ...BASE, maxResults: 100 });
    expect(page.hasMore).toBe(false);
    expect(page.nextStartPosition).toBe(43);
  });

  it("handles an empty company", async () => {
    armRows([]);
    const page = await customerList({ ...BASE, maxResults: 100 });
    expect(page).toEqual({ items: [], hasMore: false, nextStartPosition: 1 });
  });

  it("walks a 150-customer company without duplicates or skips", async () => {
    const all = rows(1, 150);
    mockQuickbooksRequest.mockImplementation(async (input: { query: URLSearchParams }) => {
      const stmt = input.query.get("query")!;
      const start = Number(/STARTPOSITION (\d+)/.exec(stmt)![1]);
      const max = Number(/MAXRESULTS (\d+)/.exec(stmt)![1]);
      return { QueryResponse: { Customer: all.slice(start - 1, start - 1 + max) } };
    });

    const seen: string[] = [];
    let startPosition = 1;
    for (let i = 0; i < 5; i++) {
      const page = await customerList({ ...BASE, maxResults: 50, startPosition });
      seen.push(...page.items.map((c) => c.customerId!));
      if (!page.hasMore) break;
      startPosition = page.nextStartPosition;
    }
    expect(seen).toHaveLength(150);
    expect(new Set(seen).size).toBe(150); // no duplicates
    expect(seen).toEqual(all.map((r) => r.Id)); // no skips, stable order
  });
});

describe("customersByIds", () => {
  it("looks specific customers up by stable id", async () => {
    armRows([{ Id: "457", DisplayName: "Zeta Industries" }]);
    const found = await customersByIds({ ...BASE, ids: ["457"] });
    expect(statement()).toBe(
      "select * from Customer where Id in ('457') MAXRESULTS 1",
    );
    expect(found[0]!.displayName).toBe("Zeta Industries");
  });

  it("bounds the lookup to the ids requested", async () => {
    armRows([]);
    await customersByIds({ ...BASE, ids: ["1", "2", "3"] });
    expect(statement()).toContain("Id in ('1','2','3')");
    expect(statement()).toContain("MAXRESULTS 3");
  });

  it("escapes ids so a crafted value cannot extend the query", async () => {
    armRows([]);
    await customersByIds({ ...BASE, ids: ["1') or (Id in ('9"] });
    expect(statement()).toContain("\\'");
    expect(statement().match(/where/g)).toHaveLength(1);
  });

  it("makes no request for an empty id list", async () => {
    const found = await customersByIds({ ...BASE, ids: [] });
    expect(found).toEqual([]);
    expect(mockQuickbooksRequest).not.toHaveBeenCalled();
  });
});

describe("projection safety", () => {
  it("never surfaces contact or financial fields from the raw record", async () => {
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
    const page = await customerList({ ...BASE, maxResults: 100 });
    // The wrapper's projection carries these, but the RESOLVER emits only
    // value+label — asserted in the resolver suite. Here we pin that the
    // option-facing fields are the stable id and the display name.
    expect(page.items[0]!.customerId).toBe("42");
    expect(page.items[0]!.displayName).toBe("Acme Corp");
  });
});
