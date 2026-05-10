/**
 * @jest-environment node
 *
 * Consolidated tests for the per-subscriber Mailchimp action handlers
 * (update_subscriber, remove_subscriber, add_tag, remove_tag,
 * get_subscriber) — Slice 14 Commit 3. Each handler is shorter than
 * addSubscriber so co-locating in one file keeps the test layout
 * proportional to handler complexity.
 *
 * Verifies, per handler:
 *   - Schema strict shape (rejects unknown fields, requires email).
 *   - resolveDc → refreshAndRetry → wrapper threading.
 *   - Wrapper call arguments match the schema's intent.
 *   - Output shape stable.
 *
 * Specifically calls out:
 *   - remove_subscriber Q11 — `mode` REQUIRED (no default) per
 *     destructive-action gate.
 *   - update_subscriber `status` is OPTIONAL (unlike add_subscriber).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMemberPatch = jest.fn();
const mockMemberArchive = jest.fn();
const mockMemberDeletePermanent = jest.fn();
const mockMemberSetTags = jest.fn();
const mockMemberGet = jest.fn();
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
  memberSetTags: (...a: unknown[]) => mockMemberSetTags(...a),
  memberGet: (...a: unknown[]) => mockMemberGet(...a),
}));

jest.mock("@/integrations/mailchimp/actions/_resolveDc", () => ({
  resolveDc: (...a: unknown[]) => mockResolveDc(...a),
}));

import { updateSubscriber } from "@/integrations/mailchimp/actions/updateSubscriber";
import { removeSubscriber } from "@/integrations/mailchimp/actions/removeSubscriber";
import { RemoveSubscriberConfigSchema } from "@/integrations/mailchimp/actions/removeSubscriber.schema";
import { UpdateSubscriberConfigSchema } from "@/integrations/mailchimp/actions/updateSubscriber.schema";
import { addTag } from "@/integrations/mailchimp/actions/addTag";
import { AddTagConfigSchema } from "@/integrations/mailchimp/actions/addTag.schema";
import { removeTag } from "@/integrations/mailchimp/actions/removeTag";
import { RemoveTagConfigSchema } from "@/integrations/mailchimp/actions/removeTag.schema";
import { getSubscriber } from "@/integrations/mailchimp/actions/getSubscriber";
import { GetSubscriberConfigSchema } from "@/integrations/mailchimp/actions/getSubscriber.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMemberPatch.mockReset();
  mockMemberArchive.mockReset();
  mockMemberDeletePermanent.mockReset();
  mockMemberSetTags.mockReset();
  mockMemberGet.mockReset();
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
    accountId: "mc_account_xyz",
    payload: {},
  };
}

function makeInput(config: Record<string, unknown>) {
  return {
    workflowId: "w1",
    userId: "u1",
    runId: "r1",
    nodeId: "n1",
    config,
    triggerEvent: trigger(),
  };
}

// ─── update_subscriber ──────────────────────────────────────────────────────

describe("update_subscriber", () => {
  beforeEach(() => {
    mockMemberPatch.mockResolvedValue({
      id: "abc",
      email_address: "x@y.com",
      status: "subscribed",
      list_id: "list_1",
      last_changed: "2026-01-01T00:00:00+00:00",
    });
  });

  it("schema accepts config without status (PATCH allows partial updates)", () => {
    expect(() =>
      UpdateSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        first_name: "Urist",
      }),
    ).not.toThrow();
  });

  it("schema rejects unknown fields (strict)", () => {
    expect(() =>
      UpdateSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        unknown_field: "x",
      }),
    ).toThrow();
  });

  it("PATCHes via memberPatch with status threaded when supplied", async () => {
    await updateSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        status: "unsubscribed",
      }),
    );
    expect(mockMemberPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        email: "x@y.com",
        status: "unsubscribed",
      }),
    );
  });

  it("supports email-change via new_email field", async () => {
    await updateSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "old@y.com",
        new_email: "new@y.com",
      }),
    );
    expect(mockMemberPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "old@y.com",
        newEmail: "new@y.com",
      }),
    );
  });

  it("returns stable output shape", async () => {
    const result = await updateSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        first_name: "Urist",
      }),
    );
    expect(result.output).toEqual({
      subscriberId: "abc",
      email: "x@y.com",
      status: "subscribed",
      listId: "list_1",
      lastChanged: "2026-01-01T00:00:00+00:00",
    });
  });
});

// ─── remove_subscriber (Q11 hot spot #2) ────────────────────────────────────

describe("remove_subscriber — Q11 destructive-action gate", () => {
  it("schema REJECTS config without mode (Q11 — explicit choice)", () => {
    expect(() =>
      RemoveSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        // mode omitted
      }),
    ).toThrow(/mode/);
  });

  it("schema rejects modes outside the enum", () => {
    expect(() =>
      RemoveSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        mode: "delete",
      }),
    ).toThrow();
  });

  it("schema accepts 'archive' and 'delete_permanent'", () => {
    for (const mode of ["archive", "delete_permanent"]) {
      expect(() =>
        RemoveSubscriberConfigSchema.parse({
          audience_id: "list_1",
          email: "x@y.com",
          mode,
        }),
      ).not.toThrow();
    }
  });

  it("mode=archive routes to memberArchive (reversible)", async () => {
    await removeSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        mode: "archive",
      }),
    );
    expect(mockMemberArchive).toHaveBeenCalled();
    expect(mockMemberDeletePermanent).not.toHaveBeenCalled();
  });

  it("mode=delete_permanent routes to memberDeletePermanent (irreversible)", async () => {
    await removeSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        mode: "delete_permanent",
      }),
    );
    expect(mockMemberDeletePermanent).toHaveBeenCalled();
    expect(mockMemberArchive).not.toHaveBeenCalled();
  });

  it("output.permanent=true only when mode=delete_permanent", async () => {
    const archived = await removeSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        mode: "archive",
      }),
    );
    expect(archived.output.permanent).toBe(false);

    const deleted = await removeSubscriber(
      makeInput({
        audience_id: "list_1",
        email: "y@z.com",
        mode: "delete_permanent",
      }),
    );
    expect(deleted.output.permanent).toBe(true);
  });
});

// ─── add_tag / remove_tag (same endpoint, different status) ─────────────────

describe("add_tag and remove_tag", () => {
  it("add_tag schema requires at least one tag", () => {
    expect(() =>
      AddTagConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        tags: [],
      }),
    ).toThrow();
  });

  it("add_tag calls memberSetTags with status='active' for each tag", async () => {
    await addTag(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        tags: ["vip", "newsletter"],
      }),
    );
    expect(mockMemberSetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [
          { name: "vip", status: "active" },
          { name: "newsletter", status: "active" },
        ],
      }),
    );
  });

  it("remove_tag schema requires at least one tag", () => {
    expect(() =>
      RemoveTagConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        tags: [],
      }),
    ).toThrow();
  });

  it("remove_tag calls memberSetTags with status='inactive' for each tag", async () => {
    await removeTag(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        tags: ["old_promo"],
      }),
    );
    expect(mockMemberSetTags).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [{ name: "old_promo", status: "inactive" }],
      }),
    );
  });

  it("add_tag output shape stable", async () => {
    const result = await addTag(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        tags: ["vip"],
      }),
    );
    expect(result.output.email).toBe("x@y.com");
    expect(result.output.audienceId).toBe("list_1");
    expect(result.output.addedTags).toEqual(["vip"]);
    expect(typeof result.output.addedAt).toBe("string");
  });

  it("remove_tag output shape stable", async () => {
    const result = await removeTag(
      makeInput({
        audience_id: "list_1",
        email: "x@y.com",
        tags: ["old_promo"],
      }),
    );
    expect(result.output.removedTags).toEqual(["old_promo"]);
    expect(typeof result.output.removedAt).toBe("string");
  });
});

// ─── get_subscriber ─────────────────────────────────────────────────────────

describe("get_subscriber", () => {
  beforeEach(() => {
    mockMemberGet.mockResolvedValue({
      id: "abc",
      email_address: "x@y.com",
      status: "subscribed",
      list_id: "list_1",
      merge_fields: { FNAME: "Urist" },
      tags: [{ id: 1, name: "vip" }],
      last_changed: "2026-01-01T00:00:00+00:00",
    });
  });

  it("schema strict + email required", () => {
    expect(() =>
      GetSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
      }),
    ).not.toThrow();
    expect(() =>
      GetSubscriberConfigSchema.parse({
        audience_id: "list_1",
        email: "x@y.com",
        extra: 1,
      }),
    ).toThrow();
  });

  it("calls memberGet with the right inputs", async () => {
    await getSubscriber(
      makeInput({ audience_id: "list_1", email: "x@y.com" }),
    );
    expect(mockMemberGet).toHaveBeenCalledWith(
      expect.objectContaining({
        dc: "us21",
        audienceId: "list_1",
        email: "x@y.com",
      }),
    );
  });

  it("returns subscriber data with mergeFields and tags flattened", async () => {
    const result = await getSubscriber(
      makeInput({ audience_id: "list_1", email: "x@y.com" }),
    );
    expect(result.output).toEqual({
      subscriberId: "abc",
      email: "x@y.com",
      status: "subscribed",
      listId: "list_1",
      mergeFields: { FNAME: "Urist" },
      tags: ["vip"],
      lastChanged: "2026-01-01T00:00:00+00:00",
    });
  });
});
