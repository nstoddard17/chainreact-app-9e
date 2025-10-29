import { z } from "zod"
import type { NodeDefinition } from "./types"
import { evaluateExpr } from "../mapping"

const configSchema = z.object({
  predicateExpr: z.string().min(1),
})

const inputSchema = z.object({}).passthrough()

const outputSchema = z.object({
  branch: z.enum(["true", "false"]),
  payload: z.any().optional(),
})

export const ifSwitchNode: NodeDefinition = {
  type: "logic.ifSwitch",
  title: "If Switch",
  description: "Routes execution based on a predicate expression.",
  configSchema,
  inputSchema,
  outputSchema,
  costHint: 0,
  async run({ input, config, ctx }) {
    const result = await evaluateExpr(config.predicateExpr, {
      inputs: input ?? {},
      globals: ctx.globals ?? {},
      nodeOutputs: {},
      upstream: input,
    })

    return {
      output: {
        branch: result ? "true" : "false",
        payload: input,
      },
    }
  },
}
