"use client";

import { DocumentStepMenu, type DocumentStepMenuItem } from "./DocumentStepMenu";
import type { DocumentSentenceBlock } from "./projection";

/**
 * One Document sentence (5.DUAL-BUILDER-1 CS-1; interactive in CS-2).
 *
 * Renders a step as calm prose: marker ("When" / step number) · provider
 * identity · title · configured value chips (shared summary core) · blank
 * chips (same required-field rule as the canvas "Needs setup" chip).
 *
 * CS-2 — chips are buttons that open the anchored Guided Stop for that
 * field, and every sentence exposes "Configure step" (the existing full
 * inspector). Chip clicks NEVER mutate anything themselves — they only open
 * the editor; commits flow through the shared config path.
 *
 * DOC-STEP-CONTROLS-1 —
 *   - the MARKER RAIL is one fixed-width column, so the "When" badge, every
 *     step number, and therefore every provider pill / sentence start on the
 *     same left edge (it also matches the insertion affordance's indent);
 *   - the step TITLE is the primary "configure this step" target (clicking the
 *     sentence opens the existing full inspector) — the old hover-only
 *     "⚙ Configure step" button is gone, and the same action is repeated in the
 *     overflow menu for discoverability;
 *   - a quiet, ALWAYS-VISIBLE overflow ("⋯") sits in a RESERVED right column,
 *     so nothing appears/disappears (and nothing reflows) on hover.
 */
export function DocumentSentence({
  block,
  marker,
  providerIcon,
  onEditField,
  onConfigureStep,
  editingFieldName,
  menuItems,
}: {
  block: DocumentSentenceBlock;
  /** Reading-order marker: "When" for the trigger, a number for actions. */
  marker: string;
  providerIcon?: string | undefined;
  /** CS-2 — open the Guided Stop for one field of this step. */
  onEditField?: ((nodeId: string, fieldName: string) => void) | undefined;
  /** CS-2 — open the existing full inspector for this step. */
  onConfigureStep?: ((nodeId: string) => void) | undefined;
  /** The field currently being edited by an open Guided Stop (highlight). */
  editingFieldName?: string | null | undefined;
  /** Step-management entries for the always-visible overflow menu. */
  menuItems?: readonly DocumentStepMenuItem[] | undefined;
}) {
  const chipInteractive = onEditField !== undefined;
  const isTrigger = block.nodeKind === "trigger";
  const stepLabel = isTrigger ? "the trigger" : `step ${marker}`;
  return (
    <div
      data-testid={`document-sentence-${block.nodeId}`}
      data-node-id={block.nodeId}
      className="group flex items-baseline gap-3 py-2"
    >
      {/* Reading-order marker — a calm "When" for the trigger, a small numeral
          for actions, both left-aligned inside ONE fixed-width rail column so
          the sentences below line up exactly (mock). Screen readers get the
          reading position as words; the badge itself is decorative. */}
      <span className="mt-1 flex h-5 w-11 shrink-0 select-none items-center">
        <span className="sr-only">{isTrigger ? "When" : `Step ${marker}`}</span>
        <span
          aria-hidden
          className="builder-mono inline-flex h-5 items-center justify-center rounded-md text-[10px] font-semibold uppercase tracking-[0.04em]"
          style={{
            minWidth: isTrigger ? "40px" : "20px",
            padding: isTrigger ? "0 7px" : "0",
            width: isTrigger ? undefined : "20px",
            background: isTrigger ? "var(--builder-accent-soft)" : "transparent",
            color: isTrigger ? "var(--builder-accent)" : "var(--builder-muted-2)",
            border: isTrigger ? "1px solid var(--builder-accent-soft)" : "1px solid var(--builder-border)",
          }}
        >
          {marker}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        {/* The sentence is editorial serif prose — larger and more readable than
            an inspector label, with the provider chip + value/blank chips inline
            so it reads as one sentence rather than a form. */}
        <p
          className="crv2-doc-prose m-0 text-[17px] leading-[1.65]"
          style={{ color: "var(--builder-text)" }}
        >
          <ProviderTag label={block.providerLabel} icon={providerIcon} />{" "}
          {onConfigureStep ? (
            <button
              type="button"
              data-testid={`document-configure-step-${block.nodeId}`}
              onClick={() => onConfigureStep(block.nodeId)}
              className="crv2-step-title"
              title="Everything this step does, in one place"
            >
              {block.title}
            </button>
          ) : (
            <span className="font-medium">{block.title}</span>
          )}
          {block.untyped ? (
            <span
              className="ml-2 align-middle text-[12px]"
              style={{ color: "var(--builder-muted)", fontFamily: "var(--font-sans, sans-serif)" }}
            >
              — not set up yet
            </span>
          ) : null}
          {block.valueChips.map((chip) => {
            const editing = editingFieldName === chip.name;
            return (
              <span key={`v-${chip.name}`}>
                {" "}
                <button
                  type="button"
                  disabled={!chipInteractive}
                  data-testid={`document-value-chip-${block.nodeId}-${chip.label}`}
                  data-field-name={chip.name}
                  data-chip-state={editing ? "editing" : "set"}
                  onClick={() => onEditField?.(block.nodeId, chip.name)}
                  className={`crv2-chip truncate ${editing ? "crv2-chip--editing" : "crv2-chip--value"}`}
                  title={`${chip.label}: ${chip.display}`}
                >
                  <span className="truncate">{chip.display}</span>
                </button>
              </span>
            );
          })}
          {block.blankChips.map((chip) => {
            const editing = editingFieldName === chip.name;
            return (
              <span key={`b-${chip.name}`}>
                {" "}
                <button
                  type="button"
                  disabled={!chipInteractive}
                  data-testid={`document-blank-chip-${block.nodeId}-${chip.name}`}
                  data-field-name={chip.name}
                  data-chip-state={editing ? "editing" : "blank"}
                  onClick={() => onEditField?.(block.nodeId, chip.name)}
                  className={`crv2-chip ${editing ? "crv2-chip--editing" : "crv2-chip--blank crv2-doc-blank"}`}
                  title={`${chip.label} still needs a value`}
                >
                  {chip.label}
                </button>
              </span>
            );
          })}
        </p>
      </div>
      {/* Reserved control column — always present (even with no menu) so the
          sentence width is identical whether or not controls are interactive. */}
      <div className="mt-0.5 flex w-6 shrink-0 items-start justify-end">
        {menuItems && menuItems.length > 0 ? (
          <DocumentStepMenu
            testId={`document-step-menu-${block.nodeId}`}
            ariaLabel={`Actions for ${stepLabel}`}
            items={menuItems}
          />
        ) : null}
      </div>
    </div>
  );
}

export function ProviderTag({ label, icon }: { label: string; icon?: string | undefined }) {
  return (
    <span className="crv2-provider align-baseline">
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny provider favicon, same treatment as the canvas card
        <img src={icon} alt="" aria-hidden className="h-3.5 w-3.5 rounded-[3px]" />
      ) : null}
      {label}
    </span>
  );
}
