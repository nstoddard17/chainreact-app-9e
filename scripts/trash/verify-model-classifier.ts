/**
 * Slice 4.AI-34C — live model-classifier verification (dev-only, one-off).
 *
 * Runs the OpenAI fast-tier intent classifier (`runModelNarrowingClassifier`)
 * against the REAL provider catalog for a couple of representative prompts and
 * prints ONLY safe fields (outcome, intentType, confidence, candidate provider
 * ids, broadOrAmbiguous). It does NOT run the planner, does NOT build/preview/
 * apply a patch, does NOT mutate anything, and NEVER prints the API key.
 *
 * Gate: the runner itself requires ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true +
 * ENABLE_OPENAI_PROVIDER=true + OPENAI_API_KEY. With any missing, it returns a
 * typed outcome (model_disabled / openai_not_configured) and the script reports
 * that cleanly — it never throws.
 *
 * Run:
 *   ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true ENABLE_OPENAI_PROVIDER=true \
 *     npx tsx scripts/trash/verify-model-classifier.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getProviderCatalog } from "@/services/ai/tools/providerCatalog";
import { runModelNarrowingClassifier } from "@/services/ai/planner/modelNarrowingClassifier";
import type { NarrowProvidersInput } from "@/services/ai/planner/narrowProvidersForPlan";

/** Populate process.env from .env.local WITHOUT overriding already-set vars. */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue;
    let value = m[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const PROMPTS: readonly string[] = [
  "When I get an email send a Slack message",
  "When a Stripe payment fails send me a Slack DM",
];

async function main(): Promise<void> {
  loadEnvLocal();

  console.log("=".repeat(64));
  console.log("OpenAI model intent-classifier verification (Slice 4.AI-34C)");
  console.log("=".repeat(64));

  const catalogRes = getProviderCatalog();
  if (!catalogRes.ok) {
    console.error("Catalog lookup failed — cannot verify classifier.");
    process.exit(1);
  }
  const catalog = catalogRes.data;
  console.log(`Catalog providers : ${catalog.providers.length}`);
  console.log(
    `Model classifier  : ${process.env.ENABLE_AI_MODEL_NARROWING_CLASSIFIER === "true" ? "enabled" : "disabled"}`,
  );
  console.log(
    `OpenAI provider   : ${process.env.ENABLE_OPENAI_PROVIDER === "true" ? "enabled" : "disabled"}`,
  );
  console.log("-".repeat(64));

  for (const userRequest of PROMPTS) {
    const input: NarrowProvidersInput = { userRequest, catalog, connectedIntegrations: [] };
    const { result, outcome } = await runModelNarrowingClassifier(input);
    console.log(`prompt          : "${userRequest}"`);
    console.log(`outcome         : ${outcome}`);
    if (result) {
      console.log(`intent          : ${result.intentType}`);
      console.log(`confidence      : ${result.confidence}`);
      console.log(`candidates      : ${result.candidateProviders.join(", ") || "(none)"}`);
      console.log(`triggerHints    : ${result.triggerHints.join(", ") || "(none)"}`);
      console.log(`actionHints     : ${result.actionHints.join(", ") || "(none)"}`);
      console.log(`broadOrAmbiguous: ${result.broadOrAmbiguous}`);
    } else {
      console.log("result          : null (fell back to deterministic narrowing — plan still proceeds)");
    }
    console.log("-".repeat(64));
  }

  console.log(
    "Classifier verification complete. The PLANNER itself remains Anthropic/Sonnet; this only augments which providers it sees.",
  );
}

if (process.env.JEST_WORKER_ID === undefined) {
  void main();
}
