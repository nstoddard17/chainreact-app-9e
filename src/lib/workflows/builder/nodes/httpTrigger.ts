import { z } from "zod"
import type { NodeDefinition } from "./types"

const configSchema = z.object({})
const inputSchema = z.object({}).passthrough()
const outputSchema = z.object({
  payload: z.any(),
})

export const httpTriggerNode: NodeDefinition = {
  type: "http.trigger",
  title: "HTTP Trigger",
  description: "Receives HTTP payloads to start a run.",
  configSchema,
  inputSchema,
  outputSchema,
  costHint: 0,
  async run({ input }) {
    return {
      output: {
        payload: input?.payload ?? input,
      },
    }
  },
}
