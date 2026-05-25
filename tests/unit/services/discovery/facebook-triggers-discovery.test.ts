/**
 * @jest-environment node
 *
 * Slice 3.FACEBOOK-5 — Facebook trigger discovery-registry coverage.
 *
 * Pins the 2-trigger surface: keys + displayOrder, webhook activation,
 * pageId / optional postId resolver wiring, sensitive payload markings, and
 * the absence of Meta App-Review caveats in user-facing trigger metadata.
 * Also re-asserts the 8-action surface is unchanged.
 */
import {
  getTriggerMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("facebook trigger discovery — surface", () => {
  it("registers exactly 2 trigger metas in displayOrder", () => {
    const metas = listTriggerMetasForProvider("facebook");
    expect(metas.map((m) => m.key)).toEqual([
      "facebook:new_post",
      "facebook:new_comment",
    ]);
    expect(metas.map((m) => m.displayOrder)).toEqual([10, 20]);
  });

  it("the 8-action surface is unchanged by the trigger flip", () => {
    expect(listActionMetasForProvider("facebook")).toHaveLength(8);
  });

  it("both triggers are webhook-activated + require integration", () => {
    for (const m of listTriggerMetasForProvider("facebook")) {
      expect(m.provider).toBe("facebook");
      expect(m.key).toBe(`facebook:${m.type}`);
      expect(m.activation).toBe("webhook");
      expect(m.requiresIntegration).toBe(true);
    }
  });
});

describe("facebook trigger discovery — resolver wiring", () => {
  it("new_post: pageId picker (facebook:pages, no dep, required)", () => {
    const page = getTriggerMeta("facebook:new_post")!.fields.find((f) => f.name === "pageId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(page.dependsOn).toBeUndefined();
    expect(page.required).toBe(true);
  });

  it("new_comment: pageId picker + optional pageId→postId cascade (facebook:posts dependsOn pageId)", () => {
    const m = getTriggerMeta("facebook:new_comment")!;
    const page = m.fields.find((f) => f.name === "pageId")!;
    const post = m.fields.find((f) => f.name === "postId")!;
    expect(page.optionsSource).toBe("facebook:pages");
    expect(post.optionsSource).toBe("facebook:posts");
    expect(post.dependsOn).toBe("pageId");
    expect(post.required).toBe(false);
  });
});

describe("facebook trigger discovery — sensitive payload markings", () => {
  it("message + permalinkUrl + fromId sensitive on new_post; ids/timestamps not", () => {
    const m = getTriggerMeta("facebook:new_post")!;
    const byName = new Map(m.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("message")!.sensitive).toBe(true);
    expect(byName.get("permalinkUrl")!.sensitive).toBe(true);
    expect(byName.get("fromId")!.sensitive).toBe(true);
    for (const n of ["changeKind", "pageId", "postId", "createdTime", "mediaType"]) {
      expect(byName.get(n)!.sensitive).not.toBe(true);
    }
  });

  it("message + fromId sensitive on new_comment; ids/timestamps not", () => {
    const m = getTriggerMeta("facebook:new_comment")!;
    const byName = new Map(m.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("message")!.sensitive).toBe(true);
    expect(byName.get("fromId")!.sensitive).toBe(true);
    for (const n of ["changeKind", "pageId", "postId", "commentId", "createdTime", "parentId"]) {
      expect(byName.get(n)!.sensitive).not.toBe(true);
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = ["token", "accessToken", "pageAccessToken", "secret", "appsecretProof"];
    for (const m of listTriggerMetasForProvider("facebook")) {
      const names = m.payloadShape.map((p) => p.name);
      for (const b of BANNED) expect(names).not.toContain(b);
    }
  });
});

describe("facebook trigger discovery — no Meta App-Review caveats in user-facing copy", () => {
  it("no description / label / placeholder mentions App Review, Advanced Access, Dev Mode, or Messenger review", () => {
    const FORBIDDEN = [
      /app review/i,
      /advanced access/i,
      /\bdev mode\b/i,
      /messenger platform review/i,
      /review[- ]gated/i,
    ];
    const offenders: string[] = [];
    for (const m of listTriggerMetasForProvider("facebook")) {
      const strings: string[] = [m.displayName, m.description];
      for (const f of m.fields) {
        strings.push(f.label);
        if (f.description) strings.push(f.description);
        if (f.placeholder) strings.push(f.placeholder);
      }
      for (const p of m.payloadShape) if (p.description) strings.push(p.description);
      for (const s of strings) {
        for (const pat of FORBIDDEN) if (pat.test(s)) offenders.push(`${m.key}: "${s}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
