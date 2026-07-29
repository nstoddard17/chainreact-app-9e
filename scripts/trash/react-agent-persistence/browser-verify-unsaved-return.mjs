#!/usr/bin/env node
/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — real-browser verification of the
 * EXACT reported scenario:
 *
 *   create a workflow through React Agent → apply the preview → do NOT save →
 *   leave the workflow → return.
 *
 * Expected on return:
 *   - the canvas loads the last SAVED workflow (empty),
 *   - the unsaved nodes stay discarded,
 *   - the conversation is still visible,
 *   - "Finish setting up this workflow" does NOT appear.
 *
 * Throwaway script (scripts/trash — not part of the app). It drives the already
 * running dev server on :3000 with a real Chromium, signs in through the app's
 * own /auth/callback (service-role generateLink — the form login is
 * Turnstile-gated for bots), creates ONE throwaway workflow, and DELETES it plus
 * its agent thread at the end.
 *
 * Usage: node scripts/trash/react-agent-persistence/browser-verify-unsaved-return.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.VERIFY_EMAIL ?? "chainreactapp@gmail.com";
const SHOTS = "scripts/trash/react-agent-persistence/shots";
mkdirSync(SHOTS, { recursive: true });

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let failures = 0;
const OK = (m) => console.log(`  OK   ${m}`);
const FAIL = (m) => {
  failures++;
  console.error(`  FAIL ${m}`);
};
const check = (label, cond) => (cond ? OK(label) : FAIL(label));

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE });
const page = await context.newPage();
let workflowId = null;

try {
  console.log(`\n=== sign in as ${EMAIL} at ${BASE} ===`);
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: EMAIL,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no hashed_token"}`);
  }
  await page.goto(
    `/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/workflows")}`,
  );
  await page
    .waitForURL((u) => !/\/auth\/callback/.test(u.toString()), { timeout: 120_000 })
    .catch(() => {});
  console.log(`  landed on: ${page.url()}`);
  check("signed in", !new URL(page.url()).pathname.startsWith("/auth/"));

  console.log("\n=== create a throwaway workflow ===");
  const created = await page.request.post("/api/workflows", {
    data: { name: `RA-PERSIST-VERIFY ${new Date().toISOString()}` },
  });
  const createdBody = await created.json();
  workflowId = createdBody?.id ?? createdBody?.workflow?.id;
  check(`workflow created (${created.status()})`, !!workflowId);
  if (!workflowId) throw new Error(`create failed: ${JSON.stringify(createdBody).slice(0, 300)}`);

  console.log("\n=== 1. build it through React Agent ===");
  await page.goto(`/workflows/${workflowId}`);
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 30_000 });
  const composer = page.getByPlaceholder(/Example:/i);
  await composer.waitFor({ timeout: 30_000 });
  const GOAL = "When a new row is added to a Google Sheet, send me a Slack message";
  await composer.fill(GOAL);
  await page.getByTestId("workflow-guidance-submit").click();

  // The preview auto-shows on the canvas; Apply is the explicit user action.
  const applyButton = page.getByTestId("builder-preview-apply");
  await applyButton.waitFor({ timeout: 180_000 });
  await page.screenshot({ path: `${SHOTS}/1-preview.png`, fullPage: true });
  OK("React Agent produced a preview");

  console.log("\n=== 2. apply the preview, do NOT save ===");
  await applyButton.click();
  await page.waitForTimeout(2_000);
  const nodesAfterApply = await page.evaluate(
    () => document.querySelectorAll(".react-flow__node").length,
  );
  await page.screenshot({ path: `${SHOTS}/2-applied.png`, fullPage: true });
  const guidedCardVisible = await page.getByTestId("guided-build-card").isVisible().catch(() => false);
  OK(`applied to the draft (${nodesAfterApply} node card(s) on canvas)`);
  OK(`guided card while still on the page: ${guidedCardVisible}`);
  const markerAfterApply = await page.evaluate(
    (id) => window.localStorage.getItem(`chainreact:builder:guidedBuild:${id}`),
    workflowId,
  );
  check(
    "NOTHING persisted for an unsaved guided session",
    markerAfterApply === null,
  );

  console.log("\n=== 3. leave the workflow ===");
  await page.goto("/workflows");
  await page.waitForTimeout(1_500);

  console.log("\n=== 4. return to the workflow ===");
  await page.goto(`/workflows/${workflowId}`);
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: `${SHOTS}/3-returned.png`, fullPage: true });

  const nodesOnReturn = await page.evaluate(
    () => document.querySelectorAll(".react-flow__node").length,
  );
  check("canvas loaded the last SAVED workflow (unsaved nodes discarded)", nodesOnReturn === 0);

  const setupCardCount = await page.getByText("Finish setting up this workflow").count();
  check('"Finish setting up this workflow" does NOT appear', setupCardCount === 0);

  const guidedCardOnReturn = await page.getByTestId("guided-build-card").count();
  check("no guided setup card at all", guidedCardOnReturn === 0);

  const transcriptHasGoal = await page.getByText(GOAL, { exact: false }).count();
  check("the conversation is still visible", transcriptHasGoal > 0);

  const notSavedBadge = await page
    .getByTestId("workflow-guidance-restored-preview-label")
    .first()
    .textContent()
    .catch(() => null);
  check(
    `the old preview is labelled "Not saved" (got: ${notSavedBadge ?? "none"})`,
    (notSavedBadge ?? "").trim() === "Not saved",
  );

  const markerOnReturn = await page.evaluate(
    (id) => window.localStorage.getItem(`chainreact:builder:guidedBuild:${id}`),
    workflowId,
  );
  check("no guided marker in storage", markerOnReturn === null);

  console.log("\n=== 5. legacy durable marker is cleared, not resumed ===");
  await page.evaluate(
    (id) => window.localStorage.setItem(`chainreact:builder:guidedBuild:${id}`, "1"),
    workflowId,
  );
  await page.reload();
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: `${SHOTS}/4-legacy-marker.png`, fullPage: true });
  check(
    "legacy \"1\" marker cleared",
    (await page.evaluate(
      (id) => window.localStorage.getItem(`chainreact:builder:guidedBuild:${id}`),
      workflowId,
    )) === null,
  );
  check(
    "legacy marker did NOT resurrect the setup card",
    (await page.getByText("Finish setting up this workflow").count()) === 0,
  );
} catch (err) {
  failures++;
  console.error("\nERROR:", err.message);
  await page.screenshot({ path: `${SHOTS}/error.png`, fullPage: true }).catch(() => {});
} finally {
  if (workflowId) {
    console.log("\n=== cleanup ===");
    await admin.from("builder_agent_messages").delete().eq("workflow_id", workflowId);
    await admin.from("builder_agent_threads").delete().eq("workflow_id", workflowId);
    await admin.from("workflows").delete().eq("id", workflowId);
    console.log("  removed the throwaway workflow + its agent thread");
  }
  await browser.close();
}

console.log(failures ? `\nRESULT: ${failures} FAILURE(S)\n` : "\nRESULT: all checks passed\n");
process.exit(failures ? 1 : 0);
