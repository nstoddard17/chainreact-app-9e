/**
 * REACT-AGENT-RUNTIME-REPRO-1 — real-browser repro against localhost:3000.
 *
 * Signs in via service-role generateLink (Turnstile-safe, the established smoke
 * pattern), creates a throwaway workflow, types the EXACT screenshot prompt in
 * the React Agent rail, submits, and captures the guidance route's status +
 * body source/code, plus AI-credit usage before/after. No secrets printed.
 *
 * Usage: node browser-repro.mjs <repoDir> <label>
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [repoDir, label = "run"] = process.argv.slice(2);
const APP = "http://localhost:3000";
const EXACT_PROMPT = `when i get a stripe payment from marcus send me a slack message to "test" channel`;

// Load env from the repo's .env.local without printing values.
const env = {};
for (const line of readFileSync(resolve(repoDir, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env in .env.local");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Find Marcus's user (owner emails known from repo context).
const CANDIDATE_EMAILS = ["stockhal120@gmail.com", "chainreactapp@gmail.com"];
let email = null;
{
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  for (const cand of CANDIDATE_EMAILS) {
    if (data.users.some((u) => u.email === cand)) { email = cand; break; }
  }
  if (!email) throw new Error("No candidate user found");
}
console.log(`[repro] signing in as: ${email}`);

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "recovery",
  email,
});
const tokenHash = linkData?.properties?.hashed_token;
if (linkErr || !tokenHash) {
  throw new Error(`generateLink failed: ${linkErr?.message ?? "no hashed_token"}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// 1. Redeem device-independently via the app's own callback (token_hash+type
//    → verifyOtp server-side → SSR cookies). Established smoke pattern.
await page.goto(
  `${APP}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=/workflows`,
  { waitUntil: "domcontentloaded" },
);
const landed = new URL(page.url());
console.log(`[repro] signed in; landed on ${landed.pathname}${landed.search}`);
if (landed.pathname.startsWith("/auth/sign-in")) throw new Error("session not established");

// 2. AI-credit usage BEFORE.
async function usage() {
  const res = await page.request.get(`${APP}/api/ai/usage`);
  if (!res.ok()) return { unavailable: res.status() };
  const body = await res.json();
  return body;
}
const usageBefore = await usage();

// 3. Create a throwaway workflow via the app's own API (cookies attached).
const createRes = await page.request.post(`${APP}/api/workflows`, {
  data: { name: `runtime-repro-${label}-${Date.now()}` },
});
if (!createRes.ok()) throw new Error(`create workflow failed: ${createRes.status()}`);
const wf = await createRes.json();
console.log(`[repro] workflow created: ${wf.id}`);

// 4. Open the builder, type the EXACT prompt, submit, capture the route response.
await page.goto(`${APP}/workflows/${wf.id}`, { waitUntil: "domcontentloaded" });
const composer = page.getByPlaceholder(/Example:/i);
await composer.waitFor({ timeout: 30000 });
await composer.click();
await composer.pressSequentially(EXACT_PROMPT, { delay: 5 });

const respPromise = page.waitForResponse(
  (r) => r.url().includes("/ai/workflow-guidance") && r.request().method() === "POST",
  { timeout: 120000 },
);
await page.getByTestId("workflow-guidance-submit").click();
const resp = await respPromise;
const status = resp.status();
let body = {};
try { body = await resp.json(); } catch { /* non-json */ }

// Give the UI a beat to render the outcome, then capture evidence.
await page.waitForTimeout(2500);
mkdirSync(resolve(repoDir, "scripts", "trash", "repro-shots"), { recursive: true });
const shot = resolve(repoDir, "..", "repro-shots", `guidance-${label}.png`);
await page.screenshot({ path: shot, fullPage: false });

const errorVisible = await page
  .locator("text=PREVIEW_PLAN_MISSING")
  .count()
  .then((c) => c > 0)
  .catch(() => false);
const overlayVisible = await page
  .getByTestId("builder-preview-overlay")
  .count()
  .then((c) => c > 0)
  .catch(() => false);

const usageAfter = await usage();

console.log(
  JSON.stringify(
    {
      label,
      prompt: EXACT_PROMPT,
      routeStatus: status,
      ok: body.ok ?? null,
      source: body.source ?? null,
      errorCode: body.code ?? body.error ?? null,
      planSteps: body.workflowPlan?.steps?.map((s) => `${s.provider}:${s.type}`) ?? null,
      previewNodes: body.previewDraft?.nodes?.length ?? null,
      uiShowsPreviewOverlay: overlayVisible,
      uiShowsPlanMissingError: errorVisible,
      usageBefore,
      usageAfter,
      screenshot: shot,
    },
    null,
    2,
  ),
);

await browser.close();
