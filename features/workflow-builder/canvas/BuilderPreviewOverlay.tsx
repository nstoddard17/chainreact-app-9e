"use client";

import type { DraftPreview, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import type {
  PreviewSetupField,
  PreviewSetupFieldsByType,
} from "@/core/workflows/previewSetupFields";

/**
 * Non-applied AI draft preview overlay (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY).
 *
 * Renders a capability-validated {@link DraftPreview} as a SEPARATE, ephemeral visual layer floating
 * over the builder canvas — shimmered/ghost "Suggested" nodes joined by dashed preview edges. It is a
 * pure presentational component: it reads the preview prop and an `onDiscard` callback, and renders.
 *
 * GUARANTEES:
 *   - It NEVER merges preview nodes/edges into the real React Flow graph or any builder store itself.
 *     The preview is its own DOM layer; the real canvas underneath is untouched while previewing.
 *   - It performs no network call and reads no secret. It surfaces exactly two explicit, user-clicked
 *     actions, both handled by the parent: `onDiscard` (drop the overlay, no mutation) and the OPTIONAL
 *     `onApply` (HERMES-AGENT-APPLY-PREVIEW-PATCH — additive local-draft edit via the graph slice).
 *   - There is NO Create / Use-this / separate-workflow / Run / Save control. "Apply preview" only
 *     adds the proposed nodes/edges to the LOCAL draft (dirty via the normal mechanism); the user
 *     still saves/activates through existing builder flows.
 *
 * The container is `pointer-events-none` so the canvas underneath stays interactive; only the control
 * bar opts back into pointer events. Ghost nodes/edges are non-interactive.
 */

export interface BuilderPreviewOverlayProps {
  /** The ephemeral preview to render. The parent renders this overlay only when non-null. */
  readonly preview: DraftPreview;
  /** Drop the overlay (UI state only). Never mutates the workflow. */
  readonly onDiscard: () => void;
  /**
   * Optional (builder-only): apply the preview as an additive patch to the LOCAL draft. When omitted,
   * the overlay is review-only (no Apply control). Provided by `WorkflowBuilder`.
   */
  readonly onApply?: () => void;
  /**
   * HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — supported, metadata-derived setup fields per `provider:type`.
   * When present (with `onPreviewConfigChange`), the overlay renders a "Set up these steps" section so
   * the user can fill known fields on the holographic preview BEFORE Apply. Deterministic + local: no
   * model call, no provider/network resolver in this slice.
   */
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  /** Ephemeral guided-setup values, keyed by previewId → fieldName → value. Owned by `WorkflowBuilder`. */
  readonly previewConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** Update one ephemeral guided-setup value. Preview-only — never touches real draft config. */
  readonly onPreviewConfigChange?: (previewId: string, fieldName: string, value: unknown) => void;
}

export function BuilderPreviewOverlay({
  preview,
  onDiscard,
  onApply,
  setupFieldsByType,
  previewConfig,
  onPreviewConfigChange,
}: BuilderPreviewOverlayProps) {
  // Per node: which still-missing fields can be collected now (supported local controls) vs. which
  // must wait until after Apply (async/sensitive/unsupported). Deterministic, metadata-driven.
  const setupNodes = onPreviewConfigChange
    ? preview.nodes
        .map((node) => {
          const missing = node.missingInputs ?? [];
          if (missing.length === 0) return null;
          const all = setupFieldsByType?.[`${node.provider}:${node.type}`] ?? [];
          const supported = all.filter((f) => missing.includes(f.name));
          const supportedNames = new Set(supported.map((f) => f.name));
          const afterApply = missing.filter((n) => !supportedNames.has(n));
          if (supported.length === 0 && afterApply.length === 0) return null;
          return { node, supported, afterApply };
        })
        .filter((x): x is { node: DraftPreviewNode; supported: PreviewSetupField[]; afterApply: string[] } => x !== null)
    : [];
  const showSetup = setupNodes.some((s) => s.supported.length > 0);

  return (
    <div
      data-testid="builder-preview-overlay"
      data-preview="true"
      aria-label="Suggested workflow preview"
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center overflow-auto p-4"
    >
      {/* Top control bar — the only interactive part of the overlay. */}
      <div
        className="pointer-events-auto mb-4 flex items-center gap-3 rounded-full px-3 py-1.5 shadow-md"
        style={{
          background: "var(--builder-panel)",
          border: "1px dashed var(--builder-accent)",
        }}
      >
        <span
          data-testid="builder-preview-badge"
          className="builder-preview-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--builder-accent)", color: "white" }}
        >
          <SparkleIcon /> Suggested
        </span>
        <span
          data-testid="builder-preview-overlay-notice"
          className="text-[11.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {preview.notice}
        </span>
        {onApply && (
          <button
            type="button"
            onClick={onApply}
            data-testid="builder-preview-apply"
            className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-white"
            style={{ background: "var(--builder-accent)", border: "1px solid var(--builder-accent)" }}
            title="Add the proposed nodes to your draft (you still review fields and save)"
          >
            Apply preview
          </button>
        )}
        <button
          type="button"
          onClick={onDiscard}
          data-testid="builder-preview-discard"
          className="rounded-full px-2 py-0.5 text-[11.5px] font-medium"
          style={{ color: "var(--builder-text-2)", border: "1px solid var(--builder-border)" }}
          title="Discard preview (your workflow is unchanged)"
        >
          Discard preview
        </button>
      </div>

      {(preview.title.length > 0 || preview.summary.length > 0) && (
        <div className="pointer-events-none mb-3 max-w-[420px] text-center">
          {preview.title.length > 0 && (
            <div className="text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
              {preview.title}
            </div>
          )}
          {preview.summary.length > 0 && (
            <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
              {preview.summary}
            </div>
          )}
        </div>
      )}

      {/* Ghost node chain. Edges render as dashed connectors between consecutive ghost nodes. */}
      <ol className="pointer-events-none flex flex-col items-center gap-0">
        {preview.nodes.map((node, i) => (
          <li key={node.previewId} className="flex flex-col items-center">
            <div
              data-testid="builder-preview-node"
              data-preview="true"
              className="builder-preview-node-ghost w-[260px] animate-pulse rounded-[8px] border border-dashed p-3 opacity-80"
              style={{
                background: "var(--builder-panel-2)",
                borderColor: "var(--builder-accent)",
                boxShadow: "0 0 0 3px color-mix(in oklab, var(--builder-accent) 18%, transparent)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--builder-panel)", color: "var(--builder-muted)" }}
                >
                  {node.role}
                </span>
                <code className="text-[12px]" style={{ color: "var(--builder-text)" }}>
                  {node.label}
                </code>
              </div>
              {node.purpose.length > 0 && (
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--builder-muted)" }}>
                  {node.purpose}
                </div>
              )}
              {node.missingInputs && node.missingInputs.length > 0 && (
                <div className="mt-1 text-[11px]" style={{ color: "var(--builder-warning, #b45309)" }}>
                  Still needs: {node.missingInputs.join(", ")}
                </div>
              )}
            </div>
            {/* Dashed preview edge to the next ghost node (linear chain). */}
            {i < preview.nodes.length - 1 && (
              <span
                data-testid="builder-preview-edge"
                data-preview="true"
                aria-hidden
                className="builder-preview-edge-dashed my-0 h-6 animate-pulse border-l-2 border-dashed"
                style={{ borderColor: "var(--builder-accent)" }}
              />
            )}
          </li>
        ))}
      </ol>

      {/* HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — "Set up these steps": fill known fields on the
          holographic preview BEFORE Apply. Values are ephemeral (preview-only); nothing is saved or
          made dirty until the user clicks Apply preview. Interactive → pointer-events-auto. */}
      {showSetup && (
        <section
          data-testid="builder-preview-setup"
          className="pointer-events-auto mt-4 w-[320px] rounded-[8px] border p-3 text-left"
          style={{ background: "var(--builder-panel)", borderColor: "var(--builder-border)" }}
        >
          <h3 className="text-[12px] font-semibold" style={{ color: "var(--builder-text)" }}>
            Set up these steps
          </h3>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--builder-muted)" }}>
            Fill what you can now — values stay on the preview until you Apply. Nothing is saved.
          </p>
          {setupNodes.map(({ node, supported, afterApply }) => (
            <div key={node.previewId} className="mt-2.5">
              <div className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
                {node.label}
              </div>
              {supported.map((field) => (
                <PreviewSetupControl
                  key={field.name}
                  node={node}
                  field={field}
                  value={previewConfig?.[node.previewId]?.[field.name]}
                  onChange={(v) => onPreviewConfigChange?.(node.previewId, field.name, v)}
                />
              ))}
              {afterApply.length > 0 && (
                <div
                  data-testid="preview-setup-after-apply"
                  className="mt-1 text-[11px]"
                  style={{ color: "var(--builder-muted)" }}
                >
                  Needs setup after Apply: {afterApply.join(", ")}
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
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
      <label className="mt-1.5 flex items-center gap-2 text-[11.5px]" style={{ color: "var(--builder-text)" }}>
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

const SparkleIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
  </svg>
);
