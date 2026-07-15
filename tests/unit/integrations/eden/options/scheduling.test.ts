/**
 * @jest-environment node
 *
 * Eden scheduling option sources (EDEN-6): schedules, scheduled_posts, drafts. Mocks the read
 * wrappers + token decryption. Proves id/label mapping, empty results, q-filtering, personal-
 * credential gating (no integration → disconnected), sanitized errors, and NO content/handle leak.
 */
const mockListSchedules = jest.fn();
const mockListScheduledPosts = jest.fn();
jest.mock("@/integrations/_shared/eden/api/schedules", () => ({
  listSchedules: (...a: unknown[]) => mockListSchedules(...a),
  listScheduledPosts: (...a: unknown[]) => mockListScheduledPosts(...a),
}));
jest.mock("@/core/encryption/tokens", () => ({ decryptToken: () => "decrypted-token" }));

import {
  edenSchedulesResolver,
  edenScheduledPostsResolver,
  edenDraftPostsResolver,
} from "@/integrations/eden/options/scheduling";
import { InsufficientScopeError } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError } from "@/services/options/types";

const ctx = (q = "") => ({ userId: "u", integration: { accessTokenEncrypted: "enc" } as never, q, deps: {} });
beforeEach(() => jest.clearAllMocks());

describe("eden:schedules", () => {
  it("maps schedules to sorted {value,label} with timezone description", async () => {
    mockListSchedules.mockResolvedValue({
      schedules: [
        { id: "s2", name: "Zeta set", timezone: "America/New_York" },
        { id: "s1", name: "Alpha set", timezone: "UTC" },
      ],
      workspaceId: "w1",
    });
    const res = await edenSchedulesResolver.resolve(ctx());
    expect(res.items).toEqual([
      { value: "s1", label: "Alpha set", description: "UTC" },
      { value: "s2", label: "Zeta set", description: "America/New_York" },
    ]);
    expect(res.hasMore).toBe(false);
    expect(JSON.stringify(res.items)).not.toContain("decrypted-token");
  });
  it("returns empty items on an empty account (no schedules configured)", async () => {
    mockListSchedules.mockResolvedValue({ schedules: [], workspaceId: "w1" });
    const res = await edenSchedulesResolver.resolve(ctx());
    expect(res.items).toEqual([]);
  });
  it("read-only token → sanitized INTEGRATION_DISCONNECTED", async () => {
    mockListSchedules.mockRejectedValue(new InsufficientScopeError("read-only", "eden"));
    const err = await edenSchedulesResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
  });
  it("no integration → disconnected, wrapper not called", async () => {
    const err = await edenSchedulesResolver.resolve({ ...ctx(), integration: null }).catch((e) => e);
    expect(err.code).toBe("INTEGRATION_DISCONNECTED");
    expect(mockListSchedules).not.toHaveBeenCalled();
  });
});

describe("eden:scheduled_posts + eden:draft_posts", () => {
  it("labels a post by status + time only — never its content", async () => {
    mockListScheduledPosts.mockResolvedValue({
      posts: [{ id: "p1", status: "scheduled", scheduledFor: 1_900_000_000_000 }],
      count: 1,
      mode: "compact",
    });
    const res = await edenScheduledPostsResolver.resolve(ctx());
    expect(res.items[0]!.value).toBe("p1");
    expect(res.items[0]!.label).toContain("scheduled");
    // no post body could leak — label is status + time
    expect(res.items[0]!.label).not.toMatch(/secret|body|content/i);
  });
  it("draft resolver filters status=draft at the provider", async () => {
    mockListScheduledPosts.mockResolvedValue({ posts: [{ id: "d1", status: "draft", scheduledFor: null }], count: 1, mode: "compact" });
    await edenDraftPostsResolver.resolve(ctx());
    const arg = mockListScheduledPosts.mock.calls[0]![0] as { status?: string };
    expect(arg.status).toBe("draft");
  });
  it("empty queue → empty items", async () => {
    mockListScheduledPosts.mockResolvedValue({ posts: [], count: 0, mode: "compact" });
    expect((await edenScheduledPostsResolver.resolve(ctx())).items).toEqual([]);
  });
  it("q filters the label", async () => {
    mockListScheduledPosts.mockResolvedValue({
      posts: [
        { id: "p1", status: "scheduled", scheduledFor: 1_900_000_000_000 },
        { id: "p2", status: "draft", scheduledFor: null },
      ],
      count: 2,
      mode: "compact",
    });
    const res = await edenScheduledPostsResolver.resolve(ctx("draft"));
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.value).toBe("p2");
  });
});
