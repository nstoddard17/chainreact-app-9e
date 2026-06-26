/**
 * One-off diagnostic — characterize the OneNote create→delete propagation lag for a
 * freshly COPIED page (SMOKE-WRITE-35 copy_page cert blocker).
 *
 * Reproduces copy_page's exact server sequence against the smoke section, then probes
 * how long a just-copied page takes to become deletable + what error a too-early delete
 * actually throws (typed 404 NotFoundError vs a non-404). Marker-scoped; sweeps itself.
 *
 * Run: npx tsx scripts/trash/onenote-copy-delete-lag-probe.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { pagesCreate } from "@/integrations/microsoft-onenote/api/pagesCreate";
import { pagesCopyToSection } from "@/integrations/microsoft-onenote/api/pagesCopyToSection";
import { pagesDelete } from "@/integrations/microsoft-onenote/api/pagesDelete";
import { pagesGet } from "@/integrations/microsoft-onenote/api/pagesGet";
import { pagesList } from "@/integrations/microsoft-onenote/api/pagesList";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  loadEnvLocal();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const account = process.env.SMOKE_ACCOUNT_ID!;
  const user = process.env.SMOKE_USER_ID!;
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const section = await discoverOneNoteSmokeSection(account, user);
  if (!section) return void console.log("No smoke section — abort.");
  const integration = await getActiveForExecution(account, "microsoft-onenote", null, { connectedByUserId: user });
  if (!integration) return void console.log("onenote not connected — abort.");
  const pa = integration.providerAccountId;
  const marker = `crsmoke-probe-${Date.now()}-`;
  const call = <T>(apiCall: (t: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({ accountId: account, provider: "microsoft-onenote", providerAccountId: pa, apiCall });

  // 1. source page.
  const htmlBody = `<!DOCTYPE html><html><head><title>${marker}src</title></head><body><p>${marker}b</p></body></html>`;
  const src = await call((t) =>
    pagesCreate({ accessToken: t, sectionId: section.sectionId, htmlBody, contentType: "text/html" }),
  );
  console.log(`source created: ${src.id}`);

  // 2. copy into the same section, resolve the copied page id via the Location resource.
  const copy = await call((t) => pagesCopyToSection({ accessToken: t, pageId: src.id, targetSectionId: section.sectionId }));
  console.log(`copy operationLocation: ${copy.operationLocation ?? "(null)"}`);
  let copyId: string | null = null;
  for (let i = 0; i < 10 && !copyId && copy.operationLocation; i++) {
    try {
      const res = await fetch(copy.operationLocation, { headers: { Authorization: `Bearer ${await tokenFor(account, pa)}` } });
      const body = (await res.json()) as { id?: string; status?: string; resourceId?: string };
      if (body.id && !body.status) copyId = body.id;
      else if (body.status === "completed" && body.resourceId) copyId = body.resourceId;
    } catch (e) {
      console.log(`  poll err: ${(e as Error).message}`);
    }
    if (!copyId) await sleep(500);
  }
  console.log(`copied page id: ${copyId ?? "(uncaptured)"}`);
  console.log(`SAME-AS-SOURCE? ${copyId === src.id}`);

  // 2b. List the section: does a DISTINCT copy (different id) actually exist?
  await sleep(2000);
  const { pages } = await call((t) => pagesList({ accessToken: t, sectionId: section.sectionId, top: 100 }));
  const mine = pages.filter((p) => (p.title ?? "").startsWith(marker));
  console.log(`section has ${mine.length} page(s) titled "${marker}*":`);
  for (const p of mine) console.log(`  - ${p.id}  "${p.title}"`);

  // 3. probe: how soon is the COPIED page deletable? bounded attempts, log error TYPE.
  if (copyId) {
    const t0 = Date.now();
    for (let attempt = 1; attempt <= 12; attempt++) {
      const elapsed = Date.now() - t0;
      try {
        await call((t) => pagesDelete({ accessToken: t, pageId: copyId! }));
        console.log(`DELETE copy OK on attempt ${attempt} (+${elapsed}ms)`);
        copyId = null;
        break;
      } catch (e) {
        const kind = e instanceof NotFoundError ? "NotFoundError(404)" : `OTHER(${(e as Error).message.slice(0, 80)})`;
        console.log(`  attempt ${attempt} (+${elapsed}ms) delete failed -> ${kind}`);
        // Cross-check existence via GET (typed 404 -> gone).
        try {
          await call((t) => pagesGet({ accessToken: t, pageId: copyId! }));
          console.log(`    GET says copy STILL EXISTS`);
        } catch (ge) {
          console.log(`    GET -> ${ge instanceof NotFoundError ? "NotFound (copy gone)" : (ge as Error).message.slice(0, 60)}`);
        }
        await sleep(1000);
      }
    }
  }

  // 4. sweep both pages (best-effort).
  for (const id of [src.id, copyId].filter(Boolean) as string[]) {
    try {
      await call((t) => pagesDelete({ accessToken: t, pageId: id }));
      console.log(`swept: ${id}`);
    } catch (e) {
      console.log(`sweep failed for ${id}: ${e instanceof NotFoundError ? "already gone" : (e as Error).message.slice(0, 60)}`);
    }
  }
  console.log("Done.");
}

// Minimal token accessor reusing refreshAndRetry's path by returning the token it injects.
async function tokenFor(account: string, pa: string | null): Promise<string> {
  return refreshAndRetry({
    accountId: account,
    provider: "microsoft-onenote",
    providerAccountId: pa,
    apiCall: (t) => Promise.resolve(t),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
