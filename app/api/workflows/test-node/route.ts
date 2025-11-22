import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { executeAction } from "@/lib/workflows/executeNode"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import { nodeOutputCache } from "@/lib/execution/nodeOutputCache"
import { resolveValue } from "@/lib/workflows/actions/core/resolveValue"

import { logger } from '@/lib/utils/logger'

/**
 * Check if a config has unresolved variables and identify which ones
 */
function findUnresolvedVariables(config: any, resolvedConfig: any): string[] {
  const unresolvedVars: string[] = []

  function checkValue(original: any, resolved: any, path: string = '') {
    if (typeof original === 'string' && original.includes('{{') && original.includes('}}')) {
      // Extract variable references from the original value
      const varMatches = original.match(/\{\{([^}]+)\}\}/g) || []

      for (const match of varMatches) {
        const varName = match.replace(/\{\{|\}\}/g, '').trim()

        // Check if this variable was NOT resolved (still contains template or is undefined)
        if (resolved === undefined || resolved === null ||
            (typeof resolved === 'string' && resolved.includes(match))) {
          unresolvedVars.push(varName)
        }
      }
    } else if (original && typeof original === 'object' && !Array.isArray(original)) {
      for (const key of Object.keys(original)) {
        checkValue(original[key], resolved?.[key], path ? `${path}.${key}` : key)
      }
    } else if (Array.isArray(original)) {
      original.forEach((item, idx) => {
        checkValue(item, resolved?.[idx], `${path}[${idx}]`)
      })
    }
  }

  checkValue(config, resolvedConfig)
  return [...new Set(unresolvedVars)] // Remove duplicates
}

/**
 * Extract node IDs from variable references
 */
function extractNodeIdsFromVariables(variables: string[]): string[] {
  const nodeIds: string[] = []
  for (const varName of variables) {
    // Check if it's a node reference (contains a dot and doesn't start with common prefixes)
    if (varName.includes('.') &&
        !varName.startsWith('data.') &&
        !varName.startsWith('trigger.') &&
        varName !== 'NOW' && varName !== 'now') {
      const nodeId = varName.split('.')[0]
      if (nodeId && !nodeIds.includes(nodeId)) {
        nodeIds.push(nodeId)
      }
    }
  }
  return nodeIds
}

export async function POST(request: Request) {
  try {
    const { nodeType, config, testData, workflowId, nodeId, useCachedData } = await request.json()

    logger.info('[test-node] Received request:', {
      nodeType,
      workflowId: workflowId || 'NOT PROVIDED',
      nodeId: nodeId || 'NOT PROVIDED',
      useCachedData,
      hasConfig: !!config,
      hasTestData: !!testData
    })

    if (!nodeType) {
      return errorResponse("Node type is required" , 400)
    }

    if (!workflowId) {
      logger.warn('[test-node] workflowId not provided - caching will be disabled')
    }

    if (!nodeId) {
      logger.warn('[test-node] nodeId not provided - caching will be disabled')
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Authentication required" , 401)
    }

    // Find the node component definition
    const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
    if (!nodeComponent) {
      return errorResponse("Unknown node type" , 400)
    }

    // Only allow testing action nodes, not triggers
    if (nodeComponent.isTrigger) {
      return errorResponse("Cannot test trigger nodes directly. Trigger nodes activate when their event occurs." , 400)
    }

    // Create a test node object
    const testNode = {
      id: nodeId || "test-node",
      data: {
        type: nodeType,
        config: config || {}
      }
    }

    // Load cached outputs from previous runs if workflowId is provided and useCachedData is true
    let cachedOutputs: Record<string, any> = {}
    let cachedDataInfo = { loaded: false, nodeCount: 0, availableNodes: [] as string[] }

    if (workflowId && useCachedData !== false) {
      try {
        cachedOutputs = await nodeOutputCache.getAllCachedOutputs(workflowId)
        const cachedNodeIds = Object.keys(cachedOutputs)
        cachedDataInfo = {
          loaded: true,
          nodeCount: cachedNodeIds.length,
          availableNodes: cachedNodeIds
        }
        logger.debug(`[test-node] Loaded ${cachedNodeIds.length} cached outputs for workflow ${workflowId}`)
      } catch (cacheError: any) {
        logger.warn(`[test-node] Failed to load cached outputs:`, cacheError)
      }
    }

    // Merge cached outputs with provided testData
    // testData takes precedence over cached data (allows manual overrides)
    const mergedData = {
      ...cachedOutputs,
      ...(testData || {})
    }

    // Debug logging for variable resolution
    logger.debug('[test-node] Merged data for variable resolution:', {
      cachedNodeIds: Object.keys(cachedOutputs),
      testDataKeys: Object.keys(testData || {}),
      mergedDataKeys: Object.keys(mergedData),
      sampleCachedData: Object.keys(cachedOutputs).length > 0
        ? {
            nodeId: Object.keys(cachedOutputs)[0],
            hasOutput: !!cachedOutputs[Object.keys(cachedOutputs)[0]]?.output,
            outputKeys: cachedOutputs[Object.keys(cachedOutputs)[0]]?.output
              ? Object.keys(cachedOutputs[Object.keys(cachedOutputs)[0]].output)
              : []
          }
        : null
    })

    // Create test context with merged data
    const testContext = {
      data: mergedData,
      userId: user.id,
      workflowId: workflowId || "test-workflow",
      testMode: true
    }

    // Pre-check: Try resolving variables to detect unresolved references
    // This provides better error messages to users about missing upstream node data
    const hasVariables = Object.values(config || {}).some((v: any) =>
      typeof v === 'string' && v.includes('{{') && v.includes('}}')
    )

    if (hasVariables) {
      const resolvedConfig = resolveValue(config, mergedData)
      const unresolvedVars = findUnresolvedVariables(config, resolvedConfig)

      if (unresolvedVars.length > 0) {
        // Extract which nodes we need data from
        const neededNodeIds = extractNodeIdsFromVariables(unresolvedVars)
        const availableNodeIds = Object.keys(cachedOutputs)

        // Check if this is a "missing cached data" issue vs other resolution failure
        const missingNodeIds = neededNodeIds.filter(id => !availableNodeIds.includes(id))

        logger.warn('[test-node] Unresolved variables detected:', {
          unresolvedVars,
          neededNodeIds,
          availableNodeIds,
          missingNodeIds
        })

        if (missingNodeIds.length > 0) {
          // Provide helpful error message about running upstream nodes first
          return jsonResponse({
            success: false,
            testResult: {
              success: false,
              output: {
                error: true,
                errorMessage: `Missing data from upstream node(s). Please run the following node(s) first: ${missingNodeIds.join(', ')}`,
                unresolvedVariables: unresolvedVars,
                missingNodes: missingNodeIds,
                availableNodes: availableNodeIds
              },
              message: `❌ Cannot resolve variables: ${unresolvedVars.join(', ')}\n\nThis node references output from other nodes that haven't been tested yet. Please test the upstream node(s) first, then try again.`
            },
            nodeInfo: {
              type: nodeType,
              title: nodeComponent.title,
              description: nodeComponent.description
            },
            cachedData: cachedDataInfo,
            debug: {
              unresolvedVariables: unresolvedVars,
              missingNodes: missingNodeIds,
              availableNodes: availableNodeIds,
              hint: 'Run the upstream nodes first to cache their outputs'
            }
          }, 400)
        }
      }
    }

    let testResult: any

    try {
      // Execute all nodes using the real executeAction function
      logger.debug('[test-node] Executing real action:', {
        nodeType,
        hasConfig: !!config,
        configKeys: Object.keys(config || {})
      })

      testResult = await executeAction({
        node: testNode,
        input: testContext.data,
        userId: user.id,
        workflowId: workflowId || "test-workflow",
        executionMode: 'live' // Execute real API calls
      })

      // Add success indicator to message if not already present
      if (testResult.success && testResult.message) {
        if (!testResult.message.includes('✅')) {
          testResult.message = `✅ ${testResult.message}`
        }
      } else if (testResult.success) {
        testResult.message = `✅ ${nodeComponent.title} executed successfully`
      }

      logger.debug('[test-node] Execution completed:', {
        success: testResult.success,
        hasOutput: !!testResult.output,
        outputKeys: testResult.output ? Object.keys(testResult.output) : []
      })

      // Save the test result to cache (if workflowId is provided)
      // This allows subsequent nodes to use this output as cached data
      if (workflowId && nodeId && testResult.success !== false) {
        try {
          await nodeOutputCache.saveNodeOutput({
            workflowId,
            userId: user.id,
            nodeId,
            nodeType,
            output: testResult,
            input: testContext.data
          })
          logger.debug(`[test-node] Cached output for node ${nodeId}`)
        } catch (cacheError: any) {
          logger.warn(`[test-node] Failed to cache test result:`, cacheError)
        }
      }
    } catch (error: any) {
      logger.error('[test-node] Execution failed:', {
        error: error.message,
        stack: error.stack,
        nodeType
      })

      // Return the actual error to the user
      testResult = {
        success: false,
        output: {
          error: true,
          errorMessage: error.message,
          errorDetails: error.stack,
          nodeType: nodeType,
          timestamp: new Date().toISOString()
        },
        message: `❌ Error: ${error.message}`,
        error: error.message
      }
    }

    return jsonResponse({
      success: testResult.success !== false, // Return actual success/failure
      testResult,
      nodeInfo: {
        type: nodeType,
        title: nodeComponent.title,
        description: nodeComponent.description,
        outputSchema: nodeComponent.outputSchema
      },
      cachedData: cachedDataInfo,
      outputCached: workflowId && nodeId && testResult.success !== false,
      // Debug info for troubleshooting variable resolution
      debug: {
        workflowId,
        nodeId,
        availableCachedNodes: cachedDataInfo.availableNodes,
        configHasVariables: Object.values(config || {}).some((v: any) =>
          typeof v === 'string' && v.includes('{{') && v.includes('}}')
        )
      }
    })

  } catch (error: any) {
    logger.error("Node test error:", error)
    return errorResponse(error.message || "Failed to test node" , 500)
  }
} 