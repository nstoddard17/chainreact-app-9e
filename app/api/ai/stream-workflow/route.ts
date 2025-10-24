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
      viewport = null // Viewport dimensions to position nodes correctly
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

          // Get available nodes
          const availableNodes = ALL_NODE_COMPONENTS.map(node => ({
            type: node.type,
            name: node.name,
            providerId: node.providerId,
            isTrigger: node.isTrigger,
            description: node.description || '',
            category: node.category || 'misc',
            schema: node.schema // Include schema for smart config
          }))

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
          const plan = await callAI({
            prompt: planningPrompt,
            model: 'gpt-4o-mini',
            temperature: 0.3,
            responseFormat: 'json'
          })

          if (!plan.success) {
            sendEvent('error', { message: 'Failed to plan workflow', error: plan.error })
            controller.close()
            return
          }

            // Phase 4: Show Plan & Wait for Approval
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

          // Phase 2: Build nodes one by one
          const createdNodes = []
          const createdEdges = []

          for (let i = 0; i < plan.nodes.length; i++) {
            const plannedNode = plan.nodes[i]

            // Check if client disconnected
            if (request.signal.aborted) {
              logger.info('Client disconnected, stopping workflow build')
              controller.close()
              return
            }

            // Step 1: Create node - Skip first event, we'll send it after creating the node object

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
                aiStatus: 'preparing',
                aiBadgeText: 'Preparing',
                aiBadgeVariant: 'info',
                autoExpand: true
              }
            }

            createdNodes.push(node)

            // Send node_creating event with proper status
            sendEvent('node_creating', {
              message: `Preparing ${plannedNode.title}...`,
              nodeIndex: i,
              nodeId: nodeId,
              nodeName: plannedNode.title,
              totalNodes: plan.nodes.length,
              status: 'preparing'
            })

            // Wait to show the preparing state visually
            await sleep(800)

            sendEvent('node_created', {
              message: `✓ ${plannedNode.title} created`,
              node,
              nodeIndex: i
            })

            // Step 2: Configure node - change status to "Configuring"
            node.data.aiStatus = 'configuring'
            node.data.aiBadgeText = 'Configuring'
            node.data.aiBadgeVariant = 'info'
            sendEvent('node_configuring', {
              message: `Configuring ${plannedNode.title}...`,
              nodeIndex: i,
              nodeId: nodeId,
              nodeName: plannedNode.title,
              status: node.data.aiStatus,
              badgeText: node.data.aiBadgeText,
              badgeVariant: node.data.aiBadgeVariant
            })

            // Determine which model to use for configuration
            const configModel = selectModelForTask({
              taskType: 'configuration',
              nodeType: plannedNode.type,
              complexity: calculateComplexity(plannedNode),
              userPreference: model
            })

            // Generate configuration
            const configResult = await generateNodeConfig({
              node: plannedNode,
              nodeComponent,
              previousNodes: createdNodes.slice(0, i),
              prompt,
              model: configModel,
              userId: user.id
            })

            const { finalConfig, fallbackFields, reasoning, usedFallback } = buildConfigWithFallback({
              nodeComponent,
              initialConfig: configResult.success ? (configResult.config || {}) : {},
              plannedNode,
              prompt
            })

            if (!configResult.success && fallbackFields.length === 0) {
              sendEvent('error', {
                message: `Failed to configure ${plannedNode.title}`,
                error: configResult.error,
                nodeIndex: i
              })
              continue
            }

            // Update node with config field-by-field for visual effect
            const configFields = Object.entries(finalConfig)
            for (let fieldIndex = 0; fieldIndex < configFields.length; fieldIndex++) {
              const [fieldKey, fieldValue] = configFields[fieldIndex]

              // Add field to node config
              node.data.config[fieldKey] = fieldValue

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
                nodeId: nodeId,
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

              await sleep(100) // Brief pause to show each field being set
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
              nodeId: nodeId,
              config: finalConfig,
              nodeIndex: i,
              reasoning: reasoning || configResult.reasoning, // Why AI chose these values
              description: node.data.description,
              status: node.data.aiStatus,
              badgeText: node.data.aiBadgeText,
              badgeVariant: node.data.aiBadgeVariant,
              fallbackFields
            })

            // Step 3: ALWAYS test node to ensure it works
            node.data.aiStatus = 'testing'
            node.data.aiBadgeText = 'Testing'
            node.data.aiBadgeVariant = 'info'
            sendEvent('node_testing', {
              message: `Testing ${plannedNode.title}...`,
              nodeId: nodeId,
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
              supabase
            })

            // If test failed, try to fix the configuration
            let retryCount = 0
            const MAX_RETRIES = 2

            while (!testResult.success && retryCount < MAX_RETRIES) {
              retryCount++

              sendEvent('node_fixing', {
                message: `Fixing configuration issue (attempt ${retryCount}/${MAX_RETRIES})...`,
                nodeId: nodeId,
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
                      nodeId: nodeId,
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
                  nodeId: nodeId,
                  nodeIndex: i
                })

                testResult = await testNode({
                  node,
                  previousNodes: createdNodes.slice(0, i),
                  userId: user.id,
                  supabase
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
                      nodeId: nodeId,
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
                node.data.aiBadgeText = 'Ready'
                node.data.aiBadgeVariant = 'success'
                node.data.needsSetup = false
                node.data.aiTestSummary = usedFallback
                  ? `${testResult.summary} Review the highlighted fields to tailor this node to your workflow.`
                  : testResult.summary

                sendEvent('node_tested', {
                  message: `✓ ${plannedNode.title} tested successfully`,
                  nodeId: nodeId,
                  preview: testResult.preview,
                  nodeIndex: i,
                  summary: node.data.aiTestSummary,
                  status: node.data.aiStatus,
                  badgeText: node.data.aiBadgeText,
                  badgeVariant: node.data.aiBadgeVariant
                })

                // Update node status to complete/ready
                node.data.aiStatus = 'ready'
                node.data.aiBadgeText = 'Complete'
                node.data.aiBadgeVariant = 'success'

                // Send node complete event with test results
                sendEvent('node_complete', {
                  message: `✅ ${plannedNode.title} is ready`,
                  nodeId: nodeId,
                  nodeName: plannedNode.title,
                  nodeIndex: i,
                  totalNodes: plan.nodes.length,
                  testResult: {
                    success: true,
                    message: testResult.summary || 'Configuration tested successfully'
                  },
                  status: 'ready'
                })

                // Wait before starting next node to ensure completion is visible
                await sleep(1500)
              } else {
                node.data.aiStatus = 'error'
                node.data.aiBadgeText = 'Needs Attention'
                node.data.aiBadgeVariant = 'danger'
                node.data.aiTestSummary = testResult.summary || testResult.error || null
                sendEvent('node_test_failed', {
                  message: `⚠️ ${plannedNode.title} test failed: ${testResult.error}`,
                  nodeId: nodeId,
                  error: testResult.error,
                  nodeIndex: i,
                  canContinue: testResult.canContinue, // Can we proceed despite failure?
                  summary: testResult.summary,
                  status: node.data.aiStatus,
                  badgeText: node.data.aiBadgeText,
                  badgeVariant: node.data.aiBadgeVariant
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

            // Step 4: Create edge to previous node
            if (i > 0) {
              const edge = {
                id: `edge-${createdNodes[i - 1].id}-${nodeId}`,
                source: createdNodes[i - 1].id,
                target: nodeId,
                type: 'custom'
              }
              createdEdges.push(edge)

              sendEvent('edge_created', {
                message: `Connected ${createdNodes[i - 1].data.title} → ${plannedNode.title}`,
                edge
              })
            }

            // Brief pause before starting next node
            await sleep(300)
          }

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
          logger.error('Stream workflow error:', error)
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
    })

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

async function generateNodeConfig({ node, nodeComponent, previousNodes, prompt, model, userId }: any) {
  try {
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

Generate a complete configuration that:
1. Uses variables from previous nodes when appropriate (e.g., {{trigger.email}})
2. Fills all required fields
3. Uses sensible defaults for optional fields
4. Matches the user's goal

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

async function testNode({ node, previousNodes, userId, supabase }: any) {
  try {
    const config = node?.data?.config || {}
    const isTrigger = Boolean(node?.data?.isTrigger)
    const preview = buildTestPreview({
      node,
      config,
      previousNodes
    })

    const summary = buildTestSummary({
      node,
      preview,
      config,
      isTrigger
    })

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
  const NODE_HEIGHT = 200 // Approximate height
  const BASE_HORIZONTAL_SPACING = 550 // 450px node + 100px gap for edges
  const VERTICAL_SPACING = 260 // Space between rows
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
  const visibleHeight = viewport.height / zoom

  const horizontalPadding = chatPanelWidth > 0 ? BASE_PADDING / 2 : BASE_PADDING
  const availableWidth = Math.max(effectiveViewportWidth - (horizontalPadding * 2), NODE_WIDTH + 40)
  const horizontalSpacing = Math.min(Math.max(NODE_WIDTH + 80, availableWidth / 3), BASE_HORIZONTAL_SPACING)

  // Calculate how many nodes fit in one row
  const nodesPerRow = Math.max(1, Math.floor(availableWidth / horizontalSpacing))

  // Calculate row and column for this node
  const row = Math.floor(index / nodesPerRow)
  const col = index % nodesPerRow

  // Position the node in world coordinates
  const x = horizontalPadding + (col * horizontalSpacing)
  const y = BASE_PADDING + (row * VERTICAL_SPACING)

  console.log('[POSITION] Node', index, ':', {
    viewport: { width: viewport.width, height: viewport.height, zoom, chatPanelWidth },
    effectiveViewportWidth,
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

function buildTestPreview({ node, config, previousNodes }: any) {
  const timestamp = new Date().toISOString()
  const normalizedConfig = Object.entries(config || {}).reduce((acc: Record<string, any>, [key, value]) => {
    acc[key] = value
    return acc
  }, {})

  if (node?.data?.isTrigger) {
    return {
      eventSource: node.data.title,
      sampleTimestamp: timestamp,
      samplePayloadSummary: `Mock event generated for ${node.data.title}`,
      capturedFields: Object.keys(normalizedConfig).length ? Object.keys(normalizedConfig) : ['subject', 'body', 'created_at'],
      sampleData: {
        id: `${node.id}-sample`,
        subject: 'Sample event subject',
        preview: 'This is representative data provided for review.',
        created_at: timestamp
      }
    }
  }

  const upstream = previousNodes && previousNodes.length > 0 ? previousNodes[previousNodes.length - 1] : null
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
