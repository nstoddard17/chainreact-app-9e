/**
 * @jest-environment node
 *
 * Eden Batch-3 Builder metadata + React-Agent catalog (EDEN-6 / CS-6D). The React Agent catalog is
 * fully metadata-driven (services/ai/tools/providerCatalog.ts), so these assertions ARE the
 * agent-facing contract: correct risk classification (draft=medium vs publish=high+confirm),
 * structured fields only (no raw JSON, no MCP tool names / resource URIs), dependent option sources.
 *
 * CS-6D — three publishing writes (`schedule_post`, `publish_post_now`, `update_scheduled_post`)
 * are DEFERRED: their success path is not live-certified, so they are unregistered from discovery +
 * execution and HIDDEN from the catalog/builder/agent. Their `.meta.ts` files remain as orphans
 * (rule 14), so their metadata contract is still asserted here via DIRECT import.
 */
import { getActionMeta, getNodeSchema, getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { EDEN_ACTION_METAS } from "@/services/discovery/providers/eden";
import { edenSchedulePostMeta } from "@/integrations/eden/actions/scheduling/schedulePost.meta";
import { edenPublishPostNowMeta } from "@/integrations/eden/actions/scheduling/publishPostNow.meta";
import { edenUpdateScheduledPostMeta } from "@/integrations/eden/actions/scheduling/updateScheduledPost.meta";

const BATCH3_VISIBLE = [
  "eden:create_scheduling_draft",
  "eden:read_scheduled_post",
  "eden:reschedule_post",
  "eden:set_first_comment",
  "eden:cancel_scheduled_post",
];
const BATCH3_DEFERRED = ["eden:schedule_post", "eden:publish_post_now", "eden:update_scheduled_post"];

function meta(key: string) {
  const r = getActionMeta(key);
  if (!r.ok) throw new Error(`no meta for ${key}`);
  return r.data;
}

describe("registration + catalog visibility (CS-6D deferral)", () => {
  it("the 5 certified Batch-3 actions are registered and visible in the provider catalog", () => {
    const cat = getProviderCatalog();
    expect(cat.ok).toBe(true);
    const eden = cat.ok ? cat.data.providers.find((p) => p.id === "eden") : undefined;
    const keys = new Set(eden!.actions.map((a) => a.key));
    for (const k of BATCH3_VISIBLE) expect(keys.has(k)).toBe(true);
  });

  it("the 3 deferred publishing actions are HIDDEN — absent from catalog, registry, and metas", () => {
    const cat = getProviderCatalog();
    const eden = cat.ok ? cat.data.providers.find((p) => p.id === "eden") : undefined;
    const keys = new Set(eden!.actions.map((a) => a.key));
    const registered = new Set(EDEN_ACTION_METAS.map((m) => m.key));
    for (const k of BATCH3_DEFERRED) {
      expect(keys.has(k)).toBe(false); // not agent/builder visible
      expect(getActionMeta(k).ok).toBe(false); // not registered for execution/discovery
      expect(registered.has(k)).toBe(false); // not in the discovery meta inventory
    }
  });
});

describe("deferred metas still satisfy the contract (impl retained as orphans)", () => {
  it("publish_post_now is high-risk AND requires confirmation", () => {
    expect(edenPublishPostNowMeta.riskLevel).toBe("high");
    expect(edenPublishPostNowMeta.requiresConfirmation).toBe(true);
  });
  it("schedule_post is high-risk with structured platform/media fields (not a JSON blob)", () => {
    expect(edenSchedulePostMeta.riskLevel).toBe("high");
    const byName = new Map(edenSchedulePostMeta.fields.map((f) => [f.name, f]));
    expect(byName.get("platforms")!.type).toBe("select");
    expect(byName.get("platforms")!.multiple).toBe(true);
    expect(byName.get("media")!.type).toBe("object-list");
    expect(byName.get("scheduledAtIso")!.type).toBe("datetime-utc");
  });
  it("bounded post output declares no account-identifier field", () => {
    const names = edenSchedulePostMeta.outputs.map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["id", "status", "scheduledFor", "scheduledAtIso", "targets"]));
    expect(names).not.toContain("connectionId");
    expect(names).not.toContain("accountId");
  });
  it("update_scheduled_post meta remains structured (no json field)", () => {
    for (const f of edenUpdateScheduledPostMeta.fields) expect(f.type).not.toBe("json");
  });
});

describe("risk classification for the VISIBLE Batch-3 actions", () => {
  it("create_scheduling_draft is medium and NOT confirmation-gated (safe draft)", () => {
    const m = meta("eden:create_scheduling_draft");
    expect(m.riskLevel).toBe("medium");
    expect(m.requiresConfirmation).toBe(false);
  });
  it("read_scheduled_post is low-risk", () => {
    expect(meta("eden:read_scheduled_post").riskLevel).toBe("low");
  });
});

describe("structured Builder UX — no raw JSON, no MCP internals leaked (visible actions)", () => {
  it("no visible scheduling action exposes a json field or an MCP tool name / resource URI in labels", () => {
    for (const key of BATCH3_VISIBLE) {
      const m = meta(key);
      for (const f of m.fields) {
        expect(f.type).not.toBe("json");
        expect(f.label.toLowerCase()).not.toContain("eden_"); // no MCP tool names
        expect(f.label).not.toMatch(/https?:\/\//); // no resource URIs
        expect(f.label.toLowerCase()).not.toContain("json");
      }
    }
  });
});

describe("dependent option sources (visible actions)", () => {
  it("reschedule_post binds the eden:scheduled_posts picker", () => {
    const s = getNodeSchema("eden:reschedule_post");
    expect(s.ok).toBe(true);
    const sources = new Set(s.ok ? s.data.optionsSourceDeps.map((d) => d.optionsSource) : []);
    expect(sources.has("eden:scheduled_posts")).toBe(true);
  });
});

describe("output honesty (visible actions)", () => {
  it("read_scheduled_post marks the post body sensitive", () => {
    const m = meta("eden:read_scheduled_post");
    const text = m.outputs.find((o) => o.name === "text");
    expect(text?.sensitive).toBe(true);
  });
});

describe("all VISIBLE Batch-3 metas are in EDEN_ACTION_METAS", () => {
  it("EDEN_ACTION_METAS includes the 5 visible Batch-3 keys and none of the 3 deferred", () => {
    const keys = new Set(EDEN_ACTION_METAS.map((m) => m.key));
    for (const k of BATCH3_VISIBLE) expect(keys.has(k)).toBe(true);
    for (const k of BATCH3_DEFERRED) expect(keys.has(k)).toBe(false);
  });
});
