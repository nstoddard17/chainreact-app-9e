import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
}
async function main() {
  const { getActiveForExecution } = await import("../../repositories/integrations");
  const { refreshAndRetry } = await import("../../services/oauth/refreshAndRetry");
  const { listSpreadsheets } = await import("../../integrations/google-sheets/api/listSpreadsheets");
  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const integration = await getActiveForExecution(accountId, "google-sheets", null);
  if (!integration) { console.log("NO_INTEGRATION"); process.exit(1); }
  await refreshAndRetry({
    accountId,
    provider: "google-sheets",
    providerAccountId: integration.providerAccountId,
    apiCall: (accessToken: string) => listSpreadsheets({ accessToken, maxResults: 1 } as never),
  });
  console.log("REFRESH_OK");
}
main().then(() => process.exit(0)).catch((e) => { console.log("REFRESH_FAIL:", (e as Error).message.slice(0, 120)); process.exit(1); });
