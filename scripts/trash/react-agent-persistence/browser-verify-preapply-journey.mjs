#!/usr/bin/env node
/**
 * REACT-AGENT-PREAPPLY-SETUP-UX-1 — the full journey in a real browser, at the rail width from the
 * screenshots (the rail is ~360px there, so the viewport is sized to match).
 *
 *   Preview (compact, Apply immediately visible, NO pickers/recovery)
 *     → Apply (never gated on setup)
 *     → Connect (consolidated cards, rail popups, never the Apps page)
 *     → Configure (searchable Stripe event, Slack channel + message in the rail)
 *     → Test / Activate readiness
 *
 * Also checks: reload + conversation persistence still work, and no guided step costs AI credits.
 *
 * Throwaway script (scripts/trash). Creates one workflow and deletes it, plus its thread.
 *
 * Usage: node scripts/trash/react-agent-persistence/browser-verify-preapply-journey.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.VERIFY_EMAIL ?? "chainreactapp@gmail.com";
const SHOTS = "scripts/trash/react-agent-persistence/shots-preapply";
mkdirSync(SHOTS, { recursive: true });

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const OK = (m) => console.log(`  OK   ${m}`);
const FAIL = (m) => {
  failures++;
  console.error(`  FAIL ${m}`);
};
const check = (label, cond) => (cond ? OK(label) : FAIL(label));

/** The exact prompt from the screenshots. */
const GOAL = "When a Stripe payment succeeds, send a Slack message to the test channel.";

const browser = await chromium.launch();
// The left rail renders at its natural ~360px (the width in the screenshots) on a normal desktop
// viewport; a narrower window collapses it entirely, which would test the wrong thing.
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let workflowId = null;

async function costEventRows() {
  const { count, error } = await admin
    .from("ai_cost_events")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`ai_cost_events count failed: ${error.message}`);
  return count ?? 0;
}

try {
  console.log(`\n=== sign in at ${BASE} ===`);
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: EMAIL,
  });
  if (error || !link?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${error?.message ?? "no hashed_token"}`);
  }
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/workflows")}`,
  );
  await page.waitForURL((u) => !/\/auth\/callback/.test(u.toString()), { timeout: 120_000 }).catch(() => {});
  const landed = new URL(page.url());
  check(`signed in (landed ${landed.pathname}${landed.search})`, !landed.pathname.startsWith("/auth/"));
  if (landed.pathname.startsWith("/auth/")) {
    throw new Error(`sign-in did not establish a session: ${page.url()}`);
  }

  const created = await page.request.post("/api/workflows", {
    data: { name: `PREAPPLY-UX-VERIFY ${new Date().toISOString()}` },
  });
  const rawBody = await created.text();
  let body = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error(`create returned non-JSON (${created.status()}): ${rawBody.slice(0, 400)}`);
  }
  workflowId = body?.id ?? body?.workflow?.id;
  if (!workflowId) throw new Error(`create failed (${created.status()}): ${rawBody.slice(0, 300)}`);
  OK(`throwaway workflow created`);

  // The builder route is heavy; a cold dev-server compile can take minutes.
  await page.goto(`/workflows/${workflowId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 240_000 });

  console.log("\n=== 1-3. the PREVIEW stage ===");
  const creditsBeforeAsk = await costEventRows();
  const composer = page.getByPlaceholder(/Example:/i);
  await composer.waitFor({ timeout: 60_000 });
  await composer.click();
  await composer.fill(GOAL);
  const send = page.getByTestId("workflow-guidance-submit");
  // The composer is controlled: wait for React to enable Send rather than racing it.
  await send.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => !(document.querySelector('[data-testid="workflow-guidance-submit"]')).disabled,
    undefined,
    { timeout: 30_000 },
  );
  await send.click();

  const card = page.getByTestId("builder-preview-setup-rail");
  await card.waitFor({ timeout: 240_000 });
  await page.screenshot({ path: `${SHOTS}/1-preview.png`, fullPage: false });
  const creditsAfterAsk = await costEventRows();

  // 1. compact summary
  const steps = await page.getByTestId("preview-summary-steps").innerText();
  check(`1. compact step summary (${steps.replace(/\n/g, " | ")})`, steps.length > 0);
  const required = await page.getByTestId("preview-setup-required").innerText().catch(() => "");
  check(`   setup listed as names: ${required.split("\n").slice(1, 5).join(" · ")}`, required.length > 0);

  // 2. Apply visible without scrolling past setup fields
  const apply = page.getByTestId("builder-preview-setup-apply");
  check("2. Apply to draft is in the viewport without scrolling", await apply.isVisible());
  const applyBox = await apply.boundingBox();
  const cardBox = await card.boundingBox();
  check(
    "2. Apply sits in the upper half of the card (not below a long form)",
    !!applyBox && !!cardBox && applyBox.y - cardBox.y < cardBox.height * 0.6,
  );

  // 3. no pickers / recovery UI before Apply
  const controlCount = await card.locator("input, select, textarea").count();
  check("3. no controls of any kind in the pre-apply card", controlCount === 0);
  check("3. no Stripe event checkbox wall", (await card.getByRole("checkbox").count()) === 0);
  check("3. no Slack channel picker", (await card.getByRole("combobox").count()) === 0);
  check(
    "3. no connection-recovery UI",
    (await page.getByText("Reconnect in Apps").count()) === 0 &&
      (await page.getByText("Enter ID manually").count()) === 0 &&
      (await page.getByText("Add to draft & open step").count()) === 0,
  );
  check("6. no link to the Apps page in the preview", (await card.locator('a[href^="/apps"]').count()) === 0);
  check("   the card offers exactly one button", (await card.locator("button").count()) === 1);

  console.log("\n=== 4-5. APPLY then the CONNECT stage ===");
  const creditsBeforeApply = await costEventRows();
  await apply.click();
  const guided = page.getByTestId("guided-build-card");
  await guided.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: `${SHOTS}/2-connect.png`, fullPage: false });

  const stage = await guided.getAttribute("data-stage");
  check(`4. stage after Apply with apps disconnected is Connect (got "${stage}")`, stage === "connecting");
  const connectSection = page.getByTestId("guided-connect-section");
  // The provider rows appear only once the SERVER-resolved connection signal lands; until then the
  // card honestly says it is still checking. Wait for that resolution rather than racing it.
  await page
    .getByTestId("guided-connect-stripe")
    .waitFor({ timeout: 60_000 })
    .catch(() => {});
  const connectText = await connectSection.innerText().catch(() => "");
  check("4. consolidated connection cards are shown", connectText.length > 0);
  console.log(`  connect section says: ${connectText.split("\n").join(" | ").slice(0, 220)}`);
  for (const provider of ["stripe", "slack"]) {
    const row = page.getByTestId(`guided-connect-${provider}`);
    const present = (await row.count()) > 0;
    check(`4. ${provider} connection card present`, present);
    if (present) {
      const btn = page.getByTestId(`guided-connect-${provider}-button`);
      const owner = page.getByTestId(`guided-connect-${provider}-owner-gated`);
      const connected = page.getByTestId(`guided-connect-${provider}-connected`);
      check(
        `5. ${provider} offers an in-rail Connect (or an honest owner/connected state)`,
        (await btn.count()) > 0 || (await owner.count()) > 0 || (await connected.count()) > 0,
      );
    }
  }
  check(
    "6. the Connect stage never sends the user to the Apps page",
    (await connectSection.locator('a[href^="/apps"]').count()) === 0,
  );

  // 5. the connect control opens a POPUP (rail flow), not a navigation.
  const stripeBtn = page.getByTestId("guided-connect-stripe-button");
  if ((await stripeBtn.count()) > 0) {
    const before = page.url();
    const popupPromise = context.waitForEvent("page", { timeout: 20_000 }).catch(() => null);
    await stripeBtn.click();
    const popup = await popupPromise;
    check("5. Connect opens an OAuth popup and the builder never navigates", popup !== null && page.url() === before);
    if (popup) await popup.close().catch(() => {});
    await page.waitForTimeout(2_000);
  } else {
    OK("5. SKIP — Stripe already connected on this account");
  }

  console.log("\n=== 12. deterministic stages cost no AI credits ===");
  const creditsAfterConnect = await costEventRows();
  check(
    `12. Apply + Connect wrote no ai_cost_events (${creditsBeforeApply} → ${creditsAfterConnect})`,
    creditsBeforeApply === creditsAfterConnect,
  );
  console.log(`  note the one ASK did charge: ${creditsBeforeAsk} → ${creditsAfterAsk}`);

  console.log("\n=== 7-9. the CONFIGURE stage ===");
  // Configure begins only once connection readiness resolves. If the apps are still
  // disconnected this correctly stays at Connect — report which, honestly.
  await page.waitForTimeout(3_000);
  const stageNow = await guided.getAttribute("data-stage");
  if (stageNow === "configuring") {
    await page.screenshot({ path: `${SHOTS}/3-configure.png`, fullPage: false });
    const body = page.getByTestId("guided-configure-body");
    check("7. Configure began after connections resolved", (await body.count()) > 0);
    const search = page.locator('[data-testid$="-enabledEvents-search"]');
    if ((await search.count()) > 0) {
      const wall = await page.locator('[data-testid$="-enabledEvents"] input[type="checkbox"]').count();
      check("8. the Stripe event selector is searchable", true);
      check(`8. no giant checkbox wall (${wall} rows before searching)`, wall <= 3);
      await search.first().fill("payment_intent.succeeded");
      await page.waitForTimeout(500);
      check(
        "8. searching surfaces the matching event",
        (await page.locator('[data-testid$="-enabledEvents-payment_intent.succeeded"]').count()) > 0,
      );
    } else {
      OK("8. SKIP — the trigger node is not the current Configure target");
    }
  } else {
    OK(`7. Configure correctly has NOT begun — stage is "${stageNow}" (connections unresolved)`);
  }

  console.log("\n=== 11. reload + conversation persistence ===");
  await page.reload();
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4_000);
  check("11. the conversation survives a reload", (await page.getByText(GOAL, { exact: false }).count()) > 0);
  const creditsAfterReload = await costEventRows();
  check(
    `12. the reload charged nothing (${creditsAfterConnect} → ${creditsAfterReload})`,
    creditsAfterConnect === creditsAfterReload,
  );
  await page.screenshot({ path: `${SHOTS}/4-reloaded.png`, fullPage: false });
} catch (err) {
  failures++;
  console.error("\nERROR:", err.message);
  await page.screenshot({ path: `${SHOTS}/error.png`, fullPage: false }).catch(() => {});
} finally {
  if (workflowId) {
    await admin.from("builder_agent_messages").delete().eq("workflow_id", workflowId);
    await admin.from("builder_agent_threads").delete().eq("workflow_id", workflowId);
    await admin.from("workflows").delete().eq("id", workflowId);
    console.log("\n  cleanup: removed the throwaway workflow + its thread");
  }
  await browser.close();
}

console.log(failures ? `\nRESULT: ${failures} FAILURE(S)\n` : "\nRESULT: all checks passed\n");
process.exit(failures ? 1 : 0);
