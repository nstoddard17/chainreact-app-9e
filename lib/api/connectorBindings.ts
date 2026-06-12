/**
 * Typed client wrappers for the per-node connector-binding endpoints
 * (Slice 4.CONN-SHARE / CS-5b). Client-safe (no server imports).
 *
 * The server never returns a token / provider account id / email / scope /
 * account metadata — these DTOs carry the status enum, safe member display names,
 * and opaque user ids only (same shape the credential-owner eligible-targets
 * endpoint already exposes).
 */

export type NodeBindingStatus =
  | "not_applicable"
  | "single_sharer"
  | "needs_selection"
  | "bound"
  | "unavailable";

export interface SharedConnectorOptionDTO {
  readonly userId: string;
  readonly displayName: string | null;
  readonly role: "owner" | "admin" | "member";
}

export interface NodeConnectorBindingStateDTO {
  readonly status: NodeBindingStatus;
  readonly connectors: readonly SharedConnectorOptionDTO[];
  readonly currentConnectorDisplayName: string | null;
}

/** A safe "nothing to show" state — used on flag-off / error / non-team. */
function inertState(): NodeConnectorBindingStateDTO {
  return { status: "not_applicable", connectors: [], currentConnectorDisplayName: null };
}

/**
 * Load the builder's per-node binding state. Degrades to the inert
 * `not_applicable` state on any non-200 / parse failure (incl. the flag-off 404),
 * so the builder never breaks on this best-effort read. Re-throws AbortError so the
 * caller's AbortController can detect cancellation.
 */
export async function fetchNodeConnectorBindingState(
  workflowId: string,
  nodeId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<NodeConnectorBindingStateDTO> {
  try {
    const res = await fetch(bindingPath(workflowId, nodeId), {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(opts.signal !== undefined && { signal: opts.signal }),
    });
    if (!res.ok) return inertState();
    const body = (await res.json()) as NodeConnectorBindingStateDTO;
    if (typeof body !== "object" || body === null || !Array.isArray(body.connectors)) {
      return inertState();
    }
    return body;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return inertState();
  }
}

export type BindingActionResponse = { ok: true } | { ok: false; code: string };

/** Bind the node to `connectorUserId` (PUT). */
export async function setNodeConnectorBinding(
  workflowId: string,
  nodeId: string,
  connectorUserId: string,
): Promise<BindingActionResponse> {
  return mutate(bindingPath(workflowId, nodeId), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ connectorUserId }),
  });
}

/** Clear the node's binding (DELETE). */
export async function clearNodeConnectorBinding(
  workflowId: string,
  nodeId: string,
): Promise<BindingActionResponse> {
  return mutate(bindingPath(workflowId, nodeId), { method: "DELETE", headers: { Accept: "application/json" } });
}

function bindingPath(workflowId: string, nodeId: string): string {
  return `/api/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(
    nodeId,
  )}/connector-binding`;
}

async function mutate(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<BindingActionResponse> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: body.code ?? "UNKNOWN" };
}
