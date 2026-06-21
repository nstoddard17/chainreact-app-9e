"use client";

import type { DraftPreview, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import type {
  PreviewSetupField,
  PreviewSetupFieldsByType,
} from "@/core/workflows/previewSetupFields";
import { useOptionsSource } from "@/features/workflow-builder/hooks/useOptionsSource";

/**
 * Guided preview setup card — React chat rail (HERMES-AGENT-GUIDED-PREVIEW-SETUP-RAIL-UX).
 *
 * Re-homes the guided setup controls OUT of the holographic canvas nodes (which are now visual-only)
 * and INTO the React rail, tied to the LATEST shown preview. The mental model: React sketched the
 * workflow shape (the shimmering canvas nodes); this card asks only for the details needed to finish
 * it before the user applies it to their draft.
 *
 * GUARANTEES (presentational only):
 *   - No store access, no network/fetch, no model/gateway/Hermes call, no secret. Values flow up via
 *     `onPreviewConfigChange` (ephemeral preview-config in `WorkflowBuilder`) and are seeded into the
 *     draft ONLY when the user clicks Apply (`onApply` → the existing explicit "Apply preview" path).
 *   - Filling a control NEVER calls Hermes / a model and is NEVER sent to a prompt or audit text —
 *     including `recipient`-class values, which are deterministic local input seeded on Apply only.
 *   - Supported local controls: text / textarea / number / boolean / static-select (+ recipient-class
 *     when it renders as one of those).
 *   - Async single-select (`select-async`, e.g. Slack `channel`): loaded through the EXISTING
 *     authenticated, account-scoped resolver (`useOptionsSource` → `GET /api/options/[source]`) — the
 *     SAME path normal builder config uses, NEVER a model/Hermes call. Opening or picking a dropdown
 *     never calls Hermes; the selected value lives in previewConfig and is seeded on Apply only.
 *     `dependsOn` parents are read from previewConfig; an unresolved parent defers the field
 *     ("Choose X first"). secret/connection fields are dropped upstream and never render here.
 */

export interface BuilderPreviewSetupCardProps {
  /** The latest preview shown on the canvas (owned by `WorkflowBuilder`). */
  readonly preview: DraftPreview;
  /** Supported, metadata-derived setup fields per `provider:type`. Absent → nothing to collect. */
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  /** Ephemeral guided-setup values, keyed previewId → fieldName → value. Owned by `WorkflowBuilder`. */
  readonly previewConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Record one ephemeral value. Preview-only — never touches the real draft / configSlice / DB. */
  readonly onPreviewConfigChange: (previewId: string, fieldName: string, value: unknown) => void;
  /** The existing explicit "Apply preview" action (additive local-draft edit). */
  readonly onApply: () => void;
  /**
   * The workflow currently open in the builder — forwarded to the option resolver as account/workflow
   * provenance (same scoping normal config uses). Never a token/secret. Absent → resolver uses the
   * caller's account context only.
   */
  readonly workflowId?: string;
}

export function BuilderPreviewSetupCard({
  preview,
  setupFieldsByType,
  previewConfig,
  onPreviewConfigChange,
  onApply,
  workflowId,
}: BuilderPreviewSetupCardProps) {
  // Per node: which still-missing fields can be collected now (supported local controls) vs. which
  // must wait until after Apply (async resolver / cascade / unsupported). Deterministic, metadata-driven.
  const setupNodes = preview.nodes
    .map((node) => {
      const missing = node.missingInputs ?? [];
      if (missing.length === 0) return null;
      const all = setupFieldsByType?.[`${node.provider}:${node.type}`] ?? [];
      const supported = all.filter((f) => missing.includes(f.name));
      const supportedNames = new Set(supported.map((f) => f.name));
      const afterApply = missing.filter((n) => !supportedNames.has(n));
      return { node, supported, afterApply };
    })
    .filter(
      (x): x is { node: DraftPreviewNode; supported: PreviewSetupField[]; afterApply: string[] } =>
        x !== null,
    );

  const hasAnyMissing = setupNodes.length > 0;
  const hasSupported = setupNodes.some((s) => s.supported.length > 0);

  return (
    <section
      data-testid="builder-preview-setup-rail"
      aria-label="Finish workflow setup"
      // HERMES-AGENT-RAIL-CHAT-LAYOUT-POLISH — an inline, compact chat response/action card inside the
      // transcript (not a full-width page panel). Composer stays pinned below the transcript.
      className="mt-1 rounded-md border p-3"
      style={{ background: "var(--builder-panel-2)", borderColor: "var(--builder-border)" }}
    >
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--builder-text)" }}>
        {hasSupported ? "Finish these details before applying:" : "Apply this workflow to your draft"}
      </h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--builder-muted)" }}>
        {hasAnyMissing
          ? "React sketched the workflow. Add the details below, then apply it to your draft. Nothing is saved until you do."
          : "React sketched the workflow. Apply it to your draft — nothing is saved or activated until you choose to."}
      </p>

      <div className="mt-2 max-h-[40vh] space-y-2.5 overflow-y-auto">
        {setupNodes.map(({ node, supported, afterApply }) => (
          <div key={node.previewId}>
            <div className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
              {node.label}
            </div>
            {supported.map((field) =>
              field.type === "select-async" ? (
                <PreviewAsyncSelectControl
                  key={field.name}
                  node={node}
                  field={field}
                  value={previewConfig?.[node.previewId]?.[field.name]}
                  nodeConfig={previewConfig?.[node.previewId]}
                  {...(workflowId ? { workflowId } : {})}
                  onChange={(v) => onPreviewConfigChange(node.previewId, field.name, v)}
                />
              ) : (
                <PreviewSetupControl
                  key={field.name}
                  node={node}
                  field={field}
                  value={previewConfig?.[node.previewId]?.[field.name]}
                  onChange={(v) => onPreviewConfigChange(node.previewId, field.name, v)}
                />
              ),
            )}
            {afterApply.length > 0 && (
              <div
                data-testid="preview-setup-after-apply"
                className="mt-1 text-[11px]"
                style={{ color: "var(--builder-muted)" }}
              >
                Choose after Apply: {afterApply.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onApply}
        data-testid="builder-preview-setup-apply"
        className="mt-3 w-full rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white"
        style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
        title="Add the proposed steps to your draft (you still review fields and save)"
      >
        Apply to draft
      </button>
    </section>
  );
}

/**
 * Async single-select control for a `select-async` preview field. Loads its options through the
 * EXISTING authenticated, account-scoped resolver (`useOptionsSource` → `GET /api/options/[source]`).
 * NEVER a model/Hermes call. The selected value updates previewConfig only (seeded on Apply). When a
 * `dependsOn` parent is missing from this node's preview config, the field defers ("Choose X first").
 */
function PreviewAsyncSelectControl({
  node,
  field,
  value,
  nodeConfig,
  workflowId,
  onChange,
}: {
  node: DraftPreviewNode;
  field: PreviewSetupField;
  value: unknown;
  nodeConfig: Readonly<Record<string, unknown>> | undefined;
  workflowId?: string;
  onChange: (value: unknown) => void;
}) {
  const testid = `preview-setup-${node.previewId}-${field.name}`;
  const inputStyle = {
    background: "var(--builder-panel-2)",
    border: "1px solid var(--builder-border)",
    color: "var(--builder-text)",
  } as const;
  const strValue = typeof value === "string" ? value : "";

  // Resolve dependsOn parents from THIS node's ephemeral preview config (never from upstream graph).
  const deps: Record<string, string> = {};
  let missingDep: string | undefined;
  for (const parent of field.dependsOn ?? []) {
    const pv = nodeConfig?.[parent];
    const s = typeof pv === "string" ? pv : typeof pv === "number" ? String(pv) : "";
    if (s.trim().length === 0) {
      if (!missingDep) missingDep = parent;
      continue;
    }
    deps[parent] = s;
  }
  const depsUnresolved = (field.dependsOn?.length ?? 0) > 0 && missingDep !== undefined;

  const { state, refetch } = useOptionsSource({
    source: field.optionsSource ?? null,
    deps,
    enabled: !depsUnresolved,
    ...(workflowId ? { workflowId } : {}),
  });

  const labelEl = (
    <span className="block" style={{ color: "var(--builder-muted)" }}>
      {field.label}
    </span>
  );

  // Deferred until a dependsOn parent is chosen — disabled select, no fetch (enabled:false above).
  if (depsUnresolved) {
    return (
      <label className="mt-1.5 block text-[11px]">
        {labelEl}
        <select
          data-testid={testid}
          aria-label={field.label}
          disabled
          value=""
          onChange={() => {}}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        >
          <option value="">Choose {missingDep} first</option>
        </select>
      </label>
    );
  }

  // Error / disconnected / reauth / owner-gated → safe message; offer retry only where it can help.
  if (
    state.status === "error" ||
    state.status === "disconnected" ||
    state.status === "needs-reconnect" ||
    state.status === "owner-gated" ||
    state.status === "owner-must-connect"
  ) {
    const canRetry = state.status === "error" || state.status === "disconnected" || state.status === "needs-reconnect";
    return (
      <div className="mt-1.5 block text-[11px]">
        {labelEl}
        <div
          data-testid={`${testid}-error`}
          className="mt-0.5 rounded px-2 py-1 text-[11px]"
          style={{ background: "var(--builder-panel-2)", border: "1px solid var(--builder-border)", color: "var(--builder-muted)" }}
        >
          Couldn&apos;t load options.{" "}
          {canRetry && (
            <button
              type="button"
              data-testid={`${testid}-retry`}
              onClick={refetch}
              className="underline"
              style={{ color: "var(--builder-accent)" }}
            >
              Try again
            </button>
          )}
          {!canRetry && <span>You can finish this after Apply.</span>}
        </div>
      </div>
    );
  }

  const loading = state.status === "loading";
  const empty = state.status === "empty";

  return (
    <label className="mt-1.5 block text-[11px]">
      {labelEl}
      <select
        data-testid={testid}
        aria-label={field.label}
        value={strValue}
        disabled={loading || empty}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
        style={inputStyle}
      >
        <option value="">
          {loading ? "Loading…" : empty ? "No options available" : "Select…"}
        </option>
        {state.items.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One guided-setup control for a supported preview field. Native primitives; preview-only value. */
function PreviewSetupControl({
  node,
  field,
  value,
  onChange,
}: {
  node: DraftPreviewNode;
  field: PreviewSetupField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const testid = `preview-setup-${node.previewId}-${field.name}`;
  const inputStyle = {
    background: "var(--builder-panel-2)",
    border: "1px solid var(--builder-border)",
    color: "var(--builder-text)",
  } as const;
  const strValue = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

  if (field.type === "boolean") {
    return (
      <label
        className="mt-1.5 flex items-center gap-2 text-[11.5px]"
        style={{ color: "var(--builder-text)" }}
      >
        <input
          type="checkbox"
          data-testid={testid}
          aria-label={field.label}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  return (
    <label className="mt-1.5 block text-[11px]" style={{ color: "var(--builder-muted)" }}>
      {field.label}
      {field.type === "textarea" ? (
        <textarea
          data-testid={testid}
          aria-label={field.label}
          value={strValue}
          rows={2}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        />
      ) : field.type === "select" ? (
        <select
          data-testid={testid}
          aria-label={field.label}
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          data-testid={testid}
          aria-label={field.label}
          value={strValue}
          {...(field.placeholder ? { placeholder: field.placeholder } : {})}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded px-2 py-1 text-[12px]"
          style={inputStyle}
        />
      )}
    </label>
  );
}
