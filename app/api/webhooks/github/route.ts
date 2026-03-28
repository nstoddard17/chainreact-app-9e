/**
 * GitHub Webhook Receiver
 *
 * Handles incoming webhooks from GitHub for repository events.
 * Verifies HMAC-SHA256 signature and routes to workflow execution.
 *
 * GitHub webhook docs: https://docs.github.com/en/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { logger } from '@/lib/utils/logger'
import { executeWebhookWorkflow } from '@/lib/webhooks/execute'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Verify GitHub webhook HMAC-SHA256 signature
 */
function verifyGitHubSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET || process.env.GITHUB_ACCESS_TOKEN
  if (!secret) {
    logger.warn('[GitHub Webhook] No secret configured — skipping verification')
    return true
  }

  if (!signatureHeader) {
    logger.warn('[GitHub Webhook] No signature header provided')
    return true // Allow in development
  }

  const sig = signatureHeader.replace('sha256=', '')
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// GitHub event → trigger type mapping
const EVENT_TO_TRIGGER: Record<string, string> = {
  'push': 'github_trigger_new_commit',
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const rawBody = await request.text()

    // Verify signature
    const signature = request.headers.get('x-hub-signature-256')
    if (!verifyGitHubSignature(rawBody, signature)) {
      logger.error('[GitHub Webhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = request.headers.get('x-github-event')
    const deliveryId = request.headers.get('x-github-delivery')

    logger.info('[GitHub Webhook] Received:', { event, deliveryId })

    // Handle ping event (GitHub sends this when webhook is first created)
    if (event === 'ping') {
      logger.info('[GitHub Webhook] Ping received — webhook is active')
      return NextResponse.json({ success: true, message: 'pong' })
    }

    const triggerType = EVENT_TO_TRIGGER[event || '']
    if (!triggerType) {
      logger.info('[GitHub Webhook] Unhandled event type:', { event })
      return NextResponse.json({ success: true, message: `Event "${event}" not handled` })
    }

    const payload = JSON.parse(rawBody)

    // Build trigger data based on event type
    let triggerData: any = {}

    if (event === 'push') {
      const headCommit = payload.head_commit || {}
      const repository = payload.repository || {}
      const branch = (payload.ref || '').replace('refs/heads/', '')

      triggerData = {
        commitId: headCommit.id || null,
        commitMessage: headCommit.message || null,
        authorName: headCommit.author?.name || headCommit.author?.username || null,
        authorEmail: headCommit.author?.email || null,
        branch,
        repository: repository.full_name || null,
        commitUrl: headCommit.url || null,
        timestamp: headCommit.timestamp || new Date().toISOString(),
        filesChanged: [
          ...(headCommit.added || []),
          ...(headCommit.modified || []),
          ...(headCommit.removed || []),
        ],
        ref: payload.ref,
        pusher: payload.pusher?.name || null,
        compareUrl: payload.compare || null,
        commits: (payload.commits || []).map((c: any) => ({
          id: c.id,
          message: c.message,
          author: c.author?.name,
          url: c.url,
        })),
      }
    }

    // Find matching trigger resources
    const supabase = getSupabase()
    const { data: resources, error } = await supabase
      .from('trigger_resources')
      .select('workflow_id, user_id, config')
      .eq('provider_id', 'github')
      .eq('trigger_type', triggerType)
      .eq('status', 'active')

    if (error || !resources) {
      logger.error('[GitHub Webhook] Failed to query trigger resources:', error)
      return NextResponse.json({ success: false })
    }

    // Filter by repository and optionally by branch
    const repoFullName = payload.repository?.full_name
    const branch = (payload.ref || '').replace('refs/heads/', '')

    const matchingResources = resources.filter(r => {
      // Must match repository
      if (r.config?.repository && r.config.repository !== repoFullName) return false
      // Optionally filter by branch
      if (r.config?.branch && r.config.branch !== branch) return false
      return true
    })

    logger.info(`[GitHub Webhook] Found ${matchingResources.length} matching workflows`)

    let executed = 0
    for (const resource of matchingResources) {
      const result = await executeWebhookWorkflow({
        workflowId: resource.workflow_id,
        userId: resource.user_id,
        provider: 'github',
        triggerType,
        triggerData,
        dedupeKey: deliveryId || undefined,
        metadata: { event, deliveryId, repository: repoFullName },
      })
      if (result.success && !result.duplicate) executed++
    }

    const duration = Date.now() - startTime
    logger.info('[GitHub Webhook] Processing complete:', { executed, duration: `${duration}ms` })

    return NextResponse.json({ success: true, workflowsExecuted: executed })

  } catch (error: any) {
    logger.error('[GitHub Webhook] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 200 })
  }
}
