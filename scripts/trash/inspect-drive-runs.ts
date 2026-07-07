import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
}
async function main() {
  const { listByWorkflowServiceRole } = await import("../../repositories/workflowRunsDiagnostics");
  const runs = await listByWorkflowServiceRole("d40e1f44-aad4-4056-8c9b-bc85e7b228ae", { includeRunning: true, limit: 10 });
  for (const r of runs) {
    const ev = (r as { triggerEvent?: { eventId?: string; payload?: Record<string, unknown> } }).triggerEvent;
    console.log(JSON.stringify({ status: r.status, eventId: ev?.eventId, name: (ev?.payload as any)?.name, changeKind: (ev?.payload as any)?.changeKind, modifiedTime: (ev?.payload as any)?.modifiedTime }));
  }
}
main().catch((e) => { console.error(e?.message); process.exit(1); });
