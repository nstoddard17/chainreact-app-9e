import { z } from "zod"
import type { NodeDefinition } from "./types"

const configSchema = z.object({})
const inputSchema = z.object({}).passthrough()
const outputSchema = z.object({}).passthrough()

export const mapperNode: NodeDefinition = {
  type: "mapper.node",
  title: "Mapper",
  description: "Identity node that forwards mapped input downstream.",
  configSchema,
  inputSchema,
  outputSchema,
  costHint: 0,
  async run({ input }) {
    const output = input ? JSON.parse(JSON.stringify(input)) : input
    return { output }
  },
}
