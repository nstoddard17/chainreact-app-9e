// TYPEFORM-2 Phase 13 — live Responses API probe (read-only).
// Proves: the reconnected credential carries responses:read (list succeeds),
// harvests a real completed response token for SMOKE_TYPEFORM_RESPONSE_TOKEN,
// and exercises pageSize bounds + before-cursor + since/query filters at the
// wrapper level. Prints ONLY opaque ids/counts — never answers/hidden content.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
for (const l of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || process.env[m[1]!]) continue;
  let v = m[2]!.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]!] = v;
}
const FORM_ID = "KRVNz1KP";
(async () => {
  const { getActiveForExecution } = await import("@/repositories/integrations");
  const { refreshAndRetry } = await import("@/services/oauth/refreshAndRetry");
  const { responsesList } = await import("@/integrations/_shared/typeform/api/responses");

  const accountId = process.env.SMOKE_ACCOUNT_ID!;
  const userId = process.env.SMOKE_USER_ID!;
  const integ = await getActiveForExecution(accountId, "typeform", null, { connectedByUserId: userId });
  if (!integ) throw new Error("no active typeform integration on the smoke account");
  console.log("integration ok; providerAccountId present:", !!integ.providerAccountId, "expiresAt:", integ.accessTokenExpiresAt);

  const call = (input: Record<string, unknown>) =>
    refreshAndRetry({
      accountId, provider: "typeform", providerAccountId: integ.providerAccountId,
      apiCall: (accessToken) => responsesList({ accessToken, formId: FORM_ID, pageSize: 3, ...input }),
    });

  // 1. Plain list — the responses:read scope proof.
  const page = await call({});
  console.log("list ok — count:", page.items.length, "totalItems:", page.totalItems);
  for (const it of page.items) {
    console.log("  token:", it.token, "submitted_at:", it.submitted_at, "answers:", it.answers?.length ?? 0, "hidden:", it.hidden ? Object.keys(it.hidden).length : 0, "score:", it.calculated?.score ?? null);
  }
  if (page.items.length === 0) throw new Error("no completed responses on the form — need at least one");
  const first = page.items[0]!;

  // 2. pageSize=1 bound.
  const one = await call({ pageSize: 1 });
  console.log("pageSize=1 -> count:", one.items.length, "(expect 1)");

  // 3. before-cursor: pass the first (newest) token; expect only OLDER items, not the cursor token itself.
  const older = await call({ before: first.token });
  console.log("before=<newest token> -> count:", older.items.length, "containsCursorToken:", older.items.some((i) => i.token === first.token));

  // 4. since filter: far future -> 0; far past -> >=1.
  const future = await call({ since: "2030-01-01T00:00:00Z" });
  const past = await call({ since: "2020-01-01T00:00:00Z" });
  console.log("since=2030 -> count:", future.items.length, "(expect 0); since=2020 -> count:", past.items.length, "(expect >=1)");

  // 5. query filter: nonsense string -> 0 (server-side search).
  const q = await call({ query: "zqxjkwv-no-such-answer-text" });
  console.log("query=nonsense -> count:", q.items.length, "(expect 0)");

  // 6. included_response_ids single-token lookup (the get_response path) + fake token.
  const byId = await call({ includedResponseIds: first.token, pageSize: 1 });
  console.log("included_response_ids=<real> -> count:", byId.items.length, "tokenMatches:", byId.items[0]?.token === first.token);
  const fake = await call({ includedResponseIds: "crsmoke-fake-token-notfound", pageSize: 1 });
  console.log("included_response_ids=<fake> -> count:", fake.items.length, "(expect 0)");

  console.log("HARVESTED_TOKEN:", first.token);
})().then(() => process.exit(0)).catch((e) => { console.error("FATAL", (e as Error).message); process.exit(1); });
