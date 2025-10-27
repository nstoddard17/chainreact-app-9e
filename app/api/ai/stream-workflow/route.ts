import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'
import { computeAutoMappingEntries, extractNodeOutputs, sanitizeAlias, applyAutoMappingSuggestions, type AutoMappingEntry } from '@/lib/workflows/autoMapping'
import OpenAI from 'openai'

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

    logger.debug('[STREAM] Clarifications payload summary', {
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

          // Step 1: Analyze what apps are needed
          const prerequisitePrompt = buildPrerequisitePrompt({
            prompt,
            availableNodes,
            connectedIntegrations
          })

          const prerequisiteCheck = await callAI({
            prompt: prerequisitePrompt,
            model: 'gpt-4o-mini',
            temperature: 0.2,
            responseFormat: 'json'
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

          logger.debug('[Prerequisite Check] Input state', {
            requiredApps: prerequisiteCheck.requiredApps,
            connectedIntegrations,
            normalizedConnected: connectedProviderIds
          })

          // Check if all required apps are connected
          const missingApps = (prerequisiteCheck.requiredApps || []).filter((app: string) => {
            const normalizedRequired = normalizeProviderId(app)
            const isConnected = connectedProviderIds.includes(normalizedRequired)
            logger.debug('[Prerequisite Check] App connection status', {
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

          // Build planning prompt
          const planningPrompt = buildPlanningPrompt({
            prompt,
            availableNodes,
            connectedIntegrations,
            contextNodes
          })

          // Call AI to plan workflow (using GPT-4o-mini for speed)
          const planResult = await callAI({
            prompt: planningPrompt,
            model: 'gpt-4o-mini',
            temperature: 0.3,
            responseFormat: 'json'
          })

          if (!planResult.success) {
            sendEvent('error', { message: 'Failed to plan workflow', error: planResult.error })
            controller.close()
            return
          }

          // Assign to outer scope plan variable (exclude the success property) and augment if needed
          const { success, ...planData } = planResult
          plan = augmentPlanWithFormatTransformers(planData)

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

          logger.debug('[STREAM] Plan nodes overview', {
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
            const nodeId = `node-${Date.now()}-${i}`
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

            logger.debug('[STREAM] Preparing node', {
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
            logger.debug('[STREAM] Starting configuration', {
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
            logger.debug('[STREAM] Calling generateNodeConfig', {
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
            logger.debug('[STREAM] generateNodeConfig completed', {
              title: plannedNode.title,
              durationMs: configDuration
            })

            const { finalConfig, fallbackFields, reasoning, usedFallback } = buildConfigWithFallback({
              nodeComponent,
              initialConfig: configResult.success ? (configResult.config || {}) : {},
              plannedNode,
              prompt
            })

            logger.debug('[STREAM] Config result summary', {
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
            logger.debug('[STREAM] Applying configuration fields', {
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
              logger.debug('[STREAM] No config for trigger; adding default message', {
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
              logger.debug('[STREAM] Setting field value', {
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
                viaFallback: fallbackFields.includes(fieldKey),
                status: 'configuring',
                badgeText: 'Configuring',
                badgeVariant: 'info'
              })

              await sleep(300) // Pause to show each field being set visually
            }

            node.data.aiStatus = 'configured'
            node.data.aiBadgeText = usedFallback ? 'Review Settings' : 'Ready'
            node.data.aiBadgeVariant = usedFallback ? 'warning' : 'success'
            if (!node.data.description) {
              node.data.description = reasoning || configResult.reasoning || node.data.description
            }
            node.data.aiFallbackFields = fallbackFields
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
              fallbackFields,
              autoMappingTelemetry
            })

            // Add wait after configuration for all nodes
            await sleep(500)

            // Step 3: Test node (skip for triggers)
            if (nodeComponent.isTrigger) {
              logger.debug('[STREAM] Skipping trigger test', {
                title: plannedNode.title
              })

              // Skip testing for trigger nodes - they activate on events
              node.data.aiStatus = 'ready'
              node.data.aiBadgeText = 'Successful'
              node.data.aiBadgeVariant = 'success'
              node.data.executionStatus = 'completed'

              sendEvent('node_complete', {
                message: `✅ ${plannedNode.title} configured (trigger will activate on events)`,
                nodeId: node.id,
                nodeName: plannedNode.title,
                nodeIndex: i,
                totalNodes: plan.nodes.length,
                skipTest: true,
                testResult: {
                  success: true,
                  message: 'Trigger configured - will activate when events occur'
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

              logger.debug('[STREAM] Trigger block complete; client still connected', {
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

// ============================================
// HELPER FUNCTIONS
// ============================================

function buildPrerequisitePrompt({ prompt, availableNodes, connectedIntegrations }: any) {
  const triggerNodes = availableNodes.filter((n: any) => n.isTrigger)
  const actionNodes = availableNodes.filter((n: any) => !n.isTrigger)

  return `Analyze this workflow request and determine what apps and setup are required.

User Request: "${prompt}"

Available Trigger Apps: ${triggerNodes.map((n: any) => n.providerId).filter((p: string, i: number, arr: string[]) => arr.indexOf(p) === i).join(', ')}
Available Action Apps: ${actionNodes.map((n: any) => n.providerId).filter((p: string, i: number, arr: string[]) => arr.indexOf(p) === i).join(', ')}

Currently Connected Apps: ${connectedIntegrations.length > 0 ? connectedIntegrations.join(', ') : 'None'}

Analyze the request and return JSON:
{
  "requiredApps": ["app1", "app2"], // Apps needed for this workflow
  "requiresSetup": true/false, // Does this need sheets, tables, or other configuration?
  "setupItems": [ // If requiresSetup is true
    {
      "app": "google_sheets",
      "item": "spreadsheet",
      "description": "A Google Sheet to store the data"
    }
  ],
  "setupMessage": "Optional friendly message asking if they have the required setup"
}

Be precise - only include apps that are actually needed.`
}

function buildPlanningPrompt({ prompt, availableNodes, connectedIntegrations, contextNodes }: any) {
  // Only send relevant nodes to reduce cost and improve speed
  const connectedProviders = new Set(connectedIntegrations)
  const coreProviders = new Set(['logic', 'ai', 'automation', 'manual', 'schedule', 'webhook'])

  const relevantNodes = availableNodes.filter((n: any) =>
    connectedProviders.has(n.providerId) || coreProviders.has(n.providerId)
  )

  // Simplified node list - just type and brief description
  const nodeList = relevantNodes
    .map((n: any) => `- ${n.type}: ${n.description || n.name}`)
    .join('\n')

  const connectedList = connectedIntegrations.length > 0
    ? connectedIntegrations.join(', ')
    : 'None'

  return `You are a workflow automation expert. Analyze this user request and create a detailed workflow plan.

User Request: "${prompt}"

Available Nodes:
${nodeList}

Connected Integrations: ${connectedList}

Rules:
1. ONLY use nodes from the available list above
2. Create a logical flow: trigger → actions → conditions → output
3. Choose nodes that match connected integrations when possible
4. Keep workflows simple and focused on the user's goal
5. Consider edge cases and error handling

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
}

async function callAI({ prompt, model, temperature, responseFormat }: any) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    // Create an AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          ...(responseFormat === 'json' && {
            response_format: { type: 'json_object' }
          })
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'AI API request failed')
      }

      const data = await response.json()
      const content = data.choices[0].message.content

      if (responseFormat === 'json') {
        return { success: true, ...JSON.parse(content) }
      }

      return { success: true, content }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('AI API request timed out after 30 seconds')
      }
      throw fetchError
    }
  } catch (error: any) {
    logger.error('AI call failed:', error)
    return { success: false, error: error.message }
  }
}

function selectModelForTask({ taskType, nodeType, complexity, userPreference }: any) {
  // User override
  if (userPreference !== 'auto') {
    return userPreference
  }

  // Only use GPT-4o for AI agents - everything else can use mini
  // GPT-4o is 15x more expensive than mini, only worth it for complex AI tasks
  if (nodeType.includes('ai_agent')) {
    return 'gpt-4o'
  }

  // Use GPT-4o-mini for everything else - it's fast, cheap, and handles most tasks well
  return 'gpt-4o-mini'
}

const HTML_CONTENT_SOURCE_TYPES = new Set([
  'gmail_trigger_new_email',
  'gmail_action_search_email',
  'gmail_action_read_email',
  'gmail_action_fetch_message',
  'microsoft-outlook_trigger_new_email',
  'microsoft-outlook_action_fetch_emails'
])

function augmentPlanWithFormatTransformers(plan: any) {
  if (!plan || !Array.isArray(plan.nodes)) {
    return plan
  }

  const augmentedNodes: any[] = []
  let insertedCount = 0

  for (const node of plan.nodes) {
    const previousNode = augmentedNodes[augmentedNodes.length - 1]
    if (shouldInsertFormatTransformer(previousNode, node)) {
      augmentedNodes.push(createFormatTransformerPlanNode(previousNode))
      insertedCount += 1
    }
    augmentedNodes.push(node)
  }

  if (insertedCount > 0) {
    logger.info('[STREAM] Auto-inserted Format Transformer nodes', { insertedCount })
  }

  return {
    ...plan,
    nodes: augmentedNodes
  }
}

function shouldInsertFormatTransformer(previousNode: any, currentNode: any): boolean {
  if (!currentNode || currentNode.type !== 'slack_action_send_message') {
    return false
  }
  if (!previousNode || previousNode.type === 'format_transformer') {
    return false
  }
  return HTML_CONTENT_SOURCE_TYPES.has(previousNode.type)
}

function createFormatTransformerPlanNode(prevNode: any) {
  const prevTitle = prevNode?.title || 'previous node'
  return {
    type: 'format_transformer',
    title: 'Format Transformer',
    description: `Convert ${prevTitle} output into Slack-friendly formatting.`,
    providerId: 'utility',
    note: 'Auto-added to convert HTML emails into Slack-friendly formatting. Delete it if you prefer the raw content.'
  }
}

function calculateComplexity(node: any): number {
  // Simple heuristic: more config fields = more complex
  let complexity = 1

  if (node.type.includes('ai')) complexity += 5
  if (node.type.includes('filter') || node.type.includes('router')) complexity += 3
  if (node.description && node.description.length > 100) complexity += 2

  return Math.min(complexity, 10)
}

/**
 * Generate a fix for node configuration errors
 */
async function generateNodeConfigFix({
  node,
  nodeComponent,
  previousConfig,
  error,
  errorDetails,
  previousNodes,
  prompt,
  model = 'gpt-4o-mini', // Use cheaper model for error recovery
  userId
}: {
  node: any
  nodeComponent: any
  previousConfig: Record<string, any>
  error: string
  errorDetails?: string
  previousNodes: any[]
  prompt: string
  model?: string
  userId: string
}): Promise<{ success: boolean; config?: Record<string, any>; reasoning?: string; error?: string }> {
  try {
    // Simplify the schema sent to AI - only essential fields
    const simplifiedSchema = nodeComponent.configSchema?.map((field: any) => ({
      name: field.name,
      type: field.type,
      required: field.required || false
    })) || []

    const systemPrompt = `You are fixing a configuration error in a workflow node.

Node: ${node.title} (${node.type})
Current Configuration: ${JSON.stringify(previousConfig, null, 2)}
Error: ${error}
Error Details: ${errorDetails || 'None provided'}

Available fields:
${JSON.stringify(simplifiedSchema, null, 2)}

Previous nodes in workflow that you can reference:
${previousNodes.map((n: any) => `- ${n.data.title} (outputs: ${JSON.stringify(n.data.outputSchema || [])})`).join('\n')}

Analyze the error and provide a CORRECTED configuration that fixes the issue. Common fixes:
- If a field is required but missing, provide a value
- If a field has an invalid format, correct it
- If referencing another node's output, ensure the syntax is correct ({{nodeName.fieldName}})
- If an API field failed, try a different value or leave empty for user selection
- If authentication failed, the integration might need reconnection (can't fix via config)

Return ONLY the fields that need to be changed to fix the error.`

    const userPrompt = `Fix this error: "${error}"

The user's original request was: "${prompt}"

Provide the minimal configuration changes needed to fix this error.`

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    })

    const completion = await openai.chat.completions.create({
      model: model.startsWith('gpt') ? model : 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      return { success: false, error: 'No response from AI' }
    }

    const parsed = JSON.parse(response)

    // Merge the fix with the existing config
    const fixedConfig = { ...previousConfig, ...parsed.config }

    return {
      success: true,
      config: fixedConfig,
      reasoning: parsed.reasoning || 'Applied automatic fix based on error analysis'
    }
  } catch (error: any) {
    logger.error('Failed to generate config fix:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate fix'
    }
  }
}

function extractNodeClarifications(clarifications: any, nodeComponent: any) {
  const fieldValues: Record<string, any> = {}
  const displayOverrides: Record<string, string> = {}

  const allowedFields = new Set(
    Array.isArray(nodeComponent?.configSchema)
      ? nodeComponent.configSchema
          .map((field: any) => field?.name)
          .filter((name: any): name is string => typeof name === 'string' && name.length > 0)
      : []
  )

  const addFieldValue = (rawField: string, value: any, display?: string) => {
    if (!rawField) return

    let fieldName = rawField
    if (fieldName === 'sender') fieldName = 'from'
    if (fieldName === 'channel_id' || fieldName === 'slack_channel') fieldName = 'channel'

    if (allowedFields.size > 0 && !allowedFields.has(fieldName)) {
      return
    }

    let processedValue = value

    if (Array.isArray(processedValue) && processedValue.length === 0) {
      return
    }
    if (typeof processedValue === 'string') {
      const trimmed = processedValue.trim()
      if (!trimmed) return
      processedValue = trimmed
    }

    fieldValues[fieldName] = processedValue
    if (display && !displayOverrides[fieldName]) {
      displayOverrides[fieldName] = display
    }
  }

  const providerId = nodeComponent?.providerId
  const nodeType = nodeComponent?.type

  if (Array.isArray(clarifications?.details)) {
    for (const detail of clarifications.details) {
      if (!detail) continue

      const detailNodeType = detail.nodeType
      const detailProvider = detail.providerId
      const questionId = detail.questionId

      const matchesNode =
        (detailNodeType && detailNodeType === nodeType) ||
        (detailProvider && providerId && detailProvider === providerId) ||
        (questionId && typeof questionId === 'string' && (
          (providerId && questionId.includes(providerId)) ||
          (nodeType && questionId.includes(nodeType))
        )) ||
        (detailNodeType && providerId && typeof detailNodeType === 'string' && detailNodeType.includes(providerId))

      if (!matchesNode) continue

      let fieldName = detail.configField

      if (!fieldName && typeof questionId === 'string') {
        const match = questionId.match(/_(channel|channel_id|from|subject|to|body|message|sender|keywords)(?:_filter)?$/)
        if (match) fieldName = match[1]
      }

      if (!fieldName && typeof detailNodeType === 'string') {
        const match = detailNodeType.match(/_(channel|channel_id|from|subject|to|body|message|sender|keywords)(?:_filter)?$/)
        if (match) fieldName = match[1]
      }

      if (!fieldName && typeof questionId === 'string') {
        fieldName = questionId
      }

      if (!fieldName) continue

      addFieldValue(fieldName, detail.value, detail.displayValue)
    }
  }

  const legacySource = clarifications?.answers && typeof clarifications.answers === 'object'
    ? clarifications.answers
    : clarifications

  if (legacySource && typeof legacySource === 'object') {
    for (const [key, value] of Object.entries(legacySource)) {
      if (['answers', 'details', 'displayMap', 'inferredData', 'reasoning', 'message_template', 'email_source'].includes(key)) {
        continue
      }

      const matchesProvider = providerId && key.includes(providerId)
      const matchesType = nodeType && key.includes(nodeType)
      const matchesEmail = key.includes('email') && providerId === 'gmail'

      if (!matchesProvider && !matchesType && !matchesEmail) {
        continue
      }

      addFieldValue(key, value, clarifications?.displayMap?.[key])
    }
  }

  if (clarifications?.displayMap && typeof clarifications.displayMap === 'object') {
    for (const [key, display] of Object.entries(clarifications.displayMap)) {
      if (typeof display !== 'string' || !display) continue
      const match = key.match(/_(channel|channel_id|from|subject|to|body|message|sender|keywords)(?:_filter)?$/)
      if (!match) continue
      let fieldName = match[1]
      if (fieldName === 'sender') fieldName = 'from'
      if (fieldName === 'channel_id' || fieldName === 'slack_channel') fieldName = 'channel'
      if (allowedFields.size === 0 || allowedFields.has(fieldName)) {
        if (!displayOverrides[fieldName]) {
          displayOverrides[fieldName] = display
        }
      }
    }
  }

  const messageTemplate =
    clarifications?.message_template ||
    clarifications?.inferredData?.message_template

  return { fieldValues, displayOverrides, messageTemplate }
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function unwrapAIConfig(rawConfig: any, nodeType: string, depth = 0): any {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return rawConfig
  }

  if (depth > 4) {
    return rawConfig
  }

  const keys = Object.keys(rawConfig)
  if (keys.length !== 1) {
    return rawConfig
  }

  const key = keys[0]
  const value = rawConfig[key]

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return rawConfig
  }

  const normalizedKey = key.toLowerCase()
  const unwrapKeys = [
    'config',
    'data',
    'fields',
    'payload',
    'settings',
    'parameters',
    'params',
    'request',
    'trigger',
    'action',
    nodeType.toLowerCase()
  ]

  if (!unwrapKeys.includes(normalizedKey)) {
    return rawConfig
  }

  return unwrapAIConfig(value, nodeType, depth + 1)
}

function sanitizeConfigForNode(config: Record<string, any> | undefined, nodeComponent: any) {
  if (!config || typeof config !== 'object') {
    return {}
  }

  const schemaFields = Array.isArray(nodeComponent?.configSchema)
    ? nodeComponent.configSchema
    : []

  const normalizationMap = new Map<string, string>()
  schemaFields.forEach((field: any) => {
    if (field?.name) {
      normalizationMap.set(normalizeFieldKey(field.name), field.name)
    }
  })

  if (normalizationMap.size === 0) {
    return { ...config }
  }

  const sanitized: Record<string, any> = {}
  for (const [rawKey, value] of Object.entries(config)) {
    if (value === undefined || value === null) {
      continue
    }

    const normalizedKey = normalizationMap.get(normalizeFieldKey(rawKey))
    if (normalizedKey) {
      sanitized[normalizedKey] = value
    } else if (normalizationMap.has(normalizeFieldKey(rawKey))) {
      const canonical = normalizationMap.get(normalizeFieldKey(rawKey))
      if (canonical) {
        sanitized[canonical] = value
      }
    }
  }

  return sanitized
}

async function generateNodeConfig({
  node,
  runtimeNode,
  nodeComponent,
  previousNodes,
  prompt,
  model,
  userId,
  clarifications = {},
  workflowData
}: any) {
  try {
    logger.debug('[generateNodeConfig] Starting configuration', {
      nodeTitle: node.title,
      nodeType: nodeComponent.type,
      providerId: nodeComponent.providerId
    })
    logger.trace('[generateNodeConfig] Clarifications payload', clarifications)

    const {
      fieldValues: clarificationFieldValues,
      displayOverrides,
      messageTemplate
    } = extractNodeClarifications(clarifications, nodeComponent)

    const clarificationEntries = Object.entries(clarificationFieldValues)
    if (nodeComponent.type === 'slack_action_send_message') {
      logger.debug('[generateNodeConfig] Slack clarifications captured', {
        clarificationFieldValues,
        clarificationEntries
      })
    }
    logger.trace('[generateNodeConfig] Clarification entries extracted', {
      clarificationEntries,
      messageTemplate
    })

    let clarificationContext = ''
    if (clarificationEntries.length > 0 || messageTemplate) {
      const clarificationLines: string[] = []

      // Add node-specific clarifications
      clarificationEntries.forEach(([fieldName, value]) => {
        if (fieldName === 'keywords') {
          clarificationLines.push(`- Search both subject AND body for keywords: ${value} (USER SPECIFIED - DO NOT CHANGE)`)
          return
        }

        // Handle array values (multi-select)
        if (Array.isArray(value)) {
          clarificationLines.push(`- Field "${fieldName}": Match ANY of these values: ${value.join(', ')} (USER SELECTED - DO NOT CHANGE)`)
        } else {
          clarificationLines.push(`- Field "${fieldName}": ${value} (USER SELECTED - DO NOT CHANGE)`)
        }
      })

      // Add message template if present (for messaging actions like Slack, Discord, etc.)
      if (messageTemplate && (nodeComponent.providerId === 'slack' || nodeComponent.providerId === 'discord' || nodeComponent.type.includes('message') || nodeComponent.type.includes('send'))) {
        clarificationLines.push(`- Field "message" or "text": Use this template:\n${messageTemplate}\n(AI PROVIDED TEMPLATE - USE AS-IS)`)
      }

      if (clarificationLines.length > 0) {
        clarificationContext = [
          '',
          'USER PROVIDED CLARIFICATIONS (CRITICAL - USE EXACT VALUES):',
          clarificationLines.join('\n'),
          '',
          'CRITICAL INSTRUCTIONS:',
          '1. Use the EXACT values above for the corresponding fields',
          '2. Do NOT use placeholders or example values',
          '3. Variable syntax like {{trigger.from}} should be preserved exactly as shown'
        ].join('\n')

        logger.debug('[generateNodeConfig] Built clarification context block')
      }
    }

    logger.debug('[generateNodeConfig] Clarification context ready', {
      hasContext: Boolean(clarificationContext)
    })

    // Check if we can skip AI call - if we have all required fields from clarifications
    const autoMappingEntries =
      runtimeNode && workflowData
        ? computeAutoMappingEntries({
            workflowData,
            currentNodeId: runtimeNode.id,
            configSchema: Array.isArray(nodeComponent?.configSchema) ? nodeComponent.configSchema : [],
            currentConfig: runtimeNode?.data?.config || {}
          })
        : []

    if (nodeComponent.type === 'slack_action_send_message') {
      logger.debug('[generateNodeConfig] Slack auto-mapping entries', {
        entries: autoMappingEntries
      })
    }

    const hasAllRequiredFields = (() => {
      // For triggers, ALWAYS skip AI call - only use clarifications
      // This prevents AI from hallucinating filter conditions
      if (nodeComponent.isTrigger) {
        logger.info('[generateNodeConfig] Skipping AI call for trigger', {
          triggerType: nodeComponent.type
        })
        return true
      }

      if (nodeComponent.type === 'slack_action_send_message') {
        // For Slack, we need channel and message
        const hasChannel = clarificationFieldValues.channel || clarificationFieldValues.channelId || clarificationFieldValues.slack_channel
        const hasMessage = messageTemplate || clarificationFieldValues.message
        const hasAutoMessage = autoMappingEntries.some(entry => entry.fieldKey === 'message')
        const hasAutoChannel = autoMappingEntries.some(entry => entry.fieldKey === 'channel')
        if ((hasChannel || hasAutoChannel) && (hasMessage || hasAutoMessage)) {
          logger.info('[generateNodeConfig] Skipping AI call for Slack action - clarifications/auto-mapping satisfied requirements', {
            hasChannel,
            hasAutoChannel,
            hasMessage,
            hasAutoMessage
          })
          return true
        }
      }
      return false
    })()

    let result: any

    if (hasAllRequiredFields) {
      // Skip AI call, we'll use force-apply logic below
      result = {
        success: true,
        config: {},
        reasoning: 'Configuration built from user clarifications'
      }
    } else {
      // Build context from previous nodes
      const context = previousNodes.map((n: any) => ({
        title: n.data.title,
        type: n.data.type,
        outputs: getNodeOutputs(n)
      }))
      const formattedContext = formatNodeContextForPrompt(context)

      // Simplify schema to reduce prompt size - only include essential field info
      const simplifiedSchema = nodeComponent.configSchema?.map((field: any) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required || false,
        ...(field.options ? { options: field.options } : {}),
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {})
      })) || []

      const autoMappingPromptSection = buildAutoMappingPrompt(autoMappingEntries)

      const configPrompt = `Generate configuration for a ${node.title} node in a workflow automation.

Node Type: ${node.type}
Node Description: ${node.description}
User's Original Goal: "${prompt}"

Previous Nodes in Workflow:
${formattedContext}

Configuration Fields: ${JSON.stringify(simplifiedSchema, null, 2)}
${autoMappingPromptSection ? `${autoMappingPromptSection}\n` : ''}${clarificationContext}

Generate a complete configuration that:
- Uses variables from previous nodes when appropriate (e.g., {{trigger.email}})
- Fills all required fields
- Uses sensible defaults for optional fields
- Matches the user's goal
${autoMappingEntries.length ? '- When a field is blank, prefer one of the AUTO-MAPPING SUGGESTIONS tokens shown above' : ''}${clarificationContext ? '\n- CRITICAL: Use the exact values from USER PROVIDED CLARIFICATIONS above - these are not suggestions, they are required values the user has specified' : ''}

Return JSON:
{
  "config": { /* configuration object matching schema */ },
  "reasoning": "Brief explanation of choices made"
}`

      logger.debug('[generateNodeConfig] Sending prompt to AI model', { model })

      result = await callAI({
        prompt: configPrompt,
        model,
        temperature: 0.3,
        responseFormat: 'json'
      })

      logger.trace('[generateNodeConfig] AI raw response', result)
    }

    // Initialize config if it doesn't exist
    if (!result.config) {
      logger.debug('[generateNodeConfig] No config from AI, initializing empty object')
      result.config = {}
    }

    // Unwrap nested config containers (trigger/config/action/etc.)
    const unwrappedConfig = unwrapAIConfig(result.config, nodeComponent.type)
    if (unwrappedConfig && typeof unwrappedConfig === 'object' && !Array.isArray(unwrappedConfig)) {
      result.config = { ...unwrappedConfig }
    }

    // CRITICAL: Force-apply clarification values to ensure they're used
    if (clarificationEntries.length > 0) {
      logger.debug('[generateNodeConfig] Force-applying clarifications to config', {
        clarificationCount: clarificationEntries.length
      })

      clarificationEntries.forEach(([fieldName, value]) => {
        if (fieldName && value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
          logger.trace('[generateNodeConfig] Force-setting field from clarification', {
            fieldName,
            value
          })
          result.config[fieldName] = value
        }
      })
    }

    // Provider-specific normalization
    if (nodeComponent.type === 'gmail_trigger_new_email') {
      const clarificationFrom = clarificationFieldValues.from
      if (clarificationFrom) {
        if (Array.isArray(clarificationFrom)) {
          result.config.from = clarificationFrom.join(', ')
        } else {
          result.config.from = clarificationFrom
        }
      }

      const providedLabelIds = result.config.labelIds || result.config.label_ids
      if (Array.isArray(providedLabelIds) && providedLabelIds.length > 0) {
        result.config.labelIds = providedLabelIds
        const labelDisplay = providedLabelIds
          .map((label: string) => {
            if (!label || typeof label !== 'string') return ''
            if (label.toUpperCase() === 'INBOX') return 'Inbox'
            if (label.toUpperCase() === 'SENT') return 'Sent'
            if (label.toUpperCase() === 'SPAM') return 'Spam'
            if (label.toUpperCase() === 'TRASH') return 'Trash'
            if (label.toUpperCase() === 'DRAFT') return 'Drafts'
            return label
          })
          .filter(Boolean)
          .join(', ')
        if (labelDisplay && !displayOverrides.labelIds) {
          displayOverrides.labelIds = labelDisplay
        }
      }
      if (!Array.isArray(result.config.labelIds) || result.config.labelIds.length === 0) {
        result.config.labelIds = ['INBOX']
        if (!displayOverrides.labelIds) {
          displayOverrides.labelIds = 'Inbox'
        }
      }

      delete result.config.label_ids
      delete result.config.user_id
      delete result.config.type
      delete result.config.include_spam_trash
      delete result.config.fetch_body
      delete result.config.fetch_attachments
      delete result.config.search_query
    }

    if (nodeComponent.type === 'slack_action_send_message') {
      const channelClarification =
        clarificationFieldValues.channel ??
        clarificationFieldValues.channelId ??
        clarificationFieldValues.slack_channel

      const aiChannelCandidate = typeof result.config.channel === 'string'
        ? result.config.channel
        : typeof result.config.channel_id === 'string'
          ? result.config.channel_id
          : undefined

      const resolvedChannel = (() => {
        if (channelClarification) {
          return Array.isArray(channelClarification) ? channelClarification[0] : channelClarification
        }
        if (aiChannelCandidate && aiChannelCandidate.trim().length > 0) {
          return aiChannelCandidate.trim()
        }
        return undefined
      })()

      const attachmentFallback = (() => {
        if (Array.isArray(result.config.attachments) && result.config.attachments.length > 0) {
          const attachment = result.config.attachments.find(att => att && typeof att === 'object')
          if (!attachment) return undefined
          if (typeof attachment.text === 'string' && attachment.text.trim().length > 0) {
            return attachment.text
          }
          if (typeof attachment.fallback === 'string' && attachment.fallback.trim().length > 0) {
            return attachment.fallback
          }
        }
        if (typeof result.config.attachments === 'string' && result.config.attachments.trim().length > 0) {
          return result.config.attachments.trim()
        }
        return undefined
      })()

      const aiMessageCandidate = (() => {
        if (typeof result.config.message === 'string' && result.config.message.trim().length > 0) {
          return result.config.message.trim()
        }
        if (typeof result.config.text === 'string' && result.config.text.trim().length > 0) {
          return result.config.text.trim()
        }
        if (typeof attachmentFallback === 'string') {
          return attachmentFallback
        }
        if (typeof messageTemplate === 'string' && messageTemplate.trim().length > 0) {
          return messageTemplate.trim()
        }
        return undefined
      })()

      const slackConfig: Record<string, any> = {}
      if (resolvedChannel && resolvedChannel !== 'Select a channel') {
        slackConfig.channel = resolvedChannel
        displayOverrides.channel = resolvedChannel
      }
      if (aiMessageCandidate) {
        slackConfig.message = aiMessageCandidate
      }

      if (!slackConfig.message || slackConfig.message.trim().length === 0) {
        const fallbackTemplate = (typeof messageTemplate === 'string' && messageTemplate.trim().length > 0)
          ? messageTemplate.trim()
          : `📧 New email from {{trigger.data.from}}\nSubject: {{trigger.data.subject}}\n\n{{trigger.data.body}}`
        slackConfig.message = fallbackTemplate
      }

      result.config = slackConfig

      if (aiMessageCandidate) {
        const condensedTemplate = aiMessageCandidate.replace(/\s+/g, ' ').trim()
        if (!displayOverrides.message) {
          displayOverrides.message = condensedTemplate.length > 80
            ? `${condensedTemplate.slice(0, 77)}...`
            : condensedTemplate || 'Auto-generated message template'
        }
      } else if (result.config.message) {
        const condensedTemplate = String(result.config.message).replace(/\s+/g, ' ').trim()
        displayOverrides.message = condensedTemplate.length > 80
          ? `${condensedTemplate.slice(0, 77)}...`
          : condensedTemplate || 'Auto-generated message template'
      }
    }

    // Force-apply message template for other messaging providers if needed
    if (messageTemplate && nodeComponent.providerId && ['discord'].includes(nodeComponent.providerId)) {
      if (!result.config.message || result.config.message === '' || result.config.message === 'Empty') {
        logger.debug('[generateNodeConfig] Force-setting message template for messaging provider')
        result.config.message = messageTemplate
      }
      if (!displayOverrides.message) {
        const condensedTemplate = String(result.config.message).replace(/\s+/g, ' ').trim()
        displayOverrides.message = condensedTemplate.length > 80
          ? `${condensedTemplate.slice(0, 77)}...`
          : condensedTemplate || 'Auto-generated message template'
      }
    }

    // Normalize to schema field names and strip unknown keys
    const normalizedConfig = sanitizeConfigForNode(result.config, nodeComponent)
    result.config = { ...normalizedConfig }

    // Re-apply clarification overrides after normalization to ensure they persist
    if (clarificationEntries.length > 0) {
      clarificationEntries.forEach(([fieldName, value]) => {
        if (fieldName && value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
          result.config[fieldName] = value
        }
      })
    }

    // Sanitize config so we only keep known schema fields
    result.config = sanitizeConfigForNode(result.config, nodeComponent)

    logger.trace('[generateNodeConfig] Final configuration output', result.config)

    return {
      ...result,
      displayOverrides,
      autoMappingEntries
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function testNode({ node, previousNodes, userId, supabase, userPrompt, workflowContext }: any) {
  try {
    const config = node?.data?.config || {}
    const isTrigger = Boolean(node?.data?.isTrigger)

    // Import the mock data generator
    const { generateContextualMockData } = await import('@/lib/workflows/testing/generateContextualMockData')

    // Get previous node's output if available
    const previousNodeOutput = previousNodes?.length > 0
      ? previousNodes[previousNodes.length - 1].testData
      : null

    // Generate contextual mock data
    const mockData = await generateContextualMockData({
      nodeType: node.data.type,
      nodeTitle: node.data.title,
      providerId: node.data.providerId,
      userPrompt,
      previousNodeOutput,
      workflowContext,
      nodeConfig: config
    })

    const preview = buildTestPreview({
      node,
      config,
      previousNodes,
      mockData
    })

    const summary = buildTestSummary({
      node,
      preview,
      config,
      isTrigger
    })

    // Store the mock data on the node for the next node to use
    node.testData = mockData

    return {
      success: true,
      preview,
      summary,
      canContinue: true
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      summary: 'Testing failed unexpectedly. Adjust the configuration or try again.',
      canContinue: true // Non-critical failure
    }
  }
}

type NodeOutputFieldSummary = {
  name: string
  label: string
  type: string
  token: string
}

type NodeOutputSummary = {
  alias: string
  fields: NodeOutputFieldSummary[]
  tokens: string[]
}

function getNodeOutputs(node: any): NodeOutputSummary {
  const alias = sanitizeAlias(
    (node?.data?.isTrigger && 'trigger') ||
    node?.data?.label ||
    node?.data?.title ||
    node?.data?.type ||
    node?.id
  )

  const schema = extractNodeOutputs(node)
  if (!Array.isArray(schema) || schema.length === 0) {
    const tokens = [`{{${alias}.output}}`]
    if (node?.data?.isTrigger) {
      tokens.push('{{trigger.data}}', '{{trigger.timestamp}}')
    }
    return {
      alias,
      fields: [],
      tokens
    }
  }

  const fields: NodeOutputFieldSummary[] = schema
    .filter((field: any) => field?.name)
    .map((field: any) => ({
      name: field.name,
      label: field.label || field.name,
      type: field.type || 'string',
      token: `{{${alias}.${field.name}}}`
    }))

  const tokens = fields.map(field => field.token)
  if (node?.data?.isTrigger) {
    tokens.push('{{trigger.data}}', '{{trigger.timestamp}}')
  }

  return {
    alias,
    fields,
    tokens
  }
}

function formatNodeContextForPrompt(
  contextEntries: { title: string; type: string; outputs: NodeOutputSummary }[]
): string {
  if (!contextEntries || contextEntries.length === 0) {
    return '- None yet (this is the first node in the workflow)'
  }

  return contextEntries
    .map((entry) => {
      const lines = [`- ${entry.title} (${entry.type}) alias: ${entry.outputs.alias}`]
      if (entry.outputs.fields.length > 0) {
        lines.push('  Outputs:')
        entry.outputs.fields.forEach((field) => {
          const labelPart = field.label && field.label !== field.name ? `, label: ${field.label}` : ''
          lines.push(`    - ${field.name} [type: ${field.type}${labelPart}] -> ${field.token}`)
        })
      } else {
        lines.push(`  Outputs: ${entry.outputs.tokens.join(', ')}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

function buildAutoMappingPrompt(entries: AutoMappingEntry[]): string {
  if (!entries || entries.length === 0) {
    return ''
  }

  const lines = entries.map(
    (entry) => `- ${entry.fieldLabel} (${entry.fieldKey}): ${entry.value}`
  )

  return ['AUTO-MAPPING SUGGESTIONS (prefer these upstream tokens for blank fields):', ...lines].join('\n')
}

type AutoMappingTelemetry = {
  suggested: number
  applied: number
  ignored: number
  fields: {
    key: string
    label: string
    suggested: string
    actual: any
    applied: boolean
  }[]
} | null

function buildAutoMappingTelemetry({
  entries,
  finalConfig
}: {
  entries?: AutoMappingEntry[]
  finalConfig: Record<string, any> | undefined
}): AutoMappingTelemetry {
  if (!entries || entries.length === 0) {
    return null
  }

  const config = finalConfig || {}
  let appliedCount = 0
  const fields = entries.map((entry) => {
    const actualValue = config[entry.fieldKey]
    const normalizedActual = actualValue === undefined || actualValue === null
      ? ''
      : String(actualValue).trim()
    const isApplied = normalizedActual === entry.value
    if (isApplied) {
      appliedCount += 1
    }
    return {
      key: entry.fieldKey,
      label: entry.fieldLabel,
      suggested: entry.value,
      actual: actualValue ?? null,
      applied: isApplied
    }
  })

  return {
    suggested: entries.length,
    applied: appliedCount,
    ignored: entries.length - appliedCount,
    fields
  }
}

function filterAutoMappingEntriesForNode(nodeComponent: any, entries?: AutoMappingEntry[]): AutoMappingEntry[] | undefined {
  if (!entries || entries.length === 0) {
    return entries
  }

  if (nodeComponent?.type !== 'slack_action_send_message') {
    return entries
  }

  const allowed = new Set(['channel', 'message', 'attachments'])
  return entries.filter(entry => allowed.has(entry.fieldKey))
}

function logManualVerificationChecklist({
  createdNodes,
  workflowPrompt,
  clarificationsSummary,
  connectedIntegrations
}: {
  createdNodes: any[]
  workflowPrompt: string
  clarificationsSummary: number
  connectedIntegrations: string[]
}) {
  const nodes = createdNodes.map((node) => ({
    id: node.id,
    title: node.data?.title,
    status: node.data?.aiStatus,
    testStatus: node.data?.executionStatus || (node.data?.isTrigger ? 'skipped' : 'pending'),
    autoMapping: node.data?.autoMappingTelemetry || null
  }))

  const checklist = [
    'Confirm each node configuration shows the same suggested tokens as listed above (autoMapping.applied).',
    'Verify the SSE `node_configured` events contained `autoMappingTelemetry` and that applied > 0 when suggestions existed.',
    'Open the builder UI and ensure Data Inspector / auto-fill show identical tokens to the server summary.',
    'If a node was tested, validate the test preview matches expectations; for triggers ensure skip messaging appears.',
    'Report any nodes with `status !== "ready"` or tests that did not run.'
  ]

  logger.info('[MANUAL QA CHECKLIST] React agent verification summary', {
    workflowPrompt,
    connectedIntegrations,
    clarificationsFields: clarificationsSummary,
    nodeCount: nodes.length,
    nodes,
    checklist
  })
}

function calculateNodePosition(index: number, existingNodes: any[], viewport: any = null) {
  const NODE_WIDTH = 450 // Matches CustomNode width
  const BASE_PADDING = 80
  const HORIZONTAL_GAP = 130

  const zoom = viewport?.defaultZoom || 1
  const chatPanelWidth = viewport?.chatPanelWidth || 0
  const adjustedPanelOffset = chatPanelWidth ? chatPanelWidth / zoom : 0
  const startX = BASE_PADDING + adjustedPanelOffset

  const x = startX + index * (NODE_WIDTH + HORIZONTAL_GAP)
  const y = BASE_PADDING

  logger.trace('[POSITION] Sequential placement applied', {
    index,
    existingCount: existingNodes?.length || 0,
    viewport: viewport
      ? { width: viewport.width, height: viewport.height, zoom, chatPanelWidth }
      : null,
    position: { x, y }
  })

  return { x, y }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildTestPreview({ node, config, previousNodes, mockData }: any) {
  const timestamp = new Date().toISOString()
  const normalizedConfig = Object.entries(config || {}).reduce((acc: Record<string, any>, [key, value]) => {
    acc[key] = value
    return acc
  }, {})

  if (node?.data?.isTrigger) {
    // Use the contextual mock data for triggers
    return {
      eventSource: node.data.title,
      sampleTimestamp: timestamp,
      samplePayloadSummary: `Mock event generated for ${node.data.title}`,
      capturedFields: mockData ? Object.keys(mockData).slice(0, 5) : ['id', 'type', 'timestamp'],
      sampleData: mockData || {
        id: `${node.id}-sample`,
        type: 'event',
        preview: 'This is representative data provided for review.',
        created_at: timestamp
      }
    }
  }

  const upstream = previousNodes && previousNodes.length > 0 ? previousNodes[previousNodes.length - 1] : null

  // For action nodes, show the mock data as output
  if (mockData) {
    // Limit preview to key fields to avoid overwhelming the UI
    const previewData = typeof mockData === 'object' && !Array.isArray(mockData)
      ? Object.fromEntries(Object.entries(mockData).slice(0, 5))
      : mockData

    return {
      runTimestamp: timestamp,
      upstreamSource: upstream ? upstream.data?.title : null,
      outputPreview: `Processed data from ${node.data?.title}`,
      configuredFields: normalizedConfig,
      testOutput: previewData,
      result: {
        status: 'success',
        notes: 'Test executed with contextual mock data'
      }
    }
  }

  return {
    runTimestamp: timestamp,
    upstreamSource: upstream ? upstream.data?.title : null,
    outputPreview: `Example output produced for ${node.data?.title}`,
    configuredFields: normalizedConfig,
    result: {
      status: 'success',
      notes: 'Mock execution completed with the provided configuration.'
    }
  }
}

function buildTestSummary({ node, preview, config, isTrigger }: any) {
  if (isTrigger) {
    return `Mock data generated to illustrate how ${node.data?.title || 'this trigger'} will fire. Review the sample payload to validate the fields the workflow will receive.`
  }

  const configuredCount = Object.keys(config || {}).length
  const fieldDescriptor = configuredCount > 0 ? `${configuredCount} configured field${configuredCount === 1 ? '' : 's'}` : 'the default settings'
  return `The node successfully executed using ${fieldDescriptor} and produced a representative preview. Adjust anything above if you’d like the automation to behave differently.`
}

function buildConfigWithFallback({ nodeComponent, initialConfig, plannedNode, prompt }: any) {
  const schemaFields = nodeComponent?.configSchema || []
  const finalConfig: Record<string, any> = { ...(initialConfig || {}) }
  const fallbackFields: string[] = []

  for (const field of schemaFields) {
    const currentValue = finalConfig[field.name]
    const hasValue = currentValue !== undefined && currentValue !== null && currentValue !== ''

    if (hasValue || !field.required) {
      continue
    }

    const fallbackValue = deriveFallbackValue(field, { plannedNode, prompt })
    if (fallbackValue !== undefined) {
      finalConfig[field.name] = fallbackValue
      fallbackFields.push(field.name)
    }
  }

  const usedFallback = fallbackFields.length > 0
  const reasoning = usedFallback
    ? `Auto-filled ${fallbackFields.length} field${fallbackFields.length === 1 ? '' : 's'} using safe defaults. Review these values to tailor the automation.`
    : ''

  return {
    finalConfig,
    fallbackFields,
    reasoning,
    usedFallback
  }
}

function deriveFallbackValue(field: any, _context: any) {
  if (!field) return undefined

  if (field.dynamic) {
    return undefined
  }

  if (field.defaultValue !== undefined) {
    return field.multiple ? ([] as any[]).concat(field.defaultValue) : field.defaultValue
  }

  const options = Array.isArray(field.options)
    ? field.options
    : Array.isArray(field.defaultOptions)
      ? field.defaultOptions
      : []

  if (field.multiple || field.type === 'multi-select') {
    if (options.length > 0) {
      const optionValue = typeof options[0] === 'string' ? options[0] : options[0]?.value
      return optionValue ? [optionValue] : []
    }
    return []
  }

  if ((field.type === 'select' || field.type === 'combobox') && options.length > 0) {
    // For optional select fields, don't auto-select the first option
    // Return undefined to leave it unselected for user choice
    if (!field.required) {
      return undefined
    }
    return typeof options[0] === 'string' ? options[0] : options[0]?.value
  }

  if (field.type === 'boolean') {
    return false
  }

  if (field.type === 'number') {
    return 0
  }

  if (field.type === 'email' || field.type === 'email-autocomplete') {
    // For optional email fields (like filter fields), don't use a placeholder
    // Return undefined so they stay empty, indicating "anyone" or "no filter"
    if (!field.required) {
      return undefined
    }
    return 'inbox@placeholder.com'
  }

  if (field.type === 'date') {
    return new Date().toISOString().split('T')[0]
  }

  if (field.type === 'datetime' || field.type === 'time') {
    return new Date().toISOString()
  }

  if (field.type === 'array' || field.type === 'json') {
    return []
  }

  if (field.type === 'text' || field.type === 'textarea' || typeof field.type === 'string') {
    // For optional text fields, don't use placeholders or auto-generated values
    if (!field.required) {
      return undefined
    }
    if (field.placeholder) {
      return field.placeholder
    }
    const label = field.label || field.name
    return `Auto-generated ${label.toLowerCase()}`
  }

  return undefined
}

/**
 * Format field names to be human-readable
 * Examples:
 * - "label_ids" → "Label IDs"
 * - "search_query" → "Search Query"
 * - "to_email" → "To Email"
 * - "from" → "From"
 */
function formatFieldName(fieldKey: string): string {
  // Handle common abbreviations that should stay uppercase
  const upperCaseWords = ['id', 'ids', 'url', 'api', 'html', 'css', 'js', 'sql', 'crm']

  // Split by underscore or camelCase
  const words = fieldKey
    .replace(/([A-Z])/g, ' $1') // Split camelCase
    .split(/[_\s]+/) // Split by underscore or space
    .filter(word => word.length > 0)

  // Capitalize each word appropriately
  const formatted = words.map(word => {
    const lower = word.toLowerCase()
    // Check if it's an abbreviation that should be uppercase
    if (upperCaseWords.includes(lower)) {
      return lower.toUpperCase()
    }
    // Otherwise, capitalize first letter
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }).join(' ')

  return formatted
}

/**
 * Format field values for display
 * - Truncates long strings
 * - Handles objects/arrays nicely
 * - Makes dates readable
 */
function formatFieldValue(value: any): string {
  if (value === null || value === undefined) {
    return 'None'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 60) {
      return `"${value.substring(0, 60)}..."`
    }
    return `"${value}"`
  }

  if (typeof value === 'number') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.length === 1) return `[${formatFieldValue(value[0])}]`
    return `[${value.length} items]`
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    if (keys.length <= 2) {
      return `{${keys.join(', ')}}`
    }
    return `{${keys.length} fields}`
  }

  return JSON.stringify(value).substring(0, 60)
}
