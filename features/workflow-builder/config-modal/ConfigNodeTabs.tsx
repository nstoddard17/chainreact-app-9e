"use client";

/**
 * Slice 4.BUILDER-CONFIG-TABS-1 — the single selected-node tab model for the
 * right config panel.
 *
 * Before this slice the panel showed TWO confusing, duplicated, all-dead tab
 * rows: an outer `Setup | Advanced | Test | Variables` (in NodeInspectorPanel)
 * and an inner `Setup | Advanced | Results | Data Inspector` (in
 * ConfigModalShell). This collapses them to ONE functional model:
 *
 *   Setup | Test | Data   (Advanced is added only when the node actually has
 *                          advanced options — hidden otherwise, never dead).
 *
 *   - Setup: the node's fields + required configuration (the real form).
 *   - Test:  per-step test behavior + latest result, with honest empty states
 *            (real node-test execution is deferred).
 *   - Data:  the node's data context — available variables, what this node uses,
 *            expected outputs, last sample output. Absorbs the old Variables /
 *            Results / Data Inspector. The full Data Map system is deferred.
 *   - Advanced: only advanced options; omitted until any exist (no dead tab).
 *
 * No raw developer JSON/schema is exposed as the primary UX. Provider
 * credentials live in Apps; workflow-level settings live in the top Settings
 * tab; only node-level config lives here.
 */

export type ConfigNodeTab = "setup" | "test" | "data" | "advanced";

const TAB_LABEL: Record<ConfigNodeTab, string> = {
  setup: "Setup",
  test: "Test",
  data: "Data",
  advanced: "Advanced",
};

export function ConfigNodeTabBar({
  tabs,
  activeTab,
  onSelect,
  advancedActiveCount,
}: {
  tabs: readonly ConfigNodeTab[];
  activeTab: ConfigNodeTab;
  onSelect: (tab: ConfigNodeTab) => void;
  /**
   * CONFIG-UX-SETUP-ADVANCED-1 — number of Advanced settings currently set
   * (custom values). Rendered as a small count chip on the Advanced tab so
   * it is visible FROM Setup that non-standard behavior is active. Zero /
   * undefined renders no chip.
   */
  advancedActiveCount?: number;
}) {
  return (
    <nav
      aria-label="Node configuration sections"
      role="tablist"
      data-testid="config-node-tabs"
      className="flex gap-1 border-b"
    >
      {tabs.map((tab) => {
        const active = tab === activeTab;
        const showBadge =
          tab === "advanced" &&
          advancedActiveCount !== undefined &&
          advancedActiveCount > 0;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active ? "true" : "false"}
            onClick={() => onSelect(tab)}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-b-2 border-primary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABEL[tab]}
            {showBadge ? (
              <span
                data-testid="config-tab-advanced-badge"
                title={`${advancedActiveCount} Advanced setting${advancedActiveCount === 1 ? "" : "s"} set`}
                className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
              >
                {advancedActiveCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

interface EmptyStateContent {
  readonly title: string;
  readonly lead: string;
  readonly bullets?: readonly string[];
  readonly note?: string;
}

const EMPTY_STATE: Record<"test" | "data", EmptyStateContent> = {
  test: {
    title: "Test this step",
    lead: "Run just this step to check what it returns — without running the whole workflow.",
    note: "Per-step testing isn't available here yet. For now, use Test or Run on the whole workflow from the top bar. When it's ready, this tab will show this step's latest result and flag when upstream sample data is missing.",
  },
  data: {
    title: "Data for this step",
    lead: "See the data this step can use, and the data it produces.",
    bullets: [
      "Variables available from the trigger and earlier steps",
      "The variables this step uses",
      "The output fields this step is expected to produce",
      "The last sample output, once you've run a test",
    ],
    note: "Run a test to capture sample data. This brings together what used to be split across Variables, Results, and the Data Inspector.",
  },
};

export function ConfigTabEmptyState({ tab }: { tab: "test" | "data" }) {
  const content = EMPTY_STATE[tab];
  return (
    <section
      aria-label={`${TAB_LABEL[tab]} (coming soon)`}
      data-testid="config-tab-empty-state"
      data-tab={tab}
      className="flex flex-col gap-2 rounded border border-input bg-muted/30 p-4 text-sm"
    >
      <h3 className="text-sm font-semibold">{content.title}</h3>
      <p className="text-xs text-muted-foreground">{content.lead}</p>
      {content.bullets ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
          {content.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {content.note ? (
        <p className="rounded bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
          {content.note}
        </p>
      ) : null}
    </section>
  );
}
