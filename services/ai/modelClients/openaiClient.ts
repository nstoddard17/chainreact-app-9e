/**
 * OpenAI model adapter (Slice 4.AI-34A) — the SECOND real adapter.
 *
 * Implements the provider-agnostic `core/ai` `ModelClient` contract against
 * the OpenAI **Responses API** (`POST /v1/responses`) using `fetch` — no
 * provider SDK dependency, exactly mirroring the Anthropic adapter's shape.
 *
 * **Not the default planner.** The React Agent stays on Anthropic / Sonnet
 * 4.6. This adapter only runs when a caller resolves an OpenAI model
 * (`getModelForProviderTier("openai", …)`) AND the `OPENAI_API_KEY` env is
 * present — neither happens on the default planner path today. Wiring it now
 * keeps the adapter testable so a future A/B / switch slice (AI-34B) can flip
 * routing without touching the request/response plumbing.
 *
 * Structured output: when the caller passes a `responseTool`, we force a
 * single function call via the Responses API's function-tool + `tool_choice`,
 * then return the call's `arguments` (already a JSON string) as
 * `ModelSuccess.text` — so the downstream strict parser
 * (`parseWorkflowPlanResponse`) stays the source of truth, identical to the
 * Anthropic path. (See AI-19: forced tool-use, never assistant prefill.)
 *
 * No-leak: the API key lives ONLY in the closure + the `Authorization`
 * request header. It is NEVER returned, logged, or placed in any
 * `ModelResult`. Provider error bodies are sanitized to a short, capped,
 * key-free summary.
 *
 * No live calls in tests: `fetchImpl` is injectable, so unit tests drive this
 * adapter entirely with a mock fetch.
 *
 * ⚠️ Live-verification note: the Responses API request/response field shapes
 * below (`instructions` / `input` / flat function tools / `output[]` with
 * `function_call.arguments` / `usage.input_tokens`) are implemented against
 * the documented Responses API. They MUST be confirmed against a live call
 * before AI-34B routes any real traffic to OpenAI. The adapter is structured
 * so only the parse/serialize helpers change if a field name differs.
 */

import {
  DEFAULT_MODEL_BUDGET,
  DEFAULT_MODEL_TIER,
  FEATURE_DEFAULT_TIER,
  getModelForProviderTier,
} from "@/core/ai/models";
import type {
  ModelClient,
  ModelFinishReason,
  ModelGenerateInput,
  ModelResult,
  ModelTier,
} from "@/core/ai/modelTypes";
import type { OpenAiModelClientOptions } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com";
const MAX_ERROR_SNIPPET = 200;

// ─── Response shapes (Responses API) ─────────────────────────────────────────

interface OpenAiOutputTextPart {
  readonly type?: string;
  readonly text?: string;
}

interface OpenAiOutputItem {
  readonly type?: string;
  // message item
  readonly role?: string;
  readonly content?: readonly OpenAiOutputTextPart[];
  // function_call item
  readonly name?: string;
  readonly arguments?: string;
  readonly call_id?: string;
}

interface OpenAiResponsesBody {
  readonly output?: readonly OpenAiOutputItem[];
  /** SDK convenience aggregation — present in some payloads, not all. */
  readonly output_text?: string;
  readonly status?: string | null;
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly total_tokens?: number;
  };
}

function mapStatus(
  status: string | null | undefined,
  incompleteReason: string | undefined,
): ModelFinishReason {
  switch (status) {
    case "completed":
      return "stop";
    case "incomplete":
      if (incompleteReason === "max_output_tokens") return "length";
      if (incompleteReason === "content_filter") return "content_filter";
      return "unknown";
    case "failed":
      return "error";
    default:
      return "unknown";
  }
}

/** Concatenate all `output_text` parts across `message` output items. */
function extractText(body: OpenAiResponsesBody): string {
  if (typeof body.output_text === "string" && body.output_text.length > 0) {
    return body.output_text;
  }
  if (!Array.isArray(body.output)) return "";
  const parts: string[] = [];
  for (const item of body.output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        parts.push(part.text);
      }
    }
  }
  return parts.join("");
}

/**
 * Extract the FIRST `function_call` output item whose `name` matches the
 * forced tool. Returns the `arguments` JSON string, or `null` when no
 * matching call exists (the planner maps this to INVALID_RESPONSE).
 */
function extractFunctionCallArguments(
  body: OpenAiResponsesBody,
  toolName: string,
): string | null {
  if (!Array.isArray(body.output)) return null;
  for (const item of body.output) {
    if (
      item?.type === "function_call" &&
      item.name === toolName &&
      typeof item.arguments === "string"
    ) {
      return item.arguments;
    }
  }
  return null;
}

/** Sanitize a provider error body into a short, key-free snippet. */
function sanitizeErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { type?: string; message?: string; code?: string };
    };
    const type = parsed.error?.type ?? parsed.error?.code;
    const message = parsed.error?.message;
    const parts = [type, message].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    if (parts.length > 0) return parts.join(": ").slice(0, MAX_ERROR_SNIPPET);
  } catch {
    /* fall through to a generic, body-free message */
  }
  return "provider error";
}

/**
 * Split the provider-agnostic messages into the Responses API's
 * `instructions` (system) + `input` (user/assistant turns) shape.
 */
function splitMessages(messages: ModelGenerateInput["messages"]): {
  instructions: string;
  input: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const input: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else input.push({ role: m.role, content: m.content });
  }
  return { instructions: systemParts.join("\n\n"), input };
}

export function createOpenAiModelClient(
  options: OpenAiModelClientOptions,
): ModelClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_BUDGET.timeoutMs;

  return {
    async generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult> {
      // Resolve against the OpenAI registry (never the default Anthropic one)
      // so this adapter only ever serves OpenAI model ids.
      const tier: ModelTier =
        input.tier ?? FEATURE_DEFAULT_TIER[input.feature] ?? DEFAULT_MODEL_TIER;
      const model = getModelForProviderTier("openai", tier);

      const { instructions, input: turns } = splitMessages(input.messages);
      if (turns.length === 0) {
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: "INVALID_INPUT",
          message: "No user/assistant messages to send.",
        };
      }

      const doFetch = options.fetchImpl ?? globalThis.fetch;
      if (typeof doFetch !== "function") {
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: "NETWORK_ERROR",
          message: "fetch is not available in this runtime.",
          retryable: false,
        };
      }

      const tool = input.responseTool;
      const body = JSON.stringify({
        model: model.id,
        max_output_tokens: input.maxOutputTokens ?? model.maxOutputTokens,
        ...(instructions ? { instructions } : {}),
        input: turns,
        ...(tool
          ? {
              tools: [
                {
                  type: "function",
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.inputSchema,
                },
              ],
              tool_choice: { type: "function", name: tool.name },
            }
          : {}),
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
      try {
        const res = await doFetch(`${baseUrl}/v1/responses`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
            ...(options.organization
              ? { "openai-organization": options.organization }
              : {}),
          },
          body,
          signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;

        if (!res.ok) {
          const snippet = sanitizeErrorBody(await res.text().catch(() => ""));
          const retryable = res.status === 429 || res.status >= 500;
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: res.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
            message: `OpenAI API error (HTTP ${res.status}): ${snippet}`,
            retryable,
            latencyMs,
          };
        }

        let parsed: OpenAiResponsesBody;
        try {
          parsed = (await res.json()) as OpenAiResponsesBody;
        } catch {
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: "INVALID_RESPONSE",
            message: "OpenAI response was not valid JSON.",
            retryable: false,
            latencyMs,
          };
        }

        const usage = parsed.usage
          ? {
              usage: {
                inputTokens: parsed.usage.input_tokens ?? 0,
                outputTokens: parsed.usage.output_tokens ?? 0,
              },
            }
          : {};
        const finishReason = mapStatus(
          parsed.status,
          parsed.incomplete_details?.reason,
        );

        // Forced-tool path — the model MUST emit a function_call for the
        // forced tool. Anything else is INVALID_RESPONSE; we deliberately
        // do NOT fall back to freeform text parsing (that's the bug forced
        // tool-use solves — mirrors the Anthropic adapter).
        if (tool) {
          const args = extractFunctionCallArguments(parsed, tool.name);
          if (args === null) {
            return {
              ok: false,
              modelId: model.id,
              feature: input.feature,
              failureCode: "INVALID_RESPONSE",
              message: `OpenAI response did not call the forced tool '${tool.name}'.`,
              retryable: true,
              latencyMs,
            };
          }
          if (args.trim() === "") {
            return {
              ok: false,
              modelId: model.id,
              feature: input.feature,
              failureCode: "INVALID_RESPONSE",
              message: `OpenAI tool call for '${tool.name}' had no arguments payload.`,
              retryable: true,
              latencyMs,
            };
          }
          return {
            ok: true,
            modelId: model.id,
            feature: input.feature,
            text: args,
            finishReason,
            ...usage,
            latencyMs,
          };
        }

        const text = extractText(parsed);
        if (text.trim() === "") {
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: "EMPTY_RESPONSE",
            message: "OpenAI response contained no text content.",
            retryable: true,
            latencyMs,
          };
        }

        return {
          ok: true,
          modelId: model.id,
          feature: input.feature,
          text,
          finishReason,
          ...usage,
          latencyMs,
        };
      } catch (err) {
        const latencyMs = Date.now() - startedAt;
        const aborted = err instanceof Error && err.name === "AbortError";
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
          message: aborted
            ? `OpenAI request timed out after ${timeoutMs}ms.`
            : "Network error calling the OpenAI API.",
          retryable: true,
          latencyMs,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
