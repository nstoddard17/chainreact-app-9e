/**
 * Webhook Test Verifier
 *
 * Polls the internal verification API to check receipt, match,
 * and execution status for a given testRunId.
 */

export interface VerificationResult {
  receipt: {
    received: boolean
    webhookEventId: string | null
    eventLogCount: number
  }
  match: {
    workflowsTriggered: number
    processingStatus: string | null
    matchedWorkflows: Array<{ workflowId: string; sessionType: string }>
  }
  execution: {
    sessions: Array<{
      sessionId: string
      workflowId: string
      status: string
      sessionType: string
      createdAt: string
    }>
  }
}

interface VerifyOptions {
  baseUrl: string
  internalKey: string
  testRunId: string
  /** Max time to wait for receipt + match (ms) */
  matchTimeoutMs?: number
  /** Max time to wait for execution (ms) */
  executionTimeoutMs?: number
  /** Polling interval (ms) */
  pollIntervalMs?: number
  verbose?: boolean
}

/**
 * Poll the verification API until receipt + match criteria are met,
 * then optionally wait for execution.
 */
export async function verifyWebhookResult(
  opts: VerifyOptions & { expectExecution: boolean }
): Promise<VerificationResult> {
  const {
    baseUrl,
    internalKey,
    testRunId,
    matchTimeoutMs = 5000,
    executionTimeoutMs = 10000,
    pollIntervalMs = 500,
    expectExecution,
    verbose,
  } = opts

  const url = `${baseUrl}/api/internal/test-harness/verify?testRunId=${encodeURIComponent(testRunId)}`

  // Poll for match + execution results
  // Receipt is already proven by HTTP status; DB receipt is a bonus signal
  const deadline = Date.now() + (expectExecution ? executionTimeoutMs : matchTimeoutMs)
  let lastResult: VerificationResult | null = null

  while (Date.now() < deadline) {
    lastResult = await fetchVerification(url, internalKey)
    if (verbose) {
      console.log(`  [verify] receipt=${lastResult.receipt.received} match=${lastResult.match.workflowsTriggered} exec=${lastResult.execution.sessions.length}`)
    }

    if (expectExecution) {
      // Wait until execution sessions are terminal
      const allDone = lastResult.execution.sessions.length > 0 &&
        lastResult.execution.sessions.every(
          (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'error'
        )
      if (allDone) break
    } else {
      // For no-match tests, one poll is enough — if nothing matched there won't be sessions
      break
    }
    await sleep(pollIntervalMs)
  }

  if (!lastResult) {
    lastResult = await fetchVerification(url, internalKey)
  }

  return lastResult
}

async function fetchVerification(url: string, internalKey: string): Promise<VerificationResult> {
  const res = await fetch(url, {
    headers: { 'x-internal-key': internalKey },
  })
  if (!res.ok) {
    throw new Error(`Verification API returned ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
