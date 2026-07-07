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
const PAIRS = [
  ["google-sheets", "new_worksheet"], ["google-sheets", "row_changed"],
  ["google-docs", "new_document"], ["google-docs", "document_updated"],
  ["google-drive", "file_changed"], ["google-calendar", "event_changed"],
  ["dropbox", "new_file"], ["facebook", "new_post"], ["facebook", "new_comment"],
];
async function main() {
  console.log("SMOKE_USER_ID === SMOKE_ACCOUNT_ID:", process.env.SMOKE_USER_ID === process.env.SMOKE_ACCOUNT_ID);
  for (const [provider, eventType] of PAIRS) {
    const { data, error } = await supabase
      .from("trigger_resources")
      .select("id, workflow_id, event_type")
      .eq("provider", provider!)
      .eq("event_type", eventType!);
    if (error) { console.log(provider, eventType, "ERR", error.message); continue; }
    console.log(provider + ":" + eventType, "rows:", (data ?? []).length);
  }
}
main().catch((e) => { console.error("FAIL:", e?.message); process.exit(1); });
