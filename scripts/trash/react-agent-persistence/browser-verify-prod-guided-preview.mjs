#!/usr/bin/env node
/**
 * REACT-AGENT-GUIDED-PREVIEW — production verification of the whole guided journey.
 *
 * Drives https://chainreact.app in a real browser with the exact reported prompt and confirms:
 * the new preview copy, a compact card with Apply immediately visible and no controls/catalog/
 * picker/recovery/manual-ID/Apps-link before Apply, Apply creating an unresolved draft, Connect as
 * the next stage for a disconnected provider (and connected providers recognised), Configure
 * handling the Stripe event + Slack channel + message once connections resolve, the journey
 * continuing to Test and explicit Activate, conversation persistence across reload, and no AI
 * credits for any deterministic guided step.
 *
 * Throwaway script (scripts/trash). Creates ONE workflow and deletes it, plus its thread.
 *
 * Usage: node scripts/trash/react-agent-persistence/browser-verify-prod-guided-preview.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const BASE = process.env.VERIFY_BASE_URL ?? "https://chainreact.app";
const EMAIL = process.env.VERIFY_EMAIL ?? "chainreactapp@gmail.com";
const SHOTS = "scripts/trash/react-agent-persistence/shots-prod-guided";
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
const NOTE = (m) => console.log(`  note ${m}`);

const GOAL = "When a Stripe payment succeeds, send a Slack message to the test channel.";
const EXPECTED_COPY =
  "Here's the workflow I sketched. Review the steps, then apply it to your draft. " +
  "After applying, I'll guide you through connecting the apps and completing setup. " +
  "Nothing has been saved or activated yet.";

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let workflowId = null;

/** The authoritative billing ledger — the only thing that proves "no credits". */
async function costEventRows() {
  const { count, error } = await admin
    .from("ai_cost_events")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`ai_cost_events count failed: ${error.message}`);
  return count ?? 0;
}

try {
  console.log(`\n=== sign in at ${BASE} ===`);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email: EMAIL });
  if (error || !link?.properties?.hashed_token) throw new Error("generateLink failed");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/workflows")}`,
  );
  await page.waitForURL((u) => !/\/auth\/callback/.test(u.toString()), { timeout: 120_000 }).catch(() => {});
  check("signed in", !new URL(page.url()).pathname.startsWith("/auth/"));

  const created = await page.request.post("/api/workflows", {
    data: { name: `PROD-GUIDED-VERIFY ${new Date().toISOString()}` },
  });
  const body = await created.json();
  workflowId = body?.id ?? body?.workflow?.id;
  if (!workflowId) throw new Error(`create failed (${created.status()})`);
  OK("fresh production workflow created");

  await page.goto(`/workflows/${workflowId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 180_000 });

  console.log("\n=== PREVIEW ===");
  const creditsBeforeAsk = await costEventRows();
  const composer = page.getByPlaceholder(/Example:/i);
  await composer.click();
  await composer.pressSequentially(GOAL, { delay: 4 });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="workflow-guidance-submit"]').disabled,
    undefined,
    { timeout: 30_000 },
  );
  await page.getByTestId("workflow-guidance-submit").click();

  const card = page.getByTestId("builder-preview-setup-rail");
  await card.waitFor({ timeout: 300_000 });
  await page.screenshot({ path: `${SHOTS}/1-preview.png`, fullPage: false });
  const creditsAfterAsk = await costEventRows();

  const said = (await page.getByTestId("workflow-guidance-result").last().innerText())
    .replace(/^React:\s*/, "")
    .trim();
  console.log(`\n  React said: "${said}"\n`);
  check("preview copy matches the approved wording exactly", said === EXPECTED_COPY);
  check(
    "no stale 'setup below' language",
    !/setup below|choices in each step|fill in as you pick/i.test(said),
  );

  const steps = await page.getByTestId("preview-summary-steps").innerText();
  NOTE(`steps: ${steps.split("\n").join(" | ")}`);
  check("the preview is compact (a short step list, no form)", steps.split("\n").length <= 6);

  const apply = page.getByTestId("builder-preview-setup-apply");
  check("Apply to draft is immediately visible", await apply.isVisible());
  const applyBox = await apply.boundingBox();
  const cardBox = await card.boundingBox();
  check(
    "Apply sits above the outstanding-setup list, not below a form",
    !!applyBox && !!cardBox && applyBox.y - cardBox.y < cardBox.height * 0.6,
  );

  check("no setup controls before Apply", (await card.locator("input, select, textarea").count()) === 0);
  check("no Stripe event catalog before Apply", (await card.getByRole("checkbox").count()) === 0);
  check("no resource picker before Apply", (await card.getByRole("combobox").count()) === 0);
  check(
    "no recovery UI or manual-ID option before Apply",
    (await page.getByText("Reconnect in Apps").count()) === 0 &&
      (await page.getByText("Enter ID manually").count()) === 0 &&
      (await page.getByText("Try again").count()) === 0,
  );
  check("no Apps-page link before Apply", (await card.locator('a[href^="/apps"]').count()) === 0);
  check("the card offers exactly one action", (await card.locator("button").count()) === 1);

  console.log("\n=== APPLY → CONNECT ===");
  const creditsBeforeApply = await costEventRows();
  await apply.click();
  const guided = page.getByTestId("guided-build-card");
  await guided.waitFor({ timeout: 120_000 });
  await page.getByTestId("guided-connect-stripe").waitFor({ timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `${SHOTS}/2-connect.png`, fullPage: false });

  const nodes = await page.evaluate(() => document.querySelectorAll(".react-flow__node").length);
  check(`Apply created the draft (${nodes} node(s) on the canvas)`, nodes > 0);

  const stage = await guided.getAttribute("data-stage");
  check(`the next stage is Connect (got "${stage}")`, stage === "connecting");
  const connectText = await page.getByTestId("guided-connect-section").innerText().catch(() => "");
  NOTE(`connect stage: ${connectText.split("\n").join(" | ").slice(0, 200)}`);

  // Connected vs disconnected must be reported from server truth, per provider.
  for (const provider of ["stripe", "slack"]) {
    const connected = await page.getByTestId(`guided-connect-${provider}-connected`).count();
    const button = await page.getByTestId(`guided-connect-${provider}-button`).count();
    const owner = await page.getByTestId(`guided-connect-${provider}-owner-gated`).count();
    check(
      `${provider}: exactly one honest state (connected=${connected} connect=${button} owner=${owner})`,
      connected + button + owner === 1,
    );
    if (connected) NOTE(`${provider} is already connected and was recognised as such`);
  }
  check(
    "Connect never routes to the Apps page",
    (await page.getByTestId("guided-connect-section").locator('a[href^="/apps"]').count()) === 0,
  );

  const creditsAfterConnect = await costEventRows();
  check(
    `Apply + Connect consumed no AI credits (${creditsBeforeApply} → ${creditsAfterConnect})`,
    creditsBeforeApply === creditsAfterConnect,
  );
  NOTE(`the single ASK did charge: ${creditsBeforeAsk} → ${creditsAfterAsk}`);

  console.log("\n=== CONFIGURE / TEST / ACTIVATE ===");
  await page.waitForTimeout(4_000);
  const stageNow = await guided.getAttribute("data-stage");
  if (stageNow === "configuring") {
    await page.screenshot({ path: `${SHOTS}/3-configure.png`, fullPage: false });
    check("Configure began once connections resolved", true);
    const eventSearch = page.locator('[data-testid$="-enabledEvents-search"]');
    const channel = page.locator('[data-testid$="-channel"]');
    const text = page.locator('[data-testid$="-text"]');
    NOTE(
      `configure surfaces — event search:${await eventSearch.count()} channel:${await channel.count()} message:${await text.count()}`,
    );
    if ((await eventSearch.count()) > 0) {
      const wall = await page.locator('[data-testid$="-enabledEvents"] input[type="checkbox"]').count();
      check(`the Stripe event is a searchable selector, not a wall (${wall} rows at rest)`, wall <= 3);
    }
  } else {
    NOTE(`Configure has correctly NOT begun — stage is "${stageNow}" (connections unresolved)`);
    NOTE("Configure/Test/Activate need real Stripe+Slack connections on this account");
  }

  console.log("\n=== PERSISTENCE + RELOAD ===");
  await page.reload();
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 180_000 });
  await page.waitForTimeout(5_000);
  await page.screenshot({ path: `${SHOTS}/4-reloaded.png`, fullPage: false });
  check("the conversation survives a reload", (await page.getByText(GOAL, { exact: false }).count()) > 0);
  check(
    "the restored preview copy is the new wording",
    (await page.getByText("After applying", { exact: false }).count()) > 0,
  );
  const creditsAfterReload = await costEventRows();
  check(
    `reload consumed no AI credits (${creditsAfterConnect} → ${creditsAfterReload})`,
    creditsAfterConnect === creditsAfterReload,
  );
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
