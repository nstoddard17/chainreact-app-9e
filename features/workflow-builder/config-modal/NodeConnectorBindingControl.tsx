"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchNodeConnectorBindingState,
  setNodeConnectorBinding,
  clearNodeConnectorBinding,
  type NodeConnectorBindingStateDTO,
} from "@/lib/api/connectorBindings";

/**
 * Node connector-binding picker for the config-modal (Slice 4.CONN-SHARE / CS-5b).
 *
 * Resolves the ambiguous multi-sharer case: when a personal-provider node has 2+
 * shared connectors and no valid binding, the editor picks WHICH shared connection
 * the node runs under. Saving calls the CS-4a binding route; the CS-4b plan then
 * resolves execution + the run/edit gate to that connector.
 *
 * States (from the server `status`):
 *   - not_applicable / single_sharer→(silent or info) — no picker needed.
 *   - needs_selection — "Multiple team members shared this connection…" + picker.
 *   - bound — "Using shared connection from {name}." + Change / Stop using.
 *   - unavailable — "This shared connection is no longer available…" + re-pick.
 *
 * No-leak: shows member display names only — never a token / email /
 * provider_account_id / scope. Best-effort load (degrades to inert on failure).
 */
export function NodeConnectorBindingControl({
  workflowId,
  nodeId,
}: {
  workflowId: string;
  nodeId: string;
}) {
  const [state, setState] = useState<NodeConnectorBindingStateDTO | null>(null);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchNodeConnectorBindingState(workflowId, nodeId, { signal: controller.signal })
      .then((s) => {
        if (!controller.signal.aborted) setState(s);
      })
      .catch(() => {
        /* AbortError / transport — keep prior state */
      });
    return () => controller.abort();
  }, [workflowId, nodeId, tick]);

  const refetch = useCallback(() => {
    setSelected("");
    setError(null);
    setTick((t) => t + 1);
  }, []);

  async function save() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const res = await setNodeConnectorBinding(workflowId, nodeId, selected);
    setBusy(false);
    if (res.ok) refetch();
    else setError("Couldn't save the connection. Please try again.");
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await clearNodeConnectorBinding(workflowId, nodeId);
    setBusy(false);
    if (res.ok) refetch();
    else setError("Couldn't update the connection. Please try again.");
  }

  // Nothing to show: not loaded yet, account/native, accepted grant owns it, or
  // single-sharer (auto-resolved — kept silent to avoid noise).
  if (!state || state.status === "not_applicable" || state.status === "single_sharer") {
    return null;
  }

  const picker = (prompt: string) => (
    <div data-testid="connector-binding-picker" className="flex flex-col gap-1.5">
      <span className="text-[11px] text-muted-foreground">{prompt}</span>
      {state.connectors.length === 0 ? (
        <span data-testid="connector-binding-empty" className="text-[11px] text-muted-foreground">
          No team member is sharing this connection yet.
        </span>
      ) : (
        <>
          <select
            data-testid="connector-binding-select"
            aria-label="Choose a shared connection"
            className="rounded border border-input bg-background px-2 py-1 text-xs"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a connection…</option>
            {state.connectors.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.displayName ?? "Member"}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="connector-binding-save"
            className="w-fit text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
            disabled={!selected || busy}
            onClick={save}
          >
            Use this connection
          </button>
        </>
      )}
    </div>
  );

  return (
    <div data-testid="connector-binding-control" data-status={state.status} className="flex flex-col gap-1.5">
      {state.status === "needs_selection" &&
        picker("Multiple team members shared this connection. Choose which one this node should use.")}

      {state.status === "unavailable" &&
        picker("This shared connection is no longer available. Choose another connection.")}

      {state.status === "bound" && (
        <div className="flex flex-col gap-1">
          <span data-testid="connector-binding-bound" className="text-[11px] text-muted-foreground">
            Using shared connection from {state.currentConnectorDisplayName ?? "a team member"}.
          </span>
          <button
            type="button"
            data-testid="connector-binding-clear"
            className="w-fit text-[11px] text-muted-foreground hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={clear}
          >
            Stop using this connection
          </button>
        </div>
      )}

      {error ? (
        <span role="alert" data-testid="connector-binding-error" className="text-[11px] text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
