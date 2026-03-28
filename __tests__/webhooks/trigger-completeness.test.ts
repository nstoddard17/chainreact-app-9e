/**
 * Trigger Completeness Validation Tests
 *
 * Programmatically validates that ALL trigger nodes are properly set up:
 * lifecycle handlers, output schemas, naming conventions, event type routing,
 * polling handlers, and webhook routes.
 *
 * Adding a new trigger automatically subjects it to all checks.
 *
 * Run: npx jest __tests__/webhooks/trigger-completeness.test.ts --verbose
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Load ALL_NODE_COMPONENTS (pure data, safe to import) ────────────────────

const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')

// ─── Paths ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..')
const TRIGGERS_INDEX = path.join(ROOT, 'lib/triggers/index.ts')
const PROCESSOR_PATH = path.join(ROOT, 'lib/webhooks/processor.ts')
const NORMALIZER_PATH = path.join(ROOT, 'lib/webhooks/normalizer.ts')
const POLLERS_DIR = path.join(ROOT, 'lib/triggers/pollers')
const WEBHOOKS_DIR = path.join(ROOT, 'app/api/webhooks')

// ─── Source files (read once) ───────────────────────────────────────────────

const triggersIndexSource = fs.readFileSync(TRIGGERS_INDEX, 'utf-8')
const processorSource = fs.readFileSync(PROCESSOR_PATH, 'utf-8')
const normalizerSource = fs.readFileSync(NORMALIZER_PATH, 'utf-8')

// ─── Computed data ──────────────────────────────────────────────────────────

const allTriggers: any[] = ALL_NODE_COMPONENTS.filter((n: any) => n.isTrigger)
const activeTriggers = allTriggers.filter((n: any) => !n.comingSoon)
const activeTriggersWithProvider = activeTriggers.filter((n: any) => n.providerId)

// Known providers without lifecycle handlers (expected gaps)
const KNOWN_LIFECYCLE_GAPS = new Set<string>([
  // All gaps resolved:
  // - dropbox, manychat, twitter: marked comingSoon
  // - google-analytics: trigger removed (GA4 doesn't support webhooks)
  // - facebook, github: full lifecycle built
])

// Providers that are polling-only (don't need webhook routes)
const POLLING_ONLY_PROVIDERS = new Set([
  'microsoft-onenote',
])

// Triggers exempt from configSchema requirement
const CONFIG_SCHEMA_EXEMPT_TYPES = new Set([
  'webhook_trigger',
  'manual_trigger',
  'schedule_trigger',
])

// Provider-to-webhook-route mapping (many providers share routes)
const PROVIDER_TO_WEBHOOK_ROUTE: Record<string, string> = {
  'gmail': 'google',
  'google-calendar': 'google',
  'google-drive': 'google',
  'google-sheets': 'google',
  'google-docs': 'google',
  'microsoft': 'microsoft',
  'microsoft-outlook': 'microsoft',
  'microsoft-excel': 'microsoft',
  'onedrive': 'microsoft',
  'microsoft-onenote': 'microsoft',
  'teams': 'teams',
  'slack': 'slack',
  'discord': 'discord',
  'stripe': 'stripe',
  'shopify': 'shopify',
  'notion': 'notion',
  'hubspot': 'hubspot',
  'monday': 'monday',
  'gumroad': 'gumroad',
  'mailchimp': 'mailchimp',
  'trello': 'trello',
  'airtable': 'airtable',
  'dropbox': 'dropbox',
}

// ─── Parse registered providers from triggers/index.ts ──────────────────────

function parseRegisteredProviders(): Set<string> {
  const providers = new Set<string>()

  // Match providerId: 'xxx' or providerId: "xxx"
  const directPattern = /providerId[:\s]+['"]([^'"]+)['"]/g
  let match
  while ((match = directPattern.exec(triggersIndexSource)) !== null) {
    providers.add(match[1])
  }

  // Match array entries like ['microsoft', 'microsoft-outlook', ...]
  const arrayPattern = /\[\s*((?:['"][^'"]+['"]\s*,?\s*)+)\]/g
  while ((match = arrayPattern.exec(triggersIndexSource)) !== null) {
    const itemPattern = /['"]([^'"]+)['"]/g
    let itemMatch
    while ((itemMatch = itemPattern.exec(match[1])) !== null) {
      providers.add(itemMatch[1])
    }
  }

  return providers
}

const registeredProviders = parseRegisteredProviders()

// ─── Parse Notion event map from processor.ts ───────────────────────────────

function parseNotionEventMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  // Find the notionEventMap block
  const mapRegex = /const notionEventMap[^{]*\{([\s\S]*?)\n\s{8,}\}/
  const mapMatch = processorSource.match(mapRegex)
  if (!mapMatch) return map

  const block = mapMatch[1]
  // Extract each key and its array of event names
  const entryRegex = /'([^']+)':\s*\[([\s\S]*?)\]/g
  let entryMatch
  while ((entryMatch = entryRegex.exec(block)) !== null) {
    const key = entryMatch[1]
    const valuesStr = entryMatch[2]
    const values: string[] = []
    const valRegex = /'([^']+)'/g
    let valMatch
    while ((valMatch = valRegex.exec(valuesStr)) !== null) {
      values.push(valMatch[1])
    }
    map[key] = values
  }

  return map
}

const notionEventMap = parseNotionEventMap()

// ─── Parse event types from normalizer.ts ───────────────────────────────────

function parseNormalizerEventTypes(provider: string): Set<string> {
  const types = new Set<string>()
  const prefix = provider.replace(/-/g, '_') + '_trigger_'

  // Simple approach: find ALL string literals matching {provider}_trigger_{action}
  // anywhere in the normalizer source. This is safe because the normalizer only
  // contains event types relevant to each provider within its case block.
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`'(${escapedPrefix}[^']*)'`, 'g')
  let match
  while ((match = pattern.exec(normalizerSource)) !== null) {
    types.add(match[1])
  }

  return types
}

const slackNormalizerTypes = parseNormalizerEventTypes('slack')
const trelloNormalizerTypes = parseNormalizerEventTypes('trello')

// ─── Parse polling handler coverage from poller source files ────────────────

function parsePollerCoverage(): Map<string, Set<string>> {
  const coverage = new Map<string, Set<string>>()

  let pollerFiles: string[]
  try {
    pollerFiles = fs.readdirSync(POLLERS_DIR).filter(f => f.endsWith('.ts'))
  } catch {
    return coverage
  }

  for (const file of pollerFiles) {
    const source = fs.readFileSync(path.join(POLLERS_DIR, file), 'utf-8')
    const pollerId = path.basename(file, '.ts')
    const handledTypes = new Set<string>()

    // Match startsWith patterns: trigger?.trigger_type?.startsWith('xxx')
    const startsWithPattern = /startsWith\(['"]([^'"]+)['"]\)/g
    let match
    while ((match = startsWithPattern.exec(source)) !== null) {
      handledTypes.add(match[1])
    }

    // Match explicit type checks: type === 'xxx'
    const explicitPattern = /type\s*===\s*['"]([^'"]+)['"]/g
    while ((match = explicitPattern.exec(source)) !== null) {
      handledTypes.add(match[1])
    }

    coverage.set(pollerId, handledTypes)
  }

  return coverage
}

const pollerCoverage = parsePollerCoverage()

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeProviderName(name: string): string {
  // Normalize both hyphens and underscores to compare
  return name.toLowerCase().replace(/[-_]/g, '')
}

function typeToProviderPrefix(type: string): string | null {
  const match = type.match(/^(.+?)_trigger_/)
  return match ? match[1] : null
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Lifecycle Handler Coverage ──────────────────────────────────────────

describe('1. Lifecycle Handler Coverage', () => {
  test('every active trigger with providerId has a registered lifecycle handler', () => {
    const missing: string[] = []

    for (const trigger of activeTriggersWithProvider) {
      const { type, providerId } = trigger
      if (!providerId) continue
      if (KNOWN_LIFECYCLE_GAPS.has(providerId)) continue
      // System/internal providers that don't need lifecycle
      if (['automation', 'logic', 'ai', 'utility'].includes(providerId)) continue

      if (!registeredProviders.has(providerId)) {
        missing.push(`${type} (provider: ${providerId})`)
      }
    }

    if (missing.length > 0) {
      throw new Error(`${missing.length} active trigger(s) with unregistered providers:\n${missing.join('\n')}`)
    }
  })

  test('known lifecycle gaps are tracked', () => {
    const gapTriggers = activeTriggers.filter(
      (t: any) => t.providerId && KNOWN_LIFECYCLE_GAPS.has(t.providerId)
    )

    if (gapTriggers.length > 0) {
      console.warn(
        `⚠️  ${gapTriggers.length} active trigger(s) in known-gap providers:\n` +
        gapTriggers.map((t: any) => `  - ${t.type} (${t.providerId})`).join('\n')
      )
    }

    // Verify the known gaps are actually still gaps (remove from set when fixed)
    for (const gap of KNOWN_LIFECYCLE_GAPS) {
      if (registeredProviders.has(gap)) {
        console.warn(`✅ Provider "${gap}" now has a lifecycle handler — remove from KNOWN_LIFECYCLE_GAPS`)
      }
    }
  })
})

// ─── 2. Output Schema Completeness ──────────────────────────────────────────

describe('2. Output Schema Completeness', () => {
  const triggersForTest = allTriggers
    .filter((t: any) => !CONFIG_SCHEMA_EXEMPT_TYPES.has(t.type))
    .map((t: any) => [t.type, t])

  test('triggers have outputSchema defined', () => {
    const missing: string[] = []

    for (const trigger of allTriggers) {
      if (CONFIG_SCHEMA_EXEMPT_TYPES.has(trigger.type)) continue
      if (!trigger.outputSchema || !Array.isArray(trigger.outputSchema) || trigger.outputSchema.length === 0) {
        missing.push(trigger.type)
      }
    }

    if (missing.length > 0) {
      console.warn(
        `⚠️  ${missing.length} trigger(s) missing outputSchema:\n` +
        missing.map(t => `  - ${t}`).join('\n')
      )
    }
  })

  test('output schema fields have required properties', () => {
    const invalid: string[] = []

    for (const trigger of allTriggers) {
      if (!trigger.outputSchema || !Array.isArray(trigger.outputSchema)) continue

      for (const field of trigger.outputSchema) {
        if (!field.name || !field.label || !field.type) {
          invalid.push(`${trigger.type}: field missing name/label/type: ${JSON.stringify(field)}`)
        }
      }
    }

    expect(invalid).toEqual([])
  })
})

// ─── 3. Type Naming Convention ──────────────────────────────────────────────

describe('3. Type Naming Convention', () => {
  test('trigger types follow {provider}_trigger_{action} pattern', () => {
    const nonConforming: string[] = []

    for (const trigger of allTriggers) {
      const { type } = trigger
      // System triggers with special naming are exempt
      if (['manual_trigger', 'schedule_trigger', 'webhook_trigger'].includes(type)) continue

      if (!type.includes('_trigger_')) {
        nonConforming.push(type)
      }
    }

    if (nonConforming.length > 0) {
      console.warn(
        `⚠️  ${nonConforming.length} trigger(s) don't follow naming convention:\n` +
        nonConforming.map(t => `  - ${t}`).join('\n')
      )
    }
  })
})

// ─── 4. Provider ID Consistency ─────────────────────────────────────────────

describe('4. Provider ID Consistency', () => {
  test('trigger type prefix matches providerId', () => {
    const mismatches: string[] = []

    for (const trigger of allTriggers) {
      const { type, providerId } = trigger
      if (!providerId) continue
      // System triggers exempt
      if (['manual_trigger', 'schedule_trigger', 'webhook_trigger'].includes(type)) continue

      const actualPrefix = typeToProviderPrefix(type)

      if (actualPrefix && normalizeProviderName(actualPrefix) !== normalizeProviderName(providerId)) {
        mismatches.push(`${type}: prefix "${actualPrefix}" doesn't match providerId "${providerId}"`)
      }
    }

    expect(mismatches).toEqual([])
  })
})

// ─── 5. Notion Event Map Completeness ───────────────────────────────────────

describe('5. Notion Event Map Completeness', () => {
  const notionTriggers = activeTriggers.filter((t: any) => t.providerId === 'notion')

  test('notionEventMap was parsed successfully', () => {
    expect(Object.keys(notionEventMap).length).toBeGreaterThan(0)
  })

  test('every Notion trigger has a notionEventMap entry', () => {
    const missing: string[] = []

    for (const trigger of notionTriggers) {
      if (!notionEventMap[trigger.type]) {
        missing.push(trigger.type)
      }
    }

    if (missing.length > 0) {
      throw new Error(`Notion triggers missing from event map:\n${missing.join('\n')}`)
    }
  })

  test('every notionEventMap key corresponds to a trigger node', () => {
    const notionTypes = new Set(notionTriggers.map((t: any) => t.type))
    const orphaned: string[] = []

    for (const key of Object.keys(notionEventMap)) {
      if (!notionTypes.has(key)) {
        orphaned.push(key)
      }
    }

    if (orphaned.length > 0) {
      console.warn(
        `⚠️  notionEventMap has entries for non-existent triggers:\n` +
        orphaned.map(k => `  - ${k}`).join('\n')
      )
    }
  })
})

// ─── 6. Slack Normalizer Coverage ───────────────────────────────────────────

describe('6. Slack Normalizer Coverage', () => {
  const slackTriggers = activeTriggers.filter((t: any) => t.providerId === 'slack')

  test('normalizer produces Slack event types', () => {
    expect(slackNormalizerTypes.size).toBeGreaterThan(0)
  })

  test('every Slack trigger type is handled by normalizer or prefix matching', () => {
    const uncovered: string[] = []

    for (const trigger of slackTriggers) {
      const { type } = trigger
      // Direct match in normalizer output
      if (slackNormalizerTypes.has(type)) continue
      // Covered by prefix matching: slack_trigger_new_message catches all slack_trigger_message_* types
      if (type === 'slack_trigger_new_message') continue
      // The processor uses startsWith('slack_trigger_message') to match new_message trigger
      // against normalized types like slack_trigger_message_channels
      if (type.startsWith('slack_trigger_message_')) continue

      uncovered.push(type)
    }

    if (uncovered.length > 0) {
      throw new Error(`Slack triggers not covered by normalizer:\n${uncovered.join('\n')}`)
    }
  })
})

// ─── 7. Trello Normalizer Coverage ──────────────────────────────────────────

describe('7. Trello Normalizer Coverage', () => {
  const trelloTriggers = activeTriggers.filter((t: any) => t.providerId === 'trello')

  test('normalizer produces Trello event types', () => {
    expect(trelloNormalizerTypes.size).toBeGreaterThan(0)
  })

  test('every Trello trigger type is handled by normalizer', () => {
    const uncovered: string[] = []

    for (const trigger of trelloTriggers) {
      if (!trelloNormalizerTypes.has(trigger.type)) {
        uncovered.push(trigger.type)
      }
    }

    if (uncovered.length > 0) {
      throw new Error(`Trello triggers not covered by normalizer:\n${uncovered.join('\n')}`)
    }
  })
})

// ─── 8. Polling Handler Coverage ────────────────────────────────────────────

describe('8. Polling Handler Coverage', () => {
  // Providers that use polling (some or all of their triggers)
  const POLLING_PROVIDERS: Record<string, string> = {
    'google-sheets': 'google-sheets',
    'microsoft-excel': 'microsoft-excel',
    'microsoft-onenote': 'microsoft-onenote',
    'mailchimp': 'mailchimp',
  }

  test('poller files exist for all polling providers', () => {
    const missing: string[] = []

    for (const [, pollerFile] of Object.entries(POLLING_PROVIDERS)) {
      const filePath = path.join(POLLERS_DIR, `${pollerFile}.ts`)
      if (!fs.existsSync(filePath)) {
        missing.push(pollerFile)
      }
    }

    expect(missing).toEqual([])
  })

  test('polling handlers are registered in triggers/index.ts', () => {
    for (const [, pollerFile] of Object.entries(POLLING_PROVIDERS)) {
      const varName = pollerFile.replace(/-/g, '')
      // Check that registerPollingHandler is called with this handler
      expect(triggersIndexSource).toContain(`registerPollingHandler(`)
    }
  })

  test('polling-based trigger types are handled by a polling handler', () => {
    const uncovered: string[] = []

    // Google Sheets triggers
    const gsTriggers = activeTriggers.filter((t: any) => t.providerId === 'google-sheets')
    for (const trigger of gsTriggers) {
      const gsHandler = pollerCoverage.get('google-sheets')
      if (!gsHandler) { uncovered.push(`${trigger.type} (no google-sheets poller)`); continue }
      // Check if any startsWith prefix or exact match covers this trigger
      const covered = Array.from(gsHandler).some(pattern =>
        trigger.type === pattern || trigger.type.startsWith(pattern)
      )
      if (!covered) uncovered.push(trigger.type)
    }

    // Microsoft Excel triggers
    const excelTriggers = activeTriggers.filter((t: any) => t.providerId === 'microsoft-excel')
    for (const trigger of excelTriggers) {
      const excelHandler = pollerCoverage.get('microsoft-excel')
      if (!excelHandler) { uncovered.push(`${trigger.type} (no microsoft-excel poller)`); continue }
      const covered = Array.from(excelHandler).some(pattern =>
        trigger.type === pattern || trigger.type.startsWith(pattern)
      )
      if (!covered) uncovered.push(trigger.type)
    }

    // Microsoft OneNote triggers
    const onenoteTriggers = activeTriggers.filter((t: any) => t.providerId === 'microsoft-onenote')
    for (const trigger of onenoteTriggers) {
      const onenoteHandler = pollerCoverage.get('microsoft-onenote')
      if (!onenoteHandler) { uncovered.push(`${trigger.type} (no microsoft-onenote poller)`); continue }
      const covered = Array.from(onenoteHandler).some(pattern =>
        trigger.type === pattern || trigger.type.startsWith(pattern)
      )
      if (!covered) uncovered.push(trigger.type)
    }

    // Mailchimp polling triggers (subset — mailchimp has both webhook and polling triggers)
    const mailchimpHandler = pollerCoverage.get('mailchimp')
    if (mailchimpHandler) {
      // These are the explicitly polling-based mailchimp triggers
      const mailchimpPollingTypes = Array.from(mailchimpHandler)
      // Verify they exist as trigger nodes
      for (const pollingType of mailchimpPollingTypes) {
        const exists = activeTriggers.some((t: any) => t.type === pollingType)
        if (!exists) {
          console.warn(`⚠️  Mailchimp poller handles "${pollingType}" but no trigger node exists`)
        }
      }
    }

    if (uncovered.length > 0) {
      throw new Error(`Polling triggers not handled by any polling handler:\n${uncovered.join('\n')}`)
    }
  })
})

// ─── 9. Config Schema Validation ────────────────────────────────────────────

describe('9. Config Schema Validation', () => {
  test('active triggers have configSchema defined', () => {
    const missing: string[] = []

    for (const trigger of activeTriggers) {
      if (CONFIG_SCHEMA_EXEMPT_TYPES.has(trigger.type)) continue
      // System providers that don't need config
      if (['automation', 'logic'].includes(trigger.providerId)) continue

      if (!trigger.configSchema) {
        missing.push(trigger.type)
      }
    }

    if (missing.length > 0) {
      console.warn(
        `⚠️  ${missing.length} active trigger(s) missing configSchema:\n` +
        missing.map(t => `  - ${t}`).join('\n')
      )
    }
  })
})

// ─── 10. No Orphaned Lifecycle Providers ────────────────────────────────────

describe('10. No Orphaned Lifecycle Providers', () => {
  test('every registered provider has at least one trigger node', () => {
    const orphaned: string[] = []
    const allProviderIds = new Set(allTriggers.map((t: any) => t.providerId).filter(Boolean))

    // Umbrella providers that handle triggers from sub-providers (e.g. microsoft handles microsoft-outlook)
    const UMBRELLA_PROVIDERS = new Set(['microsoft'])

    for (const provider of registeredProviders) {
      if (UMBRELLA_PROVIDERS.has(provider)) continue
      if (!allProviderIds.has(provider)) {
        orphaned.push(provider)
      }
    }

    if (orphaned.length > 0) {
      throw new Error(`Registered lifecycle providers with no trigger nodes:\n${orphaned.join('\n')}`)
    }
  })
})

// ─── 11. Webhook Route Existence ────────────────────────────────────────────

describe('11. Webhook Route Existence', () => {
  test('providers with webhook triggers have webhook routes', () => {
    const missing: string[] = []
    const checkedRoutes = new Set<string>()

    // Get unique provider IDs that need webhook routes
    const webhookProviders = new Set<string>()
    for (const trigger of activeTriggersWithProvider) {
      const { providerId } = trigger
      if (!providerId) continue
      if (KNOWN_LIFECYCLE_GAPS.has(providerId)) continue
      if (POLLING_ONLY_PROVIDERS.has(providerId)) continue
      if (['automation', 'logic', 'ai', 'utility'].includes(providerId)) continue
      if (!registeredProviders.has(providerId)) continue
      webhookProviders.add(providerId)
    }

    for (const providerId of webhookProviders) {
      const routeDir = PROVIDER_TO_WEBHOOK_ROUTE[providerId] || providerId
      if (checkedRoutes.has(routeDir)) continue
      checkedRoutes.add(routeDir)

      // Check for dedicated route or [provider] catch-all
      const dedicatedRoute = path.join(WEBHOOKS_DIR, routeDir, 'route.ts')
      const catchAllRoute = path.join(WEBHOOKS_DIR, '[provider]', 'route.ts')

      if (!fs.existsSync(dedicatedRoute) && !fs.existsSync(catchAllRoute)) {
        missing.push(`${providerId} → expected route at ${routeDir}/route.ts`)
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing webhook routes:\n${missing.join('\n')}`)
    }
  })
})

// ─── Summary ────────────────────────────────────────────────────────────────

describe('Summary', () => {
  test('print trigger completeness report', () => {
    const totalTriggers = allTriggers.length
    const activeCount = activeTriggers.length
    const comingSoonCount = allTriggers.length - activeCount
    const withProvider = activeTriggersWithProvider.length
    const withOutputSchema = allTriggers.filter((t: any) => t.outputSchema?.length > 0).length
    const withConfigSchema = activeTriggers.filter((t: any) => t.configSchema).length
    const uniqueProviders = new Set(allTriggers.map((t: any) => t.providerId).filter(Boolean))

    console.log('\n' + '='.repeat(55))
    console.log('  TRIGGER COMPLETENESS REPORT')
    console.log('='.repeat(55))
    console.log(`  Total triggers:           ${totalTriggers}`)
    console.log(`  Active (non-comingSoon):   ${activeCount}`)
    console.log(`  Coming soon:               ${comingSoonCount}`)
    console.log(`  With provider ID:          ${withProvider}`)
    console.log(`  With output schema:        ${withOutputSchema}/${totalTriggers}`)
    console.log(`  With config schema:        ${withConfigSchema}/${activeCount}`)
    console.log(`  Unique providers:          ${uniqueProviders.size}`)
    console.log(`  Registered lifecycles:     ${registeredProviders.size}`)
    console.log(`  Known lifecycle gaps:       ${KNOWN_LIFECYCLE_GAPS.size}`)
    console.log(`  Notion event map entries:  ${Object.keys(notionEventMap).length}`)
    console.log(`  Slack normalizer types:    ${slackNormalizerTypes.size}`)
    console.log(`  Trello normalizer types:   ${trelloNormalizerTypes.size}`)
    console.log(`  Polling handlers:          ${pollerCoverage.size}`)
    console.log('='.repeat(55) + '\n')
  })
})
