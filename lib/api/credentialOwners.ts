/**
 * Typed client wrappers for the per-node credential-owner endpoints
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-5B / CS-4b).
 *
 * Client-safe (no server imports). The server never returns a token / provider
 * label / email / scope, so these DTOs carry display names + ids only.
 */

export type NodeCredentialOwnerStatus = "pending" | "accepted";

export interface NodeCredentialOwnerRecordDTO {
  readonly nodeId: string;
  readonly provider: string;
  readonly status: NodeCredentialOwnerStatus;
  readonly ownerDisplayName: string | null;
}

export interface CredentialOwnerMetadataDTO {
  readonly workflowId: string;
  readonly canManage: boolean;
  readonly nodes: readonly NodeCredentialOwnerRecordDTO[];
}

export interface EligibleTargetDTO {
  readonly userId: string;
  readonly displayName: string | null;
  readonly role: "owner" | "admin" | "member";
}

/** A safe empty metadata state (flag off / error / non-team). */
function emptyMetadata(workflowId: string): CredentialOwnerMetadataDTO {
  return { workflowId, canManage: false, nodes: [] };
}

/**
 * Load per-node credential-owner metadata. Degrades to a safe empty state on any
 * non-200 / parse failure so the builder never breaks on this best-effort read.
 * Re-throws AbortError so the caller's AbortController can detect cancellation.
 */
export async function fetchNodeCredentialOwners(
  workflowId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<CredentialOwnerMetadataDTO> {
  try {
    const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/credential-owners`, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(opts.signal !== undefined && { signal: opts.signal }),
    });
    if (!res.ok) return emptyMetadata(workflowId);
    const body = (await res.json()) as CredentialOwnerMetadataDTO;
    if (typeof body !== "object" || body === null || !Array.isArray(body.nodes)) {
      return emptyMetadata(workflowId);
    }
    return body;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return emptyMetadata(workflowId);
  }
}

export type EligibleTargetsResponse =
  | { ok: true; members: readonly EligibleTargetDTO[] }
  | { ok: false; code: string };

/** Eligible reassignment targets for a node (owner/admin/creator only server-side). */
export async function fetchEligibleTargets(
  workflowId: string,
  nodeId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<EligibleTargetsResponse> {
  let res: Response;
  try {
    res = await fetch(
      `/api/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(
        nodeId,
      )}/credential-owner/eligible-targets`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        ...(opts.signal !== undefined && { signal: opts.signal }),
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, code: "UNKNOWN" };
  }
  if (res.ok) {
    const body = (await res.json()) as { members?: readonly EligibleTargetDTO[] };
    return { ok: true, members: body.members ?? [] };
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: body.code ?? "UNKNOWN" };
}

export type ReassignmentActionResponse =
  | { ok: true; status: string }
  | { ok: false; code: string };

/** Request a reassignment of a node to `targetUserId` (calls the CS-3 request route). */
export async function requestCredentialReassignment(
  workflowId: string,
  nodeId: string,
  targetUserId: string,
): Promise<ReassignmentActionResponse> {
  let res: Response;
  try {
    res = await fetch(
      `/api/workflows/${encodeURIComponent(workflowId)}/nodes/${encodeURIComponent(
        nodeId,
      )}/credential-owner/request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ targetUserId }),
      },
    );
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
  const body = (await res.json().catch(() => ({}))) as { status?: string; code?: string };
  if (res.ok) return { ok: true, status: body.status ?? "pending" };
  return { ok: false, code: body.code ?? "UNKNOWN" };
}
