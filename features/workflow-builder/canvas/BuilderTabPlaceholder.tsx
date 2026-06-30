"use client";

/**
 * Slice 4.BUILDER-SHELL-TABS-1 — polished empty-state panels for the non-Builder
 * top tabs (Runs / Data Map / Settings) until each gets its real system.
 *
 * The product decision renamed the dead "Run history" / "Schema" placeholders to
 * "Runs" / "Data Map" and requires NO dead tabs: each renamed tab is now clickable
 * and shows a clear, user-facing explanation of what will live there — never a
 * blank panel. The real Runs / Data Map / Settings systems are deferred; these
 * panels describe them honestly so the tabs are useful today.
 */

export type BuilderTab = "builder" | "runs" | "data-map" | "history" | "settings";

interface TabContent {
  readonly title: string;
  readonly lead: string;
  readonly bullets: readonly string[];
  /** A grounding note shown under the list (e.g. where related settings live). */
  readonly note?: string;
}

const CONTENT: Record<Exclude<BuilderTab, "builder">, TabContent> = {
  runs: {
    title: "Runs",
    lead: "This workflow's run history will appear here.",
    bullets: [
      "Each run's status, start time, and duration",
      "What triggered the run",
      "Tasks used by the run",
      "A short summary when a run fails",
      "Open a run for the full step-by-step details",
    ],
    note: "Test or run this workflow to record its first run.",
  },
  "data-map": {
    title: "Data Map",
    lead: "See the data you can use in your steps' fields.",
    bullets: [
      "Available variables, grouped by the trigger and each step",
      "Known inputs and outputs for every step",
      "References to data that no longer exists, flagged for you",
      "Copy a variable's path with one click to paste into a field",
    ],
    note: "Run a test to capture sample data, or configure your trigger to see its fields.",
  },
  // The History tab renders the live timeline (HistoryPanel) when the builder
  // supplies it; this placeholder is the fallback for isolated canvas tests.
  history: {
    title: "History",
    lead: "Everything the React Agent did to this workflow will appear here.",
    bullets: [
      "Previews shown, applied, discarded, and undone",
      "Failed applies, with a user-safe reason",
      "Checkpoint-backed entries you can restore from",
      "Test-fix entries (tested / test failed)",
      "View the diff for a change, or restore to before it",
    ],
    note: "Ask the React Agent to change this workflow to record its first entry.",
  },
  settings: {
    title: "Settings",
    lead: "Workflow settings will live here.",
    bullets: [
      "Name and description",
      "Folder",
      "Draft / active status, publishing, and version history",
      "Trigger and run behavior",
      "Timezone and schedule",
      "Retry and error handling",
      "Failure notifications",
    ],
    note: "App connections live in Apps — not here. A step's own settings live in that step's config panel.",
  },
};

export function BuilderTabPlaceholder({ tab }: { tab: Exclude<BuilderTab, "builder"> }) {
  const content = CONTENT[tab];
  return (
    <div
      data-testid="builder-tab-placeholder"
      data-tab={tab}
      className="absolute inset-0 z-10 flex items-center justify-center p-6"
    >
      <div
        className="flex w-full max-w-[440px] flex-col gap-3 rounded-[8px] p-5 text-center"
        style={{
          background: "var(--builder-panel)",
          border: "1px solid var(--builder-border)",
          boxShadow: "var(--builder-shadow-sm)",
        }}
      >
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--builder-text)" }}>
          {content.title}
        </h2>
        <p className="text-[12.5px]" style={{ color: "var(--builder-muted)" }}>
          {content.lead}
        </p>
        <ul
          className="flex list-disc flex-col gap-1 self-center pl-5 text-left text-[12px]"
          style={{ color: "var(--builder-muted)" }}
        >
          {content.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {content.note ? (
          <p
            className="mt-1 rounded-[4px] px-2 py-1.5 text-[11px]"
            style={{
              background: "var(--builder-panel-2)",
              border: "1px solid var(--builder-border)",
              color: "var(--builder-muted)",
            }}
          >
            {content.note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
