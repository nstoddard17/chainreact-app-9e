"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchNodeCredentialOwners,
  type CredentialOwnerMetadataDTO,
} from "@/lib/api/credentialOwners";

/**
 * Loads per-node credential-owner metadata for the open workflow
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-5B / CS-4b).
 *
 * One best-effort GET per (workflowId, enabled) — NOT per node — so switching the
 * config rail between nodes does not refetch. `enabled` is false for personal
 * (non-team) workflows so we never hit the endpoint there. `refetch()` is called
 * after a successful reassignment request to surface the new pending state. On any
 * failure the metadata degrades to a safe empty state (handled by the client).
 */
export interface UseNodeCredentialOwnersResult {
  metadata: CredentialOwnerMetadataDTO | null;
  refetch: () => void;
}

export function useNodeCredentialOwners(
  workflowId: string | null | undefined,
  enabled: boolean,
): UseNodeCredentialOwnersResult {
  const [metadata, setMetadata] = useState<CredentialOwnerMetadataDTO | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!workflowId || !enabled) {
      setMetadata(null);
      return;
    }
    const controller = new AbortController();
    fetchNodeCredentialOwners(workflowId, { signal: controller.signal })
      .then((m) => {
        if (!controller.signal.aborted) setMetadata(m);
      })
      .catch(() => {
        // AbortError or transport failure — leave prior metadata in place.
      });
    return () => controller.abort();
  }, [workflowId, enabled, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { metadata, refetch };
}
