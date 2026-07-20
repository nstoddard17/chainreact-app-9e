"use client";

import type { DocumentSentenceBlock } from "./projection";

/**
 * One read-only Document sentence (5.DUAL-BUILDER-1 / CS-1).
 *
 * Renders a step as calm prose: marker ("When" / step number) · provider
 * identity · title · configured value chips (shared summary core) · blank
 * chips (same required-field rule as the canvas "Needs setup" chip).
 *
 * READ-ONLY in CS-1: chips are plain spans — no fake controls. Guided-Stop
 * editing arrives in CS-2.
 */
export function DocumentSentence({
  block,
  marker,
  providerIcon,
}: {
  block: DocumentSentenceBlock;
  /** Reading-order marker: "When" for the trigger, a number for actions. */
  marker: string;
  providerIcon?: string | undefined;
}) {
  return (
    <div
      data-testid={`document-sentence-${block.nodeId}`}
      data-node-id={block.nodeId}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5"
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
        </p>
        {block.valueChips.length > 0 || block.blankChips.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {block.valueChips.map((chip) => (
              <span
                key={`v-${chip.label}`}
                data-testid={`document-value-chip-${block.nodeId}-${chip.label}`}
                className="inline-flex max-w-[280px] items-center gap-1 truncate rounded-md px-2 py-0.5 text-[12px]"
                title={`${chip.label}: ${chip.display}`}
                style={{
                  background: "var(--builder-panel-2)",
                  color: "var(--builder-text-2)",
                  border: "1px solid var(--builder-border)",
                }}
              >
                <span style={{ color: "var(--builder-muted)" }}>{chip.label}</span>
                <span className="truncate font-medium">{chip.display}</span>
              </span>
            ))}
            {block.blankChips.map((chip) => (
              <span
                key={`b-${chip.name}`}
                data-testid={`document-blank-chip-${block.nodeId}-${chip.name}`}
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-medium"
                title={`${chip.label} still needs a value`}
                style={{
                  background: "var(--builder-accent-soft)",
                  color: "var(--builder-accent)",
                  border: "1.5px dashed var(--builder-accent)",
                }}
              >
                {chip.label}?
              </span>
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
