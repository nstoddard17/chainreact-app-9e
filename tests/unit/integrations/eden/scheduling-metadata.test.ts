/**
 * @jest-environment node
 *
 * Eden Batch-3 Builder metadata + React-Agent catalog (EDEN-6). The React Agent catalog is fully
 * metadata-driven (services/ai/tools/providerCatalog.ts), so these assertions ARE the agent-facing
 * contract: correct risk classification (draft=medium vs publish=high+confirm), structured fields
 * only (no raw JSON, no MCP tool names / resource URIs), and dependent option sources.
 */
import { getActionMeta, getNodeSchema, getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { EDEN_ACTION_METAS } from "@/services/discovery/providers/eden";

const BATCH3 = [
  "eden:create_scheduling_draft",
  "eden:read_scheduled_post",
  "eden:schedule_post",
  "eden:publish_post_now",
  "eden:update_scheduled_post",
  "eden:reschedule_post",
  "eden:set_first_comment",
  "eden:cancel_scheduled_post",
];

function meta(key: string) {
  const r = getActionMeta(key);
  if (!r.ok) throw new Error(`no meta for ${key}`);
  return r.data;
}

describe("registration + catalog visibility", () => {
  it("every Batch-3 action is registered and visible in the provider catalog", () => {
    const cat = getProviderCatalog();
    expect(cat.ok).toBe(true);
    const eden = cat.ok ? cat.data.providers.find((p) => p.id === "eden") : undefined;
    const keys = new Set(eden!.actions.map((a) => a.key));
    for (const k of BATCH3) expect(keys.has(k)).toBe(true);
  });
});

describe("risk classification (drives agent + builder warnings)", () => {
  it("publish_post_now is high-risk AND requires confirmation", () => {
    const m = meta("eden:publish_post_now");
    expect(m.riskLevel).toBe("high");
    expect(m.requiresConfirmation).toBe(true);
  });
  it("schedule_post is high-risk (public auto-publish)", () => {
    expect(meta("eden:schedule_post").riskLevel).toBe("high");
  });
  it("create_scheduling_draft is medium and NOT confirmation-gated (safe draft)", () => {
    const m = meta("eden:create_scheduling_draft");
    expect(m.riskLevel).toBe("medium");
    expect(m.requiresConfirmation).toBe(false);
  });
  it("read_scheduled_post is low-risk", () => {
    expect(meta("eden:read_scheduled_post").riskLevel).toBe("low");
  });
});

describe("structured Builder UX — no raw JSON, no MCP internals leaked", () => {
  it("no scheduling action exposes a json field or an MCP tool name / resource URI in labels", () => {
    for (const key of BATCH3) {
      const m = meta(key);
      for (const f of m.fields) {
        expect(f.type).not.toBe("json");
        expect(f.label.toLowerCase()).not.toContain("eden_"); // no MCP tool names
        expect(f.label).not.toMatch(/https?:\/\//); // no resource URIs
        expect(f.label.toLowerCase()).not.toContain("json");
      }
    }
  });
  it("content actions expose structured platform/media fields (not a JSON blob)", () => {
    const m = meta("eden:schedule_post");
    const byName = new Map(m.fields.map((f) => [f.name, f]));
    expect(byName.get("platforms")!.type).toBe("select");
    expect(byName.get("platforms")!.multiple).toBe(true);
    expect(byName.get("media")!.type).toBe("object-list");
    expect(byName.get("scheduledAtIso")!.type).toBe("datetime-utc");
  });
});

describe("dependent option sources", () => {
  it("post selectors bind eden:scheduled_posts; schedule/guard bind eden:schedules", () => {
    const editSchema = getNodeSchema("eden:update_scheduled_post");
    expect(editSchema.ok).toBe(true);
    const deps = editSchema.ok ? editSchema.data.optionsSourceDeps : [];
    const sources = new Set(deps.map((d) => d.optionsSource));
    expect(sources.has("eden:scheduled_posts")).toBe(true);
    expect(sources.has("eden:schedules")).toBe(true);
  });
  it("workspace + schedule pickers are wired on schedule_post", () => {
    const s = getNodeSchema("eden:schedule_post");
    const sources = new Set(s.ok ? s.data.optionsSourceDeps.map((d) => d.optionsSource) : []);
    expect(sources.has("eden:workspaces")).toBe(true);
    expect(sources.has("eden:schedules")).toBe(true);
  });
});

describe("output honesty", () => {
  it("bounded post output declares id/status/scheduledAtIso and no account-identifier field", () => {
    const m = meta("eden:schedule_post");
    const names = m.outputs.map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(["id", "status", "scheduledFor", "scheduledAtIso", "targets"]));
    expect(names).not.toContain("connectionId");
    expect(names).not.toContain("accountId");
  });
  it("read_scheduled_post marks the post body sensitive", () => {
    const m = meta("eden:read_scheduled_post");
    const text = m.outputs.find((o) => o.name === "text");
    expect(text?.sensitive).toBe(true);
  });
});

describe("all Batch-3 metas parse under the ActionMeta contract", () => {
  it("EDEN_ACTION_METAS includes the 8 Batch-3 keys", () => {
    const keys = new Set(EDEN_ACTION_METAS.map((m) => m.key));
    for (const k of BATCH3) expect(keys.has(k)).toBe(true);
  });
});
