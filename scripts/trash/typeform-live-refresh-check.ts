// LIVE refresh + rotation check through the REAL persisting dispatcher path.
// Proves: refresh succeeds, a NEW access token expiry is persisted, and the
// ROTATED refresh token is stored (old one is invalidated by Typeform).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
for (const l of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || process.env[m[1]!]) continue;
  let v = m[2]!.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]!] = v;
}
(async () => {
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refresh } = await import("@/services/oauth/dispatcher");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");
  const { formsList } = await import("@/integrations/_shared/typeform/api/forms");

  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const userId = process.env.SMOKE_USER_ID!;
  const before = (await getActiveForExecution(accountId, "typeform", null, { connectedByUserId: userId }))!;
  console.log("before: expiresAt=", before.accessTokenExpiresAt);

  const { integration: after } = await refresh({ accountId, provider: "typeform", providerAccountId: before.providerAccountId });
  console.log("after:  expiresAt=", after.accessTokenExpiresAt);
  console.log("access token ciphertext changed:", after.accessTokenEncrypted !== before.accessTokenEncrypted);
  console.log("refresh token ciphertext changed (rotation persisted):", after.refreshTokenEncrypted !== before.refreshTokenEncrypted);

  // The NEW credential must be live-usable (proves the rotated pair is coherent).
  const page = await refreshAndRetry({
    accountId, provider: "typeform", providerAccountId: after.providerAccountId,
    apiCall: (accessToken) => formsList({ accessToken, pageSize: 1 }),
  });
  console.log("post-refresh live API call ok, forms page items:", page.items.length);
})().then(() => process.exit(0)).catch((e) => { console.error("FATAL", (e as Error).message); process.exit(1); });
