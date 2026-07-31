"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { createWorkflow, WorkflowApiError } from "@/lib/api/workflows";

/**
 * Creates a new draft workflow and navigates to its edit page.
 *
 * Per workflow-builder-ui.md / project-structure-and-module-boundaries.md §4-5:
 *   - Component never calls fetch directly; uses the typed client API.
 *   - On success it routes to `/workflows/{id}` so the user lands directly
 *     on the rename / builder surface for the new workflow.
 */
export function CreateWorkflowButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const created = await createWorkflow({ name: name.trim() });
      setName("");
      setOpen(false);
      // BUILDER-LIST-CACHE — invalidate Next's Router Cache before navigating so
      // the stale /workflows list payload is refreshed (the new workflow appears
      // on return) and the builder loads the fresh create-time detail rather than
      // a cached one.
      router.refresh();
      // BUILDER-VIEW-DEFAULT-1 — one-shot creation marker: the builder may show
      // the view chooser (flag on + no saved default), then strips the param.
      router.push(`/workflows/${created.id}?created=1`);
    } catch (err) {
      const message =
        err instanceof WorkflowApiError
          ? err.message
          : "Failed to create workflow.";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="workflows-create-button"
        /* RESPONSIVE-PAGES-2 — `shrink-0 whitespace-nowrap`: this is the page's
           primary action, so it keeps its full label rather than wrapping to
           "Create / workflow" or compressing when the toolbar tightens. */
        className="shrink-0 whitespace-nowrap rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Create workflow
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="workflows-create-form"
      /* RESPONSIVE-PAGES-2 — the open form lives inside the toolbar's action
         cluster. Unbounded it had no way to fit a 360px screen: an input plus
         two buttons and 1rem of padding is wider than the viewport once the
         Filters and view-toggle controls sit beside it. `w-full min-w-0` lets it
         take the toolbar row on a phone; `sm:w-72` restores the compact inline
         panel as soon as there is room. */
      className="flex w-full min-w-0 flex-col gap-2 rounded border border-input p-4 sm:w-72"
      aria-label="Create workflow"
    >
      <label htmlFor="new-workflow-name" className="text-sm font-medium">
        Workflow name
      </label>
      {/* Shared Input primitive: carries bg-background/text tokens so the
          field themes correctly on the dark app surface (a raw <input> got
          the browser's white background under inherited white text). */}
      <Input
        id="new-workflow-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. New customer welcome"
        required
        maxLength={120}
        autoFocus
        disabled={pending}
      />
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setName("");
          }}
          disabled={pending}
          className="rounded border border-input px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
