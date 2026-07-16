/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 — Facebook provider-route coverage.
 *
 * GET /api/providers/facebook/actions returns the 8 actions in display order
 * with the full wire shape (optionsSource / dependsOn / options / risk /
 * FileRef / category); GET .../triggers returns [] (triggers staged for
 * FACEBOOK-5); the providers index marks facebook hasMetadata=true.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getActions } from "@/app/api/providers/[id]/actions/route";
import { GET as getTriggers } from "@/app/api/providers/[id]/triggers/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

interface WireField {
  name: string;
  type: string;
  required: boolean;
  optionsSource?: string;
  dependsOn?: string;
  options?: Array<{ value: string; label: string }>;
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  producesFileRef: boolean;
  consumesFileRef: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchFacebookActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/facebook/actions"), {
    params: Promise.resolve({ id: "facebook" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("facebook");
  return body.actions;
}

describe("GET /api/providers/facebook/actions", () => {
  it("returns the full 8-action surface in display order", async () => {
    const actions = await fetchFacebookActions();
    expect(actions.map((a) => a.key)).toEqual([
      "facebook:create_post",
      "facebook:update_post",
      "facebook:comment_on_post",
      "facebook:upload_photo",
      "facebook:upload_video",
      "facebook:get_page_insights",
      "facebook:send_message",
      "facebook:delete_post",
    ]);
  });

  it("every action requiresIntegration", async () => {
    for (const a of await fetchFacebookActions()) {
      expect(a.requiresIntegration).toBe(true);
    }
  });

  it("delete_post serializes the destructive trio + high risk", async () => {
    const byKey = new Map((await fetchFacebookActions()).map((a) => [a.key, a]));
    const del = byKey.get("facebook:delete_post")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
  });

  it("media actions serialize consumesFileRef (upload_photo / upload_video)", async () => {
    const byKey = new Map((await fetchFacebookActions()).map((a) => [a.key, a]));
    for (const key of ["facebook:upload_photo", "facebook:upload_video"]) {
      const a = byKey.get(key)!;
      expect(a.consumesFileRef).toBe(true);
      expect(a.producesFileRef).toBe(false);
    }
    // No Facebook action produces a FileRef.
    for (const a of byKey.values()) {
      expect(a.producesFileRef).toBe(false);
    }
  });

  it("serializes the pageId → postId cascade (optionsSource + dependsOn round-trip)", async () => {
    const byKey = new Map((await fetchFacebookActions()).map((a) => [a.key, a]));
    const del = byKey.get("facebook:delete_post")!;
    const page = del.fields.find((f) => f.name === "pageId")!;
    const post = del.fields.find((f) => f.name === "postId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(page.dependsOn).toBeUndefined();
    expect(post.optionsSource).toBe("facebook:posts");
    expect(post.dependsOn).toBe("pageId");
  });

  it("serializes the pageId → recipientId conversation cascade on send_message", async () => {
    const byKey = new Map((await fetchFacebookActions()).map((a) => [a.key, a]));
    const sm = byKey.get("facebook:send_message")!;
    const recipient = sm.fields.find((f) => f.name === "recipientId")!;
    expect(recipient.optionsSource).toBe("facebook:conversations");
    expect(recipient.dependsOn).toBe("pageId");
  });

  it("serializes static enum options (get_page_insights period) + text fields", async () => {
    const byKey = new Map((await fetchFacebookActions()).map((a) => [a.key, a]));
    const insights = byKey.get("facebook:get_page_insights")!;
    const period = insights.fields.find((f) => f.name === "period")!;
    expect(period.type).toBe("select");
    expect(period.options?.map((o) => o.value)).toEqual(["day", "week", "days_28"]);
    const metric = insights.fields.find((f) => f.name === "metric")!;
    // CONFIG-UX-SETUP-ADVANCED-1: metric is a static-options combobox with manual entry.
    expect(metric.type).toBe("combobox");
    expect(metric.optionsSource).toBeUndefined();
    expect(metric.options?.map((o) => o.value)).toEqual([
      "page_post_engagements",
      "page_views_total",
    ]);
  });

  it("sensitive output flags round-trip through the wire (recipientId PSID + insights metrics)", async () => {
    const byKey = new Map((await fetchFacebookActions()).map((a) => [a.key, a]));
    const sm = byKey.get("facebook:send_message")!;
    expect(sm.outputs.find((o) => o.name === "recipientId")!.sensitive).toBe(true);
    const insights = byKey.get("facebook:get_page_insights")!;
    expect(insights.outputs.find((o) => o.name === "metrics")!.sensitive).toBe(true);
  });
});

interface WireTriggerField {
  name: string;
  type: string;
  required: boolean;
  optionsSource?: string;
  dependsOn?: string;
}
interface WireTrigger {
  key: string;
  type: string;
  activation: string;
  requiresIntegration: boolean;
  category: string;
  fields: WireTriggerField[];
  payloadShape: Array<{ name: string; type: string; sensitive?: boolean }>;
}

describe("GET /api/providers/facebook/triggers", () => {
  async function fetchFacebookTriggers(): Promise<WireTrigger[]> {
    const res = await getTriggers(new Request("http://x/facebook/triggers"), {
      params: Promise.resolve({ id: "facebook" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
    expect(body.provider).toBe("facebook");
    return body.triggers;
  }

  it("returns the 2 Facebook webhook triggers (FACEBOOK-5) in display order", async () => {
    const triggers = await fetchFacebookTriggers();
    expect(triggers.map((t) => t.key)).toEqual([
      "facebook:new_post",
      "facebook:new_comment",
    ]);
    for (const t of triggers) {
      expect(t.activation).toBe("webhook");
      expect(t.requiresIntegration).toBe(true);
    }
  });

  it("serializes the pageId picker on new_post + the pageId→postId cascade on new_comment", async () => {
    const byKey = new Map((await fetchFacebookTriggers()).map((t) => [t.key, t]));
    const newPost = byKey.get("facebook:new_post")!;
    const page = newPost.fields.find((f) => f.name === "pageId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(page.dependsOn).toBeUndefined();

    const newComment = byKey.get("facebook:new_comment")!;
    const post = newComment.fields.find((f) => f.name === "postId")!;
    expect(post.optionsSource).toBe("facebook:posts");
    expect(post.dependsOn).toBe("pageId");
    expect(post.required).toBe(false);
  });

  it("sensitive payload flags round-trip through the wire (message + fromId)", async () => {
    const byKey = new Map((await fetchFacebookTriggers()).map((t) => [t.key, t]));
    for (const key of ["facebook:new_post", "facebook:new_comment"]) {
      const t = byKey.get(key)!;
      expect(t.payloadShape.find((p) => p.name === "message")!.sensitive).toBe(true);
      expect(t.payloadShape.find((p) => p.name === "fromId")!.sensitive).toBe(true);
    }
  });
});

describe("GET /api/providers — facebook hasMetadata", () => {
  it("marks facebook hasMetadata=true now that FACEBOOK-4 shipped its action metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const facebook = body.providers.find((p) => p.id === "facebook");
    expect(facebook).toBeDefined();
    expect(facebook?.hasMetadata).toBe(true);
  });
});
