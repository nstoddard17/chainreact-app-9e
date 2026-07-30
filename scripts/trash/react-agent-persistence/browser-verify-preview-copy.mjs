#!/usr/bin/env node
/**
 * REACT-AGENT-PREVIEW-COPY-CLEANUP-1 — the preview reply says the right thing, in a real browser.
 *
 * Asserts, at the narrow rail width, that a successful pre-apply preview:
 *   - no longer points at setup controls the card does not render,
 *   - says Connect and Configure happen AFTER Apply,
 *   - still promises nothing has been saved or activated,
 *   - stays short enough to read in the rail,
 * and that applying still lands on the Connect stage.
 *
 * Throwaway script (scripts/trash). Creates one workflow and deletes it, plus its thread.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.VERIFY_EMAIL ?? "chainreactapp@gmail.com";
const SHOTS = "scripts/trash/react-agent-persistence/shots-copy";
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

const GOAL = "When a Stripe payment succeeds, send a Slack message to the test channel.";

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let workflowId = null;

try {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email: EMAIL });
  if (error || !link?.properties?.hashed_token) throw new Error("generateLink failed");
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/workflows")}`,
  );
  await page.waitForURL((u) => !/\/auth\/callback/.test(u.toString()), { timeout: 120_000 }).catch(() => {});
  check("signed in", !new URL(page.url()).pathname.startsWith("/auth/"));

  const created = await page.request.post("/api/workflows", {
    data: { name: `COPY-VERIFY ${new Date().toISOString()}` },
  });
  const body = await created.json();
  workflowId = body?.id ?? body?.workflow?.id;
  if (!workflowId) throw new Error(`create failed (${created.status()})`);

  await page.goto(`/workflows/${workflowId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 240_000 });

  const composer = page.getByPlaceholder(/Example:/i);
  await composer.click();
  // Real key events: the composer is controlled, and a programmatic value set does not
  // always reach React's onChange, leaving Send disabled.
  await composer.pressSequentially(GOAL, { delay: 4 });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="workflow-guidance-submit"]').disabled,
    undefined,
    { timeout: 30_000 },
  );
  await page.getByTestId("workflow-guidance-submit").click();

  await page.getByTestId("builder-preview-setup-rail").waitFor({ timeout: 240_000 });
  await page.screenshot({ path: `${SHOTS}/1-preview-copy.png`, fullPage: false });

  // The assistant turn React actually spoke.
  const said = (await page.getByTestId("workflow-guidance-result").last().innerText()).trim();
  console.log(`\n  React said: "${said}"\n`);

  check("does NOT point at setup controls in the card", !/setup below|choices in each step|fill in as you pick/i.test(said));
  check("says to apply it to the draft", /apply it to your draft/i.test(said));
  check("says Connect + Configure come AFTER applying", /after applying/i.test(said) && /connect/i.test(said));
  check("still promises nothing saved or activated", /nothing has been saved or activated/i.test(said));
  check(`short enough for the rail (${said.length} chars)`, said.length <= 260);

  // It has to physically fit the rail without dominating it.
  const railBox = await page.getByTestId("builder-guidance-rail").boundingBox();
  const textBox = await page.getByTestId("workflow-guidance-result").last().boundingBox();
  check(
    `renders inside the rail (${Math.round(railBox?.width ?? 0)}px wide) without overflow`,
    !!railBox && !!textBox && textBox.width <= railBox.width + 2,
  );

  console.log("=== post-apply Connect stage ===");
  await page.getByTestId("builder-preview-setup-apply").click();
  const guided = page.getByTestId("guided-build-card");
  await guided.waitFor({ timeout: 60_000 });
  await page.getByTestId("guided-connect-stripe").waitFor({ timeout: 60_000 }).catch(() => {});
  await page.screenshot({ path: `${SHOTS}/2-connect.png`, fullPage: false });

  check(`stage after Apply is Connect (got "${await guided.getAttribute("data-stage")}")`,
    (await guided.getAttribute("data-stage")) === "connecting");
  const connect = await page.getByTestId("guided-connect-section").innerText().catch(() => "");
  console.log(`  connect stage says: ${connect.split("\n").join(" | ").slice(0, 180)}`);
  check("the promised Connect step is actually there", /connect/i.test(connect));
  check("both apps are offered", (await page.getByTestId("guided-connect-stripe").count()) > 0 &&
    (await page.getByTestId("guided-connect-slack").count()) > 0);
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
