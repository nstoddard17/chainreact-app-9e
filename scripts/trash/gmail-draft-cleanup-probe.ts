/**
 * One-off feasibility probe — is `gmail:create_draft` safely smoke-able?
 * (SMOKE-WRITE-44 candidate.)
 *
 * Gmail has NO drafts-delete action/API wrapper; the only registered cleanup is
 * `delete_email` (messages.delete / messages.trash, by messageId). A Gmail draft is a
 * separate resource wrapping a message, so this probe answers two questions WITHOUT the
 * blocked engine path (direct API only, not a workflow smoke):
 *   1. VERIFY: does `users.messages.list` (what certified search_emails uses) find a
 *      freshly-created draft by its marker subject?
 *   2. CLEANUP: does `users.messages.delete(messageId)` (the delete_email "permanent"
 *      path) actually REMOVE the draft (drafts.get -> 404), or leave a dangling draft?
 *
 * Always finishes with a raw `drafts.delete(draftId)` fallback so the probe never leaks,
 * regardless of what the messages.delete path does.
 *
 * Run: npx tsx scripts/trash/gmail-draft-cleanup-probe.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
// eslint-disable-next-line no-restricted-imports -- throwaway direct-API probe needs the service-role client (scripts/trash, not shipped code)
import { createClient } from "@supabase/supabase-js";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { usersDraftsCreate } from "@/integrations/gmail/api/usersDraftsCreate";
import { usersMessagesList } from "@/integrations/gmail/api/usersMessagesList";
import { usersMessagesDelete } from "@/integrations/gmail/api/usersMessagesDelete";
import { usersMessagesTrash } from "@/integrations/gmail/api/usersMessagesTrash";

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
const base = (): string => process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function main(): Promise<void> {
  loadEnvLocal();
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const account = process.env.SMOKE_ACCOUNT_ID!;
  const user = process.env.SMOKE_USER_ID!;

  const gm = await getActiveForExecution(account, "gmail", null, { connectedByUserId: user });
  if (!gm) return void console.log("gmail not connected — abort.");
  const pa = gm.providerAccountId;
  const call = <T>(apiCall: (t: string) => Promise<T>): Promise<T> =>
    refreshAndRetry({ accountId: account, provider: "gmail", providerAccountId: pa, apiCall });

  const marker = `crsmoke-probe-${Date.now()}-draft`;
  const raw = b64url(
    `To: smoke-draft@example.invalid\r\nSubject: ${marker}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${marker}-body\r\n`,
  );

  const draft = await call((t) => usersDraftsCreate({ accessToken: t, rawMessage: raw }));
  const draftId = draft.id;
  const messageId = draft.message.id;
  console.log(`draft created: draftId=${draftId} messageId=${messageId} labels=${JSON.stringify(draft.message.labelIds ?? [])}`);

  // 1. VERIFY feasibility — does messages.list (search_emails' engine) find the draft?
  let found = false;
  for (let i = 1; i <= 5 && !found; i++) {
    const list = await call((t) => usersMessagesList({ accessToken: t, q: `subject:${marker}`, maxResults: 10 }));
    const ids = (list.messages ?? []).map((m) => m.id);
    found = ids.includes(messageId);
    console.log(`  messages.list q=subject:${marker} attempt ${i}: ${ids.length} hit(s) ${found ? "<-- FOUND draft" : ""}`);
    if (!found) await sleep(2000);
  }
  // Also try the broader in:drafts scope.
  if (!found) {
    const list2 = await call((t) => usersMessagesList({ accessToken: t, q: `in:drafts ${marker}`, maxResults: 10 }));
    const ids2 = (list2.messages ?? []).map((m) => m.id);
    console.log(`  messages.list q=in:drafts ${marker}: ${ids2.length} hit(s) ${ids2.includes(messageId) ? "<-- FOUND" : ""}`);
    found = found || ids2.includes(messageId);
  }
  console.log(`VERIFY via messages.list: ${found ? "WORKS" : "did NOT find the draft (indexing lag or drafts excluded)"}`);

  // 2. CLEANUP via the delete_email "permanent" path (messages.delete by messageId).
  let cleanupRemovedDraft = false;
  try {
    await call((t) => usersMessagesDelete({ accessToken: t, messageId }));
    console.log(`messages.delete(messageId) OK`);
    await sleep(1500);
    // Does the DRAFT still exist? raw GET /drafts/{draftId}.
    const tok = await call((t) => Promise.resolve(t));
    const res = await fetch(`${base()}/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, { headers: { Authorization: `Bearer ${tok}` } });
    console.log(`  drafts.get(${draftId}) after messages.delete -> HTTP ${res.status}`);
    cleanupRemovedDraft = res.status === 404;
    console.log(`CLEANUP via messages.delete removed the draft: ${cleanupRemovedDraft ? "YES (draft gone)" : "NO (draft still present -> messages.delete is NOT a safe draft cleanup)"}`);
  } catch (e) {
    console.log(`messages.delete failed: ${(e as Error).message.slice(0, 120)}`);
  }

  // 2b. Also test the delete_email "trash" path (messages.trash) on a SECOND draft.
  const raw2 = b64url(`To: smoke-draft@example.invalid\r\nSubject: ${marker}-t\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\nbody\r\n`);
  const draft2 = await call((t) => usersDraftsCreate({ accessToken: t, rawMessage: raw2 }));
  console.log(`2nd draft: draftId=${draft2.id} messageId=${draft2.message.id}`);
  try {
    await call((t) => usersMessagesTrash({ accessToken: t, messageId: draft2.message.id }));
    console.log(`messages.trash(messageId) OK`);
    await sleep(1500);
    const tok = await call((t) => Promise.resolve(t));
    const res = await fetch(`${base()}/gmail/v1/users/me/drafts/${encodeURIComponent(draft2.id)}`, { headers: { Authorization: `Bearer ${tok}` } });
    console.log(`  drafts.get(${draft2.id}) after messages.trash -> HTTP ${res.status} (${res.status === 404 ? "draft GONE" : "draft STILL PRESENT"})`);
  } catch (e) {
    console.log(`messages.trash failed: ${(e as Error).message.slice(0, 120)}`);
  }
  // clean the 2nd draft regardless.
  try {
    const tok = await call((t) => Promise.resolve(t));
    await fetch(`${base()}/gmail/v1/users/me/drafts/${encodeURIComponent(draft2.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
  } catch { /* best-effort */ }

  // 3. Fallback — guarantee the probe leaves nothing (raw drafts.delete).
  try {
    const tok = await call((t) => Promise.resolve(t));
    const res = await fetch(`${base()}/gmail/v1/users/me/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
    console.log(`fallback drafts.delete(${draftId}) -> HTTP ${res.status} (204/404 = clean)`);
  } catch (e) {
    console.log(`fallback drafts.delete failed: ${(e as Error).message.slice(0, 80)}`);
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
