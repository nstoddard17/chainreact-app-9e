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
  return (
    <div
      data-testid={`document-sentence-${block.nodeId}`}
      data-node-id={block.nodeId}
      className="group flex items-start gap-3 rounded-lg px-3 py-2.5"
    >
      <span
        className="builder-mono mt-0.5 inline-flex h-6 min-w-[44px] shrink-0 items-center justify-center rounded-full px-2 text-[10.5px] font-semibold uppercase tracking-[0.04em]"
        style={{
          background:
            block.nodeKind === "trigger" ? "var(--builder-accent-soft)" : "var(--builder-panel-2)",
          color: block.nodeKind === "trigger" ? "var(--builder-accent)" : "var(--builder-muted)",
          border: "1px solid var(--builder-border)",
        }}
      >
        {marker}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] leading-7" style={{ color: "var(--builder-text)" }}>
          <ProviderTag label={block.providerLabel} icon={providerIcon} />{" "}
          <span className="font-medium">{block.title}</span>
          {block.untyped ? (
            <span className="ml-2 text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
              — not set up yet
            </span>
          ) : null}
          {onConfigureStep ? (
            <button
              type="button"
              data-testid={`document-configure-step-${block.nodeId}`}
              onClick={() => onConfigureStep(block.nodeId)}
              className="ml-2 inline-flex h-6 items-center gap-1 rounded-md px-2 align-middle text-[11px] font-medium opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
              style={{
                color: "var(--builder-muted)",
                border: "1px solid var(--builder-border)",
              }}
              title="Everything this step does, in one place"
            >
              ⚙ Configure step
            </button>
          ) : null}
        </p>
        {block.valueChips.length > 0 || block.blankChips.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {block.valueChips.map((chip) => (
              <button
                key={`v-${chip.name}`}
                type="button"
                disabled={!chipInteractive}
                data-testid={`document-value-chip-${block.nodeId}-${chip.label}`}
                data-field-name={chip.name}
                onClick={() => onEditField?.(block.nodeId, chip.name)}
                className="inline-flex max-w-[280px] items-center gap-1 truncate rounded-md px-2 py-0.5 text-left text-[12px] disabled:cursor-default"
                title={`${chip.label}: ${chip.display}`}
                style={{
                  background:
                    editingFieldName === chip.name
                      ? "var(--builder-accent-soft)"
                      : "var(--builder-panel-2)",
                  color: "var(--builder-text-2)",
                  border:
                    editingFieldName === chip.name
                      ? "1px solid var(--builder-accent)"
                      : "1px solid var(--builder-border)",
                }}
              >
                <span style={{ color: "var(--builder-muted)" }}>{chip.label}</span>
                <span className="truncate font-medium">{chip.display}</span>
              </button>
            ))}
            {block.blankChips.map((chip) => (
              <button
                key={`b-${chip.name}`}
                type="button"
                disabled={!chipInteractive}
                data-testid={`document-blank-chip-${block.nodeId}-${chip.name}`}
                data-field-name={chip.name}
                onClick={() => onEditField?.(block.nodeId, chip.name)}
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium disabled:cursor-default"
                title={`${chip.label} still needs a value`}
                style={{
                  background: "var(--builder-accent-soft)",
                  color: "var(--builder-accent)",
                  border: "1.5px dashed var(--builder-accent)",
                }}
              >
                {chip.label}?
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProviderTag({ label, icon }: { label: string; icon?: string | undefined }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 align-middle text-[12.5px] font-semibold"
      style={{
        background: "var(--builder-panel-2)",
        color: "var(--builder-text-2)",
        border: "1px solid var(--builder-border)",
      }}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny provider favicon, same treatment as the canvas card
        <img src={icon} alt="" aria-hidden className="h-3.5 w-3.5 rounded-[3px]" />
      ) : null}
      {label}
    </span>
  );
}
