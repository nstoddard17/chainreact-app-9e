import { z } from "zod"
import type { NodeDefinition } from "./types"

const configSchema = z.object({
  webhookUrl: z.string().url().optional(),
  text: z.string().optional(),
  to: z.string().email().optional(),
  subject: z.string().optional(),
})

const inputSchema = z.object({}).passthrough()

const outputSchema = z.object({
  ok: z.literal(true),
})

export const notifyNode: NodeDefinition = {
  type: "notify.dispatch",
  title: "Notify",
  description: "Sends a message via Slack webhook or email fallback.",
  configSchema,
  inputSchema,
  outputSchema,
  costHint: 1,
  secrets: ["webhookUrl"],
  async run({ config }) {
    const message = config.text ?? ""
    if (!config.webhookUrl && !config.to) {
      throw new Error("Notify node requires either webhookUrl or to address")
    }

    if (config.webhookUrl) {
      await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      })
    } else {
      // Email fallback stub
    }

    return {
      output: { ok: true },
    }
  },
}
