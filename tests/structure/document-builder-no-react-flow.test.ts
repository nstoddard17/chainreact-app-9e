/**
 * Structural guard — the Document Builder module is canvas-agnostic
 * (5.DUAL-BUILDER-1 / CS-1).
 *
 * `features/workflow-builder/document/` renders the SAME canonical graphSlice
 * draft as the canvas but must never depend on React Flow: the projection and
 * tier classifier are pure data code, and the components render only the
 * derived DocumentModel. This test locks that boundary, plus the pure files'
 * React-freeness and the flag's default-OFF read.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOCUMENT_DIR = "features/workflow-builder/document";

function documentFiles(): string[] {
  return readdirSync(resolve(process.cwd(), DOCUMENT_DIR)).filter((f) =>
    /\.(ts|tsx)$/.test(f),
  );
}

/**
 * Read a source file with comments stripped, so the scan asserts on actual
 * CODE — not doc comments that legitimately NAME the boundary they enforce
 * (same technique as builder-ai-rail-no-old-endpoint.test.ts).
 */
function read(rel: string): string {
  const src = readFileSync(resolve(process.cwd(), rel), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("document builder — no React Flow / canvas coupling", () => {
  it("covers the expected module files", () => {
    const files = documentFiles();
    for (const expected of [
      "projection.ts",
      "projectionTiers.ts",
      "projectionText.ts",
      "documentModel.ts",
      "documentViewPref.ts",
      "DocumentView.tsx",
      "index.ts",
      // CS-3 — Finish Setup queue + Whole Workflow map.
      "documentOutline.ts",
      "setupQueueModel.ts",
      "wholeWorkflowMapModel.ts",
      "documentNavigation.ts",
      "FinishSetupBanner.tsx",
      "FinishSetupControls.tsx",
      "WholeWorkflowMap.tsx",
      "useFinishSetupQueue.ts",
      // CS-4 — persistent manual sections.
      "documentSections.ts",
      "documentSectionCommands.ts",
      "DocumentSectionHeader.tsx",
      // CS-5 — branch authoring commands + lane context.
      "documentBranchCommands.ts",
      "documentBranchContext.ts",
    ]) {
      expect(files).toContain(expected);
    }
  });

  it.each(documentFiles())("%s does not import React Flow", (file) => {
    const src = read(`${DOCUMENT_DIR}/${file}`);
    expect(src).not.toMatch(/@xyflow\/react/);
    expect(src).not.toMatch(/from ["']reactflow["']/);
    // No canvas adapter imports either — the seam runs the other direction.
    expect(src).not.toMatch(/from ["'].*canvas\//);
  });

  it.each([
    "projection.ts",
    "projectionTiers.ts",
    "projectionText.ts",
    "documentModel.ts",
    "documentViewPref.ts",
    // CS-3 pure derivations — queue/map/navigation models are React-free data.
    "documentOutline.ts",
    "setupQueueModel.ts",
    "wholeWorkflowMapModel.ts",
    "documentNavigation.ts",
    // CS-4 pure section grouping/summary + command resolution.
    "documentSections.ts",
    "documentSectionCommands.ts",
    // CS-5 pure lane-context derivation (breadcrumbs / sibling lanes / depth).
    "documentBranchContext.ts",
  ])(
    "%s is pure (no React, no store, no fetch)",
    (file) => {
      const src = read(`${DOCUMENT_DIR}/${file}`);
      expect(src).not.toMatch(/from ["']react["']/);
      expect(src).not.toMatch(/use client/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/zustand/);
      expect(src).not.toMatch(/from ["']@\/(services|repositories|lib\/api)\//);
    },
  );

  it("the flag module reads ENABLE_DOCUMENT_BUILDER at call time, default OFF", () => {
    const src = read("services/workflows/documentBuilderFlags.ts");
    expect(src).toMatch(/ENABLE_DOCUMENT_BUILDER/);
    expect(src).toMatch(/=== "true"/);
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });

  it("the builder page resolves the flag server-side (no client env read)", () => {
    const page = read("app/workflows/[id]/page.tsx");
    expect(page).toMatch(/isDocumentBuilderEnabled\(\)/);
    const documentSources = documentFiles().map((f) => read(`${DOCUMENT_DIR}/${f}`)).join("\n");
    expect(documentSources).not.toMatch(/ENABLE_DOCUMENT_BUILDER/);
    expect(documentSources).not.toMatch(/process\.env/);
  });
});
