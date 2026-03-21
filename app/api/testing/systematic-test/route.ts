/**
 * API Route: /api/testing/systematic-test
 *
 * GET  → Serves a minimal HTML page with a "Run Tests" button
 * POST → Runs all connected actions, returns a downloadable .md report
 *
 * Prerequisites are resolved recursively with output caching via shared
 * testChains module. This enables multi-step chains (e.g., create_workbook →
 * create_worksheet → add_row) and dynamic ID resolution for providers like
 * Notion, Slack, Discord, Mailchimp, and OneNote.
 *
 * Failure categories:
 *   - "code_fix"       → Bugs in action handlers / test data / config resolution
 *   - "config_needed"  → Missing dynamic config (resource IDs, channel names)
 *   - "auth_issue"     → Token expired, scopes missing, integration disconnected
 *   - "api_limitation" → Provider API rejects (rate limit, plan, validation)
 *   - "skipped"        → Known skip (file upload, repo creation)
 *   - "timeout"        → Action took >30s
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { errorResponse } from '@/lib/utils/api-response'
import { executeAction } from '@/lib/workflows/executeNode'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { buildTestConfig } from '@/lib/workflows/testing/testData'
import { logger } from '@/lib/utils/logger'
import { loadCache, canSkipTest, recordTestResult, clearCache } from '@/lib/workflows/testing/testCache'
import {
  PREREQUISITE_MAP,
  SKIP_ACTIONS,
  resolveDynamicConfig,
  resolvePrereqs,
  dedupTestNames,
} from '@/lib/workflows/testing/testChains'

// ── Types ───────────────────────────────────────────────────────────────

type FailureCategory = 'code_fix' | 'config_needed' | 'auth_issue' | 'api_limitation' | 'skipped' | 'timeout'

interface ClassifiedResult {
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
  failureCategory?: FailureCategory
  failureReason?: string
  suggestedFix?: string
  cachedPass?: boolean
}

// ── Failure classification ──────────────────────────────────────────────

function classifyFailure(error: string, nodeType: string, providerId: string): {
  category: FailureCategory
  reason: string
  suggestedFix: string
} {
  const e = error.toLowerCase()

  if (
    e.includes('401') || e.includes('unauthorized') ||
    e.includes('token') && (e.includes('expired') || e.includes('invalid') || e.includes('revoked')) ||
    e.includes('forbidden') || e.includes('403') ||
    e.includes('insufficient_scope') || e.includes('missing_scope') ||
    e.includes('oauth') || e.includes('not authenticated') ||
    e.includes('access denied') || e.includes('invalid_grant') ||
    e.includes('no access token') || e.includes('no integration found') ||
    e.includes('integration not found') || e.includes('not connected') ||
    e.includes('authentication expired') || e.includes('reconnect your account') ||
    e.includes('refresh token does not exist') ||
    e.includes('failed to refresh') && e.includes('token') ||
    e.includes('invalid_auth') ||
    e.includes('bot may lack permissions') || e.includes('cannot invite users') ||
    e.includes('bot is not in this channel') || e.includes('not_in_channel') ||
    e.includes('requires a user token') || e.includes('user token')
  ) {
    return {
      category: 'auth_issue',
      reason: 'Authentication or authorization failure',
      suggestedFix: `Reconnect the ${providerId} integration or check OAuth scopes.`,
    }
  }

  if (e.includes('timed out') || e.includes('timeout') || e.includes('etimedout') || e.includes('econnaborted')) {
    return {
      category: 'timeout',
      reason: 'Action execution exceeded 30s timeout',
      suggestedFix: `The ${providerId} API was slow. May be transient — retry later.`,
    }
  }

  if (
    e.includes('required') && (e.includes('field') || e.includes('parameter') || e.includes('missing')) ||
    e.includes('is required') || e.includes('must provide') ||
    e.includes('are required') ||
    e.includes('no channel') || e.includes('no board') || e.includes('no base') ||
    e.includes('no database') || e.includes('no page') || e.includes('no workspace') ||
    e.includes('channel_not_found') || e.includes('not_found') && e.includes('channel') ||
    e.includes('invalid_id') || e.includes('resource_not_found') ||
    e.includes('could not find') || e.includes('does not exist') ||
    e.includes('no spreadsheet') || e.includes('no workbook') ||
    e.includes('board not found') || e.includes('base not found') ||
    e.includes('no input') || e.includes('no files') || e.includes('no file') ||
    e.includes('not configured') || e.includes('not provided') ||
    e.includes('please select') || e.includes('please check') ||
    e.includes('no routing conditions') ||
    e.includes('no blocks selected') ||
    e.includes('item not found') || e.includes('itemnotfound') ||
    e.includes('event not found') || e.includes('file_not_found') ||
    e.includes('not found') && (e.includes('404') || e.includes('item') || e.includes('event') || e.includes('file') || e.includes('page') || e.includes('user')) ||
    e.includes('should be a valid uuid') || e.includes('should be defined') ||
    e.includes('invalid request url') || e.includes('failed to parse url') ||
    e.includes('channel not found') || e.includes('invalid_channel') ||
    e.includes('invalid_scheduled_message_id') ||
    e.includes('api key not configured') ||
    e.includes('selectors are required') ||
    e.includes('operationfailed')
  ) {
    return {
      category: 'config_needed',
      reason: 'Missing or invalid configuration value',
      suggestedFix: `Test data for ${providerId}/${nodeType} needs a real resource ID.`,
    }
  }

  if (e.includes('rate limit') || e.includes('429') || e.includes('too many requests') || e.includes('throttl')) {
    return {
      category: 'api_limitation',
      reason: 'Rate limited by provider API',
      suggestedFix: `Wait a few minutes and retry.`,
    }
  }

  if (
    e.includes('400') && (e.includes('bad request') || e.includes('invalid')) ||
    e.includes('422') || e.includes('unprocessable') ||
    e.includes('duplicate') || e.includes('already exists') ||
    e.includes('not_allowed') || e.includes('restricted_action') ||
    e.includes('paid feature') || e.includes('upgrade') ||
    e.includes('plan') && e.includes('limit') ||
    e.includes('503') || e.includes('service unavailable') ||
    e.includes('500') && e.includes('internal server error') ||
    e.includes('confirm your identity') ||
    e.includes('name already exists') || e.includes('channel name already')
  ) {
    return {
      category: 'api_limitation',
      reason: 'Provider API rejected the request',
      suggestedFix: `The ${providerId} API rejected the payload. May be a plan limitation or validation error.`,
    }
  }

  return {
    category: 'code_fix',
    reason: 'Action handler error — likely a bug',
    suggestedFix: `Review the action handler for ${nodeType}.`,
  }
}

// ── Markdown report generator ───────────────────────────────────────────

function generateMarkdownReport(
  results: ClassifiedResult[],
  failuresByCategory: Record<FailureCategory, ClassifiedResult[]>,
  byProvider: Record<string, { passed: number; failed: number; total: number }>,
): string {
  const passed = results.filter(r => r.success).length
  const freshPasses = results.filter(r => r.success && !r.cachedPass).length
  const cachedPasses = results.filter(r => r.success && r.cachedPass).length
  const failed = results.filter(r => !r.success).length
  const skipped = results.filter(r => r.failureCategory === 'skipped').length
  const passRate = results.length > 0 ? Math.round((passed / results.length) * 100) : 0
  const now = new Date().toISOString()

  const lines: string[] = [
    `# ChainReact Systematic Test Report`,
    ``,
    `**Date:** ${now}`,
    `**Total:** ${results.length} | **Passed:** ${passed} (${freshPasses} new, ${cachedPasses} cached) | **Failed:** ${failed} | **Skipped:** ${skipped} | **Pass Rate:** ${passRate}%`,
    ``,
    `---`,
    ``,
  ]

  // ── Failure summary ─────────────────────────────────────────────────
  if (failed > 0) {
    lines.push(`## Failure Breakdown`, ``)
    lines.push(`| Category | Count | Description |`)
    lines.push(`|----------|-------|-------------|`)
    const catDescriptions: Record<FailureCategory, string> = {
      code_fix: 'Bugs in action handlers — can be fixed in code',
      config_needed: 'Missing resource IDs / dynamic config',
      auth_issue: 'Token expired, scopes missing, not connected',
      api_limitation: 'Provider API rejected (plan, rate limit, validation)',
      skipped: 'Known skips (file uploads, destructive actions)',
      timeout: 'Exceeded 30s timeout',
    }
    for (const [cat, items] of Object.entries(failuresByCategory)) {
      if (items.length > 0) {
        lines.push(`| ${cat} | ${items.length} | ${catDescriptions[cat as FailureCategory]} |`)
      }
    }
    lines.push(``)
  }

  // ── Code fixes (for Claude to address) ──────────────────────────────
  if (failuresByCategory.code_fix.length > 0) {
    lines.push(`## Code Fixes (Claude can address these)`, ``)
    for (const r of failuresByCategory.code_fix) {
      lines.push(`### \`${r.nodeType}\` — ${r.nodeTitle}`)
      lines.push(`- **Provider:** ${r.providerId}`)
      lines.push(`- **Error:** ${r.error || r.message}`)
      lines.push(`- **Duration:** ${r.duration}ms`)
      if (r.suggestedFix) lines.push(`- **Suggested Fix:** ${r.suggestedFix}`)
      if (r.errorStack) lines.push(`- **Stack:**\n\`\`\`\n${r.errorStack}\n\`\`\``)
      if (r.output) lines.push(`- **Output:**\n\`\`\`json\n${JSON.stringify(r.output, null, 2)}\n\`\`\``)
      lines.push(``)
    }
  }

  // ── Config needed (user action) ─────────────────────────────────────
  if (failuresByCategory.config_needed.length > 0) {
    lines.push(`## Config Needed (User action required)`, ``)
    for (const r of failuresByCategory.config_needed) {
      lines.push(`### \`${r.nodeType}\` — ${r.nodeTitle}`)
      lines.push(`- **Provider:** ${r.providerId}`)
      lines.push(`- **Error:** ${r.error || r.message}`)
      if (r.suggestedFix) lines.push(`- **What to do:** ${r.suggestedFix}`)
      lines.push(``)
    }
  }

  // ── Auth issues ─────────────────────────────────────────────────────
  if (failuresByCategory.auth_issue.length > 0) {
    lines.push(`## Auth Issues (Reconnect / re-authorize)`, ``)
    const byProv = new Map<string, ClassifiedResult[]>()
    for (const r of failuresByCategory.auth_issue) {
      if (!byProv.has(r.providerId)) byProv.set(r.providerId, [])
      byProv.get(r.providerId)!.push(r)
    }
    for (const [prov, items] of byProv) {
      lines.push(`### ${prov} (${items.length} actions)`)
      lines.push(`- **Error:** ${items[0].error || items[0].message}`)
      lines.push(`- **Affected actions:** ${items.map(i => i.nodeTitle).join(', ')}`)
      lines.push(`- **Fix:** Reconnect ${prov} in Settings → Integrations`)
      lines.push(``)
    }
  }

  // ── API limitations ─────────────────────────────────────────────────
  if (failuresByCategory.api_limitation.length > 0) {
    lines.push(`## API Limitations (Provider constraints)`, ``)
    for (const r of failuresByCategory.api_limitation) {
      lines.push(`### \`${r.nodeType}\` — ${r.nodeTitle}`)
      lines.push(`- **Provider:** ${r.providerId}`)
      lines.push(`- **Error:** ${r.error || r.message}`)
      if (r.suggestedFix) lines.push(`- **Note:** ${r.suggestedFix}`)
      lines.push(``)
    }
  }

  // ── Timeouts ────────────────────────────────────────────────────────
  if (failuresByCategory.timeout.length > 0) {
    lines.push(`## Timeouts`, ``)
    for (const r of failuresByCategory.timeout) {
      lines.push(`- \`${r.nodeType}\` — ${r.nodeTitle} (${r.providerId}) — ${r.duration}ms`)
    }
    lines.push(``)
  }

  // ── Skipped ─────────────────────────────────────────────────────────
  if (failuresByCategory.skipped.length > 0) {
    lines.push(`## Skipped`, ``)
    for (const r of failuresByCategory.skipped) {
      lines.push(`- \`${r.nodeType}\` — ${r.nodeTitle}: ${r.error}`)
    }
    lines.push(``)
  }

  // ── Provider pass rates ─────────────────────────────────────────────
  lines.push(`## Provider Pass Rates`, ``)
  lines.push(`| Provider | Passed | Total | Rate |`)
  lines.push(`|----------|--------|-------|------|`)
  for (const [prov, data] of Object.entries(byProvider).sort(([, a], [, b]) => {
    const aRate = a.total > 0 ? a.passed / a.total : 0
    const bRate = b.total > 0 ? b.passed / b.total : 0
    return aRate - bRate
  })) {
    const pct = data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0
    lines.push(`| ${prov} | ${data.passed} | ${data.total} | ${pct}% |`)
  }
  lines.push(``)

  // ── Freshly passed actions ──────────────────────────────────────────
  const freshPassed = results.filter(r => r.success && !r.cachedPass)
  if (freshPassed.length > 0) {
    lines.push(`## Passed Actions (${freshPassed.length} newly verified)`, ``)
    for (const r of freshPassed) {
      lines.push(`- ✅ \`${r.nodeType}\` — ${r.nodeTitle} (${r.duration}ms)`)
    }
    lines.push(``)
  }

  // ── Cached passes (skipped — code unchanged) ─────────────────────
  const cachedPassed = results.filter(r => r.success && r.cachedPass)
  if (cachedPassed.length > 0) {
    lines.push(`## Previously Passed (${cachedPassed.length} skipped — code unchanged)`, ``)
    for (const r of cachedPassed) {
      lines.push(`- ⏭️ \`${r.nodeType}\` — ${r.nodeTitle} (last passed: ${r.message.replace('Cached pass (', '').replace(')', '')})`)
    }
    lines.push(``)
  }

  return lines.join('\n')
}

// ── GET: Serve minimal run page ─────────────────────────────────────────

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return errorResponse('Authentication required — log in first', 401)
  }

  const html = `<!DOCTYPE html>
<html><head>
  <title>Systematic Test Runner</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; color: #333; }
    h1 { font-size: 1.5rem; }
    p { color: #666; line-height: 1.5; }
    button { background: #111; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #333; }
    button:disabled { background: #999; cursor: not-allowed; }
    #status { margin-top: 16px; padding: 12px; border-radius: 8px; display: none; }
    .running { background: #f0f4ff; color: #1e40af; display: block !important; }
    .done { background: #f0fdf4; color: #166534; display: block !important; }
    .error { background: #fef2f2; color: #991b1b; display: block !important; }
  </style>
</head><body>
  <h1>Systematic Action Tester</h1>
  <p>Tests <strong>every connected action</strong> with real API calls. Generates a categorized .md report you can give to Claude to fix issues.</p>
  <p>Previously passed tests are skipped if the handler code hasn't changed.</p>
  <label style="display:block;margin:12px 0;cursor:pointer;">
    <input type="checkbox" id="forceRerun" style="margin-right:8px;"> Force rerun all tests (ignore cache)
  </label>
  <button id="btn" onclick="runTests()">Run Tests & Download Report</button>
  <div id="status"></div>
  <script>
    async function runTests() {
      const btn = document.getElementById('btn');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.textContent = 'Running tests...';
      status.className = 'running';
      status.textContent = 'Running systematic tests across all connected providers. This may take a few minutes...';
      try {
        const forceRerun = document.getElementById('forceRerun').checked;
        const res = await fetch('/api/testing/systematic-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceRerun })
        });
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/markdown')) {
          const text = await res.text();
          const blob = new Blob([text], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'systematic-test-report-' + new Date().toISOString().split('T')[0] + '.md';
          a.click();
          URL.revokeObjectURL(url);
          status.className = 'done';
          status.textContent = 'Report downloaded! Give the .md file to Claude to fix issues.';
        } else {
          const data = await res.json();
          status.className = 'error';
          status.textContent = 'Error: ' + (data.error || 'Unknown error');
        }
      } catch (err) {
        status.className = 'error';
        status.textContent = 'Request failed: ' + err.message;
      }
      btn.disabled = false;
      btn.textContent = 'Run All Tests & Download Report';
    }
  </script>
</body></html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ── POST: Run tests, return downloadable .md report ─────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Authentication required', 401)
    }

    const body = await request.json().catch(() => ({}))
    const {
      providers: requestedProviders,
      includeDisconnected = false,
      forceRerun = false,
    } = body as {
      providers?: string[]
      includeDisconnected?: boolean
      forceRerun?: boolean
    }

    // Load test cache from database
    if (forceRerun) await clearCache()
    const cache = await loadCache()

    // Get user's connected integrations
    const { data: integrations } = await supabase
      .from('integrations')
      .select('id, provider, status')
      .eq('user_id', user.id)
      .eq('status', 'connected')

    const integrationMap = new Map<string, string>()
    const connectedProviders = new Set<string>()
    if (integrations) {
      for (const int of integrations) {
        integrationMap.set(int.provider, int.id)
        connectedProviders.add(int.provider)
      }
    }

    // Collect all testable action nodes
    const actionNodes = ALL_NODE_COMPONENTS.filter(n =>
      !n.isTrigger && !n.comingSoon && !n.deprecated && !n.isSystemNode && n.providerId
    )

    const targetNodes = actionNodes.filter(n => {
      const pid = n.providerId!
      if (requestedProviders && requestedProviders.length > 0) {
        return requestedProviders.includes(pid)
      }
      const noIntegrationNeeded = ['ai', 'logic', 'utility', 'automation']
      if (noIntegrationNeeded.includes(pid)) return true
      if (includeDisconnected) return true
      return connectedProviders.has(pid)
    })

    // Sort destructive actions (delete, archive) to run last so shared prereq resources
    // aren't destroyed before other tests that depend on them
    targetNodes.sort((a, b) => {
      const aDestructive = /delete|archive/i.test(a.type) ? 1 : 0
      const bDestructive = /delete|archive/i.test(b.type) ? 1 : 0
      return aDestructive - bDestructive
    })

    const cachedCount = targetNodes.filter(n => canSkipTest(cache, n.type, n.providerId || '')).length
    logger.debug(`[systematic-test] Testing ${targetNodes.length} actions across ${new Set(targetNodes.map(n => n.providerId)).size} providers (${cachedCount} cached)`)

    const results: ClassifiedResult[] = []
    // Shared prereq output cache — prereqs that already ran are reused across tests
    const prereqCache = new Map<string, Record<string, any>>()

    for (const nodeComponent of targetNodes) {
      const nodeType = nodeComponent.type
      const providerId = nodeComponent.providerId || ''

      if (SKIP_ACTIONS[nodeType]) {
        results.push({
          nodeType, nodeTitle: nodeComponent.title, providerId,
          success: false, duration: 0,
          message: `Skipped: ${SKIP_ACTIONS[nodeType]}`,
          error: SKIP_ACTIONS[nodeType],
          failureCategory: 'skipped',
          failureReason: SKIP_ACTIONS[nodeType],
          suggestedFix: 'Test manually via /test-actions',
        })
        continue
      }

      // Check cache — skip if previously passed and code unchanged
      if (!forceRerun) {
        const cached = canSkipTest(cache, nodeType, providerId)
        if (cached) {
          results.push({
            nodeType, nodeTitle: nodeComponent.title, providerId,
            success: true, duration: cached.duration,
            message: `Cached pass (${cached.passedAt})`,
            cachedPass: true,
          })
          continue
        }
      }

      const noIntegrationNeeded = ['ai', 'logic', 'utility', 'automation']
      if (!noIntegrationNeeded.includes(providerId) && !integrationMap.has(providerId)) {
        results.push({
          nodeType, nodeTitle: nodeComponent.title, providerId,
          success: false, duration: 0,
          message: `Not connected: ${providerId} integration required`,
          failureCategory: 'auth_issue',
          failureReason: `No connected ${providerId} integration`,
          suggestedFix: `Connect ${providerId} in Settings → Integrations.`,
        })
        continue
      }

      const testConfig = buildTestConfig({
        type: nodeComponent.type,
        providerId,
        configSchema: nodeComponent.configSchema,
      })

      await resolveDynamicConfig(providerId, user.id, testConfig)
      dedupTestNames(testConfig)

      const integrationId = integrationMap.get(providerId)
      if (integrationId) {
        testConfig.workspace = testConfig.workspace || integrationId
        testConfig.integrationId = testConfig.integrationId || integrationId
        testConfig.account = testConfig.account || integrationId
        testConfig.connection = testConfig.connection || integrationId
      }

      // Resolve prerequisite chain (recursive, with caching)
      let prerequisiteRan = false
      if (PREREQUISITE_MAP[nodeType]) {
        try {
          prerequisiteRan = await resolvePrereqs(nodeType, testConfig, {
            userId: user.id,
            providerId,
            integrationId,
            prereqCache,
            executeActionFn: executeAction,
            buildTestConfigFn: buildTestConfig,
            allNodeComponents: ALL_NODE_COMPONENTS,
          })
        } catch (prereqError: any) {
          logger.error(`[systematic-test] Prerequisite error for ${nodeType}:`, prereqError.message)
        }
      }

      // Execute the action
      const startTime = Date.now()
      try {
        const testResult = await Promise.race([
          executeAction({
            node: { id: 'systematic-test-node', data: { type: nodeType, config: testConfig } },
            input: {}, userId: user.id, workflowId: 'systematic-test', executionMode: 'live'
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Test timed out after 30s')), 30000))
        ])

        const duration = Date.now() - startTime
        const success = testResult.success !== false

        const result: ClassifiedResult = {
          nodeType, nodeTitle: nodeComponent.title, providerId,
          success, duration,
          message: testResult.message || (success ? 'Passed' : 'Failed'),
          output: testResult.output, prerequisiteRan,
        }

        if (!success) {
          const errorMsg = testResult.error || testResult.message || 'Unknown error'
          result.error = errorMsg
          const classification = classifyFailure(errorMsg, nodeType, providerId)
          result.failureCategory = classification.category
          result.failureReason = classification.reason
          result.suggestedFix = classification.suggestedFix
          await recordTestResult(nodeType, providerId, nodeComponent.title, 'failed', duration, errorMsg)
        } else {
          await recordTestResult(nodeType, providerId, nodeComponent.title, 'passed', duration)
        }

        results.push(result)
      } catch (error: any) {
        const duration = Date.now() - startTime
        const errorMsg = error.message || 'Unknown error'
        const classification = classifyFailure(errorMsg, nodeType, providerId)

        await recordTestResult(nodeType, providerId, nodeComponent.title, 'failed', duration, errorMsg)
        results.push({
          nodeType, nodeTitle: nodeComponent.title, providerId,
          success: false, duration,
          message: `Error: ${errorMsg}`,
          error: errorMsg, errorStack: error.stack,
          prerequisiteRan,
          failureCategory: classification.category,
          failureReason: classification.reason,
          suggestedFix: classification.suggestedFix,
        })
      }
    }

    // Build categorized data
    const failuresByCategory: Record<FailureCategory, ClassifiedResult[]> = {
      code_fix: [], config_needed: [], auth_issue: [],
      api_limitation: [], skipped: [], timeout: [],
    }
    for (const r of results) {
      if (!r.success && r.failureCategory) failuresByCategory[r.failureCategory].push(r)
    }

    const byProvider: Record<string, { passed: number; failed: number; total: number }> = {}
    for (const r of results) {
      if (!byProvider[r.providerId]) byProvider[r.providerId] = { passed: 0, failed: 0, total: 0 }
      byProvider[r.providerId].total++
      if (r.success) byProvider[r.providerId].passed++
      else byProvider[r.providerId].failed++
    }

    // Generate markdown report
    const markdown = generateMarkdownReport(results, failuresByCategory, byProvider)
    const filename = `systematic-test-report-${new Date().toISOString().split('T')[0]}.md`

    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })

  } catch (error: any) {
    logger.error('[systematic-test] Error:', error)
    return errorResponse(error.message || 'Failed to run systematic tests', 500)
  }
}
