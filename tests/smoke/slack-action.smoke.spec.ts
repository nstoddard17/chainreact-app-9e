import { test, expect, type Page } from "@playwright/test";
import { assertNoServerError, clickToReveal, gotoOk } from "./helpers/assertions";
import {
  SMOKE_PREFIX,
  STORAGE_STATE,
  baseUrl,
  hasSlackSmokeConfig,
  smokeSlackChannelName,
  uniqueWorkflowName,
} from "./helpers/env";

/**
 * Slack "Send Channel Message" action smoke (action-only).
 *
 * Validates the one provider-action path end-to-end against production:
 * build → configure (channel picked by VISIBLE NAME) → save → run → confirm
 * the ChainReact run succeeds → clean up. Triggers are out of scope; this
 * suite never touches Slack event triggers and never exercises another
 * provider.
 *
 * Runs as a single serial chain on ONE shared page (builder edits live in
 * memory until a header Save), mirroring builder.smoke.spec.ts. Steps:
 *   1. Create a disposable smoke-prefixed workflow and open the builder.
 *   2. Confirm Slack is connected on the Apps page (precondition).
 *   3. Add a Manual trigger + the Slack `send_channel_message` action.
 *   4. Pick the channel by its visible picker label (PRODUCTION_SMOKE_SLACK_
 *      CHANNEL_NAME) and set the message → node + header become Ready.
 *   5. Save, then Run Manually.
 *   6. Confirm a Succeeded run for this workflow appears in Runs.
 *   7. Cleanup — delete the smoke workflow.
 *
 * Opt-in / safety:
 *   - Self-skips unless credentials AND PRODUCTION_SMOKE_SLACK_CHANNEL_NAME are
 *     set. Supplying the channel name IS the explicit consent to post a real
 *     message (the send is the validation — there is no dry-run). This is
 *     deliberately independent of PRODUCTION_SMOKE_RUN_EXECUTION, which only
 *     gates the generic HTTP run in builder.smoke.spec.ts.
 *   - Only ever touches the single workflow it created, whose name starts with
 *     SMOKE_PREFIX. Never deletes anything else.
 *   - Selects the channel by visible name only — never types or asserts a
 *     channel id (the combobox stores the id under the hood).
 */
test.skip(
  !hasSlackSmokeConfig(),
  "PRODUCTION_SMOKE_EMAIL / PRODUCTION_SMOKE_PASSWORD / PRODUCTION_SMOKE_SLACK_CHANNEL_NAME not all set — skipping Slack action smoke.",
);

const ACTION_NODE = '[data-testid="workflow-node-view"][data-kind="action"]';
const TRIGGER_NODE = '[data-testid="workflow-node-view"][data-kind="trigger"]';
const SLACK_ACTION_KEY = "slack:send_channel_message";

let page: Page;
let workflowId = "";
let workflowName = "";
let message = "";

/**
 * Open the channel combobox and select the option whose VISIBLE label matches
 * the configured channel name. The resolver filters its `#<name>` labels by the
 * typed query, so typing narrows the list server-side; we then click the option
 * whose label matches — preferring an exact `#name` / `name` label over a
 * substring so "general" never accidentally picks "#general-announcements".
 */
async function selectChannelByVisibleName(p: Page, name: string): Promise<void> {
  await p.locator("#field-channel").click();
  const search = p.getByPlaceholder(/Search channels/i);
  await expect(search).toBeVisible();
  await search.fill(name);

  const withHash = name.startsWith("#") ? name : `#${name}`;
  const exact = p
    .getByRole("option")
    .filter({ has: p.locator(`text=${JSON.stringify(withHash)}`) });
  const rawExact = p
    .getByRole("option")
    .filter({ has: p.locator(`text=${JSON.stringify(name)}`) });
  const substring = p.getByRole("option").filter({ hasText: name });

  // Retry through the async options load: click as soon as a match resolves.
  await expect(async () => {
    if ((await exact.count()) > 0) {
      await exact.first().click();
      return;
    }
    if ((await rawExact.count()) > 0) {
      await rawExact.first().click();
      return;
    }
    await expect(substring.first()).toBeVisible({ timeout: 2_000 });
    await substring.first().click();
  }).toPass({ timeout: 20_000, intervals: [500, 1_000, 2_000] });

  // The trigger now reflects the selection (popover closed).
  await expect(p.locator("#field-channel")).toContainText(
    withHash.replace(/^#/, ""),
  );
}

test.describe.serial("Slack action smoke", () => {
  test.beforeAll(async ({ browser }) => {
    if (!hasSlackSmokeConfig()) return;
    // Own context (not the per-test `page` fixture) so the same in-memory
    // builder graph carries across the serial steps.
    const context = await browser.newContext({
      baseURL: baseUrl(),
      storageState: STORAGE_STATE,
    });
    page = await context.newPage();
  });

  test("Slack is connected on the Apps page", async () => {
    await gotoOk(page, "/apps");
    await expect(page.getByTestId("apps-dashboard")).toBeVisible();
    // The Slack card must report a connected state — the precondition for the
    // whole suite. We read the card's data-state, not a humanized string.
    const slackCard = page.locator(
      '[data-testid="app-card"][data-provider-id="slack"]',
    );
    await expect(slackCard).toBeVisible({ timeout: 20_000 });
    await expect(slackCard).toHaveAttribute("data-state", "connected");
    await assertNoServerError(page);
  });

  test("create a disposable workflow and open the builder", async () => {
    workflowName = uniqueWorkflowName();

    await gotoOk(page, "/workflows");
    await clickToReveal(
      page.getByRole("button", { name: "Create workflow" }),
      page.locator("#new-workflow-name"),
    );
    await page.locator("#new-workflow-name").fill(workflowName);

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

  test("add Manual trigger + Slack Send Channel Message action — Needs setup", async () => {
    // Trigger (client onClick → retry through hydration).
    await clickToReveal(
      page.getByTestId("empty-canvas-choose-trigger"),
      page.getByTestId("add-node-panel"),
    );
    await page
      .getByTestId("add-node-panel")
      .getByText("Manual Trigger", { exact: true })
      .click();
    await expect(page.locator(TRIGGER_NODE)).toBeVisible();

    // Action — drill into the Slack provider first, then pick by the unique
    // meta key so we never collide with Teams' "Send Channel Message".
    await clickToReveal(
      page.getByTestId("canvas-add-action-button"),
      page.getByTestId("add-node-panel"),
    );
    await page
      .getByTestId("add-node-panel")
      .getByRole("button", { name: "Browse Slack actions" })
      .click();
    await page
      .getByTestId("add-node-panel")
      .getByRole("button")
      .filter({ hasText: SLACK_ACTION_KEY })
      .click();

    // Unconfigured required fields (channel + text) → Needs setup.
    const node = page.locator(ACTION_NODE);
    await expect(node).toBeVisible();
    await expect(node).toHaveAttribute("data-status", "needs_setup");
    await expect(page.getByTestId("needs-setup-badge")).toBeVisible();

    const pill = page.getByTestId("builder-header-validation-pill");
    await expect(pill).toHaveAttribute("data-state", "error");
    await expect(
      page.getByTestId("run-controls-run-manually-button"),
    ).toBeDisabled();
  });

  test("pick channel by visible name + set message — node and header Ready", async () => {
    // Open the action node's config (client onClick → retry through hydration).
    await clickToReveal(page.locator(ACTION_NODE), page.getByTestId("schema-form"));

    await selectChannelByVisibleName(page, smokeSlackChannelName()!);

    message = `ChainReact Slack smoke ${Date.now()}-${Math.floor(
      Math.random() * 10_000,
    )}`;
    await page.locator("#field-text").fill(message);

    // Commit the node config, then close the inspector.
    await page.getByTestId("config-modal-save-button").click();
    await page.getByRole("button", { name: "Close configuration" }).click();

    // Node + header now report Ready (the shared readiness validator recognizes
    // the Slack action's required channel + text as satisfied).
    await expect(page.locator(ACTION_NODE)).toHaveAttribute(
      "data-status",
      "configured",
    );
    const pill = page.getByTestId("builder-header-validation-pill");
    await expect(pill).toHaveAttribute("data-state", "ready");
    await expect(pill).toHaveText("Ready");
    await expect(
      page.getByTestId("run-controls-run-manually-button"),
    ).toBeEnabled();
  });

  test("save, run manually, and the run Succeeds", async () => {
    // Persist the graph.
    const saveBtn = page.getByTestId("builder-header-save-button");
    await expect(saveBtn).toBeEnabled({ timeout: 20_000 });
    await saveBtn.click();
    await expect(page.getByTestId("builder-header-status-pill")).toHaveAttribute(
      "data-status",
      "saved",
      { timeout: 20_000 },
    );

    // Run. Slack send is non-destructive (no confirmation modal expected); if
    // one appears, don't drive it from the smoke.
    const runBtn = page.getByTestId("run-controls-run-manually-button");
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    const modal = page.getByTestId("destructive-action-confirmation-modal");
    if (await modal.isVisible().catch(() => false)) {
      test.skip(true, "Destructive confirmation modal appeared — not driven by smoke.");
    }

    // Enqueue acknowledged in-builder.
    await expect(page.getByTestId("run-now-success")).toBeAttached({
      timeout: 30_000,
    });

    // The run for THIS workflow must reach a Succeeded terminal state. We scope
    // to the row carrying our unique workflow name and assert the succeeded
    // badge specifically — a Failed run fails the smoke.
    await expect
      .poll(
        async () => {
          await page.goto("/runs", { waitUntil: "domcontentloaded" });
          const row = page
            .locator('[data-testid^="runs-row-"]')
            .filter({ hasText: workflowName });
          if ((await row.count()) === 0) return "absent";
          if (
            (await row
              .locator('[data-testid="run-status-badge-succeeded"]')
              .count()) > 0
          ) {
            return "succeeded";
          }
          if (
            (await row
              .locator('[data-testid="run-status-badge-failed"]')
              .count()) > 0
          ) {
            return "failed";
          }
          return "running";
        },
        { timeout: 90_000, intervals: [3_000, 5_000, 5_000, 5_000] },
      )
      .toBe("succeeded");
  });

  test("verify message in Slack", async () => {
    // Slack-side verification (reading the channel for the posted message)
    // would require Slack API credentials the smoke harness deliberately does
    // NOT hold — adding them would broaden scope and risk leaking a token.
    // ChainReact-side success above (chat.postMessage returned ok) is the
    // acceptance signal; direct Slack inspection is intentionally out of scope.
    test.skip(
      true,
      "Slack-side verification requires Slack API creds not held by the smoke; run success is the acceptance signal.",
    );
  });

  test("cleanup — delete the smoke workflow; it leaves the list", async () => {
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
    // Safety net: remove the smoke workflow if a mid-chain failure left it
    // behind. Best-effort + prefix-guarded; never touches anything else.
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
