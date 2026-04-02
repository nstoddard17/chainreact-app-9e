#!/usr/bin/env npx tsx
/**
 * Webhook Trigger Test Harness — Runner
 *
 * Usage:
 *   npx tsx scripts/test-webhooks/runner.ts [options]
 *
 * Options:
 *   --provider=github     Run only tests for a specific provider
 *   --tag=smoke           Run only tests with a specific tag
 *   --base-url=URL        Target URL (default: http://localhost:3000)
 *   --dry-run             Print requests without sending
 *   --verbose             Show detailed request/response info
 *   --report              Write JSON report to disk
 *
 * Required env vars:
 *   WEBHOOK_TEST_MODE=true        Must be set on the server
 *   INTERNAL_API_KEY=<key>        For verification API access
 *   Provider-specific secrets     Per test case secretEnvVar
 *
 * Strict mode (CI):
 *   WEBHOOK_TEST_STRICT=true      Fail on missing secrets instead of skip
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { config } from 'dotenv'

// Load .env.local for secrets
config({ path: path.join(process.cwd(), '.env.local') })

import { filterTestCases, type WebhookTestCase } from './test-matrix'
import { computeSignature, MissingSecretError } from './signature-factory'
import { verifyWebhookResult } from './verifier'
import { Reporter, type TestResult, type TestStatus } from './reporter'
import { setupTestFixtures, teardownTestFixtures, cleanupOrphans, type TestFixture } from './test-fixtures-db'

// --- CLI argument parsing ---

function parseArgs(): {
  provider?: string
  tag?: string
  baseUrl: string
  dryRun: boolean
  verbose: boolean
  report: boolean
} {
  const args = process.argv.slice(2)
  const opts: ReturnType<typeof parseArgs> = {
    baseUrl: 'http://localhost:3000',
    dryRun: false,
    verbose: false,
    report: false,
  }

  for (const arg of args) {
    if (arg.startsWith('--provider=')) opts.provider = arg.split('=')[1]
    else if (arg.startsWith('--tag=')) opts.tag = arg.split('=')[1]
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.split('=')[1]
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--verbose') opts.verbose = true
    else if (arg === '--report') opts.report = true
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Webhook Trigger Test Harness

Usage: npx tsx scripts/test-webhooks/runner.ts [options]

Options:
  --provider=<name>   Run tests for a specific provider only
  --tag=<tag>         Run tests with a specific tag only
  --base-url=<url>    Target server URL (default: http://localhost:3000)
  --dry-run           Print requests without sending
  --verbose           Show detailed request/response info
  --report            Write JSON report to scripts/test-webhooks/reports/
  --help              Show this help message
`)
      process.exit(0)
    }
  }

  return opts
}

// --- Fixture loading ---

const FIXTURES_DIR = path.join(process.cwd(), 'lib', 'workflows', 'testing', 'fixtures', 'webhooks')

function loadFixture(fixtureFile: string): string {
  const fullPath = path.join(FIXTURES_DIR, fixtureFile)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Fixture file not found: ${fullPath}`)
  }
  return fs.readFileSync(fullPath, 'utf-8')
}

// --- Main runner ---

async function runTestCase(
  tc: WebhookTestCase,
  opts: { baseUrl: string; dryRun: boolean; verbose: boolean; internalKey: string; strict: boolean },
  fixtures?: Map<string, TestFixture>
): Promise<TestResult> {
  const startTime = Date.now()
  const testRunId = `test_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`

  try {
    // Load fixture body (unmodified)
    const rawBody = loadFixture(tc.fixtureFile)

    // Compute signature
    let signatureHeaders: Record<string, string> = {}
    try {
      const secret = process.env[tc.secretEnvVar]
      const result = computeSignature(tc.signatureScheme, rawBody, secret)
      signatureHeaders = result.headers
    } catch (err) {
      if (err instanceof MissingSecretError) {
        if (opts.strict) {
          throw new Error(
            `[STRICT MODE] Missing secret for ${tc.provider}: set ${tc.secretEnvVar} in .env.local`
          )
        }
        return {
          id: tc.id,
          provider: tc.provider,
          description: tc.description,
          status: 'SKIPPED-NO-SECRET',
          durationMs: Date.now() - startTime,
          details: {
            error: `Missing ${tc.secretEnvVar}`,
          },
        }
      }
      throw err
    }

    // Build request headers
    const headers: Record<string, string> = {
      'content-type': tc.contentType || 'application/json',
      'x-test-run-id': testRunId,
      ...signatureHeaders,
      ...(tc.extraHeaders || {}),
    }

    let url = `${opts.baseUrl}${tc.endpoint}`

    // Resolve fixture-derived query params (e.g., workflowId, nodeId for Notion)
    if (tc.endpointParams && fixtures?.has(tc.id)) {
      const fixture = fixtures.get(tc.id)!
      const resolved = new URL(url)
      for (const [paramName, fixtureField] of Object.entries(tc.endpointParams)) {
        resolved.searchParams.set(paramName, fixture[fixtureField])
      }
      url = resolved.toString()
    }

    // Dry run — print and skip
    if (opts.dryRun) {
      console.log(`\n[DRY RUN] ${tc.id}`)
      console.log(`  URL: POST ${url}`)
      console.log(`  Headers:`, JSON.stringify(headers, null, 2))
      console.log(`  Body: ${rawBody.substring(0, 200)}...`)
      return {
        id: tc.id,
        provider: tc.provider,
        description: tc.description,
        status: 'PASSED',
        durationMs: Date.now() - startTime,
        details: { error: 'dry-run' },
      }
    }

    if (opts.verbose) {
      console.log(`\n[${tc.id}] POST ${url}`)
      console.log(`  testRunId: ${testRunId}`)
      console.log(`  Headers:`, JSON.stringify(headers, null, 2))
    }

    // --- Layer 1: Send request and check receipt ---
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
    })

    const responseBody = await response.text()
    const httpStatus = response.status

    if (opts.verbose) {
      console.log(`  Response: ${httpStatus}`)
      console.log(`  Body: ${responseBody.substring(0, 500)}`)
    }

    if (httpStatus !== tc.expectedHttpStatus) {
      return {
        id: tc.id,
        provider: tc.provider,
        description: tc.description,
        status: 'FAILED-AT-RECEIPT',
        durationMs: Date.now() - startTime,
        details: {
          httpStatus,
          expectedHttpStatus: tc.expectedHttpStatus,
          error: responseBody.substring(0, 200),
        },
      }
    }

    // --- Layer 2 + 3: Verify match and execution ---
    const verification = await verifyWebhookResult({
      baseUrl: opts.baseUrl,
      internalKey: opts.internalKey,
      testRunId,
      expectExecution: tc.expectedExecution.shouldExecute,
      verbose: opts.verbose,
    })

    // Check match count
    const actualMatchCount = tc.expectedExecution.shouldExecute
      ? verification.execution.sessions.length
      : verification.match.workflowsTriggered

    if (actualMatchCount !== tc.expectedMatch.count) {
      // For no-match tests: verify no execution sessions exist
      if (tc.expectedMatch.count === 0 && verification.execution.sessions.length > 0) {
        return {
          id: tc.id,
          provider: tc.provider,
          description: tc.description,
          status: 'FAILED-AT-EXECUTION',
          durationMs: Date.now() - startTime,
          details: {
            httpStatus,
            matchCount: actualMatchCount,
            expectedMatchCount: tc.expectedMatch.count,
            executionSessions: verification.execution.sessions.length,
            expectedExecution: false,
          },
        }
      }

      return {
        id: tc.id,
        provider: tc.provider,
        description: tc.description,
        status: 'FAILED-AT-MATCH',
        durationMs: Date.now() - startTime,
        details: {
          httpStatus,
          receiptReceived: verification.receipt.received,
          matchCount: actualMatchCount,
          expectedMatchCount: tc.expectedMatch.count,
        },
      }
    }

    // Check execution (only if expected)
    if (tc.expectedExecution.shouldExecute) {
      if (verification.execution.sessions.length === 0) {
        return {
          id: tc.id,
          provider: tc.provider,
          description: tc.description,
          status: 'FAILED-AT-EXECUTION',
          durationMs: Date.now() - startTime,
          details: {
            httpStatus,
            matchCount: actualMatchCount,
            executionSessions: 0,
            expectedExecution: true,
          },
        }
      }

      if (tc.expectedExecution.status) {
        const allMatch = verification.execution.sessions.every(
          (s) => s.status === tc.expectedExecution.status
        )
        if (!allMatch) {
          const statuses = verification.execution.sessions.map((s) => s.status).join(', ')
          return {
            id: tc.id,
            provider: tc.provider,
            description: tc.description,
            status: 'FAILED-AT-EXECUTION',
            durationMs: Date.now() - startTime,
            details: {
              httpStatus,
              matchCount: actualMatchCount,
              executionSessions: verification.execution.sessions.length,
              executionStatus: statuses,
              expectedExecutionStatus: tc.expectedExecution.status,
            },
          }
        }
      }
    } else {
      // Verify no execution sessions exist for no-match tests
      if (verification.execution.sessions.length > 0) {
        return {
          id: tc.id,
          provider: tc.provider,
          description: tc.description,
          status: 'FAILED-AT-EXECUTION',
          durationMs: Date.now() - startTime,
          details: {
            httpStatus,
            matchCount: actualMatchCount,
            executionSessions: verification.execution.sessions.length,
            expectedExecution: false,
          },
        }
      }
    }

    // All checks passed
    const execStatus = verification.execution.sessions.length > 0
      ? verification.execution.sessions.map((s) => s.status).join(', ')
      : 'n/a'

    return {
      id: tc.id,
      provider: tc.provider,
      description: tc.description,
      status: 'PASSED',
      durationMs: Date.now() - startTime,
      details: {
        httpStatus,
        receiptReceived: verification.receipt.received,
        matchCount: actualMatchCount,
        expectedMatchCount: tc.expectedMatch.count,
        executionSessions: verification.execution.sessions.length,
        executionStatus: execStatus,
      },
    }
  } catch (err: any) {
    return {
      id: tc.id,
      provider: tc.provider,
      description: tc.description,
      status: 'ERROR',
      durationMs: Date.now() - startTime,
      details: {
        error: err.message || String(err),
      },
    }
  }
}

// --- Entry point ---

async function main() {
  const opts = parseArgs()
  const strict = process.env.WEBHOOK_TEST_STRICT === 'true'
  const internalKey = process.env.INTERNAL_API_KEY

  console.log('='.repeat(70))
  console.log('WEBHOOK TRIGGER TEST HARNESS')
  console.log('='.repeat(70))
  console.log(`Target:  ${opts.baseUrl}`)
  console.log(`Strict:  ${strict}`)
  console.log(`Dry run: ${opts.dryRun}`)
  if (opts.provider) console.log(`Provider filter: ${opts.provider}`)
  if (opts.tag) console.log(`Tag filter: ${opts.tag}`)
  console.log()

  if (!internalKey && !opts.dryRun) {
    console.error('ERROR: INTERNAL_API_KEY env var is required for verification.')
    console.error('Set it in .env.local and ensure the server has the same value.')
    process.exit(1)
  }

  const testCases = filterTestCases({ provider: opts.provider, tag: opts.tag })

  if (testCases.length === 0) {
    console.log('No test cases match the given filters.')
    process.exit(0)
  }

  console.log(`Running ${testCases.length} test case(s)...\n`)

  // Clean up any orphaned fixtures from previous failed runs
  const orphanCount = opts.dryRun ? 0 : await cleanupOrphans()
  if (orphanCount > 0) {
    console.log(`Cleaned up ${orphanCount} orphaned test fixture(s) from a previous run.\n`)
  }

  // Set up DB fixtures for positive-match tests
  let fixtures = new Map<string, TestFixture>()
  const hasPositiveTests = testCases.some((tc) => tc.expectedMatch.count > 0)

  if (hasPositiveTests && !opts.dryRun) {
    console.log('Setting up test fixtures...')
    fixtures = await setupTestFixtures()
    console.log()
  }

  const reporter = new Reporter()

  try {
    for (const tc of testCases) {
      const result = await runTestCase(tc, {
        baseUrl: opts.baseUrl,
        dryRun: opts.dryRun,
        verbose: opts.verbose,
        internalKey: internalKey || '',
        strict,
      }, fixtures)
      reporter.addResult(result)
    }
  } finally {
    // Always tear down fixtures, even if tests fail
    if (fixtures.size > 0) {
      console.log('\nTearing down test fixtures...')
      await teardownTestFixtures(fixtures)
    }
  }

  reporter.printSummary()

  if (opts.report) {
    const reportPath = reporter.writeReport()
    console.log(`\nJSON report written to: ${reportPath}`)
  }

  process.exit(reporter.hasFailures ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
