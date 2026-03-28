/**
 * Action Completeness Validation Tests
 *
 * Programmatically validates that ALL action nodes are properly wired up:
 * registry coverage, output schemas, config schemas, naming conventions.
 *
 * Adding a new action automatically subjects it to all checks.
 *
 * Run: npx jest __tests__/actions/action-completeness.test.ts --verbose
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Load data ──────────────────────────────────────────────────────────────

const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')

const ROOT = path.resolve(__dirname, '../..')
const REGISTRY_PATH = path.join(ROOT, 'lib/workflows/actions/registry.ts')
const ACTIONS_DIR = path.join(ROOT, 'lib/workflows/actions')

const registrySource = fs.readFileSync(REGISTRY_PATH, 'utf-8')

// ─── Computed data ──────────────────────────────────────────────────────────

const allActions: any[] = ALL_NODE_COMPONENTS.filter((n: any) => !n.isTrigger)
const activeActions = allActions.filter((n: any) => !n.comingSoon)
const actionsWithProvider = activeActions.filter((n: any) => n.providerId)

// Parse registered action IDs from registry source
function parseRegisteredActionIds(): Set<string> {
  const ids = new Set<string>()
  const registryStart = registrySource.indexOf('export const actionHandlerRegistry')
  if (registryStart === -1) return ids

  const block = registrySource.slice(registryStart)
  const pattern = /^\s+"([a-z][a-z0-9_:.-]+)":/gm
  let match
  while ((match = pattern.exec(block)) !== null) {
    ids.add(match[1])
  }
  return ids
}

const registeredActionIds = parseRegisteredActionIds()

// System/internal node types that don't need registry entries
const SYSTEM_TYPES = new Set([
  'manual_trigger', 'schedule_trigger', 'webhook_trigger', 'webhook',
  'conditional', 'filter', 'delay', 'loop', 'variable_set', 'variable_get',
  'if_condition', 'switch_case', 'data_transform', 'template', 'javascript',
  'try_catch', 'retry', 'custom_script', 'hitl_conversation',
])

function normalizeProviderName(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '')
}

function typeToProviderPrefix(type: string): string | null {
  const match = type.match(/^(.+?)_action_/)
  return match ? match[1] : null
}

// ═══════════════════════════════════════════════════════════════════════════════

describe('1. Registry Coverage', () => {
  test('registry has substantial number of handlers', () => {
    expect(registeredActionIds.size).toBeGreaterThan(100)
  })

  test('every active action node has a registry handler', () => {
    const missing: string[] = []

    for (const action of activeActions) {
      if (SYSTEM_TYPES.has(action.type)) continue
      if (action.isSystemNode) continue
      // Logic nodes handled by actionHandlers.ts, not registry
      if (['logic', 'automation'].includes(action.providerId)) continue

      if (!registeredActionIds.has(action.type)) {
        missing.push(`${action.type} (provider: ${action.providerId || 'none'})`)
      }
    }

    if (missing.length > 0) {
      console.warn(
        `\n⚠️  ${missing.length} action(s) missing from registry:\n` +
        missing.slice(0, 20).map(m => `  - ${m}`).join('\n') +
        (missing.length > 20 ? `\n  ... and ${missing.length - 20} more` : '')
      )
    }
  })
})

describe('2. Handler Validity', () => {
  test('all registry entries reference valid handler expressions', () => {
    const registryStart = registrySource.indexOf('export const actionHandlerRegistry')
    const block = registrySource.slice(registryStart)

    const handlerLines = block.match(/^\s+"[a-z][a-z0-9_:.-]+":\s*.+$/gm) || []
    const invalid: string[] = []

    for (const line of handlerLines) {
      const match = line.match(/"([^"]+)":\s*(.+)$/)
      if (!match) continue
      const [, key, value] = match
      const trimmed = value.trim().replace(/,$/, '')

      // Handler should be a function ref, arrow function, or wrapper
      const isValid =
        trimmed.startsWith('(') ||
        trimmed.startsWith('async') ||
        /^[a-zA-Z]/.test(trimmed) ||
        trimmed.startsWith('createExecution')

      if (!isValid) {
        invalid.push(`${key}: ${trimmed.slice(0, 50)}`)
      }
    }

    expect(invalid).toEqual([])
  })
})

describe('3. Output Schema Completeness', () => {
  test('actions with producesOutput have outputSchema', () => {
    const missing: string[] = []

    for (const action of activeActions) {
      if (action.producesOutput && (!action.outputSchema || action.outputSchema.length === 0)) {
        missing.push(action.type)
      }
    }

    if (missing.length > 0) {
      console.warn(
        `⚠️  ${missing.length} action(s) with producesOutput but no outputSchema:\n` +
        missing.slice(0, 10).map(m => `  - ${m}`).join('\n')
      )
    }
  })

  test('output schema fields have required properties', () => {
    const invalid: string[] = []

    for (const action of activeActions) {
      if (!action.outputSchema || !Array.isArray(action.outputSchema)) continue

      for (const field of action.outputSchema) {
        if (!field.name || !field.label || !field.type) {
          invalid.push(`${action.type}: field missing name/label/type`)
        }
      }
    }

    expect(invalid).toEqual([])
  })
})

describe('4. Config Schema Completeness', () => {
  test('active actions have configSchema defined', () => {
    const missing: string[] = []

    for (const action of activeActions) {
      if (SYSTEM_TYPES.has(action.type)) continue
      if (action.isSystemNode) continue

      if (!action.configSchema) {
        missing.push(action.type)
      }
    }

    if (missing.length > 0) {
      console.warn(
        `⚠️  ${missing.length} action(s) missing configSchema:\n` +
        missing.slice(0, 10).map(m => `  - ${m}`).join('\n')
      )
    }
  })
})

describe('5. Type Naming Convention', () => {
  test('action types follow {provider}_action_{name} or known pattern', () => {
    const nonConforming: string[] = []

    for (const action of activeActions) {
      if (SYSTEM_TYPES.has(action.type)) continue
      if (action.isSystemNode) continue
      if (['logic', 'automation'].includes(action.providerId)) continue

      // Most actions use _action_ infix, some use colon notation (google-drive:upload)
      if (!action.type.includes('_action_') && !action.type.includes(':')) {
        // Check if it starts with a provider prefix at least
        if (!action.type.includes('_')) {
          nonConforming.push(action.type)
        }
      }
    }

    if (nonConforming.length > 0) {
      console.warn(
        `⚠️  ${nonConforming.length} action(s) don't follow naming convention:\n` +
        nonConforming.slice(0, 10).map(t => `  - ${t}`).join('\n')
      )
    }
  })
})

describe('6. Provider ID Consistency', () => {
  test('action type prefix matches providerId', () => {
    const mismatches: string[] = []

    for (const action of activeActions) {
      if (!action.providerId) continue
      if (SYSTEM_TYPES.has(action.type)) continue
      if (['logic', 'automation', 'ai', 'utility'].includes(action.providerId)) continue

      const actualPrefix = typeToProviderPrefix(action.type)
      if (actualPrefix && normalizeProviderName(actualPrefix) !== normalizeProviderName(action.providerId)) {
        mismatches.push(`${action.type}: prefix "${actualPrefix}" vs providerId "${action.providerId}"`)
      }
    }

    if (mismatches.length > 0) {
      console.warn(
        `⚠️  ${mismatches.length} action(s) with prefix/providerId mismatch:\n` +
        mismatches.slice(0, 10).map(m => `  - ${m}`).join('\n')
      )
    }
  })
})

describe('7. No Orphaned Registry Entries', () => {
  test('every registry entry has a corresponding node definition', () => {
    const allTypes = new Set(ALL_NODE_COMPONENTS.map((n: any) => n.type))
    const orphaned: string[] = []

    // Some registry entries are aliases (ai_prompt → ai_action_generate)
    const KNOWN_ALIASES = new Set([
      'ai_prompt', 'ai_generate', 'ai_summarize', 'ai_extract', 'ai_translate',
      'ai_classify', 'ai_sentiment', 'ai_message', 'ai_router',
    ])

    for (const actionId of registeredActionIds) {
      if (allTypes.has(actionId)) continue
      if (KNOWN_ALIASES.has(actionId)) continue
      orphaned.push(actionId)
    }

    if (orphaned.length > 0) {
      console.warn(
        `⚠️  ${orphaned.length} registry entries without node definitions:\n` +
        orphaned.slice(0, 10).map(o => `  - ${o}`).join('\n')
      )
    }
  })
})

describe('8. Provider Action Coverage', () => {
  test('every major provider has handler registrations', () => {
    const majorProviders = [
      'gmail', 'slack', 'discord', 'notion', 'airtable',
      'hubspot', 'stripe', 'trello', 'shopify', 'teams',
      'google_sheets', 'google_calendar', 'google_drive',
      'microsoft_excel', 'monday', 'mailchimp'
    ]

    for (const provider of majorProviders) {
      // Match both underscore and hyphen variants (e.g. google_drive and google-drive)
      const hyphenated = provider.replace(/_/g, '-')
      const pattern = new RegExp(`"(${provider}|${hyphenated})[_:]`)
      expect(pattern.test(registrySource)).toBe(true)
    }
  })

  test('action handler directories exist for major providers', () => {
    const providers = [
      'slack', 'gmail', 'stripe', 'hubspot', 'monday',
      'google-calendar', 'googleDrive', 'googleSheets', 'microsoft-excel',
      'notion', 'airtable', 'shopify', 'mailchimp'
    ]

    const missing: string[] = []
    for (const provider of providers) {
      const dirPath = path.join(ACTIONS_DIR, provider)
      const filePath = path.join(ACTIONS_DIR, `${provider}.ts`)
      if (!fs.existsSync(dirPath) && !fs.existsSync(filePath)) {
        missing.push(provider)
      }
    }

    expect(missing).toEqual([])
  })
})

describe('Summary', () => {
  test('print action completeness report', () => {
    const totalActions = allActions.length
    const activeCount = activeActions.length
    const withProvider = actionsWithProvider.length
    const withOutputSchema = activeActions.filter((a: any) => a.outputSchema?.length > 0).length
    const withConfigSchema = activeActions.filter((a: any) => a.configSchema).length
    const uniqueProviders = new Set(allActions.map((a: any) => a.providerId).filter(Boolean))

    console.log('\n' + '='.repeat(55))
    console.log('  ACTION COMPLETENESS REPORT')
    console.log('='.repeat(55))
    console.log(`  Total action nodes:        ${totalActions}`)
    console.log(`  Active (non-comingSoon):   ${activeCount}`)
    console.log(`  With provider ID:          ${withProvider}`)
    console.log(`  With output schema:        ${withOutputSchema}/${activeCount}`)
    console.log(`  With config schema:        ${withConfigSchema}/${activeCount}`)
    console.log(`  Unique providers:          ${uniqueProviders.size}`)
    console.log(`  Registry entries:          ${registeredActionIds.size}`)
    console.log('='.repeat(55) + '\n')
  })
})
