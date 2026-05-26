#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TARGET_EMAIL = process.argv[2];
const NEW_PASSWORD = process.argv[3];

if (!TARGET_EMAIL || !NEW_PASSWORD) {
  console.error("Usage: node scripts/reset-user-password.mjs <email> <password>");
  process.exit(2);
}

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

const env = loadEnv(resolve(process.cwd(), ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error("FAIL — missing env vars.");
  process.exit(2);
}

console.log(`Supabase host: ${new URL(url).host}`);

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) { console.error(listErr); process.exit(1); }
const user = list.users.find((u) => u.email === TARGET_EMAIL);
if (!user) { console.error(`No user with email ${TARGET_EMAIL}`); process.exit(1); }

const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
  password: NEW_PASSWORD,
  email_confirm: true,
});
if (updErr) { console.error(updErr); process.exit(1); }

console.log("Password updated. Verifying via signInWithPassword...");
const anon = createClient(url, anonKey);
const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
  email: TARGET_EMAIL,
  password: NEW_PASSWORD,
});

console.log(JSON.stringify({
  email: TARGET_EMAIL,
  passwordChanged: true,
  verifyLoginOk: !signInErr,
  verifyError: signInErr?.message ?? null,
  userId: user.id,
}, null, 2));
