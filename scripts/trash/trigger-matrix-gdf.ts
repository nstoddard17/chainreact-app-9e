import { ALL_TRIGGER_META } from "../../services/discovery/_metaInventory";
import { TRIGGER_CERTIFICATIONS } from "../../tests/trigger-smoke/triggerCertificationSeed";

const certByKey = new Map(TRIGGER_CERTIFICATIONS.map((c) => [`${c.provider}:${c.type}`, c]));
const rows = (ALL_TRIGGER_META as any[]).map((t) => {
  const key = `${t.provider}:${t.type}`;
  const cert = certByKey.get(key);
  return { key, provider: t.provider, activation: t.activation, status: cert ? cert.status : "UN_HARNESSED" };
});
const counts: Record<string, number> = {};
for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
console.log("TOTAL:", rows.length, JSON.stringify(counts));
console.log("--- UN_HARNESSED ---");
for (const r of rows.filter((r) => r.status === "UN_HARNESSED")) console.log(r.key, `[${r.activation}]`);
