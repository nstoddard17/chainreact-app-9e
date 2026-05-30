/**
 * @jest-environment node
 *
 * Tests for the Mailchimp 2.1 Commit 2 `unsubscribe_subscriber` action.
 *
 * Verifies:
 *   - Strict schema. listId + emailAddress required; both non-empty;
 *     emailAddress must be a valid email; unknown fields rejected.
 *   - V1 M-R3 dead flags REJECTED at parse: `sendGoodbye`,
 *     `sendNotification`, `reason`. None ride through to the wrapper.
 *   - resolveDc → refreshAndRetry → memberPatch threading.
 *   - PATCH body always carries `status: 'unsubscribed'` (state-change
 *     semantic; NOT delete/archive).
 *   - Subscriber-hash derivation surfaces in the output (md5 of
 *     lowercased email).
 *   - Bounded output — no raw Mailchimp body spread.
 *   - `unsubscribed: true` derived from `status === 'unsubscribed'`.
 *   - Zod parse rejects BEFORE resolveDc / wrapper call.
 *   - MissingDataCenterError + wrapper errors propagate.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMemberPatch = jest.fn();
const mockMemberArchive = jest.fn();
const mockMemberDeletePermanent = jest.fn();
const mockResolveDc = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/mailchimp/api/members", () => ({
  memberPatch: (...a: unknown[]) => mockMemberPatch(...a),
  memberArchive: (...a: unknown[]) => mockMemberArchive(...a),
  memberDeletePermanent: (...a: unknown[]) => mockMemberDeletePermanent(...a),
}));

jest.mock("@/integrations/mailchimp/actions/_resolveDc", () => ({
  resolveDc: (...a: unknown[]) => mockResolveDc(...a),
}));

import { unsubscribeSubscriber } from "@/integrations/mailchimp/actions/unsubscribeSubscriber";
import { UnsubscribeSubscriberConfigSchema } from "@/integrations/mailchimp/actions/unsubscribeSubscriber.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMemberPatch.mockReset();
  mockMemberArchive.mockReset();
  mockMemberDeletePermanent.mockReset();
  mockResolveDc.mockReset();
  mockResolveDc.mockResolvedValue({ dc: "us21", accountId: "mc_account_xyz" });
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "mailchimp",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: "mc_account_xyz",
    payload: {},
  };
}

function makeInput(config: Record<string, unknown>) {
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

// Pre-computed: md5(lowercase("urist@mcvankab.com")) hex.
const HASH_URIST = "41c00e62476865ba72254cdc5b2c191e";

// ─── Schema ─────────────────────────────────────────────────────────────────

describe("unsubscribe_subscriber — schema", () => {
  it("accepts minimal valid config (listId + emailAddress)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "x@y.com",
      }),
    ).not.toThrow();
  });

  it("rejects missing listId", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        emailAddress: "x@y.com",
      }),
    ).toThrow(/listId/);
  });

  it("rejects empty listId", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "",
        emailAddress: "x@y.com",
      }),
    ).toThrow();
  });

  it("rejects missing emailAddress (subscriber identity required)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
      }),
    ).toThrow(/emailAddress/);
  });

  it("rejects empty emailAddress", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "",
      }),
    ).toThrow();
  });

  it("rejects malformed emailAddress", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "not-an-email",
      }),
    ).toThrow();
  });

  // ─── M-R3 dead-flag rejection (anti-tests) ────────────────────────────────

  it("REJECTS V1 M-R3 sendGoodbye flag (dead in V1; not ported)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "x@y.com",
        sendGoodbye: true,
      }),
    ).toThrow();
  });

  it("REJECTS V1 M-R3 sendNotification flag (dead in V1; not ported)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "x@y.com",
        sendNotification: true,
      }),
    ).toThrow();
  });

  it("REJECTS V1's reason field (no hidden /notes side effect — compose add_note explicitly)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "x@y.com",
        reason: "Was too noisy",
      }),
    ).toThrow();
  });

  it("rejects arbitrary unknown fields (strict)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        emailAddress: "x@y.com",
        zzz_extra: "anything",
      }),
    ).toThrow();
  });

  // ─── Subscriber identity: emailAddress only (V2 convention) ──────────────

  it("does NOT accept subscriberHash as top-level config (V2 derives hash internally)", () => {
    expect(() =>
      UnsubscribeSubscriberConfigSchema.parse({
        listId: "list_1",
        subscriberHash: HASH_URIST,
      }),
    ).toThrow();
  });
});

// ─── Handler ────────────────────────────────────────────────────────────────

describe("unsubscribe_subscriber — handler", () => {
  beforeEach(() => {
    mockMemberPatch.mockResolvedValue({
      id: HASH_URIST,
      email_address: "urist@mcvankab.com",
      status: "unsubscribed",
      list_id: "list_1",
      last_changed: "2026-01-02T00:00:00+00:00",
    });
  });

  it("PATCHes with status: 'unsubscribed' (state-change, NOT delete/archive)", async () => {
    await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        emailAddress: "urist@mcvankab.com",
      }),
    );
    expect(mockMemberPatch).toHaveBeenCalledWith({
      accessToken: "tok",
      dc: "us21",
      audienceId: "list_1",
      email: "urist@mcvankab.com",
      status: "unsubscribed",
    });
    // Anti-tests: confirm we did NOT route to delete or archive.
    expect(mockMemberArchive).not.toHaveBeenCalled();
    expect(mockMemberDeletePermanent).not.toHaveBeenCalled();
  });

  it("does NOT pass any V1 dead flags through to the wrapper", async () => {
    await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        emailAddress: "urist@mcvankab.com",
      }),
    );
    const call = mockMemberPatch.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("sendGoodbye");
    expect(call).not.toHaveProperty("sendNotification");
    expect(call).not.toHaveProperty("reason");
    // Only the documented wrapper fields:
    expect(Object.keys(call).sort()).toEqual(
      ["accessToken", "audienceId", "dc", "email", "status"].sort(),
    );
  });

  it("threads refreshAndRetry exactly once (single state-change, no extra /notes call)", async () => {
    await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        emailAddress: "urist@mcvankab.com",
      }),
    );
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockMemberPatch).toHaveBeenCalledTimes(1);
  });

  it("returns bounded output with subscriberHash derived from lowercased email", async () => {
    const result = await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        // Mixed-case input — hash derivation must lowercase first.
        emailAddress: "Urist@McVankab.COM",
      }),
    );
    expect(result.output).toEqual({
      listId: "list_1",
      subscriberHash: HASH_URIST,
      emailAddress: "urist@mcvankab.com",
      status: "unsubscribed",
      unsubscribed: true,
      lastChanged: "2026-01-02T00:00:00+00:00",
      success: true,
    });
  });

  it("no raw Mailchimp body spread (extras absent from output)", async () => {
    mockMemberPatch.mockResolvedValueOnce({
      id: HASH_URIST,
      email_address: "urist@mcvankab.com",
      status: "unsubscribed",
      list_id: "list_1",
      last_changed: "2026-01-02T00:00:00+00:00",
      // Wire surface extras that MUST NOT leak through:
      unique_email_id: "ueid1",
      merge_fields: { FNAME: "Urist" },
      stats: { avg_open_rate: 0.5 },
      ip_signup: "192.0.2.10",
    });
    const result = await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        emailAddress: "urist@mcvankab.com",
      }),
    );
    expect(result.output).not.toHaveProperty("unique_email_id");
    expect(result.output).not.toHaveProperty("merge_fields");
    expect(result.output).not.toHaveProperty("stats");
    expect(result.output).not.toHaveProperty("ip_signup");
    // Output only contains the documented bounded fields.
    expect(Object.keys(result.output).sort()).toEqual(
      [
        "emailAddress",
        "lastChanged",
        "listId",
        "status",
        "subscriberHash",
        "success",
        "unsubscribed",
      ].sort(),
    );
  });

  it("unsubscribed flag is false if Mailchimp returns a different status (defensive)", async () => {
    mockMemberPatch.mockResolvedValueOnce({
      id: HASH_URIST,
      email_address: "urist@mcvankab.com",
      // Hypothetical: Mailchimp didn't honor the PATCH (e.g. already in
      // some other state). We still return a successful result but
      // surface the actual status; unsubscribed flag reflects truth.
      status: "cleaned",
      list_id: "list_1",
    });
    const result = await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        emailAddress: "urist@mcvankab.com",
      }),
    );
    expect(result.output.status).toBe("cleaned");
    expect(result.output.unsubscribed).toBe(false);
  });

  it("lastChanged is null when wrapper omits it", async () => {
    mockMemberPatch.mockResolvedValueOnce({
      id: HASH_URIST,
      email_address: "urist@mcvankab.com",
      status: "unsubscribed",
      list_id: "list_1",
      // last_changed omitted.
    });
    const result = await unsubscribeSubscriber(
      makeInput({
        listId: "list_1",
        emailAddress: "urist@mcvankab.com",
      }),
    );
    expect(result.output.lastChanged).toBeNull();
  });

  // ─── Zod parse short-circuits ─────────────────────────────────────────────

  it("Zod parse rejects sendGoodbye BEFORE resolveDc / wrapper call", async () => {
    await expect(
      unsubscribeSubscriber(
        makeInput({
          listId: "list_1",
          emailAddress: "x@y.com",
          sendGoodbye: true,
        }),
      ),
    ).rejects.toThrow();
    expect(mockResolveDc).not.toHaveBeenCalled();
    expect(mockMemberPatch).not.toHaveBeenCalled();
  });

  it("Zod parse rejects reason BEFORE resolveDc / wrapper call", async () => {
    await expect(
      unsubscribeSubscriber(
        makeInput({
          listId: "list_1",
          emailAddress: "x@y.com",
          reason: "noisy",
        }),
      ),
    ).rejects.toThrow();
    expect(mockResolveDc).not.toHaveBeenCalled();
    expect(mockMemberPatch).not.toHaveBeenCalled();
  });

  it("Zod parse rejects missing listId BEFORE resolveDc / wrapper call", async () => {
    await expect(
      unsubscribeSubscriber(makeInput({ emailAddress: "x@y.com" })),
    ).rejects.toThrow();
    expect(mockResolveDc).not.toHaveBeenCalled();
    expect(mockMemberPatch).not.toHaveBeenCalled();
  });

  // ─── Error propagation ────────────────────────────────────────────────────

  it("propagates MissingDataCenterError from resolveDc", async () => {
    mockResolveDc.mockRejectedValueOnce(new Error("MissingDataCenterError"));
    await expect(
      unsubscribeSubscriber(
        makeInput({ listId: "list_1", emailAddress: "x@y.com" }),
      ),
    ).rejects.toThrow(/MissingDataCenterError/);
    expect(mockMemberPatch).not.toHaveBeenCalled();
  });

  it("propagates NotFoundError from wrapper (subscriber missing — no mixed-success payload)", async () => {
    mockMemberPatch.mockRejectedValueOnce(
      new Error("NotFoundError: subscriber x@y.com"),
    );
    await expect(
      unsubscribeSubscriber(
        makeInput({ listId: "list_1", emailAddress: "x@y.com" }),
      ),
    ).rejects.toThrow(/NotFoundError/);
  });

  it("propagates 5xx wrapper errors", async () => {
    mockMemberPatch.mockRejectedValueOnce(new Error("Mailchimp API 503"));
    await expect(
      unsubscribeSubscriber(
        makeInput({ listId: "list_1", emailAddress: "x@y.com" }),
      ),
    ).rejects.toThrow(/503/);
  });
});
