"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type {
  WorkflowConnectionReadinessDTO,
  WorkflowProviderConnectionEntryDTO,
} from "@/contracts/workflowConnectionReadiness";
import type {
  AgentConnectionProvider,
  AgentConnectionSignal,
} from "@/core/workflows/agentReadiness";
import { getWorkflowConnectionReadiness } from "@/lib/api/workflowConnectionReadiness";

/**
 * REACT-AGENT-READINESS-1 — fetch the server-resolved per-provider connection
 * readiness for the graph the user is reviewing, and translate the brain's
 * sanitized DTO into the core `AgentConnectionSignal` the readiness verdict
 * consumes.
 *
 * The connection truth comes ONLY from the server brain (integration rows / health
 * / scopes / credential provenance) via the session route — never inferred. While
 * the fetch is in flight the signal is `loading` (readiness never claims
 * "connected" yet); a failed fetch is `error` (still never claims connected);
 * `disabled` when there is no account context (logged-out local-only builder).
 *
 * Boundary: this hook calls the typed client API (`lib/api`), never `fetch`/the
 * service directly. It re-fetches only when the set of providers + the node ids
 * that use them changes — config edits (which don't affect connection state) do
 * not trigger a refetch.
 */

/** Stable key: which providers + which node ids use them (connection-relevant only). */
function connectionSignature(def: WorkflowDefinition | null): string {
  if (!def) return "";
  const byProvider = new Map<string, string[]>();
  for (const node of def.nodes) {
    if (!node.provider) continue;
    const bucket = byProvider.get(node.provider);
    if (bucket) bucket.push(node.id);
    else byProvider.set(node.provider, [node.id]);
  }
  return [...byProvider.entries()]
    .map(([provider, ids]) => `${provider}:${[...ids].sort().join(",")}`)
    .sort()
    .join("|");
}

/** Map one sanitized DTO provider entry → the core connection-provider classification. */
function mapEntry(entry: WorkflowProviderConnectionEntryDTO): AgentConnectionProvider {
  const baseFields = {
    provider: entry.provider,
    name: entry.name,
    nodeIds: entry.nodeIds,
    canReconnect: entry.canReconnect,
  };
  if (entry.ready) {
    return { ...baseFields, state: "connected" };
  }
  switch (entry.status) {
    case "TOKEN_EXPIRED":
      return { ...baseFields, state: "invalid", reasonCode: "token_expired" };
    case "MISSING_SCOPES":
      return { ...baseFields, state: "invalid", reasonCode: "missing_scopes" };
    case "RECONNECT_REQUIRED":
    case "NO_ACCOUNT_ACCESS":
    case "NOT_WORKFLOW_OWNER":
      return { ...baseFields, state: "invalid", reasonCode: "needs_reconnect" };
    case "PROVIDER_DISABLED":
    case "PROVIDER_UNKNOWN":
      return { ...baseFields, state: "invalid", reasonCode: "provider_disabled" };
    case "DISCONNECTED":
    default:
      return { ...baseFields, state: "missing" };
  }
}

function toSignal(dto: WorkflowConnectionReadinessDTO): AgentConnectionSignal {
  if (dto.access !== "OK" || !dto.providers) {
    // A member viewing their own workflow should always be OK; anything else means
    // we couldn't authoritatively verify — never claim connected.
    return { state: "error" };
  }
  const providers = dto.providers.map(mapEntry);
  return {
    state: "resolved",
    providers,
    allConnected: providers.every((p) => p.state === "connected"),
  };
}

export interface UseConnectionReadinessInput {
  readonly workflowId: string;
  /** The graph to check (candidate end-state while previewing, else the live draft), or null. */
  readonly definition: WorkflowDefinition | null;
  /** Disabled for the logged-out local-only builder (no account to resolve against). */
  readonly enabled: boolean;
}

export function useConnectionReadiness(
  input: UseConnectionReadinessInput,
): AgentConnectionSignal {
  const { workflowId, definition, enabled } = input;
  const [signal, setSignal] = useState<AgentConnectionSignal>({ state: "disabled" });
  // Track the in-flight signature so a stale response can't overwrite a newer one.
  const latestSignatureRef = useRef<string>("");

  const signature = enabled ? connectionSignature(definition) : "";

  useEffect(() => {
    if (!enabled || !definition) {
      latestSignatureRef.current = "";
      setSignal({ state: "disabled" });
      return;
    }
    // No provider nodes at all → nothing to verify; trivially resolved (none missing).
    if (signature === "") {
      latestSignatureRef.current = "";
      setSignal({ state: "resolved", providers: [], allConnected: true });
      return;
    }

    latestSignatureRef.current = signature;
    let cancelled = false;
    setSignal({ state: "loading" });

    getWorkflowConnectionReadiness(workflowId, definition)
      .then((dto) => {
        // Ignore if a newer graph superseded this request.
        if (cancelled || latestSignatureRef.current !== signature) return;
        setSignal(toSignal(dto));
      })
      .catch(() => {
        if (cancelled || latestSignatureRef.current !== signature) return;
        setSignal({ state: "error" });
      });

    return () => {
      cancelled = true;
    };
    // `definition` is intentionally not a dep: only a connection-relevant change
    // (captured by `signature`) should refetch. The closure reads the current
    // `definition` at fire time, which matches `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, enabled, signature]);

  return signal;
}
