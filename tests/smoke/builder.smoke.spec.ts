import { test, expect, type Page } from "@playwright/test";
import { assertNoServerError, clickToReveal, gotoOk } from "./helpers/assertions";
import {
  RUN_EXECUTION,
  SMOKE_PREFIX,
  STORAGE_STATE,
  baseUrl,
  hasSmokeCredentials,
  uniqueWorkflowName,
  vercelBypassHeaders,
} from "./helpers/env";

/**
 * Workflow builder smoke + manual run + cleanup.
 *
 * Runs as a single serial chain on ONE shared page (created in beforeAll), so
 * in-builder graph mutations accumulate across steps the way a real session
 * does — builder edits live in memory until a header Save persists them, so a
 * fresh navigation per step would silently discard them. Steps:
 *   1. Create the workflow and open the builder.
 *   2. Add a Manual trigger + native HTTP Request action; leave it unconfigured
 *      → assert "Needs setup", header not "Ready", Run Manually blocked.
 *   3. Fill Method=GET + URL=https://example.com → assert it becomes Ready.
 *   4. Save → reload → assert nodes + readiness persist.
 *   5. Manual run (opt-in via PRODUCTION_SMOKE_RUN_EXECUTION) → appears in Runs.
 *   6. Cleanup — delete the smoke workflow; assert it leaves the list.
 *
 * Safety: only ever touches the single workflow it created, whose name starts
 * with SMOKE_PREFIX. Never deletes anything else.
 */
test.skip(
  !hasSmokeCredentials(),
  "PRODUCTION_SMOKE_EMAIL / PRODUCTION_SMOKE_PASSWORD not set — skipping workflow builder smoke.",
);

const HTTP_URL = "https://example.com";
const ACTION_NODE = '[data-testid="workflow-node-view"][data-kind="action"]';
const TRIGGER_NODE = '[data-testid="workflow-node-view"][data-kind="trigger"]';

let page: Page;
let workflowId = "";
let workflowName = "";

test.describe.serial("Workflow builder smoke", () => {
  test.beforeAll(async ({ browser }) => {
    if (!hasSmokeCredentials()) return;
    // Own context (not the per-test `page` fixture) so the same page — and thus
    // the same in-memory builder graph — carries across the serial steps.
    // Manually-created contexts do NOT inherit the config's use.extraHTTPHeaders,
    // so the Vercel protection-bypass header must be re-attached here or every
    // request on a protected preview 401s (V2-DEV-BRANCH-ATTRIBUTION-FIX-2).
    const context = await browser.newContext({
      baseURL: baseUrl(),
      storageState: STORAGE_STATE,
      extraHTTPHeaders: vercelBypassHeaders(),
    });
    page = await context.newPage();
  });

  test("create a disposable workflow and open the builder", async () => {
    workflowName = uniqueWorkflowName();

    await gotoOk(page, "/workflows");
    await clickToReveal(
      page.getByRole("button", { name: "Create workflow" }),
      page.locator("#new-workflow-name"),
    );
    await page.locator("#new-workflow-name").fill(workflowName);

    // Capture the created id straight from the 201 response. The app's
    // post-create auto-redirect to the builder (router.refresh + router.push —
    // the BUILDER-LIST-CACHE path) is unreliable and can leave the page on the
    // list, so we don't depend on it: we open the builder explicitly by id.
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && /\/api\/workflows$/.test(r.url()),
        { timeout: 30_000 },
      ),
      page.getByRole("button", { name: "Create", exact: true }).click(),
    ]);
    expect(resp.status(), "create workflow should return 201").toBe(201);
    const created = (await resp.json()) as { id?: string };
    expect(created.id, "create response should include an id").toBeTruthy();
    workflowId = created.id!;

    await gotoOk(page, `/workflows/${workflowId}`);
    await expect(page.getByTestId("builder-header")).toBeVisible();
    await assertNoServerError(page);
  });

  test("add Manual trigger + HTTP Request action — node reports Needs setup", async () => {
    // Trigger. The empty-canvas CTA is a client onClick → retry through hydration.
    await clickToReveal(
      page.getByTestId("empty-canvas-choose-trigger"),
      page.getByTestId("add-node-panel"),
    );
    await page
      .getByTestId("add-node-panel")
      .getByText("Manual Trigger", { exact: true })
      .click();
    await expect(page.locator(TRIGGER_NODE)).toBeVisible();

    // Action.
    await clickToReveal(
      page.getByTestId("canvas-add-action-button"),
      page.getByTestId("add-node-panel"),
    );
    await page
      .getByTestId("add-node-panel")
      .getByText("HTTP Request", { exact: true })
      .click();

    // Unconfigured required fields (method + url) → Needs setup.
    const node = page.locator(ACTION_NODE);
    await expect(node).toBeVisible();
    await expect(node).toHaveAttribute("data-status", "needs_setup");
    await expect(page.getByTestId("needs-setup-badge")).toBeVisible();

    // Header is not Ready.
    const pill = page.getByTestId("builder-header-validation-pill");
    await expect(pill).toHaveAttribute("data-state", "error");
    await expect(pill).not.toHaveText("Ready");

    // Run Manually is blocked while setup is incomplete.
    await expect(
      page.getByTestId("run-controls-run-manually-button"),
    ).toBeDisabled();
  });

  test("fill Method=GET + URL — node and header become Ready", async () => {
    // Open the action node's config (client onClick → retry through hydration).
    await clickToReveal(page.locator(ACTION_NODE), page.getByTestId("schema-form"));

    // Method is a Radix select (trigger id `field-method`).
    await page.locator("#field-method").click();
    await page.getByRole("option", { name: "GET", exact: true }).click();

    // URL is a plain text input.
    await page.locator("#field-url").fill(HTTP_URL);

    // Commit the node config (graph-level draft), then close the inspector.
    await page.getByTestId("config-modal-save-button").click();
    await page.getByRole("button", { name: "Close drawer" }).click();

    // Node + header now report Ready. The node's healthy status enum is
    // "configured" (the on-card badge text is the cosmetic "ready"); the header
    // validation pill is the surface that literally reads "Ready".
    await expect(page.locator(ACTION_NODE)).toHaveAttribute("data-status", "configured");
    const pill = page.getByTestId("builder-header-validation-pill");
    await expect(pill).toHaveAttribute("data-state", "ready");
    await expect(pill).toHaveText("Ready");
    await expect(
      page.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
  });

  test("save, reload — nodes and readiness persist", async () => {
    // Persist the in-memory graph (trigger + configured action) to the backend.
    const saveBtn = page.getByTestId("builder-header-save-button");
    await expect(saveBtn).toBeEnabled({ timeout: 20_000 });
    await saveBtn.click();
    // Wait for the save to COMPLETE, not merely for the button to disable — the
    // button is also disabled mid-save, so reloading on `disabled` alone aborts
    // the in-flight write and nothing persists. The status pill reaching
    // "saved" is the completion signal.
    await expect(page.getByTestId("builder-header-status-pill")).toHaveAttribute(
      "data-status",
      "saved",
      { timeout: 20_000 },
    );

    // Hard reload, then assert the persisted graph rehydrates with readiness.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(TRIGGER_NODE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(ACTION_NODE)).toHaveAttribute(
      "data-status",
      "configured",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("builder-header-validation-pill")).toHaveText(
      "Ready",
    );
    await assertNoServerError(page);
  });

  test("manual run records a run in the Runs page", async () => {
    test.skip(
      !RUN_EXECUTION,
      "PRODUCTION_SMOKE_RUN_EXECUTION not 'true' — skipping live execution; readiness/save/reopen already verified.",
    );

    const runBtn = page.getByTestId("run-controls-run-manually-button");
    // Enabled state is client-computed, so awaiting it also confirms hydration.
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // GET https://example.com is non-destructive, so no confirmation modal is
    // expected. If one appears, don't try to drive it from the smoke.
    const modal = page.getByTestId("destructive-action-confirmation-modal");
    if (await modal.isVisible().catch(() => false)) {
      test.skip(true, "Destructive confirmation modal appeared — not driven by smoke.");
    }

    // Enqueue acknowledged in-builder.
    await expect(page.getByTestId("run-now-success")).toBeAttached({
      timeout: 30_000,
    });

    // A run row for this workflow shows up in Runs once it leaves 'running'.
    // It may be Succeeded or Failed — either is "recorded visibly".
    await expect
      .poll(
        async () => {
          await page.goto("/runs", { waitUntil: "domcontentloaded" });
          return page.getByTestId("runs-list").getByText(workflowName).count();
        },
        { timeout: 60_000, intervals: [3_000, 5_000, 5_000] },
      )
      .toBeGreaterThan(0);
  });

  test("cleanup — delete the smoke workflow; it leaves the list", async () => {
    // Safety belt: only ever delete a workflow whose name carries the smoke prefix.
    expect(
      workflowName.startsWith(SMOKE_PREFIX),
      "Refusing to delete a workflow that doesn't match the smoke prefix",
    ).toBeTruthy();
    expect(workflowId).not.toEqual("");

    const res = await page.request.delete(`/api/workflows/${workflowId}`);
    expect(res.ok(), `DELETE /api/workflows/${workflowId} should succeed`).toBeTruthy();

    await gotoOk(page, "/workflows");
    await expect(page.getByTestId("workflows-dashboard")).toBeVisible();
    await expect(
      page.locator('[data-testid="workflow-card-name"]', { hasText: workflowName }),
    ).toHaveCount(0);
  });

  test.afterAll(async () => {
    // Safety net: if a mid-chain failure left the smoke workflow behind, remove
    // it. Best-effort + prefix-guarded; never touches anything else. Uses the
    // shared authenticated context before it's closed.
    try {
      if (page && workflowId && workflowName.startsWith(SMOKE_PREFIX)) {
        await page.request
          .delete(`/api/workflows/${workflowId}`)
          .catch(() => undefined);
      }
    } finally {
      await page?.context().close().catch(() => undefined);
    }
  });
});
