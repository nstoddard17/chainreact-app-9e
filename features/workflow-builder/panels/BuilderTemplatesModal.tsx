"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  TemplateApiError,
  createWorkflowFromTemplateForCurrent,
  listMarketplaceTemplates,
  replaceCurrentWorkflowFromTemplate,
} from "@/lib/api/workflowTemplates";
import type { MarketplaceTemplateSummary } from "@/contracts/workflowTemplate";
import type { WorkflowState } from "@/contracts/workflow";
import { useGraphSlice } from "../state/graphSlice";

/**
 * In-builder Templates modal (CS-XT-IN-BUILDER).
 *
 * Lists the marketplace catalog (official + public, under existing access rules) and offers
 * two EXPLICIT actions per template:
 *   - "Create new workflow" — reuses the use-template path via the workflow-centric
 *     `create-from-template` endpoint (new workflow in the CURRENT workflow's account,
 *     resolved server-side); navigates to the new workflow. Does NOT touch the current one.
 *   - "Replace current workflow" — overwrites the current workflow's draft definition with
 *     the template. ALWAYS behind an explicit confirmation step (never a silent overwrite);
 *     the warning calls out that current contents — including any unsaved changes — are
 *     discarded. On success the canvas re-hydrates to the template at a clean baseline.
 *
 * No raw account / user ids cross the wire (the endpoints infer the account server-side;
 * attribution shows only the official badge or a safe creator display name).
 */

interface Props {
  /** The currently-open workflow (the replace target / create-context anchor). */
  workflowId: string;
  /** True when the builder has unsaved edits — strengthens the replace warning. */
  isDirty: boolean;
  /**
   * The current workflow's lifecycle state. When `active`, the replace confirmation
   * carries an extra warning: replace writes the DEFINITION ONLY (it does not pause the
   * workflow — matching normal save/edit behavior), so an active workflow keeps running
   * with the new steps and must be reviewed/reconnected/tested first.
   */
  workflowState?: WorkflowState;
  onClose: () => void;
}

type ListState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; templates: readonly MarketplaceTemplateSummary[] };

export function BuilderTemplatesModal({ workflowId, isDirty, workflowState, onClose }: Props) {
  const isActiveWorkflow = workflowState === "active";
  const router = useRouter();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<MarketplaceTemplateSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList({ status: "loading" });
    try {
      const templates = await listMarketplaceTemplates();
      setList({ status: "ready", templates });
    } catch {
      setList({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes the modal (but not mid-action, to avoid orphaning a request).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busyId === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busyId, onClose]);

  const handleCreate = useCallback(
    async (template: MarketplaceTemplateSummary) => {
      setBusyId(template.id);
      setActionError(null);
      try {
        const { workflowId: createdId } = await createWorkflowFromTemplateForCurrent(
          workflowId,
          template.id,
        );
        router.push(`/workflows/${createdId}`);
      } catch (err) {
        setActionError(err instanceof TemplateApiError ? err.message : "Couldn't create the workflow.");
        setBusyId(null);
      }
    },
    [workflowId, router],
  );

  const handleConfirmReplace = useCallback(async () => {
    if (!confirmReplace) return;
    setBusyId(confirmReplace.id);
    setActionError(null);
    try {
      const detail = await replaceCurrentWorkflowFromTemplate(workflowId, confirmReplace.id);
      // Re-hydrate the canvas to the template at a clean, server-confirmed baseline. The
      // fresh `updatedAt` clears the revision guard so this isn't treated as stale.
      useGraphSlice.getState().hydrate(workflowId, detail.draftDefinition, detail.updatedAt);
      // Refresh the server-rendered lifecycle state: replacing an ACTIVE workflow deactivates
      // it server-side, so the header's state pill / activate controls must re-read from the
      // server (the lifecycle state is a server prop, not graph-slice state).
      router.refresh();
      onClose();
    } catch (err) {
      setActionError(err instanceof TemplateApiError ? err.message : "Couldn't replace the workflow.");
      setBusyId(null);
      setConfirmReplace(null);
    }
  }, [confirmReplace, workflowId, onClose, router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="builder-templates-overlay"
      onClick={() => busyId === null && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Templates"
        data-testid="builder-templates-modal"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Start from a template</h2>
            <p className="text-xs text-muted-foreground">
              Create a new workflow, or replace the current one with a ready-made automation.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            data-testid="builder-templates-close"
            onClick={() => busyId === null && onClose()}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {list.status === "loading" && (
            <p role="status" data-testid="builder-templates-loading" className="py-10 text-center text-sm text-muted-foreground">
              Loading templates…
            </p>
          )}

          {list.status === "error" && (
            <div role="alert" data-testid="builder-templates-error" className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">Couldn&apos;t load templates.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()} data-testid="builder-templates-retry">
                Retry
              </Button>
            </div>
          )}

          {list.status === "ready" && list.templates.length === 0 && (
            <p data-testid="builder-templates-empty" className="py-10 text-center text-sm text-muted-foreground">
              No templates are available yet.
            </p>
          )}

          {list.status === "ready" && list.templates.length > 0 && (
            <ul className="flex flex-col gap-2">
              {list.templates.map((t) => (
                <li
                  key={t.id}
                  data-testid="builder-template-row"
                  className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.isOfficial ? (
                          <span data-testid="builder-template-official">By ChainReact · Official</span>
                        ) : t.creatorDisplayName ? (
                          <span>By {t.creatorDisplayName}</span>
                        ) : (
                          <span>Community template</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {t.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`builder-template-create-${t.id}`}
                      disabled={busyId !== null}
                      onClick={() => void handleCreate(t)}
                    >
                      Create new workflow
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`builder-template-replace-${t.id}`}
                      disabled={busyId !== null}
                      onClick={() => {
                        setActionError(null);
                        setConfirmReplace(t);
                      }}
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    >
                      Replace current
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {actionError && (
            <p role="alert" data-testid="builder-templates-action-error" className="mt-3 text-xs text-destructive">
              {actionError}
            </p>
          )}
        </div>
      </div>

      {confirmReplace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-testid="builder-templates-replace-overlay"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm replace workflow"
            data-testid="builder-templates-replace-confirm"
            className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
          >
            <h3 className="text-sm font-semibold text-foreground">
              Replace this workflow with “{confirmReplace.name}”?
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              This replaces the current workflow&apos;s steps with the template. You&apos;ll
              need to reconnect any accounts and test it before relying on it — this
              can&apos;t be undone.
            </p>
            {isActiveWorkflow && (
              <p
                data-testid="builder-templates-replace-active-warning"
                className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-300"
              >
                This workflow is currently active. Replacing it will overwrite its steps and
                deactivate it so old triggers can be cleaned up. Reconnect accounts, review the
                workflow, and reactivate it when ready.
              </p>
            )}
            {isDirty && (
              <p data-testid="builder-templates-replace-dirty-warning" className="mt-2 text-xs font-medium text-destructive">
                You have unsaved changes — they will be discarded.
              </p>
            )}
            {actionError && (
              <p role="alert" data-testid="builder-templates-replace-error" className="mt-2 text-xs text-destructive">
                {actionError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="builder-templates-replace-cancel"
                disabled={busyId !== null}
                onClick={() => setConfirmReplace(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="builder-templates-replace-confirm-button"
                disabled={busyId !== null}
                onClick={() => void handleConfirmReplace()}
              >
                {busyId === confirmReplace.id ? "Replacing…" : "Replace workflow"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
