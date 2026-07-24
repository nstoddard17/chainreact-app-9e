"use client";

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
 */
export function DocumentSentence({
  block,
  marker,
  providerIcon,
  onEditField,
  onConfigureStep,
  editingFieldName,
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
}) {
  const chipInteractive = onEditField !== undefined;
  const isTrigger = block.nodeKind === "trigger";
  return (
    <div
      data-testid={`document-sentence-${block.nodeId}`}
      data-node-id={block.nodeId}
      className="group flex items-baseline gap-3 py-2"
    >
      {/* Reading-order marker — a calm "When" for the trigger, a small numeral
          for actions. Understated so the sentence stays the hero (mock). */}
      <span
        aria-hidden
        className="builder-mono mt-1 inline-flex h-5 shrink-0 select-none items-center justify-center rounded-md text-[10px] font-semibold uppercase tracking-[0.04em]"
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
      <div className="min-w-0 flex-1">
        {/* The sentence is editorial serif prose — larger and more readable than
            an inspector label, with the provider chip + value/blank chips inline
            so it reads as one sentence rather than a form. */}
        <p
          className="crv2-doc-prose m-0 text-[17px] leading-[1.65]"
          style={{ color: "var(--builder-text)" }}
        >
          <ProviderTag label={block.providerLabel} icon={providerIcon} />{" "}
          <span className="font-medium">{block.title}</span>
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
          {onConfigureStep ? (
            <button
              type="button"
              data-testid={`document-configure-step-${block.nodeId}`}
              onClick={() => onConfigureStep(block.nodeId)}
              className="ml-2 inline-flex h-6 items-center gap-1 rounded-md px-2 align-middle text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
              style={{
                color: "var(--builder-muted)",
                border: "1px solid var(--builder-border)",
                fontFamily: "var(--font-sans, sans-serif)",
              }}
              title="Everything this step does, in one place"
            >
              ⚙ Configure step
            </button>
          ) : null}
        </p>
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
