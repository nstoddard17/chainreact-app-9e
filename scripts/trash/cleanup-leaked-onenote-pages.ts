/**
 * One-off cleanup — delete leaked `crsmoke-` OneNote pages from the smoke section.
 *
 * SMOKE-WRITE-32 had two failed live runs (WORKFLOW_NOT_READY before the
 * notebookId/sectionId cascade-parent fix) that left marker-titled pages behind.
 * This deletes exactly the `crsmoke-`-titled pages in the discovered smoke section.
 * Safe: it ONLY targets pages whose title starts with the smoke marker prefix.
 *
 * Run: npx tsx scripts/trash/cleanup-leaked-onenote-pages.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesList } from "@/integrations/microsoft-onenote/api/pagesList";
import { pagesDelete } from "@/integrations/microsoft-onenote/api/pagesDelete";
import { discoverOneNoteSmokeSection } from "@/tests/smoke-actions/writeHarnessDeps";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[key] = v;
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const account = process.env.SMOKE_ACCOUNT_ID!;
  const user = process.env.SMOKE_USER_ID!;
  // Build the singleton service-role client the repos read through.
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const section = await discoverOneNoteSmokeSection(account, user);
  if (!section) {
    console.log("No smoke section discovered — nothing to clean.");
    return;
  }
  console.log(`Smoke section: notebook "${section.notebookLabel}" / section "${section.sectionLabel}"`);

  const integration = await getActiveForExecution(account, "microsoft-onenote", null, { connectedByUserId: user });
  if (!integration) {
    console.log("microsoft-onenote not connected.");
    return;
  }

  const { pages } = await refreshAndRetry({
    accountId: account,
    provider: "microsoft-onenote",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken) => pagesList({ accessToken, sectionId: section.sectionId, top: 100 }),
  });

  const leaked = pages.filter((p) => (p.title ?? "").startsWith("crsmoke-"));
  console.log(`Found ${pages.length} pages; ${leaked.length} crsmoke- pages to delete.`);
  for (const p of leaked) {
    await refreshAndRetry({
      accountId: account,
      provider: "microsoft-onenote",
      providerAccountId: integration.providerAccountId,
      apiCall: (accessToken) => pagesDelete({ accessToken, pageId: p.id }),
    });
    console.log(`  deleted: ${p.title}`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
