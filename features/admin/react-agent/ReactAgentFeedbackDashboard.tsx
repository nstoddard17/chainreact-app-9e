import {
  REACT_AGENT_SECTIONS,
  type ReactAgentSectionMeta,
} from "@/contracts/internalReactAgent";

/**
 * React Agent feedback dashboard SHELL (INTERNAL-FEEDBACK-1).
 *
 * Access-controlled, read-only, and deliberately metric-free: this slice ships
 * the internal-admin foundation and an empty shell that future slices fill with
 * real React Agent quality metrics. Every section renders the same honest empty
 * state — no hardcoded or fabricated numbers. The date-range control is a static
 * placeholder until the metrics endpoint is wired.
 *
 * Styling uses the app's semantic tokens (`bg-card`, `text-foreground`,
 * `border-border`, `text-muted-foreground`) so it renders correctly in the
 * dark app surface and would adapt to light mode without per-component rewrites.
 */

const EMPTY_STATE_COPY =
  "React Agent feedback metrics will appear here once the metrics endpoint is connected.";

function SectionCard({ section }: { section: ReactAgentSectionMeta }) {
  return (
    <section
      aria-labelledby={`react-agent-section-${section.id}`}
      className="rounded-lg border border-border bg-card p-5"
    >
      <h2
        id={`react-agent-section-${section.id}`}
        className="text-sm font-semibold text-foreground"
      >
        {section.title}
      </h2>
      <div className="mt-4 flex min-h-24 items-center justify-center rounded-md border border-dashed border-border px-4 py-8 text-center">
        <p className="max-w-md text-sm text-muted-foreground">{EMPTY_STATE_COPY}</p>
      </div>
    </section>
  );
}

export function ReactAgentFeedbackDashboard() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">React Agent Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal quality metrics for the workflow-building agent. Not yet
            connected to live data.
          </p>
        </div>

        {/* Date-range control placeholder — static until metrics are wired. */}
        <span
          className="inline-flex items-center gap-2 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
          aria-disabled="true"
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
          />
          Last 7 days
        </span>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {REACT_AGENT_SECTIONS.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>
    </main>
  );
}
