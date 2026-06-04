"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  activateWorkflow,
  isConfirmationRequiredError,
  pauseWorkflow,
  resumeWorkflow,
  WorkflowApiError,
  type WorkflowConfirmationRequiredDetail,
} from "@/lib/api/workflows";
import type { WorkflowListItem } from "@/contracts/workflow";
import { WorkflowActivateConfirmDialog } from "./WorkflowActivateConfirmDialog";

/**
 * Per-row actions menu for the workflows dashboard
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Exposes ONLY actions backed by real, existing lifecycle APIs:
 *   - Open in builder            (always)
 *   - Activate / Pause / Resume  (state-aware; routes through the same
 *                                 non-optimistic path + confirmation dialog
 *                                 the inline toggle uses)
 *
 * The design's Delete / Duplicate menu items are **not rendered** — those
 * endpoints don't exist in V2 yet; rendering them as fake actions would
 * mislead the user. Backlog-safe: when/if they ship, this menu adopts them.
 */
/**
 * 4.WORKFLOW-FOLDERS-6 / WF-5 — folder/trash affordances. Rendered only when
 * the folder-aware dashboard supplies the handlers; callers (and tests) that
 * omit them keep the prior Open/Activate/Pause/Resume-only menu.
 */
export interface WorkflowFolderActionProps {
  folders?: ReadonlyArray<{ id: string; name: string }>;
  onMoveToFolder?: (folderId: string | null) => void;
  onMoveToTrash?: () => void;
}

interface Props extends WorkflowFolderActionProps {
  workflow: Pick<WorkflowListItem, "id" | "name" | "state" | "folderId">;
  onChanged: () => void;
}

export function WorkflowActionsMenu({
  workflow,
  onChanged,
  folders,
  onMoveToFolder,
  onMoveToTrash,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDetail, setConfirmDetail] =
    useState<WorkflowConfirmationRequiredDetail | null>(null);

  function openBuilder() {
    setOpen(false);
    router.push(`/workflows/${workflow.id}`);
  }

  async function runLifecycle(
    kind: "activate" | "pause" | "resume",
  ): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (kind === "activate") await activateWorkflow(workflow.id);
      else if (kind === "pause") await pauseWorkflow(workflow.id);
      else await resumeWorkflow(workflow.id);
      setOpen(false);
      onChanged();
    } catch (err) {
      if (isConfirmationRequiredError(err)) {
        setOpen(false);
        setConfirmDetail(err.detail);
      } else if (err instanceof WorkflowApiError) {
        setError(err.message);
      } else {
        setError("Couldn't update the workflow. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  const canActivate =
    workflow.state === "draft" || workflow.state === "paused";
  const canPause = workflow.state === "active";
  const canResume = workflow.state === "eligible_to_resume";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="workflow-actions-menu-trigger"
            aria-label={`Actions for ${workflow.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="3" cy="8" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="13" cy="8" r="1.4" />
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-56 p-1"
          data-testid="workflow-actions-menu-content"
        >
          <MenuItem
            label="Open in builder"
            onSelect={openBuilder}
            testId="workflow-actions-menu-open"
          />
          {canActivate && (
            <MenuItem
              label={pending ? "Activating…" : "Activate"}
              onSelect={() => runLifecycle("activate")}
              disabled={pending}
              testId="workflow-actions-menu-activate"
            />
          )}
          {canPause && (
            <MenuItem
              label={pending ? "Pausing…" : "Pause"}
              onSelect={() => runLifecycle("pause")}
              disabled={pending}
              testId="workflow-actions-menu-pause"
            />
          )}
          {canResume && (
            <MenuItem
              label={pending ? "Resuming…" : "Resume"}
              onSelect={() => runLifecycle("resume")}
              disabled={pending}
              testId="workflow-actions-menu-resume"
            />
          )}
          {onMoveToFolder && (
            <div className="my-1 border-t border-border pt-1">
              <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                Move to folder
              </p>
              <div className="max-h-40 overflow-y-auto">
                {workflow.folderId !== null && (
                  <MenuItem
                    label="Uncategorized"
                    onSelect={() => {
                      setOpen(false);
                      onMoveToFolder(null);
                    }}
                    testId="workflow-actions-menu-move-uncategorized"
                  />
                )}
                {(folders ?? [])
                  .filter((f) => f.id !== workflow.folderId)
                  .map((f) => (
                    <MenuItem
                      key={f.id}
                      label={f.name}
                      onSelect={() => {
                        setOpen(false);
                        onMoveToFolder(f.id);
                      }}
                      testId={`workflow-actions-menu-move-${f.id}`}
                    />
                  ))}
                {(folders ?? []).filter((f) => f.id !== workflow.folderId).length === 0 &&
                  workflow.folderId === null && (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">
                      No folders yet.
                    </p>
                  )}
              </div>
            </div>
          )}
          {onMoveToTrash && (
            <div className="border-t border-border pt-1">
              <button
                type="button"
                data-testid="workflow-actions-menu-trash"
                onClick={() => {
                  setOpen(false);
                  onMoveToTrash();
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                Move to Trash
              </button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              data-testid="workflow-actions-menu-error"
              className="mt-1 rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={openBuilder}
                data-testid="workflow-actions-menu-open-builder"
                className="mt-1 underline"
              >
                Open builder
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {confirmDetail && (
        <WorkflowActivateConfirmDialog
          workflowId={workflow.id}
          workflowName={workflow.name}
          detail={confirmDetail}
          onConfirmed={() => {
            setConfirmDetail(null);
            onChanged();
          }}
          onCancel={() => setConfirmDetail(null)}
        />
      )}
    </>
  );
}

function MenuItem({
  label,
  onSelect,
  disabled,
  testId,
}: {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onSelect}
      disabled={disabled}
      className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
