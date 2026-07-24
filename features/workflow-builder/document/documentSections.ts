import type { WorkflowPresentation } from "@/contracts/workflowPresentation";
import type { DocumentBlock, DocumentModel } from "./documentModel";

/**
 * Document Builder — pure manual-section grouping over the projected DocumentModel
 * (5.DUAL-BUILDER-1 / CS-4).
 *
 * SECTIONS ORGANIZE EXECUTABLE NODES, BUT THEY ARE NEVER EXECUTABLE NODES.
 *
 * Grouping is applied AFTER the safe graph projection, never during it: the
 * graph is projected exactly as before (same order, forks, rejoins, tiers), and
 * this file only WRAPS contiguous top-level blocks into named sections by their
 * canonical node ids. It is pure, deterministic, and total:
 *   - every top-level block appears exactly once (loose, or inside one section);
 *   - a fork is ONE structural unit — its whole projected subtree belongs to the
 *     section its header node is assigned to (nested lane steps can't be
 *     independently sectioned in CS-4);
 *   - section grouping follows DOCUMENT (execution) order, never the metadata's
 *     array order — when a section's members aren't contiguous in document order
 *     it renders as multiple runs flagged `split`, never silently reordering the
 *     workflow;
 *   - execution semantics, rejoin detection, and Tier B/C degradation are
 *     unchanged (this reads the already-projected blocks, never the graph).
 */

/** The canonical node id used to decide which section a top-level block belongs to. */
export function blockPrimaryNodeId(block: DocumentBlock): string | null {
  if (block.kind === "sentence") return block.nodeId;
  if (block.kind === "fork") return block.nodeId;
  return block.nodeIds[0] ?? null;
}

/** Every canonical node id owned by a projected block (fork = its whole subtree). */
export function blockOwnedNodeIds(block: DocumentBlock): string[] {
  if (block.kind === "sentence") return [block.nodeId];
  if (block.kind === "complex") return [...block.nodeIds];
  // fork: header + every node in every lane (recursive), so wrapping a fork
  // sections the whole structural unit.
  const ids: string[] = [block.nodeId];
  for (const lane of block.lanes) {
    for (const b of lane.blocks) ids.push(...blockOwnedNodeIds(b));
  }
  return ids;
}

export interface DocumentSection {
  readonly id: string;
  readonly title: string;
  readonly collapsed: boolean;
  readonly blocks: readonly DocumentBlock[];
  /** True when this section's membership is split across ≥2 runs in document order. */
  readonly split: boolean;
  /** 0 for the first (or only) run of a section; ≥1 for later runs of a split section. */
  readonly runIndex: number;
}

export type SectionedRow =
  | { readonly kind: "loose"; readonly block: DocumentBlock }
  | { readonly kind: "section"; readonly section: DocumentSection };

export interface SectionedDocument {
  readonly rows: readonly SectionedRow[];
  /** True when any section rendered as more than one run (membership not contiguous). */
  readonly hasSplitSection: boolean;
}

/**
 * Group a DocumentModel's TOP-LEVEL blocks into manual sections. Only top-level
 * blocks are groupable (nested lane steps stay inside their fork). Contiguous
 * runs of blocks sharing a section id become one section row; a section whose
 * members are interrupted by out-of-section blocks renders as multiple runs,
 * each flagged `split` (honest degradation — never reordering the workflow).
 */
export function groupBlocksIntoSections(
  blocks: readonly DocumentBlock[],
  presentation: WorkflowPresentation | null | undefined,
): SectionedDocument {
  if (!presentation || presentation.sections.length === 0) {
    return { rows: blocks.map((block) => ({ kind: "loose", block }) as const), hasSplitSection: false };
  }

  // node id → owning section (one section per node, already normalized upstream).
  const nodeToSection = new Map<string, WorkflowPresentation["sections"][number]>();
  for (const section of presentation.sections) {
    for (const id of section.nodeIds) nodeToSection.set(id, section);
  }

  const sectionOf = (block: DocumentBlock): WorkflowPresentation["sections"][number] | null => {
    const primary = blockPrimaryNodeId(block);
    return primary ? (nodeToSection.get(primary) ?? null) : null;
  };

  // First pass: contiguous runs keyed by section id.
  interface Run {
    readonly sectionId: string | null;
    readonly section: WorkflowPresentation["sections"][number] | null;
    readonly blocks: DocumentBlock[];
  }
  const runs: Run[] = [];
  for (const block of blocks) {
    const section = sectionOf(block);
    const sectionId = section?.id ?? null;
    const open = runs[runs.length - 1];
    if (open && open.sectionId === sectionId) {
      open.blocks.push(block);
    } else {
      runs.push({ sectionId, section, blocks: [block] });
    }
  }

  // Second pass: detect split sections (a section id appearing in ≥2 runs).
  const runCountBySection = new Map<string, number>();
  for (const run of runs) {
    if (run.sectionId) runCountBySection.set(run.sectionId, (runCountBySection.get(run.sectionId) ?? 0) + 1);
  }

  const seenRunIndex = new Map<string, number>();
  let hasSplitSection = false;
  const rows: SectionedRow[] = [];
  for (const run of runs) {
    if (!run.section) {
      // A run of loose blocks → per-block loose rows so insertion/wrap
      // affordances stay per-block; order preserved.
      for (const block of run.blocks) rows.push({ kind: "loose", block });
      continue;
    }
    const runIndex = seenRunIndex.get(run.sectionId!) ?? 0;
    seenRunIndex.set(run.sectionId!, runIndex + 1);
    const split = (runCountBySection.get(run.sectionId!) ?? 0) > 1;
    if (split) hasSplitSection = true;
    rows.push({
      kind: "section",
      section: {
        id: run.section.id,
        title: run.section.title,
        collapsed: run.section.collapsed === true,
        blocks: run.blocks,
        split,
        runIndex,
      },
    });
  }

  return { rows, hasSplitSection };
}

// ---- collapsed summary (deterministic, no LLM, never persisted) -------------

export interface SectionSummaryContext {
  readonly providerLabels?: Readonly<Record<string, string>> | undefined;
  /** Count of unresolved supported setup items per node id (from the CS-3 queue). */
  readonly unresolvedByNode?: ReadonlyMap<string, number> | undefined;
}

export interface SectionSummary {
  readonly stepCount: number;
  readonly providers: readonly string[];
  /** Fork lane labels when the section is (or contains) a single fork ("hot · warm · cold"). */
  readonly pathLabels: readonly string[];
  readonly unresolvedCount: number;
  readonly hasWarning: boolean;
  /** Assembled one-line summary text, e.g. "3 steps · Slack, HubSpot · 1 detail still needed". */
  readonly text: string;
}

/**
 * Deterministically summarize a collapsed section from the DocumentModel. Counts
 * executable steps, distinct provider labels, fork paths, unresolved setup
 * items, and structural warnings — never an LLM, never persisted text.
 */
export function summarizeDocumentSection(
  section: DocumentSection,
  ctx: SectionSummaryContext = {},
): SectionSummary {
  let stepCount = 0;
  const providers: string[] = [];
  const seenProviders = new Set<string>();
  const pathLabels: string[] = [];
  let unresolvedCount = 0;
  let hasWarning = false;

  const addProvider = (providerId: string, label: string) => {
    if (providerId === "native") return; // native logic nodes aren't "apps"
    if (seenProviders.has(providerId)) return;
    seenProviders.add(providerId);
    providers.push(label);
  };
  const countUnresolved = (nodeId: string) => {
    unresolvedCount += ctx.unresolvedByNode?.get(nodeId) ?? 0;
  };

  const walk = (blocks: readonly DocumentBlock[]): void => {
    for (const block of blocks) {
      if (block.kind === "sentence") {
        stepCount += 1;
        addProvider(block.providerId, block.providerLabel);
        countUnresolved(block.nodeId);
      } else if (block.kind === "fork") {
        stepCount += 1;
        addProvider(block.providerId, block.providerLabel);
        countUnresolved(block.nodeId);
        for (const lane of block.lanes) {
          if (lane.warning) hasWarning = true;
          if (lane.title) pathLabels.push(lane.title);
          walk(lane.blocks);
        }
      } else {
        hasWarning = true; // complex/unsupported region
      }
    }
  };
  walk(section.blocks);
  if (section.split) hasWarning = true;

  const parts: string[] = [];
  parts.push(`${stepCount} step${stepCount === 1 ? "" : "s"}`);
  if (pathLabels.length > 0) {
    parts.push(`${pathLabels.length} path${pathLabels.length === 1 ? "" : "s"} · ${pathLabels.join(" · ")}`);
  } else if (providers.length > 0) {
    parts.push(providers.slice(0, 3).join(", "));
  }
  if (unresolvedCount > 0) {
    parts.push(`${unresolvedCount} detail${unresolvedCount === 1 ? "" : "s"} still needed`);
  }
  if (hasWarning) parts.push("needs attention");

  return {
    stepCount,
    providers,
    pathLabels,
    unresolvedCount,
    hasWarning,
    text: parts.join(" · "),
  };
}

/**
 * The ordered top-level blocks of a model (helper for the command layer's
 * contiguity checks). Top-level = the model's own `blocks` array.
 */
export function topLevelBlocks(model: DocumentModel): readonly DocumentBlock[] {
  return model.blocks;
}
