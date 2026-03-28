/**
 * Facebook Webhook Receiver
 *
 * Handles incoming webhooks from Facebook Graph API for page feed events.
 * Supports both verification challenges and real-time update notifications.
 *
 * Facebook webhook docs: https://developers.facebook.com/docs/graph-api/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { executeWebhookWorkflow } from '@/lib/webhooks/execute'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || process.env.FACEBOOK_APP_SECRET || 'chainreact-facebook-verify'

/**
 * GET handler — Facebook webhook verification challenge
 *
 * Facebook sends: GET ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
 * We must return the challenge value as plain text if the verify_token matches.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  logger.info('[Facebook Webhook] Verification request:', { mode, hasToken: !!token, hasChallenge: !!challenge })

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('[Facebook Webhook] Verification successful')
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  logger.warn('[Facebook Webhook] Verification failed — token mismatch')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST handler — Facebook real-time update notifications
 *
 * Facebook sends batched events:
 * {
 *   object: 'page',
 *   entry: [{
 *     id: 'PAGE_ID',
 *     time: 1234567890,
 *     changes: [{
 *       field: 'feed',
 *       value: { item: 'post'|'comment', ... }
 *     }]
 *   }]
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()

    logger.info('[Facebook Webhook] Received event:', {
      object: body.object,
      entryCount: body.entry?.length || 0,
    })

    // Only process page events
    if (body.object !== 'page') {
      return NextResponse.json({ success: true, message: 'Not a page event' })
    }

    const supabase = getSupabase()
    let executed = 0

    for (const entry of (body.entry || [])) {
      const pageId = entry.id
      const changes = entry.changes || []

      for (const change of changes) {
        if (change.field !== 'feed') continue

        const value = change.value || {}
        const item = value.item // 'post', 'comment', 'reaction', etc.

        // Determine trigger type based on the change
        let triggerType: string | null = null
        if (item === 'post' || item === 'status' || item === 'photo' || item === 'video' || item === 'share') {
          triggerType = 'facebook_trigger_new_post'
        } else if (item === 'comment') {
          triggerType = 'facebook_trigger_new_comment'
        }

        if (!triggerType) {
          logger.info('[Facebook Webhook] Ignoring non-post/comment feed item:', { item })
          continue
        }

        // Find matching trigger resources for this page
        const { data: resources, error } = await supabase
          .from('trigger_resources')
          .select('workflow_id, user_id, config')
          .eq('provider_id', 'facebook')
          .eq('trigger_type', triggerType)
          .eq('status', 'active')

        if (error || !resources) {
          logger.error('[Facebook Webhook] Failed to query trigger resources:', error)
          continue
        }

        // Filter to resources watching this specific page
        const matchingResources = resources.filter(r =>
          r.config?.pageId === pageId || !r.config?.pageId
        )

        // For comment triggers, optionally filter by postId
        const filteredResources = triggerType === 'facebook_trigger_new_comment'
          ? matchingResources.filter(r => {
              const configPostId = r.config?.postId
              if (!configPostId) return true // No post filter = match all
              return value.post_id === configPostId
            })
          : matchingResources

        logger.info(`[Facebook Webhook] Found ${filteredResources.length} matching workflows for ${triggerType}`)

        // Build trigger data
        const triggerData = {
          pageId,
          postId: value.post_id || null,
          message: value.message || null,
          link: value.link || null,
          from: value.from || null,
          createdTime: value.created_time || new Date().toISOString(),
          item,
          verb: value.verb || 'add',
          // Comment-specific fields
          commentId: value.comment_id || null,
          parentId: value.parent_id || null,
          // Raw data
          _raw: value,
        }

        for (const resource of filteredResources) {
          const result = await executeWebhookWorkflow({
            workflowId: resource.workflow_id,
            userId: resource.user_id,
            provider: 'facebook',
            triggerType,
            triggerData,
            metadata: { pageId, item, entryTime: entry.time },
          })
          if (result.success) executed++
        }
      }
    }

    const duration = Date.now() - startTime
    logger.info('[Facebook Webhook] Processing complete:', { executed, duration: `${duration}ms` })

    return NextResponse.json({ success: true, workflowsExecuted: executed })

  } catch (error: any) {
    logger.error('[Facebook Webhook] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 200 })
  }
}
