"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  DataMapConfiguredField,
  DataMapOutput,
  DataMapVariableUse,
} from "../hooks/useWorkflowDataMap";

/**
 * Slice 4.BUILDER-DATA-MAP-3 — presentational pieces for the Data Map tab.
 *
 * Goal of this slice: make the tab read like a user-facing reference, not a
 * schema dump. The PRIMARY variable display is a friendly, step-scoped label
 * (`Step 1 → channel`); the raw engine token (which carries the node id) is
 * tucked behind a "Show token" toggle. Copy always writes the REAL token, so the
 * friendly label never has to be engine-supported.
 *
 * Nothing here renders raw provider payloads, secrets, tokens (beyond the
 * author-pickable variable reference), or byte/file content. Sensitive fields
 * show a badge and no value; samples are sanitized scalar previews only.
 */

export function DataMapSection({
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

export function ConfiguredFieldRow({ field }: { field: DataMapConfiguredField }) {
  const missing = field.status === "missing";
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]"
      data-testid="data-map-configured-field"
      data-status={field.status}
    >
      <span style={{ color: "var(--builder-muted)" }}>{field.label}:</span>
      {missing ? (
        <span
          data-testid="data-map-missing-badge"
          className="rounded-[4px] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
        >
          Missing
        </span>
      ) : field.valuePreview !== null ? (
        <span className="builder-mono" style={{ color: "var(--builder-text)" }}>
          {field.valuePreview}
        </span>
      ) : (
        <span style={{ color: "var(--builder-text)" }}>configured</span>
      )}
    </div>
  );
}

export function UsesVariableRow({ use }: { use: DataMapVariableUse }) {
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

export function ProducedFieldRow({
  output,
  stepLabel,
}: {
  output: DataMapOutput;
  /** Friendly step label, e.g. "Trigger" or "Step 1". */
  stepLabel: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-[6px] px-2 py-1.5"
      data-testid="data-map-output"
      data-output-path={output.path}
      data-sensitive={output.sensitive ? "true" : undefined}
      style={{ background: "var(--builder-panel-2)", border: "1px solid var(--builder-border)" }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        {/* Friendly, step-scoped label is the PRIMARY display — never the raw id.
            Rendered as a single text node so it reads + queries as one string. */}
        <span data-testid="data-map-var-friendly" style={{ color: "var(--builder-text)" }}>
          {`${stepLabel} → ${output.path}`}
        </span>
        <TypeBadge type={output.type} />
        {output.sensitive ? (
          <SensitiveBadge />
        ) : output.sample !== null ? (
          <SampleValue sample={output.sample} />
        ) : null}
      </div>

      {output.objectNeedsTest ? (
        <p
          data-testid="data-map-object-hint"
          className="text-[11px]"
          style={{ color: "var(--builder-muted)" }}
        >
          Object output — run a test to inspect fields.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <CopyVariableButton token={output.copyToken} />
        <TokenToggle token={output.copyToken} />
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="rounded-[4px] px-1 py-0.5 text-[10.5px]"
      style={{
        background: "var(--builder-panel)",
        border: "1px solid var(--builder-border)",
        color: "var(--builder-muted)",
      }}
      aria-label={`Type ${type}`}
      data-testid="data-map-type-badge"
    >
      {type}
    </span>
  );
}

function SensitiveBadge() {
  return (
    <span
      data-testid="data-map-sensitive-badge"
      className="rounded-[4px] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
      title="This value may contain sensitive data and is hidden."
    >
      Sensitive
    </span>
  );
}

function SampleValue({ sample }: { sample: string }) {
  return (
    <span
      data-testid="data-map-sample-value"
      className="text-[11px]"
      style={{ color: "var(--builder-muted)" }}
    >
      Example:{" "}
      <span className="builder-mono" style={{ color: "var(--builder-text)" }}>
        {sample}
      </span>
    </span>
  );
}

function CopyVariableButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = useCallback(() => {
    // Defensive: clipboard may be unavailable (some envs / tests). The token is
    // also revealable via "Show token", so copy is an enhancement.
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
      title="Copy this variable to paste into a later step"
      className="inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "var(--builder-panel)",
        borderColor: "var(--builder-border)",
        color: "var(--builder-text)",
      }}
    >
      {copied ? "Copied" : "Copy variable"}
      {copied ? (
        <span data-testid="data-map-copied" className="sr-only">
          Copied to clipboard
        </span>
      ) : null}
    </button>
  );
}

function TokenToggle({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        data-testid="data-map-token-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="text-[10.5px] underline-offset-2 hover:underline"
        style={{ color: "var(--builder-muted)" }}
      >
        {open ? "Hide token" : "Show token"}
      </button>
      {open ? (
        <code
          data-testid="data-map-var-token"
          className="builder-mono text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {token}
        </code>
      ) : null}
    </span>
  );
}
