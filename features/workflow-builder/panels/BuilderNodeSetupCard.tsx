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
  /**
   * BUILDER-AGENT-RAIL-EXISTING-NODE-SETUP-REVEAL — emitted when the user focuses a setup control or
   * selects a dropdown value. The builder opens/selects that node in the config panel and highlights the
   * matching field (navigation only — never writes the value, saves, or runs). `fieldName` is the stable
   * metadata KEY, not a label. Optional → no reveal wiring.
   */
  readonly onFieldInteract?: (nodeId: string, fieldName: string, interaction: "focus" | "change") => void;
  /**
   * REACT-AGENT-RESOLVER-RECOVERY-1 — display labels per provider slug, used to name the provider in
   * option-recovery copy ("We couldn't load your Typeform forms."). Absent → the slug is humanized.
   */
  readonly providerLabels?: Readonly<Record<string, string>>;
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
  onFieldInteract,
  providerLabels,
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

      {/* REACT-AGENT-RAIL-SINGLE-SCROLL-1 — no inner scroll region; the chat transcript is the rail's
          only scroll container (see BuilderPreviewSetupCard for the same change). */}
      <div className="mt-2 space-y-3">
        {resolved.map(({ target, supported, unsupported }) => {
          const nodeConfig = values[target.nodeId];
          const isApplied = applied.has(target.nodeId);
          return (
            <div key={target.nodeId} data-testid={`node-setup-${target.nodeId}`}>
              <div className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
                {target.label}
              </div>

              {supported.map((field) => {
                const isSelect = field.type === "select" || field.type === "select-async";
                // Reveal-on-focus for every field; reveal-on-change for dropdown selection (parity with
                // "selecting a dropdown opens the node config panel"). Navigation only — never writes.
                const emitFocus = onFieldInteract
                  ? () => onFieldInteract(target.nodeId, field.name, "focus")
                  : undefined;
                const handleChange = (v: unknown) => {
                  setValue(target.nodeId, field.name, v);
                  if (isSelect) onFieldInteract?.(target.nodeId, field.name, "change");
                };
                // REACT-AGENT-RESOLVER-RECOVERY-1 — the node ALREADY exists in the draft, so
                // "Open step editor" is the same deterministic reveal the focus handler performs
                // (select the node, open its config panel, highlight this field). Navigation only:
                // it never writes a value, saves, activates, or runs.
                const openStepEditor = onFieldInteract
                  ? () => onFieldInteract(target.nodeId, field.name, "focus")
                  : undefined;
                const providerLabel = providerLabels?.[target.provider];
                return field.type === "select-async" ? (
                  <SetupAsyncSelectControl
                    key={field.name}
                    field={field}
                    value={nodeConfig?.[field.name]}
                    nodeConfig={nodeConfig}
                    {...(workflowId ? { workflowId } : {})}
                    {...(providerLabel ? { providerLabel } : {})}
                    onChange={handleChange}
                    {...(emitFocus ? { onFocus: emitFocus } : {})}
                    {...(openStepEditor ? { onOpenStepEditor: openStepEditor } : {})}
                    openStepEditorTitle={`Open ${target.label} and highlight ${field.label}`}
                    testid={`node-setup-${target.nodeId}-${field.name}`}
                  />
                ) : (
                  <SetupFieldControl
                    key={field.name}
                    field={field}
                    value={nodeConfig?.[field.name]}
                    onChange={handleChange}
                    {...(emitFocus ? { onFocus: emitFocus } : {})}
                    onSubmit={() => handleUpdate({ target, supported, unsupported })}
                    testid={`node-setup-${target.nodeId}-${field.name}`}
                  />
                );
              })}

              {unsupported.length > 0 && (
                <div
                  data-testid={`node-setup-${target.nodeId}-unsupported`}
                  className="mt-1 text-[11px]"
                  style={{ color: "var(--builder-muted)" }}
                >
                  {/* REACT-AGENT-RESOLVER-RECOVERY-1 — this used to be a bare instruction with no way
                      to carry it out. It is now a working action, and only says "open" when it can. */}
                  {onFieldInteract ? (
                    <button
                      type="button"
                      data-testid={`node-setup-${target.nodeId}-unsupported-open`}
                      onClick={() => onFieldInteract(target.nodeId, unsupported[0]!, "focus")}
                      className="underline"
                      style={{ color: "var(--builder-accent)" }}
                      title={`Open ${target.label} and highlight ${unsupported[0]}`}
                    >
                      Open {target.label} to finish setup
                    </button>
                  ) : (
                    <span>Open {target.label} to finish setup.</span>
                  )}
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
