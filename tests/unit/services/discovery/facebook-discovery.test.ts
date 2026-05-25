/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-4 — Facebook discovery-registry coverage.
 *
 * Pins the full 8-action Facebook surface: all keys registered + sorted by
 * displayOrder, key===provider:type, camelCase field/output names, no
 * secret-shaped outputs, resolver wiring (facebook:pages / facebook:posts /
 * facebook:conversations cascades), the rejected-feature absences (no
 * albumId on upload_photo, no Ads/Groups/monetization), risk
 * classifications, sensitive-output markings, FileRef flags, and the absence
 * of Meta App-Review / Advanced-Access caveats from all user-facing copy. No
 * Facebook trigger metas (staged for FACEBOOK-5).
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "facebook:create_post",
  "facebook:update_post",
  "facebook:comment_on_post",
  "facebook:upload_photo",
  "facebook:upload_video",
  "facebook:get_page_insights",
  "facebook:send_message",
  "facebook:delete_post",
];

// Actions whose postId picker cascades from the pageId page picker
// (facebook:posts dependsOn pageId).
const POST_CASCADE_ACTIONS = [
  "facebook:update_post",
  "facebook:comment_on_post",
  "facebook:delete_post",
];

describe("facebook discovery — surface", () => {
  it("registers exactly 8 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("facebook");
    expect(metas).toHaveLength(8);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("registers NO Facebook trigger metas yet (staged for FACEBOOK-5)", () => {
    expect(listTriggerMetasForProvider("facebook")).toEqual([]);
  });

  it("every key equals provider:type and provider is 'facebook'", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      expect(m.provider).toBe("facebook");
      expect(m.key).toBe(`facebook:${m.type}`);
    }
  });

  it("every action requiresIntegration", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      expect(m.requiresIntegration).toBe(true);
    }
  });

  it("categories: publishing/engagement/Messenger=messaging, media=files, insights=data", () => {
    const byKey = new Map(
      listActionMetasForProvider("facebook").map((m) => [m.key, m]),
    );
    for (const k of [
      "facebook:create_post",
      "facebook:update_post",
      "facebook:comment_on_post",
      "facebook:send_message",
      "facebook:delete_post",
    ]) {
      expect(byKey.get(k)!.category).toBe("messaging");
    }
    expect(byKey.get("facebook:upload_photo")!.category).toBe("files");
    expect(byKey.get("facebook:upload_video")!.category).toBe("files");
    expect(byKey.get("facebook:get_page_insights")!.category).toBe("data");
  });

  it("displayOrder is strictly ascending (10..80)", () => {
    const orders = listActionMetasForProvider("facebook").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(80);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });
});

describe("facebook discovery — field + output hygiene", () => {
  it("all field names are camelCase", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("all output names are camelCase", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      for (const o of m.outputs) {
        expect(o.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("no secret-shaped output names anywhere", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "pageAccessToken",
      "apiKey",
      "clientSecret",
      "secret",
      "appsecretProof",
      "appsecret_proof",
      "webhookSecret",
      "bytes",
      "base64",
    ];
    for (const m of listActionMetasForProvider("facebook")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });

  it("field names match the FACEBOOK-2 runtime schema names exactly", () => {
    const expectedFields: Record<string, string[]> = {
      "facebook:create_post": ["pageId", "message", "link", "scheduledPublishTime"],
      "facebook:update_post": ["pageId", "postId", "message", "isPublished"],
      "facebook:comment_on_post": ["pageId", "postId", "comment", "attachmentUrl"],
      "facebook:upload_photo": ["pageId", "photo", "caption", "published"],
      "facebook:upload_video": ["pageId", "video", "title", "description", "published"],
      "facebook:get_page_insights": ["pageId", "metric", "period", "since", "until"],
      "facebook:send_message": ["pageId", "recipientId", "message"],
      "facebook:delete_post": ["pageId", "postId"],
    };
    for (const [key, fields] of Object.entries(expectedFields)) {
      expect(getActionMeta(key)!.fields.map((f) => f.name)).toEqual(fields);
    }
  });
});

describe("facebook discovery — resolver wiring (pages + post + conversation cascades)", () => {
  it("every action's pageId uses facebook:pages with no dep", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      const page = m.fields.find((f) => f.name === "pageId")!;
      expect(page.optionsSource).toBe("facebook:pages");
      expect(page.dependsOn).toBeUndefined();
      expect(page.required).toBe(true);
    }
  });

  it("post-targeting actions: postId → facebook:posts dependsOn pageId (required)", () => {
    for (const key of POST_CASCADE_ACTIONS) {
      const post = getActionMeta(key)!.fields.find((f) => f.name === "postId")!;
      expect(post.optionsSource).toBe("facebook:posts");
      expect(post.dependsOn).toBe("pageId");
      expect(post.required).toBe(true);
    }
  });

  it("send_message: recipientId → facebook:conversations dependsOn pageId (runtime field name preserved)", () => {
    const m = getActionMeta("facebook:send_message")!;
    const recipient = m.fields.find((f) => f.name === "recipientId")!;
    expect(recipient.optionsSource).toBe("facebook:conversations");
    expect(recipient.dependsOn).toBe("pageId");
    expect(recipient.required).toBe(true);
    // The runtime schema field is `recipientId`, NOT `conversationId`.
    expect(m.fields.find((f) => f.name === "conversationId")).toBeUndefined();
  });

  it("get_page_insights.period is a static enum (no facebook:albums or other resolver)", () => {
    const period = getActionMeta("facebook:get_page_insights")!.fields.find(
      (f) => f.name === "period",
    )!;
    expect(period.type).toBe("select");
    expect(period.options?.map((o) => o.value)).toEqual(["day", "week", "days_28"]);
    expect(period.optionsSource).toBeUndefined();
    // Q11: no UI default on the enum — runtime schema owns the default.
    expect(period.defaultValue).toBeUndefined();
  });
});

describe("facebook discovery — rejected features absent", () => {
  it("upload_photo does NOT declare albumId (runtime schema has no album field)", () => {
    const m = getActionMeta("facebook:upload_photo")!;
    expect(m.fields.find((f) => f.name === "albumId")).toBeUndefined();
    expect(m.fields.find((f) => f.name === "album")).toBeUndefined();
  });

  it("no facebook:albums / facebook:groups / facebook:monetization_eligibility wiring on any field", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      for (const f of m.fields) {
        expect(f.optionsSource).not.toBe("facebook:albums");
        expect(f.optionsSource).not.toBe("facebook:groups");
        expect(f.optionsSource).not.toBe("facebook:monetization_eligibility");
      }
    }
  });

  it("no Ads/Marketing/Groups/monetization fields leak in (no adAccount/campaign/group fields)", () => {
    const FORBIDDEN = ["adAccountId", "campaignId", "groupId", "monetizationEligibility"];
    for (const m of listActionMetasForProvider("facebook")) {
      const names = m.fields.map((f) => f.name);
      for (const forbidden of FORBIDDEN) expect(names).not.toContain(forbidden);
    }
  });
});

describe("facebook discovery — risk classifications", () => {
  it("delete_post is high + destructive + requiresConfirmation (structural-only output)", () => {
    const m = getActionMeta("facebook:delete_post")!;
    expect(m.riskLevel).toBe("high");
    expect(m.isDestructive).toBe(true);
    expect(m.requiresConfirmation).toBe(true);
    expect(m.riskDescription).toBeDefined();
    expect(m.outputs.map((o) => o.name).sort()).toEqual([
      "deletedAt",
      "deletedPostId",
      "success",
    ]);
  });

  it("create/update/comment/upload_photo/upload_video/send_message are medium; insights is low", () => {
    const medium = [
      "facebook:create_post",
      "facebook:update_post",
      "facebook:comment_on_post",
      "facebook:upload_photo",
      "facebook:upload_video",
      "facebook:send_message",
    ];
    for (const k of medium) expect(getActionMeta(k)!.riskLevel).toBe("medium");
    expect(getActionMeta("facebook:get_page_insights")!.riskLevel).toBe("low");
  });

  it("no non-delete action sets isDestructive/requiresConfirmation", () => {
    for (const m of listActionMetasForProvider("facebook")) {
      if (m.key === "facebook:delete_post") continue;
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("facebook discovery — sensitive outputs", () => {
  it("send_message.recipientId (PSID) is sensitive", () => {
    expect(
      getActionMeta("facebook:send_message")!.outputs.find(
        (o) => o.name === "recipientId",
      )!.sensitive,
    ).toBe(true);
  });

  it("get_page_insights.metrics (private analytics) is sensitive", () => {
    expect(
      getActionMeta("facebook:get_page_insights")!.outputs.find(
        (o) => o.name === "metrics",
      )!.sensitive,
    ).toBe(true);
  });

  it("opaque ids / timestamps / counts / booleans are NOT sensitive", () => {
    const NON_SENSITIVE = new Set([
      "postId",
      "pageId",
      "commentId",
      "photoId",
      "videoId",
      "messageId",
      "deletedPostId",
      "scheduledPublishTime",
      "success",
      "published",
      "count",
      "metric",
      "period",
      "deletedAt",
    ]);
    for (const m of listActionMetasForProvider("facebook")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) {
          expect(o.sensitive).not.toBe(true);
        }
      }
    }
  });
});

describe("facebook discovery — FileRef flags", () => {
  it("upload_photo + upload_video consume a FileRef (file field type 'file')", () => {
    for (const [key, field] of [
      ["facebook:upload_photo", "photo"],
      ["facebook:upload_video", "video"],
    ] as const) {
      const m = getActionMeta(key)!;
      expect(m.consumesFileRef).toBe(true);
      expect(m.producesFileRef).toBe(false);
      expect(m.fields.find((f) => f.name === field)!.type).toBe("file");
    }
  });

  it("no other Facebook action declares FileRef flags", () => {
    const fileRefKeys = new Set([
      "facebook:upload_photo",
      "facebook:upload_video",
    ]);
    for (const m of listActionMetasForProvider("facebook")) {
      if (fileRefKeys.has(m.key)) continue;
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });
});

describe("facebook discovery — no Meta App-Review caveats in user-facing copy", () => {
  it("no description / label / placeholder mentions App Review, Advanced Access, Dev Mode, or Messenger review", () => {
    const FORBIDDEN = [
      /app review/i,
      /advanced access/i,
      /\bdev mode\b/i,
      /messenger platform review/i,
      /review[- ]gated/i,
    ];
    const offenders: string[] = [];
    for (const m of listActionMetasForProvider("facebook")) {
      const strings: string[] = [m.displayName, m.description];
      if (m.riskDescription) strings.push(m.riskDescription);
      for (const f of m.fields) {
        strings.push(f.label);
        if (f.description) strings.push(f.description);
        if (f.placeholder) strings.push(f.placeholder);
        for (const o of f.options ?? []) {
          strings.push(o.label);
          if (o.description) strings.push(o.description);
        }
      }
      for (const o of m.outputs) {
        if (o.description) strings.push(o.description);
      }
      for (const s of strings) {
        for (const pat of FORBIDDEN) {
          if (pat.test(s)) offenders.push(`${m.key}: "${s}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
