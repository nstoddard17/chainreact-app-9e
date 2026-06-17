"use client";

import { useCallback, type ReactNode } from "react";
import {
  useWorkflowDataMap,
  type DataMapNode,
  type DataMapOutput,
  type DataMapVariableUse,
} from "../hooks/useWorkflowDataMap";
import { BuilderTabPlaceholder } from "./BuilderTabPlaceholder";

/**
 * Slice 4.BUILDER-DATA-MAP-MVP-1 — the top-level **Data Map** tab.
 *
 * Frontend-only MVP. When the workflow has action steps it renders a
 * workflow-ordered outline of the data each step uses and produces, derived
 * entirely from the current DRAFT graph + existing node metadata. When the
 * workflow is empty or trigger-only it falls back to the existing honest
 * empty-state panel (no action steps → nothing useful to outline yet).
 *
 * No-leak posture (enforced by the hook's shape — see `useWorkflowDataMap`):
 *   - configured fields show LABELS, never values;
 *   - variable uses show a friendly source label + path, never the raw
 *     `{{nodeId.path}}` token / internal id;
 *   - only the trigger's outputs offer a copyable `{{trigger.<path>}}` token;
 *   - no provider secrets, no DB ids, no raw JSON/schema dump.
 */
export function DataMapPanel({
  providerLabels,
}: {
  providerLabels?: Readonly<Record<string, string>>;
}) {
  const { nodes, hasActions, loading } = useWorkflowDataMap(
    providerLabels ? { providerLabels } : undefined,
  );

  // Empty / trigger-only → reuse the polished empty state (honest copy already
  // describes what will appear once actions are added).
  if (!hasActions) {
    return <BuilderTabPlaceholder tab="data-map" />;
  }

  return (
    <div
      data-testid="data-map-panel"
      className="absolute inset-0 z-10 overflow-y-auto p-5"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2
            className="text-[15px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            Data Map
          </h2>
          <p className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            The data each step uses and produces, in workflow order. Run a test to
            capture real sample values.
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
            {node.kind === "trigger" ? "Trigger / start" : `Step ${index}`} ·{" "}
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

      {node.configuredFieldLabels.length > 0 ? (
        <DataMapSection title="Configured">
          <div className="flex flex-wrap gap-1.5">
            {node.configuredFieldLabels.map((label) => (
              <span
                key={label}
                className="rounded-[4px] px-1.5 py-0.5 text-[11px]"
                style={{
                  background: "var(--builder-panel-2)",
                  border: "1px solid var(--builder-border)",
                  color: "var(--builder-muted)",
                }}
              >
                {label}
              </span>
            ))}
          </div>
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
          <ul className="flex flex-col gap-1.5">
            {node.expectedOutputs.map((output) => (
              <li key={output.name}>
                <OutputRow output={output} />
              </li>
            ))}
          </ul>
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

function DataMapSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--builder-muted)" }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function UsesVariableRow({ use }: { use: DataMapVariableUse }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px]">
      <span style={{ color: "var(--builder-muted)" }}>{use.fieldLabel}:</span>
      <span style={{ color: "var(--builder-text)" }}>{use.sourceLabel}</span>
      {use.path ? (
        <span style={{ color: "var(--builder-muted)" }}>· {use.path}</span>
      ) : null}
      {use.broken ? (
        <span
          className="rounded-[4px] px-1 py-0.5 text-[10.5px]"
          style={{
            background: "var(--builder-panel-2)",
            border: "1px solid var(--builder-border)",
            color: "var(--builder-muted)",
          }}
        >
          no longer available
        </span>
      ) : null}
    </div>
  );
}

function OutputRow({ output }: { output: DataMapOutput }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      <span style={{ color: "var(--builder-text)" }}>{output.name}</span>
      <span
        className="rounded-[4px] px-1 py-0.5 text-[10.5px]"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-muted)",
        }}
      >
        {output.type}
      </span>
      {output.sensitive ? (
        <span
          className="text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
          title="This value may contain sensitive data and is hidden until you run the workflow."
        >
          sensitive
        </span>
      ) : null}
      {output.copyToken ? <CopyTokenButton token={output.copyToken} /> : null}
    </div>
  );
}

function CopyTokenButton({ token }: { token: string }) {
  const handleCopy = useCallback(() => {
    // Defensive: clipboard is unavailable in some environments (and tests). The
    // token is also rendered as selectable code text, so copy is an enhancement.
    void navigator.clipboard?.writeText(token);
  }, [token]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="data-map-copy-token"
      title="Copy this variable path"
      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] transition-colors"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-muted)",
      }}
    >
      <code style={{ color: "var(--builder-text)" }}>{token}</code>
      <span aria-hidden>⧉</span>
      <span className="sr-only">Copy {token}</span>
    </button>
  );
}
