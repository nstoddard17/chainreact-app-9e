/**
 * Test Cache — tracks previously passed systematic tests
 *
 * Stores a hash of the action handler source files for each passed test.
 * On subsequent runs, tests are skipped if their handler code hasn't changed.
 *
 * Cache file: .test-cache.json (gitignored)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { logger } from '@/lib/utils/logger'

const CACHE_FILE = path.join(process.cwd(), '.test-cache.json')
const ACTIONS_DIR = path.join(process.cwd(), 'lib', 'workflows', 'actions')

// Shared files that affect all tests — if these change, entire cache is invalidated
const SHARED_FILES = [
  'registry.ts',
  'index.ts',
  'core/resolveValue.ts',
  'core/getDecryptedAccessToken.ts',
]

interface CachedTestResult {
  nodeType: string
  providerId: string
  passedAt: string        // ISO timestamp
  codeHash: string        // Hash of relevant source files
  duration: number
  nodeTitle: string
}

interface TestCache {
  version: number
  sharedHash: string      // Hash of shared files — if changed, invalidate all
  tests: Record<string, CachedTestResult>  // keyed by nodeType
}

/**
 * Map provider IDs to their source file paths (directories and/or files)
 * relative to the actions directory
 */
const PROVIDER_SOURCE_PATHS: Record<string, string[]> = {
  'gmail': ['gmail/'],
  'google-calendar': ['google-calendar/'],
  'google-drive': ['googleDrive/'],
  'google-docs': ['googleDocs/', 'googleDocs.ts'],
  'google-sheets': ['google-sheets/', 'googleSheets/'],
  'google-analytics': ['google-analytics/'],
  'microsoft-excel': ['microsoft-excel/'],
  'microsoft-outlook': ['microsoft-outlook/', 'outlook.ts'],
  'microsoft-onenote': ['microsoft-onenote/'],
  'onedrive': ['onedrive/', 'onedrive.ts'],
  'slack': ['slack/', 'slack.ts'],
  'discord': ['discord.ts'],
  'notion': ['notion/', 'notion.ts'],
  'trello': ['trello/', 'trello.ts'],
  'github': ['github/', 'github.ts'],
  'stripe': ['stripe/'],
  'shopify': ['shopify/'],
  'teams': ['teams/'],
  'twitter': ['twitter/'],
  'facebook': ['facebook.ts'],
  'hubspot': ['hubspot/', 'hubspot.ts', 'hubspotDynamic.ts'],
  'mailchimp': ['mailchimp/'],
  'monday': ['monday/'],
  'airtable': ['airtable/'],
  'dropbox': ['dropbox/'],
  'gumroad': ['gumroad/'],
  'ai': ['ai/', 'aiDataProcessing.ts', 'aiAgentAction.ts', 'aiRouterAction.ts'],
  'logic': ['logic/'],
  'utility': ['utility/'],
  'automation': ['automation/'],
}

/** Recursively collect all .ts files in a directory */
function getFilesRecursive(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...getFilesRecursive(fullPath))
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist — that's fine
  }
  return files
}

/** Compute a hash of file contents */
function hashFiles(filePaths: string[]): string {
  const hash = crypto.createHash('md5')
  const sorted = [...filePaths].sort()
  for (const fp of sorted) {
    try {
      const content = fs.readFileSync(fp, 'utf-8')
      hash.update(fp + ':' + content)
    } catch {
      // File doesn't exist — skip
    }
  }
  return hash.digest('hex')
}

/** Get the hash of shared files that affect all tests */
function getSharedHash(): string {
  const files = SHARED_FILES.map(f => path.join(ACTIONS_DIR, f))
  // Also include the test data file itself
  files.push(path.join(process.cwd(), 'lib', 'workflows', 'testing', 'testData.ts'))
  return hashFiles(files)
}

/** Get the hash of source files for a specific provider */
function getProviderHash(providerId: string): string {
  const sourcePaths = PROVIDER_SOURCE_PATHS[providerId]
  if (!sourcePaths) {
    // Unknown provider — hash the registry as fallback
    return hashFiles([path.join(ACTIONS_DIR, 'registry.ts')])
  }

  const files: string[] = []
  for (const sp of sourcePaths) {
    const fullPath = path.join(ACTIONS_DIR, sp)
    if (sp.endsWith('/')) {
      // It's a directory — collect all files
      files.push(...getFilesRecursive(fullPath))
    } else {
      // Single file
      files.push(fullPath)
    }
  }

  return hashFiles(files)
}

/** Get combined hash for a specific test (shared + provider) */
export function getTestHash(providerId: string): string {
  const shared = getSharedHash()
  const provider = getProviderHash(providerId)
  return crypto.createHash('md5').update(shared + provider).digest('hex')
}

/** Load the cache from disk */
export function loadCache(): TestCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8')
      const cache = JSON.parse(raw) as TestCache
      if (cache.version !== 1) {
        logger.debug('[test-cache] Cache version mismatch, starting fresh')
        return { version: 1, sharedHash: '', tests: {} }
      }
      return cache
    }
  } catch (err: any) {
    logger.debug('[test-cache] Failed to load cache:', err.message)
  }
  return { version: 1, sharedHash: '', tests: {} }
}

/** Save the cache to disk */
export function saveCache(cache: TestCache): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err: any) {
    logger.error('[test-cache] Failed to save cache:', err.message)
  }
}

/** Check if a test can be skipped (previously passed, code unchanged) */
export function canSkipTest(cache: TestCache, nodeType: string, providerId: string): CachedTestResult | null {
  const cached = cache.tests[nodeType]
  if (!cached) return null

  const currentHash = getTestHash(providerId)
  if (cached.codeHash !== currentHash) {
    // Code has changed since this test last passed
    return null
  }

  return cached
}

/** Record a passed test in the cache */
export function recordPassedTest(
  cache: TestCache,
  nodeType: string,
  providerId: string,
  nodeTitle: string,
  duration: number,
): void {
  cache.tests[nodeType] = {
    nodeType,
    providerId,
    passedAt: new Date().toISOString(),
    codeHash: getTestHash(providerId),
    duration,
    nodeTitle,
  }
}

/** Remove a failed test from the cache (if it was previously cached) */
export function removeFromCache(cache: TestCache, nodeType: string): void {
  delete cache.tests[nodeType]
}

/** Get count of cached (skippable) tests */
export function getCacheStats(cache: TestCache, nodeTypes: string[], providerIds: Record<string, string>): {
  skippable: number
  stale: number
  uncached: number
} {
  let skippable = 0
  let stale = 0
  let uncached = 0

  for (const nt of nodeTypes) {
    const pid = providerIds[nt] || ''
    const cached = cache.tests[nt]
    if (!cached) {
      uncached++
    } else if (cached.codeHash !== getTestHash(pid)) {
      stale++
    } else {
      skippable++
    }
  }

  return { skippable, stale, uncached }
}
