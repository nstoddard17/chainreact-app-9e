import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const { data, error } = await supabase
    .from("integrations")
    .select("provider, provider_account_id, disconnected_at, needs_reconnect_at")
    .eq("account_id", process.env.SMOKE_ACCOUNT_ID!)
    .in("provider", ["google-sheets", "google-docs", "google-drive", "google-calendar", "dropbox", "facebook", "gmail"]);
  if (error) {
    console.error("QUERY ERROR:", JSON.stringify(error));
    process.exit(1);
  }
  for (const r of data ?? []) {
    console.log(r.provider, r.disconnected_at ? "DISCONNECTED" : r.needs_reconnect_at ? "NEEDS_RECONNECT" : "active", String(r.provider_account_id ?? "").slice(0, 12) + "…");
  }
  console.log("total:", (data ?? []).length);
}
main().catch((e) => { console.error("FAIL:", e?.message ?? JSON.stringify(e)); process.exit(1); });
