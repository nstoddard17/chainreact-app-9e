"use client";

import type { ReactNode } from "react";
import { BuilderTabPlaceholder, type BuilderTab } from "../canvas/BuilderTabPlaceholder";
import { DataMapPanel } from "../canvas/DataMapPanel";
import { RunsPanel } from "../canvas/RunsPanel";
import { SettingsPanel, type WorkflowSettingsMeta } from "../canvas/SettingsPanel";

/**
 * Center-workspace body for the non-Builder header tabs
 * (BUILDER-TABS-HEADER-1). Extracted from the old Visual-only
 * `WorkflowCanvas` tab branches so the SAME Runs / Data Map / History /
 * Settings panels serve BOTH view modes; `WorkflowBuilder` owns the tab
 * state and renders this instead of the Document/Visual surface whenever a
 * non-"builder" tab is active. Returns null on "builder" (the mode branch
 * takes over).
 */
export function BuilderTabPanels({
  activeTab,
  providerLabels,
  runEditBlocked,
  settings,
  onNameSaved,
  historyPanel,
  onBackToBuilder,
  builderViewPreferenceEnabled,
}: {
  activeTab: BuilderTab;
  providerLabels: Readonly<Record<string, string>>;
  /** WF-RUNPERM — hides the Runs tab "Run again" for blocked viewers. */
  runEditBlocked?: boolean;
  /** Workflow-level metadata for the Settings tab (optional in isolated tests). */
  settings?: WorkflowSettingsMeta;
  /** BUILDER-SETTINGS-2 — header sync after a Settings-tab rename. */
  onNameSaved?: (name: string) => void;
  /** AGENT-CHANGE-HISTORY-1 — the live History timeline, built by WorkflowBuilder. */
  historyPanel?: ReactNode;
  /** "Open failed step" returns to the Builder tab so the reveal lands. */
  onBackToBuilder: () => void;
  /** BUILDER-VIEW-DEFAULT-1 — shows the default-view row in Settings (flag on). */
  builderViewPreferenceEnabled?: boolean;
}) {
  if (activeTab === "builder") return null;
  return (
    <div
      data-testid="builder-tab-panel"
      data-tab={activeTab}
      className="relative min-h-0 flex-1 overflow-y-auto"
      style={{ background: "var(--builder-bg)" }}
    >
      {activeTab === "runs" ? (
        // Slice 4.BUILDER-RUNS-TAB-1 — workflow-scoped run history + debugging.
        <RunsPanel
          onOpenFailedStep={onBackToBuilder}
          {...(runEditBlocked !== undefined ? { runEditBlocked } : {})}
        />
      ) : activeTab === "data-map" ? (
        // Slice 4.BUILDER-DATA-MAP-MVP-1 — the workflow data outline.
        <DataMapPanel providerLabels={providerLabels} />
      ) : activeTab === "history" ? (
        // AGENT-CHANGE-HISTORY-1 — agent-change / checkpoint timeline.
        (historyPanel ?? <BuilderTabPlaceholder tab="history" />)
      ) : (
        // Slice 4.BUILDER-SETTINGS-MVP-1 — workflow-level metadata.
        <SettingsPanel
          settings={settings}
          providerLabels={providerLabels}
          {...(onNameSaved ? { onNameSaved } : {})}
          {...(builderViewPreferenceEnabled ? { builderViewPreferenceEnabled } : {})}
        />
      )}
    </div>
  );
}
