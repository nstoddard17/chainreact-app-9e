/**
 * Field-level provenance for the React Agent preview (REACT-AGENT-PREVIEW-FIELD-PROVENANCE-1).
 *
 * The last missing input to `enrichProposal`. Enrichment must be able to fill a field the AGENT left
 * unresolved while never touching one the USER decided — and the two are indistinguishable from the
 * value alone. A filled field might be the agent's guess or the user's deliberate choice; an EMPTY
 * field might be untouched or something the user deliberately cleared. So ownership is recorded when
 * it happens, not inferred afterwards.
 *
 * The rule this encodes, and the reason truthiness is banned as a proxy: `""`, `false` and `0` are
 * real, explicit values on this platform. A user who clears Company or unticks a flag has made a
 * decision, and enrichment silently restoring it would be the exact "the app fought me" failure that
 * makes an assistant untrustworthy. Ownership is therefore a separate map, keyed by field identity.
 *
 * Provider-neutral and pure: no React, no provider knowledge, no I/O.
 */

/** Who last decided a field's value. `system` is deliberately absent — nothing needs it yet. */
export type PreviewFieldOwner = "agent" | "user";

/**
 * Canonical field identity: `<nodeId>.<fieldPath>`.
 *
 * `nodeId` is the preview node's stable id and `fieldPath` the config path the edit handlers already
 * use (dotted for nested objects). One format shared by initialization, edit handling, enrichment and
 * readiness — a second incompatible key format would silently split ownership in half.
 */
export type PreviewFieldIdentity = string;

export type PreviewFieldProvenance = Readonly<Record<PreviewFieldIdentity, PreviewFieldOwner>>;

/** Compose the canonical identity. Kept a function so the format has exactly one definition. */
export function fieldIdentity(nodeId: string, fieldPath: string): PreviewFieldIdentity {
  return `${nodeId}.${fieldPath}`;
}

/**
 * Seed provenance when a proposal enters the preview.
 *
 * ONLY fields the proposal itself supplied are marked `agent`. A value that was already on the
 * workflow before the proposal is deliberately left UNRECORDED: it belongs to neither party here, and
 * marking it `agent` would license enrichment to overwrite pre-existing user configuration on the
 * first form selection. Unrecorded means "not eligible", which is the safe default.
 */
export function initializeProvenance(input: {
  /** Per-node config the PROPOSAL supplied, keyed by preview/node id. */
  readonly proposedConfig: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Field paths the proposal declared as needing input — agent-owned and eligible to be filled. */
  readonly requiredInputsByNode?: Readonly<Record<string, readonly string[]>> | undefined;
}): PreviewFieldProvenance {
  const out: Record<string, PreviewFieldOwner> = {};
  for (const [nodeId, config] of Object.entries(input.proposedConfig)) {
    for (const fieldPath of Object.keys(config)) {
      out[fieldIdentity(nodeId, fieldPath)] = "agent";
    }
  }
  // A field the agent said it still needs is agent-owned too — that is precisely what enrichment is
  // meant to fill once the upstream schema arrives.
  for (const [nodeId, fields] of Object.entries(input.requiredInputsByNode ?? {})) {
    for (const fieldPath of fields) {
      const id = fieldIdentity(nodeId, fieldPath);
      if (out[id] === undefined) out[id] = "agent";
    }
  }
  return out;
}

/**
 * Record a USER edit. Called from the preview's change handler for every edit — including a clear.
 *
 * Deliberately takes no value: whether the user typed text, picked an option, chose a mapping or
 * emptied the field, the ownership consequence is identical. Making this value-blind is what stops a
 * future change from reintroducing a truthiness test.
 */
export function markUserOwned(
  provenance: PreviewFieldProvenance,
  nodeId: string,
  fieldPath: string,
): PreviewFieldProvenance {
  const id = fieldIdentity(nodeId, fieldPath);
  if (provenance[id] === "user") return provenance; // identity preserved — no needless re-render
  return { ...provenance, [id]: "user" };
}

/**
 * Reduce provenance to the `agentOwnedFields` shape `enrichProposal` expects: per node, the field
 * paths enrichment may touch. A field the user owns — or that nobody recorded — is simply absent.
 */
export function toAgentOwnedFields(
  provenance: PreviewFieldProvenance,
): Readonly<Record<string, readonly string[]>> {
  const out: Record<string, string[]> = {};
  for (const [identity, owner] of Object.entries(provenance)) {
    if (owner !== "agent") continue;
    const dot = identity.indexOf(".");
    if (dot <= 0 || dot === identity.length - 1) continue;
    const nodeId = identity.slice(0, dot);
    const fieldPath = identity.slice(dot + 1);
    (out[nodeId] ??= []).push(fieldPath);
  }
  return out;
}

/** True when the user owns this field — the single question enrichment must ask before writing. */
export function isUserOwned(
  provenance: PreviewFieldProvenance,
  nodeId: string,
  fieldPath: string,
): boolean {
  return provenance[fieldIdentity(nodeId, fieldPath)] === "user";
}

/**
 * Provenance is PREVIEW-ONLY editor state. Cleared on apply, on dismissal, and when a new proposal
 * supersedes the old one — never persisted, and never carried between workflows or proposals.
 */
export const EMPTY_PROVENANCE: PreviewFieldProvenance = Object.freeze({});

/**
 * Compose the field path for one cell of a repeated row: `<field>.<rowId>.<subField>`.
 *
 * The row ID — not the array index — is what makes ownership survive a reorder or a delete. Passing
 * a position here would silently transfer the user's edit to whichever row slid into that slot,
 * which is the same class of bug as positional `answers[0]` mapping.
 */
export function rowFieldPath(fieldName: string, rowId: string, subFieldName: string): string {
  return `${fieldName}.${rowId}.${subFieldName}`;
}

/** The per-node field lists an edit proposal changed, as `buildConfigDiff` reports them. */
export interface ProposalDiffNode {
  readonly nodeId: string;
  readonly addedFields: readonly { readonly name: string }[];
  readonly changedFields: readonly { readonly name: string }[];
  readonly missingRequiredFields: readonly { readonly name: string }[];
}

/**
 * Seed provenance for an EDIT proposal from its diff against the user's CURRENT draft.
 *
 * This is the distinction `initializeProvenance` cannot make on its own. An edit proposal carries the
 * whole end-state graph, so its node configs contain the user's pre-existing values too — seeding
 * from those configs directly would mark the user's own long-standing Mailchimp audience as
 * "agent-owned" and license enrichment to overwrite it on the first form selection.
 *
 * Only three classes are the agent's, and all three come from the diff:
 *   - `addedFields`   — the proposal introduced this field;
 *   - `changedFields` — the proposal changed a value that was already there;
 *   - `missingRequiredFields` — declared still-needed, which is exactly what enrichment fills.
 * An UNCHANGED inherited field appears in none of them and stays unrecorded, i.e. not eligible.
 */
export function initializeProvenanceFromDiff(input: {
  readonly nodes: readonly ProposalDiffNode[];
  /**
   * Field keys the proposal itself declared as still needed, per node id.
   *
   * Carried SEPARATELY from the diff because the diff cannot see them. When the agent correctly
   * refuses to invent a value it emits the node with that field ABSENT — so the field appears in no
   * `addedFields` (nothing was added) and in no `changedFields` (nothing changed). Without this the
   * exact fields enrichment exists to fill would be the ones it is not allowed to touch.
   */
  readonly declaredMissingByNode?: Readonly<Record<string, readonly string[]>> | undefined;
}): PreviewFieldProvenance {
  const out: Record<string, PreviewFieldOwner> = {};
  for (const node of input.nodes) {
    for (const group of [node.addedFields, node.changedFields, node.missingRequiredFields]) {
      for (const field of group) out[fieldIdentity(node.nodeId, field.name)] = "agent";
    }
  }
  for (const [nodeId, fields] of Object.entries(input.declaredMissingByNode ?? {})) {
    for (const field of fields) out[fieldIdentity(nodeId, field)] = "agent";
  }
  return out;
}

/**
 * Seed provenance for a preview, choosing the right evidence for the path it came from.
 *
 * The two paths answer "which fields are the agent's?" from different evidence, and getting this
 * backwards is the failure the whole layer exists to prevent:
 *   - EDIT proposals carry the whole end-state graph, INCLUDING the user's pre-existing config, so
 *     the node configs prove nothing. Only the diff against the live draft does — plus the agent's
 *     own "still needs" list, which the diff cannot see (a field the agent deliberately left out was
 *     neither added nor changed).
 *   - ADDITIVE proposals have no ambiguity: every node is new, so the plan's own config and its
 *     declared missing inputs are exactly right.
 *
 * Lives here rather than in the React hook so the decision is pure, unit-testable, and stated once.
 */
export function seedPreviewProvenance(input: {
  /** True when this is an EDIT proposal (a full proposed definition exists). */
  readonly isEditProposal: boolean;
  /** Diff of the proposal against the live draft. Edit path only. */
  readonly diffNodes?: readonly ProposalDiffNode[] | undefined;
  /** Field keys each node still needs, keyed by preview id (= node id on the edit path). */
  readonly declaredMissingByNode: Readonly<Record<string, readonly string[]>>;
  /** The additive path's plan-derived config, keyed by preview id. */
  readonly planConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
}): PreviewFieldProvenance {
  if (input.isEditProposal) {
    return initializeProvenanceFromDiff({
      nodes: input.diffNodes ?? [],
      declaredMissingByNode: input.declaredMissingByNode,
    });
  }
  return initializeProvenance({
    proposedConfig: input.planConfig ?? {},
    requiredInputsByNode: input.declaredMissingByNode,
  });
}

/**
 * Merge new agent-owned entries into existing provenance WITHOUT disturbing user ownership.
 *
 * Used on a non-destructive refresh of the SAME preview (the proposal object changed, but it is the
 * same proposal the user has been editing). A user-owned field stays user-owned — re-seeding it as
 * agent-owned would hand their decision back to enrichment, which is the one thing provenance exists
 * to prevent. A genuinely NEW proposal does not come through here; it resets instead.
 */
export function mergeAgentProvenance(
  existing: PreviewFieldProvenance,
  incoming: PreviewFieldProvenance,
): PreviewFieldProvenance {
  let changed = false;
  const out: Record<string, PreviewFieldOwner> = { ...existing };
  for (const [identity, owner] of Object.entries(incoming)) {
    if (existing[identity] !== undefined) continue; // user OR agent — already decided, never re-seed
    out[identity] = owner;
    changed = true;
  }
  return changed ? out : existing;
}
