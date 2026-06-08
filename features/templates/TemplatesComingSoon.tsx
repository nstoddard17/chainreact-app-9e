/**
 * Flag-off state for the Templates page (CS-XT-7A). Rendered when ENABLE_WORKFLOW_TEMPLATES is
 * off — the backend routes 404, so the UI shows a safe "coming soon" panel rather than any
 * fake functionality. No data is fetched.
 */
export function TemplatesComingSoon() {
  return (
    <section
      data-testid="templates-coming-soon"
      aria-label="Templates"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Templates</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A marketplace of ready-made automations — built by ChainReact and shared by the community.
        </p>
      </header>
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-20 text-center">
        <div className="text-base font-semibold text-foreground">Coming soon</div>
        <div className="max-w-sm text-sm text-muted-foreground">
          The template marketplace isn&apos;t available yet. Check back soon to start from a workflow
          that already works.
        </div>
      </div>
    </section>
  );
}
