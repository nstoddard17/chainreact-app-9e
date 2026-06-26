/**
 * ONE-OFF (SMOKE-WRITE-35 unblocker) — diagnose the null `operationLocation` from
 * OneNote copy_page AND sweep any leaked `crsmoke-` pages from the smoke/test section.
 *
 * SAFETY: operates ONLY on the discovered smoke/test-named section, and only ever
 * DELETES pages whose title contains the `crsmoke-` smoke marker. Bounded. Read +
 * marker-scoped delete only — never touches a real notebook/section or a non-marker page.
 *
 * Run:
 *   ALLOW_LIVE_PROVIDER_SMOKE=true npx tsx scripts/trash/onenote-copy-diagnose-and-sweep.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { graphApiBase } from "@/integrations/_shared/microsoft/api/_base";
import { pagesList } from "@/integrations/microsoft-onenote/api/pagesList";
import { pagesCreate } from "@/integrations/microsoft-onenote/api/pagesCreate";
import { pagesDelete } from "@/integrations/microsoft-onenote/api/pagesDelete";
import { discoverOneNoteSmokeSection } from "@/tests/smoke-actions/writeHarnessDeps";

const MARKER = "crsmoke-";

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
loadEnvLocal();

async function main(): Promise<void> {
  if (process.env.ALLOW_LIVE_PROVIDER_SMOKE !== "true") {
    console.log("Refusing to run without ALLOW_LIVE_PROVIDER_SMOKE=true.");
    return;
  }
  const accountId = process.env.SMOKE_ACCOUNT_ID;
  const userId = process.env.SMOKE_USER_ID;
  if (!accountId || !userId) {
    console.log("Missing SMOKE_ACCOUNT_ID / SMOKE_USER_ID.");
    return;
  }

  const section = await discoverOneNoteSmokeSection(accountId, userId);
  if (!section) {
    console.log("No smoke/test-named section found — nothing to sweep/diagnose.");
    return;
  }
  console.log(`Smoke section resolved (sectionLabel="${section.sectionLabel}", notebookLabel="${section.notebookLabel}").`);

  const integration = await getActiveForExecution(accountId, "microsoft-onenote", null, {
    connectedByUserId: userId,
  });
  if (!integration) {
    console.log("microsoft-onenote not connected on the smoke account.");
    return;
  }
  const providerAccountId = integration.providerAccountId;

  // ── 1. SWEEP — list pages in the smoke section, delete crsmoke- titled ones. ──
  const { pages } = await refreshAndRetry({
    accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) => pagesList({ accessToken, sectionId: section.sectionId, top: 100 }),
  });
  const leaked = pages.filter((p) => (p.title ?? "").includes(MARKER));
  console.log(`SWEEP: found ${leaked.length} crsmoke- page(s) of ${pages.length} in the smoke section.`);
  let deleted = 0;
  for (const p of leaked) {
    try {
      await refreshAndRetry({
        accountId,
        provider: "microsoft-onenote",
        providerAccountId,
        apiCall: (accessToken) => pagesDelete({ accessToken, pageId: p.id }),
      });
      deleted++;
    } catch (err) {
      console.log(`  delete failed for one page: ${(err as Error).message}`);
    }
  }
  // Re-list to confirm remaining.
  const after = await refreshAndRetry({
    accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) => pagesList({ accessToken, sectionId: section.sectionId, top: 100 }),
  });
  const remaining = after.pages.filter((p) => (p.title ?? "").includes(MARKER)).length;
  console.log(`SWEEP RESULT: found ${leaked.length} / deleted ${deleted} / remaining ${remaining}`);

  if (process.env.SWEEP_ONLY === "1") {
    console.log("SWEEP_ONLY=1 — skipping diagnostic copy.");
    return;
  }

  // ── 2. DIAGNOSE — create a marker source page, copy it to the SAME section, and ──
  //    capture the RAW Graph response (status + operation-location/location headers +
  //    body shape) so we can see WHERE (or whether) the operation URL is returned.
  console.log("DIAGNOSE: creating a throwaway crsmoke- source page…");
  const created = await refreshAndRetry({
    accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) =>
      pagesCreate({
        accessToken,
        sectionId: section.sectionId,
        // Mirror the create_page handler's body construction (wrapper expects htmlBody).
        htmlBody: `<!DOCTYPE html><html><head><title>${MARKER}diag</title></head><body><p>${MARKER}body</p></body></html>`,
        contentType: "text/html",
      }),
  });
  const sourceId = created.id;
  console.log(`  created source page (id len ${sourceId.length}).`);

  let copiedPageId: string | null = null;
  try {
    const diag = await refreshAndRetry({
      accountId,
      provider: "microsoft-onenote",
      providerAccountId,
      apiCall: async (accessToken) => {
        const url = `${graphApiBase()}/v1.0/me/onenote/pages/${encodeURIComponent(sourceId)}/copyToSection`;
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id: section.sectionId }),
        });
        const opLoc = res.headers.get("operation-location");
        const loc = res.headers.get("location");
        let bodyKeys: string[] = [];
        let bodyStatus: string | null = null;
        try {
          const text = await res.text();
          if (text) {
            const json = JSON.parse(text) as Record<string, unknown>;
            bodyKeys = Object.keys(json);
            bodyStatus = typeof json.status === "string" ? (json.status as string) : null;
          }
        } catch {
          bodyKeys = ["<non-json-body>"];
        }
        return {
          status: res.status,
          hasOperationLocation: !!opLoc,
          hasLocationHeader: !!loc,
          // The operation URL the production wrapper now returns (op-location ?? location).
          operationUrl: opLoc ?? loc,
          bodyKeys,
          bodyStatus,
        };
      },
    });
    console.log("DIAGNOSE: raw copyToSection response shape:");
    console.log(JSON.stringify({ ...diag, operationUrl: diag.operationUrl ? "<captured>" : null }, null, 2));

    // POLL the operation URL (authenticated) and log status + elapsed each attempt so we
    // can see whether OneNote reaches "completed" (and how long it takes) vs a parsing
    // issue. Bounded at 90s. Logs status strings + elapsed only (never ids/urls).
    if (diag.operationUrl) {
      const opUrl = diag.operationUrl;
      const start = Date.now();
      const deadline = start + 90_000;
      let attempt = 0;
      let lastStatus: string | null = null;
      let resourceFound = false;
      while (Date.now() < deadline) {
        attempt++;
        try {
          const poll = await refreshAndRetry({
            accountId,
            provider: "microsoft-onenote",
            providerAccountId,
            apiCall: async (accessToken) => {
              const r = await fetch(opUrl, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
              const t = await r.text();
              let j: Record<string, unknown> = {};
              try {
                j = JSON.parse(t) as Record<string, unknown>;
              } catch {
                /* non-json */
              }
              return {
                httpStatus: r.status,
                status: typeof j.status === "string" ? (j.status as string) : null,
                hasResourceId: typeof j.resourceId === "string",
                hasResourceLocation: typeof j.resourceLocation === "string",
                keys: Object.keys(j),
              };
            },
          });
          lastStatus = poll.status;
          const elapsed = Math.round((Date.now() - start) / 1000);
          console.log(
            `  poll #${attempt} (+${elapsed}s): http=${poll.httpStatus} status="${poll.status}" resourceId=${poll.hasResourceId} resourceLocation=${poll.hasResourceLocation} keys=[${poll.keys.join(",")}]`,
          );
          if (poll.status && poll.status.toLowerCase() === "completed") {
            resourceFound = poll.hasResourceId || poll.hasResourceLocation;
            break;
          }
          if (poll.status && ["failed", "cancelled", "canceled"].includes(poll.status.toLowerCase())) break;
        } catch (err) {
          console.log(`  poll #${attempt}: error ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      console.log(`POLL RESULT: lastStatus="${lastStatus}" completedWithResource=${resourceFound} totalAttempts=${attempt}`);
    }
    // If Graph returned the page synchronously, its body had an id — capture for cleanup
    // by re-reading the section for a NEW crsmoke-diag page distinct from the source.
  } catch (err) {
    console.log(`DIAGNOSE: copyToSection raw call failed: ${(err as Error).message}`);
  }

  // ── 3. Cleanup the diagnostic source + any crsmoke-diag copy created above. ──
  const post = await refreshAndRetry({
    accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) => pagesList({ accessToken, sectionId: section.sectionId, top: 100 }),
  });
  const diagPages = post.pages.filter((p) => (p.title ?? "").includes(`${MARKER}diag`));
  let diagDeleted = 0;
  for (const p of diagPages) {
    try {
      await refreshAndRetry({
        accountId,
        provider: "microsoft-onenote",
        providerAccountId,
        apiCall: (accessToken) => pagesDelete({ accessToken, pageId: p.id }),
      });
      diagDeleted++;
    } catch (err) {
      console.log(`  diag cleanup delete failed: ${(err as Error).message}`);
    }
  }
  void copiedPageId;
  const finalList = await refreshAndRetry({
    accountId,
    provider: "microsoft-onenote",
    providerAccountId,
    apiCall: (accessToken) => pagesList({ accessToken, sectionId: section.sectionId, top: 100 }),
  });
  const finalRemaining = finalList.pages.filter((p) => (p.title ?? "").includes(MARKER)).length;
  console.log(`DIAGNOSE CLEANUP: diag pages found ${diagPages.length} / deleted ${diagDeleted}.`);
  console.log(`FINAL: crsmoke- pages remaining in smoke section: ${finalRemaining}`);
}

main().catch((err) => {
  console.error("script error:", (err as Error).message);
  process.exitCode = 1;
});
