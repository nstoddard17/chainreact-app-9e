/**
 * Anthropic model adapter (Slice 4.AI-8C) — the first REAL adapter.
 *
 * Implements the `core/ai` `ModelClient` contract against the Anthropic Messages
 * API using `fetch` (no provider SDK dependency). It resolves the target model
 * from the centralized config (`core/ai/models`), splits the AI-8A prompt into
 * Anthropic's `system` + `messages` shape, enforces a timeout via Abort
 * controller, and maps every provider/network/parse outcome to a typed
 * `ModelResult`.
 *
 * No-leak: the API key lives only in the closure + the `x-api-key` request
 * header. It is NEVER returned, logged, or placed in any `ModelResult`. Provider
 * error bodies are sanitized to a short, capped, key-free summary.
 *
 * No live calls in tests: `fetchImpl` is injectable, so unit tests drive this
 * adapter entirely with a mock fetch.
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §4.1/§9.
 */

import { DEFAULT_MODEL_BUDGET, getModelForFeature, getModelForTier } from "@/core/ai/models";
import type {
  ModelClient,
  ModelFinishReason,
  ModelGenerateInput,
  ModelResult,
} from "@/core/ai/modelTypes";
import type { AnthropicModelClientOptions } from "./types";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const MAX_ERROR_SNIPPET = 200;

// NOTE (Slice 4.AI-12C, reverted): an earlier revision of this adapter appended
// a trailing assistant `{` "prefill" turn to force a JSON-object start. The
// Claude 4.x models (`claude-sonnet-4-6`, `claude-haiku-4-5`) REJECT it with
// HTTP 400 `invalid_request_error: This model does not support assistant
// message prefill. The conversation must end with a user message.` Removed.
//
// Slice 4.AI-19 — live smoke against Claude Sonnet 4.6 confirmed prompt-only
// JSON enforcement is unreliable: the model returned an out-of-shape text
// response causing PARSE_FAILED/NOT_JSON. The supported alternative is forced
// tool_choice. When the caller passes `responseTool`, this adapter:
//   - sends `tools: [responseTool]` + `tool_choice: { type: "tool", name }`
//   - extracts the `tool_use` content block matching `responseTool.name`
//   - returns `JSON.stringify(tool_use.input)` as `ModelSuccess.text`
// so the downstream strict parser (`parseWorkflowPlanResponse`) stays the
// source of truth. The existing text-prompt path is preserved for callers
// that don't pass a `responseTool` (currently none in V2, but the boundary is
// kept generic).

interface AnthropicTextBlock {
  readonly type?: string;
  readonly text?: string;
}

interface AnthropicToolUseBlock {
  readonly type?: string;
  readonly id?: string;
  readonly name?: string;
  readonly input?: unknown;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

interface AnthropicMessageResponse {
  readonly content?: readonly AnthropicContentBlock[];
  readonly stop_reason?: string | null;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

function mapStopReason(reason: string | null | undefined): ModelFinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
      return "stop";
    case "max_tokens":
      return "length";
    default:
      return "unknown";
  }
}

/** Extract the concatenated text content from an Anthropic message response. */
function extractText(body: AnthropicMessageResponse): string {
  if (!Array.isArray(body.content)) return "";
  return body.content
    .filter(
      (b): b is AnthropicTextBlock =>
        b?.type === "text" && typeof (b as AnthropicTextBlock).text === "string",
    )
    .map((b) => b.text as string)
    .join("");
}

/**
 * Extract the FIRST `tool_use` content block whose `name` matches the forced
 * tool. Returns `null` when no matching block exists (the planner maps this to
 * INVALID_RESPONSE). The tool input itself is intentionally not type-narrowed
 * here — the planner-side parser (`parseWorkflowPlanResponse`) re-validates
 * the structure.
 */
function extractToolUse(
  body: AnthropicMessageResponse,
  toolName: string,
): AnthropicToolUseBlock | null {
  if (!Array.isArray(body.content)) return null;
  for (const block of body.content) {
    if (
      block?.type === "tool_use" &&
      typeof (block as AnthropicToolUseBlock).name === "string" &&
      (block as AnthropicToolUseBlock).name === toolName
    ) {
      return block as AnthropicToolUseBlock;
    }
  }
  return null;
}

/**
 * Sanitize a provider error body into a short, key-free snippet. Anthropic
 * errors are `{ error: { type, message } }`; we surface only the type + a capped
 * message, never the raw body wholesale (defense in depth — the API key lives in
 * request headers, never the response, but we stay conservative).
 */
function sanitizeErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } };
    const type = parsed.error?.type;
    const message = parsed.error?.message;
    const parts = [type, message].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length > 0) return parts.join(": ").slice(0, MAX_ERROR_SNIPPET);
  } catch {
    /* fall through to a generic, body-free message */
  }
  return "provider error";
}

/** Split the AI-8A messages into Anthropic's separate `system` + turn list. */
function splitMessages(messages: ModelGenerateInput["messages"]): {
  system: string;
  turns: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else turns.push({ role: m.role, content: m.content });
  }
  return { system: systemParts.join("\n\n"), turns };
}

export function createAnthropicModelClient(
  options: AnthropicModelClientOptions,
): ModelClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MODEL_BUDGET.timeoutMs;
  const anthropicVersion = options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  return {
    async generateStructuredJson(input: ModelGenerateInput): Promise<ModelResult> {
      const model = input.tier
        ? getModelForTier(input.tier)
        : getModelForFeature(input.feature);

      // This adapter only serves Anthropic models. A config that points a tier
      // at another provider fails safely rather than calling the wrong API.
      if (model.provider !== "anthropic") {
        return {
          ok: false,
          modelId: model.id,
          feature: input.feature,
          failureCode: "CONFIGURATION_ERROR",
          message: `Anthropic adapter cannot serve a '${model.provider}' model.`,
        };
      }

      const { system, turns } = splitMessages(input.messages);
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

      // Slice 4.AI-19 — when the caller provides a `responseTool`, force the
      // model to call exactly that tool via `tool_choice`. This is the
      // structured-output path Claude 4.x supports (assistant-prefill is
      // rejected; tool-use is the recommended alternative for guaranteed JSON
      // output). Otherwise fall through to plain text generation (preserved
      // for callers that don't need structured output).
      const tool = input.responseTool;
      const body = JSON.stringify({
        model: model.id,
        max_tokens: input.maxOutputTokens ?? model.maxOutputTokens,
        ...(system ? { system } : {}),
        messages: turns,
        ...(tool
          ? {
              tools: [
                {
                  name: tool.name,
                  description: tool.description,
                  input_schema: tool.inputSchema,
                },
              ],
              tool_choice: { type: "tool", name: tool.name },
            }
          : {}),
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
      try {
        const res = await doFetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "anthropic-version": anthropicVersion,
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
            message: `Anthropic API error (HTTP ${res.status}): ${snippet}`,
            retryable,
            latencyMs,
          };
        }

        let parsed: AnthropicMessageResponse;
        try {
          parsed = (await res.json()) as AnthropicMessageResponse;
        } catch {
          return {
            ok: false,
            modelId: model.id,
            feature: input.feature,
            failureCode: "INVALID_RESPONSE",
            message: "Anthropic response was not valid JSON.",
            retryable: false,
            latencyMs,
          };
        }

        // Slice 4.AI-19 — when a `responseTool` was forced, the model MUST
        // respond with a tool_use block whose `name` matches. Anything else
        // (loose prose, wrong tool name, missing input) is an
        // INVALID_RESPONSE — we deliberately do NOT fall back to freeform
        // text parsing because that's the bug forced tool-use solves.
        if (tool) {
          const toolUse = extractToolUse(parsed, tool.name);
          if (!toolUse) {
            return {
              ok: false,
              modelId: model.id,
              feature: input.feature,
              failureCode: "INVALID_RESPONSE",
              message: `Anthropic response did not call the forced tool '${tool.name}'.`,
              retryable: true,
              latencyMs,
            };
          }
          if (toolUse.input === undefined || toolUse.input === null) {
            return {
              ok: false,
              modelId: model.id,
              feature: input.feature,
              failureCode: "INVALID_RESPONSE",
              message: `Anthropic tool_use for '${tool.name}' had no input payload.`,
              retryable: true,
              latencyMs,
            };
          }
          // Stringify the structured object so it flows through the downstream
          // strict parser unchanged — the parser remains the source of truth
          // for schema / patch / secret validation.
          let toolInputText: string;
          try {
            toolInputText = JSON.stringify(toolUse.input);
          } catch {
            return {
              ok: false,
              modelId: model.id,
              feature: input.feature,
              failureCode: "INVALID_RESPONSE",
              message: `Anthropic tool_use input for '${tool.name}' was not serializable JSON.`,
              retryable: false,
              latencyMs,
            };
          }
          return {
            ok: true,
            modelId: model.id,
            feature: input.feature,
            text: toolInputText,
            finishReason: mapStopReason(parsed.stop_reason),
            ...(parsed.usage
              ? {
                  usage: {
                    inputTokens: parsed.usage.input_tokens ?? 0,
                    outputTokens: parsed.usage.output_tokens ?? 0,
                  },
                }
              : {}),
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
            message: "Anthropic response contained no text content.",
            retryable: true,
            latencyMs,
          };
        }

        return {
          ok: true,
          modelId: model.id,
          feature: input.feature,
          text,
          finishReason: mapStopReason(parsed.stop_reason),
          ...(parsed.usage
            ? {
                usage: {
                  inputTokens: parsed.usage.input_tokens ?? 0,
                  outputTokens: parsed.usage.output_tokens ?? 0,
                },
              }
            : {}),
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
            ? `Anthropic request timed out after ${timeoutMs}ms.`
            : "Network error calling the Anthropic API.",
          retryable: true,
          latencyMs,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
