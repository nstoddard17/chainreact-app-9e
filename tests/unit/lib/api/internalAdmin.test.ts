/**
 * @jest-environment node
 *
 * Tests for lib/api/internalAdmin.ts (internal-admin nav gate client).
 *
 * Business rule: caller-only status fetch that FAILS CLOSED — returns true only
 * on a 200 body with `isInternalAdmin === true`; every other outcome (non-2xx,
 * missing/false field, thrown network error) resolves to false so the link hides.
 */

import { fetchIsInternalAdmin } from "@/lib/api/internalAdmin";

afterEach(() => {
  (global.fetch as unknown) = undefined;
});

function mockFetch(impl: () => Promise<unknown>) {
  global.fetch = jest.fn(impl) as unknown as typeof fetch;
}

describe("fetchIsInternalAdmin", () => {
  it("returns true on 200 { isInternalAdmin:true }", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ isInternalAdmin: true }) }));
    await expect(fetchIsInternalAdmin()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/internal/admin-status",
      { headers: { accept: "application/json" } },
    );
  });

  it("returns false on 200 { isInternalAdmin:false }", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ isInternalAdmin: false }) }));
    await expect(fetchIsInternalAdmin()).resolves.toBe(false);
  });

  it("returns false when the field is missing or non-boolean-true (never trusts a truthy value)", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ isInternalAdmin: "true" }) }));
    await expect(fetchIsInternalAdmin()).resolves.toBe(false);
  });

  it("returns false on a non-2xx response (e.g. 401)", async () => {
    mockFetch(async () => ({ ok: false, status: 401, json: async () => ({ isInternalAdmin: false }) }));
    await expect(fetchIsInternalAdmin()).resolves.toBe(false);
  });

  it("returns false when fetch throws (fail closed)", async () => {
    mockFetch(async () => { throw new Error("network down"); });
    await expect(fetchIsInternalAdmin()).resolves.toBe(false);
  });
});
