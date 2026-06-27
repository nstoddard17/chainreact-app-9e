/**
 * One-off — list + delete leaked `crsmoke-` items from the OneDrive root.
 *
 * Safety net for the Excel write smokes (they upload a smoke workbook to the drive
 * root). ONLY targets root items whose name starts with the smoke marker prefix.
 *
 * Run: npx tsx scripts/trash/onedrive-root-crsmoke-sweep.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsList } from "@/integrations/microsoft-onedrive/api/driveItemsList";
import { driveItemsDelete } from "@/integrations/microsoft-onedrive/api/driveItemsDelete";

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
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const od = await getActiveForExecution(account, "microsoft-onedrive", null, { connectedByUserId: user });
  if (!od) return void console.log("onedrive not connected — abort.");

  const { items } = await refreshAndRetry({
    accountId: account, provider: "microsoft-onedrive", providerAccountId: od.providerAccountId,
    apiCall: (t) => driveItemsList({ accessToken: t, parentItemId: "root", top: 200 }),
  });
  const leaked = items.filter((i) => (i.name ?? "").startsWith("crsmoke-"));
  console.log(`root has ${items.length} items; ${leaked.length} crsmoke- to delete.`);
  for (const i of leaked) {
    await refreshAndRetry({
      accountId: account, provider: "microsoft-onedrive", providerAccountId: od.providerAccountId,
      apiCall: (t) => driveItemsDelete({ accessToken: t, itemId: i.id }),
    });
    console.log(`  deleted: ${i.name}`);
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
