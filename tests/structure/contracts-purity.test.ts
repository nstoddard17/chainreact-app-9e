/**
 * Structure boundary test: contracts/ is pure — zod + siblings only.
 *
 * MOBILE-COMPANION-M0-CONTRACTS-FOUNDATION-1. `contracts/` is the wire-shape
 * layer shared by every consumer, including the extractable
 * `packages/mobile-contracts` package — so it must depend on nothing from the
 * application: no `@/` alias imports (core, services, repositories, app,
 * features, components, lib, utils, stores), no node builtins, no React, no
 * framework. The one historical impurity (`vehicleSuggestions.ts` importing
 * `@/core/resourceLinks/linkHealth`) was corrected by moving the canonical
 * union into `contracts/linkHealth.ts`; this test keeps it corrected.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const CONTRACTS_DIR = join(ROOT, "contracts");

function contractFiles(): string[] {
  return readdirSync(CONTRACTS_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(CONTRACTS_DIR, name));
}

function stripComments(source: string): string {
  // Prose in doc comments legitimately contains `… from "…"`; only real
  // import statements matter here.
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:from|import)\s+["']([^"']+)["']/g;
  for (const match of stripComments(source).matchAll(re)) {
    const spec = match[1];
    if (spec !== undefined) specs.push(spec);
  }
  return specs;
}

describe("contracts/ purity", () => {
  it("has files to check (non-vacuous)", () => {
    expect(contractFiles().length).toBeGreaterThan(10);
  });

  it("every contracts/ import is zod or a sibling contracts module", () => {
    const offenders: string[] = [];
    for (const file of contractFiles()) {
      const src = readFileSync(file, "utf8");
      for (const spec of importSpecifiers(src)) {
        const ok = spec === "zod" || /^\.\/[A-Za-z0-9_-]+$/.test(spec);
        if (!ok) {
          offenders.push(`${file.slice(ROOT.length + 1)} imports "${spec}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the linkHealth union lives in contracts and core re-imports it (impurity stays fixed)", () => {
    const contractsSrc = readFileSync(join(CONTRACTS_DIR, "linkHealth.ts"), "utf8");
    expect(contractsSrc).toContain("LINK_HEALTH_STATUSES");

    const coreSrc = readFileSync(
      join(ROOT, "core", "resourceLinks", "linkHealth.ts"),
      "utf8",
    );
    expect(coreSrc).toContain('from "@/contracts/linkHealth"');
    // The union is defined exactly once — core must not re-declare it.
    expect(coreSrc).not.toMatch(/export type LinkHealthStatus\s*=\s*\|?\s*"ok"/);
  });
});
