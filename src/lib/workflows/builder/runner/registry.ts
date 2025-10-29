import type { NodeDefinition } from "../nodes/types"
import { z } from "zod"

export type NodeRunnerResult = {
  output: any
  cost?: number
}

export type NodeRunnerArgs = {
  input: any
  config: Record<string, any>
  ctx: {
    runId: string
    globals: Record<string, any>
    nodeId: string
    attempt: number
  }
}

export type NodeRunner = (args: NodeRunnerArgs) => Promise<NodeRunnerResult>

const runnerRegistry = new Map<string, NodeRunner>()
const registeredDefinitions = new Set<string>()

export function registerNodeRunner(type: string, runner: NodeRunner) {
  runnerRegistry.set(type, runner)
}

export function registerNodeDefinition(definition: NodeDefinition) {
  if (registeredDefinitions.has(definition.type)) {
    return
  }

  const configSchema = definition.configSchema ?? z.any()
  const inputSchema = definition.inputSchema ?? z.any()
  const outputSchema = definition.outputSchema ?? z.any()

  const runner: NodeRunner = async ({ input, config, ctx }) => {
    const parsedConfig = configSchema.parse(config ?? {})
    const parsedInput = inputSchema.parse(input ?? {})

    const { output, cost } = await definition.run({
      input: parsedInput,
      config: parsedConfig,
      ctx,
    })

    outputSchema.parse(output ?? {})

    return { output, cost }
  }

  runnerRegistry.set(definition.type, runner)
  registeredDefinitions.add(definition.type)
}

export function getRunner(type: string): NodeRunner {
  const runner = runnerRegistry.get(type)
  if (!runner) {
    throw new Error(`No runner registered for node type "${type}"`)
  }
  return runner
}

export function clearNodeRunners(): void {
  runnerRegistry.clear()
  registeredDefinitions.clear()
}
