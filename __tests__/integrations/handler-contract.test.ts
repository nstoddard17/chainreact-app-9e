/**
 * Handler Contract Test
 *
 * Enforces the invariant: data handlers must NOT import or call decryption utilities.
 * The dynamic route owns token decryption via `tokenDecryption` config in ProviderDataConfig.
 * Handlers receive pre-decrypted tokens.
 *
 * This test is the Phase 3A gate. It must pass before any Phase 3B work proceeds.
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

// Known exceptions: handlers that decrypt secondary tokens stored in metadata
// (not the primary access_token, which is handled by the route)
const KNOWN_EXCEPTIONS: Record<string, string> = {
  // Slack files handler decrypts integration.metadata.user_token — a secondary
  // token the dynamic route doesn't handle. This is a separate concern from
  // the primary access_token contract.
  'slack/data/handlers/files.ts': 'metadata.user_token (secondary token, not primary access_token)',
}

function isKnownException(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return Object.keys(KNOWN_EXCEPTIONS).some(exc => normalized.includes(exc))
}

describe('Handler Contract: No handler-level decryption', () => {
  let handlerFiles: string[] = []

  beforeAll(() => {
    const handlersDir = path.resolve(__dirname, '../../app/api/integrations')
    handlerFiles = glob.sync('*/data/handlers/**/*.ts', { cwd: handlersDir })
      .map(f => path.join(handlersDir, f))
  })

  it('finds handler files to audit', () => {
    expect(handlerFiles.length).toBeGreaterThan(0)
  })

  it('no handler imports decryptToken from tokenUtils (static)', () => {
    const violations: string[] = []

    for (const file of handlerFiles) {
      if (isKnownException(file)) continue
      const content = fs.readFileSync(file, 'utf-8')
      if (content.includes("from '@/lib/integrations/tokenUtils'") ||
          content.includes('from "@/lib/integrations/tokenUtils"')) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
  })

  it('no handler imports decrypt from encryption (static)', () => {
    const violations: string[] = []

    for (const file of handlerFiles) {
      if (isKnownException(file)) continue
      const content = fs.readFileSync(file, 'utf-8')
      if (content.includes("from '@/lib/security/encryption'") ||
          content.includes('from "@/lib/security/encryption"')) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
  })

  it('no handler uses dynamic import of decryption utilities', () => {
    const violations: string[] = []

    for (const file of handlerFiles) {
      if (isKnownException(file)) continue
      const content = fs.readFileSync(file, 'utf-8')
      if (content.includes("import('@/lib/integrations/tokenUtils')") ||
          content.includes("import('@/lib/security/encryption')") ||
          content.includes('import("@/lib/integrations/tokenUtils")') ||
          content.includes('import("@/lib/security/encryption")')) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
  })

  it('known exceptions are documented and still valid', () => {
    for (const [exceptionPath, reason] of Object.entries(KNOWN_EXCEPTIONS)) {
      const matchingFile = handlerFiles.find(f =>
        f.replace(/\\/g, '/').includes(exceptionPath)
      )
      // Exception file must still exist
      expect(matchingFile).toBeDefined()
      // Exception must have a documented reason
      expect(reason.length).toBeGreaterThan(0)
    }
  })
})
