import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'
import { applyAutoMappingSuggestions, type AutoMappingEntry } from '@/lib/workflows/autoMapping'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import {
  checkPrerequisites,
  selectModelForTask,
  calculateComplexity,
  generateNodeConfig,
  generateNodeConfigFix,
  augmentPlanWithFormatTransformers,
  testNode,
  calculateNodePosition,
  buildConfigWithFallback,
  isEmptyFieldValue,
  formatFieldName,
  formatFieldValue,
  buildAutoMappingTelemetry,
  filterAutoMappingEntriesForNode,
  logManualVerificationChecklist,
  sanitizeConfigForNode,
  sleep,
} from '@/lib/ai/stream-workflow-helpers'
import { callLLMWithRetry, parseLLMJson } from '@/lib/ai/llm-retry'
import { AI_MODELS } from '@/lib/ai/models'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

/**
 * Server-Sent Events (SSE) endpoint for real-time workflow building
 *
 * Streams events as AI builds workflow node-by-node:
 * - thinking: AI analyzing the request
 * - planning: Identified nodes to create
 * - node_creating: Starting to create a node
 * - node_configuring: Filling out node configuration
 * - node_testing: Testing the node with live/mock data
 * - node_complete: Node is ready
 * - workflow_complete: All nodes created successfully
 * - error: Something went wrong
 */
export async function POST(request: NextRequest) {
  // Rate limiting: 20 AI streaming requests per minute per IP
  const rateLimitResult = checkRateLimit(request, {
    limit: 20,
    windowSeconds: 60
  })
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response
  }

  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const {
      prompt,
      workflowId,
      connectedIntegrations = [],
      conversationHistory = [],
      contextNodes = [],
      testNodes = true, // Whether to test each node as it's built
      model = 'auto', // 'auto', 'gpt-4o-mini', 'gpt-4o'
      approvedPlan = null, // If user approved a plan, continue building from it
      viewport = null, // Viewport dimensions to position nodes correctly
      autoApprove = false, // Skip approval step and build immediately (for React agent)
      clarifications = {} // User-provided clarifications from analysis phase
    } = body

    logger.info('[STREAM] Clarifications payload summary', {
      clarificationKeys: clarifications ? Object.keys(clarifications) : [],
      detailsCount: Array.isArray(clarifications?.details) ? clarifications.details.length : 0,
      answersKeys: clarifications?.answers ? Object.keys(clarifications.answers) : [],
      hasClarifications: !!clarifications && Object.keys(clarifications).length > 0
    })

    if (!prompt && !approvedPlan) {
      return new Response('Prompt or approved plan is required', { status: 400 })
    }

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Helper to send SSE events
        const sendEvent = (type: string, data: any) => {
          const event = `data: ${JSON.stringify({ type, ...data, timestamp: new Date().toISOString() })}\n\n`
          controller.enqueue(encoder.encode(event))
        }

        try {
          let plan: any

          // Get available nodes (needed for both approved plans and new plans)
          const availableNodes = ALL_NODE_COMPONENTS.map(node => ({
            type: node.type,
            name: node.name,
            providerId: node.providerId,
            isTrigger: node.isTrigger,
            description: node.description || '',
            category: node.category || 'misc',
            schema: node.schema // Include schema for smart config
          }))

          // If we have an approved plan, skip prerequisites and planning
          if (approvedPlan) {
            plan = approvedPlan
            sendEvent('building_approved_plan', {
              message: 'Building your approved workflow...',
              step: 5,
              totalSteps: 5
            })
          } else {
            // Phase 1: Analyze & Check Prerequisites
            sendEvent('thinking', {
              message: 'Analyzing your request...',
              step: 1,
              totalSteps: 5
            })

          // Step 1: Analyze what apps are needed (uses shared utility with retry)
          const prerequisiteCheck = await checkPrerequisites({
            prompt,
            availableNodes,
            connectedIntegrations
          })

          if (!prerequisiteCheck.success) {
            sendEvent('error', { message: 'Failed to analyze prerequisites', error: prerequisiteCheck.error })
            controller.close()
            return
          }

          // Phase 2: Check Prerequisites
          sendEvent('checking_prerequisites', {
            message: 'Checking prerequisites...',
            step: 2,
            totalSteps: 5,
            requiredApps: prerequisiteCheck.requiredApps || [],
            connectedApps: connectedIntegrations
          })

          await sleep(300)

          // Normalize provider IDs for comparison (lowercase, remove spaces/dashes)
          const normalizeProviderId = (id: string) => {
            return id.toLowerCase().replace(/\s+/g, '-')
          }

          const connectedProviderIds = connectedIntegrations.map(normalizeProviderId)

          logger.info('[Prerequisite Check] Input state', {
            requiredApps: prerequisiteCheck.requiredApps,
            connectedIntegrations,
            normalizedConnected: connectedProviderIds
          })

          // Check if all required apps are connected
          const missingApps = (prerequisiteCheck.requiredApps || []).filter((app: string) => {
            const normalizedRequired = normalizeProviderId(app)
            const isConnected = connectedProviderIds.includes(normalizedRequired)
            logger.info('[Prerequisite Check] App connection status', {
              app,
              normalizedRequired,
              isConnected
            })
            return !isConnected
          })

          if (missingApps.length > 0) {
            sendEvent('missing_apps', {
              message: `Please connect these apps to continue: ${missingApps.join(', ')}`,
              missingApps,
              step: 2,
              totalSteps: 5
            })
            controller.close()
            return
          }

          // Check if sheets/tables are needed
          if (prerequisiteCheck.requiresSetup && prerequisiteCheck.setupItems && prerequisiteCheck.setupItems.length > 0) {
            sendEvent('check_setup', {
              message: prerequisiteCheck.setupMessage || 'Do you have the required setup configured?',
              setupItems: prerequisiteCheck.setupItems,
              step: 2,
              totalSteps: 5
            })
            // In a real implementation, we'd wait for user response here
            // For now, we'll assume they have it set up
            await sleep(500)
          }

          // Phase 3: Plan Workflow
          sendEvent('planning', {
            message: 'Planning your workflow...',
            step: 3,
            totalSteps: 5
          })

          // Build planning prompt — shows ALL available nodes to LLM
          // Previously this filtered to only connected integrations, producing weak plans
          // when users had few/no connections. Now we show everything and let the
          // prerequisite check + plan approval handle missing connections.
          const connectedProviders = new Set(connectedIntegrations)
          const coreProviders = new Set(['logic', 'ai', 'automation', 'manual', 'schedule', 'webhook'])

          const nodeList = availableNodes
            .map((n: any) => {
              const isConnected = connectedProviders.has(n.providerId) || coreProviders.has(n.providerId)
              return `- ${n.type}: ${n.description || n.name}${isConnected ? '' : ' [requires connection]'}`
            })
            .join('\n')

          const connectedList = connectedIntegrations.length > 0
            ? connectedIntegrations.join(', ')
            : 'None'

          const planningPrompt = `You are a workflow automation expert. Analyze this user request and create a detailed workflow plan.

User Request: "${prompt}"

Available Nodes:
${nodeList}

Connected Integrations: ${connectedList}

Rules:
1. ONLY use nodes from the available list above
2. Create a logical flow: trigger → actions → conditions → output
3. Prefer nodes from connected integrations when possible
4. You MAY suggest nodes marked [requires connection] — the user will be prompted to connect them
5. Build the BEST workflow for the user's goal, even if some integrations need setup
6. Keep workflows practical and focused on the user's goal

Return a JSON object with this structure:
{
  "understanding": "Brief explanation of what the user wants",
  "nodes": [
    {
      "type": "exact_node_type_from_list",
      "title": "Human-readable node name",
      "description": "What this node does in the workflow",
      "reasoning": "Why this node is needed"
    }
  ],
  "connections": "How the nodes connect together"
}

Be concise and practical. Focus on creating a working workflow.`

          try {
            const planResult = await callLLMWithRetry({
              messages: [{ role: 'user', content: planningPrompt }],
              model: AI_MODELS.fast,
              temperature: 0.3,
              jsonMode: true,
              maxTokens: 2000,
              maxRetries: 2,
              fallbackModel: AI_MODELS.planning,
              label: 'Stream:planning',
            })

            const planData = parseLLMJson(planResult.content, 'Stream:planning')
            plan = augmentPlanWithFormatTransformers(planData)
          } catch (planError: any) {
            sendEvent('error', { message: 'Failed to plan workflow', error: planError.message })
            controller.close()
            return
          }

          // Phase 4: Show Plan & Wait for Approval (unless autoApprove is true)
          if (!autoApprove) {
            sendEvent('show_plan', {
              message: "Here's what I'm going to build for you:",
              nodes: plan.nodes.map((n: any) => {
                // Find the node definition to get providerId
                const nodeDef = availableNodes.find((an: any) => an.type === n.type)
                return {
                  type: n.type,
                  title: n.title,
                  description: n.description,
                  providerId: nodeDef?.providerId || 'generic',
                  isTrigger: nodeDef?.isTrigger || false,
                  note: n.note
                }
              }),
              plan: plan, // Send full plan for building later
              step: 4,
              totalSteps: 5,
              requiresApproval: true
            })

            // Close the stream - user needs to approve plan first
            // They'll click "Continue Building" which will trigger a new request
            controller.close()
            return
          }

          // If autoApprove is true, send a non-blocking plan preview and continue building
          logger.info('[STREAM] Auto-approving plan; continuing immediately', {
            planKeys: Object.keys(plan),
            nodeCount: plan.nodes?.length ?? 0
          })

          if (!plan.nodes || !Array.isArray(plan.nodes)) {
            logger.error('[STREAM] Invalid plan structure - missing nodes array', { plan })
            sendEvent('error', {
              message: 'Invalid workflow plan structure',
              details: 'Plan is missing nodes array'
            })
            controller.close()
            return
          }

          sendEvent('auto_building_plan', {
            message: "Building your workflow...",
            nodes: plan.nodes.map((n: any) => {
              const nodeDef = availableNodes.find((an: any) => an.type === n.type)
              return {
                type: n.type,
                title: n.title,
                description: n.description,
                providerId: nodeDef?.providerId || 'generic',
                isTrigger: nodeDef?.isTrigger || false,
                note: n.note
              }
            })
          })
        }

        // Phase 2: Create all nodes first with "pending" status
          logger.info('[STREAM] Phase 2: Starting node creation', {
            nodeCount: plan.nodes.length
          })
          const createdNodes = []
          const createdEdges = []
          const nodeComponents = []

          sendEvent('creating_all_nodes', {
            message: 'Creating workflow structure...',
            totalNodes: plan.nodes.length
          })

          logger.info('[STREAM] Plan nodes overview', {
            nodes: plan.nodes.map((n: any) => ({ type: n.type, title: n.title }))
          })

          // Step 1: Create all nodes with pending status
          for (let i = 0; i < plan.nodes.length; i++) {
            const plannedNode = plan.nodes[i]

            // Find node component
            const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === plannedNode.type)
            if (!nodeComponent) {
              sendEvent('error', {
                message: `Node type "${plannedNode.type}" not found`,
                nodeIndex: i
              })
              continue
            }

            // Create node on canvas
            // Use UUID for database compatibility (workflow_nodes.id is uuid type)
            const nodeId = crypto.randomUUID()
            const position = calculateNodePosition(i, createdNodes, viewport)
            const nodeDescription = plannedNode.description || nodeComponent.description || ''

            const node = {
              id: nodeId,
              type: 'custom',
              position,
              data: {
                type: plannedNode.type,
                title: plannedNode.title,
                label: plannedNode.title,
                description: nodeDescription,
                providerId: nodeComponent.providerId,
                isTrigger: nodeComponent.isTrigger,
                note: plannedNode.note,
                outputSchema: nodeComponent.outputSchema || [],
                config: {},
                needsSetup: false,
                aiStatus: 'pending',
                aiBadgeText: 'Pending',
                aiBadgeVariant: 'default',
                autoExpand: false,
                isPending: true
              }
            }

            createdNodes.push(node)
            nodeComponents.push(nodeComponent)

            // Send event to add the node with pending status
            sendEvent('node_created', {
              message: `Added ${plannedNode.title}`,
              node,
              nodeIndex: i,
              isPending: true
            })

            await sleep(100) // Small delay for visual effect
          }

          // Step 2: Create all edges between nodes
          for (let i = 1; i < createdNodes.length; i++) {
            const edge = {
              id: `edge-${createdNodes[i - 1].id}-${createdNodes[i].id}`,
              source: createdNodes[i - 1].id,
              target: createdNodes[i].id,
              type: 'default'
            }
            createdEdges.push(edge)

            sendEvent('edge_created', {
              edge,
              message: `Connected ${createdNodes[i - 1].data.title} → ${createdNodes[i].data.title}`
            })

            await sleep(50) // Small delay for visual effect
          }

          // Wait a moment to let users see the complete structure
          await sleep(800)

          // Phase 3: Configure and test each node sequentially
          for (let i = 0; i < plan.nodes.length; i++) {
            const plannedNode = plan.nodes[i]
            const node = createdNodes[i]
            const nodeComponent = nodeComponents[i]

            if (!node || !nodeComponent) continue

            // Check if client disconnected
            if (request.signal.aborted) {
              logger.info('Client disconnected, stopping workflow build')
              controller.close()
              return
            }

            // Update progress indicator
            sendEvent('configuration_progress', {
              currentNode: i + 1,
              totalNodes: plan.nodes.length,
              nodeName: plannedNode.title,
              message: `Configuring node ${i + 1} of ${plan.nodes.length}: ${plannedNode.title}`
            })

            // Step 3a: Change node from pending to preparing
            node.data.aiStatus = 'preparing'
            node.data.aiBadgeText = 'Preparing'
            node.data.aiBadgeVariant = 'info'
            node.data.isPending = false
            node.data.autoExpand = true

            logger.info('[STREAM] Preparing node', {
              nodeId: node.id,
              title: plannedNode.title
            })
            sendEvent('node_preparing', {
              message: `Preparing ${plannedNode.title}...`,
              nodeIndex: i,
              nodeId: node.id,
              nodeName: plannedNode.title,
              status: 'preparing'
            })

            await sleep(800) // Show preparing state

            // Step 2: Configure node - change status to "Configuring"
            node.data.aiStatus = 'configuring'
            node.data.aiBadgeText = 'Configuring'
            node.data.aiBadgeVariant = 'info'
            logger.info('[STREAM] Starting configuration', {
              nodeId: node.id,
              title: plannedNode.title
            })
            sendEvent('node_configuring', {
              message: `Configuring ${plannedNode.title}...`,
              nodeIndex: i,
              nodeId: node.id,
              nodeName: plannedNode.title,
              status: node.data.aiStatus,
              badgeText: node.data.aiBadgeText,
              badgeVariant: node.data.aiBadgeVariant
            })

            await sleep(500) // Wait for configuring state to show

            // Determine which model to use for configuration
            const configModel = selectModelForTask({
              taskType: 'configuration',
              nodeType: plannedNode.type,
              complexity: calculateComplexity(plannedNode),
              userPreference: model
            })

            // Generate configuration with timeout
            logger.info('[STREAM] Calling generateNodeConfig', {
              title: plannedNode.title,
              nodeId: node.id,
              model: configModel
            })
            const configStartTime = Date.now()
            const configResult = await generateNodeConfig({
              node: plannedNode,
              runtimeNode: node,
              nodeComponent,
              previousNodes: createdNodes.slice(0, i),
              prompt,
              model: configModel,
              userId: user.id,
              clarifications, // Pass clarifications to config generation
              workflowData: {
                nodes: createdNodes,
                edges: createdEdges
              }
            })
            const configDuration = Date.now() - configStartTime
            logger.info('[STREAM] generateNodeConfig completed', {
              title: plannedNode.title,
              durationMs: configDuration
            })

            const { finalConfig, fallbackFields, reasoning, usedFallback } = buildConfigWithFallback({
              nodeComponent,
              initialConfig: configResult.success ? (configResult.config || {}) : {},
              plannedNode,
              prompt
            })

            logger.info('[STREAM] Config result summary', {
              success: configResult.success,
              hasConfig: !!configResult.config,
              configKeys: Object.keys(configResult.config || {}),
              finalConfigKeys: Object.keys(finalConfig),
              fallbackFields
            })

            if (!configResult.success && fallbackFields.length === 0) {
              logger.error('[STREAM] Failed to configure node', {
                title: plannedNode.title,
                error: configResult.error
              })
              sendEvent('error', {
                message: `Failed to configure ${plannedNode.title}`,
                error: configResult.error,
                nodeIndex: i
              })
              continue
            }

            // Update node with config field-by-field for visual effect
            const sanitizedFinalConfig = sanitizeConfigForNode(finalConfig, nodeComponent)
            const eligibleAutoMappingEntries = filterAutoMappingEntriesForNode(nodeComponent, configResult.autoMappingEntries)
            const configWithAutoMappings = applyAutoMappingSuggestions({
              config: sanitizedFinalConfig,
              entries: eligibleAutoMappingEntries
            })
            const finalConfigWithMappings = sanitizeConfigForNode(configWithAutoMappings, nodeComponent)
            const autoMappingTelemetry = buildAutoMappingTelemetry({
              entries: eligibleAutoMappingEntries,
              finalConfig: finalConfigWithMappings
            })
            const configFields = Object.entries(finalConfigWithMappings)
            const unresolvedFallbackFields = fallbackFields.filter(field => isEmptyFieldValue(finalConfigWithMappings[field]))
            const enforcedMissingFields: string[] = []

            if (nodeComponent.type === 'slack_action_send_message') {
              if (isEmptyFieldValue(finalConfigWithMappings.channel)) {
                enforcedMissingFields.push('channel')
              }
              if (isEmptyFieldValue(finalConfigWithMappings.message)) {
                enforcedMissingFields.push('message')
              }
            }

            const effectiveFallbackFields = Array.from(new Set([...unresolvedFallbackFields, ...enforcedMissingFields]))
            const hasUnresolvedFields = effectiveFallbackFields.length > 0
            logger.info('[STREAM] Applying configuration fields', {
              title: plannedNode.title,
              fieldCount: configFields.length,
              fieldKeys: Object.keys(finalConfigWithMappings)
            })

            if (autoMappingTelemetry) {
              logger.info('[STREAM] Auto-mapping telemetry', {
                nodeId: node.id,
                title: plannedNode.title,
                suggested: autoMappingTelemetry.suggested,
                applied: autoMappingTelemetry.applied
              })
            }

            // If no config fields for trigger, add a default one to show something
            if (configFields.length === 0 && nodeComponent.isTrigger) {
              logger.info('[STREAM] No config for trigger; adding default message', {
                title: plannedNode.title
              })
              sendEvent('field_configured', {
                message: `Trigger will activate on events`,
                nodeId: node.id,
                nodeIndex: i,
                fieldKey: 'status',
                fieldValue: 'Ready to receive events',
                displayValue: 'Ready to receive events',
                fieldIndex: 0,
                totalFields: 1,
                status: 'configuring',
                badgeText: 'Configuring',
                badgeVariant: 'info'
              })
            }

            for (let fieldIndex = 0; fieldIndex < configFields.length; fieldIndex++) {
              const [fieldKey, fieldValue] = configFields[fieldIndex]

              // Add field to node config
              node.data.config[fieldKey] = fieldValue
              logger.info('[STREAM] Setting field value', {
                title: plannedNode.title,
                fieldKey,
                fieldValue
              })

              // Format display value for the field
              let displayValue = configResult.displayOverrides?.[fieldKey] || ''
              if (!displayValue) {
                if (typeof fieldValue === 'string' && fieldValue.includes('{{AI_FIELD:')) {
                  displayValue = '✨ AI will generate'
                } else if (typeof fieldValue === 'string' && fieldValue.includes('{{')) {
                  const varMatch = fieldValue.match(/\{\{([^}]+)\}\}/)
                  displayValue = varMatch ? `📎 From ${varMatch[1]}` : String(fieldValue)
                } else if (fieldValue === '' || fieldValue === null || fieldValue === undefined) {
                  displayValue = 'User will select'
                } else {
                  displayValue = String(fieldValue).substring(0, 50)
                  if (String(fieldValue).length > 50) displayValue += '...'
                }
              }

              // Send event for this field
              sendEvent('field_configured', {
                message: `Setting ${formatFieldName(fieldKey)}...`,
                nodeId: node.id,
                nodeIndex: i,
                fieldKey,
                fieldValue,
                displayValue,
                fieldIndex,
                totalFields: configFields.length,
                viaFallback: effectiveFallbackFields.includes(fieldKey),
                status: 'configuring',
                badgeText: 'Configuring',
                badgeVariant: 'info'
              })

              await sleep(300) // Pause to show each field being set visually
            }

            node.data.aiStatus = hasUnresolvedFields ? 'configuring' : 'configured'
            node.data.aiBadgeText = hasUnresolvedFields ? 'Review Settings' : 'Ready'
            node.data.aiBadgeVariant = hasUnresolvedFields ? 'warning' : 'success'
            if (!node.data.description) {
              node.data.description = reasoning || configResult.reasoning || node.data.description
            }
            node.data.aiFallbackFields = effectiveFallbackFields
            node.data.autoMappingTelemetry = autoMappingTelemetry

            sendEvent('node_configured', {
              message: `✓ ${plannedNode.title} configured`,
              nodeId: node.id,
              config: finalConfigWithMappings,
              nodeIndex: i,
              reasoning: reasoning || configResult.reasoning, // Why AI chose these values
              description: node.data.description,
              status: node.data.aiStatus,
              badgeText: node.data.aiBadgeText,
              badgeVariant: node.data.aiBadgeVariant,
              fallbackFields: effectiveFallbackFields,
              autoMappingTelemetry
            })

            if (nodeComponent.type === 'slack_action_send_message') {
              const missingChannel = enforcedMissingFields.includes('channel')
              const missingMessage = enforcedMissingFields.includes('message')
              const slackNeedsManualSetup = missingChannel || missingMessage

              if (slackNeedsManualSetup) {
                node.data.aiStatus = 'error'
                node.data.aiBadgeText = missingChannel ? 'Select a Slack channel' : 'Add message content'
                node.data.aiBadgeVariant = 'warning'
                node.data.executionStatus = 'pending'
                node.data.needsSetup = true

                sendEvent('node_complete', {
                  message: missingChannel
                    ? `⚠️ ${plannedNode.title} needs a Slack channel before it can run`
                    : `⚠️ ${plannedNode.title} needs message content before it can run`,
                  nodeId: node.id,
                  nodeName: plannedNode.title,
                  nodeIndex: i,
                  totalNodes: plan.nodes.length,
                  skipTest: true,
                  testResult: {
                    success: false,
                    message: missingChannel
                      ? 'Channel is required before this Slack action can be tested.'
                      : 'Message content is required before testing this Slack action.'
                  },
                  status: node.data.aiStatus,
                  badgeText: node.data.aiBadgeText,
                  badgeVariant: node.data.aiBadgeVariant,
                  executionStatus: node.data.executionStatus
                })

                continue
              }
            }

            // Add wait after configuration for all nodes
            await sleep(500)

            // Step 3: Test node (validate triggers, execute actions)
            if (nodeComponent.isTrigger) {
              logger.info('[STREAM] Validating trigger configuration', {
                title: plannedNode.title
              })

              // Validate trigger: check required fields are populated
              const triggerSchema = nodeComponent.configSchema || []
              const triggerConfig = node.data.config || {}
              const missingRequired = triggerSchema
                .filter((f: any) => f.required && !f.hidden && f.name !== 'connection')
                .filter((f: any) => {
                  const val = triggerConfig[f.name]
                  return val === undefined || val === null || val === ''
                })

              const hasMissingFields = missingRequired.length > 0

              if (hasMissingFields) {
                const missingNames = missingRequired.map((f: any) => f.label || f.name).join(', ')
                node.data.aiStatus = 'ready'
                node.data.aiBadgeText = 'Review Settings'
                node.data.aiBadgeVariant = 'warning'
                node.data.executionStatus = 'completed'
                node.data.needsSetup = true
                node.data.firstMissingField = missingRequired[0]?.name
                node.data.validationMessage = `Missing required: ${missingNames}`
              } else {
                node.data.aiStatus = 'ready'
                node.data.aiBadgeText = 'Successful'
                node.data.aiBadgeVariant = 'success'
                node.data.executionStatus = 'completed'
              }

              sendEvent('node_complete', {
                message: hasMissingFields
                  ? `⚠️ ${plannedNode.title} needs setup (missing required fields)`
                  : `✅ ${plannedNode.title} configured (trigger will activate on events)`,
                nodeId: node.id,
                nodeName: plannedNode.title,
                nodeIndex: i,
                totalNodes: plan.nodes.length,
                skipTest: true,
                testResult: {
                  success: true,
                  message: hasMissingFields
                    ? 'Trigger needs manual configuration for required fields'
                    : 'Trigger configured - will activate when events occur'
                },
                status: 'ready',
                badgeText: node.data.aiBadgeText,
                badgeVariant: node.data.aiBadgeVariant,
                executionStatus: node.data.executionStatus
              })

              // Wait before starting next node
              logger.trace('[STREAM] Sleeping after trigger node', {
                durationMs: 1500,
                title: plannedNode.title
              })
              await sleep(1500) // Changed to match non-trigger delay
              logger.trace('[STREAM] Trigger sleep finished', {
                iteration: i,
                remaining: plan.nodes.length - (i + 1)
              })
              logger.trace('[STREAM] Checking connection after trigger')

              // Check if stream is still alive
              if (request.signal.aborted) {
                logger.warn('[STREAM] Client disconnected after trigger; aborting build')
                controller.close()
                return
              }

              logger.info('[STREAM] Trigger block complete; client still connected', {
                nodeIndex: i
              })
            } else {
              // Test action and logic nodes
              node.data.aiStatus = 'testing'
              node.data.aiBadgeText = 'Testing'
              node.data.aiBadgeVariant = 'info'
              sendEvent('node_testing', {
                message: `Testing ${plannedNode.title}...`,
                nodeId: node.id,
                nodeIndex: i,
                status: node.data.aiStatus,
                badgeText: node.data.aiBadgeText,
                badgeVariant: node.data.aiBadgeVariant
              })

              // Test with retry logic for fixing errors
              let testResult = await testNode({
                node,
                previousNodes: createdNodes.slice(0, i),
                userId: user.id,
                supabase,
                userPrompt: prompt,
                workflowContext: plan.description || prompt
              })

              // If test failed, try to fix the configuration
              let retryCount = 0
              const MAX_RETRIES = 2

              while (!testResult.success && retryCount < MAX_RETRIES) {
              retryCount++

              sendEvent('node_fixing', {
                message: `Fixing configuration issue (attempt ${retryCount}/${MAX_RETRIES})...`,
                nodeId: node.id,
                nodeIndex: i,
                error: testResult.error,
                attempt: retryCount
              })

              // Analyze the error and generate a fix
              const fixResult = await generateNodeConfigFix({
                node: plannedNode,
                nodeComponent,
                previousConfig: node.data.config,
                error: testResult.error,
                errorDetails: testResult.summary,
                previousNodes: createdNodes.slice(0, i),
                prompt,
                model,
                userId: user.id
              })

              if (fixResult.success && fixResult.config) {
                // Apply the fix field by field
                const fixedFields = Object.entries(fixResult.config)
                for (const [fixKey, fixValue] of fixedFields) {
                  if (node.data.config[fixKey] !== fixValue) {
                    node.data.config[fixKey] = fixValue

                    sendEvent('field_fixed', {
                      message: `Fixed ${formatFieldName(fixKey)}`,
                      nodeId: node.id,
                      fieldKey: fixKey,
                      oldValue: node.data.config[fixKey],
                      newValue: fixValue,
                      nodeIndex: i
                    })

                    await sleep(200)
                  }
                }

                // Re-test with fixed configuration
                sendEvent('node_retesting', {
                  message: `Re-testing with fixed configuration...`,
                  nodeId: node.id,
                  nodeIndex: i
                })

                testResult = await testNode({
                  node,
                  previousNodes: createdNodes.slice(0, i),
                  userId: user.id,
                  supabase,
                  userPrompt: prompt,
                  workflowContext: plan.description || prompt
                })
              } else {
                // Could not generate a fix, exit retry loop
                break
              }
            }

              if (testResult.success) {
                // Send test data field-by-field to show it populating
                if (testResult.preview && typeof testResult.preview === 'object') {
                  const testDataFields = Object.entries(testResult.preview)
                  for (let testFieldIndex = 0; testFieldIndex < testDataFields.length; testFieldIndex++) {
                    const [testFieldKey, testFieldValue] = testDataFields[testFieldIndex]

                    sendEvent('test_data_field', {
                      message: `${formatFieldName(testFieldKey)}: ${formatFieldValue(testFieldValue)}`,
                      nodeId: node.id,
                      nodeIndex: i,
                      fieldKey: testFieldKey,
                      fieldValue: testFieldValue,
                      fieldIndex: testFieldIndex,
                      totalFields: testDataFields.length
                    })

                    await sleep(150) // Show each test field
                  }
                }

                node.data.aiStatus = 'ready'
                node.data.aiBadgeText = 'Successful'
                node.data.aiBadgeVariant = 'success'
                node.data.executionStatus = 'completed'
                node.data.needsSetup = false
                node.data.aiTestSummary = usedFallback
                  ? `${testResult.summary} Review the highlighted fields to tailor this node to your workflow.`
                  : testResult.summary

                sendEvent('node_tested', {
                  message: `✓ ${plannedNode.title} tested successfully`,
                  nodeId: node.id,
                  preview: testResult.preview,
                  nodeIndex: i,
                  summary: node.data.aiTestSummary,
                  status: node.data.aiStatus,
                  badgeText: node.data.aiBadgeText,
                  badgeVariant: node.data.aiBadgeVariant,
                  executionStatus: node.data.executionStatus
                })

                // Update node status to complete/ready
                node.data.aiStatus = 'ready'
                node.data.aiBadgeText = 'Successful'
                node.data.aiBadgeVariant = 'success'
                node.data.executionStatus = 'completed'

                // Send node complete event with test results
                sendEvent('node_complete', {
                  message: `✅ ${plannedNode.title} is ready`,
                  nodeId: node.id,
                  nodeName: plannedNode.title,
                  nodeIndex: i,
                  totalNodes: plan.nodes.length,
                  testResult: {
                    success: true,
                    message: testResult.summary || 'Configuration tested successfully'
                  },
                  status: 'ready',
                  badgeText: node.data.aiBadgeText,
                  badgeVariant: node.data.aiBadgeVariant,
                  executionStatus: node.data.executionStatus
                })

                // Wait before starting next node to ensure completion is visible
                await sleep(1500)
              } else {
                node.data.aiStatus = 'error'
                node.data.aiBadgeText = 'Needs Attention'
                node.data.aiBadgeVariant = 'danger'
                node.data.executionStatus = 'error'
                node.data.aiTestSummary = testResult.summary || testResult.error || null
                sendEvent('node_test_failed', {
                  message: `⚠️ ${plannedNode.title} test failed: ${testResult.error}`,
                  nodeId: node.id,
                  error: testResult.error,
                  nodeIndex: i,
                  canContinue: testResult.canContinue, // Can we proceed despite failure?
                  summary: testResult.summary,
                  status: node.data.aiStatus,
                  badgeText: node.data.aiBadgeText,
                  badgeVariant: node.data.aiBadgeVariant,
                  executionStatus: node.data.executionStatus
                })

                // If critical failure, stop building
                if (!testResult.canContinue) {
                  sendEvent('error', {
                    message: 'Critical test failure, cannot continue',
                    nodeIndex: i
                  })
                  controller.close()
                  return
                }
              }
            } // End of else block (testing for non-trigger nodes)

            logger.trace('[STREAM] Node iteration complete, pausing before next', {
              iteration: i,
              totalNodes: plan.nodes.length
            })

            // Brief pause before starting next node
            await sleep(300)
            logger.trace('[STREAM] Continuing to next node', {
              completed: i + 1,
              remaining: plan.nodes.length - (i + 1)
            })
          }

          logger.info('[STREAM] All nodes configured and tested, preparing workflow_complete event', {
            nodeCount: createdNodes.length
          })

          // Phase 3: Workflow Complete
          sendEvent('workflow_complete', {
            message: `🎉 Workflow ready! Created ${createdNodes.length} nodes`,
            nodes: createdNodes,
            edges: createdEdges,
            step: 3,
            totalSteps: 3
          })

          // Close stream
          logManualVerificationChecklist({
            createdNodes,
            workflowPrompt: prompt,
            clarificationsSummary: Object.keys(clarifications || {}).length,
            connectedIntegrations
          })
          controller.close()
        } catch (error: any) {
          logger.error('Stream workflow error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            fullError: JSON.stringify(error, null, 2)
          })
          sendEvent('error', {
            message: error.message || 'An error occurred while building workflow',
            error: error.toString()
          })
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      }
    })

  } catch (error) {
    logger.error('Stream workflow error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

// All helper functions have been extracted to @/lib/ai/stream-workflow-helpers.ts
// This route now only contains the SSE streaming logic.
