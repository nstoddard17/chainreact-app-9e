#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

if (!url || !serviceKey) {
  console.error("FAIL — NEXT_PUBLIC_SUPABASE_URL or secret/service-role key missing.");
  process.exit(2);
}

console.log(`Supabase host: ${new URL(url).host}`);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
if (error) {
  console.error(error);
  process.exit(1);
}

const rows = data.users.map((u) => ({
  email: u.email,
  confirmed: !!u.email_confirmed_at,
  last_sign_in: u.last_sign_in_at,
  created: u.created_at,
  provider: u.app_metadata?.provider,
}));
rows.sort((a, b) => (b.last_sign_in ?? "").localeCompare(a.last_sign_in ?? ""));

console.log(`Total users: ${data.users.length}`);
console.table(rows);
