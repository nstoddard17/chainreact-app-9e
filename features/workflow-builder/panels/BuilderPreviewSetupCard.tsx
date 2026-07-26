"use client";

import type { DraftPreview, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import type {
  PreviewSetupField,
  PreviewSetupFieldsByType,
} from "@/core/workflows/previewSetupFields";
import { SetupAsyncSelectControl, SetupFieldControl } from "./builderSetupFieldControls";

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
  /**
   * REACT-CONFIG-COVERAGE-1 — values the user supplied in their own request (server-sanitized
   * plan-step config), keyed previewId → fieldName → value. Fields with a supported control render
   * editable (their value is pre-seeded into previewConfig); the rest are listed read-only so the
   * user can SEE what will be set on Apply. Client-local display of the user's own data — never
   * sent anywhere from here.
   */
  readonly prefilledConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
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
  /**
   * REACT-AGENT-RESOLVER-RECOVERY-1 — display labels per provider slug, used to name the provider in
   * option-recovery copy ("We couldn't load your Typeform forms."). Absent → the slug is humanized.
   */
  readonly providerLabels?: Readonly<Record<string, string>>;
  /**
   * REACT-AGENT-RESOLVER-RECOVERY-1 — the escape hatch for a field whose options cannot load.
   *
   * A PREVIEW node does not exist in the draft yet, so there is no step editor to open until it
   * does. The builder implements this as: apply THIS preview to the draft (the same explicit,
   * additive, local-only apply the Apply button performs — it seeds every value already entered,
   * creates no new workflow, and saves/activates nothing), then select the resulting node and
   * highlight this field. Absent → the action is not offered and no copy claims it exists.
   */
  readonly onOpenStepEditor?: (previewId: string, fieldName: string) => void;
}

export function BuilderPreviewSetupCard({
  preview,
  setupFieldsByType,
  previewConfig,
  prefilledConfig,
  onPreviewConfigChange,
  onApply,
  workflowId,
  providerLabels,
  onOpenStepEditor,
}: BuilderPreviewSetupCardProps) {
  // Per node: which still-missing fields can be collected now (supported local controls) vs. which
  // must wait until after Apply (async resolver / cascade / unsupported). Deterministic, metadata-driven.
  // REACT-CONFIG-COVERAGE-1 — fields the user's request already filled (prefilledConfig) also render:
  // editable when a supported control exists, otherwise as a read-only "From your request" row.
  const setupNodes = preview.nodes
    .map((node) => {
      const missing = node.missingInputs ?? [];
      const prefilled = prefilledConfig?.[node.previewId] ?? {};
      const prefilledNames = Object.keys(prefilled);
      if (missing.length === 0 && prefilledNames.length === 0) return null;
      const all = setupFieldsByType?.[`${node.provider}:${node.type}`] ?? [];
      const supported = all.filter((f) => missing.includes(f.name) || prefilledNames.includes(f.name));
      const supportedNames = new Set(supported.map((f) => f.name));
      const afterApply = missing.filter((n) => !supportedNames.has(n));
      const prefilledReadOnly = prefilledNames
        .filter((n) => !supportedNames.has(n))
        .map((n) => ({ name: n, value: prefilled[n] }));
      return { node, supported, afterApply, prefilledReadOnly };
    })
    .filter(
      (
        x,
      ): x is {
        node: DraftPreviewNode;
        supported: PreviewSetupField[];
        afterApply: string[];
        prefilledReadOnly: { name: string; value: unknown }[];
      } => x !== null,
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
        {setupNodes.map(({ node, supported, afterApply, prefilledReadOnly }) => (
          <div key={node.previewId}>
            <div className="text-[11.5px] font-medium" style={{ color: "var(--builder-text)" }}>
              {node.label}
            </div>
            {supported.map((field) =>
              field.type === "select-async" ? (
                <SetupAsyncSelectControl
                  key={field.name}
                  field={field}
                  value={previewConfig?.[node.previewId]?.[field.name]}
                  nodeConfig={previewConfig?.[node.previewId]}
                  {...(workflowId ? { workflowId } : {})}
                  {...(providerLabels?.[node.provider] ? { providerLabel: providerLabels[node.provider] } : {})}
                  onChange={(v) => onPreviewConfigChange(node.previewId, field.name, v)}
                  {...(onOpenStepEditor
                    ? {
                        onOpenStepEditor: () => onOpenStepEditor(node.previewId, field.name),
                        // Honest label: this step is still a preview, so opening its editor means
                        // adding the sketched steps to the draft first (local only — nothing is
                        // saved, activated, or run, and everything entered here comes with it).
                        openStepEditorLabel: "Add to draft & open step",
                        openStepEditorTitle:
                          "Adds the sketched steps to your draft (nothing is saved or activated) and opens this step with this field highlighted",
                      }
                    : {})}
                  testid={`preview-setup-${node.previewId}-${field.name}`}
                />
              ) : (
                <SetupFieldControl
                  key={field.name}
                  field={field}
                  value={previewConfig?.[node.previewId]?.[field.name]}
                  onChange={(v) => onPreviewConfigChange(node.previewId, field.name, v)}
                  testid={`preview-setup-${node.previewId}-${field.name}`}
                />
              ),
            )}
            {prefilledReadOnly.length > 0 && (
              <div
                data-testid="preview-setup-prefilled"
                className="mt-1 text-[11px]"
                style={{ color: "var(--builder-muted)" }}
              >
                From your request:{" "}
                {prefilledReadOnly
                  .map(({ name, value }) => `${name}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
                  .join(" · ")}
              </div>
            )}
            {afterApply.length > 0 && (
              <div
                data-testid="preview-setup-after-apply"
                className="mt-1 text-[11px]"
                style={{ color: "var(--builder-muted)" }}
              >
                Choose after Apply: {afterApply.join(", ")}
                {/* REACT-AGENT-RESOLVER-RECOVERY-1 — a field with no pre-apply control still needs a
                    way to be reached. Same honest action as the recovery block: add the sketched
                    steps to the draft (local only) and land on this field. */}
                {onOpenStepEditor && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      data-testid={`preview-setup-${node.previewId}-after-apply-open`}
                      onClick={() => onOpenStepEditor(node.previewId, afterApply[0]!)}
                      className="underline"
                      style={{ color: "var(--builder-accent)" }}
                      title="Adds the sketched steps to your draft (nothing is saved or activated) and opens this step"
                    >
                      Add to draft &amp; open step
                    </button>
                  </>
                )}
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
