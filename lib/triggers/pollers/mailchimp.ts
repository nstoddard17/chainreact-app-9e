import { createClient } from '@supabase/supabase-js'
import { getMailchimpAuth } from '@/lib/workflows/actions/mailchimp/utils'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'
import { PollingContext, PollingHandler } from '@/lib/triggers/polling'

const ROLE_POLL_INTERVAL_MS: Record<string, number> = {
  free: 15 * 60 * 1000,
  pro: 2 * 60 * 1000,
  'beta-pro': 2 * 60 * 1000,
  business: 60 * 1000,
  enterprise: 60 * 1000,
  admin: 60 * 1000
}

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Poll for email opens on campaigns
 */
async function pollEmailOpened(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  // Determine which campaigns to check
  let campaignIds: string[] = []
  if (config.campaignId) {
    campaignIds = [config.campaignId]
  } else {
    // Fetch recent sent campaigns
    const resp = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=10`,
      { headers }
    )
    if (!resp.ok) return
    const data = await resp.json()
    campaignIds = (data.campaigns || []).map((c: any) => c.id)
  }

  const currentCampaigns: Record<string, any> = {}

  for (const campaignId of campaignIds) {
    const resp = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`,
      { headers }
    )
    if (!resp.ok) continue
    const report = await resp.json()
    currentCampaigns[campaignId] = { totalOpens: report.opens?.opens_total || 0 }
  }

  const newSnapshot = {
    type: 'email_opened',
    campaigns: currentCampaigns,
    updatedAt: new Date().toISOString()
  }

  // Update snapshot in DB
  await getSupabase()
    .from('trigger_resources')
    .update({
      config: {
        ...config,
        mailchimpSnapshot: newSnapshot,
        polling: { ...(config.polling || {}), lastPolledAt: new Date().toISOString() }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', trigger.id)

  // First poll establishes baseline
  if (!previousSnapshot) {
    logger.debug('[Mailchimp Poll] First poll - baseline established for email_opened', { triggerId: trigger.id })
    return
  }

  // Detect new opens
  for (const campaignId of campaignIds) {
    const prevOpens = previousSnapshot.campaigns?.[campaignId]?.totalOpens || 0
    const currOpens = currentCampaigns[campaignId]?.totalOpens || 0

    if (currOpens > prevOpens) {
      // Fetch the actual new open details
      const detailResp = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}/open-details?count=10&sort_field=timestamp&sort_dir=DESC`,
        { headers }
      )
      if (!detailResp.ok) continue
      const detailData = await detailResp.json()

      // Get campaign info for title
      const campaignResp = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`,
        { headers }
      )
      const campaignData = campaignResp.ok ? await campaignResp.json() : {}
      const campaignTitle = campaignData.settings?.title || campaignData.settings?.subject_line || ''

      // Trigger for each new open (up to the difference)
      const newOpenCount = currOpens - prevOpens
      const members = (detailData.members || []).slice(0, newOpenCount)

      for (const member of members) {
        await triggerWorkflow(trigger, {
          email: member.email_address,
          campaignId,
          campaignTitle,
          openTime: member.timestamp || new Date().toISOString(),
          subscriberId: member.email_id,
          audienceId: member.list_id,
          opensCount: member.opens_count
        })
      }

      logger.debug('[Mailchimp Poll] Triggered workflow for new email opens', {
        triggerId: trigger.id,
        campaignId,
        newOpens: newOpenCount
      })
    }
  }
}

/**
 * Poll for link clicks on campaigns
 */
async function pollLinkClicked(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  let campaignIds: string[] = []
  if (config.campaignId) {
    campaignIds = [config.campaignId]
  } else {
    const resp = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=10`,
      { headers }
    )
    if (!resp.ok) return
    const data = await resp.json()
    campaignIds = (data.campaigns || []).map((c: any) => c.id)
  }

  const currentCampaigns: Record<string, any> = {}

  for (const campaignId of campaignIds) {
    const resp = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`,
      { headers }
    )
    if (!resp.ok) continue
    const report = await resp.json()
    currentCampaigns[campaignId] = { totalClicks: report.clicks?.clicks_total || 0 }
  }

  const newSnapshot = {
    type: 'link_clicked',
    campaigns: currentCampaigns,
    updatedAt: new Date().toISOString()
  }

  await getSupabase()
    .from('trigger_resources')
    .update({
      config: {
        ...config,
        mailchimpSnapshot: newSnapshot,
        polling: { ...(config.polling || {}), lastPolledAt: new Date().toISOString() }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', trigger.id)

  if (!previousSnapshot) {
    logger.debug('[Mailchimp Poll] First poll - baseline established for link_clicked', { triggerId: trigger.id })
    return
  }

  for (const campaignId of campaignIds) {
    const prevClicks = previousSnapshot.campaigns?.[campaignId]?.totalClicks || 0
    const currClicks = currentCampaigns[campaignId]?.totalClicks || 0

    if (currClicks > prevClicks) {
      const detailResp = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}/click-details?count=10&sort_field=total_clicks&sort_dir=DESC`,
        { headers }
      )
      if (!detailResp.ok) continue
      const detailData = await detailResp.json()

      const campaignResp = await fetch(
        `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`,
        { headers }
      )
      const campaignData = campaignResp.ok ? await campaignResp.json() : {}
      const campaignTitle = campaignData.settings?.title || campaignData.settings?.subject_line || ''

      // Filter by URL if configured
      const urlFilter = config.url
      const urlsReport = (detailData.urls_clicked || [])
        .filter((u: any) => !urlFilter || u.url === urlFilter)

      for (const urlInfo of urlsReport) {
        // Get members who clicked this URL
        const membersResp = await fetch(
          `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}/click-details/${urlInfo.id}/members?count=5`,
          { headers }
        )
        if (!membersResp.ok) continue
        const membersData = await membersResp.json()

        for (const member of membersData.members || []) {
          await triggerWorkflow(trigger, {
            email: member.email_address,
            url: urlInfo.url,
            campaignId,
            campaignTitle,
            clickTime: member.timestamp || new Date().toISOString(),
            subscriberId: member.email_id
          })
        }
      }

      logger.debug('[Mailchimp Poll] Triggered workflow for new link clicks', {
        triggerId: trigger.id,
        campaignId,
        newClicks: currClicks - prevClicks
      })
    }
  }
}

/**
 * Poll for segment changes
 */
async function pollSegmentUpdated(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const audienceId = config.audienceId || config.audience_id
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  if (!audienceId) {
    logger.debug('[Mailchimp Poll] No audienceId for segment_updated trigger', { triggerId: trigger.id })
    return
  }

  const resp = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/segments?count=100`,
    { headers }
  )
  if (!resp.ok) return
  const data = await resp.json()

  const currentSegments: Record<string, any> = {}
  for (const s of data.segments || []) {
    currentSegments[s.id] = {
      name: s.name,
      memberCount: s.member_count,
      updatedAt: s.updated_at,
      type: s.type
    }
  }

  const newSnapshot = {
    type: 'segment_updated',
    segments: currentSegments,
    updatedAt: new Date().toISOString()
  }

  await getSupabase()
    .from('trigger_resources')
    .update({
      config: {
        ...config,
        mailchimpSnapshot: newSnapshot,
        polling: { ...(config.polling || {}), lastPolledAt: new Date().toISOString() }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', trigger.id)

  if (!previousSnapshot) {
    logger.debug('[Mailchimp Poll] First poll - baseline established for segment_updated', { triggerId: trigger.id })
    return
  }

  const eventTypeFilter = config.eventType || 'both'
  const prevSegments = previousSnapshot.segments || {}

  // Check for new segments
  for (const [segId, segData] of Object.entries(currentSegments) as [string, any][]) {
    if (!prevSegments[segId]) {
      // New segment
      if (eventTypeFilter === 'both' || eventTypeFilter === 'created') {
        await triggerWorkflow(trigger, {
          segmentId: segId,
          segmentName: segData.name,
          segmentType: segData.type,
          memberCount: segData.memberCount,
          eventType: 'created',
          audienceId,
          createdAt: segData.updatedAt,
          updatedAt: segData.updatedAt
        })
        logger.debug('[Mailchimp Poll] Triggered for new segment', { triggerId: trigger.id, segmentId: segId })
      }
    } else if (
      prevSegments[segId].memberCount !== segData.memberCount ||
      prevSegments[segId].updatedAt !== segData.updatedAt
    ) {
      // Updated segment
      if (eventTypeFilter === 'both' || eventTypeFilter === 'updated') {
        await triggerWorkflow(trigger, {
          segmentId: segId,
          segmentName: segData.name,
          segmentType: segData.type,
          memberCount: segData.memberCount,
          eventType: 'updated',
          audienceId,
          createdAt: prevSegments[segId].updatedAt,
          updatedAt: segData.updatedAt
        })
        logger.debug('[Mailchimp Poll] Triggered for updated segment', { triggerId: trigger.id, segmentId: segId })
      }
    }
  }
}

/**
 * Poll for new audiences
 */
async function pollNewAudience(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  const resp = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists?count=100`,
    { headers }
  )
  if (!resp.ok) return
  const data = await resp.json()

  const currentAudienceIds = (data.lists || []).map((l: any) => l.id)
  const audienceMap = new Map((data.lists || []).map((l: any) => [l.id, l]))

  const newSnapshot = {
    type: 'new_audience',
    audienceIds: currentAudienceIds,
    updatedAt: new Date().toISOString()
  }

  await getSupabase()
    .from('trigger_resources')
    .update({
      config: {
        ...config,
        mailchimpSnapshot: newSnapshot,
        polling: { ...(config.polling || {}), lastPolledAt: new Date().toISOString() }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', trigger.id)

  if (!previousSnapshot) {
    logger.debug('[Mailchimp Poll] First poll - baseline established for new_audience', { triggerId: trigger.id })
    return
  }

  const prevIds = new Set(previousSnapshot.audienceIds || [])
  const newAudiences = currentAudienceIds.filter((id: string) => !prevIds.has(id))

  for (const audienceId of newAudiences) {
    const audience = audienceMap.get(audienceId)
    if (!audience) continue

    await triggerWorkflow(trigger, {
      audienceId: audience.id,
      name: audience.name,
      webId: audience.web_id,
      permissionReminder: audience.permission_reminder,
      company: audience.contact?.company,
      contactAddress: audience.contact,
      campaignDefaults: audience.campaign_defaults,
      memberCount: audience.stats?.member_count || 0,
      dateCreated: audience.date_created
    })

    logger.debug('[Mailchimp Poll] Triggered for new audience', {
      triggerId: trigger.id,
      audienceId: audience.id,
      name: audience.name
    })
  }
}

/**
 * Trigger workflow execution via the execute API
 */
async function triggerWorkflow(trigger: any, inputData: any): Promise<void> {
  const base = getWebhookBaseUrl()
  await fetch(`${base}/api/workflows/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': trigger.user_id
    },
    body: JSON.stringify({
      workflowId: trigger.workflow_id,
      testMode: false,
      executionMode: 'live',
      skipTriggers: true,
      inputData: {
        source: 'mailchimp-poll',
        triggerType: trigger.trigger_type,
        ...inputData,
        timestamp: inputData.timestamp || new Date().toISOString()
      }
    })
  })
}

export const mailchimpPollingHandler: PollingHandler = {
  id: 'mailchimp',
  canHandle: (trigger) => {
    const type = trigger?.trigger_type
    return type === 'mailchimp_trigger_email_opened' ||
      type === 'mailchimp_trigger_link_clicked' ||
      type === 'mailchimp_trigger_segment_updated' ||
      type === 'mailchimp_trigger_new_audience'
  },
  getIntervalMs: (userRole: string) => ROLE_POLL_INTERVAL_MS[userRole] ?? DEFAULT_POLL_INTERVAL_MS,
  poll: async ({ trigger }: PollingContext) => {
    let accessToken: string
    let dc: string

    try {
      const auth = await getMailchimpAuth(trigger.user_id)
      accessToken = auth.accessToken
      dc = auth.dc
    } catch (error: any) {
      logger.error('[Mailchimp Poll] Failed to get auth', { error: error.message, triggerId: trigger.id })
      return
    }

    try {
      switch (trigger.trigger_type) {
        case 'mailchimp_trigger_email_opened':
          await pollEmailOpened(trigger, accessToken, dc)
          break

        case 'mailchimp_trigger_link_clicked':
          await pollLinkClicked(trigger, accessToken, dc)
          break

        case 'mailchimp_trigger_segment_updated':
          await pollSegmentUpdated(trigger, accessToken, dc)
          break

        case 'mailchimp_trigger_new_audience':
          await pollNewAudience(trigger, accessToken, dc)
          break

        default:
          logger.debug('[Mailchimp Poll] Unknown trigger type', { triggerType: trigger.trigger_type })
      }
    } catch (error: any) {
      logger.error('[Mailchimp Poll] Error during polling', {
        error: error.message,
        triggerId: trigger.id,
        triggerType: trigger.trigger_type
      })
    }

    logger.debug('[Mailchimp Poll] Completed polling', {
      triggerId: trigger.id,
      triggerType: trigger.trigger_type,
      workflowId: trigger.workflow_id
    })
  }
}
