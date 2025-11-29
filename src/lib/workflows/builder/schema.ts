import { z, type ZodType } from "zod"

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export const JsonValueSchema: ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
)

export const PortSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["input", "output", "trigger", "condition"]).default("input"),
  schema: JsonValueSchema.optional(),
  description: z.string().optional(),
  metadata: z.record(JsonValueSchema).optional(),
})

export type Port = z.infer<typeof PortSchema>

export const MappingSchema = z
  .object({
    id: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    expr: z.string().min(1),
    required: z.boolean().default(true),
    description: z.string().optional(),
    metadata: z.record(JsonValueSchema).optional(),
  })
  .refine(
    (value) => typeof value.target === "string" || typeof value.to === "string",
    {
      message: "Mapping requires either 'target' or 'to' path",
      path: ["target"],
    }
  )

export type Mapping = z.infer<typeof MappingSchema>

export const EdgeEndpointSchema = z.object({
  nodeId: z.string().min(1),
  portId: z.string().min(1).optional(),
})

export const EdgeSchema = z.object({
  id: z.string().min(1),
  from: EdgeEndpointSchema,
  to: EdgeEndpointSchema,
  conditionExpr: z.string().optional(),
  mappings: z.array(MappingSchema).default([]),
  metadata: z.record(JsonValueSchema).optional(),
})

export type Edge = z.infer<typeof EdgeSchema>

export const NodeIOSchema = z.object({
  inputSchema: JsonValueSchema.optional(),
  outputSchema: JsonValueSchema.optional(),
})

export const NodePolicySchema = z.object({
  timeoutMs: z.number().int().positive().max(10 * 60 * 1000).default(60_000),
  retries: z.number().int().min(0).max(10).default(0),
  retryDelayMs: z.number().int().min(0).max(5 * 60 * 1000).optional(),
})

export const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  config: z.record(JsonValueSchema).default({}),
  inPorts: z.array(PortSchema).default([]),
  outPorts: z.array(PortSchema).default([]),
  io: NodeIOSchema,
  policy: NodePolicySchema.default({ timeoutMs: 60_000, retries: 0 }),
  costHint: z.number().min(0).default(0),
  metadata: z.record(JsonValueSchema).optional(),
})

export type Node = z.infer<typeof NodeSchema>

export const FlowTriggerSchema = z.object({
  type: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  schedule: z.string().optional(),
  config: z.record(JsonValueSchema).optional(),
  enabled: z.boolean().default(true),
})

export type FlowTrigger = z.infer<typeof FlowTriggerSchema>

export const FlowInterfaceFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
  description: z.string().optional(),
  defaultValue: JsonValueSchema.optional(),
})

export const FlowInterfaceSchema = z.object({
  inputs: z.array(FlowInterfaceFieldSchema).default([]),
  outputs: z.array(FlowInterfaceFieldSchema).default([]),
  metadata: z.record(JsonValueSchema).optional(),
})

export type FlowInterface = z.infer<typeof FlowInterfaceSchema>

export const FlowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(0),
  description: z.string().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  trigger: FlowTriggerSchema.optional(),
  interface: FlowInterfaceSchema.optional(),
  globals: z.record(JsonValueSchema).optional(),
  metadata: z.record(JsonValueSchema).optional(),
})

export type Flow = z.infer<typeof FlowSchema>

export const NodeRuntimeErrorSchema = z.object({
  type: z.string().optional(),
  message: z.string().min(1),
  stack: z.string().optional(),
  data: JsonValueSchema.optional(),
})

export const NodeRunSnapshotSchema = z.object({
  nodeId: z.string().min(1).optional(),
  status: z.enum(["pending", "running", "success", "error", "skipped"]).default("pending"),
  input: JsonValueSchema.optional(),
  output: JsonValueSchema.optional(),
  error: NodeRuntimeErrorSchema.optional(),
  attempts: z.number().int().min(0).default(0),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  durationMs: z.number().int().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  tokenCount: z.number().int().min(0).optional(),
  errorType: z.string().optional(),
  metadata: z.record(JsonValueSchema).optional(),
})

export type NodeRunSnapshot = z.infer<typeof NodeRunSnapshotSchema>

export const LineageRecordSchema = z.object({
  runId: z.string().min(1),
  toNodeId: z.string().min(1),
  edgeId: z.string().min(1),
  targetPath: z.string().min(1),
  fromNodeId: z.string().min(1),
  expr: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(JsonValueSchema).optional(),
})

export type LineageRecord = z.infer<typeof LineageRecordSchema>

export const RunContextSchema = z.object({
  flowId: z.string().min(1),
  runId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  startedAt: z.string().datetime(),
  status: z.enum(["pending", "running", "success", "error", "cancelled"]).default("pending"),
  inputs: JsonValueSchema.optional(),
  globals: z.record(JsonValueSchema).default({}),
  nodeOutputs: z.record(z.string(), NodeRunSnapshotSchema).default({}),
  lineage: z.array(LineageRecordSchema).default([]),
  errors: z.array(NodeRuntimeErrorSchema).default([]),
  estimatedCost: z.number().min(0).default(0),
  actualCost: z.number().min(0).default(0),
  costBreakdown: z.array(z.object({
    nodeId: z.string(),
    estimated: z.number().min(0).default(0),
    actual: z.number().min(0).default(0),
    tokenCount: z.number().int().min(0).optional(),
  })).default([]),
  metadata: z.record(JsonValueSchema).optional(),
})

export type RunContext = z.infer<typeof RunContextSchema>

export function assertFlow(flow: Flow): Flow {
  return FlowSchema.parse(flow)
}

export function assertRunContext(runContext: RunContext): RunContext {
  return RunContextSchema.parse(runContext)
}
