/**
 * Webhook Test Reporter
 *
 * Collects per-test results and outputs a summary to console
 * and optionally to a JSON report file.
 */

import fs from 'fs'
import path from 'path'

export type TestStatus =
  | 'PASSED'
  | 'FAILED-AT-RECEIPT'
  | 'FAILED-AT-MATCH'
  | 'FAILED-AT-EXECUTION'
  | 'SKIPPED-NO-SECRET'
  | 'ERROR'

export interface TestResult {
  id: string
  provider: string
  description: string
  status: TestStatus
  durationMs: number
  details: {
    httpStatus?: number
    expectedHttpStatus?: number
    receiptReceived?: boolean
    matchCount?: number
    expectedMatchCount?: number
    executionSessions?: number
    expectedExecution?: boolean
    executionStatus?: string
    expectedExecutionStatus?: string
    error?: string
  }
}

export class Reporter {
  private results: TestResult[] = []

  addResult(result: TestResult): void {
    this.results.push(result)
    this.printResult(result)
  }

  private printResult(r: TestResult): void {
    const icon = r.status === 'PASSED' ? '✓' : r.status.startsWith('SKIPPED') ? '○' : '✗'
    const color = r.status === 'PASSED' ? '\x1b[32m' : r.status.startsWith('SKIPPED') ? '\x1b[33m' : '\x1b[31m'
    const reset = '\x1b[0m'

    let detail = ''
    if (r.status === 'PASSED') {
      detail = `receipt: ${r.details.httpStatus}, match: ${r.details.matchCount} workflow(s), exec: ${r.details.executionStatus ?? 'n/a'}`
    } else if (r.status === 'FAILED-AT-RECEIPT') {
      detail = `got ${r.details.httpStatus}, expected ${r.details.expectedHttpStatus}`
    } else if (r.status === 'FAILED-AT-MATCH') {
      detail = `receipt: ${r.details.httpStatus}, match: ${r.details.matchCount}, expected: ${r.details.expectedMatchCount}`
    } else if (r.status === 'FAILED-AT-EXECUTION') {
      detail = `receipt: ${r.details.httpStatus}, match: ${r.details.matchCount}, exec: ${r.details.executionStatus}, expected: ${r.details.expectedExecutionStatus}`
    } else if (r.status === 'SKIPPED-NO-SECRET') {
      detail = r.details.error || 'missing secret'
    } else if (r.status === 'ERROR') {
      detail = r.details.error || 'unknown error'
    }

    console.log(`${color}${icon}${reset} ${r.id}: ${color}${r.status}${reset} (${detail}) [${r.durationMs}ms]`)
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(70))
    console.log('WEBHOOK TEST RESULTS')
    console.log('='.repeat(70))

    const passed = this.results.filter((r) => r.status === 'PASSED').length
    const failed = this.results.filter((r) => r.status.startsWith('FAILED')).length
    const skipped = this.results.filter((r) => r.status.startsWith('SKIPPED')).length
    const errors = this.results.filter((r) => r.status === 'ERROR').length
    const total = this.results.length

    console.log(`Total: ${total}  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Errors: ${errors}`)

    if (failed > 0) {
      console.log('\nFailed tests:')
      for (const r of this.results.filter((r) => r.status.startsWith('FAILED'))) {
        console.log(`  - ${r.id}: ${r.status}`)
      }
    }

    console.log('='.repeat(70))
  }

  /**
   * Write a JSON report to disk.
   */
  writeReport(outputDir?: string): string {
    const dir = outputDir || path.join(process.cwd(), 'scripts', 'test-webhooks', 'reports')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(dir, `webhook-test-${timestamp}.json`)

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter((r) => r.status === 'PASSED').length,
        failed: this.results.filter((r) => r.status.startsWith('FAILED')).length,
        skipped: this.results.filter((r) => r.status.startsWith('SKIPPED')).length,
        errors: this.results.filter((r) => r.status === 'ERROR').length,
      },
      results: this.results,
    }

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2))
    return filePath
  }

  get hasFailures(): boolean {
    return this.results.some((r) => r.status.startsWith('FAILED') || r.status === 'ERROR')
  }
}
