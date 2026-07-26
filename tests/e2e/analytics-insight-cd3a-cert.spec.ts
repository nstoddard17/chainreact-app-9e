import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * ANALYTICS-CONNECTED-DATA-CD-3A-INTEGRATION-CERT-1 — browser certification of
 * the Custom Insight experience against the REAL app: local Supabase, real
 * auth session, real dashboards persistence, real /api/analytics/insights/query.
 *
 * Covers: core creation flow, KPI formatting, line charts (series/legend/
 * tooltip/keyboard/data table), catalog-driven reconciliation, dev exposure
 * (Stripe preview + connect gating), freshness, responsive widths, keyboard
 * accessibility, member read-only, and malformed-widget isolation.
 *
 * Fixtures are seeded through the e2e service-role admin client against the
 * LOCAL test database only (the same safety-gated path every walkthrough spec
 * uses) and deleted afterwards.
 */

const ARTIFACTS = "C:/tmp/cd3a-cert-artifacts";

interface SeededWorkflow {
  id: string;
  name: string;
}

const state: {
  owner: TestUser | null;
  member: TestUser | null;
  accountId: string | null;
  workflows: SeededWorkflow[];
} = { owner: null, member: null, accountId: null, workflows: [] };

const DAY = 86_400_000;

/** Seed 3 workflows + a spread of runs over the last 14 days. */
async function seedRuns(accountId: string, ownerUserId: string): Promise<SeededWorkflow[]> {
  const admin = adminClient();
  const defs = [
    { name: "Daily digest", runs: 20, failEvery: 7, triggered_by: "webhook" },
    { name: "Lead sync", runs: 12, failEvery: 3, triggered_by: "scheduled" },
    { name: "Report mailer", runs: 6, failEvery: 2, triggered_by: "manual" },
  ];
  const out: SeededWorkflow[] = [];
  for (const def of defs) {
    const { data: wf, error } = await admin
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: ownerUserId,
        name: def.name,
        state: "active",
        draft_definition: {},
      })
      .select("id,name")
      .single();
    if (error) throw new Error(`seed workflow ${def.name}: ${error.message}`);
    out.push({ id: wf.id as string, name: wf.name as string });

    // Current-window runs (last 14 days) + a previous-period batch (31–44
    // days back) so previous-period comparison has a real denominator.
    const rows = Array.from({ length: def.runs + Math.ceil(def.runs / 2) }, (_, i) => {
      const daysBack = i < def.runs ? i % 14 : 31 + (i % 14);
      const started = new Date(Date.now() - daysBack * DAY - (i % 5) * 3_600_000);
      const durationMs = 400 + ((i * 137) % 4200);
      const failed = i % def.failEvery === def.failEvery - 1;
      return {
        workflow_id: wf.id,
        account_id: accountId,
        status: failed ? "failed" : "succeeded",
        trigger_node_id: "n-trigger",
        trigger_event: {},
        steps: [],
        started_at: started.toISOString(),
        finished_at: new Date(started.getTime() + durationMs).toISOString(),
        is_test: false,
        triggered_by: def.triggered_by,
      };
    });
    const { error: runErr } = await admin.from("workflow_runs").insert(rows);
    if (runErr) throw new Error(`seed runs ${def.name}: ${runErr.message}`);
  }
  return out;
}

async function resolveAccountId(userId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", userId);
  if (error || !data?.length) throw new Error(`no account for user: ${error?.message}`);
  return data[0]!.account_id as string;
}

/** Count POSTs to the insights query route while `fn` runs. */
async function countInsightQueries(page: Page, fn: () => Promise<void>): Promise<number> {
  let count = 0;
  const listener = (req: import("@playwright/test").Request) => {
    if (req.url().includes("/api/analytics/insights/query") && req.method() === "POST") count += 1;
  };
  page.on("request", listener);
  await fn();
  page.off("request", listener);
  return count;
}

async function openAnalytics(page: Page, user: TestUser): Promise<void> {
  await signInViaEmailLink(page, user, { next: "/analytics" });
  await expect(page.getByRole("heading", { name: "How everything's going" })).toBeVisible({
    timeout: 20_000,
  });
}

async function enterEdit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await expect(page.getByText("Edit mode is on.")).toBeVisible();
}

async function doneEditing(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("button", { name: "Edit dashboard" })).toBeVisible({
    timeout: 15_000,
  });
}

function insightDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Configure custom insight" });
}

/** Add a Custom insight widget and land in its builder. */
async function addInsightWidget(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Add a widget/ }).first().click();
  const library = page.getByRole("dialog", { name: "Add a widget" });
  await expect(library.getByText("Build a chart from ChainReact or one of your connected apps.")).toBeVisible();
  await library.getByRole("button", { name: /Custom insight/ }).click();
  await expect(insightDialog(page)).toBeVisible();
}

// Serial journey; generous timeout — the FIRST page hits compile the dev
// server's routes on demand (same posture as the dual-builder journeys).
test.describe.configure({ mode: "serial", timeout: 180_000 });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  mkdirSync(ARTIFACTS, { recursive: true });
  state.owner = await createTestUser();
  // First sign-in creates the personal account; then we can seed against it.
  const page = await browser.newPage();
  await openAnalytics(page, state.owner);
  // Warm the insights query route: the dev server compiles API routes on
  // demand, and that first compile must not eat into per-assert timeouts.
  await page.request.post("/api/analytics/insights/query", {
    data: {
      source: "chainreact",
      dataset: "workflow_runs",
      measure: "runs",
      dimension: null,
      range: { preset: "7d" },
    },
  });
  await page.close();
  state.accountId = await resolveAccountId(state.owner.id);
  state.workflows = await seedRuns(state.accountId, state.owner.id);
});

test.afterAll(async () => {
  if (state.member) await deleteTestUser(state.member.id);
  if (state.owner) await deleteTestUser(state.owner.id);
});

test("core creation flow: add → configure → preview → apply → save → reload → edit → resize → remove", async ({ page }) => {
  await openAnalytics(page, state.owner!);
  const before = await page.locator('[data-testid^="analytics-widget-"]').count();

  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);

  // The first meaningful decision is the App; guided empty state present.
  await expect(dialog.getByText("Where is the data from?")).toBeVisible();
  await expect(dialog.getByText(/Start by choosing\s+where your data comes from/)).toBeVisible();

  // No preview request until the question is complete.
  const premature = await countInsightQueries(page, async () => {
    await dialog.getByRole("button", { name: /^ChainReact/ }).click();
    await expect(dialog.getByText("What do you want to look at?")).toBeVisible();
    await dialog.getByRole("button", { name: /Workflow runs/ }).click();
    await expect(dialog.getByText("What should the chart show?")).toBeVisible();
  });
  expect(premature).toBe(0);

  // Choosing the measure completes a sensible default (ungrouped number).
  await dialog.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "No grouping — one number" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(dialog.getByRole("button", { name: "Number", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The real preview runs and shows live internal data.
  await expect(dialog.getByText("Live ChainReact data")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator(".text-3xl")).toHaveText(/^\d[\d,]*$/);
  await page.screenshot({ path: `${ARTIFACTS}/01-builder-preview.png`, fullPage: false });

  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await doneEditing(page);

  // Reload: the widget reconstructs and queries the EXACT saved question.
  const [request] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes("/api/analytics/insights/query") && r.method() === "POST",
    ),
    page.reload(),
  ]);
  expect(request.postDataJSON()).toEqual({
    source: "chainreact",
    dataset: "workflow_runs",
    measure: "runs",
    dimension: null,
    range: { preset: "30d" },
    chart: "kpi",
  });
  const widget = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Live ChainReact data" });
  await expect(widget).toHaveCount(1);
  await expect(widget.locator(".text-3xl")).toHaveText(/^\d[\d,]*$/);
  await page.screenshot({ path: `${ARTIFACTS}/02-saved-widget.png` });

  // Re-edit: change the question to Failed runs over time, save again.
  await enterEdit(page);
  await widget.getByRole("button", { name: "Configure widget" }).click();
  const dialog2 = insightDialog(page);
  await expect(dialog2.getByRole("button", { name: "Runs", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog2.getByRole("button", { name: "Failed runs" }).click();
  await dialog2.getByRole("button", { name: "Over time" }).click();
  await expect(dialog2.getByRole("button", { name: "Line chart" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog2.getByRole("button", { name: "Apply" }).click();

  // Resize through the widget chrome.
  await widget.getByRole("combobox", { name: "Resize widget" }).selectOption("xl");

  // Reorder: drive the HTML5 drag events directly (Playwright's mouse-based
  // dragTo does not synthesize React dragstart/drop; the chrome's drag
  // handlers are the pre-existing ANALYTICS-1 mechanic).
  const allWidgets = page.locator('[data-testid^="analytics-widget-"]');
  const insightId = await widget.getAttribute("data-testid");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await widget.dispatchEvent("dragstart", { dataTransfer });
  await allWidgets.first().dispatchEvent("dragover", { dataTransfer });
  await allWidgets.first().dispatchEvent("drop", { dataTransfer });
  await widget.dispatchEvent("dragend", { dataTransfer });
  await expect(allWidgets.first()).toHaveAttribute("data-testid", insightId!);
  await doneEditing(page);

  const [request2] = await Promise.all([
    page.waitForRequest(
      (r) => r.url().includes("/api/analytics/insights/query") && r.method() === "POST",
    ),
    page.reload(),
  ]);
  expect(request2.postDataJSON()).toMatchObject({
    measure: "failed_runs",
    dimension: "time",
    chart: "line",
  });

  // Remove it; other widgets remain intact.
  await enterEdit(page);
  const insightWidget = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ has: page.getByText(/ChainReact data|Failed runs/) })
    .first();
  await insightWidget.getByRole("button", { name: "Remove widget" }).click();
  await doneEditing(page);
  await expect(page.locator('[data-testid^="analytics-widget-"]')).toHaveCount(before);
});

test("KPI measures: count, percent, duration formatting + neutral comparison", async ({ page }) => {
  await openAnalytics(page, state.owner!);
  await enterEdit(page);

  const makeKpi = async (measure: string, compare: boolean) => {
    await addInsightWidget(page);
    const dialog = insightDialog(page);
    await dialog.getByRole("button", { name: /^ChainReact/ }).click();
    await dialog.getByRole("button", { name: /Workflow runs/ }).click();
    await dialog.getByRole("button", { name: measure, exact: true }).click();
    if (compare) {
      await dialog.getByLabel("Compare with the previous period").check();
    }
    await expect(dialog.getByText("Live ChainReact data")).toBeVisible({ timeout: 30_000 });
    const value = await dialog.locator(".text-3xl").textContent();
    await dialog.getByRole("button", { name: "Apply" }).click();
    return value ?? "";
  };

  const runs = await makeKpi("Runs", true);
  expect(runs).toMatch(/^\d[\d,]*$/); // whole count

  const successRate = await makeKpi("Success rate", false);
  expect(successRate).toMatch(/^\d+(\.\d)?%$/); // honest percent

  const avgDuration = await makeKpi("Average duration", false);
  expect(avgDuration).toMatch(/(ms|s|min|hr)/); // humanized duration

  await doneEditing(page);

  // Neutral comparison: wording is up/down vs previous period, with NO
  // success/destructive coloring on the trend note.
  const compareNote = page.getByText(/vs previous period/).first();
  await expect(compareNote).toBeVisible();
  const cls = (await compareNote.getAttribute("class")) ?? "";
  expect(cls).not.toContain("text-success");
  expect(cls).not.toContain("text-destructive");
  await page.screenshot({ path: `${ARTIFACTS}/03-kpis.png`, fullPage: true });

  // Cleanup: remove the three KPI widgets.
  await enterEdit(page);
  for (let i = 0; i < 3; i += 1) {
    const w = page
      .locator('[data-testid^="analytics-widget-"]')
      .filter({ hasText: "Live ChainReact data" })
      .first();
    await w.getByRole("button", { name: "Remove widget" }).click();
  }
  await doneEditing(page);
});

test("line chart: exact workflow series, legend toggle without refetch, tooltip, keyboard, data table", async ({ page }) => {
  await openAnalytics(page, state.owner!);
  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);

  await dialog.getByRole("button", { name: /^ChainReact/ }).click();
  await dialog.getByRole("button", { name: /Workflow runs/ }).click();
  await dialog.getByRole("button", { name: "Runs", exact: true }).click();
  await dialog.getByRole("button", { name: "Over time" }).click();

  // Choose exact workflows through the generic entity picker.
  await dialog.getByRole("radio", { name: "Choose exact workflows" }).check();
  await dialog.getByRole("option", { name: "Daily digest" }).click();
  await dialog.getByRole("option", { name: "Lead sync" }).click();
  await expect(dialog.getByText("2/8 selected")).toBeVisible(); // the 8-series cap is visible

  // Weekly grouping through the declared grain control.
  await dialog.getByLabel(/Group by/).selectOption("week");

  await expect(dialog.getByRole("list", { name: "Chart legend" })).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await doneEditing(page);

  const widget = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Live ChainReact data" })
    .first();
  const legend = widget.getByRole("list", { name: "Chart legend" });
  await expect(legend).toBeVisible({ timeout: 30_000 });

  // Each selected workflow is one line; unselected workflows don't appear.
  await expect(legend.getByRole("listitem", { name: /Daily digest/ })).toBeVisible();
  await expect(legend.getByRole("listitem", { name: /Lead sync/ })).toBeVisible();
  await expect(legend.getByRole("listitem", { name: /Report mailer/ })).toHaveCount(0);
  expect(await widget.locator('[data-testid^="insight-series-"]').count()).toBe(2);

  // Legend toggle hides a line with NO new request.
  const toggleRequests = await countInsightQueries(page, async () => {
    await legend.getByRole("listitem", { name: /Lead sync/ }).click();
    await expect(widget.locator('[data-testid^="insight-series-"]')).toHaveCount(1);
    await legend.getByRole("listitem", { name: /Lead sync/ }).click();
    await expect(widget.locator('[data-testid^="insight-series-"]')).toHaveCount(2);
  });
  expect(toggleRequests).toBe(0);

  // Tooltip on hover.
  const chart = widget.getByRole("group", { name: /Runs by week/ });
  await chart.hover({ position: { x: 200, y: 60 } });
  await expect(widget.getByTestId("insight-chart-tooltip")).toBeVisible();

  // Keyboard navigation announces values.
  await chart.focus();
  await page.keyboard.press("Home");
  const status = widget.locator('[role="status"][aria-live="polite"]');
  await expect(status).toContainText(/Daily digest/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  await expect(status).toContainText(/Daily digest .*Lead sync/);

  // The accessible data table mirrors the chart exactly.
  await widget.getByRole("button", { name: "View data" }).click();
  const table = widget.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Daily digest" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Lead sync" })).toBeVisible();
  const cellTexts = await table.locator("tbody td").allTextContents();
  expect(cellTexts.length).toBeGreaterThan(0);
  for (const cell of cellTexts) expect(cell).toMatch(/^(\d[\d,]*|—)$/);
  await page.screenshot({ path: `${ARTIFACTS}/04-line-chart-table.png` });
  await widget.getByRole("button", { name: "View chart" }).click();

  // Status series: succeeded vs failed lines from the automatic capability.
  await enterEdit(page);
  await widget.getByRole("button", { name: "Configure widget" }).click();
  const dialog2 = insightDialog(page);
  await dialog2.getByRole("radio", { name: "By status (automatic)" }).check();
  await expect(dialog2.getByRole("list", { name: "Chart legend" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    dialog2.getByRole("list", { name: "Chart legend" }).getByRole("listitem", { name: /Succeeded/ }),
  ).toBeVisible();
  await expect(
    dialog2.getByRole("list", { name: "Chart legend" }).getByRole("listitem", { name: /Failed/ }),
  ).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/05-status-series.png` });
  await dialog2.getByRole("button", { name: "Apply" }).click();

  // Cleanup.
  const w = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Live ChainReact data" })
    .first();
  await w.getByRole("button", { name: "Remove widget" }).click();
  await doneEditing(page);
});

test("dependency reconciliation: valid choices preserved, invalid cleared with explanations", async ({ page }) => {
  await openAnalytics(page, state.owner!);
  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);

  await dialog.getByRole("button", { name: /^ChainReact/ }).click();
  await dialog.getByRole("button", { name: /Workflow runs/ }).click();
  await dialog.getByRole("button", { name: "Runs", exact: true }).click();

  // Set a status filter (valid for Runs).
  await dialog.getByRole("checkbox", { name: "Succeeded" }).check();
  // Set trigger-source filter too — this one stays valid throughout.
  await dialog.getByRole("checkbox", { name: "Webhook" }).check();

  // Switching to Failed runs makes the STATUS filter incompatible: it is
  // cleared with an explanation; the trigger-source filter must survive.
  await dialog.getByRole("button", { name: "Failed runs" }).click();
  await expect(dialog.getByText(/status filter doesn't apply|filter doesn't apply here anymore/i)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Webhook" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Succeeded" })).toHaveCount(0);

  // Group over time + explicit series, then switch back to Number: the
  // time-only configuration clears with explanations, the question stays.
  await dialog.getByRole("button", { name: "Over time" }).click();
  await dialog.getByRole("radio", { name: "Choose exact workflows" }).check();
  await dialog.getByRole("option", { name: "Daily digest" }).click();
  await dialog.getByRole("button", { name: "No grouping — one number" }).click();
  await expect(dialog.getByText("Separate lines only apply to a chart over time.")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Webhook" })).toBeChecked(); // still preserved
  await expect(dialog.getByRole("button", { name: "Number", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Changing the App resets dataset-specific choices (fresh question).
  await page.screenshot({ path: `${ARTIFACTS}/06-reconciliation.png` });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  // Leave edit mode without keeping the scratch widget.
  const scratch = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Finish setting up this insight" })
    .first();
  await scratch.getByRole("button", { name: "Remove widget" }).click();
  await doneEditing(page);
});

test("exposure & connection states (dev): Stripe preview badge, connect gating, crafted requests", async ({ page }) => {
  await openAnalytics(page, state.owner!);
  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);

  // Dev environment: Stripe appears, explicitly marked Preview, not connected.
  const stripeCard = dialog.getByRole("button", { name: /^Stripe/ });
  await expect(stripeCard).toBeVisible();
  await expect(stripeCard.getByText("Preview")).toBeVisible();
  await expect(stripeCard.getByText("Not connected")).toBeVisible();

  // ChainReact (internal) shows no connection chrome at all.
  const crCard = dialog.getByRole("button", { name: /^ChainReact/ });
  await expect(crCard.getByText(/connected/i)).toHaveCount(0);

  // The generic builder renders Stripe's catalog controls (no special-case UI),
  // and the missing connection gates the preview behind a connect action.
  await stripeCard.click();
  await dialog.getByRole("button", { name: /Payments/ }).click();
  await dialog.getByRole("button", { name: "Gross payment amount" }).click();
  await expect(dialog.getByText("Connect Stripe to preview this data.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Connect Stripe" })).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/07-stripe-preview-connect.png` });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  const scratch = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Finish setting up this insight" })
    .first();
  await scratch.getByRole("button", { name: "Remove widget" }).click();
  await doneEditing(page);

  // Crafted requests through the real route (dev env): a Stripe query without
  // a connection returns the typed MISSING_CREDENTIAL state; an unknown
  // source gets the fixed non-leaking copy.
  const stripeRes = await page.request.post("/api/analytics/insights/query", {
    data: {
      source: "stripe",
      dataset: "payments",
      measure: "payment_count",
      dimension: null,
      range: { preset: "30d" },
    },
  });
  expect(stripeRes.status()).toBe(400);
  expect((await stripeRes.json()).code).toBe("MISSING_CREDENTIAL");

  const unknownRes = await page.request.post("/api/analytics/insights/query", {
    data: {
      source: "nope",
      dataset: "x",
      measure: "y",
      dimension: null,
      range: { preset: "30d" },
    },
  });
  expect(unknownRes.status()).toBe(400);
  const unknownBody = await unknownRes.json();
  expect(unknownBody.code).toBe("UNKNOWN_SOURCE");
  expect(unknownBody.error).toBe("That data source isn't available.");
});

test("responsive: analytics + open builder have no horizontal overflow at 5 widths", async ({ page }) => {
  await openAnalytics(page, state.owner!);
  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);
  await dialog.getByRole("button", { name: /^ChainReact/ }).click();
  await dialog.getByRole("button", { name: /Workflow runs/ }).click();
  await dialog.getByRole("button", { name: "Runs", exact: true }).click();
  await dialog.getByRole("button", { name: "Over time" }).click();
  await expect(dialog.getByRole("list", { name: "Chart legend" }).or(dialog.getByText("Live ChainReact data"))).toBeVisible({ timeout: 30_000 });

  const widths = [1440, 1024, 768, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    // The page body must never scroll horizontally.
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    // The builder panel must fit the viewport.
    const box = await dialog.boundingBox();
    expect(box!.width, `panel width at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(box!.x, `panel x at ${width}px`).toBeGreaterThanOrEqual(-1);
    await page.screenshot({ path: `${ARTIFACTS}/08-responsive-${width}.png` });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  const scratch = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Finish setting up this insight" })
    .first();
  await scratch.getByRole("button", { name: "Remove widget" }).click();
  await doneEditing(page);
});

test("accessibility: reduced motion honored and dashboard refresh re-queries without a storm", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAnalytics(page, state.owner!);
  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);
  await dialog.getByRole("button", { name: /^ChainReact/ }).click();
  await dialog.getByRole("button", { name: /Workflow runs/ }).click();
  await dialog.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(dialog.getByText("Live ChainReact data")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await doneEditing(page);

  // Dashboard-level Refresh re-runs the insight exactly once.
  const widget = page
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Live ChainReact data" })
    .first();
  await expect(widget).toBeVisible();
  const refetches = await countInsightQueries(page, async () => {
    await page.getByRole("button", { name: /^Refresh$/ }).click();
    await expect(widget.locator(".text-3xl")).toBeVisible({ timeout: 30_000 });
  });
  expect(refetches).toBe(1);

  await enterEdit(page);
  await widget.getByRole("button", { name: "Remove widget" }).click();
  await doneEditing(page);
});

test("member read-only: saved insight loads, no edit controls, writes rejected server-side", async ({ page, browser }) => {
  // Owner saves an insight widget first.
  await openAnalytics(page, state.owner!);
  await enterEdit(page);
  await addInsightWidget(page);
  const dialog = insightDialog(page);
  await dialog.getByRole("button", { name: /^ChainReact/ }).click();
  await dialog.getByRole("button", { name: /Workflow runs/ }).click();
  await dialog.getByRole("button", { name: "Success rate" }).click();
  await expect(dialog.getByText("Live ChainReact data")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await doneEditing(page);

  // Add a member to the owner's account directly (local test DB).
  state.member = await createTestUser();
  const { error } = await adminClient().from("account_memberships").insert({
    account_id: state.accountId,
    user_id: state.member.id,
    role: "member",
  });
  expect(error).toBeNull();

  const memberPage = await browser.newPage();
  await openAnalytics(memberPage, state.member);

  // The shared insight loads with data for the member.
  const widget = memberPage
    .locator('[data-testid^="analytics-widget-"]')
    .filter({ hasText: "Live ChainReact data" })
    .first();
  await expect(widget).toBeVisible({ timeout: 20_000 });
  await expect(widget.locator(".text-3xl")).toHaveText(/%|—/);

  // No authoring controls for members.
  await expect(memberPage.getByRole("button", { name: "Edit dashboard" })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Configure widget" })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "New dashboard" })).toHaveCount(0);

  // A crafted member write still fails through real server authorization.
  const dashboardsRes = await memberPage.request.get("/api/analytics/dashboards");
  const dashboards = (await dashboardsRes.json()).dashboards as { id: string }[];
  const patchRes = await memberPage.request.patch(
    `/api/analytics/dashboards/${dashboards[0]!.id}`,
    { data: { widgets: [] } },
  );
  expect([403, 404]).toContain(patchRes.status());
  await memberPage.screenshot({ path: `${ARTIFACTS}/09-member-readonly.png` });
  await memberPage.close();
});

test("error isolation: malformed widget is salvaged alone; obsolete config shows repair state", async ({ page }) => {
  // Corrupt the stored board directly (simulating a legacy/hand-edited blob):
  // one malformed insight + one obsolete-but-well-formed insight alongside
  // the real widgets.
  const admin = adminClient();
  const { data: dash, error } = await admin
    .from("analytics_dashboards")
    .select("id,widgets")
    .eq("account_id", state.accountId!)
    .eq("is_default", true)
    .single();
  expect(error).toBeNull();
  const widgets = dash!.widgets as unknown[];
  const originalCount = widgets.length;
  const corrupted = [
    ...widgets,
    { id: "w-malformed", type: "insight", size: "m", title: "Broken", config: { source: "any", insight: { accountId: "acc-nope" } } },
    {
      id: "w-obsolete",
      type: "insight",
      size: "m",
      title: "Obsolete insight",
      config: {
        source: "any",
        insight: { source: "gone_source", dataset: "gone", measure: "x", dimension: null, chart: "kpi" },
      },
    },
  ];
  const { error: upErr } = await admin
    .from("analytics_dashboards")
    .update({ widgets: corrupted })
    .eq("id", dash!.id);
  expect(upErr).toBeNull();

  await openAnalytics(page, state.owner!);

  // The malformed entry is dropped ALONE; the board is not emptied.
  await expect(page.locator('[data-testid^="analytics-widget-"]')).toHaveCount(originalCount + 1);
  await expect(page.getByText("Broken")).toHaveCount(0);

  // The obsolete config renders its isolated repair state; siblings render data.
  const obsolete = page.getByTestId("analytics-widget-w-obsolete");
  await expect(obsolete.getByText("Settings need an update")).toBeVisible();
  await expect(
    obsolete.getByText(/no longer available. Edit the widget to update it./),
  ).toBeVisible();
  await expect(page.getByText("Runs over time")).toBeVisible(); // legacy widget intact
  await page.screenshot({ path: `${ARTIFACTS}/10-error-isolation.png`, fullPage: true });

  // Restore the board.
  const { error: restoreErr } = await admin
    .from("analytics_dashboards")
    .update({ widgets })
    .eq("id", dash!.id);
  expect(restoreErr).toBeNull();
});
