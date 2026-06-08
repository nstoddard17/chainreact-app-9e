import Link from "next/link";
import { CreateWorkflowButton } from "./CreateWorkflowButton";

/**
 * Empty states for the workflows dashboard
 * (Slice 4.WORKFLOWS-PAGE-1 + folders/trash WF-5).
 *
 *   - `no-workflows`  : the user has none yet → Create CTA + a secondary
 *                       "Browse templates" link to the live `/templates` marketplace.
 *   - `no-matches`    : a search/filter combo matched nothing.
 *   - `empty-folder`  : the selected folder has no workflows.
 *   - `no-folders`    : the Folders tab with no folders created yet.
 *   - `empty-trash`   : Trash is empty.
 *   - `folder-limit`  : the account hit its folder cap.
 */
type Kind =
  | "no-workflows"
  | "no-matches"
  | "empty-folder"
  | "no-folders"
  | "empty-trash"
  | "folder-limit";

interface Props {
  kind: Kind;
  /** For `folder-limit`: the cap for messaging. */
  limit?: number;
  /**
   * For `no-matches`: one-click recovery that resets the search + status + facet
   * filters. Only rendered when provided (the dashboard wires it for the
   * over-filtered state, never for a legitimately empty folder).
   */
  onClearFilters?: () => void;
}

const COPY: Record<
  Exclude<Kind, "no-workflows">,
  { testId: string; title: string; body: string }
> = {
  "no-matches": {
    testId: "workflows-empty-no-matches",
    title: "Nothing matches those filters",
    body: "Try clearing the search or a filter — or create a new workflow.",
  },
  "empty-folder": {
    testId: "workflows-empty-folder",
    title: "This folder is empty",
    body: "Move a workflow here from its actions menu, or create a new one.",
  },
  "no-folders": {
    testId: "workflows-empty-no-folders",
    title: "No folders yet",
    body: "Folders are an optional way to organize automations. Create one to group related workflows.",
  },
  "empty-trash": {
    testId: "workflows-empty-trash",
    title: "Trash is empty",
    body: "Deleted workflows and folders appear here for 7 days before they're permanently removed.",
  },
  "folder-limit": {
    testId: "workflows-empty-folder-limit",
    title: "Folder limit reached",
    body: "You've reached the folder limit for this plan. Delete a folder to make room for a new one.",
  },
};

export function WorkflowsEmptyState({ kind, limit, onClearFilters }: Props) {
  if (kind === "no-workflows") {
    return (
      <div
        data-testid="workflows-empty-no-workflows"
        role="status"
        className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-card p-10 text-center"
      >
        <p className="text-sm font-semibold text-foreground">No workflows yet</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Workflows automate things across your connected apps. Create your first
          one to get started — the builder will guide you through picking a
          trigger and adding actions.
        </p>
        <CreateWorkflowButton />
        <p className="text-xs text-muted-foreground">
          Not sure where to start?{" "}
          <Link
            href="/templates"
            data-testid="workflows-empty-browse-templates"
            className="font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            Browse templates
          </Link>{" "}
          for an automation that already works.
        </p>
      </div>
    );
  }
  const c = COPY[kind];
  const body =
    kind === "folder-limit" && typeof limit === "number"
      ? `You've reached your plan's limit of ${limit} folders. Delete a folder to make room for a new one.`
      : c.body;
  const showClearFilters = kind === "no-matches" && typeof onClearFilters === "function";
  return (
    <div
      data-testid={c.testId}
      role="status"
      className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card p-10 text-center"
    >
      <p className="text-sm font-semibold text-foreground">{c.title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{body}</p>
      {showClearFilters && (
        <button
          type="button"
          data-testid="workflows-empty-clear-filters"
          onClick={onClearFilters}
          className="mt-1 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-foreground/30"
        >
          Clear search &amp; filters
        </button>
      )}
    </div>
  );
}
