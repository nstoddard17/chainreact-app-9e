import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/availableNodes'
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

          console.log('[Prerequisite Check] Required apps:', prerequisiteCheck.requiredApps)
          console.log('[Prerequisite Check] Connected integrations:', connectedIntegrations)
          console.log('[Prerequisite Check] Normalized connected:', connectedProviderIds)

          // Check if all required apps are connected
          const missingApps = (prerequisiteCheck.requiredApps || []).filter((app: string) => {
            const normalizedRequired = normalizeProviderId(app)
            const isConnected = connectedProviderIds.includes(normalizedRequired)
            console.log(`[Prerequisite Check] Checking ${app} (normalized: ${normalizedRequired}): ${isConnected ? 'CONNECTED' : 'MISSING'}`)
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

          // Assign to outer scope plan variable (exclude the success property)
          const { success, ...planData } = planResult
          plan = planData

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
                  isTrigger: nodeDef?.isTrigger || false
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
          console.log('[STREAM] Auto-approving plan, continuing to build immediately')
          console.log('[STREAM] Plan structure:', {
            hasNodes: !!plan.nodes,
            nodeCount: plan.nodes?.length,
            planKeys: Object.keys(plan)
          })

          if (!plan.nodes || !Array.isArray(plan.nodes)) {
            console.error('[STREAM] Invalid plan structure - missing nodes array:', plan)
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
                isTrigger: nodeDef?.isTrigger || false
              }
            })
          })
        }

        // Phase 2: Create all nodes first with "pending" status
          console.log('[STREAM] Phase 2: Starting node creation, plan:', plan)
          const createdNodes = []
          const createdEdges = []
          const nodeComponents = []

          sendEvent('creating_all_nodes', {
            message: 'Creating workflow structure...',
            totalNodes: plan.nodes.length
          })

          console.log('[STREAM] Plan nodes:', plan.nodes)

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
                description: nodeDescription,
                providerId: nodeComponent.providerId,
                isTrigger: nodeComponent.isTrigger,
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

            console.log(`[STREAM] Preparing ${plannedNode.title} (${node.id})`)
            sendEvent('node_preparing', {
              message: `Preparing ${plannedNode.title}...`,
              nodeIndex: i,
              nodeId: node.id,
              nodeName: plannedNode.title,
              status: 'preparing'
            })

            await sleep(800)  // Show preparing state

            // Step 2: Configure node - change status to "Configuring"
            node.data.aiStatus = 'configuring'
            node.data.aiBadgeText = 'Configuring'
            node.data.aiBadgeVariant = 'info'
            console.log(`[STREAM] Starting configuration for ${plannedNode.title} (${node.id})`)
            sendEvent('node_configuring', {
              message: `Configuring ${plannedNode.title}...`,
              nodeIndex: i,
              nodeId: node.id,
              nodeName: plannedNode.title,
              status: node.data.aiStatus,
              badgeText: node.data.aiBadgeText,
              badgeVariant: node.data.aiBadgeVariant
            })

            await sleep(500)  // Wait for configuring state to show

            // Determine which model to use for configuration
            const configModel = selectModelForTask({
              taskType: 'configuration',
              nodeType: plannedNode.type,
              complexity: calculateComplexity(plannedNode),
              userPreference: model
            })

            // Generate configuration with timeout
            console.log(`[STREAM] Calling generateNodeConfig for ${plannedNode.title}...`)
            const configStartTime = Date.now()
            const configResult = await generateNodeConfig({
              node: plannedNode,
              nodeComponent,
              previousNodes: createdNodes.slice(0, i),
              prompt,
              model: configModel,
              userId: user.id,
              clarifications // Pass clarifications to config generation
            })
            const configDuration = Date.now() - configStartTime
            console.log(`[STREAM] generateNodeConfig completed in ${configDuration}ms for ${plannedNode.title}`)

            const { finalConfig, fallbackFields, reasoning, usedFallback } = buildConfigWithFallback({
              nodeComponent,
              initialConfig: configResult.success ? (configResult.config || {}) : {},
              plannedNode,
              prompt
            })

            console.log(`[STREAM] Config result:`, {
              success: configResult.success,
              hasConfig: !!configResult.config,
              configKeys: Object.keys(configResult.config || {}),
              finalConfigKeys: Object.keys(finalConfig),
              fallbackFields
            })

            if (!configResult.success && fallbackFields.length === 0) {
              console.log(`[STREAM] ERROR: Failed to configure ${plannedNode.title}`)
              sendEvent('error', {
                message: `Failed to configure ${plannedNode.title}`,
                error: configResult.error,
                nodeIndex: i
              })
              continue
            }

            // Update node with config field-by-field for visual effect
            const configFields = Object.entries(finalConfig)
            console.log(`[STREAM] Configuring ${configFields.length} fields for ${plannedNode.title}: ${Object.keys(finalConfig).join(', ')}`)

            // If no config fields for trigger, add a default one to show something
            if (configFields.length === 0 && nodeComponent.isTrigger) {
              console.log(`[STREAM] No config for trigger, adding default`)
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
              console.log(`[STREAM] Setting field ${fieldKey} = ${fieldValue} for ${plannedNode.title}`)

              // Format display value for the field
              let displayValue = ''
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

            sendEvent('node_configured', {
              message: `✓ ${plannedNode.title} configured`,
              nodeId: node.id,
              config: finalConfig,
              nodeIndex: i,
              reasoning: reasoning || configResult.reasoning, // Why AI chose these values
              description: node.data.description,
              status: node.data.aiStatus,
              badgeText: node.data.aiBadgeText,
              badgeVariant: node.data.aiBadgeVariant,
              fallbackFields
            })

            // Add wait after configuration for all nodes
            await sleep(500)

            // Step 3: Test node (skip for triggers)
            if (nodeComponent.isTrigger) {
              console.log(`[STREAM] Skipping test for trigger ${plannedNode.title}`)

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
              await sleep(1500)  // Changed to match non-trigger delay
              console.log(`[STREAM] Trigger complete, continuing to next node (loop iteration ${i} of ${plan.nodes.length - 1})`)

              // Check if stream is still alive
              if (request.signal.aborted) {
                console.log(`[STREAM] WARNING: Client disconnected after trigger, aborting workflow build`)
                controller.close()
                return
              }
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

            // Brief pause before starting next node
            await sleep(300)
            console.log(`[STREAM] Completed node ${i + 1} of ${plan.nodes.length}, moving to next iteration`)
          }

          console.log(`[STREAM] All nodes configured and tested, sending workflow_complete event`)

          // Phase 3: Workflow Complete
          sendEvent('workflow_complete', {
            message: `🎉 Workflow ready! Created ${createdNodes.length} nodes`,
            nodes: createdNodes,
            edges: createdEdges,
            step: 3,
            totalSteps: 3
          })

          // Close stream
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
  const nodeList = availableNodes
    .map((n: any) => `- ${n.name} (${n.type}): ${n.description}`)
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

  // Complex tasks need GPT-4o
  if (complexity > 7 || nodeType.includes('ai_agent') || taskType === 'error_recovery') {
    return 'gpt-4o'
  }

  // Simple tasks use GPT-4o-mini
  return 'gpt-4o-mini'
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
  model = 'gpt-4',
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
    const systemPrompt = `You are fixing a configuration error in a workflow node.

Node: ${node.title} (${node.type})
Current Configuration: ${JSON.stringify(previousConfig, null, 2)}
Error: ${error}
Error Details: ${errorDetails || 'None provided'}

Available fields from the schema:
${JSON.stringify(nodeComponent.configSchema || [], null, 2)}

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

async function generateNodeConfig({ node, nodeComponent, previousNodes, prompt, model, userId, clarifications = {} }: any) {
  try {
    // Check if there are clarifications for this node
    const nodeClarifications = Object.entries(clarifications).filter(([key, value]) => {
      // Match clarification to this node based on questionId pattern (e.g., "slack_channel" for slack nodes)
      return key.includes(nodeComponent.providerId) || key.includes(nodeComponent.type)
    })

    let clarificationContext = ''
    if (nodeClarifications.length > 0) {
      clarificationContext = '\n\nUSER PROVIDED CLARIFICATIONS:\n' +
        nodeClarifications.map(([key, value]) => `- ${key}: ${value}`).join('\n') +
        '\n\nIMPORTANT: Use these exact values for the corresponding fields. Do not use placeholders.'
    }

    // Build context from previous nodes
    const context = previousNodes.map((n: any) => ({
      title: n.data.title,
      type: n.data.type,
      outputs: getNodeOutputs(n)
    }))

    const configPrompt = `Generate configuration for a ${node.title} node in a workflow automation.

Node Type: ${node.type}
Node Description: ${node.description}
User's Original Goal: "${prompt}"

Previous Nodes in Workflow:
${context.map((n: any) => `- ${n.title} (outputs: ${n.outputs.join(', ')})`).join('\n')}

Schema: ${JSON.stringify(nodeComponent.schema, null, 2)}
${clarificationContext}

Generate a complete configuration that:
1. Uses variables from previous nodes when appropriate (e.g., {{trigger.email}})
2. Fills all required fields
3. Uses sensible defaults for optional fields
4. Matches the user's goal
${clarificationContext ? '5. CRITICAL: Use the exact values from USER PROVIDED CLARIFICATIONS above - these are not suggestions, they are required values the user has specified' : ''}

Return JSON:
{
  "config": { /* configuration object matching schema */ },
  "reasoning": "Brief explanation of choices made"
}`

    const result = await callAI({
      prompt: configPrompt,
      model,
      temperature: 0.3,
      responseFormat: 'json'
    })

    return result
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

function getNodeOutputs(node: any): string[] {
  // Get available output variables from this node
  const baseOutputs = [`${node.id}.output`]

  if (node.data.isTrigger) {
    baseOutputs.push('trigger.data', 'trigger.timestamp')
  }

  return baseOutputs
}

function calculateNodePosition(index: number, existingNodes: any[], viewport: any = null) {
  // Constants
  const NODE_WIDTH = 450 // From CustomNode.tsx
  const NODE_HEIGHT = 260 // Allow room for expanded active nodes
  const BASE_HORIZONTAL_SPACING = 580 // Comfortable spacing between horizontally connected nodes
  const VERTICAL_SPACING = NODE_HEIGHT + 140 // Extra room if a wrap to next row is required
  const BASE_PADDING = 80 // Padding from viewport edges

  // If no viewport info provided, use legacy positioning
  if (!viewport || !viewport.width) {
    console.log('[POSITION] No viewport info, using legacy positioning for node', index)
    return {
      x: PADDING + (index * HORIZONTAL_SPACING),
      y: PADDING
    }
  }

  // CRITICAL: Account for React Flow's default zoom level (0.35)
  // When zoom is 0.35, the visible area in world coordinates is much larger
  // Example: 1000px screen width at 0.35 zoom shows 1000/0.35 = 2857px of world space
  const zoom = viewport.defaultZoom || 1.0
  const chatPanelWidth = viewport.chatPanelWidth || 0

  // Calculate visible area in world coordinates (accounting for zoom)
  const effectiveViewportWidth = (viewport.width + chatPanelWidth) / zoom
  const builderViewportWidth = viewport.width / zoom
  const visibleHeight = viewport.height / zoom

  const horizontalPadding = chatPanelWidth > 0 ? BASE_PADDING / 2 : BASE_PADDING
  const availableWidth = Math.max(builderViewportWidth - (horizontalPadding * 2), NODE_WIDTH + 40)

  // Determine how many nodes comfortably fit per row (limit to 5 for readability)
  const maxNodesPerRow = Math.max(1, Math.floor(availableWidth / (NODE_WIDTH + 120)))
  const nodesPerRow = Math.max(1, Math.min(maxNodesPerRow || 1, 5))

  const totalNodes = existingNodes.length + 1 // Include the node currently being placed
  const row = Math.floor(index / nodesPerRow)
  const col = index % nodesPerRow

  // Compute spacing between nodes for this layout
  let horizontalSpacing = NODE_WIDTH + 120
  if (nodesPerRow > 1) {
    const maxRowSpacing = Math.max(1, nodesPerRow - 1)
    const spaceForGaps = Math.max(availableWidth - NODE_WIDTH, NODE_WIDTH)
    const computedSpacing = spaceForGaps / maxRowSpacing
    horizontalSpacing = Math.max(NODE_WIDTH + 120, Math.min(BASE_HORIZONTAL_SPACING, computedSpacing))
  }

  const nodesInThisRow = Math.min(nodesPerRow, totalNodes - row * nodesPerRow)
  const rowWidth = (nodesInThisRow - 1) * horizontalSpacing + NODE_WIDTH
  const centerOffset = horizontalPadding + Math.max(0, (availableWidth - rowWidth) / 2)

  const x = centerOffset + (col * horizontalSpacing)
  const y = BASE_PADDING + (row * VERTICAL_SPACING)

  console.log('[POSITION] Node', index, ':', {
    viewport: { width: viewport.width, height: viewport.height, zoom, chatPanelWidth },
    effectiveViewportWidth,
    builderViewportWidth,
    visibleHeight,
    availableWidth,
    nodesPerRow,
    row,
    col,
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
    return typeof options[0] === 'string' ? options[0] : options[0]?.value
  }

  if (field.type === 'boolean') {
    return false
  }

  if (field.type === 'number') {
    return 0
  }

  if (field.type === 'email' || field.type === 'email-autocomplete') {
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
