import { createClient } from "@supabase/supabase-js"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { GmailService } from "@/lib/integrations/gmail"

// A simple retry mechanism
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0) throw error;
    // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

export interface ExecutionSession {
  id: string
  workflow_id: string
  user_id: string
  session_type: "manual" | "scheduled" | "webhook" | "api"
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled"
  execution_context: any
  parallel_branches: ParallelBranch[]
  current_step: string
  progress_percentage: number
}

export interface ParallelBranch {
  id: string
  branch_name: string
  start_node_id: string
  end_node_id?: string
  status: "pending" | "running" | "completed" | "failed"
  execution_data: any
}

export interface SubWorkflow {
  id: string
  parent_workflow_id: string
  child_workflow_id: string
  node_id: string
  input_mapping: Record<string, string>
  output_mapping: Record<string, string>
  execution_order: number
  is_parallel: boolean
}

export class AdvancedExecutionEngine {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  async createExecutionSession(
    workflowId: string,
    userId: string,
    sessionType: ExecutionSession["session_type"] = "manual",
    context: any = {},
  ): Promise<ExecutionSession> {
    const { data, error } = await this.supabase
      .from("workflow_execution_sessions")
      .insert({
        workflow_id: workflowId,
        user_id: userId,
        session_type: sessionType,
        execution_context: context,
        status: "pending",
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  async executeWorkflowAdvanced(
    sessionId: string,
    inputData: any = {},
    options: {
      enableParallel?: boolean
      maxConcurrency?: number
      enableSubWorkflows?: boolean
    } = {},
  ): Promise<any> {
    const session = await this.getExecutionSession(sessionId)
    if (!session) throw new Error("Execution session not found")

    // Update session status
    await this.updateSessionStatus(sessionId, "running")

    try {
      // Get workflow definition
      const { data: workflow } = await this.supabase
        .from("workflows")
        .select("*")
        .eq("id", session.workflow_id)
        .single()

      if (!workflow) throw new Error("Workflow not found")

      // Analyze workflow for parallel execution opportunities
      const executionPlan = await this.analyzeWorkflowForParallelExecution(workflow)

      // Execute workflow with parallel processing
      const result = await this.executeWithParallelProcessing(session, workflow, executionPlan, inputData, options)

      await this.updateSessionStatus(sessionId, "completed", 100)
      return result
    } catch (error) {
      await this.updateSessionStatus(sessionId, "failed")
      await this.logExecutionEvent(sessionId, "execution_error", null, {
        error: error instanceof Error ? error.message : "Unknown error",
      })
      throw error
    }
  }

  private async analyzeWorkflowForParallelExecution(workflow: any): Promise<{
    parallelBranches: Array<{
      name: string
      startNodes: string[]
      endNodes: string[]
      canRunInParallel: boolean
    }>
    subWorkflows: SubWorkflow[]
    loops: Array<{
      nodeId: string
      type: "for" | "while" | "forEach"
      maxIterations: number
    }>
  }> {
    const nodes = workflow.nodes || []
    const connections = workflow.connections || []

    // Find parallel branches
    const parallelBranches = this.identifyParallelBranches(nodes, connections)

    // Find sub-workflows
    const { data: subWorkflows } = await this.supabase
      .from("workflow_compositions")
      .select("*")
      .eq("parent_workflow_id", workflow.id)

    // Find loop nodes
    const loops = nodes
      .filter((node: any) => ["loop", "forEach", "while"].includes(node.data.type))
      .map((node: any) => ({
        nodeId: node.id,
        type: node.data.type,
        maxIterations: node.data.config?.maxIterations || 100,
      }))

    return {
      parallelBranches,
      subWorkflows: subWorkflows || [],
      loops,
    }
  }

  private identifyParallelBranches(
    nodes: any[],
    connections: any[],
  ): Array<{
    name: string
    startNodes: string[]
    endNodes: string[]
    canRunInParallel: boolean
  }> {
    const branches: Array<{
      name: string
      startNodes: string[]
      endNodes: string[]
      canRunInParallel: boolean
    }> = []

    // Find nodes that split into multiple paths
    const splitNodes = nodes.filter((node) => {
      const outgoingConnections = connections.filter((conn) => conn.source === node.id)
      return outgoingConnections.length > 1
    })

    splitNodes.forEach((splitNode, index) => {
      const outgoingConnections = connections.filter((conn) => conn.source === splitNode.id)
      const parallelPaths = outgoingConnections.map((conn) => conn.target)

      // Check if paths can run in parallel (no shared dependencies)
      const canRunInParallel = this.checkParallelCompatibility(parallelPaths, connections)

      if (canRunInParallel) {
        branches.push({
          name: `Branch_${index + 1}`,
          startNodes: parallelPaths,
          endNodes: this.findMergePoints(parallelPaths, connections),
          canRunInParallel: true,
        })
      }
    })

    return branches
  }

  private checkParallelCompatibility(paths: string[], connections: any[]): boolean {
    // Simple check - in production, implement more sophisticated dependency analysis
    return paths.length > 1
  }

  private findMergePoints(startNodes: string[], connections: any[]): string[] {
    // Find nodes where parallel paths converge
    const mergePoints: string[] = []

    // This is a simplified implementation
    // In production, implement proper graph analysis
    return mergePoints
  }

  private async executeWithParallelProcessing(
    session: ExecutionSession,
    workflow: any,
    executionPlan: any,
    inputData: any,
    options: any,
  ): Promise<any> {
    const results: any = {}
    const context = {
      data: inputData,
      variables: session.execution_context.variables || {},
      session,
      workflow,
    }

    // Execute parallel branches
    if (options.enableParallel && executionPlan.parallelBranches.length > 0) {
      const parallelResults = await this.executeParallelBranches(
        session.id,
        executionPlan.parallelBranches,
        workflow,
        context,
        options.maxConcurrency || 3,
      )
      results.parallelResults = parallelResults
    }

    // Execute sub-workflows
    if (options.enableSubWorkflows && executionPlan.subWorkflows.length > 0) {
      const subWorkflowResults = await this.executeSubWorkflows(session.id, executionPlan.subWorkflows, context)
      results.subWorkflowResults = subWorkflowResults
    }

    // Execute loops
    if (executionPlan.loops.length > 0) {
      const loopResults = await this.executeLoops(session.id, executionPlan.loops, workflow, context)
      results.loopResults = loopResults
    }

    // Execute main workflow path
    const mainResult = await this.executeMainWorkflowPath(session.id, workflow, context)
    results.mainResult = mainResult

    return results
  }

  private async executeParallelBranches(
    sessionId: string,
    branches: any[],
    workflow: any,
    context: any,
    maxConcurrency: number,
  ): Promise<any[]> {
    const results: any[] = []

    // Create execution branches in database
    const branchPromises = branches.map(async (branch, index) => {
      const { data: branchRecord } = await this.supabase
        .from("execution_branches")
        .insert({
          session_id: sessionId,
          branch_name: branch.name,
          start_node_id: branch.startNodes[0],
          end_node_id: branch.endNodes[0],
          status: "pending",
        })
        .select()
        .single()

      return branchRecord
    })

    const branchRecords = await Promise.all(branchPromises)

    // Execute branches with concurrency limit
    const semaphore = new Semaphore(maxConcurrency)

    const executionPromises = branchRecords.map(async (branchRecord) => {
      await semaphore.acquire()

      try {
        await this.supabase
          .from("execution_branches")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", branchRecord.id)

        await this.logExecutionEvent(sessionId, "branch_start", branchRecord.start_node_id, {
          branchId: branchRecord.id,
          branchName: branchRecord.branch_name,
        })

        // Execute branch nodes
        const branchResult = await this.executeBranchNodes(branchRecord, workflow, context)

        await this.supabase
          .from("execution_branches")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            execution_data: branchResult,
          })
          .eq("id", branchRecord.id)

        await this.logExecutionEvent(sessionId, "branch_complete", branchRecord.end_node_id, {
          branchId: branchRecord.id,
          result: branchResult,
        })

        results.push(branchResult)
        return branchResult
      } catch (error) {
        await this.supabase.from("execution_branches").update({ status: "failed" }).eq("id", branchRecord.id)

        throw error
      } finally {
        semaphore.release()
      }
    })

    await Promise.all(executionPromises)
    return results
  }

  private async executeSubWorkflows(sessionId: string, subWorkflows: SubWorkflow[], context: any): Promise<any[]> {
    const results: any[] = []

    // Group by execution order and parallel flag
    const sequentialGroups = subWorkflows
      .filter((sw) => !sw.is_parallel)
      .sort((a, b) => a.execution_order - b.execution_order)

    const parallelGroups = subWorkflows
      .filter((sw) => sw.is_parallel)
      .reduce(
        (groups, sw) => {
          const order = sw.execution_order
          if (!groups[order]) groups[order] = []
          groups[order].push(sw)
          return groups
        },
        {} as Record<number, SubWorkflow[]>,
      )

    // Execute sequential sub-workflows
    for (const subWorkflow of sequentialGroups) {
      const result = await this.executeSubWorkflow(subWorkflow, context)
      results.push(result)
    }

    // Execute parallel sub-workflows
    for (const [order, parallelSubs] of Object.entries(parallelGroups)) {
      const parallelResults = await Promise.all(parallelSubs.map((sw) => this.executeSubWorkflow(sw, context)))
      results.push(...parallelResults)
    }

    return results
  }

  private async executeSubWorkflow(subWorkflow: SubWorkflow, context: any): Promise<any> {
    // Get child workflow
    const { data: childWorkflow } = await this.supabase
      .from("workflows")
      .select("*")
      .eq("id", subWorkflow.child_workflow_id)
      .single()

    if (!childWorkflow) throw new Error(`Sub-workflow ${subWorkflow.child_workflow_id} not found`)

    // Map input data
    const mappedInput = this.mapWorkflowData(context.data, subWorkflow.input_mapping)

    // Create sub-execution session
    const subSession = await this.createExecutionSession(
      subWorkflow.child_workflow_id,
      context.session.user_id,
      "api",
      { parentSession: context.session.id, mappedInput },
    )

    // Execute sub-workflow
    const subResult = await this.executeWorkflowAdvanced(subSession.id, mappedInput)

    // Map output data
    const mappedOutput = this.mapWorkflowData(subResult, subWorkflow.output_mapping)

    return {
      subWorkflowId: subWorkflow.child_workflow_id,
      nodeId: subWorkflow.node_id,
      input: mappedInput,
      output: mappedOutput,
      rawResult: subResult,
    }
  }

  private async executeLoops(sessionId: string, loops: any[], workflow: any, context: any): Promise<any[]> {
    const results: any[] = []

    for (const loop of loops) {
      const loopResult = await this.executeLoop(sessionId, loop, workflow, context)
      results.push(loopResult)
    }

    return results
  }

  private async executeLoop(sessionId: string, loop: any, workflow: any, context: any): Promise<any> {
    // Create loop execution record
    const { data: loopExecution } = await this.supabase
      .from("loop_executions")
      .insert({
        session_id: sessionId,
        node_id: loop.nodeId,
        max_iterations: loop.maxIterations,
        status: "running",
      })
      .select()
      .single()

    const loopNode = workflow.nodes.find((n: any) => n.id === loop.nodeId)
    const loopConfig = loopNode?.data?.config || {}

    let iterations = 0
    const results: any[] = []

    try {
      switch (loop.type) {
        case "forEach":
          const array = this.evaluateExpression(loopConfig.arrayPath || "data.items", context)
          if (Array.isArray(array)) {
            for (let i = 0; i < Math.min(array.length, loop.maxIterations); i++) {
              const itemContext = {
                ...context,
                data: {
                  ...context.data,
                  [loopConfig.itemVariable || "item"]: array[i],
                  index: i,
                  total: array.length,
                },
              }

              const iterationResult = await this.executeLoopIteration(
                sessionId,
                loopExecution.id,
                i,
                loopNode,
                workflow,
                itemContext,
              )

              results.push(iterationResult)
              iterations++

              // Update loop execution
              await this.supabase
                .from("loop_executions")
                .update({
                  iteration_count: iterations,
                  current_item_index: i,
                  loop_data: { results },
                })
                .eq("id", loopExecution.id)
            }
          }
          break

        case "while":
          while (iterations < loop.maxIterations) {
            const condition = this.evaluateCondition(loopConfig.condition || "true", context)
            if (!condition) break

            const iterationResult = await this.executeLoopIteration(
              sessionId,
              loopExecution.id,
              iterations,
              loopNode,
              workflow,
              context,
            )

            results.push(iterationResult)
            iterations++

            // Update context with iteration result
            context.data = { ...context.data, ...iterationResult }

            await this.supabase
              .from("loop_executions")
              .update({
                iteration_count: iterations,
                loop_data: { results },
              })
              .eq("id", loopExecution.id)
          }
          break

        case "for":
          const start = Number(loopConfig.start || 0)
          const end = Number(loopConfig.end || 10)
          const step = Number(loopConfig.step || 1)

          for (let i = start; i < Math.min(end, start + loop.maxIterations * step); i += step) {
            const iterationContext = {
              ...context,
              data: {
                ...context.data,
                index: i,
                iteration: iterations,
              },
            }

            const iterationResult = await this.executeLoopIteration(
              sessionId,
              loopExecution.id,
              iterations,
              loopNode,
              workflow,
              iterationContext,
            )

            results.push(iterationResult)
            iterations++

            await this.supabase
              .from("loop_executions")
              .update({
                iteration_count: iterations,
                current_item_index: i,
                loop_data: { results },
              })
              .eq("id", loopExecution.id)
          }
          break
      }

      // Mark loop as completed
      await this.supabase.from("loop_executions").update({ status: "completed" }).eq("id", loopExecution.id)

      return {
        loopId: loop.nodeId,
        type: loop.type,
        iterations,
        results,
      }
    } catch (error) {
      await this.supabase.from("loop_executions").update({ status: "failed" }).eq("id", loopExecution.id)

      throw error
    }
  }

  private async executeLoopIteration(
    sessionId: string,
    loopExecutionId: string,
    iteration: number,
    loopNode: any,
    workflow: any,
    context: any,
  ): Promise<any> {
    await this.logExecutionEvent(sessionId, "loop_iteration", loopNode.id, {
      iteration,
      loopExecutionId,
    })

    // Find connected nodes to execute in this iteration
    const connections = workflow.connections || []
    const connectedNodes = connections
      .filter((conn: any) => conn.source === loopNode.id)
      .map((conn: any) => workflow.nodes.find((n: any) => n.id === conn.target))
      .filter(Boolean)

    const iterationResults: any = {}

    // Execute connected nodes
    for (const node of connectedNodes) {
      const nodeResult = await this.executeNode(node, workflow, context)
      iterationResults[node.id] = nodeResult
    }

    return {
      iteration,
      timestamp: new Date().toISOString(),
      results: iterationResults,
    }
  }

  private async executeBranchNodes(branchRecord: any, workflow: any, context: any): Promise<any> {
    // Find nodes in this branch
    const startNode = workflow.nodes.find((n: any) => n.id === branchRecord.start_node_id)
    if (!startNode) throw new Error(`Start node ${branchRecord.start_node_id} not found`)

    // Execute nodes in branch
    return await this.executeNode(startNode, workflow, context)
  }

  private async executeMainWorkflowPath(sessionId: string, workflow: any, context: any): Promise<any> {
    // This is a simplified execution path. A real implementation would traverse the graph.
    let currentData = context.data;
    const nodes = workflow.nodes || [];

    for (const node of nodes) {
      currentData = await this.executeNode(node, workflow, { ...context, data: currentData });
    }
    return currentData;
  }

  private async executeNode(node: any, workflow: any, context: any): Promise<any> {
    // Placeholder for fetching integration-specific API clients and handling auth
    // This would involve fetching stored credentials and handling OAuth token refreshes.
    const apiClient = await this.getApiClientForNode(node.data.providerId, context.session.user_id);

    // Placeholder for handling different node types
    switch (node.data.type) {
      case 'custom_script':
        // Execute custom script
        break;
      // Other generic node types...

      default:
        // Handle integration-specific actions
        if (node.data.providerId && apiClient) {
          const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type);
          
          if (nodeComponent && nodeComponent.actionParamsSchema) {
            // Map workflow data to action parameters
            const params = this.mapWorkflowData(context.data, node.data.config);

            if (node.data.providerId === 'gmail' && apiClient) {
              if (nodeComponent?.actionParamsSchema) {
                if (node.data.type === 'gmail_action_send_email') {
                  return await retry(() => (apiClient as GmailService).sendEmail(params));
                }
              }
            }
          }
        }
    }
    return context.data; // Return original data if no action taken
  }

  private async getApiClientForNode(providerId: string | undefined, userId: string): Promise<any | null> {
    if (!providerId) return null;

    const { data: integration, error } = await this.supabase
      .from('integrations')
      .select('id, access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', providerId)
      .single();

    if (error || !integration) {
      console.error(`No integration found for provider ${providerId} for user ${userId}`);
      return null;
    }

    let accessToken = integration.access_token;
    const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;

    // Check if the token is expired or will expire soon (e.g., within 5 minutes)
    if (Date.now() >= expiresAt - 5 * 60 * 1000) {
      if (providerId === 'gmail') {
        accessToken = await GmailService.refreshToken(userId, integration.id);
        if (!accessToken) {
          // TODO: Handle re-authorization flow
          throw new Error('Failed to refresh Gmail token.');
        }
      }
      // TODO: Add refresh logic for other providers
    }

    if (!accessToken) {
      throw new Error(`No valid access token for ${providerId}`);
    }

    if (providerId === 'gmail') {
      return new GmailService(accessToken);
    }

    return null;
  }

  private mapWorkflowData(data: any, mapping: Record<string, string>): any {
    const mappedData: Record<string, any> = {};

    for (const [targetKey, sourcePath] of Object.entries(mapping)) {
      mappedData[targetKey] = this.evaluateExpression(sourcePath, { data })
    }

    return mappedData;
  }

  private evaluateExpression(expression: string, context: any): any {
    try {
      // Simple evaluation - in production, use a safer evaluator
      const func = new Function("data", "variables", "context", `return ${expression}`)
      return func(context.data, context.variables, context)
    } catch (error) {
      return expression // Return as literal if evaluation fails
    }
  }

  private evaluateCondition(condition: string, context: any): boolean {
    try {
      const func = new Function("data", "variables", "context", `return ${condition}`)
      return !!func(context.data, context.variables, context)
    } catch (error) {
      return false
    }
  }

  private async getExecutionSession(sessionId: string): Promise<ExecutionSession | null> {
    const { data, error } = await this.supabase
      .from("workflow_execution_sessions")
      .select("*")
      .eq("id", sessionId)
      .single()

    if (error) return null
    return data
  }

  private async updateSessionStatus(
    sessionId: string,
    status: ExecutionSession["status"],
    progress?: number,
  ): Promise<void> {
    const updates: any = { status }

    if (status === "running" && !progress) {
      updates.started_at = new Date().toISOString()
    } else if (status === "completed" || status === "failed") {
      updates.completed_at = new Date().toISOString()
    }

    if (progress !== undefined) {
      updates.progress_percentage = progress
    }

    await this.supabase.from("workflow_execution_sessions").update(updates).eq("id", sessionId)
  }

  private async logExecutionEvent(
    sessionId: string,
    eventType: string,
    nodeId: string | null,
    eventData: any = {},
  ): Promise<void> {
    await this.supabase.from("live_execution_events").insert({
      session_id: sessionId,
      event_type: eventType,
      node_id: nodeId,
      event_data: eventData,
    })
  }
}

// Semaphore for concurrency control
class Semaphore {
  private permits: number
  private waiting: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve)
    })
  }

  release(): void {
    this.permits++
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift()!
      this.permits--
      resolve()
    }
  }
}
