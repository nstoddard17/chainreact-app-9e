// One-off: trash the runtime-repro-* workflows the browser repro created.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const repoDir = process.argv[2];
const env = {};
for (const line of readFileSync(resolve(repoDir, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: "stockhal120@gmail.com" });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://localhost:3000/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=/workflows`);
const list = await (await page.request.get("http://localhost:3000/api/workflows")).json();
const targets = (Array.isArray(list) ? list : list.workflows ?? []).filter((w) => w.name?.startsWith("runtime-repro-"));
for (const w of targets) {
  const res = await page.request.delete(`http://localhost:3000/api/workflows/${w.id}`);
  console.log(`deleted ${w.name}: ${res.status()}`);
}
console.log(`cleaned ${targets.length} repro workflows`);
await browser.close();
