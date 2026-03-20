/**
 * Implementation Completeness Audit
 *
 * Scans all action handlers, trigger lifecycles, pollers, and webhook routes
 * for stubs, mock data, TODOs, and incomplete implementations.
 *
 * This is a DEVELOPMENT tool — run it to find what still needs work.
 *
 * Run: npm run test:audit
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../../../..')

const SCAN_DIRS = {
  actions: path.join(ROOT, 'lib/workflows/actions'),
  triggerProviders: path.join(ROOT, 'lib/triggers/providers'),
  triggerPollers: path.join(ROOT, 'lib/triggers/pollers'),
  webhookRoutes: path.join(ROOT, 'app/api/webhooks'),
  executeNode: path.join(ROOT, 'lib/workflows/executeNode.ts'),
  nodeSchemas: path.join(ROOT, 'lib/workflows/nodes/providers'),
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Finding {
  file: string
  line: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  message: string
  snippet: string
}

const findings: Finding[] = []

function relativePath(absPath: string): string {
  return absPath.replace(ROOT + path.sep, '').replace(/\\/g, '/')
}

function scanFile(filePath: string, patterns: Array<{
  pattern: RegExp
  severity: Finding['severity']
  category: string
  message: string
}>) {
  const source = fs.readFileSync(filePath, 'utf-8')
  const lines = source.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { pattern, severity, category, message } of patterns) {
      if (pattern.test(line)) {
        // Skip if it's in a comment about what NOT to do or test file references
        const trimmed = line.trim()
        if (trimmed.startsWith('//') && trimmed.includes('NEVER') && trimmed.includes('console')) continue
        if (trimmed.startsWith('*') && trimmed.includes('NEVER')) continue

        findings.push({
          file: relativePath(filePath),
          line: i + 1,
          severity,
          category,
          message,
          snippet: trimmed.slice(0, 120),
        })
      }
    }
  }
}

function getAllTsFiles(dir: string): string[] {
  const result: string[] = []
  if (!fs.existsSync(dir)) return result

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...getAllTsFiles(fullPath))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
      result.push(fullPath)
    }
  }
  return result
}

// ─── Pattern definitions ────────────────────────────────────────────────────

const STUB_PATTERNS = [
  {
    pattern: /TODO|FIXME|HACK|XXX/i,
    severity: 'medium' as const,
    category: 'TODO/FIXME',
    message: 'TODO or FIXME marker found — incomplete implementation',
  },
  {
    pattern: /not\s+(yet\s+)?implemented/i,
    severity: 'high' as const,
    category: 'Unimplemented',
    message: 'Feature explicitly marked as not implemented',
  },
  {
    pattern: /throw\s+new\s+Error\s*\(\s*['"`].*not.*implemented/i,
    severity: 'critical' as const,
    category: 'Throws Not Implemented',
    message: 'Will throw error at runtime — not implemented',
  },
  {
    pattern: /coming\s*soon|placeholder|stub|dummy data/i,
    severity: 'medium' as const,
    category: 'Placeholder',
    message: 'Placeholder or stub code detected',
  },
  {
    pattern: /mock_email_|mock_discord_|mock_thread_|mockData:\s*true/,
    severity: 'high' as const,
    category: 'Mock Data',
    message: 'Hardcoded mock data in handler output',
  },
  {
    pattern: /your-tracking-domain\.com/,
    severity: 'high' as const,
    category: 'Placeholder URL',
    message: 'Placeholder domain that will not work in production',
  },
  {
    // Only flag example.com in non-schema/non-comment code that would execute
    pattern: /['"`]https?:\/\/example\.com/,
    severity: 'medium' as const,
    category: 'Placeholder URL',
    message: 'example.com URL — verify this is only used in examples/docs, not executed',
  },
]

const CONSOLE_LOG_PATTERN = [
  {
    pattern: /^\s*console\.(log|error|warn|debug)\s*\(/,
    severity: 'low' as const,
    category: 'Console.log',
    message: 'console.log used instead of logger (violates CLAUDE.md)',
  },
]

const EMPTY_HANDLER_PATTERNS = [
  {
    pattern: /return\s*\{\s*success:\s*true\s*[,}]/,
    severity: 'low' as const,
    category: 'Suspicious Return',
    message: 'Returns success:true — verify this actually does work (may be stub)',
  },
]

// ─── 1. Action Handler Audit ────────────────────────────────────────────────

describe('Action Handler Completeness', () => {
  const actionFiles = getAllTsFiles(SCAN_DIRS.actions)

  test('scan action handlers for stubs and incomplete implementations', () => {
    for (const file of actionFiles) {
      scanFile(file, STUB_PATTERNS)
    }
    // This test always passes — findings are reported in summary
  })

  test('scan action handlers for console.log violations', () => {
    for (const file of actionFiles) {
      scanFile(file, CONSOLE_LOG_PATTERN)
    }
  })
})

// ─── 2. Trigger Lifecycle Audit ─────────────────────────────────────────────

describe('Trigger Lifecycle Completeness', () => {
  const lifecycleFiles = getAllTsFiles(SCAN_DIRS.triggerProviders)

  test('scan trigger lifecycles for stubs', () => {
    for (const file of lifecycleFiles) {
      scanFile(file, STUB_PATTERNS)
    }
  })

  test('verify lifecycle providers have real implementations', () => {
    for (const file of lifecycleFiles) {
      const source = fs.readFileSync(file, 'utf-8')
      const name = path.basename(file, '.ts')

      // Check if the ENTIRE file has resource creation (not just the onActivate match)
      const hasResourceCreation = source.includes('fetch(') ||
        source.includes('.from(') ||
        source.includes('trigger_resources') ||
        source.includes('webhook_configs') ||
        source.includes('googleapis') ||
        source.includes('createSubscription') ||
        source.includes('createWebhook')

      if (!hasResourceCreation) {
        findings.push({
          file: relativePath(file),
          line: 0,
          severity: 'high',
          category: 'Empty Lifecycle',
          message: `${name} may not create any external resources or store trigger state`,
          snippet: 'No fetch(), database writes, or resource creation found in entire file',
        })
      }
    }
  })
})

// ─── 3. Polling Handler Audit ───────────────────────────────────────────────

describe('Polling Handler Completeness', () => {
  const pollerFiles = getAllTsFiles(SCAN_DIRS.triggerPollers)

  test('scan pollers for stubs', () => {
    for (const file of pollerFiles) {
      scanFile(file, STUB_PATTERNS)
    }
  })

  test('pollers make real API calls', () => {
    for (const file of pollerFiles) {
      const source = fs.readFileSync(file, 'utf-8')
      const name = path.basename(file, '.ts')

      const hasFetch = source.includes('fetch(') || source.includes('googleapis') ||
        source.includes('.get(') || source.includes('.post(')

      if (!hasFetch) {
        findings.push({
          file: relativePath(file),
          line: 0,
          severity: 'high',
          category: 'No API Call',
          message: `Poller ${name} may not make any real API calls`,
          snippet: 'No fetch(), googleapis, or HTTP calls found in polling handler',
        })
      }
    }
  })
})

// ─── 4. Webhook Route Audit ─────────────────────────────────────────────────

describe('Webhook Route Completeness', () => {
  test('scan webhook routes for stubs and console.log', () => {
    const webhookFiles = getAllTsFiles(SCAN_DIRS.webhookRoutes)
    for (const file of webhookFiles) {
      scanFile(file, [...STUB_PATTERNS, ...CONSOLE_LOG_PATTERN])
    }
  })

  test('webhook routes process events (not just return 200)', () => {
    const webhooksDir = SCAN_DIRS.webhookRoutes
    if (!fs.existsSync(webhooksDir)) return

    const providers = fs.readdirSync(webhooksDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)

    for (const provider of providers) {
      const routePath = path.join(webhooksDir, provider, 'route.ts')
      if (!fs.existsSync(routePath)) continue

      const source = fs.readFileSync(routePath, 'utf-8')

      // Should do something with the webhook data — not just return OK
      const hasProcessing = source.includes('processGoogleEvent') ||
        source.includes('triggerWorkflow') ||
        source.includes('/api/workflows/execute') ||
        source.includes('trigger_resources') ||
        source.includes('processWebhookEvent') ||
        source.includes('executeWorkflow') ||
        source.includes('webhook_events') ||
        source.includes('logWebhookEvent') ||
        source.includes('from(') ||
        source.includes('processSlackEvent') ||
        source.includes('processDiscordEvent') ||
        source.includes('processStripeEvent')

      if (!hasProcessing) {
        findings.push({
          file: relativePath(routePath),
          line: 0,
          severity: 'high',
          category: 'No Processing',
          message: `Webhook route for ${provider} may not process events — just returns OK`,
          snippet: 'No event processing, workflow triggering, or database writes found',
        })
      }
    }
  })
})

// ─── 5. executeNode Mock Output Audit ───────────────────────────────────────

describe('Mock Output Guard', () => {
  test('generateMockOutput is only used in sandbox/test mode', () => {
    const filePath = SCAN_DIRS.executeNode
    if (!fs.existsSync(filePath)) return

    const source = fs.readFileSync(filePath, 'utf-8')

    // Find all calls to generateMockOutput
    const callPattern = /generateMockOutput\s*\(/g
    let match
    const lines = source.split('\n')

    while ((match = callPattern.exec(source)) !== null) {
      const lineIndex = source.slice(0, match.index).split('\n').length
      // Check surrounding context for sandbox/test guard
      const context = lines.slice(Math.max(0, lineIndex - 10), lineIndex + 1).join('\n')

      if (!context.includes('sandbox') && !context.includes('testMode') && !context.includes('isSandbox')) {
        findings.push({
          file: relativePath(filePath),
          line: lineIndex,
          severity: 'critical',
          category: 'Mock in Production',
          message: 'generateMockOutput() called without sandbox/test mode guard',
          snippet: lines[lineIndex - 1]?.trim().slice(0, 120) || '',
        })
      }
    }
  })
})

// ─── 6. Schema → Handler Mismatch Audit ─────────────────────────────────────

describe('Schema-Handler Mismatches', () => {
  test('action nodes with configSchema but no handler have explanation', () => {
    // This cross-references node schemas with registry keys
    const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')
    const registryPath = path.join(ROOT, 'lib/workflows/actions/registry.ts')
    const registrySource = fs.readFileSync(registryPath, 'utf-8')

    const registryStart = registrySource.indexOf('export const actionHandlerRegistry')
    const registryBlock = registrySource.slice(registryStart)
    const registryKeys = new Set<string>()
    const keyPattern = /^\s+"([a-z][a-z0-9_:.-]+)":\s/gm
    let m
    while ((m = keyPattern.exec(registryBlock)) !== null) {
      registryKeys.add(m[1])
    }

    const SYSTEM_TYPES = new Set([
      'if_then_condition', 'switch_condition', 'path', 'router', 'filter',
      'path_condition', 'delay', 'loop', 'wait_for_time', 'wait_for_event',
      'hitl_conversation', 'http_request', 'custom_script', 'format_transformer',
      'file_upload', 'extract_website_data', 'tavily_search', 'parse_file',
      'ai_agent', 'ai_action_summarize', 'ai_action_extract',
      'ai_action_sentiment', 'ai_action_translate', 'ai_action_generate',
      'ai_action_classify',
    ])

    for (const node of ALL_NODE_COMPONENTS) {
      if (node.isTrigger || node.comingSoon || node.deprecated || node.isSystemNode) continue
      if (node.hideInActionSelection || SYSTEM_TYPES.has(node.type)) continue

      if (!registryKeys.has(node.type)) {
        findings.push({
          file: `lib/workflows/nodes/providers/${node.providerId || 'unknown'}/`,
          line: 0,
          severity: 'high',
          category: 'Missing Handler',
          message: `Action "${node.type}" (${node.title}) has schema but no handler in registry`,
          snippet: `Provider: ${node.providerId}, has ${(node.configSchema || []).length} config fields`,
        })
      }
    }
  })
})

// ─── FINAL REPORT ───────────────────────────────────────────────────────────

describe('AUDIT REPORT', () => {
  test('print findings sorted by severity', () => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    const sorted = [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of sorted) counts[f.severity]++

    console.log('\n' + '='.repeat(80))
    console.log('  IMPLEMENTATION COMPLETENESS AUDIT')
    console.log('='.repeat(80))
    console.log(`  Critical: ${counts.critical}  |  High: ${counts.high}  |  Medium: ${counts.medium}  |  Low: ${counts.low}`)
    console.log(`  Total findings: ${findings.length}`)
    console.log('-'.repeat(80))

    // Group by category
    const byCategory = new Map<string, Finding[]>()
    for (const f of sorted) {
      if (!byCategory.has(f.category)) byCategory.set(f.category, [])
      byCategory.get(f.category)!.push(f)
    }

    for (const [category, items] of byCategory) {
      console.log(`\n  [${category}] (${items.length} findings)`)
      for (const f of items) {
        const icon = f.severity === 'critical' ? 'X' : f.severity === 'high' ? '!' : f.severity === 'medium' ? '~' : '-'
        const lineStr = f.line > 0 ? `:${f.line}` : ''
        console.log(`    ${icon} [${f.severity.toUpperCase()}] ${f.file}${lineStr}`)
        console.log(`      ${f.message}`)
        if (f.snippet) console.log(`      > ${f.snippet}`)
      }
    }

    console.log('\n' + '='.repeat(80))

    // Print actionable summary
    const criticalAndHigh = sorted.filter(f => f.severity === 'critical' || f.severity === 'high')
    if (criticalAndHigh.length > 0) {
      console.log('\n  ACTION ITEMS (Critical + High):')
      for (const f of criticalAndHigh) {
        const lineStr = f.line > 0 ? `:${f.line}` : ''
        console.log(`    - [${f.severity.toUpperCase()}] ${f.file}${lineStr} — ${f.message}`)
      }
    }

    console.log('\n' + '='.repeat(80) + '\n')

    expect(true).toBe(true) // Always passes — this is a report
  })
})
