// TYPEFORM-2 Phase 13 — persisted-run output readback (safety verification).
// Reads the smoke runs' step outputs via service-role and asserts the BOUNDED
// contract: allowed keys only, no respondent metadata / response_url / raw
// provider keys / bearer material. Prints key sets + booleans, NEVER answer
// or hidden-field content.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
for (const l of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || process.env[m[1]!]) continue;
  let v = m[2]!.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]!] = v;
}
const RUN_IDS = process.argv.slice(2);
const FORBIDDEN_KEYS = ["metadata", "response_url", "responseUrl", "variables", "landing_id", "landingId", "response_id", "token", "calculated", "definition", "access_token", "refresh_token"];
(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const runId of RUN_IDS) {
    const { data: run, error } = await supabase.from("workflow_runs").select("id,status,steps").eq("id", runId).single();
    if (error || !run) { console.log(runId, "READ ERROR", error?.message); continue; }
    console.log("run", runId, "status:", run.status);
    const steps = (run.steps ?? []) as Array<{ nodeId?: string; node_id?: string; status?: string; output?: Record<string, unknown> }>;
    for (const step of steps) {
      const nodeId = step.nodeId ?? step.node_id ?? "?";
      const nodeOut = step.output;
      if (!nodeOut || typeof nodeOut !== "object") { console.log("  node", nodeId, "status:", step.status, "(no output)"); continue; }
      const keys = Object.keys(nodeOut).sort();
      console.log("  node", nodeId, "keys:", JSON.stringify(keys));
      const serialized = JSON.stringify(nodeOut);
      for (const bad of FORBIDDEN_KEYS) {
        if (new RegExp(`"${bad}"\\s*:`).test(serialized)) console.log("  !! FORBIDDEN KEY PRESENT:", bad);
      }
      if ("found" in nodeOut) console.log("  found:", nodeOut.found, "responseToken match:", nodeOut.responseToken === process.env.SMOKE_TYPEFORM_RESPONSE_TOKEN);
      if ("responses" in nodeOut) {
        const rs = nodeOut.responses as Array<Record<string, unknown>>;
        console.log("  responses count:", rs.length, "totalItems:", nodeOut.totalItems, "hasMore:", nodeOut.hasMore, "nextBefore:", nodeOut.nextBefore);
        if (rs[0]) console.log("  responses[0] keys:", JSON.stringify(Object.keys(rs[0]).sort()), "answers[0] keys:", JSON.stringify(Object.keys((rs[0].answers as Array<Record<string, unknown>>)[0] ?? {}).sort()));
      }
      if ("answers" in nodeOut && Array.isArray(nodeOut.answers)) {
        console.log("  answers count:", (nodeOut.answers as unknown[]).length, "answers[0] keys:", JSON.stringify(Object.keys((nodeOut.answers as Array<Record<string, unknown>>)[0] ?? {}).sort()));
      }
    }
  }
})().then(() => process.exit(0)).catch((e) => { console.error("FATAL", (e as Error).message); process.exit(1); });
