import { z } from "zod"
import type { NodeDefinition } from "./types"

const configSchema = z.object({
  model: z.string().min(1),
  system: z.string().optional(),
  user: z.string().min(1),
  expect_json_schema: z.any().optional(),
})

const inputSchema = z.object({}).passthrough()

const outputSchema = z.object({
  json: z.any(),
  tokens: z.number().optional(),
  cost: z.number().optional(),
})

function parseJsonResponse(raw: string) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const err = new Error(`AI response is not valid JSON: ${message}`)
    Object.assign(err, { type: "InvalidJSON", raw })
    throw err
  }
}

export const aiGenerateNode: NodeDefinition = {
  type: "ai.generate",
  title: "AI Generate",
  description: "Generates structured JSON content using AI models.",
  configSchema,
  inputSchema,
  outputSchema,
  costHint: 1,
  async run({ config }) {
    const rawResponse = config.user
    const json = parseJsonResponse(rawResponse)
    return {
      output: {
        json,
      },
    }
  },
}
