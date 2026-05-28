/**
 * Slice 4.AI-36 — live OpenAI planner verification (dev-only, one-off).
 *
 * Proves the React Agent PLANNER routes to OpenAI (gpt-4.1-mini) and never
 * Anthropic, against the REAL OpenAI API, for the AI-36 smoke prompts. It
 * resolves the planner client via the production routing
 * (`createPlannerModelClient`), builds the real planner request
 * (`buildWorkflowPlanRequest`), calls OpenAI, and parses the structured output
 * (`parseWorkflowPlanResponse`). It does NOT run the AI-5 preview (that needs a
 * real workflow) and does NOT mutate anything.
 *
 * Prints only SAFE fields (provider, model id, ok, finish reason, tokens, parse
 * result shape). NEVER prints the API key, raw prompt output, or config values.
 *
 * Run (Anthropic fallback disabled/unset, OpenAI planner on):
 *   ENABLE_OPENAI_PLANNER=true ENABLE_OPENAI_PROVIDER=true \
 *     npx tsx scripts/trash/verify-openai-planner.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPlannerModelClient } from "@/services/ai/modelClients";
import { buildWorkflowPlanRequest } from "@/services/ai/planner/buildWorkflowPlanRequest";
import { parseWorkflowPlanResponse } from "@/services/ai/planner/parseWorkflowPlanResponse";
import { WORKFLOW_PLAN_TOOL } from "@/services/ai/planner/workflowPlanTool";
import { getModelById } from "@/core/ai/models";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const PROMPTS: readonly string[] = [
  "Send me a Slack DM",
  "When Stripe payment fails send me a Slack DM",
  "When I get an email send a Slack message",
  "When I get a Gmail email send a Slack message",
  "Create an automation",
];

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";

async function main(): Promise<void> {
  loadEnvLocal();
  // Force the planner on for the smoke without depending on .env.local.
  process.env.ENABLE_OPENAI_PLANNER = process.env.ENABLE_OPENAI_PLANNER ?? "true";
  process.env.ENABLE_OPENAI_PROVIDER = process.env.ENABLE_OPENAI_PROVIDER ?? "true";

  console.log("=".repeat(72));
  console.log("OpenAI React Agent PLANNER verification (Slice 4.AI-36)");
  console.log("=".repeat(72));

  const routing = createPlannerModelClient({ feature: "creation" });
  console.log(`planner provider : ${routing.provider}`);
  console.log(`planner model    : ${routing.modelId} (telemetry provider=${getModelById(routing.modelId)?.provider ?? "?"})`);
  console.log(`max output       : ${routing.maxOutputTokens}`);
  console.log(`anthropic fallback: ${process.env.ENABLE_ANTHROPIC_PLANNER_FALLBACK === "true" ? "ENABLED (emergency)" : "disabled"}`);
  console.log("-".repeat(72));

  if (routing.provider !== "openai") {
    console.error(`Expected planner provider 'openai' but got '${routing.provider}'. Check ENABLE_OPENAI_PLANNER + OPENAI_API_KEY.`);
    process.exit(2);
  }

  for (const prompt of PROMPTS) {
    let request;
    try {
      request = await buildWorkflowPlanRequest({ userId: FAKE_USER_ID, userRequest: prompt, tier: routing.tier });
    } catch {
      console.log(`prompt "${prompt}" — could not build request (catalog/integrations lookup) — skipped`);
      continue;
    }
    const result = await routing.client.generateStructuredJson({
      ...request,
      feature: "creation",
      responseTool: WORKFLOW_PLAN_TOOL,
      maxOutputTokens: routing.maxOutputTokens,
    });
    console.log(`prompt          : "${prompt}"`);
    console.log(`  ok            : ${result.ok}`);
    console.log(`  provider      : ${getModelById(result.modelId)?.provider ?? "?"}`);
    console.log(`  model         : ${result.modelId}`);
    if (result.ok) {
      console.log(`  finish        : ${result.finishReason}`);
      console.log(`  tokens        : in=${result.usage?.inputTokens ?? "?"} out=${result.usage?.outputTokens ?? "?"}`);
      const parsed = parseWorkflowPlanResponse(result.text);
      if (parsed.ok) {
        console.log(`  parse         : ok`);
        console.log(`  requiredInput : ${parsed.response.requiredUserInput.length}`);
        console.log(`  hasPatch      : ${parsed.response.proposedPatch !== null}`);
        console.log(`  intentLen     : ${parsed.response.intentSummary.length} chars`);
      } else {
        console.log(`  parse         : FAILED (${parsed.code})`);
      }
    } else {
      console.log(`  failureCode   : ${result.failureCode}`);
    }
    console.log("-".repeat(72));
  }
  console.log("Planner verification complete. Provider should be 'openai' on every row; Anthropic is never called.");
}

if (process.env.JEST_WORKER_ID === undefined) {
  void main();
}
