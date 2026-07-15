/**
 * @jest-environment node
 *
 * Eden Batch-3 scheduling action handlers + schemas (EDEN-6). Mocks the scheduling adapter +
 * refreshAndRetry. Proves token seam (eden/null), bounded outputs, stable idempotency key
 * generation, no-leak, and every schema guard (required fields, platform/media combos, past time,
 * first-comment exclusivity, update at-least-one).
 */
const mockRefreshAndRetry = jest.fn(async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("tok"));
jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (a: unknown) => mockRefreshAndRetry(a as { apiCall: (t: string) => Promise<unknown> }),
}));
const api = {
  createSchedulingDraft: jest.fn(),
  schedulePost: jest.fn(),
  publishPostNow: jest.fn(),
  updateScheduledPost: jest.fn(),
  setFirstComment: jest.fn(),
  cancelScheduledPost: jest.fn(),
};
jest.mock("@/integrations/_shared/eden/api/scheduling", () => ({
  ...jest.requireActual("@/integrations/_shared/eden/api/scheduling"),
  createSchedulingDraft: (...a: unknown[]) => api.createSchedulingDraft(...a),
  schedulePost: (...a: unknown[]) => api.schedulePost(...a),
  publishPostNow: (...a: unknown[]) => api.publishPostNow(...a),
  updateScheduledPost: (...a: unknown[]) => api.updateScheduledPost(...a),
  setFirstComment: (...a: unknown[]) => api.setFirstComment(...a),
  cancelScheduledPost: (...a: unknown[]) => api.cancelScheduledPost(...a),
}));
const schedulesApi = { readScheduledPost: jest.fn() };
jest.mock("@/integrations/_shared/eden/api/schedules", () => schedulesApi);

import { edenCreateSchedulingDraft } from "@/integrations/eden/actions/scheduling/createSchedulingDraft";
import { edenSchedulePost } from "@/integrations/eden/actions/scheduling/schedulePost";
import { edenPublishPostNow } from "@/integrations/eden/actions/scheduling/publishPostNow";
import { edenUpdateScheduledPost } from "@/integrations/eden/actions/scheduling/updateScheduledPost";
import { edenReschedulePost } from "@/integrations/eden/actions/scheduling/reschedulePost";
import { edenSetFirstComment } from "@/integrations/eden/actions/scheduling/setFirstComment";
import { edenCancelScheduledPost } from "@/integrations/eden/actions/scheduling/cancelScheduledPost";
import { edenReadScheduledPost } from "@/integrations/eden/actions/scheduling/readScheduledPost";

import { CreateSchedulingDraftConfigSchema } from "@/integrations/eden/actions/scheduling/createSchedulingDraft.schema";
import { SchedulePostConfigSchema } from "@/integrations/eden/actions/scheduling/schedulePost.schema";
import { PublishPostNowConfigSchema } from "@/integrations/eden/actions/scheduling/publishPostNow.schema";
import { UpdateScheduledPostConfigSchema } from "@/integrations/eden/actions/scheduling/updateScheduledPost.schema";
import { ReschedulePostConfigSchema } from "@/integrations/eden/actions/scheduling/reschedulePost.schema";
import { SetFirstCommentConfigSchema } from "@/integrations/eden/actions/scheduling/setFirstComment.schema";
import { CancelScheduledPostConfigSchema } from "@/integrations/eden/actions/scheduling/cancelScheduledPost.schema";

const base = { workflowId: "wf", userId: "u", accountId: "acct-1", runId: "run-9", nodeId: "node-3", triggerEvent: {} as never };
const POST = {
  id: "p1", status: "draft", scheduleId: "s1", timezone: "UTC",
  platforms: ["twitter"], scheduledFor: null, scheduledAtIso: null, targets: [],
};
const FUTURE = "2035-01-01T00:00:00Z";
const PAST = "2000-01-01T00:00:00Z";
beforeEach(() => jest.clearAllMocks());

function tokenSeam() {
  const passed = mockRefreshAndRetry.mock.calls[0]![0] as unknown as { provider: string; providerAccountId: null };
  expect(passed.provider).toBe("eden");
  expect(passed.providerAccountId).toBeNull();
}

describe("create_scheduling_draft", () => {
  it("routes eden/null, returns bounded output, generates a stable per-run idempotency key", async () => {
    api.createSchedulingDraft.mockResolvedValue(POST);
    const res = await edenCreateSchedulingDraft({ ...base, config: { text: "hi", platforms: ["twitter"] } });
    expect(res.output).toEqual({
      id: "p1", status: "draft", scheduleId: "s1", timezone: "UTC",
      platforms: ["twitter"], scheduledFor: null, scheduledAtIso: null, targets: [],
    });
    tokenSeam();
    const arg = api.createSchedulingDraft.mock.calls[0]![0] as { content: { idempotencyKey: string } };
    expect(arg.content.idempotencyKey).toBe("eden:run-9:node-3");
  });
  it("honors an author-supplied idempotency key", async () => {
    api.createSchedulingDraft.mockResolvedValue(POST);
    await edenCreateSchedulingDraft({ ...base, config: { text: "hi", idempotencyKey: "mine" } });
    const arg = api.createSchedulingDraft.mock.calls[0]![0] as { content: { idempotencyKey: string } };
    expect(arg.content.idempotencyKey).toBe("mine");
  });
  it("never surfaces the token", async () => {
    api.createSchedulingDraft.mockResolvedValue(POST);
    const res = await edenCreateSchedulingDraft({ ...base, config: { text: "hi" } });
    expect(JSON.stringify(res.output)).not.toContain("tok");
  });
});

describe("schema guards — platform/media/time", () => {
  it("instagram/tiktok/youtube require media", () => {
    expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: ["instagram"] }).success).toBe(false);
    expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: ["tiktok"] }).success).toBe(false);
    expect(
      CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: ["instagram"], media: [{ url: "https://x/a.jpg" }] }).success,
    ).toBe(true);
  });
  it("youtube requires a title AND media", () => {
    expect(
      CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: ["youtube"], media: [{ url: "https://x/v.mp4" }] }).success,
    ).toBe(false); // missing youtubeTitle
    expect(
      CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: ["youtube"], media: [{ url: "https://x/v.mp4" }], youtubeTitle: "T" }).success,
    ).toBe(true);
  });
  it("text-only X/Threads/LinkedIn/Substack is allowed", () => {
    for (const p of ["twitter", "threads", "linkedin", "substack"]) {
      expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: [p] }).success).toBe(true);
    }
  });
  it("rejects unknown platform + extra keys (.strict)", () => {
    expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", platforms: ["mastodon"] }).success).toBe(false);
    expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", surprise: 1 }).success).toBe(false);
    expect(CreateSchedulingDraftConfigSchema.safeParse({ platforms: ["twitter"] }).success).toBe(false); // no text
  });
  it("media must be a public URL, never bytes", () => {
    expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", media: [{ url: "not-a-url" }] }).success).toBe(false);
    expect(CreateSchedulingDraftConfigSchema.safeParse({ text: "x", media: [{ base64: "AAAA" }] }).success).toBe(false);
  });
  it("schedule_post rejects a PAST time and requires a time", () => {
    expect(SchedulePostConfigSchema.safeParse({ text: "x", scheduledAtIso: PAST }).success).toBe(false);
    expect(SchedulePostConfigSchema.safeParse({ text: "x" }).success).toBe(false); // no time
    expect(SchedulePostConfigSchema.safeParse({ text: "x", scheduledAtIso: FUTURE }).success).toBe(true);
  });
  it("reschedule_post rejects a PAST time", () => {
    expect(ReschedulePostConfigSchema.safeParse({ postId: "p1", scheduledAtIso: PAST }).success).toBe(false);
    expect(ReschedulePostConfigSchema.safeParse({ postId: "p1", scheduledAtIso: FUTURE }).success).toBe(true);
  });
  it("update requires at least one editable field", () => {
    expect(UpdateScheduledPostConfigSchema.safeParse({ postId: "p1" }).success).toBe(false);
    expect(UpdateScheduledPostConfigSchema.safeParse({ postId: "p1", text: "new" }).success).toBe(true);
  });
  it("set_first_comment rejects both afterLikes AND delayMinutes", () => {
    expect(SetFirstCommentConfigSchema.safeParse({ postId: "p1", comment: "c", afterLikes: 5, delayMinutes: 3 }).success).toBe(false);
    expect(SetFirstCommentConfigSchema.safeParse({ postId: "p1", comment: "c", afterLikes: 5 }).success).toBe(true);
    expect(SetFirstCommentConfigSchema.safeParse({ postId: "p1", comment: "" }).success).toBe(true); // clear
  });
  it("publish/cancel schemas are strict", () => {
    expect(PublishPostNowConfigSchema.safeParse({ text: "now" }).success).toBe(true);
    expect(CancelScheduledPostConfigSchema.safeParse({ postId: "p1" }).success).toBe(true);
    expect(CancelScheduledPostConfigSchema.safeParse({}).success).toBe(false);
  });
});

describe("schedule_post / publish_post_now handlers", () => {
  it("schedule_post routes eden/null and passes the ISO time + stable key", async () => {
    api.schedulePost.mockResolvedValue({ ...POST, status: "scheduled", scheduledAtIso: FUTURE });
    const res = await edenSchedulePost({ ...base, config: { text: "t", scheduledAtIso: FUTURE, platforms: ["twitter"] } });
    expect(res.output.status).toBe("scheduled");
    tokenSeam();
    const arg = api.schedulePost.mock.calls[0]![0] as { scheduledAtIso: string; content: { idempotencyKey: string } };
    expect(arg.scheduledAtIso).toBe(FUTURE);
    expect(arg.content.idempotencyKey).toBe("eden:run-9:node-3");
  });
  it("publish_post_now returns bounded output", async () => {
    api.publishPostNow.mockResolvedValue({ ...POST, status: "publishing" });
    const res = await edenPublishPostNow({ ...base, config: { text: "now", platforms: ["twitter"] } });
    expect(res.output.status).toBe("publishing");
    tokenSeam();
  });
});

describe("edit / reschedule / first-comment / cancel / read handlers", () => {
  it("update sends only content", async () => {
    api.updateScheduledPost.mockResolvedValue({ ...POST, status: "scheduled" });
    await edenUpdateScheduledPost({ ...base, config: { postId: "p1", text: "new" } });
    const arg = api.updateScheduledPost.mock.calls[0]![0] as { content: { text: string } };
    expect(arg.content.text).toBe("new");
  });
  it("reschedule sends scheduledAtIso and no content", async () => {
    api.updateScheduledPost.mockResolvedValue({ ...POST, status: "scheduled", scheduledAtIso: FUTURE });
    await edenReschedulePost({ ...base, config: { postId: "p1", scheduledAtIso: FUTURE } });
    const arg = api.updateScheduledPost.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.scheduledAtIso).toBe(FUTURE);
    expect(arg).not.toHaveProperty("content");
  });
  it("set_first_comment returns hasFirstComment", async () => {
    api.setFirstComment.mockResolvedValue({ postId: "p1", status: "draft", hasFirstComment: true });
    const res = await edenSetFirstComment({ ...base, config: { postId: "p1", comment: "link", delayMinutes: 5 } });
    expect(res.output).toEqual({ postId: "p1", status: "draft", hasFirstComment: true });
  });
  it("cancel returns cancelled", async () => {
    api.cancelScheduledPost.mockResolvedValue({ postId: "p1", status: "cancelled", cancelled: true });
    const res = await edenCancelScheduledPost({ ...base, config: { postId: "p1" } });
    expect(res.output).toEqual({ postId: "p1", status: "cancelled", cancelled: true });
  });
  it("read returns found=false with a null-shaped payload when absent", async () => {
    schedulesApi.readScheduledPost.mockResolvedValue(null);
    const res = await edenReadScheduledPost({ ...base, config: { postId: "gone" } });
    expect(res.output.found).toBe(false);
    expect(res.output.id).toBeNull();
  });
  it("read returns bounded detail when present", async () => {
    schedulesApi.readScheduledPost.mockResolvedValue({
      id: "p1", status: "draft", scheduleId: "s1", timezone: "UTC", platforms: ["twitter"],
      scheduledFor: null, scheduledAtIso: null, text: "body", mediaCount: 0, targets: [],
    });
    const res = await edenReadScheduledPost({ ...base, config: { postId: "p1" } });
    expect(res.output).toMatchObject({ found: true, id: "p1", text: "body" });
  });
});

describe("provider failure propagates", () => {
  it("a thrown provider error is not swallowed into a {success:false} envelope", async () => {
    api.schedulePost.mockRejectedValue(new Error("boom"));
    await expect(edenSchedulePost({ ...base, config: { text: "t", scheduledAtIso: FUTURE } })).rejects.toThrow("boom");
  });
});
