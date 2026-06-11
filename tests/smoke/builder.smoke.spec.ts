import { test, expect, request } from "@playwright/test";
import { assertNoServerError, gotoOk } from "./helpers/assertions";
import {
  RUN_EXECUTION,
  SMOKE_PREFIX,
  STORAGE_STATE,
  baseUrl,
  hasSmokeCredentials,
  uniqueWorkflowName,
} from "./helpers/env";

/**
 * Workflow builder smoke + manual run + cleanup.
 *
 * One serial chain sharing a single disposable workflow ("Smoke Test <ts>"):
 *   1. Create the workflow and open the builder.
 *   2. Add a Manual trigger + native HTTP Request action; leave it unconfigured
 *      → assert "Needs setup", header not "Ready", Run Manually blocked.
 *   3. Fill Method=GET + URL=https://example.com → assert it becomes Ready.
 *   4. Save → reopen → assert nodes + readiness persist.
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

let workflowId = "";
let workflowName = "";

test.describe.serial("Workflow builder smoke", () => {
  const actionNode = (selectorSuffix = "") =>
    `[data-testid="workflow-node-view"][data-kind="action"]${selectorSuffix}`;

  test("create a disposable workflow and open the builder", async ({ page }) => {
    workflowName = uniqueWorkflowName();

    await gotoOk(page, "/workflows");
    await page.getByRole("button", { name: "Create workflow" }).click();
    await page.locator("#new-workflow-name").fill(workflowName);
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await page.waitForURL(/\/workflows\/[^/?#]+/, { timeout: 30_000 });
    const match = page.url().match(/\/workflows\/([^/?#]+)/);
    expect(match, "Should navigate into the new workflow's builder URL").not.toBeNull();
    workflowId = match![1]!;

    await expect(page.getByTestId("builder-header")).toBeVisible();
    await assertNoServerError(page);
  });

  test("add Manual trigger + HTTP Request action — node reports Needs setup", async ({
    page,
  }) => {
    await gotoOk(page, `/workflows/${workflowId}`);

    // Trigger.
    await page.getByTestId("empty-canvas-choose-trigger").click();
    const triggerPanel = page.getByTestId("add-node-panel");
    await expect(triggerPanel).toBeVisible();
    await triggerPanel.getByText("Manual Trigger", { exact: true }).click();
    await expect(
      page.locator('[data-testid="workflow-node-view"][data-kind="trigger"]'),
    ).toBeVisible();

    // Action.
    await page.getByTestId("canvas-add-action-button").click();
    const actionPanel = page.getByTestId("add-node-panel");
    await expect(actionPanel).toBeVisible();
    await actionPanel.getByText("HTTP Request", { exact: true }).click();

    // Unconfigured required fields (method + url) → Needs setup.
    const node = page.locator(actionNode());
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

  test("fill Method=GET + URL — node and header become Ready", async ({ page }) => {
    await gotoOk(page, `/workflows/${workflowId}`);

    // Open the action node's config.
    await page.locator(actionNode()).click();
    await expect(page.getByTestId("schema-form")).toBeVisible();

    // Method is a Radix select (trigger id `field-method`).
    await page.locator("#field-method").click();
    await page.getByRole("option", { name: "GET", exact: true }).click();

    // URL is a plain text input.
    await page.locator("#field-url").fill(HTTP_URL);

    // Commit the node config (graph-level draft), then close the inspector.
    await page.getByTestId("config-modal-save-button").click();
    await page.getByRole("button", { name: "Close configuration" }).click();

    // Node + header now report Ready.
    await expect(page.locator(actionNode())).toHaveAttribute("data-status", "ready");
    const pill = page.getByTestId("builder-header-validation-pill");
    await expect(pill).toHaveAttribute("data-state", "ready");
    await expect(pill).toHaveText("Ready");
    await expect(
      page.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
  });

  test("save, reopen — nodes and readiness persist", async ({ page }) => {
    await gotoOk(page, `/workflows/${workflowId}`);

    // The workflow should already be Ready from the prior step's commit; ensure
    // it's persisted. If anything is still dirty, Save it.
    const saveBtn = page.getByTestId("builder-header-save-button");
    if (await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click();
      await expect(saveBtn).toBeDisabled({ timeout: 20_000 });
    }

    // Hard reload, then assert the persisted graph rehydrates with readiness.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-testid="workflow-node-view"][data-kind="trigger"]'),
    ).toBeVisible();
    await expect(page.locator(actionNode())).toHaveAttribute(
      "data-status",
      "ready",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("builder-header-validation-pill")).toHaveText(
      "Ready",
    );
    await assertNoServerError(page);
  });

  test("manual run records a run in the Runs page", async ({ page }) => {
    test.skip(
      !RUN_EXECUTION,
      "PRODUCTION_SMOKE_RUN_EXECUTION not 'true' — skipping live execution; readiness/save/reopen already verified.",
    );

    await gotoOk(page, `/workflows/${workflowId}`);
    const runBtn = page.getByTestId("run-controls-run-manually-button");
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
          return page
            .getByTestId("runs-list")
            .getByText(workflowName)
            .count();
        },
        { timeout: 60_000, intervals: [3_000, 5_000, 5_000] },
      )
      .toBeGreaterThan(0);
  });

  test("cleanup — delete the smoke workflow; it leaves the list", async ({ page }) => {
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
    // it. Best-effort + prefix-guarded; never touches anything else.
    if (!workflowId || !workflowName.startsWith(SMOKE_PREFIX)) return;
    try {
      const ctx = await request.newContext({
        baseURL: baseUrl(),
        storageState: STORAGE_STATE,
      });
      await ctx.delete(`/api/workflows/${workflowId}`).catch(() => undefined);
      await ctx.dispose();
    } catch {
      // Swallow — this is a best-effort cleanup, not an assertion surface.
    }
  });
});
