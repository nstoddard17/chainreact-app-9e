/**
 * BUILDER-RESPONSIVE-LAYOUT-1 — real-browser viewport verification.
 *
 * Drives the PUBLIC builder route (/start — the anonymous local-only builder,
 * which mounts the real WorkflowBuilder / BuilderShell / rail / canvas / config
 * drawer) at every viewport the owner named, and measures REAL PIXELS.
 *
 * Deliberately does NOT need auth or a database, which is why it can run while
 * loopback Supabase is unavailable. What it therefore cannot reach is called out
 * in the report: the authenticated header action cluster (Save / Test / Activate
 * / overflow) is replaced by a sign-up CTA on this route.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3218";
const OUT = "C:/tmp/brl1-wt/owner-review/builder-responsive-layout";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { width: 1440, height: 900, name: "1440x900-desktop", tier: "wide" },
  { width: 1280, height: 800, name: "1280x800-laptop", tier: "wide" },
  { width: 1024, height: 768, name: "1024x768-small-laptop", tier: "medium" },
  { width: 900, height: 700, name: "900x700-short-window", tier: "medium" },
  { width: 820, height: 1180, name: "820x1180-tablet", tier: "narrow" },
  { width: 768, height: 1024, name: "768x1024-tablet", tier: "narrow" },
  { width: 390, height: 844, name: "390x844-phone", tier: "narrow" },
];

const results = [];
let failures = 0;

function check(vp, label, ok, detail) {
  results.push({ vp: vp.name, label, ok, detail });
  if (!ok) failures += 1;
}

async function overflow(page) {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

async function box(page, selector) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  return el.boundingBox();
}

const browser = await chromium.launch();
const page = await browser.newPage();

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(`${BASE}/start`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="builder-shell"]', { timeout: 60000 });
  // The layout mode resolves during hydration (getServerSnapshot is `wide`), so
  // wait for the header density to actually settle before measuring anything.
  // Reading mid-hydration yields a mix of server and client values.
  const expectDensity =
    vp.tier === "wide" ? "full" : vp.tier === "medium" ? "compact" : "minimal";
  await page
    .waitForFunction(
      (d) =>
        document
          .querySelector('[data-testid="builder-header"]')
          ?.getAttribute("data-density") === d,
      expectDensity,
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);

  // 1. No page-level horizontal scrollbar.
  const ox = await overflow(page);
  check(vp, "no horizontal page overflow", ox <= 1, `overflow=${ox}px`);

  // 2. Resolved tier: header density is the observable proxy for the layout mode.
  const density = await page
    .locator('[data-testid="builder-header"]')
    .getAttribute("data-density");
  const expectedDensity =
    vp.tier === "wide" ? "full" : vp.tier === "medium" ? "compact" : "minimal";
  check(vp, `header density = ${expectedDensity}`, density === expectedDensity, `got ${density}`);

  // 3. Rail presentation matches the tier, and takes no canvas width as a sheet.
  const railPres = await page
    .locator('[data-testid="builder-left-agent-rail"]')
    .getAttribute("data-presentation");
  const expectedRail = vp.tier === "narrow" ? "overlay" : "panel";
  check(vp, `rail presentation = ${expectedRail}`, railPres === expectedRail, `got ${railPres}`);

  // 4. Header is not a tall stack.
  const hb = await box(page, '[data-testid="builder-header"]');
  check(vp, "header height <= 90px", hb && hb.height <= 90, `h=${hb?.height}`);

  // 5. Canvas is the dominant surface, with real height.
  const cb = await box(page, '[data-testid="workflow-canvas"]');
  check(
    vp,
    "canvas width > 50% of viewport",
    cb && cb.width > vp.width * 0.5,
    `canvas=${cb?.width} of ${vp.width}`,
  );
  check(vp, "canvas height > 120px", cb && cb.height > 120, `h=${cb?.height}`);
  check(
    vp,
    "canvas bottom inside viewport (no clipped controls)",
    cb && cb.y + cb.height <= vp.height + 1,
    `bottom=${cb ? cb.y + cb.height : "?"} vs ${vp.height}`,
  );

  // 6. Canvas zoom / fit controls fully inside the viewport.
  const zb = await box(page, ".react-flow__controls");
  check(
    vp,
    "zoom controls fully inside viewport",
    zb &&
      zb.x >= -1 &&
      zb.y >= -1 &&
      zb.x + zb.width <= vp.width + 1 &&
      zb.y + zb.height <= vp.height + 1,
    zb ? `x=${zb.x} y=${zb.y} w=${zb.width} h=${zb.height}` : "absent",
  );

  // 7. In-flow rail must sit BESIDE the canvas; a sheet is allowed to overlap.
  const rb = await box(page, '[data-testid="builder-left-agent-rail"]');
  if (vp.tier !== "narrow" && rb && cb) {
    check(
      vp,
      "in-flow rail does not overlap the canvas",
      rb.x + rb.width <= cb.x + 1,
      `railRight=${rb.x + rb.width} canvasLeft=${cb.x}`,
    );
    const expectedWidth = vp.tier === "medium" ? 272 : 320;
    check(
      vp,
      `expanded rail width = ${expectedWidth}px`,
      Math.abs(rb.width - expectedWidth) <= 2,
      `got ${rb.width}`,
    );
  }

  // 8. Section tabs: own row at narrow, still all reachable.
  const tabRow = await page.locator('[data-testid="builder-header-tab-row"]').count();
  check(
    vp,
    vp.tier === "narrow" ? "tabs on their own row" : "tabs inline in header",
    vp.tier === "narrow" ? tabRow === 1 : tabRow === 0,
    `tabRow=${tabRow}`,
  );
  const tabCount = await page.locator('[role="tab"]').count();
  check(vp, "all 5 section tabs present", tabCount === 5, `tabs=${tabCount}`);

  await page.screenshot({ path: `${OUT}/${vp.name}-01-canvas.png` });

  // 9. Collapse the rail → the canvas gets the width back (in-flow tiers).
  const collapse = page.locator('[data-testid="builder-left-agent-rail-collapse"]');
  if ((await collapse.count()) > 0 && (await collapse.isVisible())) {
    await collapse.click();
    await page.waitForTimeout(350);
    const cb2 = await box(page, '[data-testid="workflow-canvas"]');
    if (vp.tier !== "narrow") {
      check(
        vp,
        "collapsing the rail widens the canvas",
        cb2 && cb && cb2.width > cb.width,
        `${cb?.width} -> ${cb2?.width}`,
      );
    } else {
      check(
        vp,
        "closing the rail sheet leaves the canvas full width",
        cb2 && Math.abs(cb2.width - vp.width) <= 2,
        `canvas=${cb2?.width} of ${vp.width}`,
      );
    }
    check(vp, "no overflow with rail closed", (await overflow(page)) <= 1, "");

    // On narrow there must be NO spine eating width; the header toggle reopens.
    const spine = await page
      .locator('[data-testid="builder-left-agent-rail-expand"]')
      .count();
    check(
      vp,
      vp.tier === "narrow" ? "no spine on narrow" : "spine present on in-flow tiers",
      vp.tier === "narrow" ? spine === 0 : spine === 1,
      `spine=${spine}`,
    );

    await page.screenshot({ path: `${OUT}/${vp.name}-02-rail-closed.png` });

    // Reopen via the header toggle.
    await page.locator('[data-testid="builder-header-left-rail-toggle"]').click();
    await page
      .waitForFunction(
        () =>
          document
            .querySelector('[data-testid="builder-left-agent-rail"]')
            ?.getAttribute("data-collapsed") === "false",
        undefined,
        { timeout: 10000 },
      )
      .catch(() => {});
    await page.waitForTimeout(300);
    const reopened = await page
      .locator('[data-testid="builder-left-agent-rail"]')
      .getAttribute("data-collapsed");
    check(vp, "rail reopens from the header toggle", reopened === "false", `collapsed=${reopened}`);
  }

  // 10. Rail as a sheet: scrim present, Escape closes, canvas underneath.
  if (vp.tier === "narrow") {
    // The rail's collapsed state PERSISTS in localStorage (useLeftAgentRail —
    // an explicitly hidden rail must not reappear on every navigation), so after
    // an earlier viewport closed it this page loads with it closed. Open it
    // through the header toggle the way a user would before measuring the sheet.
    if (
      (await page
        .locator('[data-testid="builder-left-agent-rail"]')
        .getAttribute("data-collapsed")) === "true"
    ) {
      await page.locator('[data-testid="builder-header-left-rail-toggle"]').click();
      await page
        .waitForFunction(
          () =>
            document
              .querySelector('[data-testid="builder-left-agent-rail"]')
              ?.getAttribute("data-collapsed") === "false",
          undefined,
          { timeout: 10000 },
        )
        .catch(() => {});
      await page.waitForTimeout(300);
      check(
        vp,
        "rail sheet opens from the header toggle after a persisted close",
        (await page
          .locator('[data-testid="builder-left-agent-rail"]')
          .getAttribute("data-collapsed")) === "false",
        "",
      );
    }
    const scrim = await page.locator('[data-testid="builder-overlay-scrim"]').count();
    check(vp, "open rail sheet has exactly one scrim", scrim === 1, `scrim=${scrim}`);
    const sheetBox = await box(page, '[data-testid="builder-left-agent-rail"]');
    check(
      vp,
      "rail sheet leaves some canvas visible",
      sheetBox && sheetBox.width < vp.width,
      `sheet=${sheetBox?.width} of ${vp.width}`,
    );
    check(
      vp,
      "rail sheet is fully inside the viewport",
      sheetBox && sheetBox.x >= -1 && sheetBox.x + sheetBox.width <= vp.width + 1,
      `x=${sheetBox?.x} w=${sheetBox?.width}`,
    );
    await page.screenshot({ path: `${OUT}/${vp.name}-03-rail-sheet.png` });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const afterEsc = await page
      .locator('[data-testid="builder-left-agent-rail"]')
      .getAttribute("data-collapsed");
    check(vp, "Escape closes the rail sheet", afterEsc === "true", `collapsed=${afterEsc}`);
    check(vp, "scrim gone after Escape", (await page.locator('[data-testid="builder-overlay-scrim"]').count()) === 0, "");
  }

  // 11. Config surface: add a trigger, select the node, open config.
  //
  // First make sure no agent sheet is covering the canvas. On narrow tiers the
  // rail is a MODAL sheet, so it correctly intercepts pointer events over the
  // canvas — that is the product behaviour, and the script has to respect it
  // exactly as a user would (close the sheet, then work on the canvas).
  const railCollapsed = await page
    .locator('[data-testid="builder-left-agent-rail"]')
    .getAttribute("data-collapsed");
  if (railCollapsed === "false" && vp.tier === "narrow") {
    await page.locator('[data-testid="builder-header-left-rail-toggle"]').click();
    await page.waitForTimeout(350);
    check(
      vp,
      "agent sheet closes to hand the canvas back",
      (await page
        .locator('[data-testid="builder-left-agent-rail"]')
        .getAttribute("data-collapsed")) === "true",
      "",
    );
  }

  const emptyAdd = page.locator('[data-testid="empty-canvas-add-trigger"]');
  const addTrigger =
    (await emptyAdd.count()) > 0
      ? emptyAdd
      : page.getByRole("button", { name: /choose a trigger|add a trigger/i });
  if ((await addTrigger.count()) > 0 && (await addTrigger.first().isVisible())) {
    try {
      await addTrigger.first().click({ timeout: 8000 });
      await page.waitForTimeout(600);
      const provider = page.locator('[data-testid^="picker-provider-"]').first();
      if ((await provider.count()) > 0) {
        await provider.click({ timeout: 8000 });
        await page.waitForTimeout(600);
        const item = page.locator('[data-testid^="picker-item-"]').first();
        if ((await item.count()) > 0) {
          await item.click({ timeout: 8000 });
          await page.waitForTimeout(1000);
        }
      }
    } catch (err) {
      check(vp, "add-trigger flow reachable on the canvas", false, String(err).slice(0, 160));
    }
    // Close the picker if it's still open.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  const node = page.locator('[data-testid="workflow-node-view"]').first();
  if ((await node.count()) > 0) {
    await node.click();
    await page.waitForTimeout(500);
    const drawer = page.locator('[data-testid="builder-right-drawer"]');
    if ((await drawer.count()) > 0) {
      const pres = await drawer.getAttribute("data-presentation");
      const expectedCfg = vp.tier === "wide" ? "panel" : "overlay";
      check(vp, `config presentation = ${expectedCfg}`, pres === expectedCfg, `got ${pres}`);
      check(vp, "no overflow with config open", (await overflow(page)) <= 1, "");

      const db = await drawer.boundingBox();
      check(
        vp,
        "config surface fully inside the viewport",
        db && db.x >= -1 && db.x + db.width <= vp.width + 1,
        `x=${db?.x} w=${db?.width}`,
      );

      const cb3 = await box(page, '[data-testid="workflow-canvas"]');
      check(
        vp,
        "canvas not reduced below 300px by config",
        cb3 && cb3.width >= 300,
        `canvas=${cb3?.width}`,
      );

      const close = drawer.locator('button[aria-label="Close drawer"]');
      const clb = await close.boundingBox();
      check(
        vp,
        "config close button fully inside the viewport",
        clb && clb.x >= -1 && clb.x + clb.width <= vp.width + 1 && clb.y + clb.height <= vp.height + 1,
        clb ? `x=${clb.x} y=${clb.y}` : "absent",
      );

      // Node card readability.
      const nb = await node.boundingBox();
      check(vp, "node card width > 120px", nb && nb.width > 120, `node=${nb?.width}`);

      await page.screenshot({ path: `${OUT}/${vp.name}-04-config-open.png` });

      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
      check(
        vp,
        "Escape closes config",
        (await page.locator('[data-testid="builder-right-drawer"]').count()) === 0,
        "",
      );
      check(vp, "no overflow after config close", (await overflow(page)) <= 1, "");
    }
  }
}

await browser.close();

// ── report ───────────────────────────────────────────────────────────────────
const byVp = new Map();
for (const r of results) {
  if (!byVp.has(r.vp)) byVp.set(r.vp, []);
  byVp.get(r.vp).push(r);
}
for (const [vp, rows] of byVp) {
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${vp}  ${bad.length === 0 ? "PASS" : `FAIL (${bad.length})`}  [${rows.length} checks]`);
  for (const r of rows) {
    if (!r.ok) console.log(`   x ${r.label}  — ${r.detail}`);
  }
}
console.log(`\nTOTAL: ${results.length} checks, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
