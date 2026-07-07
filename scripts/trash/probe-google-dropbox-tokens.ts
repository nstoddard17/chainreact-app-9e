import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const { getActiveForExecution } = await import("../../repositories/integrations");
  const { refreshAndRetry } = await import("../../services/oauth/refreshAndRetry");
  const accountId = process.env.SMOKE_ACCOUNT_ID!;

  const probes: Array<[string, (t: string) => Promise<unknown>]> = [
    ["google-sheets", async (t) => {
      const { listSpreadsheets } = await import("../../integrations/google-sheets/api/listSpreadsheets");
      return listSpreadsheets({ accessToken: t, maxResults: 1 } as never);
    }],
    ["google-docs", async (t) => {
      const { changesGetStartPageToken } = await import("../../integrations/google-drive/api/changesGetStartPageToken");
      return changesGetStartPageToken({ accessToken: t });
    }],
    ["google-drive", async (t) => {
      const { changesGetStartPageToken } = await import("../../integrations/google-drive/api/changesGetStartPageToken");
      return changesGetStartPageToken({ accessToken: t });
    }],
    ["google-calendar", async (t) => {
      const { eventsList } = await import("../../integrations/google-calendar/api/eventsList");
      return eventsList({ accessToken: t, calendarId: "primary", maxResults: 1 } as never);
    }],
    ["dropbox", async (t) => {
      const { filesListFolderGetLatestCursor } = await import("../../integrations/_shared/dropbox/api/filesListFolderGetLatestCursor");
      return filesListFolderGetLatestCursor({ accessToken: t, path: "", recursive: false });
    }],
  ];

  for (const [provider, call] of probes) {
    try {
      const integration = await getActiveForExecution(accountId, provider, null);
      if (!integration) { console.log(provider, "-> NO ACTIVE INTEGRATION"); continue; }
      await refreshAndRetry({
        accountId,
        provider,
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken: string) => call(accessToken),
      });
      console.log(provider, "-> OK (token valid / refreshed)");
    } catch (e) {
      console.log(provider, "-> FAIL:", (e as Error).message.slice(0, 200));
    }
  }
}
main().catch((e) => { console.error("FATAL:", e?.message); process.exit(1); });
