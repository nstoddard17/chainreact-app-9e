"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowState } from "@/contracts/workflow";
import { HeaderRightLocalOnly } from "../panels/AnonymousLocalChrome";
import { useGraphSlice } from "../state/graphSlice";
import { undoWithConfigSync, redoWithConfigSync } from "../state/historyNav";
import { useBuilderShortcuts } from "../hooks/useBuilderShortcuts";
import { LifecycleActions } from "../panels/LifecycleActions";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";
import {
  BuilderIconButton,
  ChevronLeftIcon,
  LayersIcon,
  RedoIcon,
  UndoIcon,
} from "./_BuilderHeaderIcons";
import {
  HeaderValidationPill,
  StatusPill,
  type SaveStatus,
} from "./_BuilderHeaderPills";
import { HeaderRunControls } from "./HeaderRunControls";
import { BuilderTabStrip } from "./BuilderTabStrip";
import { BuilderTemplatesModal } from "../panels/BuilderTemplatesModal";
import type { BuilderTab } from "../canvas/BuilderTabPlaceholder";
import type { BuilderViewMode } from "../document/documentViewPref";

/** 5.DUAL-BUILDER-1 CS-1 — Visual/Document view toggle wiring (flag-gated). */
export interface HeaderViewToggle {
  view: BuilderViewMode;
  onChange: (view: BuilderViewMode) => void;
}

interface Props {
  workflowName: string;
  /**
   * The workflow's database id — kept for the templates modal wiring.
   * (The old center meta strip that displayed it was removed by
   * BUILDER-HEADER-TABS-CENTER-1; the id remains visible in the URL.)
   * Optional so existing focused tests keep passing unchanged.
   */
  workflowId?: string;
  /**
   * BUILDER-HEADER-TABS-CENTER-1 — the Builder | Runs | Data Map | History |
   * Settings tablist, rendered in the header's CENTER region (the slot the
   * deferred ID/runs/success/tasks meta strip used to occupy). Optional so
   * isolated header tests keep passing (undefined → empty center).
   */
  tabs?: {
    activeTab: BuilderTab;
    onSelectTab: (tab: BuilderTab) => void;
  };
  leftRail?: {
    isCollapsed: boolean;
    onToggle: () => void;
  };
  validation?: {
    onOpen: () => void;
  };
  lifecycle?: {
    workflowId: string;
    state: WorkflowState;
    /** V2-READY-41G — active workflow has draft changes not yet published live. */
    unpublishedChanges?: boolean;
  };
  /**
   * BUILDER-READINESS — required-field metadata per `provider:type` (from the
   * discovery registry, server-computed). Feeds the validation pill + Run/
   * Activate gating so "Ready" reflects required-config completeness. Optional
   * so isolated tests keep passing (no map → no required-field issues).
   */
  requiredFieldsByType?: RequiredFieldsByType;
  /**
   * WF-RUNPERM follow-up — server-derived `viewerCanRunEdit === false`: the
   * viewer can't run/edit because the workflow runs under the creator's private
   * connection. Disables the header Test/Run controls and points to Duplicate.
   * Optional so isolated header tests keep passing (undefined → not blocked).
   */
  runEditBlocked?: boolean;
  /**
   * ANON-BUILDER-1 — local-only (logged-out) build mode. When true the header's
   * save/run/activate/templates cluster is replaced by a single sign-up CTA (so
   * none of the account-scoped, server-calling controls mount) and ⌘S is a
   * no-op. Optional/additive — undefined keeps the authenticated header.
   */
  localOnly?: boolean;
  /**
   * 5.ONBOARD-1 Batch 3 — transient onboarding deep-link pulse: "test" rings
   * the run controls, "activate" rings the lifecycle cluster. Purely visual
   * attention treatment (set once by `useInitialBuilderFocus`, auto-clears);
   * never clicks, runs, saves, or activates anything.
   */
  focusPulse?: "test" | "activate" | null;
  /**
   * 5.DUAL-BUILDER-1 CS-1 — Visual/Document view toggle. Rendered ONLY when
   * present (the builder passes it only when ENABLE_DOCUMENT_BUILDER is on),
   * so the flag-off header stays byte-identical. Pure view switch — never
   * saves, hydrates, or mutates the graph.
   */
  viewToggle?: HeaderViewToggle;
}

/**
 * Builder header (Slice 4.BUILDER-UI-SHELL-1, extended through
 * 4.BUILDER-LEFT-AGENT-1 / VALIDATION-1, restyled in
 * 4.BUILDER-DESIGN-PARITY-1).
 *
 * Three-region 48px strip mirroring the Anthropic ChainV2 design:
 *
 *   [ left toggle · breadcrumb · name · state · dirty ]  [ section tabs ]  [ btngroup · chip · Test · Save · Activate ]
 *
 * Behavior is unchanged from prior slices — same isDirty / isSaving
 * Zustand reads, same Cmd/Ctrl+S shortcut, same validation count
 * derivation, same `LifecycleActions` mount path. Only the visual
 * arrangement and chrome moved.
 *
 * Center region (BUILDER-HEADER-TABS-CENTER-1): the Builder / Runs /
 * Data Map / History / Settings tablist. It replaced the old meta strip
 * (workflow id + deferred runs-per-24h / success / tasks-per-run `—`
 * placeholders), which showed nothing actionable; the id stays visible
 * in the URL and the run stats belong to the Runs tab when they land.
 */
export function BuilderHeader({
  workflowName,
  workflowId,
  tabs,
  leftRail,
  validation,
  lifecycle,
  requiredFieldsByType,
  runEditBlocked,
  localOnly,
  focusPulse = null,
  viewToggle,
}: Props) {
  const isDirty = useGraphSlice((s) => s.isDirty);
  const isSaving = useGraphSlice((s) => s.isSaving);
  const saveError = useGraphSlice((s) => s.saveError);
  const save = useGraphSlice((s) => s.save);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  // BUILDER-TOPBAR-UNDO-REDO — undo/redo enable only when there's actually a draft edit to revert/redo.
  const canUndo = useGraphSlice((s) => s.past.length > 0);
  const canRedo = useGraphSlice((s) => s.future.length > 0);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const router = useRouter();

  const validationCounts = validation
    ? countBuilderValidationIssues(
        collectBuilderValidationIssues({
          pendingNodes,
          pendingEdges,
          requiredFieldsByType,
        }),
      )
    : null;

  const handleSave = useCallback(async () => {
    if (!isDirty || isSaving) return;
    try {
      const updated = await save();
      setSavedAt(Date.now());
      // BUILDER-SAVE-STALE-NAV-1 — invalidate the App Router cache after every
      // successful save. The save is a client fetch (PATCH), which does NOT
      // invalidate Next's client-side Router Cache, so navigating away to the
      // workflows list and back into the builder would re-render the STALE
      // pre-save RSC payload (empty draft) until the cache expired — the user
      // saw the workflow open empty on the first reopen, then correct on the
      // next. router.refresh() re-fetches the route and clears that cache so the
      // freshly-saved draft is what a later navigation hydrates. This also
      // surfaces any server-side lifecycle change (e.g. a trigger edit that
      // deactivated an active workflow → disabled banner + Reactivate).
      if (updated) {
        router.refresh();
      }
    } catch {
      // Error already captured into slice.saveError; no extra UI work here.
    }
  }, [isDirty, isSaving, save, router]);

  // ANON-BUILDER-1 — in local-only mode there is nothing to save server-side, so
  // ⌘S must NOT call graphSlice.save() (which would PATCH and 401). No-op it.
  useBuilderShortcuts({ onSave: localOnly ? noop : handleSave });

  const status = deriveStatus({ isDirty, isSaving, saveError, savedAt });

  return (
    <>
      <header
        aria-label="Workflow builder header"
        data-testid="builder-header"
        className="grid h-12 shrink-0 items-center gap-3 px-2"
        style={{
          gridTemplateColumns: "1fr auto 1fr",
          background: "var(--builder-panel)",
          borderBottom: "1px solid var(--builder-border)",
        }}
      >
        <HeaderLeft
          workflowName={workflowName}
          leftRail={leftRail}
          status={status}
          saveError={saveError}
          onRetrySave={handleSave}
          {...(lifecycle ? { workflowState: lifecycle.state } : {})}
        />
        {/* BUILDER-HEADER-TABS-CENTER-1 — the section tabs live in the header
            center (replacing the deferred ID/runs/success/tasks meta strip).
            min-w-0 + overflow lets the pill shrink-scroll on narrow widths
            instead of shoving the action buttons. */}
        {tabs ? (
          <div className="flex min-w-0 items-center justify-center overflow-x-auto">
            <BuilderTabStrip activeTab={tabs.activeTab} onSelectTab={tabs.onSelectTab} />
          </div>
        ) : (
          <div />
        )}
        {localOnly ? (
          <HeaderRightLocalOnly />
        ) : (
          <HeaderRight
            isDirty={isDirty}
            isSaving={isSaving}
            onSave={handleSave}
            canUndo={canUndo}
            canRedo={canRedo}
            workflowId={workflowId}
            onOpenTemplates={() => setTemplatesOpen(true)}
            validation={validation}
            validationCounts={validationCounts}
            lifecycle={lifecycle}
            runEditBlocked={runEditBlocked}
            focusPulse={focusPulse}
            viewToggle={viewToggle}
          />
        )}
      </header>
      {!localOnly && templatesOpen && workflowId ? (
        <BuilderTemplatesModal
          workflowId={workflowId}
          isDirty={isDirty}
          workflowState={lifecycle?.state}
          onClose={() => setTemplatesOpen(false)}
        />
      ) : null}
    </>
  );
}

function HeaderLeft({
  workflowName,
  leftRail,
  status,
  saveError,
  onRetrySave,
  workflowState,
}: {
  workflowName: string;
  leftRail?: { isCollapsed: boolean; onToggle: () => void };
  status: SaveStatus;
  saveError: string | null;
  onRetrySave?: () => void;
  /**
   * DOC-STEP-CONTROLS-1 — the REAL lifecycle state (draft / active / paused /
   * …). The breadcrumb used to hard-code "draft", which read as a wrong status
   * for an active or paused workflow. The state is display-only here; the
   * transitions live in the lifecycle cluster on the right of this same header.
   */
  workflowState?: WorkflowState | undefined;
}) {
  const router = useRouter();
  // Slice 4.WORKFLOWS-PAGE-1 follow-up — wire the header back arrow to the
  // workflows dashboard. No dirty-state confirmation here: the existing save
  // status pill + Cmd/Ctrl+S shortcut already surface unsaved changes; a
  // future slice can add a confirm-if-dirty step if Marcus wants one.
  const handleBack = useCallback(() => {
    router.push("/workflows");
  }, [router]);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <BuilderIconButton
        ariaLabel="Back to workflows"
        title="Back to workflows"
        onClick={handleBack}
        testId="builder-header-back-button"
      >
        <ChevronLeftIcon />
      </BuilderIconButton>
      {leftRail ? (
        <BuilderIconButton
          ariaLabel={
            leftRail.isCollapsed ? "Expand React Agent" : "Collapse React Agent"
          }
          title={
            leftRail.isCollapsed ? "Show assistant" : "Hide assistant"
          }
          onClick={leftRail.onToggle}
          testId="builder-header-left-rail-toggle"
          dataAttrs={{
            "data-collapsed": leftRail.isCollapsed ? "true" : "false",
            "aria-pressed": String(!leftRail.isCollapsed),
          }}
        >
          <LayersIcon />
        </BuilderIconButton>
      ) : null}
      <div className="ml-1 flex min-w-0 flex-col gap-0.5">
        <div
          className="builder-mono flex items-center gap-1.5 text-[10.5px]"
          style={{ color: "var(--builder-muted)" }}
        >
          <span>workflow</span>
          <span style={{ color: "var(--builder-muted-2)" }}>/</span>
          <span
            data-testid="builder-header-workflow-state"
            data-workflow-state={workflowState ?? "draft"}
            title={`This workflow is ${workflowStateLabel(workflowState).toLowerCase()}`}
          >
            {workflowStateLabel(workflowState).toLowerCase()}
          </span>
          <span style={{ color: "var(--builder-muted-2)" }}>/</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <h2
            className="max-w-[340px] truncate text-[13px] font-semibold"
            title={workflowName}
            style={{ color: "var(--builder-text)" }}
          >
            {workflowName}
          </h2>
          <StatusPill status={status} saveError={saveError} onRetry={onRetrySave} />
        </div>
      </div>
    </div>
  );
}

function HeaderRight({
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
}) {
  // BUILDER-READINESS — any validation error (missing required field, no
  // trigger, unconfigured node, invalid router routes) blocks Run Manually +
  // go-live transitions.
  const blockingIssueCount = validationCounts?.errorCount ?? 0;
  // BUILDER-HEADER-ACTION-BAR-POLISH — one baseline-aligned action row with three
  // intentional groups separated by hairline dividers: [utility: undo/redo/history]
  // | [workspace: Templates · Issues] | [run: Test · Run · Save] | [lifecycle:
  // Activate]. Every primary control is h-8 / rounded-md so nothing sits at a
  // different vertical position; secondary status text (the blocked-go-live hint,
  // run-blocked copy) is lifted out of the button row by its own component so it can
  // never push a button off the shared baseline. Behavior is unchanged — same
  // handlers, same testids, same validation derivation.
  return (
    <div className="flex items-center justify-end gap-2">
      {/* BUILDER-TOPBAR-UNDO-REDO — utility cluster: undo/redo of LOCAL draft edits only. The redundant
          run-history button was removed (the canvas "Runs" tab is the single run-history surface). Each
          button is enabled only when there's something to revert/redo; clicking restores a draft graph
          snapshot (no save/activate/run/route) and keeps an open config panel in sync. Collapses below
          xl so the essential actions have room. */}
      <div
        className="hidden items-center gap-0.5 rounded-md p-0.5 xl:flex"
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
      <HeaderDivider className="hidden xl:inline-block" />
      {/* 5.DUAL-BUILDER-1 CS-1 — Visual/Document segmented toggle (flag-gated by
          presence). Pure view switch: same graphSlice draft renders either way;
          nothing is saved, hydrated, reset, or cloned. */}
      {viewToggle ? (
        <div
          data-testid="builder-view-toggle"
          role="group"
          aria-label="Builder view"
          className="flex items-center gap-0.5 rounded-md p-0.5"
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
      ) : null}
      {/* In-builder template entry point — opens the create-new / replace-current modal. */}
      {workflowId ? (
        <button
          type="button"
          onClick={onOpenTemplates}
          data-testid="builder-header-templates-button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium"
          style={{
            background: "var(--builder-panel-2)",
            color: "var(--builder-text-2)",
            border: "1px solid var(--builder-border)",
          }}
          title="Browse templates"
        >
          Templates
        </button>
      ) : null}
      {validation && validationCounts ? (
        <HeaderValidationPill
          counts={validationCounts}
          onOpen={validation.onOpen}
        />
      ) : null}
      <HeaderDivider />
      {/* 5.ONBOARD-1 Batch 3 — the ?focus=test deep link rings the EXISTING run
          controls for a moment (visual only; nothing is clicked or run). */}
      <FocusPulseWrap active={focusPulse === "test"} name="test">
        <HeaderRunControls
          blockingIssueCount={blockingIssueCount}
          runEditBlocked={runEditBlocked}
        />
      </FocusPulseWrap>
      <button
        type="button"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        data-testid="builder-header-save-button"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium disabled:opacity-50"
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
    </div>
  );
}

/** ANON-BUILDER-1 — ⌘S handler when there's nothing to save (local-only mode). */
function noop() {}

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
      className="inline-flex items-center rounded-md transition-shadow"
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
function HeaderDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-5 w-px shrink-0 ${className ?? ""}`}
      style={{ background: "var(--builder-border)" }}
    />
  );
}



/** Plain-language name for a workflow lifecycle state (display only). */
function workflowStateLabel(state: WorkflowState | undefined): string {
  switch (state) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "disabled":
      return "Disabled";
    case "eligible_to_resume":
      return "Paused";
    case "deleted":
      return "Deleted";
    case "draft":
    case undefined:
      return "Draft";
  }
}

function deriveStatus(input: {
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  savedAt: number | null;
}): SaveStatus {
  if (input.isSaving) return "saving";
  if (input.saveError) return "error";
  if (input.isDirty) return "unsaved";
  if (input.savedAt !== null) return "saved";
  return "idle";
}

