import { createClient } from "@supabase/supabase-js"
import { executeAction } from "@/lib/workflows/executeNode"
import { mapWorkflowData, evaluateExpression, evaluateCondition } from "./variableResolver"
import { ExecutionProgressTracker } from "./executionProgressTracker"
import { logInfo, logError, logSuccess, logWarning } from "@/lib/logging/backendLogger"

import { logger } from '@/lib/utils/logger'

// Helper to safely clone data and remove circular references
function safeClone(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => safeClone(item, seen));
  if (seen.has(obj)) return '[Circular Reference]';

  seen.add(obj);

  const cloned: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = safeClone(obj[key], seen);
    }
  }

  return cloned;
}

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
  private progressTracker: ExecutionProgressTracker

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
      startNodeId?: string
    } = {},
  ): Promise<any> {
    const session = await this.getExecutionSession(sessionId)
    if (!session) throw new Error("Execution session not found")

    const startInfo = {
      sessionId,
      workflowId: session.workflow_id,
      userId: session.user_id,
      startNodeId: options.startNodeId,
      inputKeys: Object.keys(inputData || {})
    }
    logger.debug('🛠️ AdvancedExecutionEngine.executeWorkflowAdvanced called', startInfo)
    logInfo(sessionId, 'AdvancedExecutionEngine.executeWorkflowAdvanced called', startInfo)

    // Log to backend logger for debug modal
    logInfo(sessionId, 'Workflow execution started', {
      workflowId: session.workflow_id,
      userId: session.user_id,
      startNodeId: options.startNodeId,
      inputKeys: Object.keys(inputData || {})
    })

    // Check if session is already running to prevent duplicate executions
    if (session.status === "running") {
      logger.debug(`⚠️ Session ${sessionId} is already running, skipping duplicate execution`)
      logWarning(sessionId, 'Session already running, skipping duplicate execution')
      return { success: false, message: "Session already running" }
    }

    // Update session status
    await this.updateSessionStatus(sessionId, "running")

    // Initialize progress tracker for this execution
    this.progressTracker = new ExecutionProgressTracker()
    const totalNodes = (await this.supabase
      .from("workflows")
      .select("nodes")
      .eq("id", session.workflow_id)
      .single()).data?.nodes?.length || 0

    await this.progressTracker.initialize(
      sessionId,
      session.workflow_id,
      session.user_id,
      totalNodes
    )

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

      // Mark progress as completed
      if (this.progressTracker) {
        await this.progressTracker.complete(true)
      }

      const completionInfo = {
        sessionId,
        workflowId: session.workflow_id
      }
      logger.debug('✅ AdvancedExecutionEngine execution completed', completionInfo)
      logSuccess(sessionId, 'AdvancedExecutionEngine execution completed', completionInfo)
      return result
    } catch (error) {
      await this.updateSessionStatus(sessionId, "failed")
      await this.logExecutionEvent(sessionId, "execution_error", null, {
        error: error instanceof Error ? error.message : "Unknown error",
      })

      // Mark progress as failed
      if (this.progressTracker) {
        await this.progressTracker.complete(false, error instanceof Error ? error.message : "Unknown error")
      }

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
      trigger: inputData?.trigger, // Preserve trigger data at context level for AI field resolution
      variables: session.execution_context.variables || {},
      session,
      workflow,
    }

    // For now, disable parallel processing to prevent duplicate executions
    // Only execute the main workflow path to avoid duplicate emails
    logger.debug(`🎯 Executing workflow ${workflow.id} - main path only (parallel processing disabled)`)
    logInfo(context.session.id, 'Executing workflow - main path only (parallel processing disabled)', { workflowId: workflow.id })

    // Execute main workflow path only
    const mainResult = await this.executeMainWorkflowPath(session.id, workflow, context, options.startNodeId)
    results.mainResult = mainResult

    const mainPathInfo = {
      sessionId: session.id,
      workflowId: workflow.id
    }
    logger.debug('✅ Main workflow path finished', mainPathInfo)
    logSuccess(context.session.id, 'Main workflow path finished', mainPathInfo)

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

  private async executeMainWorkflowPath(sessionId: string, workflow: any, context: any, startNodeId?: string): Promise<any> {
    let currentData = context.data;
    const previousResults = {}; // Track all previous node results for AI field resolution
    const nodes = workflow.nodes || [];
    const connections = workflow.connections || [];

    const pathInfo = {
      sessionId,
      workflowId: workflow.id,
      nodeCount: Array.isArray(nodes) ? nodes.length : 0,
      connectionCount: Array.isArray(connections) ? connections.length : 0,
      hasStartNodeOverride: Boolean(startNodeId)
    }
    logger.debug('🧱 executeMainWorkflowPath', pathInfo)
    logInfo(sessionId, 'executeMainWorkflowPath', pathInfo)

    const executionQueue: any[] = [];
    const executedNodeIds = new Set<string>();

    if (startNodeId) {
      const startNode = nodes.find((n: any) => n.id === startNodeId);
      if (startNode) {
        executionQueue.push(startNode);
      } else {
        throw new Error(`Test execution failed: Start node ${startNodeId} not found.`);
      }
    } else {
      // Find trigger node(s) if no startNodeId is provided
      const triggerNodes = nodes.filter((n: any) => n.data.isTrigger);
      if (triggerNodes.length === 0) {
        throw new Error("No trigger node found in the workflow.");
      }
      
      logger.debug(`🎯 Found ${triggerNodes.length} trigger node(s), processing trigger: ${triggerNodes[0].id}`)
      logInfo(sessionId, `Found ${triggerNodes.length} trigger node(s), processing trigger: ${triggerNodes[0].id}`)
      
      // Execute the trigger first to pass through data
      const triggerNode = triggerNodes[0]; // Use first trigger
      const triggerResult = await this.executeNode(triggerNode, workflow, { ...context, data: currentData });
      currentData = triggerResult;

      // Initialize previousResults with trigger output if available
      if (triggerResult[triggerNode.id]) {
        previousResults[triggerNode.id] = triggerResult[triggerNode.id];
      }

      executedNodeIds.add(triggerNode.id);
      
      // Find action nodes connected to this trigger
      const initialConnections = connections.filter((c: any) => c.source === triggerNode.id);
      const firstActionNodes = initialConnections.map((c: any) => nodes.find((n: any) => n.id === c.target)).filter(Boolean);
      
      logger.debug(`🎯 Found ${firstActionNodes.length} action node(s) connected to trigger`)
      logInfo(sessionId, `Found ${firstActionNodes.length} action node(s) connected to trigger`)
      executionQueue.push(...firstActionNodes);
    }

    while (executionQueue.length > 0) {
      const currentNode = executionQueue.shift();
      
      // Skip if node has already been executed to prevent duplicates
      if (executedNodeIds.has(currentNode.id)) {
        logger.debug(`🔄 Skipping already executed node: ${currentNode.id}`);
        logInfo(sessionId, `Skipping already executed node: ${currentNode.id}`);
        continue;
      }

      logger.debug(`🎯 Executing node: ${currentNode.id} (${currentNode.data.type})`);
      logInfo(sessionId, `Executing node: ${currentNode.id} (${currentNode.data.type})`);

      // Create a clean context for the node execution
      // Keep data structures flat to avoid deep nesting
      const nodeContext = {
        ...context,
        data: {
          ...currentData,
          // Only pass what's needed for AI field resolution
          previousResults: { ...previousResults }, // Shallow copy to avoid mutations
          trigger: context.trigger // Ensure trigger is available
        }
      };

      const nodeResult = await this.executeNode(currentNode, workflow, nodeContext);

      // Extract just the new result for this node
      const newNodeResult = nodeResult[currentNode.id];

      // Update currentData with only the new result
      // Don't spread the entire nodeResult to avoid accumulating nested data
      currentData = {
        ...currentData,
        [currentNode.id]: newNodeResult
      };

      // Accumulate results separately for AI field resolution
      // This keeps a flat structure for previous outputs
      if (newNodeResult) {
        previousResults[currentNode.id] = safeClone(newNodeResult);
      }

      executedNodeIds.add(currentNode.id);
      
      // Find next nodes
      let nextConnections = connections.filter((c: any) => c.source === currentNode.id);

      if (currentNode.data.type === 'ai_router') {
        const selectedPaths: string[] = Array.isArray(newNodeResult?.selectedPaths)
          ? newNodeResult.selectedPaths
          : [];

        if (selectedPaths.length > 0) {
          const normalized = selectedPaths.map(path => path.toLowerCase());
          const filteredConnections = nextConnections.filter((connection: any) => {
            if (!connection.sourceHandle) return false;

            const handle = String(connection.sourceHandle);
            const cleanedHandle = handle.startsWith('output-')
              ? handle.slice(7)
              : handle;

            return normalized.includes(handle.toLowerCase()) || normalized.includes(cleanedHandle.toLowerCase());
          });

          if (filteredConnections.length === 0) {
            logger.warn(`⚠️ AI Router node ${currentNode.id} returned paths with no matching connections`, {
              selectedPaths,
              availableHandles: nextConnections.map((c: any) => c.sourceHandle),
            });
            logWarning(sessionId, `AI Router node ${currentNode.id} returned paths with no matching connections`, {
              selectedPaths,
              availableHandles: nextConnections.map((c: any) => c.sourceHandle),
            });
          } else {
            logger.debug(`🧭 AI Router selected paths for node ${currentNode.id}:`, selectedPaths);
            logInfo(sessionId, `AI Router selected paths`, {
              nodeId: currentNode.id,
              selectedPaths,
            });
            nextConnections = filteredConnections;
          }
        } else {
          logger.warn(`⚠️ AI Router node ${currentNode.id} did not return any selected paths`);
          logWarning(sessionId, `AI Router node ${currentNode.id} did not return any selected paths`);
          nextConnections = [];
        }
      }

      const nextNodes = nextConnections.map((c: any) => nodes.find((n: any) => n.id === c.target)).filter(Boolean);
      
      // Add next nodes to queue only if they haven't been executed and aren't already in queue
      for (const nextNode of nextNodes) {
        if (!executedNodeIds.has(nextNode.id) && !executionQueue.some(queuedNode => queuedNode.id === nextNode.id)) {
          logger.debug(`➡️ Adding node to queue: ${nextNode.id}`);
          logInfo(sessionId, `Adding node to queue: ${nextNode.id}`);
          executionQueue.push(nextNode);
        }
      }
    }

    return currentData;
  }

  /**
   * Execute a single workflow node
   * Delegates to the centralized executeNode.ts implementation
   */
  private async executeNode(node: any, workflow: any, context: any): Promise<any> {
    try {
      // Check if this node has already been executed in this session
      const { data: existingNodeExecution } = await this.supabase
        .from('live_execution_events')
        .select('id')
        .eq('session_id', context.session.id)
        .eq('node_id', node.id)
        .eq('event_type', 'node_completed')
        .limit(1)
        .maybeSingle()

      if (existingNodeExecution) {
        logger.debug(`🔄 Node ${node.id} already executed in session ${context.session.id}, skipping`)
        logInfo(context.session.id, `Node ${node.id} already executed in session ${context.session.id}, skipping`)
        return context.data
      }

      await this.logExecutionEvent(context.session.id, "node_started", node.id, { nodeType: node.data.type })
      logger.debug(`🎯 Executing node via delegated handler: ${node.id} (${node.data.type})`)
      logInfo(context.session.id, `Executing node via delegated handler: ${node.id} (${node.data.type})`)

      // Log to backend logger
      logInfo(context.session.id, `Executing node: ${node.data?.title || node.data?.type}`, {
        nodeId: node.id,
        nodeType: node.data.type,
        hasConfig: !!node.data.config
      })

      // Update progress tracker - node started
      if (this.progressTracker) {
        await this.progressTracker.update({
          currentNodeId: node.id,
          currentNodeName: node.data?.title || node.data?.type || node.id,
          status: 'running',
        })
      }

      // Delegate to the centralized executeAction from executeNode.ts
      // This ensures consistency across all execution paths and leverages the registry pattern
      // IMPORTANT: Pass trigger data for AI field resolution
      // Extract only what we need to avoid circular references
      const { previousResults, trigger, ...restData } = context.data || {};

      // Use safeClone to prevent circular references when passing data
      const safeInput = safeClone({
        ...restData,
        trigger: trigger || context.trigger, // Ensure trigger data is available
        previousResults: previousResults || {}, // Pass accumulated results for AI processing
        executionId: context.session?.id,
        workflowId: context.workflow?.id,
        nodeId: node.id,
        testMode: context.testMode || false
      });

      // Log specific node details for debugging
      if (node.id.includes('slack')) {
        logger.debug(`📧 Executing Slack node ${node.id}, data keys:`, Object.keys(safeInput));
        logInfo(context.session.id, `Executing Slack node ${node.id}, data keys:`, Object.keys(safeInput));
      }

      const actionResult = await executeAction({
        node,
        input: safeInput,
        userId: context.session.user_id,
        workflowId: workflow.id,
        testMode: context.testMode || false,
        executionMode: context.testMode ? 'sandbox' : 'live'
      })

      // Build the result in the expected format for the execution engine
      // Keep it simple - just return the current data with the new result
      const result = {
        ...context.data,
        [node.id]: actionResult
      }

      // Safely log event without circular references
      try {
        await this.logExecutionEvent(context.session.id, "node_completed", node.id, {
          success: actionResult.success,
          // Only log output to avoid circular references
          result: actionResult.output || { success: actionResult.success }
        })
      } catch (logError) {
        logger.error('Error logging execution event:', logError)
      }
      logger.debug(`✅ Node completed: ${node.id}`)
      logSuccess(context.session.id, `Node completed: ${node.id}`)

      // Log successful node execution
      logSuccess(context.session.id, `Node completed: ${node.data?.title || node.data?.type}`, {
        nodeId: node.id,
        success: actionResult.success
      })

      // Update progress tracker - node completed
      if (this.progressTracker) {
        await this.progressTracker.updateNodeCompleted(node.id, actionResult)
      }

      return result
    } catch (error) {
      logger.error(`❌ Node failed: ${node.id}`, error)

      // Log error to backend logger
      logError(context.session.id, `Node failed: ${node.data?.title || node.data?.type}`, {
        nodeId: node.id,
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined
      })

      await this.logExecutionEvent(context.session.id, "node_error", node.id, {
        error: error instanceof Error ? error.message : "Unknown error"
      })

      // Update progress tracker - node failed
      if (this.progressTracker) {
        await this.progressTracker.updateNodeFailed(
          node.id,
          error instanceof Error ? error.message : "Unknown error"
        )
      }

      throw error
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
    // Get workflow_id from session
    const session = await this.getExecutionSession(sessionId)
    if (!session) {
      logger.error("Cannot log execution event: session not found")
      return
    }

    await this.supabase.from("live_execution_events").insert({
      session_id: sessionId,
      workflow_id: session.workflow_id,
      event_type: eventType,
      node_id: nodeId,
      event_data: eventData,
      timestamp: new Date().toISOString()
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
