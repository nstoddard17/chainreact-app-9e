/**
 * @jest-environment node
 *
 * Eden scheduling-write adapter (EDEN-6). Mocks ONLY the `edenCallTool` seam. Proves:
 *   - V2-shaped inputs synthesize the correct Eden wire-format (segments/media/perPlatform);
 *   - outputs are bounded + normalized (epoch→ISO, account `connectionId` dropped);
 *   - idempotencyKey + scheduled time passthrough;
 *   - reads (`readScheduledPost`) bound the full post and return null when absent.
 */
const mockCallTool = jest.fn();
jest.mock("@/integrations/_shared/eden/api/_client", () => ({
  edenCallTool: (...a: unknown[]) => mockCallTool(...a),
}));

import {
  createSchedulingDraft,
  schedulePost,
  publishPostNow,
  updateScheduledPost,
  setFirstComment,
  cancelScheduledPost,
} from "@/integrations/_shared/eden/api/scheduling";
import { readScheduledPost } from "@/integrations/_shared/eden/api/schedules";

const TOKEN = "eden_pat_secret_zzz";
beforeEach(() => jest.clearAllMocks());

function lastArgs(): Record<string, unknown> {
  return (mockCallTool.mock.calls.at(-1)![0] as { args: Record<string, unknown> }).args;
}
function lastCall(): { tool: string; idempotent: boolean } {
  const c = mockCallTool.mock.calls.at(-1)![0] as { tool: string; idempotent?: boolean };
  return { tool: c.tool, idempotent: c.idempotent ?? false };
}

describe("createSchedulingDraft — wire-format synthesis", () => {
  it("maps segments→[{text}], media→[{url,mimeType,alt}], youtubeTitle→perPlatform.youtube.title", async () => {
    mockCallTool.mockResolvedValue({ ok: true, id: "d1", status: "draft" });
    await createSchedulingDraft({
      accessToken: TOKEN,
      workspaceId: "w1",
      scheduleId: "s1",
      content: {
        platforms: ["twitter", "youtube"],
        text: "hello\nworld",
        segments: ["one", "two"],
        media: [{ url: "https://x/a.png", mimeType: "image/png", alt: "a" }],
        youtubeTitle: "My Short",
        idempotencyKey: "k-1",
      },
    });
    const args = lastArgs();
    expect(lastCall()).toEqual({ tool: "eden_create_scheduling_draft", idempotent: false });
    expect(args.workspaceId).toBe("w1");
    expect(args.scheduleId).toBe("s1");
    expect(args.platforms).toEqual(["twitter", "youtube"]);
    expect(args.text).toBe("hello\nworld");
    expect(args.segments).toEqual([{ text: "one" }, { text: "two" }]);
    expect(args.media).toEqual([{ url: "https://x/a.png", mimeType: "image/png", alt: "a" }]);
    expect(args.perPlatform).toEqual({ youtube: { title: "My Short" } });
    expect(args.idempotencyKey).toBe("k-1");
  });

  it("omits empty optional fields", async () => {
    mockCallTool.mockResolvedValue({ ok: true, id: "d1" });
    await createSchedulingDraft({ accessToken: TOKEN, content: { text: "just text" } });
    const args = lastArgs();
    expect(args).toEqual({ text: "just text" });
    expect(args).not.toHaveProperty("segments");
    expect(args).not.toHaveProperty("media");
    expect(args).not.toHaveProperty("perPlatform");
  });
});

describe("normalizePost — bounded + normalized", () => {
  it("derives scheduledAtIso from epoch and DROPS target connectionId (account identity)", async () => {
    mockCallTool.mockResolvedValue({
      ok: true,
      post: {
        id: "p1",
        status: "scheduled",
        scheduleId: "s1",
        timezone: "UTC",
        platforms: ["twitter"],
        scheduledFor: 1_800_000_000_000,
        targets: [{ connectionId: "acct-SECRET-123", platform: "twitter", kind: "text", status: "pending" }],
      },
    });
    const r = await schedulePost({ accessToken: TOKEN, content: { text: "t" }, scheduledFor: 1_800_000_000_000 });
    expect(r.id).toBe("p1");
    expect(r.scheduledFor).toBe(1_800_000_000_000);
    expect(r.scheduledAtIso).toBe(new Date(1_800_000_000_000).toISOString());
    expect(r.targets).toEqual([{ platform: "twitter", kind: "text", status: "pending" }]);
    expect(JSON.stringify(r)).not.toContain("acct-SECRET-123");
    expect(JSON.stringify(r)).not.toContain("connectionId");
  });

  it("scheduledAtIso is null for a draft with no time", async () => {
    mockCallTool.mockResolvedValue({ ok: true, id: "d1", status: "draft" });
    const r = await createSchedulingDraft({ accessToken: TOKEN, content: { text: "t" } });
    expect(r.scheduledFor).toBeNull();
    expect(r.scheduledAtIso).toBeNull();
  });
});

describe("schedulePost / publishPostNow", () => {
  it("schedulePost passes scheduledAtIso; publishPostNow passes no time", async () => {
    mockCallTool.mockResolvedValue({ ok: true, id: "p1" });
    await schedulePost({ accessToken: TOKEN, content: { text: "t" }, scheduledAtIso: "2030-01-01T00:00:00Z" });
    expect(lastArgs().scheduledAtIso).toBe("2030-01-01T00:00:00Z");
    expect(lastCall().tool).toBe("eden_schedule_post");

    await publishPostNow({ accessToken: TOKEN, content: { text: "now" } });
    expect(lastArgs()).not.toHaveProperty("scheduledAtIso");
    expect(lastArgs()).not.toHaveProperty("scheduledFor");
    expect(lastCall().tool).toBe("eden_publish_post_now");
  });
});

describe("updateScheduledPost — only sends provided fields", () => {
  it("time-only update sends postId + scheduledAtIso, no body fields", async () => {
    mockCallTool.mockResolvedValue({ ok: true, post: { id: "p1", status: "scheduled" } });
    await updateScheduledPost({ accessToken: TOKEN, postId: "p1", scheduledAtIso: "2030-06-01T12:00:00Z" });
    const args = lastArgs();
    expect(args).toEqual({ postId: "p1", scheduledAtIso: "2030-06-01T12:00:00Z" });
    expect(args).not.toHaveProperty("text");
    expect(args).not.toHaveProperty("platforms");
  });

  it("content-only update sends text but not time", async () => {
    mockCallTool.mockResolvedValue({ ok: true, post: { id: "p1" } });
    await updateScheduledPost({ accessToken: TOKEN, postId: "p1", content: { text: "new" } });
    expect(lastArgs()).toEqual({ postId: "p1", text: "new" });
  });
});

describe("setFirstComment", () => {
  it("passes afterLikes/delayMinutes and reports hasFirstComment", async () => {
    mockCallTool.mockResolvedValue({ ok: true, post: { id: "p1", status: "draft" } });
    const r = await setFirstComment({ accessToken: TOKEN, postId: "p1", comment: "link", afterLikes: 50 });
    expect(lastArgs()).toEqual({ postId: "p1", comment: "link", afterLikes: 50 });
    expect(r.hasFirstComment).toBe(true);
  });
  it("empty comment clears (hasFirstComment=false)", async () => {
    mockCallTool.mockResolvedValue({ ok: true, post: { id: "p1" } });
    const r = await setFirstComment({ accessToken: TOKEN, postId: "p1", comment: "" });
    expect(r.hasFirstComment).toBe(false);
  });
});

describe("cancelScheduledPost", () => {
  it("cancelled reflects env.ok", async () => {
    mockCallTool.mockResolvedValue({ ok: true, post: { id: "p1", status: "cancelled" } });
    const r = await cancelScheduledPost({ accessToken: TOKEN, postId: "p1" });
    expect(r).toEqual({ postId: "p1", status: "cancelled", cancelled: true });
  });
});

describe("error propagation — ok:false envelope throws (never a silent empty post)", () => {
  it("schedulePost throws on a 400 validation envelope, surfacing the provider reason (no content)", async () => {
    mockCallTool.mockResolvedValue({ ok: false, status: "invalid", httpStatus: 400, message: "No active connection on this schedule for X." });
    await expect(schedulePost({ accessToken: TOKEN, content: { text: "t" }, scheduledAtIso: "2035-01-01T00:00:00Z" }))
      .rejects.toThrow(/eden_schedule_post failed \(invalid\).*No active connection/);
  });
  it("createSchedulingDraft + cancel + setFirstComment all throw on ok:false", async () => {
    mockCallTool.mockResolvedValue({ ok: false, status: "not_found", message: "gone" });
    await expect(createSchedulingDraft({ accessToken: TOKEN, content: { text: "t" } })).rejects.toThrow(/failed/);
    await expect(cancelScheduledPost({ accessToken: TOKEN, postId: "p1" })).rejects.toThrow(/failed/);
    await expect(setFirstComment({ accessToken: TOKEN, postId: "p1", comment: "c" })).rejects.toThrow(/failed/);
  });
  it("readScheduledPost distinguishes an error envelope (throws) from an absent post (null)", async () => {
    mockCallTool.mockResolvedValue({ ok: false, status: "error", message: "boom" });
    await expect(readScheduledPost({ accessToken: TOKEN, postId: "p1" })).rejects.toThrow(/failed/);
  });
});

describe("readScheduledPost — bounded full read", () => {
  it("bounds content.text + drops connectionId + epoch→iso", async () => {
    mockCallTool.mockResolvedValue({
      ok: true,
      posts: [
        {
          id: "p1",
          status: "draft",
          scheduleId: "s1",
          timezone: "UTC",
          platforms: ["twitter"],
          scheduledFor: 1_900_000_000_000,
          content: { text: "body", media: [{ url: "u" }] },
          targets: [{ connectionId: "acct-XYZ", platform: "twitter", kind: "text", status: "pending" }],
        },
      ],
    });
    const r = await readScheduledPost({ accessToken: TOKEN, postId: "p1" });
    expect(r).not.toBeNull();
    expect(r!.text).toBe("body");
    expect(r!.mediaCount).toBe(1);
    expect(r!.scheduledAtIso).toBe(new Date(1_900_000_000_000).toISOString());
    expect(r!.targets).toEqual([{ platform: "twitter", kind: "text", status: "pending" }]);
    expect(JSON.stringify(r)).not.toContain("acct-XYZ");
    // full mode requested
    expect(lastArgs()).toMatchObject({ postId: "p1", mode: "full" });
  });

  it("returns null when the post id is absent", async () => {
    mockCallTool.mockResolvedValue({ ok: true, posts: [] });
    expect(await readScheduledPost({ accessToken: TOKEN, postId: "nope" })).toBeNull();
  });
});
