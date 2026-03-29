/**
 * Entitlement Coverage Guard
 *
 * Structural test that verifies all plan-gated API routes include
 * requireFeature or requireActionLimit checks.
 * Prevents new routes from being added without entitlement enforcement.
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

const API_DIR = path.resolve(__dirname, '../../app/api')

describe('Entitlement Coverage: AI routes', () => {
  let aiRouteFiles: string[] = []

  beforeAll(() => {
    // Find all route.ts files under /api/ai/ (excludes conversations GET-only)
    aiRouteFiles = glob.sync('ai/**/route.ts', { cwd: API_DIR })
      .map(f => path.join(API_DIR, f))
  })

  it('finds AI route files to audit', () => {
    expect(aiRouteFiles.length).toBeGreaterThan(0)
  })

  it('all AI route files with POST/PATCH/DELETE include requireFeature check', () => {
    const missing: string[] = []

    for (const file of aiRouteFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      // Skip GET-only routes (read-only data, not gated)
      const hasMutation = content.includes('export async function POST') ||
                          content.includes('export async function PATCH') ||
                          content.includes('export async function DELETE') ||
                          content.includes('export async function PUT')
      if (!hasMutation) continue

      if (!content.includes('requireFeature')) {
        missing.push(file.replace(API_DIR + path.sep, ''))
      }
    }

    expect(missing).toEqual([])
  })
})

describe('Entitlement Coverage: Team mutation routes', () => {
  it('teams POST route includes requireFeature check', () => {
    const file = path.join(API_DIR, 'teams', 'route.ts')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toContain('requireFeature')
  })

  it('team invitation accept route includes requireFeature check', () => {
    const file = path.join(API_DIR, 'teams', 'invitations', '[id]', 'route.ts')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toContain('requireFeature')
  })
})

describe('Entitlement Coverage: Analytics routes', () => {
  it('analytics executions route includes requireFeature check', () => {
    const file = path.join(API_DIR, 'analytics', 'executions', 'route.ts')
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toContain('requireFeature')
  })
})
