"use client";

import type { MapStatus, WholeWorkflowMap as MapModel, WholeWorkflowMapRow } from "./wholeWorkflowMapModel";

/**
 * 5.DUAL-BUILDER-1 CS-3 — the Whole Workflow map (right-side drawer).
 *
 * Renders the SAME projected DocumentModel as a hierarchical tree (not a
 * freeform node canvas): trigger, linear steps, forks, lanes, nested forks,
 * rejoins, terminal paths, always-run continuations, and complex/Tier-B/C
 * regions — each executable row keeping its canonical nodeId. Per-step status
 * comes from the shared validation/readiness state (never a second vocabulary).
 * The active Guided Stop highlights here; clicking a row navigates the Document
 * (scroll + open the relevant stop) or hands off to the Visual Builder — it
 * NEVER saves or mutates by navigating.
 */

const STATUS_META: Record<MapStatus, { label: string; color: string }> = {
  ready: { label: "Ready", color: "var(--builder-ok, #16a34a)" },
  needs_detail: { label: "Needs a detail", color: "var(--builder-accent)" },
  warning: { label: "Warning", color: "var(--builder-warn, #d97706)" },
  structural_issue: { label: "Needs the Visual Builder", color: "var(--builder-danger, #dc2626)" },
  locked: { label: "Upgrade required", color: "var(--builder-muted)" },
  connection: { label: "Connection required", color: "var(--builder-accent)" },
  unsupported: { label: "Easier on the canvas", color: "var(--builder-muted)" },
};

function isInteractive(row: WholeWorkflowMapRow): boolean {
  if (row.kind === "complex") return true;
  if (row.kind === "lane" || row.kind === "always") return row.status === "warning";
  if (row.kind === "terminal" || row.kind === "rejoin") return row.nodeId !== null;
  return row.nodeId !== null;
}

export function WholeWorkflowMap({
  map,
  activeNodeId,
  onClose,
  onSelectRow,
}: {
  map: MapModel;
  activeNodeId: string | null;
  onClose: () => void;
  onSelectRow: (row: WholeWorkflowMapRow) => void;
}) {
  return (
    <aside
      data-testid="document-whole-workflow-map"
      role="dialog"
      aria-label="Whole workflow map"
      className="flex h-full w-[320px] shrink-0 flex-col border-l"
      style={{ background: "var(--builder-panel)", borderColor: "var(--builder-border)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--builder-border)" }}
      >
        <span className="text-[13px] font-semibold" style={{ color: "var(--builder-text)" }}>
          Whole workflow
        </span>
        <button
          type="button"
          data-testid="document-map-close"
          onClick={onClose}
          aria-label="Close whole workflow map"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[15px]"
          style={{ color: "var(--builder-muted)", border: "1px solid var(--builder-border)" }}
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {map.rows.length === 0 ? (
          <p className="m-0 px-4 py-6 text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
            Nothing to map yet.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {map.rows.map((row) => (
              <MapRowView
                key={row.key}
                row={row}
                isActive={row.nodeId !== null && row.nodeId === activeNodeId}
                onSelect={onSelectRow}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function MapRowView({
  row,
  isActive,
  onSelect,
}: {
  row: WholeWorkflowMapRow;
  isActive: boolean;
  onSelect: (row: WholeWorkflowMapRow) => void;
}) {
  const status = STATUS_META[row.status];
  const interactive = isInteractive(row);
  const isConnector =
    row.kind === "lane" ||
    row.kind === "always" ||
    row.kind === "terminal" ||
    row.kind === "rejoin";

  const inner = (
    <>
      <span
        aria-hidden
        data-status={row.status}
        className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: isConnector && row.status === "ready" ? "transparent" : status.color, border: `1px solid ${status.color}` }}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[12.5px]"
          style={{
            color: isConnector ? "var(--builder-muted)" : "var(--builder-text)",
            fontWeight: row.kind === "fork" || row.kind === "trigger" ? 600 : 400,
          }}
        >
          {row.kind === "terminal" ? "⏹ " : row.kind === "rejoin" ? "↳ " : ""}
          {row.title}
        </span>
        {row.subtitle ? (
          <span className="block truncate text-[11px]" style={{ color: "var(--builder-muted)" }}>
            {row.subtitle}
          </span>
        ) : null}
      </span>
      {!isConnector ? (
        <span
          className="shrink-0 text-[10px] font-medium"
          style={{ color: status.color }}
          title={status.label}
        >
          {row.status === "ready" ? "" : status.label}
        </span>
      ) : null}
    </>
  );

  const paddingLeft = 12 + row.depth * 14;

  return (
    <li>
      {interactive ? (
        <button
          type="button"
          data-testid={`document-map-row-${row.nodeId ?? row.key}`}
          data-node-id={row.nodeId ?? undefined}
          data-status={row.status}
          data-active={isActive ? "true" : undefined}
          onClick={() => onSelect(row)}
          className="flex w-full items-start gap-2 py-1.5 pr-3 text-left"
          style={{
            paddingLeft,
            background: isActive ? "var(--builder-accent-soft)" : "transparent",
            borderLeft: isActive
              ? "2px solid var(--builder-accent)"
              : "2px solid transparent",
          }}
        >
          {inner}
        </button>
      ) : (
        <div
          data-testid={`document-map-row-${row.nodeId ?? row.key}`}
          data-status={row.status}
          className="flex items-start gap-2 py-1.5 pr-3"
          style={{ paddingLeft }}
        >
          {inner}
        </div>
      )}
    </li>
  );
}
