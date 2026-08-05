"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useGraphSlice } from "../state/graphSlice";

/**
 * WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — the builder's shared
 * "workflow changed elsewhere" experience. Driven entirely by
 * `graphSlice.conflict` (set by a 409 on save / template replace / checkpoint
 * restore, or by an external refresh that found newer content under a dirty
 * draft), so every surface — Visual, Document, header save, guided flows —
 * resolves through the SAME dialog.
 *
 * Guarantees:
 *   - Local unsaved edits stay visible and intact until the user EXPLICITLY
 *     discards them ("Keep my changes here" merely dismisses the dialog; a
 *     floating reminder stays while the conflict is unresolved).
 *   - "Reload latest version" always passes a confirmation step that states
 *     the discard consequence before anything is replaced.
 *   - Neutral copy: never names/accuses a user, never shows revision tokens.
 *   - No force-overwrite option — the newer server state stays authoritative.
 */
export function WorkflowConflictDialog() {
  const conflict = useGraphSlice((s) => s.conflict);
  const reloadLatest = useGraphSlice((s) => s.reloadLatest);
  const router = useRouter();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [confirmingReload, setConfirmingReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  // Reset per conflict lifecycle: resolving (conflict → null) clears everything;
  // a NEW conflict (different detectedAt) re-opens the dialog past an old dismissal.
  useEffect(() => {
    setConfirmingReload(false);
    setReloadError(null);
    if (!conflict) setDismissedAt(null);
  }, [conflict?.detectedAt, conflict]);

  const handleReload = useCallback(async () => {
    setReloading(true);
    setReloadError(null);
    try {
      await reloadLatest();
      // Lifecycle state / name may have moved with the newer revision — re-read
      // the server-rendered props too (graph content already hydrated above).
      router.refresh();
    } catch {
      setReloadError("Couldn't load the latest version. Check your connection and try again.");
    } finally {
      setReloading(false);
    }
  }, [reloadLatest, router]);

  if (!conflict) return null;

  const dialogOpen = dismissedAt !== conflict.detectedAt;

  if (!dialogOpen) {
    // Dismissed but unresolved: keep an unmissable, non-blocking reminder so
    // navigating around the builder never loses track of the conflict.
    return (
      <div
        data-testid="workflow-conflict-banner"
        className="fixed left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border border-amber-500/40 bg-card px-4 py-2 shadow-lg"
      >
        <span className="text-xs font-medium text-foreground">
          This workflow changed elsewhere — your changes are not saved.
        </span>
        <Button
          size="sm"
          variant="outline"
          data-testid="workflow-conflict-banner-review"
          onClick={() => setDismissedAt(null)}
        >
          Review
        </Button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="workflow-conflict-overlay"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="This workflow changed elsewhere"
        data-testid="workflow-conflict-dialog"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            This workflow changed elsewhere
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Another tab or account member saved a newer version while you were editing. Your
            changes have not been saved.
          </p>
        </div>

        {confirmingReload ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
            data-testid="workflow-conflict-reload-confirm"
          >
            <p className="text-xs font-medium text-foreground">
              Discard this tab&apos;s unsaved changes?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reloading replaces your unsaved edits here with the latest saved version. This
              can&apos;t be undone.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                data-testid="workflow-conflict-cancel-reload"
                disabled={reloading}
                onClick={() => setConfirmingReload(false)}
              >
                Go back
              </Button>
              <Button
                size="sm"
                variant="destructive"
                data-testid="workflow-conflict-confirm-reload"
                disabled={reloading}
                onClick={() => void handleReload()}
              >
                {reloading ? "Reloading…" : "Discard my changes and reload"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Your edits are still here in this tab. Review the latest version first, or keep
              editing and reapply your changes after reloading.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                data-testid="workflow-conflict-keep"
                onClick={() => setDismissedAt(conflict.detectedAt)}
              >
                Keep my changes here
              </Button>
              <Button
                size="sm"
                data-testid="workflow-conflict-reload"
                onClick={() => setConfirmingReload(true)}
              >
                Reload latest version…
              </Button>
            </div>
          </>
        )}

        {reloadError ? (
          <p className="text-xs text-destructive" data-testid="workflow-conflict-reload-error">
            {reloadError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
