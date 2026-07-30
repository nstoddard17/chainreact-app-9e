#!/usr/bin/env node
/**
 * REACT-AGENT-CONVERSATION-PERSISTENCE-1 — production verification of BOTH
 * return flows, in a real browser.
 *
 *   A. apply → do NOT save → leave → return
 *        unsaved nodes gone · conversation remains · preview "Not saved" ·
 *        no "Finish setting up this workflow"
 *   B. apply → SAVE → leave → return
 *        conversation remains · saved workflow loads · guided stage resumes
 *        from CURRENT readiness
 *
 * Also asserts, in the same session: stale localStorage markers are cleared, a
 * discarded preview cannot restart setup, conversations are isolated per
 * workflow, and restoring history costs ZERO AI credits.
 *
 * Throwaway script (scripts/trash). Creates its own throwaway workflows and
 * deletes them (plus their threads) at the end.
 *
 * Usage: node scripts/trash/react-agent-persistence/browser-verify-prod-return-flows.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "../../lib/db-target.mjs";

const env = loadEnvFile(readFileSync, ".env.local");
const BASE = process.env.VERIFY_BASE_URL ?? "https://chainreact.app";
const EMAIL = process.env.VERIFY_EMAIL ?? "chainreactapp@gmail.com";
const SHOTS = "scripts/trash/react-agent-persistence/shots-prod";
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

const GOAL_A = "When a new row is added to a Google Sheet, send me a Slack message";
const GOAL_B = "When a new row is added to a Google Sheet, post a message in Slack";

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE });
const page = await context.newPage();
const created = [];

const key = (id) => `chainreact:builder:guidedBuild:${id}`;
const marker = (id) => page.evaluate((k) => window.localStorage.getItem(k), key(id));
const nodeCount = () =>
  page.evaluate(() => document.querySelectorAll(".react-flow__node").length);

async function openBuilder(id) {
  await page.goto(`/workflows/${id}`);
  await page.getByTestId("builder-guidance-rail").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(5_000);
}

/**
 * Credit-relevant counters ONLY. `/api/ai/usage` embeds a request-time `range`,
 * so comparing whole responses would always differ regardless of spend.
 */
async function aiCredits() {
  const res = await page.request.get("/api/ai/usage");
  if (!res.ok()) return null;
  const o = (await res.json())?.overview ?? {};
  return JSON.stringify({
    totalAiCredits: o.totalAiCredits ?? null,
    totalEvents: o.totalEvents ?? null,
    modelCallsCompleted: o.modelCallsCompleted ?? null,
    totalTokens: o.totalTokens ?? null,
  });
}

/**
 * The authoritative billing ledger, read with the service role. The usage
 * endpoint is a rollup; this counts the rows that actually represent charges.
 */
async function costEventRows() {
  const { count, error } = await admin
    .from("ai_cost_events")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`ai_cost_events count failed: ${error.message}`);
  return count ?? 0;
}

async function buildAndApply(goal) {
  const composer = page.getByPlaceholder(/Example:/i);
  await composer.waitFor({ timeout: 60_000 });
  await composer.fill(goal);
  await page.getByTestId("workflow-guidance-submit").click();
  const apply = page.getByTestId("builder-preview-apply");
  try {
    await apply.waitFor({ timeout: 240_000 });
  } catch {
    // Say what the agent actually replied rather than just "timed out" — a
    // clarifying question is a legitimate outcome, not a broken preview.
    const said = await page
      .getByTestId("workflow-guidance-result")
      .last()
      .textContent()
      .catch(() => null);
    throw new Error(`no preview for "${goal}". Agent said: ${(said ?? "(nothing)").slice(0, 300)}`);
  }
  await apply.click();
  await page.waitForTimeout(2_500);
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
  check(`signed in (landed ${new URL(page.url()).pathname})`, !new URL(page.url()).pathname.startsWith("/auth/"));

  async function newWorkflow(name) {
    const res = await page.request.post("/api/workflows", {
      data: { name: `${name} ${new Date().toISOString()}` },
    });
    const body = await res.json();
    const id = body?.id ?? body?.workflow?.id;
    if (!id) throw new Error(`create failed (${res.status()}): ${JSON.stringify(body).slice(0, 200)}`);
    created.push(id);
    return id;
  }

  // ── FLOW A — applied but NOT saved ────────────────────────────────────────
  console.log("\n=== FLOW A: apply, do NOT save, leave, return ===");
  const wfA = await newWorkflow("PROD-VERIFY-UNSAVED");
  await openBuilder(wfA);
  const creditsBefore = await aiCredits();
  await buildAndApply(GOAL_A);
  await page.screenshot({ path: `${SHOTS}/A1-applied.png`, fullPage: true });
  check("applied to the draft", (await nodeCount()) > 0);
  check("nothing persisted while unsaved", (await marker(wfA)) === null);

  await page.goto("/workflows");
  await page.waitForTimeout(2_000);
  await openBuilder(wfA);
  await page.screenshot({ path: `${SHOTS}/A2-returned.png`, fullPage: true });

  check("A: unsaved nodes are gone", (await nodeCount()) === 0);
  check("A: the conversation remains", (await page.getByText(GOAL_A, { exact: false }).count()) > 0);
  const labelA = await page
    .getByTestId("workflow-guidance-restored-preview-label")
    .first()
    .textContent()
    .catch(() => null);
  check(`A: preview labelled "Not saved" (got ${labelA ?? "none"})`, (labelA ?? "").trim() === "Not saved");
  check(
    'A: "Finish setting up this workflow" does NOT appear',
    (await page.getByText("Finish setting up this workflow").count()) === 0,
  );
  check("A: no guided setup card", (await page.getByTestId("guided-build-card").count()) === 0);

  // ── FLOW B — applied AND saved ────────────────────────────────────────────
  console.log("\n=== FLOW B: apply, SAVE, leave, return ===");
  const wfB = await newWorkflow("PROD-VERIFY-SAVED");
  await openBuilder(wfB);
  await buildAndApply(GOAL_B);
  // Save through the header's real Save control.
  const save = page.getByRole("button", { name: /^save$/i }).first();
  await save.waitFor({ timeout: 30_000 });
  await save.click();
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: `${SHOTS}/B1-saved.png`, fullPage: true });
  const markerB = await marker(wfB);
  check("B: a guided hint IS persisted once saved", markerB !== null);
  if (markerB) {
    const parsed = JSON.parse(markerB);
    check(
      "B: the hint is bound to a saved graph revision (v2 shape)",
      parsed.v === 2 && typeof parsed.savedGraphVersion === "string",
    );
  }

  await page.goto("/workflows");
  await page.waitForTimeout(2_000);
  await openBuilder(wfB);
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: `${SHOTS}/B2-returned.png`, fullPage: true });

  check("B: the conversation remains", (await page.getByText(GOAL_B, { exact: false }).count()) > 0);
  check("B: the saved workflow loads", (await nodeCount()) > 0);
  const card = page.getByTestId("guided-build-card");
  const cardCount = await card.count();
  check("B: the guided journey resumed", cardCount > 0);
  if (cardCount > 0) {
    const stage = await card.first().getAttribute("data-stage");
    // The stage is DERIVED from current readiness — never restored from storage.
    check(
      `B: stage derived from current readiness (got "${stage}")`,
      ["connecting", "configuring", "ready_to_test", "testing", "ready_to_activate", "blocked"].includes(stage ?? ""),
    );
  }

  // ── Cross-checks ──────────────────────────────────────────────────────────
  console.log("\n=== cross-checks ===");
  // Workflow isolation: B's transcript must not contain A's goal, and vice versa.
  check("conversations are isolated per workflow (B has no A turn)", (await page.getByText(GOAL_A, { exact: false }).count()) === 0);

  // Stale marker on a workflow whose saved revision moved on / legacy marker.
  await page.evaluate((k) => window.localStorage.setItem(k, "1"), key(wfA));
  await openBuilder(wfA);
  check("legacy \"1\" marker cleared on load", (await marker(wfA)) === null);
  check(
    "a stale marker cannot restart setup",
    (await page.getByText("Finish setting up this workflow").count()) === 0,
  );

  // AI credits: RESTORING a transcript must consume none. Measured two ways —
  // the usage rollup's credit counters, and the ai_cost_events ledger itself.
  const reloadStartUsage = await aiCredits();
  const reloadStartRows = await costEventRows();
  await openBuilder(wfA);
  await openBuilder(wfB);
  await openBuilder(wfA);
  const reloadEndUsage = await aiCredits();
  const reloadEndRows = await costEventRows();
  check(
    `restoring history adds no AI-credit usage (${reloadStartUsage} → ${reloadEndUsage})`,
    reloadStartUsage === reloadEndUsage,
  );
  check(
    `restoring history writes no ai_cost_events row (${reloadStartRows} → ${reloadEndRows}) across 3 reloads`,
    reloadStartRows === reloadEndRows,
  );
  console.log(`  note usage before any AI call this run: ${creditsBefore}`);
} catch (err) {
  failures++;
  console.error("\nERROR:", err.message);
  await page.screenshot({ path: `${SHOTS}/error.png`, fullPage: true }).catch(() => {});
} finally {
  console.log("\n=== cleanup ===");
  for (const id of created) {
    await admin.from("builder_agent_messages").delete().eq("workflow_id", id);
    await admin.from("builder_agent_threads").delete().eq("workflow_id", id);
    await admin.from("workflows").delete().eq("id", id);
    console.log(`  removed throwaway workflow ${id.slice(0, 8)}… + its thread`);
  }
  await browser.close();
}

console.log(failures ? `\nRESULT: ${failures} FAILURE(S)\n` : "\nRESULT: all checks passed\n");
process.exit(failures ? 1 : 0);
