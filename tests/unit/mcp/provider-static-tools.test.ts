/** @jest-environment node */
/**
 * Phase A-2 provider readiness / metadata-consistency MCP tools.
 *
 * Business rule: these are REPO-STATIC, read-only orientation tools. They scan
 * files / parse text / read the committed option-source JSON — they must never
 * execute provider code, call an API, hit a DB, or read secrets, and must report
 * anything unparseable as null/"unknown" rather than guessing. A regression here
 * would either widen the read surface or emit a confident-but-wrong readiness
 * claim.
 */
import { buildRegistry } from "@/scripts/mcp/tools";
import { providerTools } from "@/scripts/mcp/tools/providers";
import {
  classifyProviderConsistency,
  countMetaFiles,
  listProviderIds,
  loadRegisteredOptionSources,
  loadRegistryProviderIds,
  referencedOptionSources,
} from "@/scripts/mcp/lib/providerStatics";

const call = (name: string, args: Record<string, unknown> = {}): string => {
  const t = providerTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t.handler(args) as string;
};

const base = {
  manifestReadable: true,
  actionsCap: true,
  webhookCap: false,
  pollingCap: false,
  actionMetaCount: 5,
  triggerMetaCount: 0,
  inRegistry: true,
};

describe("classifyProviderConsistency (pure severity matrix)", () => {
  it("is clean when manifest matches the files and provider is registered", () => {
    expect(classifyProviderConsistency(base)).toEqual([]);
  });

  it("errors when actions=true but no action meta files", () => {
    const f = classifyProviderConsistency({ ...base, actionMetaCount: 0 });
    expect(f).toEqual([{ severity: "error", message: expect.stringContaining("actions=true but no") }]);
  });

  it("warns when action files exist but capabilities.actions=false", () => {
    const f = classifyProviderConsistency({ ...base, actionsCap: false, actionMetaCount: 3 });
    expect(f[0]?.severity).toBe("warning");
  });

  it("is unknown when actions present but capability not parseable", () => {
    const f = classifyProviderConsistency({ ...base, actionsCap: null, actionMetaCount: 3 });
    expect(f[0]?.severity).toBe("unknown");
  });

  it("errors when a trigger capability is claimed but no trigger files", () => {
    const f = classifyProviderConsistency({ ...base, webhookCap: true, triggerMetaCount: 0 });
    expect(f).toEqual([{ severity: "error", message: expect.stringContaining("trigger capability but no") }]);
  });

  it("warns when trigger files exist but no trigger capability flag is true", () => {
    const f = classifyProviderConsistency({ ...base, triggerMetaCount: 4 });
    expect(f[0]?.severity).toBe("warning");
  });

  it("is unknown when trigger files exist but trigger caps unparseable", () => {
    const f = classifyProviderConsistency({ ...base, webhookCap: null, pollingCap: null, triggerMetaCount: 4 });
    expect(f[0]?.severity).toBe("unknown");
  });

  it("warns when not in registry, and stays silent when registry membership is unknown", () => {
    expect(classifyProviderConsistency({ ...base, inRegistry: false })[0]?.severity).toBe("warning");
    expect(classifyProviderConsistency({ ...base, inRegistry: null })).toEqual([]);
  });

  it("emits a single warning when the manifest is unreadable (no guessing)", () => {
    expect(classifyProviderConsistency({ ...base, manifestReadable: false })).toEqual([
      { severity: "warning", message: expect.stringContaining("could not be read") },
    ]);
  });
});

describe("static sources (real repo)", () => {
  it("lists provider ids that have a manifest", () => {
    const ids = listProviderIds();
    expect(ids).toEqual(expect.arrayContaining(["slack", "gmail"]));
  });

  it("counts action meta files (positive for a real provider, 0 for a missing one)", () => {
    expect(countMetaFiles("slack", "actions")).toBeGreaterThan(0);
    expect(countMetaFiles("slack", "triggers")).toBeGreaterThan(0);
    expect(countMetaFiles("definitely_not_a_provider", "actions")).toBe(0);
  });

  it("loads registered option sources from the committed JSON", () => {
    const { sources, error } = loadRegisteredOptionSources();
    expect(error).toBeNull();
    expect(sources.some((s) => s.provider === "slack")).toBe(true);
  });

  it("finds option-source references in *.meta.ts via optionsSource:", () => {
    const refs = referencedOptionSources(["slack"]);
    expect(refs.has("slack:channels")).toBe(true);
  });

  it("parses registry provider imports", () => {
    const ids = loadRegistryProviderIds();
    expect(ids).not.toBeNull();
    expect(ids).toEqual(expect.arrayContaining(["slack"]));
  });
});

describe("provider_capability_matrix", () => {
  it("scopes to one provider and rejects invalid/unknown ids", () => {
    const slack = call("provider_capability_matrix", { provider: "slack" });
    expect(slack).toContain("slack");
    expect(slack).toMatch(/isEnabled=/);
    expect(slack).toMatch(/actions=/);
    expect(call("provider_capability_matrix", { provider: "BAD!" })).toMatch(/invalid provider id/);
    expect(call("provider_capability_matrix", { provider: "nope" })).toMatch(/no manifest found/);
  });

  it("returns one block per provider when unscoped (bounded)", () => {
    const out = call("provider_capability_matrix", {});
    const blocks = out.split("\n").filter((l) => /^- [a-z]/.test(l));
    expect(blocks.length).toBeGreaterThanOrEqual(20);
    expect(blocks.length).toBe(listProviderIds().length);
  });
});

describe("provider_action_trigger_counts", () => {
  it("reports counts consistent with the helper, plus option-source + discovery flags", () => {
    const out = call("provider_action_trigger_counts", { provider: "slack" });
    const actions = countMetaFiles("slack", "actions");
    expect(out).toContain(`actions=${actions}`);
    expect(out).toMatch(/triggers=\d+/);
    expect(out).toMatch(/optionSources=\d+/);
    expect(out).toMatch(/discoveryMeta=(present|absent)/);
  });
});

describe("provider_metadata_consistency_check", () => {
  it("summarizes severities for one provider", () => {
    const out = call("provider_metadata_consistency_check", { provider: "slack" });
    expect(out).toContain("slack");
    expect(out).toMatch(/errors=\d+ warnings=\d+ unknown=\d+/);
  });

  it("includes a cross-registry section when scanning all providers", () => {
    const out = call("provider_metadata_consistency_check", {});
    expect(out).toContain("Cross-registry:");
  });
});

describe("option_source_coverage_check", () => {
  it("cross-checks referenced vs registered without false MISSING for a wired source", () => {
    const out = call("option_source_coverage_check", { provider: "slack" });
    expect(out).toMatch(/referenced\(\d+\) vs registered\(\d+\)/);
    // slack:channels is both referenced and registered → never a MISSING error.
    expect(out).not.toContain("[ERROR] slack:channels");
  });

  it("handles a provider with no option sources without crashing", () => {
    const out = call("option_source_coverage_check", { provider: "stripe" });
    expect(out).toContain("Option-source coverage");
  });
});

describe("registry wiring", () => {
  it("registers the 4 Phase A-2 tools with unique names", () => {
    const names = buildRegistry().list().map((t) => t.name);
    for (const n of [
      "provider_capability_matrix",
      "provider_action_trigger_counts",
      "provider_metadata_consistency_check",
      "option_source_coverage_check",
    ]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
