"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  const { nodes, hasActions, loading, sampleAvailable } = useWorkflowDataMap(
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
        <header className="flex flex-col gap-1.5">
          <h2
            className="text-[15px] font-semibold"
            style={{ color: "var(--builder-text)" }}
          >
            Data Map
          </h2>
          <p className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            See what each step produces and copy variables into later steps.
          </p>
          <p
            data-testid="data-map-sample-banner"
            data-sample-available={sampleAvailable}
            className="text-[11.5px]"
            style={{ color: "var(--builder-muted)" }}
          >
            {sampleAvailable
              ? "Sample from latest test run."
              : "Run a test to capture real sample values."}
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
          <>
            <ul className="flex flex-col gap-1.5">
              {node.expectedOutputs.map((output) => (
                <li key={output.path}>
                  <OutputRow output={output} />
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
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]"
      data-testid="data-map-output"
      data-output-path={output.path}
      data-sensitive={output.sensitive ? "true" : undefined}
    >
      <code style={{ color: "var(--builder-text)" }}>{output.path}</code>
      <span
        className="rounded-[4px] px-1 py-0.5 text-[10.5px]"
        style={{
          background: "var(--builder-panel-2)",
          border: "1px solid var(--builder-border)",
          color: "var(--builder-muted)",
        }}
        aria-label={`Type ${output.type}`}
        data-testid="data-map-type-badge"
      >
        {output.type}
      </span>
      {output.sensitive ? (
        <span
          data-testid="data-map-sensitive-badge"
          className="rounded-[4px] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
          title="This value may contain sensitive data and is hidden."
        >
          Sensitive
        </span>
      ) : output.sample !== null ? (
        <span
          data-testid="data-map-sample-value"
          className="text-[11px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Example:{" "}
          <span className="builder-mono" style={{ color: "var(--builder-text)" }}>
            {output.sample}
          </span>
        </span>
      ) : null}
      <CopyTokenButton token={output.copyToken} />
    </div>
  );
}

function CopyTokenButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending reset on unmount so a late timer never sets state on a
  // torn-down component (e.g. when the user switches tabs after copying).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = useCallback(() => {
    // Defensive: clipboard is unavailable in some environments (and tests). The
    // token is also rendered as selectable code text, so copy is an enhancement.
    void navigator.clipboard?.writeText(token);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [token]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="data-map-copy-token"
      title="Copy this variable"
      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11px] transition-colors"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-muted)",
      }}
    >
      <code style={{ color: "var(--builder-text)" }}>{token}</code>
      <span aria-hidden>{copied ? "✓" : "⧉"}</span>
      {copied ? (
        <span data-testid="data-map-copied" style={{ color: "var(--builder-text)" }}>
          Copied
        </span>
      ) : null}
      <span className="sr-only">{copied ? "Copied" : `Copy ${token}`}</span>
    </button>
  );
}
