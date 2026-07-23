/**
 * @jest-environment node
 *
 * Proves that Linear's registered actions are visible + selectable in the
 * workflow builder AND discoverable by the React Agent WHILE the provider stays
 * `isExperimental: true` — WITHOUT any code change. The builder and agent are
 * driven by REGISTERED METADATA + `capabilities.actions`, never by the manifest
 * `isExperimental` flag (that flag gates only the Apps *catalog* connect surface,
 * not the action palette). This is a regression guard for that contract.
 *
 * Data-layer test on purpose: the builder's provider filter is an inline server
 * predicate (`app/workflows/[id]/page.tsx` + `app/start/page.tsx`), so we assert
 * the exact predicate against the real registry rather than render the tree.
 */
import { listProviders, getProvider } from "@/integrations/_registry";
import {
  listActionMetasForProvider,
  getActionMeta,
} from "@/services/discovery/_registry";
import { buildCapabilityCatalogKeys } from "@/services/ai-guidance/capabilityCatalog";

const LINEAR_ACTION_KEYS = [
  "linear:find_issues",
  "linear:create_issue",
  "linear:update_issue",
  "linear:add_comment",
];

/** The EXACT predicate both builder entry points use to build actionProviders. */
const BUILDER_ACTION_PROVIDER_PREDICATE = (p: {
  isEnabled: boolean;
  capabilities: { actions: boolean };
}) => p.isEnabled && p.capabilities.actions;

describe("Linear builder visibility while experimental", () => {
  const linear = getProvider("linear");

  it("Linear is experimental yet action-capable + enabled", () => {
    expect(linear).toBeDefined();
    expect(linear!.isExperimental).toBe(true); // production catalog stays hidden
    expect(linear!.isEnabled).toBe(true);
    expect(linear!.capabilities.actions).toBe(true);
    expect(linear!.apiVersion).toBe("mcp");
  });

  it("passes the builder's actionProviders filter (isExperimental is NOT a builder gate)", () => {
    const actionProviders = listProviders().filter(BUILDER_ACTION_PROVIDER_PREDICATE);
    expect(actionProviders.map((p) => p.id)).toContain("linear");
    // Sanity: the predicate genuinely excludes a hypothetical disabled provider,
    // so inclusion above is meaningful (not a vacuous always-true filter).
    expect(BUILDER_ACTION_PROVIDER_PREDICATE({ isEnabled: false, capabilities: { actions: true } })).toBe(false);
    expect(BUILDER_ACTION_PROVIDER_PREDICATE({ isEnabled: true, capabilities: { actions: false } })).toBe(false);
  });

  it("the action picker resolves all 4 registered Linear actions (GET /api/providers/linear/actions source)", () => {
    const metas = listActionMetasForProvider("linear");
    expect(metas.map((m) => m.key)).toEqual(LINEAR_ACTION_KEYS);
  });

  it("selecting an action yields a normal ActionMeta with real config + readiness data", () => {
    const create = getActionMeta("linear:create_issue");
    expect(create).toBeDefined();
    expect(create!.requiresIntegration).toBe(true);
    // Required fields drive builder readiness (setup-needed) — real, not synthetic.
    const required = create!.fields.filter((f) => f.required).map((f) => f.name);
    expect(required).toEqual(expect.arrayContaining(["title", "team"]));
  });

  it("nothing user-facing says 'MCP' (invisible protocol)", () => {
    for (const key of LINEAR_ACTION_KEYS) {
      const m = getActionMeta(key)!;
      const surface = `${m.displayName} ${m.description} ${m.fields.map((f) => `${f.label} ${f.description ?? ""}`).join(" ")}`.toLowerCase();
      expect(surface).not.toContain("mcp");
      expect(surface).not.toContain("tools/call");
    }
  });
});

describe("Linear React Agent discovery while experimental (report-only — behavior unchanged)", () => {
  it("the agent capability catalog already includes Linear's keys", () => {
    const keys = buildCapabilityCatalogKeys();
    for (const k of LINEAR_ACTION_KEYS) expect(keys).toContain(k);
  });

  it("plan validation accepts Linear action keys (getActionMeta is defined)", () => {
    for (const k of LINEAR_ACTION_KEYS) expect(getActionMeta(k)).toBeDefined();
  });
});
