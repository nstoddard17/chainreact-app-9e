"use client";

import { useState } from "react";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";
import {
  sanitizeSeedConfig,
  type PreviewSetupField,
  type PreviewSetupFieldsByType,
} from "@/core/workflows/previewSetupFields";
import { SetupAsyncSelectControl, SetupFieldControl } from "./builderSetupFieldControls";

/**
 * Existing-node setup card — React rail (BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP).
 *
 * Rendered UNDER the deterministic "Check workflow" review when validation finds existing draft nodes
 * with missing required fields that are fixable from metadata. Unlike {@link BuilderPreviewSetupCard}
 * (which collects values for PREVIEW nodes and seeds them on "Apply preview"), this card targets nodes
 * ALREADY in the draft and updates their config directly on an explicit "Update step".
 *
 * GUARANTEES (presentational only — same boundary as the preview card):
 *   - No store access, no direct fetch, no model/gateway/Hermes call, no secret. Collected values flow
 *     up via `onUpdateStep` (the builder merges them into the draft node via the normal graph-slice
 *     `updateNodeConfig`, which marks the draft dirty). Nothing is saved / activated / run / applied as
 *     a preview / created as a new node here.
 *   - Selected values are NEVER sent to Hermes / a model / a prompt / audit text. Async single-select
 *     options load through the EXISTING authenticated resolver (`useOptionsSource`), never a model call.
 *   - secret / connection fields are excluded upstream (never in `setupFieldsByType`) so they never
 *     render here; unsupported missing fields show a safe "open the step" message instead of a control.
 *
 * Narrow by design: it only collects the MISSING REQUIRED fields the metadata can render as a simple
 * local control. It is NOT a full node editor — anything else routes the user to the step editor.
 */

export interface BuilderNodeSetupCardProps {
  /** Existing draft nodes with missing required fields (from deterministic validation). */
  readonly nodes: readonly CheckWorkflowSetupTarget[];
  /** Supported, metadata-derived setup fields per `provider:type`. Absent → nothing collectable. */
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  /** Forwarded to the async options resolver as account/workflow provenance. Never a token/secret. */
  readonly workflowId?: string;
  /**
   * Apply the collected (sanitized) values to the EXISTING draft node. The builder merges them into the
   * node's current config via the normal graph-slice path (marks dirty). Never saves/activates/runs.
   */
  readonly onUpdateStep: (nodeId: string, values: Record<string, unknown>) => void;
}

interface ResolvedNode {
  readonly target: CheckWorkflowSetupTarget;
  readonly supported: readonly PreviewSetupField[];
  readonly unsupported: readonly string[];
}

export function BuilderNodeSetupCard({
  nodes,
  setupFieldsByType,
  workflowId,
  onUpdateStep,
}: BuilderNodeSetupCardProps) {
  // Collected values per node, keyed nodeId → fieldName → value. Local + ephemeral until "Update step".
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});
  // Nodes whose values were applied to the draft this session (drives the "saved" confirmation).
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());

  const resolved: ResolvedNode[] = nodes
    .map((target) => {
      const all = setupFieldsByType?.[`${target.provider}:${target.type}`] ?? [];
      const supported = all.filter((f) => target.missingFieldNames.includes(f.name));
      const supportedNames = new Set(supported.map((f) => f.name));
      const unsupported = target.missingFieldNames.filter((n) => !supportedNames.has(n));
      return { target, supported, unsupported };
    })
    .filter((r) => r.supported.length > 0 || r.unsupported.length > 0);

  if (resolved.length === 0) return null;

  function setValue(nodeId: string, fieldName: string, value: unknown): void {
    setValues((prev) => ({ ...prev, [nodeId]: { ...prev[nodeId], [fieldName]: value } }));
  }

  function handleUpdate(node: ResolvedNode): void {
    // Sanitize to the supported, non-sensitive fields only; the builder merges into the live config.
    const seed = sanitizeSeedConfig(values[node.target.nodeId], node.supported);
    onUpdateStep(node.target.nodeId, seed);
    setApplied((prev) => new Set(prev).add(node.target.nodeId));
  }

  return (
    <section
      data-testid="builder-node-setup-rail"
      aria-label="Fix setup issues"
      className="mt-1 rounded-md border p-3"
      style={{ background: "var(--builder-panel-2)", borderColor: "var(--builder-border)" }}
    >
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--builder-text)" }}>
        Fix setup issues
      </h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--builder-muted)" }}>
        Fill the required fields below and update each step. This edits your draft only — nothing is
        saved, activated, or run until you choose to.
      </p>

      <div className="mt-2 max-h-[40vh] space-y-3 overflow-y-auto">
        {resolved.map(({ target, supported, unsupported }) => {
          const nodeConfig = values[target.nodeId];
          const isApplied = applied.has(target.nodeId);
          return (
            <div key={target.nodeId} data-testid={`node-setup-${target.nodeId}`}>
              <div className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
                {target.label}
              </div>

              {supported.map((field) =>
                field.type === "select-async" ? (
                  <SetupAsyncSelectControl
                    key={field.name}
                    field={field}
                    value={nodeConfig?.[field.name]}
                    nodeConfig={nodeConfig}
                    {...(workflowId ? { workflowId } : {})}
                    onChange={(v) => setValue(target.nodeId, field.name, v)}
                    testid={`node-setup-${target.nodeId}-${field.name}`}
                  />
                ) : (
                  <SetupFieldControl
                    key={field.name}
                    field={field}
                    value={nodeConfig?.[field.name]}
                    onChange={(v) => setValue(target.nodeId, field.name, v)}
                    testid={`node-setup-${target.nodeId}-${field.name}`}
                  />
                ),
              )}

              {unsupported.length > 0 && (
                <div
                  data-testid={`node-setup-${target.nodeId}-unsupported`}
                  className="mt-1 text-[11px]"
                  style={{ color: "var(--builder-muted)" }}
                >
                  Open {target.label} to finish setup.
                </div>
              )}

              {supported.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleUpdate({ target, supported, unsupported })}
                  data-testid={`node-setup-${target.nodeId}-update`}
                  className="mt-2 rounded-md px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
                  title="Update this step in your draft (nothing is saved or activated)"
                >
                  Update step
                </button>
              )}

              {isApplied && (
                <div
                  data-testid={`node-setup-${target.nodeId}-applied`}
                  className="mt-1 text-[11px]"
                  style={{ color: "var(--builder-accent)" }}
                >
                  Saved to your draft. Re-run Check workflow to confirm.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
