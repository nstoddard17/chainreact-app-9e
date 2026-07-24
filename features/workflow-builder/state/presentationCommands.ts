import type { WorkflowNode } from "@/contracts/workflow";
import {
  MAX_SECTION_TITLE,
  normalizePresentation,
  type WorkflowPresentation,
} from "@/contracts/workflowPresentation";

/**
 * 5.DUAL-BUILDER-1 CS-4 — pure presentation SECTION command logic.
 *
 * Extracted from graphSlice so the store keeps only thin wrappers (validate live
 * state → call one of these → `set` + mark dirty). Each function is pure and
 * total: it takes the current nodes + presentation and returns the NEXT
 * presentation (already normalized) plus a typed, non-throwing result. It never
 * touches nodes/edges/config/positions/labels — sections organize executable
 * nodes but are never executable nodes.
 */

export type SectionMutationResult =
  | { readonly ok: true; readonly sectionId: string }
  | { readonly ok: false; readonly reason: SectionMutationRefusal };

export type SectionMutationRefusal =
  | "empty_selection"
  | "empty_title"
  | "section_missing"
  | "no_change";

export type PresentationSection = WorkflowPresentation["sections"][number];

export interface PresentationContext {
  readonly nodes: readonly WorkflowNode[];
  readonly presentation: WorkflowPresentation | null;
}
export interface SectionCommandOutcome {
  /** The next presentation to commit — only when `result.ok`. */
  readonly presentation: WorkflowPresentation | null;
  readonly result: SectionMutationResult;
}

/** Remove node ids from every section, dropping any left empty (same ref when unchanged). */
export function stripNodesFromSections(
  sections: readonly PresentationSection[],
  remove: ReadonlySet<string>,
): readonly PresentationSection[] {
  let changed = false;
  const next: PresentationSection[] = [];
  for (const s of sections) {
    const kept = s.nodeIds.filter((id) => !remove.has(id));
    if (kept.length === s.nodeIds.length) {
      next.push(s);
      continue;
    }
    changed = true;
    if (kept.length > 0) next.push({ ...s, nodeIds: kept });
  }
  return changed ? next : sections;
}

const validIds = (ctx: PresentationContext) => new Set(ctx.nodes.map((n) => n.id));
const refuse = (reason: SectionMutationRefusal): SectionCommandOutcome => ({
  presentation: null,
  result: { ok: false, reason },
});

export function createSectionCommand(
  ctx: PresentationContext,
  input: { nodeIds: readonly string[]; title: string; collapsed?: boolean },
  newSectionId: () => string,
): SectionCommandOutcome {
  const valid = validIds(ctx);
  const nodeIds = input.nodeIds.filter((id) => valid.has(id));
  if (nodeIds.length === 0) return refuse("empty_selection");
  const title = input.title.trim().slice(0, MAX_SECTION_TITLE);
  if (title.length === 0) return refuse("empty_title");

  const id = newSectionId();
  const stripped = stripNodesFromSections(ctx.presentation?.sections ?? [], new Set(nodeIds));
  const draft = {
    version: 1,
    sections: [
      ...stripped,
      { id, title, nodeIds: [...nodeIds], ...(input.collapsed ? { collapsed: true } : {}) },
    ],
  };
  return { presentation: normalizePresentation(draft, valid), result: { ok: true, sectionId: id } };
}

export function renameSectionCommand(
  ctx: PresentationContext,
  sectionId: string,
  title: string,
): SectionCommandOutcome {
  const section = ctx.presentation?.sections.find((s) => s.id === sectionId);
  if (!section) return refuse("section_missing");
  const trimmed = title.trim().slice(0, MAX_SECTION_TITLE);
  if (trimmed.length === 0) return refuse("empty_title");
  if (trimmed === section.title) return refuse("no_change");
  const draft = {
    version: 1,
    sections: ctx.presentation!.sections.map((s) =>
      s.id === sectionId ? { ...s, title: trimmed } : s,
    ),
  };
  return {
    presentation: normalizePresentation(draft, validIds(ctx)),
    result: { ok: true, sectionId },
  };
}

export function setSectionCollapsedCommand(
  ctx: PresentationContext,
  sectionId: string,
  collapsed: boolean,
): SectionCommandOutcome {
  const section = ctx.presentation?.sections.find((s) => s.id === sectionId);
  if (!section) return refuse("section_missing");
  if ((section.collapsed === true) === collapsed) return refuse("no_change");
  const draft = {
    version: 1,
    sections: ctx.presentation!.sections.map((s) =>
      s.id === sectionId
        ? collapsed
          ? { ...s, collapsed: true }
          : { id: s.id, title: s.title, nodeIds: s.nodeIds }
        : s,
    ),
  };
  return {
    presentation: normalizePresentation(draft, validIds(ctx)),
    result: { ok: true, sectionId },
  };
}

export function addNodesToSectionCommand(
  ctx: PresentationContext,
  sectionId: string,
  nodeIds: readonly string[],
): SectionCommandOutcome {
  const section = ctx.presentation?.sections.find((s) => s.id === sectionId);
  if (!section) return refuse("section_missing");
  const valid = validIds(ctx);
  const toAdd = nodeIds.filter((id) => valid.has(id));
  if (toAdd.length === 0) return refuse("empty_selection");
  if (toAdd.every((id) => section.nodeIds.includes(id))) return refuse("no_change");
  const addSet = new Set(toAdd);
  const sections = ctx.presentation!.sections.map((s) =>
    s.id === sectionId
      ? { ...s, nodeIds: [...s.nodeIds.filter((id) => !addSet.has(id)), ...toAdd] }
      : { ...s, nodeIds: s.nodeIds.filter((id) => !addSet.has(id)) },
  );
  return {
    presentation: normalizePresentation({ version: 1, sections }, valid),
    result: { ok: true, sectionId },
  };
}

export function removeNodesFromSectionCommand(
  ctx: PresentationContext,
  nodeIds: readonly string[],
): SectionCommandOutcome {
  if (!ctx.presentation) return refuse("no_change");
  const removeSet = new Set(nodeIds);
  const owning = ctx.presentation.sections.find((s) => s.nodeIds.some((id) => removeSet.has(id)));
  const stripped = stripNodesFromSections(ctx.presentation.sections, removeSet);
  if (stripped === ctx.presentation.sections) return refuse("no_change");
  return {
    presentation: normalizePresentation({ version: 1, sections: stripped }, validIds(ctx)),
    result: { ok: true, sectionId: owning?.id ?? "" },
  };
}

export function ungroupSectionCommand(
  ctx: PresentationContext,
  sectionId: string,
): SectionCommandOutcome {
  if (!ctx.presentation?.sections.some((s) => s.id === sectionId)) return refuse("section_missing");
  const sections = ctx.presentation.sections.filter((s) => s.id !== sectionId);
  return {
    presentation: normalizePresentation({ version: 1, sections }, validIds(ctx)),
    result: { ok: true, sectionId },
  };
}
