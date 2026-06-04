"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderApiError } from "@/lib/api/folders";

/**
 * Folder delete dialog with the two explicit modes (Slice 4.WF-5):
 *   - folder_only   : delete only this folder; contents move up one level.
 *   - with_contents : trash the folder, its subfolders, and their workflows
 *                     together (restorable as one batch).
 *
 * The choice is never defaulted — the user must pick a radio before confirming.
 * `onConfirm(mode)` throws on failure; the message surfaces inline.
 */
interface Props {
  folderName: string;
  onConfirm: (mode: "folder_only" | "with_contents") => Promise<void>;
  onClose: () => void;
}

export function FolderDeleteDialog({ folderName, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<"folder_only" | "with_contents">("folder_only");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(mode);
      onClose();
    } catch (err) {
      setError(
        err instanceof FolderApiError
          ? err.message
          : "Couldn't delete the folder. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="folder-delete-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Delete folder ${folderName}`}
        data-testid="folder-delete-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Delete “{folderName}”?
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose what happens to anything inside this folder.
        </p>

        <fieldset className="mt-3 flex flex-col gap-2">
          <label
            data-testid="folder-delete-mode-folder_only"
            className="flex cursor-pointer gap-3 rounded-md border border-border p-3 hover:bg-muted/40"
          >
            <input
              type="radio"
              name="folder-delete-mode"
              checked={mode === "folder_only"}
              onChange={() => setMode("folder_only")}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Delete folder only
              </span>
              <span className="block text-xs text-muted-foreground">
                Workflows and subfolders move up one level — nothing is trashed.
              </span>
            </span>
          </label>
          <label
            data-testid="folder-delete-mode-with_contents"
            className="flex cursor-pointer gap-3 rounded-md border border-border p-3 hover:bg-muted/40"
          >
            <input
              type="radio"
              name="folder-delete-mode"
              checked={mode === "with_contents"}
              onChange={() => setMode("with_contents")}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Delete folder and everything in it
              </span>
              <span className="block text-xs text-muted-foreground">
                The folder, its subfolders, and their workflows move to Trash
                together (restorable for 7 days).
              </span>
            </span>
          </label>
        </fieldset>

        {error && (
          <p
            role="alert"
            data-testid="folder-delete-error"
            className="mt-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={confirm}
            data-testid="folder-delete-confirm"
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
