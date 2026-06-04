"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderApiError } from "@/lib/api/folders";

/**
 * Create / rename folder dialog (Slice 4.WORKFLOW-FOLDERS-6 / WF-5).
 *
 * Lightweight Tailwind modal (no Shadcn Dialog primitive in V2). Owns its
 * pending + error state; `onSubmit` throws on failure (FolderApiError messages
 * surface inline — e.g. FOLDER_NAME_TAKEN / FOLDER_LIMIT_REACHED). On success
 * the parent closes the dialog + refreshes.
 */
interface Props {
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

export function FolderFormDialog({ mode, initialName = "", onSubmit, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(
        err instanceof FolderApiError
          ? err.message
          : "Couldn't save the folder. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="folder-form-overlay"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Create folder" : "Rename folder"}
        data-testid="folder-form-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-foreground">
          {mode === "create" ? "New folder" : "Rename folder"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Folders organize automations. They don't change who can access them.
        </p>
        <Input
          autoFocus
          aria-label="Folder name"
          data-testid="folder-form-name"
          placeholder="e.g. Payments ops"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          className="mt-3"
        />
        {error && (
          <p
            role="alert"
            data-testid="folder-form-error"
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
            type="submit"
            size="sm"
            disabled={pending || name.trim().length === 0}
            data-testid="folder-form-submit"
          >
            {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
