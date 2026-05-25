"use client";

import type { WorkflowNode } from "@/contracts/workflow";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";

interface Props {
  /**
   * Map of provider id → display name. Used to render a friendlier label
   * than the raw id. Keys missing from the map fall back to the id.
   */
  providerLabels: Readonly<Record<string, string>>;
}

/**
 * Slice 1I.2 minimum: vertical list of the workflow's nodes in execution
 * order. The full ReactFlow canvas (per workflow-builder-ui.md) ships in a
 * later slice; for now a list is enough to verify the round-trip
 * (add → save → reload).
 *
 * Slice 3.2 extension: clicking "Configure" opens the node's config
 * rail via configSlice.openNode. Active node is highlighted with a
 * primary-color border. The "Configure" button is a separate
 * affordance from "Remove" because list-view UX is clearer with
 * explicit buttons than with click-anywhere semantics (V1's canvas
 * uses click-on-node, which the upcoming Slice 3.5 will inherit).
 */
export function NodeList({ providerLabels }: Props) {
  const nodes = useGraphSlice((s) => s.pendingNodes);
  const removeNode = useGraphSlice((s) => s.removeNode);
  const openNode = useConfigSlice((s) => s.openNode);
  const dropNodeConfigDraft = useConfigSlice((s) => s.dropNode);
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);

  if (nodes.length === 0) {
    return (
      <div className="rounded border border-dashed border-input p-8 text-center text-sm text-muted-foreground">
        Empty workflow. Add a trigger to get started.
      </div>
    );
  }

  function handleConfigure(node: WorkflowNode): void {
    openNode({ nodeId: node.id, initialValues: node.config });
  }

  function handleRemove(node: WorkflowNode): void {
    // Drop the draft first so the modal doesn't stay open on a
    // node that no longer exists in the graph.
    dropNodeConfigDraft(node.id);
    removeNode(node.id);
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Workflow nodes">
      {nodes.map((node) => (
        <li key={node.id}>
          <NodeRow
            node={node}
            providerLabel={providerLabels[node.provider] ?? node.provider}
            active={activeNodeId === node.id}
            onConfigure={() => handleConfigure(node)}
            onRemove={() => handleRemove(node)}
          />
        </li>
      ))}
    </ol>
  );
}

interface NodeRowProps {
  node: WorkflowNode;
  providerLabel: string;
  active: boolean;
  onConfigure: () => void;
  onRemove: () => void;
}

function NodeRow({
  node,
  providerLabel,
  active,
  onConfigure,
  onRemove,
}: NodeRowProps) {
  return (
    <div
      className={
        active
          ? "flex items-center justify-between rounded border-2 border-primary p-3"
          : "flex items-center justify-between rounded border border-input p-3"
      }
      data-active={active ? "true" : undefined}
    >
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {node.kind}
        </span>
        <span className="font-medium">{providerLabel}</span>
        <span className="text-xs text-muted-foreground">
          {node.type ? node.type : "(unconfigured)"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfigure}
          aria-label={`Configure ${node.kind} node`}
          className="rounded border border-input px-2 py-1 text-xs"
        >
          Configure
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${node.kind} node`}
          className="rounded border border-input px-2 py-1 text-xs"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
