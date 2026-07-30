"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowState } from "@/contracts/workflow";
import { HeaderRightLocalOnly } from "../panels/AnonymousLocalChrome";
import { useGraphSlice } from "../state/graphSlice";
import { useBuilderShortcuts } from "../hooks/useBuilderShortcuts";
import {
  collectBuilderValidationIssues,
  countBuilderValidationIssues,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";
import {
  BuilderIconButton,
  ChevronLeftIcon,
  LayersIcon,
} from "./_BuilderHeaderIcons";
import { StatusPill, type SaveStatus } from "./_BuilderHeaderPills";
import { BuilderTabStrip } from "./BuilderTabStrip";
import { BuilderHeaderActions } from "./_BuilderHeaderActions";
import type { HeaderDensity } from "./builderLayoutPolicy";
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
  /**
   * BUILDER-RESPONSIVE-LAYOUT-1 — how much the header can afford to show.
   * Resolved once by `useBuilderLayout` and passed down; this component never
   * measures anything itself.
   *
   *   `full`    ≥ 1280 — every control inline. Identical to the pre-slice
   *                      header, which is why it is the default.
   *   `compact` 900–1279 — undo/redo, the Visual/Document toggle and Templates
   *                      move into the overflow menu; Test/Run, Save, the issue
   *                      count and the lifecycle action stay inline.
   *   `minimal` < 900  — as compact, plus Test/Run moves to overflow, the
   *                      section tabs get their own second row, and the identity
   *                      block sheds its breadcrumb line and status text.
   */
  density?: HeaderDensity;
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
  density = "full",
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
  const isMinimal = density === "minimal";

  const identity = (
    <HeaderLeft
      workflowName={workflowName}
      leftRail={leftRail}
      status={status}
      saveError={saveError}
      onRetrySave={handleSave}
      density={density}
      {...(lifecycle ? { workflowState: lifecycle.state } : {})}
    />
  );
  /* BUILDER-HEADER-TABS-CENTER-1 — the section tabs live in the header
     center (replacing the deferred ID/runs/success/tasks meta strip).
     min-w-0 + overflow lets the pill shrink-scroll on narrow widths
     instead of shoving the action buttons. */
  const tabStrip = tabs ? (
    <BuilderTabStrip activeTab={tabs.activeTab} onSelectTab={tabs.onSelectTab} />
  ) : null;
  const actions = localOnly ? (
    <HeaderRightLocalOnly />
  ) : (
    <BuilderHeaderActions
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
      density={density}
    />
  );

  return (
    <>
      {isMinimal ? (
        /*
          Phone-width header: TWO deliberate rows. The alternative — one row
          holding identity, five section tabs and the action cluster — is what
          produced the clipped toolbar this slice fixes. A second 34px row is a
          conscious trade of a little height for controls that are actually
          readable and hittable, and it is the only place the header is allowed
          to grow taller.
        */
        <header
          aria-label="Workflow builder header"
          data-testid="builder-header"
          data-density={density}
          className="flex shrink-0 flex-col"
          style={{
            background: "var(--builder-panel)",
            borderBottom: "1px solid var(--builder-border)",
          }}
        >
          <div
            className="grid h-12 items-center gap-2 px-2"
            style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
          >
            {identity}
            {actions}
          </div>
          {tabStrip ? (
            <div
              data-testid="builder-header-tab-row"
              className="flex h-[34px] items-center overflow-x-auto px-2"
              style={{ borderTop: "1px solid var(--builder-border)" }}
            >
              {tabStrip}
            </div>
          ) : null}
        </header>
      ) : (
        <header
          aria-label="Workflow builder header"
          data-testid="builder-header"
          data-density={density}
          className="grid h-12 shrink-0 items-center gap-3 px-2"
          style={{
            /*
              `1fr auto 1fr` at full width is unchanged — it is what centres the
              tab strip on a desktop. At `compact` the side tracks become
              `minmax(0, …)` so they can actually shrink: a bare `1fr` track has
              `min-width: auto`, which is why the action cluster used to force
              the header wider than the viewport and get its right edge clipped
              instead of yielding space. The action track stays `auto` — buttons
              must not shrink to unreadable; the identity and the (scrollable)
              tab strip absorb the loss instead.
            */
            gridTemplateColumns:
              density === "full"
                ? "1fr auto 1fr"
                : "minmax(0,1fr) minmax(0,auto) auto",
            background: "var(--builder-panel)",
            borderBottom: "1px solid var(--builder-border)",
          }}
        >
          {identity}
          {tabStrip ? (
            <div className="flex min-w-0 items-center justify-center overflow-x-auto">
              {tabStrip}
            </div>
          ) : (
            <div />
          )}
          {actions}
        </header>
      )}
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
  density = "full",
}: {
  workflowName: string;
  leftRail?: { isCollapsed: boolean; onToggle: () => void };
  status: SaveStatus;
  saveError: string | null;
  onRetrySave?: () => void;
  /** BUILDER-RESPONSIVE-LAYOUT-1 — see the `density` prop on `BuilderHeader`. */
  density?: HeaderDensity;
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
        {/*
          BUILDER-RESPONSIVE-LAYOUT-1 — the "workflow / draft /" breadcrumb line
          is dropped at phone width. It is pure orientation text, and the state
          it carries is still available: the lifecycle button on the right names
          the current state's transition, and the state chip lives in Settings.
          Keeping the workflow NAME readable matters more at 390px.
          `data-testid="builder-header-workflow-state"` therefore only exists at
          `full`/`compact` — tests reading it should assert at those densities.
        */}
        {density === "minimal" ? null : (
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
        )}
        <div className="flex min-w-0 items-center gap-2">
          <h2
            /*
              `max-w-[340px]` capped the name on a wide screen; it did nothing to
              help a narrow one, because the cap is a MAXIMUM and the problem at
              900px is the MINIMUM — an unshrinkable name pushing the toolbar out
              of the header. `min-w-0` is what lets `truncate` actually engage.
            */
            className="min-w-0 max-w-[340px] truncate text-[13px] font-semibold"
            title={workflowName}
            style={{ color: "var(--builder-text)" }}
          >
            {workflowName}
          </h2>
          <StatusPill
            status={status}
            saveError={saveError}
            onRetry={onRetrySave}
            compact={density === "minimal"}
          />
        </div>
      </div>
    </div>
  );
}

/** ANON-BUILDER-1 — ⌘S handler when there's nothing to save (local-only mode). */
function noop() {}



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

