"use client";

import { useWorkflowDataMap, type DataMapNode } from "../hooks/useWorkflowDataMap";
import { BuilderTabPlaceholder } from "./BuilderTabPlaceholder";
import {
  ConfiguredFieldRow,
  DataMapSection,
  ProducedFieldRow,
  UsesVariableRow,
} from "./dataMapParts";

/**
 * Slice 4.BUILDER-DATA-MAP-3 — the top-level **Data Map** tab as a user-facing
 * reference: "what does each step produce, and how do I use it later?".
 *
 * Frontend-only, schema-driven (+ sanitized sample values when a test run
 * exists). When the workflow has action steps it renders a workflow-ordered
 * outline; empty / trigger-only falls back to the honest empty-state panel.
 *
 * No-leak posture (enforced by the hook's shape — see `useWorkflowDataMap`):
 *   - the PRIMARY variable display is a friendly `Step N → path` label; the raw
 *     engine token sits behind a "Show token" toggle (copy still writes it);
 *   - configured fields show status (+ a safe scalar value preview), never
 *     sensitive content;
 *   - samples are sanitized scalar previews only; sensitive fields are masked;
 *   - no provider secrets, no raw payloads, no byte/file content.
 */
export function DataMapPanel({
  providerLabels,
}: {
  providerLabels?: Readonly<Record<string, string>>;
}) {
  const { nodes, hasActions, loading, sampleAvailable } = useWorkflowDataMap(
    providerLabels ? { providerLabels } : undefined,
  );

  // Empty / trigger-only → reuse the polished empty state.
  if (!hasActions) {
    return <BuilderTabPlaceholder tab="data-map" />;
  }

  return (
    <div
      data-testid="data-map-panel"
      className="absolute inset-0 z-10 overflow-y-auto p-5"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
        <header className="flex flex-col gap-1.5">
          <h2
            className="text-[15px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            Data Map
          </h2>
          <p className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            Copy a variable, then paste it into a later step field. Each step&rsquo;s
            outputs are available to the steps that come after it.
          </p>
          <p
            data-testid="data-map-sample-banner"
            data-sample-available={sampleAvailable}
            className="text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            {sampleAvailable
              ? "Sample from latest test run."
              : "Run a test, then come back here to see real example values."}
          </p>
        </header>

        <ol className="flex list-none flex-col gap-3">
          {nodes.map((node, index) => (
            <li key={node.nodeId}>
              <DataMapNodeCard node={node} index={index} loading={loading} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function DataMapNodeCard({
  node,
  index,
  loading,
}: {
  node: DataMapNode;
  index: number;
  loading: boolean;
}) {
  // Friendly, step-scoped label reused for the header AND each produced field's
  // primary variable display (so authors see "Step 1 → channel", not a UUID).
  const stepLabel = node.kind === "trigger" ? "Trigger" : `Step ${index}`;

  return (
    <section
      data-testid="data-map-node"
      data-node-kind={node.kind}
      className="flex flex-col gap-3 rounded-[8px] p-4"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        boxShadow: "var(--builder-shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className="text-[10.5px] font-medium uppercase tracking-wide"
            style={{ color: "var(--builder-muted)" }}
          >
            {node.kind === "trigger" ? "Trigger / start" : stepLabel} ·{" "}
            {node.providerLabel}
          </span>
          <h3
            className="truncate text-[13.5px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            {node.displayName}
          </h3>
          <span className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
            {node.typeLabel}
          </span>
        </div>
      </div>

      {!node.metaResolved ? (
        <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
          {node.loadingMeta || loading
            ? "Loading this step's details…"
            : "Details for this step will appear once its metadata is available."}
        </p>
      ) : null}

      {node.configuredFields.length > 0 ? (
        <DataMapSection title="Configured">
          <ul className="flex flex-col gap-0.5">
            {node.configuredFields.map((field) => (
              <li key={field.label}>
                <ConfiguredFieldRow field={field} />
              </li>
            ))}
          </ul>
        </DataMapSection>
      ) : null}

      {node.usesVariables.length > 0 ? (
        <DataMapSection title="Uses variables">
          <ul className="flex flex-col gap-1">
            {node.usesVariables.map((use, i) => (
              <li key={`${use.sourceLabel}-${use.path}-${i}`}>
                <UsesVariableRow use={use} />
              </li>
            ))}
          </ul>
        </DataMapSection>
      ) : null}

      <DataMapSection title="Produces">
        {node.outputsKnown ? (
          <>
            <ul className="flex flex-col gap-1.5">
              {node.expectedOutputs.map((output) => (
                <li key={output.path}>
                  <ProducedFieldRow output={output} stepLabel={stepLabel} />
                </li>
              ))}
            </ul>
            {node.outputsTruncated ? (
              <p
                className="text-[11px]"
                style={{ color: "var(--builder-muted)" }}
                data-testid="data-map-truncated-note"
              >
                Some fields are hidden to keep this readable.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--builder-muted)" }}>
            This step&rsquo;s outputs will appear after you test or run the
            workflow, or once its metadata is available.
          </p>
        )}
      </DataMapSection>
    </section>
  );
}
