/**
 * Deterministic LOCAL-DRAFT version hash (HERMES-AGENT-WORKFLOW-EDITOR-LIVE).
 *
 * One pure function, shared by BOTH sides of the conversational-edit pipeline so a proposal is only
 * ever applied to the EXACT graph version it was computed against:
 *   - the SERVER editable-graph builder stamps it onto the model-facing graph + the proposal, and
 *   - the CLIENT graph slice recomputes it at Apply time and refuses to replace a draft whose version
 *     has drifted (the user edited the canvas while React was thinking).
 *
 * It is a STRUCTURAL + CONFIG fingerprint of the draft: any change to node ids / kinds / providers /
 * types / config (keys OR values) / edges flips the hash, so a stale proposal is detected. The hash is
 * NOT a secret and is never reversible — it is a short non-cryptographic digest (FNV-1a 32-bit, hex)
 * over a canonical (sorted-key) projection. It carries NO config values across any boundary: only the
 * digest string travels; the projection is hashed in-process and discarded.
 *
 * Lives in `core/workflows/` (pure, no service/repository imports) precisely so the builder graph slice
 * — which must not import from `services/` — can use the same implementation as the server.
 */

interface VersionableNode {
  readonly id: string;
  readonly kind: string;
  readonly provider: string;
  readonly type: string;
  readonly config?: Record<string, unknown>;
  readonly position?: { readonly x: number; readonly y: number };
  readonly displayName?: string;
}

interface VersionableEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface VersionableDefinition {
  readonly nodes: readonly VersionableNode[];
  readonly edges: readonly VersionableEdge[];
}

/** Canonical JSON: object keys sorted recursively so key ORDER never changes the digest. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
    return out;
  }
  return value;
}

/** FNV-1a 32-bit over a UTF-16 code-unit stream → 8-char zero-padded hex. Deterministic, no deps. */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in safe-integer range.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Compute the deterministic version digest for a workflow draft. Pure; position is INCLUDED (a moved
 * node is a real edit the proposal should not silently clobber). The `displayName` is included too so a
 * rename counts as drift. Returns an opaque short hex string — compare for EQUALITY only.
 */
/**
 * RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — the SHAPE of a value produced by
 * `computeEditableGraphVersion`: exactly 8 lowercase hex characters.
 *
 * This exists because two different "version" spaces meet in the builder and one was silently
 * compared against the other: this CONTENT FINGERPRINT, and the workflow's `updatedAt` REVISION
 * TIMESTAMP (`graphSlice.hydratedRevision`). A timestamp can never equal a fingerprint, so every
 * restored edit proposal reconciled as "the workflow moved on" and was falsely marked Stale.
 * Comparisons that expect a fingerprint now VALIDATE their inputs and fail closed instead of
 * silently producing a wrong verdict.
 */
export const EDITABLE_GRAPH_VERSION_PATTERN = /^[0-9a-f]{8}$/;

/** True when `value` has the shape of a `computeEditableGraphVersion` digest. */
export function isEditableGraphVersion(value: unknown): value is string {
  return typeof value === "string" && EDITABLE_GRAPH_VERSION_PATTERN.test(value);
}

export function computeEditableGraphVersion(def: VersionableDefinition): string {
  const projection = {
    // RESTORED-EDIT-PROPOSAL-STALE-MISMATCH-1 — nodes and edges are a SET, not a sequence:
    // execution order comes from the EDGES and layout from `position`, so the array order carries
    // no meaning. Sorting by id before hashing means two semantically identical graphs can never
    // produce different digests just because they were serialized in a different order — one more
    // way a proposal could be called stale when nothing had actually changed.
    nodes: [...def.nodes]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        provider: n.provider,
        type: n.type,
        config: n.config ?? {},
        // Layout IS semantic here (documented decision): Apply replaces the whole definition,
        // positions included, so a node the user moved is a real edit the proposal must not
        // silently clobber.
        position: n.position ?? { x: 0, y: 0 },
        ...(n.displayName !== undefined ? { displayName: n.displayName } : {}),
      })),
    edges: [...def.edges]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => ({ id: e.id, from: e.from, to: e.to, ...(e.label !== undefined ? { label: e.label } : {}) })),
  };
  return fnv1aHex(JSON.stringify(canonicalize(projection)));
}
