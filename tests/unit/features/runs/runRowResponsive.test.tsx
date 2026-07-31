/**
 * RESPONSIVE-DATA-SURFACES-5 — runs list row responsive behaviour.
 *
 * SCOPE NOTE (audited): V2 has no Runs detail route. `RunRow`'s own doc comment
 * says so — "There is no per-run detail route in V2 yet". The run surface that
 * ships is this list row, and it is where the long provider errors, humanized
 * guidance, CTAs, timestamps and status badges actually live.
 *
 * Geometry belongs to the browser sweep; this file protects that the row's
 * classification, guidance and CTA routing are untouched by the layout change,
 * and that its identity group carries a legibility floor on the ALLOCATED region.
 */
import { render, screen, within } from "@testing-library/react";
import { RunRow } from "@/features/runs/RunRow";
import type { RunListItem } from "@/contracts/workflow";

const LONG_UNBROKEN =
  "Enterprise_revenue_operations_reconciliation_and_notification_pipeline_v2026_final";
const LONG_ERROR =
  "The connected app returned 429 Too Many Requests for this workspace. The provider reported: rate limit exceeded for method conversations.history on token scope channels:history; retry after 60 seconds.";

function run(over: Partial<RunListItem> & { id: string }): RunListItem {
  return {
    workflowId: "aaaaaaaa-0000-4000-8000-000000000001",
    workflowName: "Welcome new leads",
    status: "succeeded",
    isTest: false,
    triggeredBy: "scheduled",
    triggeredByApiKeyPrefix: null,
    startedAt: "2026-07-30T09:00:00Z",
    finishedAt: "2026-07-30T09:00:12Z",
    durationMs: 12480,
    errorClassification: null,
    ...over,
  } as RunListItem;
}

const OK = run({ id: "11111111-1111-4111-8111-111111111111" });

describe("run identity stays readable", () => {
  it("declares a legibility floor on the ALLOCATED identity group", () => {
    render(<RunRow run={OK} />);
    const row = screen.getByTestId(`runs-row-${OK.id}`);
    const identity = row.querySelector("[data-legible-min]") as HTMLElement;
    expect(identity).not.toBeNull();
    expect(Number(identity.getAttribute("data-legible-min"))).toBeGreaterThanOrEqual(180);
    // The floor is on the group that HOLDS the status badge + name, not the text.
    expect(
      within(identity).getByTestId(`runs-row-${OK.id}-workflow-link`),
    ).toBeInTheDocument();
  });

  it("wraps an unbroken workflow name instead of shrinking it away", () => {
    const r = run({ id: "22222222-2222-4222-8222-222222222222", workflowName: LONG_UNBROKEN });
    render(<RunRow run={r} />);
    const link = screen.getByTestId(`runs-row-${r.id}-workflow-link`);
    expect(link).toHaveTextContent(LONG_UNBROKEN);
    // `truncate` in a wrap row had nothing to ellipsise against — it just let the
    // name shrink toward zero.
    expect(link.className).toContain("break-words");
    expect(link.className).not.toMatch(/(^|\s)truncate(\s|$)/);
  });

  it("lets the timestamp group drop to its own line rather than push the row", () => {
    render(<RunRow run={OK} />);
    const started = screen.getByTestId(`runs-row-${OK.id}-started`);
    const meta = started.parentElement!;
    expect(meta.className).toContain("flex-wrap");
    expect(meta.className).toContain("shrink-0");
    // Right-aligned only when there is room for it to be.
    expect(meta.className).toContain("sm:ml-auto");
    expect(meta.className).not.toMatch(/(^|\s)ml-auto(\s|$)/);
  });

  it("keeps the full timestamp available via the title attribute", () => {
    render(<RunRow run={OK} />);
    // Relative display, full ISO value still reachable — the brief's rule for
    // values a user may need precisely.
    expect(screen.getByTestId(`runs-row-${OK.id}-started`)).toHaveAttribute(
      "title",
      new Date(OK.startedAt).toISOString(),
    );
  });
});

describe("error presentation and classification are untouched", () => {
  const failed = run({
    id: "33333333-3333-4333-8333-333333333333",
    status: "failed",
    workflowName: LONG_UNBROKEN,
    errorClassification: {
      title: "Slack rejected the request because the workspace hit its rate limit",
      description: LONG_ERROR,
      hint: "ChainReact will not retry automatically.",
      severity: "error",
      action: "retry_later",
    },
  } as Partial<RunListItem> & { id: string });

  it("renders the full humanized error, hint and guidance", () => {
    render(<RunRow run={failed} />);
    const block = screen.getByTestId(`runs-row-${failed.id}-error`);
    expect(block).toHaveAttribute("role", "alert");
    expect(block).toHaveTextContent(/hit its rate limit/);
    // The long provider message is present in full — not clipped to fit.
    expect(block).toHaveTextContent(/rate limit exceeded for method conversations.history/);
    expect(block).toHaveTextContent(/will not retry automatically/);
  });

  it("keeps the classified CTA and its routing decision", () => {
    render(<RunRow run={failed} />);
    const cta = screen.getByTestId(`runs-row-${failed.id}-cta`);
    // `retry_later` has no safe destination, so it stays guidance TEXT, never a
    // link. Responsive work must not change that classification.
    expect(cta).toHaveAttribute("data-cta-action", "retry_later");
    expect(cta.tagName.toLowerCase()).toBe("p");
  });

  it("routes an actionable classification to its real destination", () => {
    const reconnect = run({
      id: "44444444-4444-4444-8444-444444444444",
      status: "failed",
      errorClassification: {
        title: "The connected app needs to be reconnected",
        description: "Access was revoked or expired.",
        severity: "error",
        action: "reconnect",
      },
    } as Partial<RunListItem> & { id: string });
    render(<RunRow run={reconnect} />);
    const cta = screen.getByTestId(`runs-row-${reconnect.id}-cta`);
    expect(cta.tagName.toLowerCase()).toBe("a");
    expect(cta).toHaveAttribute("href", "/apps");
  });
});

describe("status and provenance are unchanged", () => {
  it("keeps the status badge, source badge and test marker", () => {
    const testRun = run({
      id: "55555555-5555-4555-8555-555555555555",
      status: "queued",
      isTest: true,
      triggeredBy: "api_key",
      triggeredByApiKeyPrefix: "crk_live_FIXTURE",
    });
    render(<RunRow run={testRun} />);
    expect(screen.getByTestId("run-status-badge-queued")).toBeVisible();
    expect(screen.getByTestId(`runs-row-${testRun.id}-test-marker`)).toBeVisible();
    // Non-secret prefix attribution only — never a raw key.
    expect(screen.getByTestId(`runs-row-${testRun.id}`)).toHaveTextContent("crk_live_FIXTURE");
  });

  it("still shows the non-terminal helper copy for a queued run", () => {
    const queued = run({
      id: "66666666-6666-4666-8666-666666666666",
      status: "queued",
      startedAt: new Date(Date.now() - 5_000).toISOString(),
      finishedAt: null,
      durationMs: null,
    });
    render(<RunRow run={queued} />);
    expect(screen.getByTestId(`runs-row-${queued.id}-pending`)).toBeVisible();
  });
});
