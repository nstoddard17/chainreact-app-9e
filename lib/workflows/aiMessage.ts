import { resolveValue } from "@/lib/workflows/actions/core/resolveValue"
import { ActionResult } from "@/lib/workflows/actions"

import { logger } from '@/lib/utils/logger'

type OutputField = {
  name: string
  description?: string
}

type ExecuteAIMessageParams = {
  config: Record<string, any>
  input: Record<string, any>
  userId: string
}

function extractNodeOutput(value: any): any {
  if (!value) return value
  if (typeof value === "object") {
    if (value.output !== undefined) return value.output
    if (value.result !== undefined) return value.result
    if (value.data !== undefined) return value.data
  }
  return value
}

function parseOutputFieldConfig(raw: string | string[] | undefined): OutputField[] {
  if (!raw) return []

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === "string") {
          const [name, description] = entry.split("|").map((part) => part.trim())
          if (!name) return null
          return { name, description }
        }
        return null
      })
      .filter((item): item is OutputField => !!item?.name)
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, description] = line.split("|").map((part) => part.trim())
      return {
        name,
        description,
      }
    })
    .filter((item) => !!item.name)
}

function buildStructuredPrompt(fields: OutputField[]): string {
  if (fields.length === 0) {
    return `Respond with plain text. No JSON formatting is required.`
  }

  const fieldList = fields
    .map((field) => `- "${field.name}"${field.description ? `: ${field.description}` : ""}`)
    .join("\n")

  const keys = fields.map((field) => `"${field.name}"`).join(", ")

  return `Return ONLY valid JSON with the following keys: ${keys}.
Each key should be a string.

Field details:
${fieldList}

Do not include any additional keys or explanations.`
}

async function callOpenAIChat(params: {
  apiKey: string
  model: string
  temperature: number
  systemPrompt?: string
  userPrompt: string
}): Promise<string> {
  const { OpenAI } = await import("openai")

  const client = new OpenAI({
    apiKey: params.apiKey,
  })

  const completion = await client.chat.completions.create({
    model: params.model,
    temperature: params.temperature,
    messages: [
      params.systemPrompt
        ? {
            role: "system",
            content: params.systemPrompt,
          }
        : null,
      {
        role: "user",
        content: params.userPrompt,
      },
    ].filter(Boolean) as { role: "system" | "user"; content: string }[],
  })

  return completion.choices[0]?.message?.content?.trim() ?? ""
}

async function callAnthropicChat(params: {
  apiKey: string
  model: string
  temperature: number
  systemPrompt?: string
  userPrompt: string
}): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")

  const client = new Anthropic({
    apiKey: params.apiKey,
  })

  const response = await client.messages.create({
    model: params.model,
    max_tokens: 2048,
    temperature: params.temperature,
    system: params.systemPrompt,
    messages: [
      {
        role: "user",
        content: params.userPrompt,
      },
    ],
  })

  const textBlock = response.content.find((block: any) => block.type === "text")
  return textBlock?.text?.trim() ?? ""
}

function mapModelToProvider(model: string): "openai" | "anthropic" {
  if (model.startsWith("claude")) {
    return "anthropic"
  }
  return "openai"
}

function extractStructuredOutput(raw: string, fields: OutputField[]): Record<string, any> | null {
  if (fields.length === 0) return null

  const trimmed = raw.trim()
  if (!trimmed.startsWith("{")) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== "object" || parsed === null) return null
    return parsed
  } catch (error) {
    logger.warn("[AI Message] Failed to parse JSON output:", error)
    return null
  }
}

export async function executeAIMessage({
  config,
  input,
  userId,
}: ExecuteAIMessageParams): Promise<ActionResult> {
  const model = config.model || "gpt-4o-mini"
  const temperature = typeof config.temperature === "number" ? config.temperature : 0.7
  const apiSource = config.apiSource || "chainreact"
  const fields = parseOutputFieldConfig(config.outputFields)

  const { checkUsageLimit, trackUsage } = await import("@/lib/usageTracking")

  if (userId) {
    const usageCheck = await checkUsageLimit(userId, "ai_agent")
    if (!usageCheck.allowed) {
      return {
        success: false,
        output: {},
        message: `AI usage limit exceeded. You've used ${usageCheck.current}/${usageCheck.limit} AI message executions this month. Upgrade your plan for more AI usage.`,
        error: "AI usage limit exceeded",
      }
    }
  }

  if (!config.userPrompt) {
    return {
      success: false,
      output: {},
      message: "Message Prompt is required.",
      error: "Missing prompt",
    }
  }

  let apiKey = process.env.OPENAI_API_KEY
  const provider: "openai" | "anthropic" = mapModelToProvider(model)

  if (apiSource === "custom") {
    if (!config.customApiKey) {
      return {
        success: false,
        output: {},
        message: "A custom API key is required when using a custom API source.",
        error: "Missing API key",
      }
    }
    apiKey = config.customApiKey
  } else if (!apiKey) {
    return {
      success: false,
      output: {},
      message: "No platform API key configured. Add an OpenAI key to proceed.",
      error: "Missing platform API key",
    }
  }

  if (provider === "anthropic" && apiSource !== "custom") {
    apiKey = process.env.ANTHROPIC_API_KEY || ""
  }

  if (!apiKey) {
    return {
      success: false,
      output: {},
      message: "Required AI provider API key is not configured.",
      error: "Missing provider key",
    }
  }

  const resolvedPrompt = resolveValue(
    config.userPrompt,
    {
      ...input,
      input,
    },
    config.triggerOutputs
  )

  const structuredInstruction = buildStructuredPrompt(fields)
  const combinedSystemPrompt = [config.systemPrompt, structuredInstruction]
    .filter(Boolean)
    .join("\n\n")

  const contextNodeIds: string[] = Array.isArray(config.contextNodeIds)
    ? config.contextNodeIds
    : typeof config.contextNodeIds === "string"
      ? [config.contextNodeIds]
      : []

  const previousResults: Record<string, any> =
    (input?.nodeOutputs as Record<string, any>) ||
    (input?.previousResults as Record<string, any>) ||
    {}

  const contextSections: string[] = []

  contextNodeIds.forEach((nodeId) => {
    const rawValue =
      previousResults[nodeId] ??
      (typeof previousResults.get === "function" ? previousResults.get(nodeId) : undefined)

    if (rawValue === undefined || rawValue === null) {
      return
    }

    const extracted = extractNodeOutput(rawValue)

    try {
      const serialised = typeof extracted === "string"
        ? extracted
        : JSON.stringify(extracted, null, 2)

      if (serialised) {
        contextSections.push(`Step ${nodeId} Output:\n${serialised}`)
      }
    } catch (error) {
      logger.warn("[AI Message] Failed to serialise context for node", nodeId, error)
    }
  })

  const memoryNotes = config.memoryNotes
    ? `Memory Notes:\n${config.memoryNotes}`
    : null

  const contextBlock = contextSections.length > 0
    ? `Context from selected steps:\n${contextSections.join("\n\n")}`
    : null

  const finalUserPrompt = [
    resolvedPrompt,
    contextBlock,
    memoryNotes
  ]
    .filter(Boolean)
    .join("\n\n---\n\n")

  try {
    const rawResponse =
      provider === "anthropic"
        ? await callAnthropicChat({
            apiKey,
            model,
            temperature,
            systemPrompt: combinedSystemPrompt,
            userPrompt: finalUserPrompt,
          })
        : await callOpenAIChat({
            apiKey,
            model,
            temperature,
            systemPrompt: combinedSystemPrompt,
            userPrompt: finalUserPrompt,
          })

    const structured = extractStructuredOutput(rawResponse, fields)
    const output: Record<string, any> = {}

    if (config.includeRawOutput !== false) {
      output.output = rawResponse
    }

    if (structured) {
      output.structured_output = structured
      fields.forEach((field) => {
        if (structured[field.name] !== undefined) {
          output[field.name] = structured[field.name]
        }
      })
    }

    if (userId) {
      await trackUsage(userId, "ai_agent", "ai_message_execution", 1, {
        model,
        contextNodes: contextNodeIds,
        hasStructuredOutput: !!structured,
      })
    }

    return {
      success: true,
      output,
      message: "AI message generated successfully",
    }
  } catch (error: any) {
    logger.error("[AI Message] Execution failed:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to generate AI message",
      error: error.message,
    }
  }
}
