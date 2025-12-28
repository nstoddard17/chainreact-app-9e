/**
 * Discord HITL Webhook Handler
 * Receives Discord messages and routes them to active HITL conversations
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { processConversationMessage } from '@/lib/workflows/actions/hitl/conversation'
import { processEnhancedConversation } from '@/lib/workflows/actions/hitl/enhancedConversation'
import { sendDiscordThreadMessage } from '@/lib/workflows/actions/hitl/discord'
import { processConversationLearnings } from '@/lib/workflows/actions/hitl/memoryService'
import type { ConversationMessage } from '@/lib/workflows/actions/hitl/types'
import { NodeExecutionService } from '@/lib/services/nodeExecutionService'
import { ExecutionProgressTracker } from '@/lib/execution/executionProgressTracker'
import { createDataFlowManager } from '@/lib/workflows/dataFlowContext'

// Simple in-memory cache to prevent duplicate message processing
// Messages are cached for 60 seconds to handle retries/reconnects
const processedMessages = new Map<string, number>()
const MESSAGE_CACHE_TTL = 60000 // 60 seconds

function cleanupMessageCache() {
  const now = Date.now()
  for (const [messageId, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_CACHE_TTL) {
      processedMessages.delete(messageId)
    }
  }
}

/**
 * POST /api/webhooks/discord/hitl
 * Handles incoming Discord messages for HITL conversations
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()

    logger.info('📩 [HITL Webhook] Received Discord message', {
      type: payload.t,
      channelId: payload.d?.channel_id,
      messageId: payload.d?.id,
      author: payload.d?.author?.username,
      contentPreview: payload.d?.content?.substring(0, 50)
    })

    // Only process MESSAGE_CREATE events
    if (payload.t !== 'MESSAGE_CREATE') {
      return NextResponse.json({ ok: true, message: 'Not a message event' })
    }

    const message = payload.d
    const messageId = message.id

    // Deduplicate: Check if we've already processed this message
    cleanupMessageCache()
    if (messageId && processedMessages.has(messageId)) {
      logger.info('🔄 [HITL Webhook] Duplicate message detected, skipping', { messageId })
      return NextResponse.json({ ok: true, message: 'Duplicate message skipped' })
    }

    // Mark message as being processed
    if (messageId) {
      processedMessages.set(messageId, Date.now())
    }

    // Ignore bot messages (prevent loops)
    if (message.author?.bot) {
      logger.debug('🤖 [HITL Webhook] Ignoring bot message')
      return NextResponse.json({ ok: true, message: 'Bot message ignored' })
    }

    const channelId = message.channel_id
    const content = message.content
    const authorId = message.author?.id
    const authorName = message.author?.username

    if (!channelId || !content) {
      logger.warn('⚠️ [HITL Webhook] Missing required fields', { channelId, hasContent: !!content })
      return NextResponse.json({ ok: true, message: 'Missing required fields' })
    }

    // Find HITL conversation for this channel (active or timeout)
    // IMPORTANT: Use service client since this webhook is called from Discord Gateway
    // without user authentication - RLS would block the query otherwise
    const supabase = await createSupabaseServiceClient()

    logger.info('🔍 [HITL Webhook] Looking up conversation for channel', { channelId })

    // DEBUG: First, log ALL conversations for this channel to see what exists
    const { data: allConversations, error: debugError } = await supabase
      .from('hitl_conversations')
      .select('id, channel_id, status, created_at, execution_id')
      .eq('channel_id', channelId)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 [HITL Webhook DEBUG] All conversations for channel:')
    console.log(`   Channel ID: ${channelId}`)
    console.log(`   Found: ${allConversations?.length || 0} conversation(s)`)
    if (allConversations && allConversations.length > 0) {
      allConversations.forEach((conv, i) => {
        console.log(`   [${i + 1}] ID: ${conv.id}, Status: ${conv.status}, Created: ${conv.created_at}`)
      })
    }
    if (debugError) {
      console.log(`   Debug Query Error: ${debugError.message}`)
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Get the MOST RECENT active/timeout conversation (in case there are multiple)
    const { data: conversations, error } = await supabase
      .from('hitl_conversations')
      .select('*')
      .eq('channel_id', channelId)
      .in('status', ['active', 'timeout'])
      .order('started_at', { ascending: false })
      .limit(1)

    const conversation = conversations?.[0] || null

    if (error || !conversation) {
      // No active or timed-out conversation in this channel - ignore
      console.log('📭 [HITL Webhook] No active conversation found:', {
        channelId,
        error: error?.message || 'No matching record',
        code: error?.code,
        details: error?.details
      })
      return NextResponse.json({ ok: true, message: 'No active conversation' })
    }

    // ============================================
    // HANDLE TIMED-OUT CONVERSATIONS (REACTIVATION)
    // ============================================
    if (conversation.status === 'timeout') {
      logger.info('Found timed-out HITL conversation', {
        conversationId: conversation.id,
        executionId: conversation.execution_id,
        channelId
      })

      const lowerMessage = content.toLowerCase().trim()

      // Check if user wants to reactivate
      const reactivationKeywords = ['continue', 'resume', 'reactivate', 'restart']
      const wantsToReactivate = reactivationKeywords.some(keyword =>
        lowerMessage.includes(keyword)
      )

      if (!wantsToReactivate) {
        // User didn't say a reactivation keyword
        await sendDiscordThreadMessage(
          conversation.user_id,
          channelId,
          "⏱️ **This conversation has timed out.**\n\n" +
          "If you'd like to continue where we left off, please reply with **'continue'** to reactivate it."
        )
        return NextResponse.json({ ok: true, message: 'Awaiting reactivation keyword' })
      }

      // Get workflow execution to check its status
      const { data: execution, error: execError } = await supabase
        .from('workflow_executions')
        .select('*')
        .eq('id', conversation.execution_id)
        .single()

      if (execError || !execution) {
        logger.error('Failed to find execution for timed-out conversation', { error: execError })
        return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
      }

      const resumeData = execution.resume_data as any
      const hitlConfig = resumeData?.hitl_config || {}
      const timeoutMinutes = conversation.timeout_minutes || hitlConfig.timeout || 60

      // Check if workflow already completed (auto-proceeded)
      if (execution.status === 'completed') {
        await sendDiscordThreadMessage(
          conversation.user_id,
          channelId,
          "❌ **This workflow has already completed.**\n\n" +
          "When the conversation timed out, the workflow was configured to proceed automatically. " +
          "The remaining steps have already been executed.\n\n" +
          "_You'll need to start a new workflow to perform this action again._"
        )
        return NextResponse.json({ ok: true, message: 'Workflow already completed' })
      }

      // Check if workflow was cancelled
      if (execution.status === 'cancelled') {
        // Reactivate the workflow back to paused state
        await supabase
          .from('workflow_executions')
          .update({
            status: 'paused',
            paused_node_id: conversation.node_id,
            error: null,  // Clear the timeout error
            paused_at: conversation.started_at  // Keep original paused time
          })
          .eq('id', execution.id)

        logger.info('Workflow reactivated from cancelled state', {
          executionId: execution.id,
          conversationId: conversation.id
        })
      }

      // Reactivate the conversation
      await supabase
        .from('hitl_conversations')
        .update({
          status: 'active',
          timeout_at: new Date(Date.now() + timeoutMinutes * 60 * 1000),  // Reset timeout
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)

      // Send reactivation confirmation
      await sendDiscordThreadMessage(
        conversation.user_id,
        channelId,
        "✅ **Conversation Reactivated!**\n\n" +
        "Let's continue where we left off. Here's the context:\n\n" +
        "---\n\n" +
        conversation.context_data +
        "\n\n---\n\n" +
        `You have **${timeoutMinutes} minutes** to respond before this times out again.\n\n` +
        "What would you like to do?"
      )

      logger.info('HITL conversation reactivated', {
        conversationId: conversation.id,
        executionId: execution.id,
        newTimeoutAt: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString()
      })

      return NextResponse.json({
        ok: true,
        action: 'reactivated',
        conversationId: conversation.id
      })
    }

    // ============================================
    // ACTIVE CONVERSATION - NORMAL PROCESSING
    // ============================================
    logger.info('🎯 [HITL Webhook] Found active conversation', {
      conversationId: conversation.id,
      executionId: conversation.execution_id,
      channelId,
      historyLength: conversation.conversation_history?.length || 0
    })

    // Get the workflow execution to access resume_data
    const { data: execution, error: execError } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('id', conversation.execution_id)
      .single()

    if (execError || !execution || !execution.resume_data) {
      logger.error('❌ [HITL Webhook] Failed to find execution or resume data', { error: execError })
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 })
    }

    const resumeData = execution.resume_data as any
    const hitlConfig = resumeData.hitl_config
    const contextData = resumeData.context_data

    logger.info('📋 [HITL Webhook] Processing user message', {
      userMessage: content.substring(0, 100),
      hasHitlConfig: !!hitlConfig,
      continuationSignals: hitlConfig?.continuationSignals || []
    })

    // Add user message to conversation history
    const conversationHistory: ConversationMessage[] = conversation.conversation_history || []
    conversationHistory.push({
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    })

    logger.info('🤖 [HITL Webhook] Calling OpenAI for AI response...', {
      historyLength: conversationHistory.length,
      hasSystemPrompt: !!conversation.system_prompt
    })

    // Process message through enhanced AI conversation system
    const { aiResponse, shouldContinue, extractedVariables, summary, needsFileSearch, searchQuery } =
      await processEnhancedConversation(
        content,
        conversationHistory,
        hitlConfig,
        contextData,
        conversation.user_id,
        conversation.system_prompt || undefined // Use enhanced prompt with memory
      )

    logger.info('✅ [HITL Webhook] AI response received', {
      responseLength: aiResponse?.length || 0,
      shouldContinue,
      hasExtractedVariables: !!extractedVariables && Object.keys(extractedVariables).length > 0,
      summary: summary?.substring(0, 50),
      needsFileSearch
    })

    // Add AI response to history
    conversationHistory.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    })

    // Send AI response back to Discord
    logger.info('📤 [HITL Webhook] Sending AI response to Discord...', {
      channelId,
      responsePreview: aiResponse.substring(0, 100)
    })

    const sendResult = await sendDiscordThreadMessage(conversation.user_id, channelId, aiResponse)

    logger.info('📬 [HITL Webhook] Discord message send result', { success: sendResult })

    // Handle file search if needed
    if (needsFileSearch && searchQuery) {
      logger.info('File search requested in HITL conversation', {
        conversationId: conversation.id,
        searchQuery
      })

      // Perform the actual file search
      const { searchFiles, getConnectedStorageIntegrations } = await import('@/lib/workflows/actions/hitl/enhancedConversation')

      const storageProviders = await getConnectedStorageIntegrations(conversation.user_id)

      if (storageProviders.length === 0) {
        await sendDiscordThreadMessage(
          conversation.user_id,
          channelId,
          '❌ You don\'t have any storage integrations connected. Please connect Google Drive, OneDrive, or Notion to search for files.'
        )
      } else {
        // Search across all connected providers
        const searchResults = await searchFiles(conversation.user_id, searchQuery, storageProviders)

        if (searchResults.length === 0) {
          await sendDiscordThreadMessage(
            conversation.user_id,
            channelId,
            `🔍 I searched for "${searchQuery}" but didn't find any matching files.`
          )
        } else {
          // Format and display results
          let resultsMessage = `🔍 **Found ${searchResults.length} result${searchResults.length === 1 ? '' : 's'} for "${searchQuery}":**\n\n`

          searchResults.forEach((result, index) => {
            const providerEmoji = {
              'google-drive': '📁',
              'google-docs': '📄',
              'onedrive': '☁️',
              'notion': '📝'
            }[result.provider] || '📄'

            resultsMessage += `${index + 1}. ${providerEmoji} **${result.name}**\n`
            if (result.snippet) {
              resultsMessage += `   _${result.snippet}_\n`
            }
            resultsMessage += `   🔗 ${result.url}\n\n`
          })

          resultsMessage += '\nWhich file would you like me to reference, or would you like me to continue with the original plan?'

          await sendDiscordThreadMessage(
            conversation.user_id,
            channelId,
            resultsMessage
          )
        }
      }
    }

    if (shouldContinue) {
      // User is ready to continue - finalize conversation and resume workflow
      logger.info('Continuation signal detected - resuming workflow', {
        conversationId: conversation.id,
        executionId: conversation.execution_id,
        extractedVariables
      })

      // Mark conversation as completed
      await supabase
        .from('hitl_conversations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          conversation_history: conversationHistory,
          extracted_variables: extractedVariables
        })
        .eq('id', conversation.id)

      // Extract and save learnings from this conversation (async, don't block workflow)
      processConversationLearnings(
        conversation.id,
        conversation.user_id,
        conversation.workflow_id,
        conversationHistory,
        contextData,
        {
          enableMemory: hitlConfig.enableMemory,
          memoryCategories: hitlConfig.memoryCategories,
          memoryStorageDocument: hitlConfig.memoryStorageDocument,
          cacheInDatabase: hitlConfig.cacheInDatabase
        }
      ).catch(error => {
        // Log error but don't fail the workflow
        logger.error('Failed to process learnings (non-blocking)', { error: error.message })
      })

      // Prepare conversation output data
      const conversationOutput = {
        hitlStatus: 'continued',
        conversationSummary: summary || 'User approved',
        messagesCount: conversationHistory.length,
        duration: Math.round(
          (new Date().getTime() - new Date(conversation.started_at).getTime()) / 1000
        ),
        extractedVariables: extractedVariables || {},
        conversationHistory
      }

      // Send final message to Discord before resuming
      await sendDiscordThreadMessage(
        conversation.user_id,
        channelId,
        '✅ **Workflow continuing!** Thanks for the input.'
      )

      // Resume workflow execution directly (using service client to bypass RLS)
      try {
        const serviceSupabase = await createSupabaseServiceClient()

        // Load workflow metadata
        const { data: workflow, error: workflowError } = await serviceSupabase
          .from('workflows')
          .select('*')
          .eq('id', conversation.workflow_id)
          .single()

        if (workflowError || !workflow) {
          throw new Error(`Workflow not found: ${workflowError?.message}`)
        }

        // For V2 flows, load the latest revision which contains the actual graph data
        // The workflows table may have empty nodes/connections for V2 flows
        let allNodes: any[] = workflow.nodes || []
        let allEdges: any[] = workflow.edges || workflow.connections || []

        if (workflow.flow_v2_enabled || allNodes.length === 0) {
          logger.info('[HITL Resume] Loading workflow graph from revisions table')

          const { data: latestRevision, error: revisionError } = await serviceSupabase
            .from('workflows_revisions')
            .select('graph')
            .eq('workflow_id', conversation.workflow_id)
            .order('version', { ascending: false })
            .limit(1)
            .single()

          if (!revisionError && latestRevision?.graph) {
            const graph = latestRevision.graph as any
            allNodes = graph.nodes || []

            // V2 edges use {from: {nodeId}, to: {nodeId}} format
            // Convert to {source, target} format for compatibility
            const v2Edges = graph.edges || []
            allEdges = v2Edges.map((edge: any) => ({
              id: edge.id,
              source: edge.from?.nodeId || edge.source,
              target: edge.to?.nodeId || edge.target,
              ...edge
            }))

            logger.info('[HITL Resume] Loaded from revision', {
              nodeCount: allNodes.length,
              edgeCount: allEdges.length
            })
          } else {
            logger.warn('[HITL Resume] Could not load revision', { error: revisionError?.message })
          }
        }

        // Convert V2 nodes to old format if needed
        // V2 format: {id, type, config, label, metadata: {position}}
        // Old format: {id, data: {type, config, title}, position}
        const convertV2NodeToOldFormat = (v2Node: any) => {
          // If already in old format (has data.type), return as-is
          if (v2Node.data?.type) {
            return v2Node
          }
          // Convert V2 to old format
          return {
            id: v2Node.id,
            type: 'custom', // React Flow type
            position: v2Node.metadata?.position || { x: 0, y: 0 },
            data: {
              type: v2Node.type,
              title: v2Node.label || v2Node.type,
              config: v2Node.config || {},
              description: v2Node.description,
              providerId: v2Node.metadata?.providerId,
              category: v2Node.metadata?.category,
              isTrigger: v2Node.metadata?.isTrigger || false,
            }
          }
        }

        const nodes = allNodes
          .filter((node: any) =>
            node.type !== 'addAction' &&
            node.type !== 'insertAction' &&
            !node.id?.startsWith('add-action-')
          )
          .map(convertV2NodeToOldFormat)

        const edges = allEdges.filter((edge: any) => {
          const sourceNode = nodes.find((n: any) => n.id === edge.source)
          const targetNode = nodes.find((n: any) => n.id === edge.target)
          return sourceNode && targetNode
        })

        // Find next nodes after the paused node
        const pausedNodeId = execution.paused_node_id
        const nextNodes = edges
          .filter((edge: any) => edge.source === pausedNodeId)
          .map((edge: any) => nodes.find((n: any) => n.id === edge.target))
          .filter(Boolean)

        logger.info('[HITL Resume] Found next nodes', {
          pausedNodeId,
          nextNodesCount: nextNodes.length
        })

        if (nextNodes.length === 0) {
          // No more nodes - mark as completed
          await serviceSupabase
            .from('workflow_executions')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', conversation.execution_id)

          logger.info('[HITL Resume] Workflow completed - no more nodes')

          return NextResponse.json({
            ok: true,
            action: 'completed',
            message: 'Workflow completed'
          })
        }

        // Create execution context
        const dataFlowManager = createDataFlowManager(
          conversation.execution_id,
          conversation.workflow_id,
          conversation.user_id
        )

        // Preserve test/sandbox mode from original execution
        const originalTestMode = resumeData.testMode || execution.test_mode || false

        // Build HITL output with proper structure for variable resolution
        // Variables like {{hitl_conversation.status}} need data nested under 'hitl_conversation'
        const hitlOutput = {
          status: conversationOutput.hitlStatus,
          conversationSummary: conversationOutput.conversationSummary,
          messagesCount: conversationOutput.messagesCount,
          duration: conversationOutput.duration,
          extractedVariables: conversationOutput.extractedVariables,
          conversationHistory: conversationOutput.conversationHistory,
          // Also include extracted variables at top level for easy access
          ...(conversationOutput.extractedVariables || {})
        }

        // Register HITL node metadata and output with DataFlowManager
        // This enables variable resolution like {{hitl_conversation.recipientEmail}}
        const pausedNode = nodes.find((n: any) => n.id === pausedNodeId)
        if (pausedNode) {
          // Register by node ID
          dataFlowManager.setNodeMetadata(pausedNodeId, {
            title: pausedNode.data?.title || 'Ask Human via Chat',
            type: pausedNode.data?.type || 'hitl_conversation',
            outputSchema: [
              { name: 'status', label: 'Status', type: 'string' },
              { name: 'conversationSummary', label: 'Conversation Summary', type: 'string' },
              { name: 'messagesCount', label: 'Message Count', type: 'number' },
              { name: 'duration', label: 'Duration', type: 'number' },
              { name: 'extractedVariables', label: 'Extracted Variables', type: 'object' },
              // Include dynamic extracted variables in schema
              ...Object.keys(conversationOutput.extractedVariables || {}).map(key => ({
                name: key,
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                type: 'string'
              }))
            ]
          })
          dataFlowManager.setNodeOutput(pausedNodeId, {
            success: true,
            data: hitlOutput,
            metadata: {
              timestamp: new Date(),
              nodeType: 'hitl_conversation',
              executionTime: conversationOutput.duration * 1000
            }
          })

          // Also register by node type for {{hitl_conversation.field}} references
          dataFlowManager.setNodeMetadata('hitl_conversation', {
            title: 'Ask Human via Chat',
            type: 'hitl_conversation',
            outputSchema: [
              { name: 'status', label: 'Status', type: 'string' },
              { name: 'conversationSummary', label: 'Conversation Summary', type: 'string' },
              { name: 'messagesCount', label: 'Message Count', type: 'number' },
              { name: 'duration', label: 'Duration', type: 'number' },
              { name: 'extractedVariables', label: 'Extracted Variables', type: 'object' },
              ...Object.keys(conversationOutput.extractedVariables || {}).map(key => ({
                name: key,
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                type: 'string'
              }))
            ]
          })
          dataFlowManager.setNodeOutput('hitl_conversation', {
            success: true,
            data: hitlOutput,
            metadata: {
              timestamp: new Date(),
              nodeType: 'hitl_conversation',
              executionTime: conversationOutput.duration * 1000
            }
          })
        }

        const executionContext = {
          userId: conversation.user_id,
          workflowId: conversation.workflow_id,
          testMode: originalTestMode, // FIX: Preserve original test mode instead of hardcoding false
          data: {
            ...resumeData.input,                              // Original workflow data
            hitl_conversation: hitlOutput,                     // Nested for {{hitl_conversation.field}} access
            [pausedNodeId]: hitlOutput,                        // Also accessible via node ID for prefix matching
            ...(conversationOutput.extractedVariables || {})   // Extracted variables at top level for easy access
          },
          variables: {},
          results: {},
          dataFlowManager,
          executionId: conversation.execution_id
        }

        logger.info('[HITL Resume] Execution context created', {
          executionId: conversation.execution_id,
          testMode: originalTestMode,
          preservedFromResume: !!resumeData.testMode,
          preservedFromExecution: !!execution.test_mode,
          hitlOutputKeys: Object.keys(hitlOutput),
          dataKeys: Object.keys(executionContext.data),
          dataFlowManagerNodeIds: Object.keys(dataFlowManager.getContext().nodeMetadata)
        })

        // Resume progress tracking (don't create new record, continue existing one)
        const progressTracker = new ExecutionProgressTracker()
        const resumed = await progressTracker.resume(conversation.execution_id)

        if (!resumed) {
          logger.warn('[HITL Resume] Could not resume progress tracker, initializing new one')
          await progressTracker.initialize(
            conversation.execution_id,
            conversation.workflow_id,
            conversation.user_id,
            nodes.length
          )
        }

        // Mark the HITL node as completed first
        await progressTracker.updateNodeCompleted(pausedNodeId, hitlOutput)
        logger.info('[HITL Resume] Marked HITL node as completed', { pausedNodeId })

        const nodeExecutionService = new NodeExecutionService()

        for (const nextNode of nextNodes) {
          const nodeTitle = nextNode.data?.title || nextNode.data?.type || nextNode.id

          // Update progress: starting this node
          await progressTracker.update({
            currentNodeId: nextNode.id,
            currentNodeName: `Executing: ${nodeTitle}`,
          })

          logger.info(`[HITL Resume] Executing: ${nextNode.id} (${nodeTitle})`)

          const result = await nodeExecutionService.executeNode(
            nextNode,
            nodes,
            edges,
            executionContext
          )

          if (result?.pauseExecution) {
            logger.info('[HITL Resume] Paused again at', nextNode.id)
            await progressTracker.pause(nextNode.id, `Waiting: ${nodeTitle}`)
            break
          }

          // Mark this node as completed
          await progressTracker.updateNodeCompleted(nextNode.id, result)
          logger.info(`[HITL Resume] Node completed: ${nextNode.id}`)
        }

        await progressTracker.complete(true)

        await serviceSupabase
          .from('workflow_executions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', conversation.execution_id)

        logger.info('[HITL Resume] Workflow resumed and completed')

        return NextResponse.json({
          ok: true,
          action: 'resumed',
          executionId: conversation.execution_id
        })

      } catch (resumeError: any) {
        logger.error('[HITL Resume] Error', { error: resumeError.message })

        await sendDiscordThreadMessage(
          conversation.user_id,
          channelId,
          '❌ **Error resuming workflow**\n\nThere was a problem continuing the workflow. Please check the logs.'
        )

        return NextResponse.json({
          ok: false,
          error: 'Failed to resume workflow',
          details: resumeError.message
        }, { status: 500 })
      }
    } else {
      // Continue conversation - update history
      await supabase
        .from('hitl_conversations')
        .update({
          conversation_history: conversationHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)

      return NextResponse.json({
        ok: true,
        action: 'continue_conversation'
      })
    }

  } catch (error: any) {
    logger.error('Discord HITL webhook error', { error: error.message })
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
