"use client";

import { ConfigModalShell } from "../config-modal/ConfigModalShell";

/**
 * Inspector payload for the builder right drawer (Slice 4.BUILDER-INSPECTOR-1,
 * restyled in 4.BUILDER-DESIGN-PARITY-1).
 *
 * Wraps `ConfigModalShell` with the Anthropic ChainV2 inspector chrome:
 *   - Tab strip (Setup / Advanced / Test / Variables) — Setup is the
 *     only active tab in V2 today; the other three render as disabled
 *     placeholders with "Coming soon" tooltips so the visual hierarchy
 *     matches the design without faking behavior.
 *
 * The schema-driven form, validation, Save / Cancel, and metadata
 * lookup logic inside `ConfigModalShell` are untouched. The drawer
 * around this component still owns the close (× button + Esc).
 */
export function NodeInspectorPanel() {
  return (
    <div
      data-testid="node-inspector-panel"
      className="flex flex-1 flex-col"
      style={{ minHeight: 0 }}
    >
      <InspectorTabs />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <ConfigModalShell />
      </div>
    </div>
  );
}

function InspectorTabs() {
  return (
    <div
      role="tablist"
      data-testid="node-inspector-tabs"
      className="flex gap-0.5 px-2"
      style={{
        background: "var(--builder-panel-2)",
        borderBottom: "1px solid var(--builder-border)",
      }}
    >
      <Tab label="Setup" active />
      <Tab label="Advanced" disabled />
      <Tab label="Test" disabled />
      <Tab label="Variables" disabled />
    </div>
  );
}

function Tab({
  label,
  active,
  disabled,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active ? "true" : "false"}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className="inline-flex items-center gap-1.5 px-2.5 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: active ? "var(--builder-panel)" : "transparent",
        borderBottom: `2px solid ${active ? "var(--builder-accent)" : "transparent"}`,
        color: active ? "var(--builder-text)" : "var(--builder-muted)",
        marginBottom: -1,
        border: "0",
      }}
    >
      {label}
    </button>
  );
}
