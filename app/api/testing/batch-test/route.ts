/**
 * API Route: /api/testing/batch-test
 *
 * Runs multiple action node tests sequentially using the authenticated user's
 * real integrations. Each test auto-fills config from test fixtures and
 * executes via the real action handler.
 *
 * Actions that depend on upstream data (e.g., reply needs a messageId from a
 * sent email) have prerequisites that run first to obtain real IDs. This
 * ensures replies/forwards go to self-sent test emails, not external recipients.
 */

import { NextRequest } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { executeAction } from '@/lib/workflows/executeNode'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { buildTestConfig } from '@/lib/workflows/testing/testData'
import { logger } from '@/lib/utils/logger'
import { getDecryptedAccessToken } from '@/lib/workflows/actions/core/getDecryptedAccessToken'

/**
 * Defines prerequisite actions that must run first to obtain real IDs.
 * Maps node types to the prerequisite config needed, and which output
 * fields to inject into the test config.
 */
const PREREQUISITE_MAP: Record<string, {
  /** The node type to run first to get real data */
  prereqNodeType: string
  /** Config overrides for the prerequisite action */
  prereqConfig: Record<string, any>
  /** Maps prereq output fields → test config fields */
  outputMapping: Record<string, string>
  /** Static config overrides to apply to the test action (not the prereq) */
  testConfigOverrides?: Record<string, any>
}> = {
  // Reply needs a real messageId from a sent email (sends to self)
  'gmail_action_reply_to_email': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for reply test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Reply action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId', threadId: 'threadId' },
  },
  // Archive needs a real messageId from a sent email (sends to self)
  'gmail_action_archive_email': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for archive test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Archive action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId' },
  },
  // Add label needs a real messageId from a sent email (sends to self)
  'gmail_action_add_label': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for add label test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Add Label action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { labelIds: ['STARRED'] },
  },
  // Remove label needs a real messageId and a label to remove
  // We send a test email (which gets INBOX label), then remove INBOX label
  'gmail_action_remove_label': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for remove label test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Remove Label action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { labelIds: ['INBOX'] },
  },
  // Mark as read needs a real messageId from a sent email (sends to self)
  'gmail_action_mark_as_read': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for mark as read test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Mark as Read action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { messageSelection: 'single' },
  },
  // Mark as unread needs a real messageId from a sent email (sends to self)
  'gmail_action_mark_as_unread': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for mark as unread test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Mark as Unread action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId' },
    testConfigOverrides: { messageSelection: 'single' },
  },
  // Delete needs a real messageId from a sent email (sends to self)
  'gmail_action_delete_email': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for delete test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Delete action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId' },
  },
  // Draft reply also needs a real messageId
  'gmail_action_create_draft_reply': {
    prereqNodeType: 'gmail_action_send_email',
    prereqConfig: {
      to: 'chainreactapp@gmail.com',
      subject: '[TEST-PREREQ] Email for draft reply test - safe to delete',
      body: 'This email was auto-sent as a prerequisite for testing the Draft Reply action. Safe to delete.',
    },
    outputMapping: { messageId: 'messageId', threadId: 'threadId' },
  },

  // Google Analytics: Send Event needs a real API secret from a created measurement secret
  'google_analytics_action_send_event': {
    prereqNodeType: 'google_analytics_action_create_measurement_secret',
    prereqConfig: {
      displayName: '[TEST-PREREQ] API Secret for send event test - safe to delete',
    },
    outputMapping: { secret_value: 'apiSecret' },
  },

  // GitHub: Add comment needs a real issue number from a created issue
  'github_action_add_comment': {
    prereqNodeType: 'github_action_create_issue',
    prereqConfig: {
      title: '[TEST-PREREQ] Issue for comment test - safe to close',
      body: 'This issue was auto-created as a prerequisite for testing the Add Comment action. Safe to close.',
    },
    outputMapping: { issueNumber: 'issueNumber' },
    testConfigOverrides: { body: '[TEST] Automated comment - safe to delete' },
  },

  // Facebook: Delete post needs a real postId from a created post
  'facebook_action_delete_post': {
    prereqNodeType: 'facebook_action_create_post',
    prereqConfig: {
      message: '[TEST-PREREQ] Post for delete test - safe to delete',
    },
    outputMapping: { postId: 'postId' },
  },

  // Facebook: Update post needs a real postId from a created post
  'facebook_action_update_post': {
    prereqNodeType: 'facebook_action_create_post',
    prereqConfig: {
      message: '[TEST-PREREQ] Post for update test - safe to delete',
    },
    outputMapping: { postId: 'postId' },
    testConfigOverrides: { message: '[TEST] Updated post message - safe to delete' },
  },
}

/**
 * Actions that require file uploads and cannot be batch-tested with auto-generated data.
 * These are skipped with a descriptive message.
 */
const SKIP_ACTIONS: Record<string, string> = {
  'facebook_action_upload_photo': 'Requires a real photo file upload - test manually via /test-actions',
  'facebook_action_upload_video': 'Requires a real video file upload - test manually via /test-actions',
  'github_action_create_repository': 'Would create a new repository each run - TEST-Repository already exists',
  'github_action_create_pull_request': 'Requires a branch with commits - test manually via /test-actions',
  'google_analytics_action_create_measurement_secret': 'Creates a real API secret each run - tested as prerequisite of send_event',
  'google_analytics_action_create_conversion_event': 'Creates a real conversion event each run - test manually via /test-actions',
}

/**
 * Cache for dynamically resolved values within a single batch run.
 * Prevents redundant API calls when testing multiple actions from the same provider.
 */
const dynamicCache = new Map<string, string>()

/**
 * Dynamically resolves provider-specific values that can't be hardcoded in test data.
 * For example, Facebook page IDs differ per user and must be fetched from the API.
 */
async function resolveDynamicConfig(
  providerId: string,
  userId: string,
  testConfig: Record<string, any>
): Promise<Record<string, any>> {
  // GitHub: Resolve TEST-Repository for actions that need a repository
  if (providerId === 'github' && (!testConfig.repository || testConfig.repository === '')) {
    const cacheKey = `github_repository_${userId}`
    if (dynamicCache.has(cacheKey)) {
      testConfig.repository = dynamicCache.get(cacheKey)!
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'github')
      // First try to find the TEST-Repository
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        const owner = userData.login
        // Look for the TEST-Repository
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/TEST-Repository`, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }
        })
        if (repoRes.ok) {
          testConfig.repository = `${owner}/TEST-Repository`
          dynamicCache.set(cacheKey, testConfig.repository)
          logger.debug(`[batch-test] Resolved GitHub repository: ${testConfig.repository}`)
        } else {
          // Fallback: use first available repo
          const reposRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=1', {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github.v3+json' }
          })
          if (reposRes.ok) {
            const repos = await reposRes.json()
            if (repos.length > 0) {
              testConfig.repository = repos[0].full_name
              dynamicCache.set(cacheKey, testConfig.repository)
              logger.debug(`[batch-test] Fallback GitHub repository: ${testConfig.repository}`)
            }
          }
        }
      }
    } catch (err: any) {
      logger.error('[batch-test] Failed to resolve GitHub repository:', err.message)
    }
  }

  // Google Analytics: Resolve accountId, propertyId, measurementId from the Admin API
  if (providerId === 'google-analytics') {
    const gaCacheKey = `ga_resolved_${userId}`
    if (dynamicCache.has(gaCacheKey)) {
      const cached = JSON.parse(dynamicCache.get(gaCacheKey)!)
      if (!testConfig.accountId) testConfig.accountId = cached.accountId
      if (!testConfig.propertyId) testConfig.propertyId = cached.propertyId
      if (!testConfig.measurementId) testConfig.measurementId = cached.measurementId
      if (!testConfig.dataStreamId) testConfig.dataStreamId = cached.dataStreamId
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-analytics')

      // Fetch account summaries (includes properties)
      const summariesRes = await fetch(
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (summariesRes.ok) {
        const summariesData = await summariesRes.json()
        const summaries = summariesData.accountSummaries || []
        if (summaries.length > 0) {
          const firstAccount = summaries[0]
          const accountId = firstAccount.account?.replace('accounts/', '') || ''
          if (!testConfig.accountId) testConfig.accountId = accountId

          // Pick first property from this account
          const properties = firstAccount.propertySummaries || []
          if (properties.length > 0) {
            const propertyResource = properties[0].property || ''
            const propertyId = propertyResource.replace('properties/', '')
            if (!testConfig.propertyId) testConfig.propertyId = propertyId

            // Fetch data streams to get measurementId and dataStreamId
            const streamsRes = await fetch(
              `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams?pageSize=200`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            if (streamsRes.ok) {
              const streamsData = await streamsRes.json()
              const webStreams = (streamsData.dataStreams || []).filter(
                (s: any) => s.type === 'WEB_DATA_STREAM' && s.webStreamData?.measurementId
              )
              if (webStreams.length > 0) {
                const stream = webStreams[0]
                if (!testConfig.measurementId) testConfig.measurementId = stream.webStreamData.measurementId
                // Extract dataStreamId from resource name (properties/{id}/dataStreams/{streamId})
                const streamIdMatch = stream.name?.match(/dataStreams\/(.+)/)
                if (streamIdMatch && !testConfig.dataStreamId) {
                  testConfig.dataStreamId = streamIdMatch[1]
                }
              }
            }
          }

          // Cache resolved values
          dynamicCache.set(gaCacheKey, JSON.stringify({
            accountId: testConfig.accountId,
            propertyId: testConfig.propertyId,
            measurementId: testConfig.measurementId,
            dataStreamId: testConfig.dataStreamId,
          }))
          logger.debug(`[batch-test] Resolved Google Analytics: account=${testConfig.accountId}, property=${testConfig.propertyId}, measurement=${testConfig.measurementId}`)
        }
      }
    } catch (err: any) {
      logger.error('[batch-test] Failed to resolve Google Analytics config:', err.message)
    }
  }

  if (providerId === 'facebook' && (!testConfig.pageId || testConfig.pageId === '')) {
    const cacheKey = `facebook_pageId_${userId}`
    if (dynamicCache.has(cacheKey)) {
      testConfig.pageId = dynamicCache.get(cacheKey)!
      return testConfig
    }
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'facebook')
      const response = await fetch('https://graph.facebook.com/v19.0/me/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.data && data.data.length > 0) {
          testConfig.pageId = data.data[0].id
          dynamicCache.set(cacheKey, testConfig.pageId)
          logger.debug(`[batch-test] Resolved Facebook pageId: ${testConfig.pageId}`)
        } else {
          logger.warn('[batch-test] No Facebook pages found for user')
        }
      }
    } catch (err: any) {
      logger.error('[batch-test] Failed to resolve Facebook pageId:', err.message)
    }
  }
  return testConfig
}

export interface BatchTestResult {
  nodeType: string
  nodeTitle: string
  providerId: string
  success: boolean
  duration: number
  message: string
  error?: string
  errorStack?: string
  output?: any
  prerequisiteRan?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Authentication required', 401)
    }

    const body = await request.json()
    const { nodeTypes } = body as { nodeTypes: string[] }

    if (!nodeTypes || !Array.isArray(nodeTypes) || nodeTypes.length === 0) {
      return errorResponse('nodeTypes array is required', 400)
    }

    // Cap at 50 tests per batch to prevent abuse
    const testTypes = nodeTypes.slice(0, 50)

    // Get user's connected integrations to inject integration IDs
    const { data: integrations } = await supabase
      .from('integrations')
      .select('id, provider, status')
      .eq('user_id', user.id)
      .eq('status', 'connected')

    const integrationMap = new Map<string, string>()
    if (integrations) {
      for (const int of integrations) {
        integrationMap.set(int.provider, int.id)
      }
    }

    const results: BatchTestResult[] = []

    for (const nodeType of testTypes) {
      const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
      if (!nodeComponent) {
        results.push({
          nodeType,
          nodeTitle: nodeType,
          providerId: 'unknown',
          success: false,
          duration: 0,
          message: `Unknown node type: ${nodeType}`,
          error: `Node type "${nodeType}" not found in registry`,
        })
        continue
      }

      if (nodeComponent.isTrigger) {
        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: false,
          duration: 0,
          message: 'Trigger nodes cannot be tested directly',
          error: 'Triggers activate on external events — use the trigger tester instead',
        })
        continue
      }

      // Skip actions that require file uploads or other non-automatable inputs
      if (SKIP_ACTIONS[nodeType]) {
        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: false,
          duration: 0,
          message: `Skipped: ${SKIP_ACTIONS[nodeType]}`,
          error: SKIP_ACTIONS[nodeType],
        })
        continue
      }

      // Build test config with auto-generated data
      const testConfig = buildTestConfig({
        type: nodeComponent.type,
        providerId: nodeComponent.providerId || '',
        configSchema: nodeComponent.configSchema,
      })

      // Resolve dynamic config values (e.g., Facebook pageId from API)
      const providerId = nodeComponent.providerId || ''
      await resolveDynamicConfig(providerId, user.id, testConfig)

      // Inject the user's real integration ID for this provider
      const integrationId = integrationMap.get(providerId)
      if (integrationId) {
        // Set common integration reference fields
        testConfig.workspace = testConfig.workspace || integrationId
        testConfig.integrationId = testConfig.integrationId || integrationId
        testConfig.account = testConfig.account || integrationId
        testConfig.connection = testConfig.connection || integrationId
      }

      // Run prerequisite if this action needs upstream data (e.g., reply needs a real messageId)
      const prereq = PREREQUISITE_MAP[nodeType]
      let prerequisiteRan = false
      if (prereq) {
        try {
          logger.debug(`[batch-test] Running prerequisite ${prereq.prereqNodeType} for ${nodeType}`)

          const prereqConfig = buildTestConfig({
            type: prereq.prereqNodeType,
            providerId: nodeComponent.providerId || '',
            configSchema: ALL_NODE_COMPONENTS.find(c => c.type === prereq.prereqNodeType)?.configSchema,
          })
          // Override with prerequisite-specific config (ensures email goes to self)
          Object.assign(prereqConfig, prereq.prereqConfig)

          // Resolve dynamic config for prerequisite too (e.g., Facebook pageId)
          await resolveDynamicConfig(nodeComponent.providerId || '', user.id, prereqConfig)

          // Inject integration ID for the prerequisite too
          if (integrationId) {
            prereqConfig.workspace = prereqConfig.workspace || integrationId
            prereqConfig.integrationId = prereqConfig.integrationId || integrationId
            prereqConfig.account = prereqConfig.account || integrationId
            prereqConfig.connection = prereqConfig.connection || integrationId
          }

          const prereqNode = {
            id: 'batch-test-prereq',
            data: { type: prereq.prereqNodeType, config: prereqConfig }
          }

          const prereqResult = await Promise.race([
            executeAction({
              node: prereqNode,
              input: {},
              userId: user.id,
              workflowId: 'batch-test-prereq',
              executionMode: 'live'
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Prerequisite timed out after 30s')), 30000)
            )
          ])

          if (prereqResult.success !== false && prereqResult.output) {
            // Inject real IDs from the prerequisite output into the test config
            for (const [outputField, configField] of Object.entries(prereq.outputMapping)) {
              if (prereqResult.output[outputField]) {
                testConfig[configField] = prereqResult.output[outputField]
              }
            }
            prerequisiteRan = true
            logger.debug(`[batch-test] Prerequisite succeeded, injected: ${Object.keys(prereq.outputMapping).join(', ')}`)
          }

          // Apply static test config overrides (e.g., labelIds for remove label)
          if (prereq.testConfigOverrides) {
            Object.assign(testConfig, prereq.testConfigOverrides)
          }

          if (prereqResult.success === false) {
            logger.error(`[batch-test] Prerequisite ${prereq.prereqNodeType} failed:`, prereqResult.message)
          }
        } catch (prereqError: any) {
          logger.error(`[batch-test] Prerequisite error for ${nodeType}:`, prereqError.message)
        }
      }

      const startTime = Date.now()

      try {
        const testNode = {
          id: 'batch-test-node',
          data: { type: nodeType, config: testConfig }
        }

        const testResult = await Promise.race([
          executeAction({
            node: testNode,
            input: {},
            userId: user.id,
            workflowId: 'batch-test',
            executionMode: 'live'
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Test timed out after 30s')), 30000)
          )
        ])

        const duration = Date.now() - startTime

        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: testResult.success !== false,
          duration,
          message: testResult.message || (testResult.success ? 'Passed' : 'Failed'),
          output: testResult.output,
          error: testResult.success === false ? (testResult.error || testResult.message) : undefined,
          prerequisiteRan,
        })

      } catch (error: any) {
        const duration = Date.now() - startTime

        results.push({
          nodeType,
          nodeTitle: nodeComponent.title,
          providerId: nodeComponent.providerId || 'unknown',
          success: false,
          duration,
          message: `Error: ${error.message}`,
          error: error.message,
          errorStack: error.stack,
          prerequisiteRan,
        })
      }
    }

    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return jsonResponse({
      success: true,
      summary: {
        total: results.length,
        passed,
        failed,
        passRate: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
      },
      results,
    })

  } catch (error: any) {
    logger.error('[batch-test] Error:', error)
    return errorResponse(error.message || 'Failed to run batch tests', 500)
  }
}
