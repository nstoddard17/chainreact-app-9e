/**
 * What the preview should say about every field it tried to fill
 * (REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1).
 *
 * Enrichment already decides the OUTCOMES — mapped, ambiguous, missing, invalidated — and the
 * resolver reports whether a schema exists yet. What was absent is the read-model that turns those
 * into rows a person can act on, which matters because the failure modes are not interchangeable:
 * "I mapped this for you", "I need you to choose", "two fields fit and I refuse to guess", "this
 * form has no such field", and "the field you had mapped is gone" require five different responses
 * from the user. Collapsing them into one "needs setup" list is what made the old preview feel
 * arbitrary.
 *
 * Ordering is by severity, so the rows that block the user appear first and the reassuring
 * "already handled" rows sink to the bottom.
 *
 * Pure and provider-neutral: no React, no I/O, no provider names, no raw provider errors — every
 * message here is composed from the field's own label and platform-neutral copy.
 */

/** Why a field is in the state it is. Distinct kinds because each needs a different user action. */
export type PreviewReadinessKind =
  /** Filled automatically from an upstream value. Nothing to do. */
  | "mapped"
  /** A real decision only the user can make (an audience, a recipient, a consent choice). */
  | "needs_user"
  /** More than one upstream field fits. The user picks; the platform refuses to guess. */
  | "ambiguous"
  /** The chosen resource has nothing that fits. Never substituted with an approximation. */
  | "missing"
  /** The upstream resource is not chosen yet, so no schema exists to map from. */
  | "waiting"
  /** A previously-mapped path no longer exists in the newly chosen resource. */
  | "invalid";

export interface PreviewReadinessRow {
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly field: string;
  /** The field's human label — metadata's, never a humanized key guess when a label exists. */
  readonly fieldLabel: string;
  readonly kind: PreviewReadinessKind;
  /** One safe, user-facing sentence. Never a provider error, never a raw value. */
  readonly message: string;
  /** For `ambiguous` — the upstream labels the user chooses between. */
  readonly candidates?: readonly string[];
}

/** Severity order: what blocks or surprises the user first, what is already handled last. */
const KIND_ORDER: Record<PreviewReadinessKind, number> = {
  invalid: 0,
  ambiguous: 1,
  missing: 2,
  needs_user: 3,
  waiting: 4,
  mapped: 5,
};

export interface PreviewReadinessNode {
  readonly nodeId: string;
  readonly nodeLabel: string;
  /** Field key → human label, from registry metadata. */
  readonly fieldLabels: Readonly<Record<string, string>>;
  /** Field keys this node still needs, as the proposal declared them. */
  readonly missingInputs: readonly string[];
}

export interface BuildPreviewReadinessInput {
  readonly nodes: readonly PreviewReadinessNode[];
  /** `nodeId.field` → the reference enrichment wrote. */
  readonly mapped: Readonly<Record<string, string>>;
  /** `nodeId.field` → the upstream field's human label, for the "mapped from" line. */
  readonly mappedLabels?: Readonly<Record<string, string>> | undefined;
  readonly notes: readonly {
    readonly nodeId: string;
    readonly field: string;
    readonly kind: "ambiguous" | "missing";
    readonly candidates?: readonly string[];
  }[];
  readonly invalidated: readonly { readonly nodeId: string; readonly field: string }[];
  /**
   * True when the trigger declares a schema-dependent source whose resource is not chosen yet.
   * Distinguishes "you must pick a value for this field" from "pick the source and I'll fill it".
   */
  readonly awaitingResource: boolean;
}

function labelFor(node: PreviewReadinessNode, field: string): string {
  return node.fieldLabels[field] ?? field;
}

/**
 * Build the ordered readiness rows for the current preview.
 *
 * Precedence within one field is deliberate: an INVALIDATED mapping outranks everything (it is the
 * only state where something that used to be right is now wrong), then the enricher's explicit
 * refusals, then a successful mapping, and only then the generic "still needs input". A field that
 * enrichment mapped is no longer a user decision, so it must not also appear as one.
 */
export function buildPreviewReadiness(
  input: BuildPreviewReadinessInput,
): readonly PreviewReadinessRow[] {
  const rows: PreviewReadinessRow[] = [];

  const invalidKeys = new Set(input.invalidated.map((i) => `${i.nodeId}.${i.field}`));
  const noteByKey = new Map(input.notes.map((n) => [`${n.nodeId}.${n.field}`, n]));

  for (const node of input.nodes) {
    // Every field with something to say: declared-missing, enricher-noted, mapped, or invalidated.
    const fields = new Set<string>(node.missingInputs);
    for (const key of Object.keys(input.mapped)) {
      if (key.startsWith(`${node.nodeId}.`)) fields.add(key.slice(node.nodeId.length + 1));
    }
    for (const note of input.notes) if (note.nodeId === node.nodeId) fields.add(note.field);
    for (const inv of input.invalidated) if (inv.nodeId === node.nodeId) fields.add(inv.field);

    for (const field of fields) {
      const key = `${node.nodeId}.${field}`;
      const fieldLabel = labelFor(node, field);
      const base = { nodeId: node.nodeId, nodeLabel: node.nodeLabel, field, fieldLabel };

      if (invalidKeys.has(key)) {
        rows.push({
          ...base,
          kind: "invalid",
          message:
            "The newly selected resource no longer contains the previously mapped field. Choose a replacement.",
        });
        continue;
      }

      const note = noteByKey.get(key);
      if (note?.kind === "ambiguous") {
        rows.push({
          ...base,
          kind: "ambiguous",
          message: `More than one upstream field could fill ${fieldLabel}. Choose one:`,
          ...(note.candidates ? { candidates: note.candidates } : {}),
        });
        continue;
      }
      if (note?.kind === "missing") {
        rows.push({
          ...base,
          kind: "missing",
          message: `The selected resource does not contain a ${fieldLabel.toLowerCase()} field.`,
        });
        continue;
      }

      const reference = input.mapped[key];
      if (reference !== undefined) {
        const upstream = input.mappedLabels?.[key];
        rows.push({
          ...base,
          kind: "mapped",
          message: upstream ? `Mapped from upstream: ${upstream}` : "Mapped from upstream",
        });
        continue;
      }

      // Nothing decided this field. Whether that is the user's job or the schema's depends only on
      // whether a schema could exist yet — never on the field's name.
      rows.push(
        input.awaitingResource
          ? {
              ...base,
              kind: "waiting",
              message: "Select the upstream resource first so this field can be mapped.",
            }
          : { ...base, kind: "needs_user", message: `Select ${fieldLabel.toLowerCase()}` },
      );
    }
  }

  return rows.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.nodeId.localeCompare(b.nodeId) ||
      a.field.localeCompare(b.field),
  );
}
