import { z } from "zod"
import type { NodeDefinition } from "./types"

const configSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  bodyExpr: z.string().optional(),
})

const inputSchema = z.object({}).passthrough()

const outputSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string()),
  body: z.any(),
})

export const httpRequestNode: NodeDefinition = {
  type: "http.request",
  title: "HTTP Request",
  description: "Makes an HTTP request to the configured URL.",
  configSchema,
  inputSchema,
  outputSchema,
  costHint: 1,
  async run({ config }) {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.bodyExpr,
    })

    const contentType = response.headers.get("content-type") ?? ""
    let body: any
    if (contentType.includes("application/json")) {
      body = await response.json().catch(() => response.text())
    } else {
      body = await response.text()
    }

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      output: {
        status: response.status,
        headers,
        body,
      },
    }
  },
}
