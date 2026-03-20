/**
 * Automated Validation Suite for Actions & Triggers
 *
 * Validates that all node schemas, action handlers, and trigger lifecycles
 * are correctly wired together. No network calls or credentials needed.
 *
 * This test imports ONLY the node schemas (which are pure data objects with
 * no server-side dependencies) and statically reads the registry file to
 * extract handler keys — avoiding the heavy import chain.
 *
 * Run: npm run test:validate
 */

import * as fs from 'fs'
import * as path from 'path'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import type { NodeComponent } from '@/lib/workflows/nodes/types'

// ─── Static Registry Key Extraction ─────────────────────────────────────────
// Read the registry file as text and extract all quoted keys from
// actionHandlerRegistry to avoid importing the entire server dependency chain.

const registryPath = path.resolve(__dirname, '../../../lib/workflows/actions/registry.ts')
const registrySource = fs.readFileSync(registryPath, 'utf-8')

function extractRegistryKeys(source: string): Set<string> {
  const keys = new Set<string>()
  // Match lines like:  "some_action_key": or 'some_action_key':
  // Only within the actionHandlerRegistry object (after its declaration)
  const registryStart = source.indexOf('export const actionHandlerRegistry')
  if (registryStart === -1) throw new Error('Could not find actionHandlerRegistry in registry.ts')

  const registryBlock = source.slice(registryStart)
  const keyPattern = /^\s+"([^"]+)":\s/gm
  let match
  while ((match = keyPattern.exec(registryBlock)) !== null) {
    keys.add(match[1])
  }
  return keys
}

const registryKeys = extractRegistryKeys(registrySource)

// ─── Static Trigger Lifecycle Extraction ────────────────────────────────────

const triggerIndexPath = path.resolve(__dirname, '../../../lib/triggers/index.ts')
const triggerIndexSource = fs.readFileSync(triggerIndexPath, 'utf-8')

function extractLifecycleProviders(source: string): Set<string> {
  const providers = new Set<string>()
  // Match providerId strings in registerProvider calls
  const pattern = /providerId[:\s]+['"]([^'"]+)['"]/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    providers.add(match[1])
  }
  // Also match array literals like ['microsoft', 'microsoft-outlook', ...]
  const arrayPattern = /\[\s*((?:'[^']+'\s*,?\s*)+)\]/g
  while ((match = arrayPattern.exec(source)) !== null) {
    const items = match[1].match(/'([^']+)'/g)
    if (items) {
      for (const item of items) {
        providers.add(item.replace(/'/g, ''))
      }
    }
  }
  return providers
}

const lifecycleProviders = extractLifecycleProviders(triggerIndexSource)

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Node types that are system/logic nodes and don't need standard action handlers */
const SYSTEM_NODE_TYPES = new Set([
  'if_then_condition', 'switch_condition', 'path', 'router', 'filter',
  'path_condition', 'delay', 'loop', 'wait_for_time', 'wait_for_event',
  'hitl_conversation',
  'http_request', 'custom_script', 'format_transformer',
  'file_upload', 'extract_website_data', 'tavily_search', 'parse_file',
  'ai_agent', 'ai_action_summarize', 'ai_action_extract',
  'ai_action_sentiment', 'ai_action_translate', 'ai_action_generate',
  'ai_action_classify',
])

// ─── Categorize nodes ───────────────────────────────────────────────────────

const allActions: NodeComponent[] = []
const allTriggers: NodeComponent[] = []

for (const node of ALL_NODE_COMPONENTS) {
  if (node.isTrigger) {
    allTriggers.push(node)
  } else {
    allActions.push(node)
  }
}

// ─── 1. Schema Integrity ────────────────────────────────────────────────────

describe('Schema Integrity', () => {
  test('every node has required base fields', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.type) failures.push(`Node missing "type": ${JSON.stringify(node).slice(0, 80)}`)
      if (!node.title) failures.push(`${node.type}: missing "title"`)
      if (!node.description) failures.push(`${node.type}: missing "description"`)
      if (typeof node.isTrigger !== 'boolean') failures.push(`${node.type}: missing "isTrigger"`)
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} schema issues:\n${failures.join('\n')}`)
    }
  })

  test('no duplicate node types', () => {
    const seen = new Map<string, number>()
    for (const node of ALL_NODE_COMPONENTS) {
      seen.set(node.type, (seen.get(node.type) || 0) + 1)
    }
    const dupes = [...seen.entries()].filter(([, count]) => count > 1)
    if (dupes.length > 0) {
      throw new Error(`Duplicate node types found:\n${dupes.map(([type, count]) => `  ${type} (×${count})`).join('\n')}`)
    }
  })

  test('configSchema fields have name, label, and type', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.configSchema) continue
      for (let i = 0; i < node.configSchema.length; i++) {
        const field = node.configSchema[i]
        if (!field.name) failures.push(`${node.type}: configSchema[${i}] missing "name"`)
        if (!field.label) failures.push(`${node.type}: configSchema[${i}] (${field.name || '?'}) missing "label"`)
        if (!field.type) failures.push(`${node.type}: configSchema[${i}] (${field.name || '?'}) missing "type"`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} field issues:\n${failures.join('\n')}`)
    }
  })

  test('configSchema field names are unique within each node', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.configSchema || node.configSchema.length === 0) continue
      const names = new Set<string>()
      for (const field of node.configSchema) {
        if (!field.name) continue
        if (names.has(field.name)) {
          failures.push(`${node.type}: duplicate field name "${field.name}"`)
        }
        names.add(field.name)
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} duplicate field names:\n${failures.join('\n')}`)
    }
  })

  test('dependsOn references existing field names', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.configSchema) continue
      const fieldNames = new Set(node.configSchema.map(f => f.name).filter(Boolean))

      for (const field of node.configSchema) {
        if (field.dependsOn && !fieldNames.has(field.dependsOn)) {
          failures.push(`${node.type}: field "${field.name}" dependsOn "${field.dependsOn}" which doesn't exist`)
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} broken dependsOn references:\n${failures.join('\n')}`)
    }
  })

  test('required fields are not permanently hidden', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.configSchema) continue
      for (const field of node.configSchema) {
        // readonly+hidden fields are programmatically populated storage fields, not user-facing
        if (field.required && field.hidden === true && !field.readonly && !field.dependsOn && !field.showWhen && !field.showIf && !field.conditional) {
          failures.push(`${node.type}: field "${field.name}" is required but permanently hidden`)
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} unreachable required fields:\n${failures.join('\n')}`)
    }
  })
})

// ─── 2. Action Handler Registration ─────────────────────────────────────────

describe('Action Handler Registration', () => {
  test('every action node has a handler in the registry', () => {
    const missing: string[] = []

    for (const node of allActions) {
      if (node.comingSoon || node.deprecated) continue
      if (node.isSystemNode) continue
      if (SYSTEM_NODE_TYPES.has(node.type)) continue
      if (node.hideInActionSelection) continue

      if (!registryKeys.has(node.type)) {
        missing.push(`${node.type} (${node.title}) — provider: ${node.providerId || 'none'}`)
      }
    }

    if (missing.length > 0) {
      console.warn(`\n⚠️  ${missing.length} action node(s) WITHOUT handler:\n${missing.join('\n')}`)
    }
  })

  test('no orphan handlers (handler exists but no matching schema)', () => {
    const nodeTypes = new Set(ALL_NODE_COMPONENTS.map(n => n.type))
    const orphans: string[] = []

    for (const key of registryKeys) {
      if (!nodeTypes.has(key)) {
        orphans.push(key)
      }
    }

    if (orphans.length > 0) {
      console.warn(`\n⚠️  ${orphans.length} handler(s) without matching schema (may be aliases/legacy):\n${orphans.join('\n')}`)
    }
  })
})

// ─── 3. Trigger Validation ──────────────────────────────────────────────────

describe('Trigger Validation', () => {
  test('every trigger node has isTrigger = true', () => {
    const failures: string[] = []
    for (const node of allTriggers) {
      if (node.isTrigger !== true) {
        failures.push(`${node.type}: isTrigger is ${node.isTrigger}`)
      }
    }
    expect(failures).toEqual([])
  })

  test('trigger nodes have a providerId', () => {
    const missing: string[] = []
    for (const node of allTriggers) {
      if (node.type.startsWith('generic_') || node.type === 'webhook_trigger') continue
      if (!node.providerId) {
        missing.push(`${node.type} (${node.title})`)
      }
    }

    if (missing.length > 0) {
      console.warn(`\n⚠️  ${missing.length} trigger(s) without providerId:\n${missing.join('\n')}`)
    }
  })

  test('trigger providers have lifecycle registrations', () => {
    const providersMissingLifecycle: string[] = []
    const triggerProviders = new Set(
      allTriggers
        .filter(n => n.providerId && !n.comingSoon)
        .map(n => n.providerId!)
    )

    for (const providerId of triggerProviders) {
      if (!lifecycleProviders.has(providerId)) {
        providersMissingLifecycle.push(providerId)
      }
    }

    if (providersMissingLifecycle.length > 0) {
      console.warn(`\n⚠️  ${providersMissingLifecycle.length} trigger provider(s) without lifecycle registration:\n${providersMissingLifecycle.join('\n')}`)
    }
  })

  test('trigger nodes define output schema', () => {
    const missing: string[] = []
    for (const node of allTriggers) {
      if (node.comingSoon) continue
      const hasOutput = (node.outputSchema && node.outputSchema.length > 0) || node.producesOutput
      if (!hasOutput) {
        missing.push(`${node.type} (${node.title})`)
      }
    }

    if (missing.length > 0) {
      console.warn(`\n⚠️  ${missing.length} trigger(s) without output schema:\n${missing.join('\n')}`)
    }
  })
})

// ─── 4. Output Schema Validation ─────────────────────────────────────────────

describe('Output Schema Validation', () => {
  test('output schema fields have name, label, and type', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.outputSchema) continue
      for (let i = 0; i < node.outputSchema.length; i++) {
        const field = node.outputSchema[i]
        if (!field.name) failures.push(`${node.type}: outputSchema[${i}] missing "name"`)
        if (!field.label) failures.push(`${node.type}: outputSchema[${i}] (${field.name || '?'}) missing "label"`)
        if (!field.type) failures.push(`${node.type}: outputSchema[${i}] (${field.name || '?'}) missing "type"`)
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} output schema issues:\n${failures.join('\n')}`)
    }
  })

  test('output schema field names are unique within each node', () => {
    const failures: string[] = []

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.outputSchema || node.outputSchema.length === 0) continue
      const names = new Set<string>()
      for (const field of node.outputSchema) {
        if (!field.name) continue
        if (names.has(field.name)) {
          failures.push(`${node.type}: duplicate output field "${field.name}"`)
        }
        names.add(field.name)
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} duplicate output field names:\n${failures.join('\n')}`)
    }
  })
})

// ─── 5. Provider Consistency ─────────────────────────────────────────────────

describe('Provider Consistency', () => {
  test('every provider has at least one action or trigger', () => {
    const providers = new Map<string, { actions: number; triggers: number }>()

    for (const node of ALL_NODE_COMPONENTS) {
      if (!node.providerId) continue
      if (!providers.has(node.providerId)) {
        providers.set(node.providerId, { actions: 0, triggers: 0 })
      }
      const entry = providers.get(node.providerId)!
      if (node.isTrigger) entry.triggers++
      else entry.actions++
    }

    const empty = [...providers.entries()].filter(([, v]) => v.actions === 0 && v.triggers === 0)
    expect(empty).toEqual([])
  })
})

// ─── 6. Summary Report ──────────────────────────────────────────────────────

describe('Validation Summary', () => {
  test('print summary report', () => {
    const providers = new Set(ALL_NODE_COMPONENTS.map(n => n.providerId).filter(Boolean))
    const actionsWithHandlers = allActions.filter(n => registryKeys.has(n.type))
    const actionsWithoutHandlers = allActions.filter(
      n => !registryKeys.has(n.type) && !n.comingSoon && !n.deprecated && !n.isSystemNode && !SYSTEM_NODE_TYPES.has(n.type) && !n.hideInActionSelection
    )

    console.log('\n' + '='.repeat(60))
    console.log('  ACTION & TRIGGER VALIDATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`  Total nodes:              ${ALL_NODE_COMPONENTS.length}`)
    console.log(`  Action nodes:             ${allActions.length}`)
    console.log(`  Trigger nodes:            ${allTriggers.length}`)
    console.log(`  Providers:                ${providers.size}`)
    console.log(`  Registry handlers:        ${registryKeys.size}`)
    console.log(`  Actions with handlers:    ${actionsWithHandlers.length}`)
    console.log(`  Actions missing handlers: ${actionsWithoutHandlers.length}`)
    console.log(`  Trigger lifecycle provs:  ${lifecycleProviders.size}`)
    console.log('-'.repeat(60))

    // Per-provider breakdown
    const providerStats = new Map<string, { actions: number; triggers: number; hasHandler: number; missingHandler: number }>()
    for (const node of ALL_NODE_COMPONENTS) {
      const pid = node.providerId || '_system'
      if (!providerStats.has(pid)) {
        providerStats.set(pid, { actions: 0, triggers: 0, hasHandler: 0, missingHandler: 0 })
      }
      const s = providerStats.get(pid)!
      if (node.isTrigger) {
        s.triggers++
      } else {
        s.actions++
        if (registryKeys.has(node.type)) s.hasHandler++
        else if (!node.comingSoon && !node.deprecated && !node.isSystemNode && !SYSTEM_NODE_TYPES.has(node.type)) s.missingHandler++
      }
    }

    console.log('\n  Provider Breakdown:')
    console.log('  ' + '-'.repeat(58))
    console.log('  Provider            Actions  Triggers  Handlers  Missing')
    console.log('  ' + '-'.repeat(58))
    const sorted = [...providerStats.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    for (const [pid, s] of sorted) {
      const name = pid.padEnd(20)
      const actions = String(s.actions).padStart(7)
      const triggers = String(s.triggers).padStart(9)
      const has = String(s.hasHandler).padStart(9)
      const miss = String(s.missingHandler).padStart(8)
      console.log(`  ${name}${actions}${triggers}${has}${miss}`)
    }
    console.log('='.repeat(60) + '\n')

    // List missing handlers if any
    if (actionsWithoutHandlers.length > 0) {
      console.log('  Actions without handlers:')
      for (const node of actionsWithoutHandlers) {
        console.log(`    - ${node.type} (${node.title})`)
      }
      console.log('')
    }

    expect(true).toBe(true)
  })
})
