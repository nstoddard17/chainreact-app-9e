import { z } from "zod";

/**
 * Document Builder — persistent manual SECTION presentation metadata
 * (5.DUAL-BUILDER-1 / CS-4).
 *
 * SECTIONS ORGANIZE EXECUTABLE NODES, BUT THEY ARE NEVER EXECUTABLE NODES.
 *
 * A workflow definition may carry ONE optional, versioned, bounded
 * presentation-only block that groups executable node ids into named manual
 * sections. It is DISPLAY metadata for the Document Builder: the execution
 * engine never reads it (it consumes only `nodes`/`edges` — see §2.5 of the
 * dual-builder plan), readiness/entitlement ignore it, and no prose or rendered
 * sentence text is ever persisted. `nodeIds` is MEMBERSHIP, not execution order
 * — Document/execution order always comes from the canonical graph projection.
 *
 * The schema here is the STRICT ingress validator (rejects unknown version,
 * over-length titles, over-cap sections/members, duplicate section ids). The
 * pure `normalizePresentation` below is the SHARED, defensive cleanup rule used
 * on every read/reconciliation path (contract transform, graphSlice hydrate,
 * save-payload build, export/template sanitizer, AI graph-replace reconcile) so
 * client and server can never drift. Because the repository read path CASTS
 * stored jsonb rather than parsing it, `normalizePresentation` accepts
 * `unknown` and never throws — malformed stored metadata degrades to a safe
 * empty state, never a crash.
 */

/** Presentation block version — currently exactly 1. Unknown versions fail safely. */
export const PRESENTATION_VERSION = 1 as const;
/** Max sections per workflow (abuse/corruption guard). */
export const MAX_SECTIONS = 50;
/** Max node-id memberships per section. */
export const MAX_SECTION_NODE_IDS = 200;
/** Max section title length (same class as node `displayName`). */
export const MAX_SECTION_TITLE = 80;

export const WorkflowPresentationSectionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(MAX_SECTION_TITLE),
    nodeIds: z.array(z.string().min(1)).max(MAX_SECTION_NODE_IDS),
    collapsed: z.boolean().optional(),
  })
  .strict();
export type WorkflowPresentationSection = z.infer<typeof WorkflowPresentationSectionSchema>;

export const WorkflowPresentationSchema = z
  .object({
    version: z.literal(PRESENTATION_VERSION),
    sections: z.array(WorkflowPresentationSectionSchema).max(MAX_SECTIONS),
  })
  .strict()
  .superRefine((pres, ctx) => {
    // Section ids must be unique (membership overlap is normalized, not
    // rejected — deletion/legacy data can transiently produce it; duplicate
    // section ids are a corruption we reject outright).
    const seen = new Set<string>();
    for (let i = 0; i < pres.sections.length; i++) {
      const id = pres.sections[i]!.id;
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", i, "id"],
          message: `Duplicate section id '${id}'.`,
        });
      }
      seen.add(id);
    }
  });
export type WorkflowPresentation = z.infer<typeof WorkflowPresentationSchema>;

// ---- pure normalization (the ONE shared cleanup rule) -----------------------

interface RawSection {
  id?: unknown;
  title?: unknown;
  nodeIds?: unknown;
  collapsed?: unknown;
}

/**
 * Defensively normalize presentation metadata against the CURRENT set of valid
 * node ids. Pure, total (never throws), deterministic, and idempotent.
 *
 * Guarantees (locked by tests):
 *   - unknown / malformed input (non-object, wrong version, non-array sections)
 *     → `null` (safe empty state);
 *   - references to node ids not in `validNodeIds` are removed;
 *   - node ids are de-duplicated within a section;
 *   - a node belongs to at most ONE section — the FIRST valid section in array
 *     order wins; later claims are dropped (deterministic ownership);
 *   - empty sections (no surviving members, or a blank/whitespace title) are
 *     removed — no empty sections ever persist;
 *   - duplicate section ids: the first wins, later duplicates dropped;
 *   - titles are trimmed and capped at `MAX_SECTION_TITLE` (defensive: keeps
 *     legacy/over-length data round-trippable through the strict contract);
 *   - section id/title/order/collapsed of valid sections are preserved;
 *   - nodes, edges, config, positions, labels, and display names are NEVER read
 *     or altered (this touches ONLY presentation);
 *   - returns the SAME reference when the input is already well-formed and needs
 *     no cleanup (byte-equivalent output), so save/undo reference checks hold.
 */
export function normalizePresentation(
  input: unknown,
  validNodeIds: ReadonlySet<string>,
): WorkflowPresentation | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") return null;
  const obj = input as { version?: unknown; sections?: unknown };
  if (obj.version !== PRESENTATION_VERSION) return null;
  if (!Array.isArray(obj.sections)) return null;

  const claimedNodes = new Set<string>();
  const seenSectionIds = new Set<string>();
  const sections: WorkflowPresentationSection[] = [];

  for (const rawUnknown of obj.sections.slice(0, MAX_SECTIONS)) {
    if (rawUnknown === null || typeof rawUnknown !== "object") continue;
    const raw = rawUnknown as RawSection;
    if (typeof raw.id !== "string" || raw.id.length === 0) continue;
    if (seenSectionIds.has(raw.id)) continue; // duplicate section id → drop later
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (title.length === 0) continue; // blank title → drop section
    const cappedTitle = title.length > MAX_SECTION_TITLE ? title.slice(0, MAX_SECTION_TITLE) : title;

    const rawIds = Array.isArray(raw.nodeIds) ? raw.nodeIds : [];
    const nodeIds: string[] = [];
    for (const idUnknown of rawIds) {
      if (typeof idUnknown !== "string") continue;
      if (!validNodeIds.has(idUnknown)) continue; // stale membership pruned
      if (claimedNodes.has(idUnknown)) continue; // one section per node (first wins)
      if (nodeIds.includes(idUnknown)) continue; // dedup within section
      nodeIds.push(idUnknown);
      if (nodeIds.length >= MAX_SECTION_NODE_IDS) break;
    }
    if (nodeIds.length === 0) continue; // no empty sections

    for (const id of nodeIds) claimedNodes.add(id);
    seenSectionIds.add(raw.id);
    sections.push({
      id: raw.id,
      title: cappedTitle,
      nodeIds,
      ...(raw.collapsed === true ? { collapsed: true } : {}),
    });
  }

  if (sections.length === 0) return null;
  const normalized: WorkflowPresentation = { version: PRESENTATION_VERSION, sections };
  // Byte-equivalence: return the input reference when nothing changed, so
  // reference-equality dirty checks (save/undo/redo) stay correct.
  return presentationEquals(input, normalized) ? (input as WorkflowPresentation) : normalized;
}

/** Structural equality between an arbitrary input and a normalized presentation. */
function presentationEquals(a: unknown, b: WorkflowPresentation): boolean {
  if (a === null || typeof a !== "object") return false;
  const ao = a as { version?: unknown; sections?: unknown };
  if (ao.version !== b.version) return false;
  if (!Array.isArray(ao.sections) || ao.sections.length !== b.sections.length) return false;
  for (let i = 0; i < b.sections.length; i++) {
    const x = ao.sections[i] as RawSection | null;
    const y = b.sections[i]!;
    if (!x || typeof x !== "object") return false;
    if (x.id !== y.id || x.title !== y.title) return false;
    if ((x.collapsed === true) !== (y.collapsed === true)) return false;
    if (!Array.isArray(x.nodeIds) || x.nodeIds.length !== y.nodeIds.length) return false;
    for (let j = 0; j < y.nodeIds.length; j++) {
      if (x.nodeIds[j] !== y.nodeIds[j]) return false;
    }
    // Reject spurious extra keys so a `{...collapsed:false}` input still
    // normalizes to the canonical (collapsed omitted) shape.
    if (x.collapsed !== undefined && x.collapsed !== true) return false;
  }
  return true;
}
