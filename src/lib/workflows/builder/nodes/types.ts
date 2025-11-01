import { z } from "zod"

export interface NodeExecutionContext {
  runId: string
  globals: Record<string, any>
  nodeId: string
  attempt: number
}

export interface NodeDefinition {
  type: string
  title: string
  description: string
  configSchema: z.ZodTypeAny
  inputSchema: z.ZodTypeAny
  outputSchema: z.ZodTypeAny
  costHint: number
  secrets?: string[]
  run(args: {
    input: any
    config: any
    ctx: NodeExecutionContext
  }): Promise<{ output: any; cost?: number }>
}

export type NodeCatalog = Record<string, NodeDefinition>
