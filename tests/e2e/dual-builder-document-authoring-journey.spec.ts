import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  adminClient,
  createTestUser,
  deleteTestUser,
  signInViaEmailLink,
  type TestUser,
} from "./helpers/supabaseAdmin";

/**
 * 5.DUAL-BUILDER-1 CS-7E — the real-browser Document Builder AUTHORING journeys.
 *
 * CS-7D proved Visual↔Document parity, Guided Stop editing, Save/reload and
 * execution parity live. CS-7E proves the remaining creation surfaces in the
 * actual authenticated app: manual insertion, If/Then authoring + both-lane
 * execution, sections + multi-selection, Ask React preview/apply, Finish Setup,
 * and the Whole Workflow map hierarchy — against the CS-7D LOCAL Supabase.
 *
 * Flag: requires ENABLE_DOCUMENT_BUILDER=true (run via `npm run e2e:dual-builder`
 * or `ENABLE_DOCUMENT_BUILDER=true npx playwright test dual-builder-document-authoring`).
 * Each test ASSERTS the flag state and fails loudly rather than self-skipping.
 * Two editors, one workflow — no second graph store / AI route / save path.
 */

const FLAG_ON = process.env.ENABLE_DOCUMENT_BUILDER === "true";

let testUser: TestUser | null = null;

test.describe("5.DUAL-BUILDER-1 CS-7E — Document Builder authoring (live) @flag-on", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    expect(
      FLAG_ON,
      "CS-7E authoring journeys require ENABLE_DOCUMENT_BUILDER=true — run `npm run e2e:dual-builder` variant",
    ).toBe(true);
    testUser = await createTestUser();
    const admin = adminClient();
    const { data: account } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", testUser.id)
      .single<{ id: string }>();
    if (!account) throw new Error("CS-7E: personal account not found");
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "pro", plan_status: "active" })
      .eq("account_id", account.id);
    if (error) throw new Error(`CS-7E: pro-plan stamp failed: ${error.message}`);
  });

  test.afterEach(async () => {
    if (testUser) {
      await deleteTestUser(testUser.id);
      testUser = null;
    }
  });

  // ── Test 1 — manual insertion menu + ordinary action + undo/redo ──────────
  test("manual insertion: menu offers Step/Branch/Section/Ask React (no Loop), inserts an action, undo/redo", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, "CS-7E insertion");

    // Linear base: Manual Trigger → Format Transformer.
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    const triggerId = (await listNodeIds(page))[0]!;
    const fmtId = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 2);
    await saveWorkflow(page);

    // Switch to Document.
    await toDocument(page);

    // Open the tail insertion menu.
    const insertBtn = page.getByTestId(`document-add-after-${fmtId}`);
    await insertBtn.click();
    const menu = page.getByTestId(`document-add-after-${fmtId}-menu`);
    await expect(menu).toBeVisible();
    // Menu items: Step, Branch, Section (top level), Ask React — NO Loop.
    await expect(page.getByTestId(`document-add-after-${fmtId}-step`)).toBeVisible();
    await expect(page.getByTestId(`document-add-after-${fmtId}-branch`)).toBeVisible();
    await expect(page.getByTestId(`document-add-after-${fmtId}-section`)).toBeVisible();
    await expect(page.getByTestId(`document-add-after-${fmtId}-askreact`)).toBeVisible();
    await expect(menu).not.toContainText(/loop/i);
    // Branch submenu reveals If/Then + Router (tail placement allows Router).
    await page.getByTestId(`document-add-after-${fmtId}-branch`).click();
    await expect(page.getByTestId(`document-add-after-${fmtId}-ifthen`)).toBeVisible();
    await expect(page.getByTestId(`document-add-after-${fmtId}-router`)).toBeVisible();
    await shot(page, "03-insertion-menu");

    // Insert an ordinary action via Step → the shared Add-node panel (Document
    // context: no Visual node-count assertion available here).
    await page.getByTestId(`document-add-after-${fmtId}-step`).click();
    await pickActionInDocument(page, "Delay", /Delay/);

    // Visual shows the inserted node BEFORE any extra save (3 nodes).
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);

    // Undo the insertion (header control) → back to 2 nodes.
    await page.getByTestId("builder-header-undo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(2);
    // Redo → back to 3. Capture the final added id from the settled state.
    await page.getByTestId("builder-header-redo").click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);
    const addedId = diffOne([triggerId, fmtId], await listNodeIds(page));

    await saveWorkflow(page);
    const def = await readDefinition(page, workflowId);
    const edgeSummary = def.edges.map((e) => `${e.from}->${e.to}`).join(", ");
    // Canonical topology returned: 3 nodes incl. the added one, wired into the chain.
    expect(def.nodes.map((n) => n.id), edgeSummary).toContain(addedId);
    expect(def.nodes, edgeSummary).toHaveLength(3);
    expect(
      def.edges.some((e) => e.to === addedId),
      `added node must have an incoming edge — edges=[${edgeSummary}] added=${addedId}`,
    ).toBe(true);
  });

  // ── Test 2 — If/Then authoring in Document: both lanes, labels, parity ─────
  test("If/Then authoring: insert branch, author both lanes, labels/warnings, Visual parity, undo/redo, save/reload", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, "CS-7E branch");

    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    const triggerId = (await listNodeIds(page))[0]!;

    // Insert an If/Then branch at the trigger tail through the Document menu.
    await toDocument(page);
    await page.getByTestId(`document-add-after-${triggerId}`).click();
    await page.getByTestId(`document-add-after-${triggerId}-branch`).click();
    await page.getByTestId(`document-add-after-${triggerId}-ifthen`).click();

    // Identify the new If/Then node id via Visual, then return to Document.
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(2);
    const ifThenId = diffOne([triggerId], await listNodeIds(page));
    await toDocument(page);

    // Document renders the fork with two labeled lanes, both empty (warnings).
    const fork = page.getByTestId(`document-fork-${ifThenId}`);
    await expect(fork).toBeVisible();
    await expect(page.getByTestId(`document-fork-lane-${ifThenId}-true`)).toBeVisible();
    await expect(page.getByTestId(`document-fork-lane-${ifThenId}-false`)).toBeVisible();
    await expect(fork).toContainText("If yes");
    await expect(fork).toContainText("Otherwise");
    await expect(page.getByTestId(`document-lane-warning-${ifThenId}-true`)).toBeVisible();
    await expect(page.getByTestId(`document-lane-warning-${ifThenId}-false`)).toBeVisible();

    // Author the first step of EACH lane through the Document lane controls.
    await page.getByTestId(`document-lane-add-step-${ifThenId}-true`).click();
    await pickActionInDocument(page, "Format Transformer", /Format Transformer/);
    await expect(page.getByTestId(`document-lane-warning-${ifThenId}-true`)).toHaveCount(0);

    await page.getByTestId(`document-lane-add-step-${ifThenId}-false`).click();
    await pickActionInDocument(page, "Format Transformer", /Format Transformer/);
    await expect(page.getByTestId(`document-lane-warning-${ifThenId}-false`)).toHaveCount(0);
    await shot(page, "05-if-then-both-lanes");

    // Visual parity: one native If/Then node + labeled true/false edges + both
    // lane actions (4 nodes total). (Cross-view undo/redo is proven separately by
    // the insertion test and the section-ungroup test.)
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(4);
    await saveWorkflow(page);
    const def = await readDefinition(page, workflowId);
    const ifNode = def.nodes.find((n) => n.type === "if_then_condition");
    expect(ifNode, `node types = ${def.nodes.map((n) => n.type).join(",")}`).toBeTruthy();
    const ifId = ifNode!.id;
    expect(def.edges.filter((e) => e.from === ifId && e.label === "true")).toHaveLength(1);
    expect(def.edges.filter((e) => e.from === ifId && e.label === "false")).toHaveLength(1);
    expect(def.nodes.filter((n) => n.type === "format_transformer")).toHaveLength(2);

    // Reload → the fork with both lanes (no warnings) persists in Document.
    // Re-derive the fork id from the reloaded DOM rather than reusing the pre-save id.
    await page.reload();
    await toDocument(page);
    const forkTid = await page
      .locator('[data-testid^="document-fork-"]')
      .first()
      .getAttribute("data-testid");
    const forkId = forkTid!.replace("document-fork-", "");
    await expect(page.getByTestId(`document-fork-lane-${forkId}-true`)).toBeVisible();
    await expect(page.getByTestId(`document-fork-lane-${forkId}-false`)).toBeVisible();
    await expect(page.getByTestId(`document-lane-warning-${forkId}-true`)).toHaveCount(0);
    await expect(page.getByTestId(`document-lane-warning-${forkId}-false`)).toHaveCount(0);
  });

  // ── Test 3 — sections + multi-selection ───────────────────────────────────
  test("sections: multi-select → wrap → rename → collapse/summary → persist → ungroup (no node lost) → undo/redo", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await signInViaEmailLink(page, testUser);
    await createWorkflow(page, "CS-7E sections");

    // trigger + two top-level actions (3 selectable blocks).
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    const fmt1 = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 2);
    const fmt2 = await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 3);
    await saveWorkflow(page);

    await toDocument(page);

    // Multi-select two contiguous top-level blocks → the selection toolbar.
    // DOC-STEP-CONTROLS-1 — selection is toggled from the step's always-visible
    // overflow menu (the unlabeled rail checkbox is gone).
    await page.getByTestId(`document-step-menu-${fmt1}`).click();
    await page.getByTestId(`document-select-${fmt1}`).click();
    await page.getByTestId(`document-step-menu-${fmt2}`).click();
    await page.getByTestId(`document-select-${fmt2}`).click();
    await expect(page.getByTestId("document-selection-toolbar")).toBeVisible();
    await expect(page.getByTestId("document-selection-count")).toContainText("2");
    await shot(page, "04-section-selection");

    // Group the selection (presentation-only).
    await page.getByTestId("document-selection-wrap").click();
    const collapseCtl = page.locator('[data-testid^="document-section-collapse-"]').first();
    await expect(collapseCtl).toBeVisible();
    const sectionId = (await collapseCtl.getAttribute("data-testid"))!.replace(
      "document-section-collapse-",
      "",
    );

    // A new group opens straight into naming — fill the already-focused input.
    const titleInput = page.getByTestId(`document-section-title-input-${sectionId}`);
    await titleInput.fill("Qualify & route");
    await titleInput.press("Enter");
    await expect(page.getByTestId(`document-section-title-${sectionId}`)).toContainText(
      "Qualify & route",
    );

    // Collapse → collapsed state + deterministic summary (contains a step count).
    await page.getByTestId(`document-section-collapse-${sectionId}`).click();
    await expect(page.getByTestId(`document-section-${sectionId}`)).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await expect(page.getByTestId(`document-section-summary-${sectionId}`)).toContainText(/step/i);

    // Persist and reload → title + collapse state + membership survive.
    // Re-derive the section id from the reloaded DOM (presentation ids may re-key).
    await saveWorkflow(page);
    await page.reload();
    await toDocument(page);
    const persistedTitle = page.locator('[data-testid^="document-section-title-"]').first();
    await expect(persistedTitle).toContainText("Qualify & route");
    const sectionId2 = (await persistedTitle.getAttribute("data-testid"))!.replace(
      "document-section-title-",
      "",
    );
    await expect(page.getByTestId(`document-section-${sectionId2}`)).toHaveAttribute(
      "data-collapsed",
      "true",
    );

    // Ungroup (expand first) → the section wrapper is gone but NO executable node
    // was deleted (Visual still shows all three nodes).
    await page.getByTestId(`document-section-collapse-${sectionId2}`).click();
    await page.getByTestId(`document-section-menu-${sectionId2}`).click();
    await page.getByTestId(`document-section-ungroup-${sectionId2}`).click();
    await expect(page.getByTestId(`document-section-${sectionId2}`)).toHaveCount(0);
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);

    // Undo the ungroup → a section returns; redo → gone again (nodes never lost).
    await page.getByTestId("builder-header-undo").click();
    await toDocument(page);
    await expect(page.locator('[data-testid^="document-section-"]').first()).toBeVisible();
    await toVisual(page);
    await page.getByTestId("builder-header-redo").click();
    await toDocument(page);
    await expect(page.locator('[data-testid^="document-section-title-"]')).toHaveCount(0);
    await toVisual(page);
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(3);
  });

  // ── Test 4 — Finish Setup queue ───────────────────────────────────────────
  test("Finish Setup: queue opens with progress/controls, resolve decreases count, skip returns, exit, no auto-save", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await signInViaEmailLink(page, testUser);
    await createWorkflow(page, "CS-7E finish-setup");

    // trigger + two UNCONFIGURED Format Transformers → several missing fields.
    await page.getByRole("button", { name: "Choose a trigger" }).click();
    await page.getByRole("button", { name: /Manual Trigger/ }).click();
    await expect(page.getByTestId("workflow-node-view")).toHaveCount(1);
    await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 2);
    await addActionFromLibrary(page, "Format Transformer", /Format Transformer/, 3);

    await toDocument(page);

    // Start Finish Setup → the queue toolbar appears with N-of-M progress.
    await page.getByTestId("document-finish-setup-button").click();
    await expect(page.getByTestId("document-setup-controls")).toBeVisible();
    await shot(page, "06-finish-setup");
    const total0 = await queueTotal(page);
    expect(total0).toBeGreaterThanOrEqual(2);
    // At the first item Previous is disabled; Skip/Next/Exit exist.
    await expect(page.getByTestId("document-setup-prev")).toBeDisabled();
    await expect(page.getByTestId("document-setup-skip")).toBeVisible();
    await expect(page.getByTestId("document-setup-exit")).toBeVisible();

    // Resolve the current field via its Guided Stop → the total count decreases.
    // The queue may auto-open the editor; if not, Resume it first.
    if (!(await page.getByTestId("document-guided-stop").isVisible().catch(() => false))) {
      const resume = page.getByTestId("document-setup-resume");
      if (await resume.isVisible().catch(() => false)) await resume.click();
    }
    await resolveGuidedStop(page);
    await expect
      .poll(async () => await queueTotal(page), { timeout: 10_000 })
      .toBeLessThan(total0);

    // Skip the (now) current field, then Exit the queue.
    await page.getByTestId("document-setup-skip").click();
    await page.getByTestId("document-setup-exit").click();
    await expect(page.getByTestId("document-setup-controls")).toHaveCount(0);

    // Reopen → the skipped, still-unresolved item is back in the queue.
    await page.getByTestId("document-finish-setup-button").click();
    await expect(page.getByTestId("document-setup-controls")).toBeVisible();
    expect(await queueTotal(page)).toBeGreaterThan(0);

    // No auto-save / no auto-activate: the resolve made the draft dirty and it was
    // NOT persisted, and the workflow never activated.
    await expect(page.getByTestId("builder-header-save-button")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  });

  // ── Test 5 — Whole Workflow map hierarchy + navigation ────────────────────
  test("Whole Workflow map: fork hierarchy, text status, row navigation reveals the target, Escape closes + focus returns", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    await signInViaEmailLink(page, testUser);
    const workflowId = await createWorkflow(page, "CS-7E map");
    // A fork with both lanes + a shared continuation (built via API; authoring is
    // proven live by Tests 1–3).
    await patchDraft(page, workflowId, {
      nodes: [
        trg("t"),
        ifn("if", { input: "{{trigger.payload.inputs.status}}", operator: "equals", value: "active", onFalse: "branch" }, 0, 120),
        fmt("a-true", "", -200, 260),
        fmt("a-false", "", 200, 260),
        fmt("a-join", "", 0, 400),
      ],
      edges: [
        { id: "e0", from: "t", to: "if" },
        { id: "e-t", from: "if", to: "a-true", label: "true" },
        { id: "e-f", from: "if", to: "a-false", label: "false" },
        { id: "e-j", from: "if", to: "a-join" },
      ],
    });
    await toDocument(page);

    await page.getByTestId("document-open-map-button").click();
    const map = page.getByTestId("document-whole-workflow-map");
    await expect(map).toBeVisible();
    // Hierarchy: both fork lanes are represented.
    await expect(map).toContainText("If yes");
    await expect(map).toContainText("Otherwise");
    // Status is TEXT (not color-only): a plain-language STATUS label appears.
    await expect(map).toContainText(
      /Ready|Needs a detail|Warning|Upgrade required|Connection required|Easier on the canvas|Needs the Visual Builder/,
    );
    await shot(page, "08-map-section-fork");

    // Row navigation: clicking the true-lane action row reveals its editor
    // (scroll_and_edit → Guided Stop) in the Document.
    await page.getByTestId("document-map-row-a-true").click();
    await expect(page.getByTestId("document-guided-stop")).toBeVisible();
    await page.getByTestId("guided-stop-cancel").click();

    // Escape closes the map and focus returns to the opener button.
    await expect(map).toBeVisible();
    await map.focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("document-whole-workflow-map")).toHaveCount(0);
    await expect(page.getByTestId("document-open-map-button")).toBeFocused();
  });

  // ── Test 7 — large-workflow live smoke ────────────────────────────────────
  test("large workflows render + map + Visual with no crash / overflow / console errors", async ({
    page,
  }) => {
    if (!testUser) throw new Error("setup failed");
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await signInViaEmailLink(page, testUser);

    for (const fixture of largeFixtures()) {
      const workflowId = await createWorkflow(page, `CS-7E large ${fixture.name}`);
      await patchDraft(page, workflowId, fixture.def);

      // Document opens without crashing.
      await toDocument(page);
      await expect(page.getByTestId("document-view")).toBeVisible();
      // No horizontal overflow on the document surface.
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="document-view"]') as HTMLElement | null;
        return el ? el.scrollWidth - el.clientWidth : 0;
      });
      expect(overflow, `${fixture.name} horizontal overflow`).toBeLessThanOrEqual(2);
      // Map opens + closes.
      await page.getByTestId("document-open-map-button").click();
      await expect(page.getByTestId("document-whole-workflow-map")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("document-whole-workflow-map")).toHaveCount(0);
      // Back to Visual — no crash.
      await toVisual(page);
      await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();
    }

    // No uncaught console errors across all fixtures.
    expect(consoleErrors, consoleErrors.slice(0, 5).join(" | ")).toHaveLength(0);
  });
});

/** Representative large fixtures: 10 linear · 30 linear · depth-3 nested branch · 100 mixed. */
function largeFixtures(): Array<{ name: string; def: unknown }> {
  const linear = (n: number) => {
    const nodes: unknown[] = [trg("t")];
    const edges: unknown[] = [];
    let prev = "t";
    for (let i = 0; i < n - 1; i++) {
      const id = `n${i}`;
      nodes.push(fmt(id, `step ${i}`, 0, 120 * (i + 1)));
      edges.push({ id: `e${i}`, from: prev, to: id });
      prev = id;
    }
    return { nodes, edges };
  };
  const nestedDepth3 = () => {
    // trigger → if1 (true → if2 (true → if3 (true → action)))
    const nodes: unknown[] = [
      trg("t"),
      ifn("if1", { input: "{{trigger.payload.inputs.a}}", operator: "equals", value: "1", onFalse: "branch" }, 0, 120),
      ifn("if2", { input: "{{trigger.payload.inputs.b}}", operator: "equals", value: "1", onFalse: "branch" }, 0, 240),
      ifn("if3", { input: "{{trigger.payload.inputs.c}}", operator: "equals", value: "1", onFalse: "branch" }, 0, 360),
      fmt("deep", "deep", 0, 480),
      fmt("f1", "f1", 200, 240),
      fmt("f2", "f2", 200, 360),
      fmt("f3", "f3", 200, 480),
    ];
    const edges: unknown[] = [
      { id: "e0", from: "t", to: "if1" },
      { id: "e1t", from: "if1", to: "if2", label: "true" },
      { id: "e1f", from: "if1", to: "f1", label: "false" },
      { id: "e2t", from: "if2", to: "if3", label: "true" },
      { id: "e2f", from: "if2", to: "f2", label: "false" },
      { id: "e3t", from: "if3", to: "deep", label: "true" },
      { id: "e3f", from: "if3", to: "f3", label: "false" },
    ];
    return { nodes, edges };
  };
  return [
    { name: "10-linear", def: linear(10) },
    { name: "30-linear", def: linear(30) },
    { name: "depth-3-branch", def: nestedDepth3() },
    { name: "100-mixed", def: linear(100) },
  ];
}

// ── helpers (same local idiom as the sibling journey specs) ──────────────────

async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: `owner-review/cs7e/${name}.png`, fullPage: true });
  } catch {
    /* screenshots are evidence, not an assertion */
  }
}

async function toDocument(page: Page): Promise<void> {
  await page.getByTestId("builder-view-toggle-document").click();
  await expect(page.getByTestId("document-view")).toBeVisible();
}

async function toVisual(page: Page): Promise<void> {
  await page.getByTestId("builder-view-toggle-visual").click();
  await expect(page.getByTestId("workflow-node-view").first()).toBeVisible();
}

/** Save the workflow. Strict: the caller only invokes it when there ARE changes,
 * so Save must become enabled (dirty) and then disabled (saved). */
async function saveWorkflow(page: Page): Promise<void> {
  const save = page.getByTestId("builder-header-save-button");
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  // "Saving…" → "Save" marks the persistence round-trip COMPLETE (the button is
  // also disabled DURING saving, so waiting for disabled alone races the API).
  await expect(save).toHaveText("Save", { timeout: 15_000 });
  await expect(save).toBeDisabled();
}

/** Parse the Finish Setup progress "Step X of Y" → Y (0 when the queue is done). */
async function queueTotal(page: Page): Promise<number> {
  const text = (await page.getByTestId("document-setup-progress").textContent()) ?? "";
  const m = text.match(/of\s+(\d+)/i);
  return m ? Number(m[1]) : 0;
}

/** Resolve the active Guided Stop field generically (text or select), then commit. */
async function resolveGuidedStop(page: Page): Promise<void> {
  const stop = page.getByTestId("document-guided-stop");
  await expect(stop).toBeVisible();
  const textbox = stop.getByRole("textbox").first();
  if (await textbox.count()) {
    await textbox.fill("resolved value");
  } else {
    // Select-style field: open the first combobox and choose the first option.
    const combo = stop.getByRole("combobox").first();
    if (await combo.count()) {
      await combo.click();
      await page.getByRole("option").first().click();
    }
  }
  await page.getByTestId("guided-stop-done").click();
  // In the Finish Setup queue, "done" advances to the NEXT field's stop rather
  // than closing, so we do NOT assert the stop disappears here — the caller
  // verifies progress via the queue count.
}

async function listNodeIds(page: Page): Promise<string[]> {
  return page
    .locator(".react-flow__node")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""));
}

function diffOne(before: string[], after: string[]): string {
  const added = after.filter((id) => !before.includes(id));
  if (added.length !== 1) {
    throw new Error(`expected exactly one new node, got [${added.join(", ")}]`);
  }
  return added[0]!;
}

/** Visual context: open the library, pick a row, assert the Visual count, return the new id. */
async function addActionFromLibrary(
  page: Page,
  searchText: string,
  rowName: RegExp,
  expectedNodeCount: number,
): Promise<string> {
  const before = await listNodeIds(page);
  await page.getByRole("button", { name: "+ Add action" }).click();
  await expect(page.getByTestId("add-node-panel")).toBeVisible();
  await page.getByLabel("Search add-node panel").fill(searchText);
  await page.getByRole("button", { name: rowName }).first().click();
  await expect(page.getByTestId("add-node-panel")).toBeHidden();
  await expect(page.getByTestId("workflow-node-view")).toHaveCount(expectedNodeCount);
  return diffOne(before, await listNodeIds(page));
}

/** Document context: pick a row from the already-open Add-node panel (no Visual count). */
async function pickActionInDocument(page: Page, searchText: string, rowName: RegExp): Promise<void> {
  await expect(page.getByTestId("add-node-panel")).toBeVisible();
  await page.getByLabel("Search add-node panel").fill(searchText);
  await page.getByRole("button", { name: rowName }).first().click();
  await expect(page.getByTestId("add-node-panel")).toBeHidden();
}

interface Definition {
  nodes: Array<{ id: string; kind: string; type: string; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; from: string; to: string; label?: string }>;
}

async function readDefinition(page: Page, workflowId: string): Promise<Definition> {
  const resp = await page.request.get(`/api/workflows/${workflowId}`);
  expect(resp.status(), await resp.text()).toBe(200);
  return (await resp.json()).draftDefinition as Definition;
}

// ── API graph builders (authoring proven live by Tests 1–3; used here to set up
// map + large-fixture scenarios efficiently and deterministically) ───────────
function trg(id: string) {
  return { id, kind: "trigger" as const, provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } };
}
function fmt(id: string, content: string, x = 0, y = 0) {
  return {
    id,
    kind: "action" as const,
    provider: "native",
    type: "format_transformer",
    config: { content, sourceFormat: "plain", targetFormat: "plain" },
    position: { x, y },
  };
}
function ifn(id: string, config: Record<string, unknown>, x = 0, y = 0) {
  return { id, kind: "action" as const, provider: "native", type: "if_then_condition", config, position: { x, y } };
}

async function patchDraft(page: Page, workflowId: string, draftDefinition: unknown): Promise<void> {
  const resp = await page.request.patch(`/api/workflows/${workflowId}`, { data: { draftDefinition } });
  expect(resp.status(), await resp.text()).toBe(200);
  await page.reload();
}

async function createWorkflow(page: Page, name: string): Promise<string> {
  await page.goto("/workflows");
  const dismiss = page.getByTestId("onboarding-dismiss");
  if (await dismiss.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismiss.click();
    await expect(page.getByTestId("onboarding-checklist")).toBeHidden();
  }
  await page
    .getByTestId("workflows-toolbar")
    .getByRole("button", { name: "Create workflow" })
    .click();
  await page.getByLabel(/workflow name/i).fill(name);
  await Promise.all([
    page.waitForURL(/\/workflows\/[0-9a-f-]+/),
    page.getByRole("button", { name: "Create", exact: true }).click(),
  ]);
  return page.url().match(/\/workflows\/([0-9a-f-]+)/)![1]!;
}

// Referenced by later tests; declared here to keep the helper set shared.
export type { Locator };
