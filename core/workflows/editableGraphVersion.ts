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
export function computeEditableGraphVersion(def: VersionableDefinition): string {
  const projection = {
    nodes: def.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
      config: n.config ?? {},
      position: n.position ?? { x: 0, y: 0 },
      ...(n.displayName !== undefined ? { displayName: n.displayName } : {}),
    })),
    edges: def.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, ...(e.label !== undefined ? { label: e.label } : {}) })),
  };
  return fnv1aHex(JSON.stringify(canonicalize(projection)));
}
