"use client";

import type { ReactNode } from "react";
import type { WorkflowState } from "@/contracts/workflow";
import { undoWithConfigSync, redoWithConfigSync } from "../state/historyNav";
import { LifecycleActions } from "../panels/LifecycleActions";
import type { countBuilderValidationIssues } from "../validation/collectBuilderValidationIssues";
import { BuilderIconButton, RedoIcon, UndoIcon } from "./_BuilderHeaderIcons";
import { HeaderValidationPill } from "./_BuilderHeaderPills";
import { HeaderRunControls } from "./HeaderRunControls";
import {
  BuilderHeaderOverflowMenu,
  BuilderOverflowGroup,
} from "./BuilderHeaderOverflowMenu";
import type { HeaderDensity } from "./builderLayoutPolicy";
import type { HeaderViewToggle } from "./BuilderHeader";

/**
 * The builder header's right-hand action cluster (extracted from
 * `BuilderHeader.tsx` in BUILDER-RESPONSIVE-LAYOUT-1 so the header file stays
 * inside the project's max-lines budget while gaining a second layout).
 *
 * BUILDER-HEADER-ACTION-BAR-POLISH established the visual contract this keeps:
 * one baseline-aligned row of `h-8 rounded-md` controls in intentional groups
 * separated by hairline dividers, with secondary status text lifted out of the
 * button row so it can never push a button off the shared baseline.
 *
 * WHAT THIS SLICE ADDED — a priority order, not a shrink factor. The controls
 * are ranked, and at each density the lowest-priority ones move into the
 * overflow menu intact rather than being squeezed until the text is unreadable
 * or clipped away:
 *
 *   always inline   the issue count · Save · the lifecycle action for the
 *                   current workflow state (Activate / Pause / Resume /
 *                   Reactivate — whichever one this state actually offers)
 *   → overflow at   undo/redo · Visual/Document · Templates            (compact)
 *   → overflow at   ...and Test / Run Manually                         (minimal)
 *
 * The lifecycle action stays inline at every width because the primary action
 * IS state-dependent: a draft's next step is Activate, an active workflow's is
 * Pause, and hiding the only transition a state offers behind "⋯" would make
 * the header's most important control the hardest one to find. Nothing about
 * lifecycle BEHAVIOUR changes — same component, same handlers, same gating.
 */
export function BuilderHeaderActions({
  isDirty,
  isSaving,
  onSave,
  canUndo,
  canRedo,
  workflowId,
  onOpenTemplates,
  validation,
  validationCounts,
  lifecycle,
  runEditBlocked,
  focusPulse = null,
  viewToggle,
  density = "full",
}: {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  workflowId?: string;
  onOpenTemplates: () => void;
  validation?: { onOpen: () => void };
  validationCounts: ReturnType<typeof countBuilderValidationIssues> | null;
  lifecycle?: {
    workflowId: string;
    state: WorkflowState;
    /** V2-READY-41G — active workflow has draft changes not yet published live. */
    unpublishedChanges?: boolean;
  };
  runEditBlocked?: boolean;
  /** 5.ONBOARD-1 Batch 3 — transient deep-link attention ring (visual only). */
  focusPulse?: "test" | "activate" | null;
  /** 5.DUAL-BUILDER-1 CS-1 — flag-gated Visual/Document toggle (absent → not rendered). */
  viewToggle?: HeaderViewToggle;
  density?: HeaderDensity;
}) {
  // BUILDER-READINESS — any validation error (missing required field, no
  // trigger, unconfigured node, invalid router routes) blocks Run Manually +
  // go-live transitions.
  const blockingIssueCount = validationCounts?.errorCount ?? 0;
  const isFull = density === "full";
  const runInline = density !== "minimal";

  const undoRedo = (
    <div
      className="flex items-center gap-0.5 rounded-md p-0.5"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
      }}
    >
      <BuilderIconButton
        ariaLabel="Undo"
        title="Undo"
        onClick={undoWithConfigSync}
        disabled={!canUndo}
        testId="builder-header-undo"
        size="sm"
      >
        <UndoIcon />
      </BuilderIconButton>
      <BuilderIconButton
        ariaLabel="Redo"
        title="Redo"
        onClick={redoWithConfigSync}
        disabled={!canRedo}
        testId="builder-header-redo"
        size="sm"
      >
        <RedoIcon />
      </BuilderIconButton>
    </div>
  );

  /* 5.DUAL-BUILDER-1 CS-1 — Visual/Document segmented toggle (flag-gated by
     presence). Pure view switch: same graphSlice draft renders either way;
     nothing is saved, hydrated, reset, or cloned. */
  const viewToggleNode = viewToggle ? (
    <div
      data-testid="builder-view-toggle"
      role="group"
      aria-label="Builder view"
      className="flex shrink-0 items-center gap-0.5 rounded-md p-0.5"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
      }}
    >
      {(["visual", "document"] as const).map((view) => {
        const active = viewToggle.view === view;
        return (
          <button
            key={view}
            type="button"
            data-testid={`builder-view-toggle-${view}`}
            aria-pressed={active}
            onClick={() => {
              if (!active) viewToggle.onChange(view);
            }}
            className="inline-flex h-7 items-center rounded px-2.5 text-[12px] font-medium"
            style={
              active
                ? {
                    background: "var(--builder-panel)",
                    color: "var(--builder-text)",
                    border: "1px solid var(--builder-border)",
                  }
                : { color: "var(--builder-muted)" }
            }
          >
            {view === "visual" ? "Visual" : "Document"}
          </button>
        );
      })}
    </div>
  ) : null;

  /* In-builder template entry point — opens the create-new / replace-current modal. */
  const templatesNode = workflowId ? (
    <button
      type="button"
      onClick={onOpenTemplates}
      data-testid="builder-header-templates-button"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium"
      style={{
        background: "var(--builder-panel-2)",
        color: "var(--builder-text-2)",
        border: "1px solid var(--builder-border)",
      }}
      title="Browse templates"
    >
      Templates
    </button>
  ) : null;

  /* 5.ONBOARD-1 Batch 3 — the ?focus=test deep link rings the EXISTING run
     controls for a moment (visual only; nothing is clicked or run). */
  const runNode = (
    <FocusPulseWrap active={focusPulse === "test"} name="test">
      <HeaderRunControls
        blockingIssueCount={blockingIssueCount}
        runEditBlocked={runEditBlocked}
      />
    </FocusPulseWrap>
  );

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      {/* BUILDER-TOPBAR-UNDO-REDO — utility cluster: undo/redo of LOCAL draft edits only.
          Inline only at full width; below that it is the first thing to move into the
          overflow menu, where it is at least REACHABLE — the pre-slice header simply
          `hidden`-ed it below 1280px with no other entry point. */}
      {isFull ? (
        <>
          {undoRedo}
          <HeaderDivider />
          {viewToggleNode}
          {templatesNode}
        </>
      ) : null}
      {validation && validationCounts ? (
        <HeaderValidationPill
          counts={validationCounts}
          onOpen={validation.onOpen}
          compact={density === "minimal"}
        />
      ) : null}
      <HeaderDivider />
      {runInline ? runNode : null}
      <button
        type="button"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        data-testid="builder-header-save-button"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium disabled:opacity-50"
        style={{
          background: "var(--builder-text)",
          color: "var(--builder-panel)",
          border: "1px solid var(--builder-text)",
        }}
        title="Save (⌘S)"
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
      {lifecycle ? (
        <>
          <HeaderDivider />
          {/* 5.ONBOARD-1 Batch 3 — ?focus=activate rings the EXISTING lifecycle
              cluster; a blocked activation still explains itself via the
              validation pill/drawer as always. */}
          <FocusPulseWrap active={focusPulse === "activate"} name="activate">
            <LifecycleActions
              workflowId={lifecycle.workflowId}
              state={lifecycle.state}
              blockingIssueCount={blockingIssueCount}
              unpublishedChanges={lifecycle.unpublishedChanges}
            />
          </FocusPulseWrap>
        </>
      ) : null}
      {isFull ? null : (
        <BuilderHeaderOverflowMenu>
          {/* Run controls come first and WITHOUT a caption: `HeaderRunControls`
              renders null when the workflow has no trigger yet, and a caption
              with nothing under it would read as a broken menu. The buttons
              name themselves ("Test Workflow" / "Run Manually"). */}
          {runInline ? null : runNode}
          {viewToggleNode ? (
            <BuilderOverflowGroup caption="View">{viewToggleNode}</BuilderOverflowGroup>
          ) : null}
          {templatesNode ? (
            <BuilderOverflowGroup caption="Workspace">
              {templatesNode}
            </BuilderOverflowGroup>
          ) : null}
          <BuilderOverflowGroup caption="Edit history">{undoRedo}</BuilderOverflowGroup>
        </BuilderHeaderOverflowMenu>
      )}
    </div>
  );
}

/** 5.ONBOARD-1 Batch 3 — transient attention ring around an existing control
 * cluster for the onboarding `?focus=` deep link. Visual only. */
function FocusPulseWrap({
  active,
  name,
  children,
}: {
  active: boolean;
  name: "test" | "activate";
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md transition-shadow"
      {...(active ? { "data-testid": `builder-header-focus-pulse-${name}` } : {})}
      style={
        active
          ? {
              boxShadow:
                "0 0 0 2px var(--builder-accent), 0 0 0 6px var(--builder-accent-soft)",
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

/** Hairline vertical separator between header action groups (purely decorative). */
function HeaderDivider() {
  return (
    <span
      aria-hidden
      className="inline-block h-5 w-px shrink-0"
      style={{ background: "var(--builder-border)" }}
    />
  );
}
