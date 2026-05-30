/**
 * @jest-environment node
 *
 * Tests for `add_subscriber` action handler — Slice 14 Commit 3
 * Q11 hot spot. Verifies:
 *   - Schema requires explicit `status` (Q11 — no default).
 *   - Strict schema rejects unknown fields.
 *   - dc + accountId resolved before any wrapper call.
 *   - refreshAndRetry pinned to the resolved accountId.
 *   - Wrapper called with email, audienceId, status, mergeFields,
 *     tags as expected.
 *   - ADDRESS nested object when `address` present; flat tags
 *     otherwise.
 *   - CSV tags split + trimmed + empties dropped.
 *   - Output shape stable.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMemberPut = jest.fn();
const mockResolveDc = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/mailchimp/api/members", () => ({
  memberPut: (...a: unknown[]) => mockMemberPut(...a),
}));

jest.mock("@/integrations/mailchimp/actions/_resolveDc", () => ({
  resolveDc: (...a: unknown[]) => mockResolveDc(...a),
}));

import { addSubscriber } from "@/integrations/mailchimp/actions/addSubscriber";
import { AddSubscriberConfigSchema } from "@/integrations/mailchimp/actions/addSubscriber.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMemberPut.mockReset();
  mockResolveDc.mockReset();
  mockResolveDc.mockResolvedValue({ dc: "us21", accountId: "mc_account_xyz" });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockMemberPut.mockResolvedValue({
    id: "abc",
    email_address: "x@y.com",
    status: "pending",
    list_id: "list_1",
    timestamp_opt: "2026-01-01T00:00:00+00:00",
    tags: [{ id: 1, name: "vip" }],
  });
});

function trigger(provider = "mailchimp"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: "mc_account_xyz",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return {
    workflowId: "w1",
    userId: "u1",
    accountId: "acct-u1",
    runId: "r1",
    nodeId: "n1",
    config,
    triggerEvent: trigger(),
  };
}

// ─── Q11 schema enforcement ─────────────────────────────────────────────────

describe("AddSubscriberConfigSchema — Q11 enforcement", () => {
  it("REJECTS config without status (Q11 — explicit choice required)", () => {
    expect(() =>
      AddSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        // status omitted
      }),
    ).toThrow(/status/i);
  });

  it("does NOT silently default status to 'subscribed' or anything else", () => {
    // Anti-test: V2 fixes V1's silent-default behavior. Workflow
    // author must explicitly pick 'subscribed' (with prior consent)
    // or 'pending' (double-opt-in) based on their compliance posture.
    const parsed = AddSubscriberConfigSchema.parse({
      audience_id: "list_1",
      email: "x@y.com",
      status: "pending",
    });
    expect(parsed.status).toBe("pending");
  });

  it("accepts all five Mailchimp status values", () => {
    for (const status of [
      "subscribed",
      "pending",
      "unsubscribed",
      "cleaned",
      "transactional",
    ] as const) {
      expect(() =>
        AddSubscriberConfigSchema.parse({
          audience_id: "list_1",
          email: "x@y.com",
          status,
        }),
      ).not.toThrow();
    }
  });

  it("rejects status outside the enum", () => {
    expect(() =>
      AddSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        status: "active",
      }),
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      AddSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "not-an-email",
        status: "subscribed",
      }),
    ).toThrow();
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      AddSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
        unknown_field: "oops",
      }),
    ).toThrow();
  });
});

// ─── Handler flow ───────────────────────────────────────────────────────────

describe("addSubscriber — handler flow", () => {
  it("resolves dc + accountId before any wrapper call", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "pending",
      }),
    );
    expect(mockResolveDc).toHaveBeenCalledWith({
      userId: "u1",
      triggerEvent: expect.objectContaining({ provider: "mailchimp" }),
    });
    // Resolve must precede wrapper invocation.
    const resolveOrder = mockResolveDc.mock.invocationCallOrder[0]!;
    const wrapOrder = mockMemberPut.mock.invocationCallOrder[0]!;
    expect(resolveOrder).toBeLessThan(wrapOrder);
  });

  it("pins refreshAndRetry to the resolved accountId", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
      }),
    );
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        provider: "mailchimp",
        accountId: "mc_account_xyz",
      }),
    );
  });

  it("threads dc into the memberPut call", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
      }),
    );
    expect(mockMemberPut).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        email: "x@y.com",
        status: "subscribed",
      }),
    );
  });

  it("builds nested ADDRESS merge field when address is present", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
        address: "123 Main St",
        city: "SF",
        state: "CA",
        zip: "94102",
        country: "US",
      }),
    );
    expect(mockMemberPut).toHaveBeenCalledWith(
      expect.objectContaining({
        mergeFields: {
          ADDRESS: {
            addr1: "123 Main St",
            city: "SF",
            state: "CA",
            zip: "94102",
            country: "US",
          },
        },
      }),
    );
  });

  it("uses flat CITY/STATE/ZIP/COUNTRY merge fields when address absent", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
        city: "SF",
        country: "US",
      }),
    );
    expect(mockMemberPut).toHaveBeenCalledWith(
      expect.objectContaining({
        mergeFields: { CITY: "SF", COUNTRY: "US" },
      }),
    );
  });

  it("populates FNAME / LNAME / PHONE merge fields when present", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
        first_name: "Urist",
        last_name: "McVankab",
        phone: "+1-555-1212",
      }),
    );
    expect(mockMemberPut).toHaveBeenCalledWith(
      expect.objectContaining({
        mergeFields: {
          FNAME: "Urist",
          LNAME: "McVankab",
          PHONE: "+1-555-1212",
        },
      }),
    );
  });

  it("parses CSV tags (trims, drops empties)", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
        tags: "vip, newsletter , ,customer",
      }),
    );
    expect(mockMemberPut).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["vip", "newsletter", "customer"],
      }),
    );
  });

  it("omits tags when the input CSV is empty / undefined", async () => {
    await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "subscribed",
      }),
    );
    const call = mockMemberPut.mock.calls[0]![0] as Record<string, unknown>;
    expect("tags" in call).toBe(false);
  });

  it("returns stable output shape", async () => {
    const result = await addSubscriber(
      input({
        audience_id: "list_1",
        email: "x@y.com",
        status: "pending",
      }),
    );
    expect(result.output).toEqual({
      subscriberId: "abc",
      email: "x@y.com",
      status: "pending",
      listId: "list_1",
      timestamp: "2026-01-01T00:00:00+00:00",
      tags: ["vip"],
    });
  });

  it("propagates errors from memberPut (e.g. refreshNotSupported via refreshAndRetry)", async () => {
    const err = new Error("Integration action required: refresh_not_supported");
    mockRefreshAndRetry.mockRejectedValueOnce(err);
    await expect(
      addSubscriber(
        input({
          audience_id: "list_1",
          email: "x@y.com",
          status: "subscribed",
        }),
      ),
    ).rejects.toThrow(/refresh_not_supported/);
  });
});
