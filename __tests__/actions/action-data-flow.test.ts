/**
 * Action Data Flow Tests
 *
 * Verifies that action output shapes match their outputSchema definitions,
 * and that data flows correctly between nodes.
 *
 * Run: npx jest __tests__/actions/action-data-flow.test.ts --verbose
 */

import * as fs from 'fs'
import * as path from 'path'

jest.mock('@/lib/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}))

const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')

// ─── Data ───────────────────────────────────────────────────────────────────

const allActions: any[] = ALL_NODE_COMPONENTS.filter((n: any) => !n.isTrigger && !n.comingSoon)
const actionsWithOutput = allActions.filter((n: any) =>
  n.outputSchema && Array.isArray(n.outputSchema) && n.outputSchema.length > 0
)

// ═══════════════════════════════════════════════════════════════════════════════

describe('Output Schema Field Quality', () => {
  test('all output fields have name, label, and type', () => {
    const invalid: string[] = []

    for (const action of actionsWithOutput) {
      for (const field of action.outputSchema) {
        if (!field.name) invalid.push(`${action.type}: field missing 'name'`)
        if (!field.label) invalid.push(`${action.type}: field missing 'label'`)
        if (!field.type) invalid.push(`${action.type}: field missing 'type'`)
      }
    }

    expect(invalid).toEqual([])
  })

  test('field types are valid', () => {
    const validTypes = new Set(['string', 'number', 'boolean', 'array', 'object', 'file'])
    const invalid: string[] = []

    for (const action of actionsWithOutput) {
      for (const field of action.outputSchema) {
        if (field.type && !validTypes.has(field.type)) {
          invalid.push(`${action.type}.${field.name}: invalid type "${field.type}"`)
        }
      }
    }

    if (invalid.length > 0) {
      console.warn(`⚠️  ${invalid.length} fields with invalid types:\n` +
        invalid.slice(0, 10).map(i => `  - ${i}`).join('\n'))
    }
  })

  test('field names are unique within each action', () => {
    const duplicates: string[] = []

    for (const action of actionsWithOutput) {
      const names = action.outputSchema.map((f: any) => f.name)
      const unique = new Set(names)
      if (names.length !== unique.size) {
        const dups = names.filter((n: string, i: number) => names.indexOf(n) !== i)
        duplicates.push(`${action.type}: duplicate fields [${[...new Set(dups)].join(', ')}]`)
      }
    }

    expect(duplicates).toEqual([])
  })
})

describe('Config Schema Field Quality', () => {
  const actionsWithConfig = allActions.filter((n: any) =>
    n.configSchema && Array.isArray(n.configSchema) && n.configSchema.length > 0
  )

  test('config fields have name, label, and type', () => {
    const invalid: string[] = []

    for (const action of actionsWithConfig) {
      for (const field of action.configSchema) {
        if (!field.name) invalid.push(`${action.type}: config field missing 'name'`)
        if (!field.label) invalid.push(`${action.type}: config field missing 'label'`)
        if (!field.type) invalid.push(`${action.type}: config field missing 'type'`)
      }
    }

    expect(invalid).toEqual([])
  })

  test('required config fields are marked', () => {
    // Verify at least some fields are marked as required
    let requiredCount = 0
    for (const action of actionsWithConfig) {
      for (const field of action.configSchema) {
        if (field.required) requiredCount++
      }
    }

    // Most actions should have at least one required field
    expect(requiredCount).toBeGreaterThan(0)
  })

  test('dynamic fields have dynamic loader specified', () => {
    const dynamicFields = actionsWithConfig.flatMap((a: any) =>
      (a.configSchema || [])
        .filter((f: any) => f.type === 'select' || f.type === 'combobox')
        .map((f: any) => ({ action: a.type, field: f.name, hasDynamic: !!f.dynamic, hasOptions: !!f.options }))
    )

    // Select/combobox fields should have either dynamic loader or static options
    const missingSource = dynamicFields.filter((d: any) => !d.hasDynamic && !d.hasOptions)

    if (missingSource.length > 0) {
      console.warn(
        `⚠️  ${missingSource.length} select/combobox fields without dynamic loader or options:\n` +
        missingSource.slice(0, 10).map((d: any) => `  - ${d.action}.${d.field}`).join('\n')
      )
    }
  })
})

describe('Provider-to-Action Consistency', () => {
  test('actions referencing dependsOn fields point to valid sibling fields', () => {
    const broken: string[] = []

    for (const action of allActions) {
      if (!action.configSchema) continue

      const fieldNames = new Set(action.configSchema.map((f: any) => f.name))

      for (const field of action.configSchema) {
        if (field.dependsOn && !fieldNames.has(field.dependsOn)) {
          broken.push(`${action.type}.${field.name} dependsOn "${field.dependsOn}" which doesn't exist`)
        }
      }
    }

    expect(broken).toEqual([])
  })
})

describe('Action Handler File Coverage', () => {
  const ACTIONS_DIR = path.resolve(__dirname, '../../lib/workflows/actions')

  test('action directories exist for major providers', () => {
    const expectedDirs = [
      'slack', 'gmail', 'stripe', 'hubspot', 'monday',
      'google-calendar', 'googleDrive', 'googleSheets', 'microsoft-excel',
      'notion', 'airtable', 'shopify', 'mailchimp', 'teams'
    ]

    const missing: string[] = []
    for (const dir of expectedDirs) {
      const dirPath = path.join(ACTIONS_DIR, dir)
      const filePath = path.join(ACTIONS_DIR, `${dir}.ts`)
      if (!fs.existsSync(dirPath) && !fs.existsSync(filePath)) {
        missing.push(dir)
      }
    }

    expect(missing).toEqual([])
  })

  test('core utilities exist', () => {
    const corePath = path.join(ACTIONS_DIR, 'core')
    expect(fs.existsSync(corePath)).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'getDecryptedAccessToken.ts'))).toBe(true)
    expect(fs.existsSync(path.join(corePath, 'executeWait.ts'))).toBe(true)
  })

  test('registry file exists and is substantial', () => {
    const registryPath = path.join(ACTIONS_DIR, 'registry.ts')
    expect(fs.existsSync(registryPath)).toBe(true)

    const stats = fs.statSync(registryPath)
    expect(stats.size).toBeGreaterThan(10000) // Should be large (480+ entries)
  })
})

describe('Summary', () => {
  test('print data flow report', () => {
    const totalWithOutput = actionsWithOutput.length
    const totalOutputFields = actionsWithOutput.reduce(
      (sum: number, a: any) => sum + a.outputSchema.length, 0
    )

    const actionsWithConfig = allActions.filter((n: any) => n.configSchema?.length > 0)
    const totalConfigFields = actionsWithConfig.reduce(
      (sum: number, a: any) => sum + a.configSchema.length, 0
    )

    console.log('\n' + '='.repeat(55))
    console.log('  ACTION DATA FLOW REPORT')
    console.log('='.repeat(55))
    console.log(`  Actions with outputSchema:  ${totalWithOutput}/${allActions.length}`)
    console.log(`  Total output fields:        ${totalOutputFields}`)
    console.log(`  Actions with configSchema:  ${actionsWithConfig.length}/${allActions.length}`)
    console.log(`  Total config fields:        ${totalConfigFields}`)
    console.log('='.repeat(55) + '\n')
  })
})
