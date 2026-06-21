#!/usr/bin/env node
/**
 * Platform-operator / internal-admin seed script — mark a known internal/test
 * account as internal-free billing, or revert it to standard
 * (Slice 4.BILLING-INTERNAL-ENTITLEMENT-1 / BIE-1).
 *
 * Run by a ChainReact platform operator (Marcus / business partner / internal
 * staff), NOT a customer/team account owner/admin. ACCOUNT-level, server-only,
 * service-role. There is no client/HTTP toggle and no UI — flipping internal
 * billing is intentionally an out-of-band internal admin action.
 * Mirrors the column writes of repositories/accountBilling
 * (set/revert BillingMode service-role helpers) and the consistency CHECK from the
 * migration: a `standard` row carries NO internal metadata.
 *
 *   Mark internal-free:
 *     node scripts/mark-account-internal.mjs <accountId> <reason> <byEmail>
 *       reason ∈ employee | qa | demo | load_test | partner | other
 *       byEmail = the acting platform operator / internal admin's auth email
 *                (recorded for audit provenance)
 *
 *   Revert to standard:
 *     node scripts/mark-account-internal.mjs --revert <accountId>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const INTERNAL_REASONS = ["employee", "qa", "demo", "load_test", "partner", "other"];

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error("Usage:");
  console.error("  node scripts/mark-account-internal.mjs <accountId> <reason> <byEmail>");
  console.error(`    reason ∈ ${INTERNAL_REASONS.join(" | ")}`);
  console.error("  node scripts/mark-account-internal.mjs --revert <accountId>");
  process.exit(2);
}

const args = process.argv.slice(2);
const revert = args[0] === "--revert";

const env = loadEnv(resolve(process.cwd(), ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) usage("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");

console.log(`Supabase host: ${new URL(url).host}`);
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

if (revert) {
  const accountId = args[1];
  if (!accountId) usage("revert requires <accountId>");

  const { data, error } = await admin
    .from("account_billing")
    .update({
      billing_mode: "standard",
      internal_reason: null,
      internal_set_by_user_id: null,
      internal_set_at: null,
    })
    .eq("account_id", accountId)
    .select("account_id, billing_mode");
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) { console.error(`No billing row for account ${accountId}`); process.exit(1); }
  console.log(JSON.stringify({ accountId, billingMode: "standard", reverted: true }, null, 2));
  process.exit(0);
}

const [accountId, reason, byEmail] = args;
if (!accountId || !reason || !byEmail) usage("mark requires <accountId> <reason> <byEmail>");
if (!INTERNAL_REASONS.includes(reason)) usage(`invalid reason ${JSON.stringify(reason)}`);

// Resolve the acting platform operator / internal admin's user id from their
// email (audit provenance + FK).
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) { console.error(listErr); process.exit(1); }
const actor = list.users.find((u) => u.email === byEmail);
if (!actor) { console.error(`No user with email ${byEmail}`); process.exit(1); }

const { data, error } = await admin
  .from("account_billing")
  .update({
    billing_mode: "internal_free",
    internal_reason: reason,
    internal_set_by_user_id: actor.id,
    internal_set_at: new Date().toISOString(),
  })
  .eq("account_id", accountId)
  .select("account_id, billing_mode, internal_reason, internal_set_at");
if (error) { console.error(error); process.exit(1); }
if (!data || data.length === 0) { console.error(`No billing row for account ${accountId}`); process.exit(1); }

console.log(JSON.stringify({
  accountId,
  billingMode: "internal_free",
  internalReason: reason,
  setByUserId: actor.id,
  setByEmail: byEmail,
}, null, 2));
