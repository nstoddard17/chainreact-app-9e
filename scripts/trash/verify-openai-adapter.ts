/**
 * Slice 4.AI-34B — live OpenAI adapter verification (dev-only, one-off).
 *
 * Drives the AI-34A OpenAI Responses-API adapter against the REAL OpenAI API
 * through the NORMAL model-client abstraction (`createModelClientForModel`,
 * resolved via `getModelForProviderTier("openai", tier)`) and prints only
 * SAFE fields. It exists to confirm — before AI-34C routes any real traffic —
 * that:
 *   1. the adapter's Responses-API request shape is accepted,
 *   2. forced function-tool / `tool_choice` returns `function_call.arguments`,
 *   3. the returned `text` is a JSON string downstream parsers can consume,
 *   4. usage tokens / latency / finish reason map correctly,
 *   5. no key or secret leaks.
 *
 * It does NOT mutate a workflow, apply a patch, write `ai_cost_events`, change
 * the default planner, or route production traffic — it is a standalone probe.
 *
 * Gate: refuses to run unless `ENABLE_OPENAI_PROVIDER=true` OR `--force` is
 * passed, so it can never fire by accident.
 *
 * No-leak: the API key is read from `process.env.OPENAI_API_KEY`, handed to the
 * adapter closure, and NEVER printed. A runtime guard aborts if the key ever
 * appears in the serialized result. The key is never interpolated into any
 * `console.*` call.
 *
 * Run:
 *   ENABLE_OPENAI_PROVIDER=true npx tsx scripts/trash/verify-openai-adapter.ts
 *   npx tsx scripts/trash/verify-openai-adapter.ts --force --tier=strong
 *
 * Flags:
 *   --force          run even if ENABLE_OPENAI_PROVIDER !== "true"
 *   --tier=fast      use OPENAI_MODELS.fast  (gpt-4.1-mini, default — cheapest)
 *   --tier=strong    use OPENAI_MODELS.strong (gpt-4.1)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getModelById, getModelForProviderTier, MODEL_API_KEY_ENV } from "@/core/ai/models";
import type {
  ModelGenerateInput,
  ModelResponseTool,
  ModelResult,
  ModelTier,
} from "@/core/ai/modelTypes";
import {
  createModelClientForModel,
  isOpenAiProviderEnabled,
} from "@/services/ai/modelClients";

// ─── Env loading (no dotenv dependency; mirrors the .mjs scripts) ────────────

/** Populate process.env from .env.local WITHOUT overriding already-set vars. */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return; // no .env.local — rely on the ambient environment
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

// ─── CLI parsing ─────────────────────────────────────────────────────────────

function parseTier(argv: readonly string[]): ModelTier {
  const arg = argv.find((a) => a.startsWith("--tier="));
  const value = arg?.slice("--tier=".length);
  return value === "strong" ? "strong" : "fast";
}

// ─── Safe summary (the ONLY thing printed) ───────────────────────────────────

interface SafeSummary {
  readonly success: boolean;
  readonly provider: string | undefined;
  readonly modelId: string;
  readonly tier: ModelTier;
  readonly latencyMs: number | undefined;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly finishReason: string | undefined;
  readonly failureCode: string | undefined;
  readonly retryable: boolean | undefined;
  readonly message: string | undefined;
  readonly argParsed: boolean | undefined;
  readonly argShape: string | undefined;
}

/** Describe the top-level shape of a parsed object as `key: type` pairs. */
function describeShape(value: unknown): string {
  if (value === null || typeof value !== "object") return typeof value;
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([k, v]) => `${k}: ${Array.isArray(v) ? "array" : typeof v}`,
  );
  return `{ ${entries.join(", ")} }`;
}

/**
 * Build the caller-safe summary from a `ModelResult`. Copies ONLY the
 * allow-listed fields — it can never surface an API key because no key-bearing
 * field exists on `ModelResult`, and `text` (success) is parsed for shape only.
 */
export function toSafeSummary(result: ModelResult, tier: ModelTier): SafeSummary {
  const provider = getModelById(result.modelId)?.provider;
  const base = {
    success: result.ok,
    provider,
    modelId: result.modelId,
    tier,
    latencyMs: result.latencyMs,
  } as const;

  if (result.ok) {
    let argParsed = false;
    let argShape: string | undefined;
    try {
      argShape = describeShape(JSON.parse(result.text));
      argParsed = true;
    } catch {
      argShape = "<not JSON>";
    }
    return {
      ...base,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      finishReason: result.finishReason,
      failureCode: undefined,
      retryable: undefined,
      message: undefined,
      argParsed,
      argShape,
    };
  }

  return {
    ...base,
    inputTokens: undefined,
    outputTokens: undefined,
    finishReason: undefined,
    failureCode: result.failureCode,
    retryable: result.retryable,
    message: result.message,
    argParsed: undefined,
    argShape: undefined,
  };
}

/** Render the summary into human-readable lines (key/secret-free by construction). */
export function formatSafeSummary(summary: SafeSummary): string {
  const lines = [
    `result          : ${summary.success ? "SUCCESS" : "FAILURE"}`,
    `provider        : ${summary.provider ?? "<unknown>"}`,
    `model id        : ${summary.modelId}`,
    `tier            : ${summary.tier}`,
    `latency (ms)    : ${summary.latencyMs ?? "<none>"}`,
  ];
  if (summary.success) {
    lines.push(
      `input tokens    : ${summary.inputTokens ?? "<none>"}`,
      `output tokens   : ${summary.outputTokens ?? "<none>"}`,
      `finish reason   : ${summary.finishReason ?? "<none>"}`,
      `args parsed     : ${summary.argParsed}`,
      `args shape      : ${summary.argShape}`,
    );
  } else {
    lines.push(
      `failure code    : ${summary.failureCode}`,
      `retryable       : ${summary.retryable}`,
      `message         : ${summary.message}`,
    );
  }
  return lines.join("\n");
}

// ─── The structured-output probe request ─────────────────────────────────────

const VERIFY_TOOL: ModelResponseTool = {
  name: "verify_adapter",
  description:
    "Return a tiny confirmation object proving the adapter round-trips structured output.",
  inputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean", description: "Always true." },
      message: { type: "string", description: "A short confirmation string." },
    },
    required: ["ok", "message"],
    additionalProperties: false,
  },
};

function buildRequest(tier: ModelTier): ModelGenerateInput {
  return {
    feature: "discovery",
    tier,
    maxOutputTokens: 200,
    responseTool: VERIFY_TOOL,
    messages: [
      {
        role: "system",
        content: "You verify an API adapter. Always call the provided tool, nothing else.",
      },
      {
        role: "user",
        content: 'Call verify_adapter with ok=true and message="adapter verified".',
      },
    ],
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal();

  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const tier = parseTier(argv);

  console.log("=".repeat(64));
  console.log("OpenAI adapter live verification (Slice 4.AI-34B) — dev-only probe");
  console.log("=".repeat(64));

  if (!isOpenAiProviderEnabled() && !force) {
    console.log(
      "Refusing to run: ENABLE_OPENAI_PROVIDER is not 'true' and --force was not passed.",
    );
    console.log("Set ENABLE_OPENAI_PROVIDER=true (or pass --force) to run the probe.");
    process.exit(2);
  }

  const apiKey = process.env[MODEL_API_KEY_ENV.openai];
  const model = getModelForProviderTier("openai", tier);
  // Precompute the presence string so no console line ever references the key
  // identifier — the no-secrets test scans console lines for exactly that.
  const keyPresent = apiKey ? "yes" : "no (expect NOT_CONFIGURED)";
  console.log(`Provider enabled : ${isOpenAiProviderEnabled()}  (force=${force})`);
  console.log(`Target tier      : ${tier}`);
  console.log(`Resolved model   : ${model.id} (provider=${model.provider})`);
  console.log(`API key present  : ${keyPresent}`);
  console.log("-".repeat(64));

  // The NORMAL abstraction: factory routes provider==="openai" → the adapter,
  // or NOT_CONFIGURED when the key is absent. No direct adapter construction.
  const client = createModelClientForModel(model, apiKey);
  const result = await client.generateStructuredJson(buildRequest(tier));

  // Runtime no-leak guard: the key must NEVER appear in the result payload.
  if (apiKey && JSON.stringify(result).includes(apiKey)) {
    console.error("ABORT — API key leaked into the model result. This is a bug.");
    process.exit(3);
  }

  console.log(formatSafeSummary(toSafeSummary(result, tier)));
  console.log("-".repeat(64));
  console.log(
    result.ok
      ? "Adapter verified: structured output round-tripped through the normal abstraction."
      : "Adapter call did not succeed — see failure code above (this is still a clean, typed result).",
  );

  process.exit(result.ok ? 0 : 1);
}

// Run only when executed directly (tsx). Importing the module under Jest
// (JEST_WORKER_ID is set in every worker) must NOT trigger a live call or
// process.exit — the pure `toSafeSummary` / `formatSafeSummary` helpers are
// imported by the no-secrets test.
if (process.env.JEST_WORKER_ID === undefined) {
  void main();
}
