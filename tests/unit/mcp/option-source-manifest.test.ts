/**
 * Drift guard + generator for the committed option-source manifest
 * (scripts/mcp/data/option-source-manifest.json) — Stage 2A, CS-2.
 *
 * Why a committed manifest at all: the internal MCP server must NOT import
 * `getOptionsResolver` / app code (the import-boundary guard). So the real
 * registry shape is exported ONCE into a committed JSON the MCP server reads as
 * text. This test keeps that JSON in lockstep with the live registry.
 *
 * Two modes:
 *   - default: assert the committed JSON deep-equals what the live registry
 *     produces (DRIFT detection — a new/removed/renamed resolver fails here).
 *   - UPDATE_OPTION_SOURCE_MANIFEST=1: regenerate the committed JSON instead of
 *     asserting. This is the "generator" entry point:
 *         UPDATE_OPTION_SOURCE_MANIFEST=1 npx jest tests/unit/mcp/option-source-manifest.test.ts
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { listOptionsResolvers } from "@/services/options/_registry";

const REPO_ROOT = resolve(__dirname, "../../..");
const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "scripts/mcp/data/option-source-manifest.json",
);

interface ManifestEntry {
  source: string;
  provider: string;
  requiresIntegration: boolean;
  requiredDeps: string[] | null;
}

/** Pure: derive the manifest entries from the live registry (sorted by source). */
export function buildOptionSourceManifestEntries(): ManifestEntry[] {
  return listOptionsResolvers()
    .map((r) => ({
      source: r.source,
      provider: r.provider,
      requiresIntegration: r.requiresIntegration,
      requiredDeps: r.requiredDeps ? [...r.requiredDeps] : null,
    }))
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
}

function manifestFileBody(entries: ManifestEntry[]): string {
  const doc = {
    _comment:
      "GENERATED from services/options/_registry.ts (listOptionsResolvers). Do NOT hand-edit. Regenerate: UPDATE_OPTION_SOURCE_MANIFEST=1 npx jest tests/unit/mcp/option-source-manifest.test.ts. Drift is enforced by tests/unit/mcp/option-source-manifest.test.ts.",
    sources: entries,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

describe("option-source manifest (generated, drift-checked)", () => {
  const entries = buildOptionSourceManifestEntries();

  if (process.env.UPDATE_OPTION_SOURCE_MANIFEST === "1") {
    it("regenerates the committed manifest", () => {
      mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
      writeFileSync(MANIFEST_PATH, manifestFileBody(entries), "utf8");
      expect(existsSync(MANIFEST_PATH)).toBe(true);
    });
    return;
  }

  it("committed manifest file exists", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("committed manifest has NOT drifted from the live registry", () => {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as { sources: ManifestEntry[] };
    expect(parsed.sources).toEqual(entries);
  });

  it("includes slack:channels with the right shape", () => {
    const slack = entries.find((e) => e.source === "slack:channels");
    expect(slack).toEqual({
      source: "slack:channels",
      provider: "slack",
      requiresIntegration: true,
      requiredDeps: null,
    });
  });

  it("every entry has a <provider>:<resource> source and matching provider prefix", () => {
    for (const e of entries) {
      expect(e.source).toMatch(/^[a-z][a-z0-9-]*:[a-z][a-z0-9_]*$/);
      expect(e.source.startsWith(`${e.provider}:`)).toBe(true);
    }
  });
});
