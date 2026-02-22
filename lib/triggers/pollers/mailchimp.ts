import { createClient } from '@supabase/supabase-js'
import { getMailchimpAuth } from '@/lib/workflows/actions/mailchimp/utils'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'
import { logger } from '@/lib/utils/logger'
import { PollingContext, PollingHandler } from '@/lib/triggers/polling'
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'

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
    const resp = await fetchWithTimeout(
      `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=10`,
      { headers }, 10000
    )
    if (!resp.ok) {
      logger.warn('[Mailchimp Poll] Failed to fetch campaigns for email_opened', {
        triggerId: trigger.id, status: resp.status, statusText: resp.statusText
      })
      return
    }
    const data = await resp.json()
    campaignIds = (data.campaigns || []).map((c: any) => c.id)
  }

  const currentCampaigns: Record<string, any> = {}

  for (const campaignId of campaignIds) {
    const resp = await fetchWithTimeout(
      `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`,
      { headers }, 10000
    )
    if (!resp.ok) {
      logger.warn('[Mailchimp Poll] Failed to fetch report for campaign', {
        triggerId: trigger.id, campaignId, status: resp.status
      })
      continue
    }
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
    logger.info('[Mailchimp Poll] First poll - baseline established for email_opened', { triggerId: trigger.id })
    return
  }

  // Detect new opens
  let triggeredAny = false
  for (const campaignId of campaignIds) {
    const prevOpens = previousSnapshot.campaigns?.[campaignId]?.totalOpens || 0
    const currOpens = currentCampaigns[campaignId]?.totalOpens || 0

    logger.info('[Mailchimp Poll] Open count comparison', {
      triggerId: trigger.id,
      campaignId,
      previousOpens: prevOpens,
      currentOpens: currOpens,
      snapshotUpdatedAt: previousSnapshot.updatedAt
    })

    if (currOpens > prevOpens) {
      triggeredAny = true
      // Fetch the actual new open details
      const detailResp = await fetchWithTimeout(
        `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}/open-details?count=10&sort_field=timestamp&sort_dir=DESC`,
        { headers }, 10000
      )
      if (!detailResp.ok) {
        logger.warn('[Mailchimp Poll] Failed to fetch open details', {
          triggerId: trigger.id, campaignId, status: detailResp.status
        })
        continue
      }
      const detailData = await detailResp.json()

      // Get campaign info for title
      const campaignResp = await fetchWithTimeout(
        `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`,
        { headers }, 10000
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

      logger.info('[Mailchimp Poll] Triggered workflow for new email opens', {
        triggerId: trigger.id,
        campaignId,
        newOpens: newOpenCount
      })
    }
  }

  if (!triggeredAny) {
    logger.info('[Mailchimp Poll] No new email opens detected', {
      triggerId: trigger.id, campaignsChecked: campaignIds.length
    })
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
    const resp = await fetchWithTimeout(
      `https://${dc}.api.mailchimp.com/3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=10`,
      { headers }, 10000
    )
    if (!resp.ok) {
      logger.warn('[Mailchimp Poll] Failed to fetch campaigns for link_clicked', {
        triggerId: trigger.id, status: resp.status, statusText: resp.statusText
      })
      return
    }
    const data = await resp.json()
    campaignIds = (data.campaigns || []).map((c: any) => c.id)
  }

  const currentCampaigns: Record<string, any> = {}

  for (const campaignId of campaignIds) {
    const resp = await fetchWithTimeout(
      `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`,
      { headers }, 10000
    )
    if (!resp.ok) {
      logger.warn('[Mailchimp Poll] Failed to fetch report for campaign', {
        triggerId: trigger.id, campaignId, status: resp.status
      })
      continue
    }
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
    logger.info('[Mailchimp Poll] First poll - baseline established for link_clicked', { triggerId: trigger.id })
    return
  }

  let triggeredAny = false
  for (const campaignId of campaignIds) {
    const prevClicks = previousSnapshot.campaigns?.[campaignId]?.totalClicks || 0
    const currClicks = currentCampaigns[campaignId]?.totalClicks || 0

    if (currClicks > prevClicks) {
      triggeredAny = true
      const detailResp = await fetchWithTimeout(
        `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}/click-details?count=10&sort_field=total_clicks&sort_dir=DESC`,
        { headers }, 10000
      )
      if (!detailResp.ok) {
        logger.warn('[Mailchimp Poll] Failed to fetch click details', {
          triggerId: trigger.id, campaignId, status: detailResp.status
        })
        continue
      }
      const detailData = await detailResp.json()

      const campaignResp = await fetchWithTimeout(
        `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`,
        { headers }, 10000
      )
      const campaignData = campaignResp.ok ? await campaignResp.json() : {}
      const campaignTitle = campaignData.settings?.title || campaignData.settings?.subject_line || ''

      // Filter by URL if configured
      const urlFilter = config.url
      const urlsReport = (detailData.urls_clicked || [])
        .filter((u: any) => !urlFilter || u.url === urlFilter)

      for (const urlInfo of urlsReport) {
        // Get members who clicked this URL
        const membersResp = await fetchWithTimeout(
          `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}/click-details/${urlInfo.id}/members?count=5`,
          { headers }, 10000
        )
        if (!membersResp.ok) {
          logger.warn('[Mailchimp Poll] Failed to fetch click members', {
            triggerId: trigger.id, campaignId, status: membersResp.status
          })
          continue
        }
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

      logger.info('[Mailchimp Poll] Triggered workflow for new link clicks', {
        triggerId: trigger.id,
        campaignId,
        newClicks: currClicks - prevClicks
      })
    }
  }

  if (!triggeredAny) {
    logger.info('[Mailchimp Poll] No new link clicks detected', {
      triggerId: trigger.id, campaignsChecked: campaignIds.length
    })
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
    logger.warn('[Mailchimp Poll] No audienceId for segment_updated trigger', { triggerId: trigger.id })
    return
  }

  const resp = await fetchWithTimeout(
    `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/segments?count=100`,
    { headers }, 10000
  )
  if (!resp.ok) {
    logger.warn('[Mailchimp Poll] Failed to fetch segments', {
      triggerId: trigger.id, audienceId, status: resp.status, statusText: resp.statusText
    })
    return
  }
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
    logger.info('[Mailchimp Poll] First poll - baseline established for segment_updated', { triggerId: trigger.id })
    return
  }

  const eventTypeFilter = config.eventType || 'both'
  const prevSegments = previousSnapshot.segments || {}
  let triggeredAny = false

  // Check for new segments
  for (const [segId, segData] of Object.entries(currentSegments) as [string, any][]) {
    if (!prevSegments[segId]) {
      // New segment
      if (eventTypeFilter === 'both' || eventTypeFilter === 'created') {
        triggeredAny = true
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
        logger.info('[Mailchimp Poll] Triggered for new segment', { triggerId: trigger.id, segmentId: segId })
      }
    } else if (
      prevSegments[segId].memberCount !== segData.memberCount ||
      prevSegments[segId].updatedAt !== segData.updatedAt
    ) {
      // Updated segment
      if (eventTypeFilter === 'both' || eventTypeFilter === 'updated') {
        triggeredAny = true
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
        logger.info('[Mailchimp Poll] Triggered for updated segment', { triggerId: trigger.id, segmentId: segId })
      }
    }
  }

  if (!triggeredAny) {
    logger.info('[Mailchimp Poll] No segment changes detected', {
      triggerId: trigger.id, segmentsChecked: Object.keys(currentSegments).length
    })
  }
}

/**
 * Poll for new audiences
 */
async function pollNewAudience(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  const resp = await fetchWithTimeout(
    `https://${dc}.api.mailchimp.com/3.0/lists?count=100`,
    { headers }, 10000
  )
  if (!resp.ok) {
    logger.warn('[Mailchimp Poll] Failed to fetch audiences', {
      triggerId: trigger.id, status: resp.status, statusText: resp.statusText
    })
    return
  }
  const data = await resp.json()

  const currentAudienceIds = (data.lists || []).map((l: any) => l.id)
  const audienceMap = new Map((data.lists || []).map((l: any) => [l.id, l]))

  logger.info('[Mailchimp Poll] Fetched audiences from API', {
    triggerId: trigger.id,
    dc,
    audienceCount: currentAudienceIds.length,
    totalItems: data.total_items,
    audiences: (data.lists || []).map((l: any) => ({ id: l.id, name: l.name }))
  })

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
    logger.info('[Mailchimp Poll] First poll - baseline established for new_audience', {
      triggerId: trigger.id, audienceCount: currentAudienceIds.length
    })
    return
  }

  const prevIds = new Set(previousSnapshot.audienceIds || [])
  const newAudiences = currentAudienceIds.filter((id: string) => !prevIds.has(id))

  logger.info('[Mailchimp Poll] Snapshot comparison', {
    triggerId: trigger.id,
    previousIds: previousSnapshot.audienceIds || [],
    currentIds: currentAudienceIds,
    newIds: newAudiences
  })

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

    logger.info('[Mailchimp Poll] Triggered for new audience', {
      triggerId: trigger.id,
      audienceId: audience.id,
      name: audience.name
    })
  }

  if (newAudiences.length === 0) {
    logger.info('[Mailchimp Poll] No new audiences detected', {
      triggerId: trigger.id,
      currentCount: currentAudienceIds.length,
      previousCount: previousSnapshot.audienceIds?.length || 0
    })
  }
}

/**
 * Poll for new campaigns (draft, scheduled, or sent)
 */
async function pollNewCampaign(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  const statusFilter = config.status
  const audienceFilter = config.audienceId || config.audience_id

  let url = `https://${dc}.api.mailchimp.com/3.0/campaigns?sort_field=create_time&sort_dir=DESC&count=50`
  if (statusFilter && statusFilter !== 'all') {
    url += `&status=${statusFilter}`
  }
  if (audienceFilter) {
    url += `&list_id=${audienceFilter}`
  }

  const resp = await fetchWithTimeout(url, { headers }, 10000)
  if (!resp.ok) {
    logger.warn('[Mailchimp Poll] Failed to fetch campaigns for campaign_created', {
      triggerId: trigger.id, status: resp.status, statusText: resp.statusText
    })
    return
  }
  const data = await resp.json()

  const currentCampaignIds = (data.campaigns || []).map((c: any) => c.id)
  const campaignMap = new Map((data.campaigns || []).map((c: any) => [c.id, c]))

  logger.info('[Mailchimp Poll] Fetched campaigns from API', {
    triggerId: trigger.id,
    campaignCount: currentCampaignIds.length,
    statusFilter: statusFilter || 'all'
  })

  const newSnapshot = {
    type: 'new_campaign',
    campaignIds: currentCampaignIds,
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
    logger.info('[Mailchimp Poll] First poll - baseline established for campaign_created', {
      triggerId: trigger.id, campaignCount: currentCampaignIds.length
    })
    return
  }

  const prevIds = new Set(previousSnapshot.campaignIds || [])
  const newCampaigns = currentCampaignIds.filter((id: string) => !prevIds.has(id))

  for (const campaignId of newCampaigns) {
    const campaign = campaignMap.get(campaignId)
    if (!campaign) continue

    await triggerWorkflow(trigger, {
      campaignId: campaign.id,
      title: campaign.settings?.title || '',
      subject: campaign.settings?.subject_line || '',
      type: campaign.type || 'regular',
      status: campaign.status || '',
      audienceId: campaign.recipients?.list_id || '',
      sendTime: campaign.send_time || '',
      createTime: campaign.create_time || '',
      fromName: campaign.settings?.from_name || '',
      replyTo: campaign.settings?.reply_to || ''
    })

    logger.info('[Mailchimp Poll] Triggered for new campaign', {
      triggerId: trigger.id,
      campaignId: campaign.id,
      title: campaign.settings?.title,
      status: campaign.status
    })
  }

  if (newCampaigns.length === 0) {
    logger.info('[Mailchimp Poll] No new campaigns detected', {
      triggerId: trigger.id,
      currentCount: currentCampaignIds.length,
      previousCount: previousSnapshot.campaignIds?.length || 0
    })
  }
}

/**
 * Poll for new subscribers added to a specific segment
 */
async function pollSubscriberAddedToSegment(trigger: any, accessToken: string, dc: string): Promise<void> {
  const config = trigger.config || {}
  const previousSnapshot = config.mailchimpSnapshot
  const audienceId = config.audienceId || config.audience_id
  const segmentId = config.segmentId
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  if (!audienceId || !segmentId) {
    logger.warn('[Mailchimp Poll] Missing audienceId or segmentId for subscriber_added_to_segment', { triggerId: trigger.id })
    return
  }

  const resp = await fetchWithTimeout(
    `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/segments/${segmentId}/members?count=1000`,
    { headers }, 10000
  )
  if (!resp.ok) {
    logger.warn('[Mailchimp Poll] Failed to fetch segment members', {
      triggerId: trigger.id, audienceId, segmentId, status: resp.status, statusText: resp.statusText
    })
    return
  }
  const data = await resp.json()

  const currentMembers = (data.members || []) as any[]
  const currentEmails = currentMembers.map((m: any) => m.email_address)

  const newSnapshot = {
    type: 'subscriber_added_to_segment',
    memberEmails: currentEmails,
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
    logger.info('[Mailchimp Poll] First poll - baseline established for subscriber_added_to_segment', {
      triggerId: trigger.id, memberCount: currentEmails.length
    })
    return
  }

  const prevEmails = new Set(previousSnapshot.memberEmails || [])
  const newMembers = currentMembers.filter((m: any) => !prevEmails.has(m.email_address))

  for (const member of newMembers) {
    await triggerWorkflow(trigger, {
      email: member.email_address,
      subscriberId: member.id,
      firstName: member.merge_fields?.FNAME || '',
      lastName: member.merge_fields?.LNAME || '',
      status: member.status,
      segmentId,
      audienceId,
      addedAt: member.last_changed || new Date().toISOString()
    })

    logger.info('[Mailchimp Poll] Triggered for new segment member', {
      triggerId: trigger.id,
      segmentId,
      email: member.email_address
    })
  }

  if (newMembers.length === 0) {
    logger.info('[Mailchimp Poll] No new segment members detected', {
      triggerId: trigger.id, segmentId, currentCount: currentEmails.length, previousCount: prevEmails.size
    })
  }
}

/**
 * Trigger workflow execution via the execute API
 */
async function triggerWorkflow(trigger: any, inputData: any): Promise<void> {
  const base = getWebhookBaseUrl()
  try {
    const response = await fetchWithTimeout(`${base}/api/workflows/execute`, {
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
    }, 15000)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read response')
      logger.error('[Mailchimp Poll] Workflow execution failed', {
        status: response.status,
        error: errorText,
        workflowId: trigger.workflow_id,
        triggerId: trigger.id,
        triggerType: trigger.trigger_type
      })
    } else {
      logger.info('[Mailchimp Poll] Workflow execution triggered successfully', {
        workflowId: trigger.workflow_id,
        triggerId: trigger.id,
        triggerType: trigger.trigger_type
      })
    }
  } catch (error: any) {
    logger.error('[Mailchimp Poll] Failed to call workflow execute endpoint', {
      error: error.message,
      workflowId: trigger.workflow_id,
      triggerId: trigger.id,
      triggerType: trigger.trigger_type
    })
  }
}

export const mailchimpPollingHandler: PollingHandler = {
  id: 'mailchimp',
  canHandle: (trigger) => {
    const type = trigger?.trigger_type
    return type === 'mailchimp_trigger_email_opened' ||
      type === 'mailchimp_trigger_link_clicked' ||
      type === 'mailchimp_trigger_segment_updated' ||
      type === 'mailchimp_trigger_new_audience' ||
      type === 'mailchimp_trigger_campaign_created' ||
      type === 'mailchimp_trigger_subscriber_added_to_segment'
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

        case 'mailchimp_trigger_campaign_created':
          await pollNewCampaign(trigger, accessToken, dc)
          break

        case 'mailchimp_trigger_subscriber_added_to_segment':
          await pollSubscriberAddedToSegment(trigger, accessToken, dc)
          break

        default:
          logger.warn('[Mailchimp Poll] Unknown trigger type', { triggerType: trigger.trigger_type })
      }
    } catch (error: any) {
      logger.error('[Mailchimp Poll] Error during polling', {
        error: error.message,
        triggerId: trigger.id,
        triggerType: trigger.trigger_type
      })
    }

    logger.info('[Mailchimp Poll] Completed polling', {
      triggerId: trigger.id,
      triggerType: trigger.trigger_type,
      workflowId: trigger.workflow_id
    })
  }
}
