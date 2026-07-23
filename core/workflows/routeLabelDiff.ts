/**
 * 5.DUAL-BUILDER-1 CS-7 — pure Router route-label edit classifier.
 *
 * Router routes carry no ids: a route's identity is ONLY its `label`, which is
 * also the persisted `edge.label` that wires the route to its lane
 * (see contracts/workflowDefinition.ts, integrations/native/actions/router.schema.ts).
 * When a user edits the full Router routes editor, comparing the labels BEFORE
 * and AFTER the edit is the only way to decide whether a label change is a
 * wiring-PRESERVING rename (relabel the matching edge) or a structural change
 * that must fall back to conservative reconciliation (drop stale edges; a
 * re-enabled/renamed route starts unwired — never silently reconnected).
 *
 * This module is PURE (no store, no service, no I/O — safe for `core/`). The
 * graphSlice consults it to route an EXACT one-to-one rename through the
 * canonical wiring-preserving path, and the RouterRoutesField editor uses it to
 * surface the "changing route labels may require reconnecting their paths"
 * caution.
 *
 * Locked rule (product decision 7): only an EXACT one-to-one rename — exactly
 * one unique old label becomes exactly one unique new label AND every other
 * route stays structurally identical — is identity-preserving. Anything
 * ambiguous, multi-rename, reordered-with-changes, added, removed, or colliding
 * stays conservative. Never guess identity; never attach an unrelated old lane
 * to a new label. This changes no runtime Router config schema and adds no
 * route ids.
 */

/** The minimal route shape this classifier reasons about. */
export interface RouteLike {
  readonly label: string;
  /** The route's matching condition (input/operator/value). Compared by value. */
  readonly condition?: unknown;
}

export type RouteLabelEditKind =
  /** Labels + order + conditions all identical. */
  | "no_change"
  /** Same label set + same conditions, order changed only. */
  | "reorder_only"
  /** Same labels in the same order; only condition(s) changed. */
  | "condition_only"
  /**
   * Exactly one unique old label became exactly one unique new label and every
   * OTHER route is structurally identical. The single wiring-preserving case.
   */
  | "exact_rename"
  /**
   * One label changed but another route also changed structurally, so the
   * rename cannot be cleanly attributed. Conservative.
   */
  | "ambiguous_rename"
  /** Two or more labels changed at once. Conservative. */
  | "multiple_rename"
  /** One or more routes added, none removed. */
  | "addition"
  /** One or more routes removed, none added. */
  | "removal"
  /** The proposed labels contain a duplicate (invalid identity). */
  | "collision";

export type RouteLabelDiff =
  | { readonly kind: "exact_rename"; readonly oldLabel: string; readonly newLabel: string }
  | { readonly kind: Exclude<RouteLabelEditKind, "exact_rename"> };

/** Stable, order-insensitive serialization of a condition for value equality. */
function conditionKey(condition: unknown): string {
  return stableStringify(condition);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function hasDuplicate(labels: readonly string[]): boolean {
  return new Set(labels).size !== labels.length;
}

/**
 * Classify the edit from `prior` routes to `proposed` routes purely by label
 * identity (with condition equality used to distinguish reorder/condition-only
 * and to confirm an exact rename leaves other routes untouched).
 *
 * Total and deterministic — never throws. Trims labels for comparison the same
 * way the runtime rename transaction does.
 */
export function classifyRouteLabelEdit(
  prior: readonly RouteLike[],
  proposed: readonly RouteLike[],
): RouteLabelDiff {
  const priorLabels = prior.map((r) => r.label.trim());
  const proposedLabels = proposed.map((r) => r.label.trim());

  // A proposed duplicate label is an invalid identity no matter what else changed.
  if (hasDuplicate(proposedLabels)) return { kind: "collision" };

  const priorSet = new Set(priorLabels);
  const proposedSet = new Set(proposedLabels);
  const removed = priorLabels.filter((l) => !proposedSet.has(l));
  const added = proposedLabels.filter((l) => !priorSet.has(l));

  // ---- Same label SET (no adds/removals): reorder / condition-only / no-op. ----
  if (removed.length === 0 && added.length === 0) {
    const sameOrder =
      priorLabels.length === proposedLabels.length &&
      priorLabels.every((l, i) => l === proposedLabels[i]);
    // Map each label to its condition for value comparison (labels are unique here).
    const priorCond = new Map(prior.map((r) => [r.label.trim(), conditionKey(r.condition)]));
    const proposedCond = new Map(
      proposed.map((r) => [r.label.trim(), conditionKey(r.condition)]),
    );
    const conditionsEqual = [...proposedCond].every(
      ([label, key]) => priorCond.get(label) === key,
    );
    if (!sameOrder) return { kind: "reorder_only" };
    if (!conditionsEqual) return { kind: "condition_only" };
    return { kind: "no_change" };
  }

  // ---- Pure add / pure remove. ----
  if (added.length > 0 && removed.length === 0) return { kind: "addition" };
  if (removed.length > 0 && added.length === 0) return { kind: "removal" };

  // ---- Mixed add + remove: candidate rename(s). ----
  if (removed.length === 1 && added.length === 1) {
    const oldLabel = removed[0]!;
    const newLabel = added[0]!;
    // The rename is clean only when EVERY surviving (unchanged-label) route is
    // structurally identical between prior and proposed. Otherwise the single
    // label change coincides with another edit and identity is ambiguous.
    const survivorsIdentical = proposed.every((pr) => {
      const label = pr.label.trim();
      if (label === newLabel) return true; // the renamed route itself may differ
      const priorMatch = prior.find((r) => r.label.trim() === label);
      return priorMatch != null && conditionKey(priorMatch.condition) === conditionKey(pr.condition);
    });
    // Also require the survivor SET to line up (counts already guarantee this,
    // but guard against a duplicate-in-prior degenerate input).
    const survivorLabels = proposedLabels.filter((l) => l !== newLabel);
    const priorSurvivors = priorLabels.filter((l) => l !== oldLabel);
    const survivorSetEqual =
      survivorLabels.length === priorSurvivors.length &&
      survivorLabels.every((l) => priorSurvivors.includes(l));
    if (survivorsIdentical && survivorSetEqual) {
      return { kind: "exact_rename", oldLabel, newLabel };
    }
    return { kind: "ambiguous_rename" };
  }

  // Equal-count multi-change, or any other mixed shape → multiple renames.
  return { kind: "multiple_rename" };
}

/**
 * True when the edit is the single wiring-preserving case. Callers that only
 * need the yes/no decision use this; the graphSlice uses the full diff so it can
 * relabel the exact edge.
 */
export function isWiringPreservingRename(
  diff: RouteLabelDiff,
): diff is { kind: "exact_rename"; oldLabel: string; newLabel: string } {
  return diff.kind === "exact_rename";
}
