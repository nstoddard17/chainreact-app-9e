"use client";

import type { DraftPreview, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import type {
  PreviewSetupField,
  PreviewSetupFieldsByType,
} from "@/core/workflows/previewSetupFields";

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
 *     when it renders as one of those). Async `optionsSource`, unresolved `dependsOn`, and
 *     secret/connection fields are NOT rendered — they show a compact "Choose after Apply" deferred
 *     line (or, for secret/connection, are dropped from the setup metadata entirely upstream).
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
}

export function BuilderPreviewSetupCard({
  preview,
  setupFieldsByType,
  previewConfig,
  onPreviewConfigChange,
  onApply,
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
      className="border-t p-3"
      style={{ background: "var(--builder-panel)", borderColor: "var(--builder-border)" }}
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
            {supported.map((field) => (
              <PreviewSetupControl
                key={field.name}
                node={node}
                field={field}
                value={previewConfig?.[node.previewId]?.[field.name]}
                onChange={(v) => onPreviewConfigChange(node.previewId, field.name, v)}
              />
            ))}
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
