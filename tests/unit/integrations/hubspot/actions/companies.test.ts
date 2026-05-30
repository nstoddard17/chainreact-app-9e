/**
 * @jest-environment node
 *
 * Tests for `create_company`, `update_company`, `get_companies` action
 * handlers. Combined in one file since their shapes mirror the contact
 * versions (already covered separately) — focus here is on
 * company-specific differences: domain-based duplicate handling,
 * `name` required at the schema layer.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCompaniesCreate = jest.fn();
const mockCompaniesUpdate = jest.fn();
const mockCompaniesSearch = jest.fn();
const mockFindCompanyByDomain = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/hubspot/api/companies", () => ({
  companiesCreate: (...a: unknown[]) => mockCompaniesCreate(...a),
  companiesUpdate: (...a: unknown[]) => mockCompaniesUpdate(...a),
  companiesSearch: (...a: unknown[]) => mockCompaniesSearch(...a),
  findCompanyByDomain: (...a: unknown[]) => mockFindCompanyByDomain(...a),
}));

import { ConflictError } from "@/integrations/_shared/hubspot/errors";
import { createCompany } from "@/integrations/hubspot/actions/createCompany";
import { updateCompany } from "@/integrations/hubspot/actions/updateCompany";
import { getCompanies } from "@/integrations/hubspot/actions/getCompanies";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCompaniesCreate.mockReset();
  mockCompaniesUpdate.mockReset();
  mockCompaniesSearch.mockReset();
  mockFindCompanyByDomain.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const trigger: TriggerEvent = {
  provider: "hubspot",
  eventType: "manual",
  eventId: "e",
  occurredAt: "x",
  providerAccountId: "9876543",
  payload: {},
};

// ─── createCompany ──────────────────────────────────────────────────────────

describe("create_company", () => {
  it("rejects missing name (V1 enforces, V2 enforces at schema)", async () => {
    await expect(
      createCompany({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { domain: "acme.com" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow();
  });

  it("POSTs companiesCreate with name + supplied optional fields", async () => {
    mockCompaniesCreate.mockResolvedValueOnce({
      id: "c-1",
      properties: { name: "Acme", domain: "acme.com" },
      createdAt: "x",
      updatedAt: "x",
    });
    await createCompany({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        name: "Acme",
        domain: "acme.com",
        industry: "Software",
      },
      triggerEvent: trigger,
    });
    expect(mockCompaniesCreate.mock.calls[0]![0]!.properties).toEqual({
      name: "Acme",
      domain: "acme.com",
      industry: "Software",
    });
  });

  it("default `fail` rethrows ConflictError without searching", async () => {
    mockCompaniesCreate.mockRejectedValueOnce(
      new ConflictError("company (create)", "{}"),
    );
    await expect(
      createCompany({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { name: "Acme", domain: "acme.com" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(ConflictError);
    expect(mockFindCompanyByDomain).not.toHaveBeenCalled();
  });

  it("`update` strategy: search-by-domain → PATCH, wasUpdate=true", async () => {
    mockCompaniesCreate.mockRejectedValueOnce(
      new ConflictError("company (create)", "{}"),
    );
    mockFindCompanyByDomain.mockResolvedValueOnce({
      id: "c-existing",
      properties: { name: "Acme Inc", domain: "acme.com" },
    });
    mockCompaniesUpdate.mockResolvedValueOnce({
      id: "c-existing",
      properties: { name: "Acme Inc", domain: "acme.com", phone: "555" },
      updatedAt: "y",
    });

    const result = await createCompany({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        name: "Acme",
        domain: "acme.com",
        phone: "555",
        duplicateHandling: "update",
      },
      triggerEvent: trigger,
    });

    expect(mockFindCompanyByDomain.mock.calls[0]![0]!.domain).toBe("acme.com");
    expect(result.output.companyId).toBe("c-existing");
    expect(result.output.wasUpdate).toBe(true);
  });

  it("`update` without domain falls through (no search target → rethrow)", async () => {
    // Workflow author chose `update` but didn't give us a domain to
    // search on — there's no deterministic recovery target, so we
    // re-throw the original conflict (matches the V2 plan).
    mockCompaniesCreate.mockRejectedValueOnce(
      new ConflictError("company (create)", "{}"),
    );
    await expect(
      createCompany({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          name: "Acme",
          duplicateHandling: "update",
        },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(ConflictError);
    expect(mockFindCompanyByDomain).not.toHaveBeenCalled();
  });

  it("`skip` strategy: search-by-domain → return existing, no PATCH", async () => {
    mockCompaniesCreate.mockRejectedValueOnce(
      new ConflictError("company (create)", "{}"),
    );
    mockFindCompanyByDomain.mockResolvedValueOnce({
      id: "c-existing",
      properties: { name: "Old Name", domain: "acme.com" },
    });

    const result = await createCompany({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        name: "Acme",
        domain: "acme.com",
        duplicateHandling: "skip",
      },
      triggerEvent: trigger,
    });

    expect(mockCompaniesUpdate).not.toHaveBeenCalled();
    expect(result.output.wasSkip).toBe(true);
    expect(result.output.name).toBe("Old Name");
  });
});

// ─── updateCompany ──────────────────────────────────────────────────────────

describe("update_company", () => {
  it("PATCHes companiesUpdate with supplied fields only", async () => {
    mockCompaniesUpdate.mockResolvedValueOnce({
      id: "c-1",
      properties: { name: "Acme" },
      updatedAt: "y",
    });
    await updateCompany({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { companyId: "c-1", phone: "555" },
      triggerEvent: trigger,
    });
    expect(mockCompaniesUpdate.mock.calls[0]![0]!).toMatchObject({
      companyId: "c-1",
      properties: { phone: "555" },
    });
    // city not in config → not in the wire payload.
    expect(
      mockCompaniesUpdate.mock.calls[0]![0]!.properties.city,
    ).toBeUndefined();
  });

  it("throws when no property fields are provided", async () => {
    await expect(
      updateCompany({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { companyId: "c-1" },
        triggerEvent: trigger,
      }),
    ).rejects.toThrow(/at least one property/);
  });
});

// ─── getCompanies ───────────────────────────────────────────────────────────

describe("get_companies", () => {
  it("uses default properties (name, domain, city, state, country, industry)", async () => {
    mockCompaniesSearch.mockResolvedValueOnce({ total: 0, results: [] });
    await getCompanies({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(mockCompaniesSearch.mock.calls[0]![0]!.properties).toEqual([
      "name",
      "domain",
      "city",
      "state",
      "country",
      "industry",
    ]);
  });

  it("returns companies + paging shape", async () => {
    mockCompaniesSearch.mockResolvedValueOnce({
      total: 5,
      results: [{ id: "c1", properties: {} }],
      paging: { next: { after: "cur" } },
    });
    const r = await getCompanies({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger,
    });
    expect(r.output.companies).toHaveLength(1);
    expect(r.output.total).toBe(5);
    expect(r.output.nextCursor).toBe("cur");
    expect(r.output.hasMore).toBe(true);
  });
});
