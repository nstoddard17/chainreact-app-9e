import { ActionResult } from '../index'
import { ExecutionContext } from '../../execution/types'
import { getMailchimpAuth } from './utils'

import { logger } from '@/lib/utils/logger'

/**
 * Get analytics and performance metrics for a specific campaign from Mailchimp
 */
export async function mailchimpGetCampaignStats(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    // Get Mailchimp auth with proper data center
    const { accessToken, dc } = await getMailchimpAuth(context.userId)

    // Resolve dynamic values
    const campaignId = context.dataFlowManager.resolveVariable(config.campaign_id)

    if (!campaignId) {
      throw new Error("Campaign is required")
    }

    // First get the campaign to access the report_summary
    const campaignUrl = `https://${dc}.api.mailchimp.com/3.0/campaigns/${campaignId}`

    logger.info('Getting campaign stats from Mailchimp', {
      campaignId
    })

    const campaignResponse = await fetch(campaignUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!campaignResponse.ok) {
      const errorData = await campaignResponse.json().catch(() => ({}))
      const errorMessage = errorData.detail || errorData.title || `HTTP ${campaignResponse.status}`

      if (campaignResponse.status === 404) {
        return {
          success: false,
          output: {
            found: false,
            campaignId: campaignId
          },
          message: `Campaign ${campaignId} not found`
        }
      }

      logger.error('Mailchimp API error getting campaign stats', {
        status: campaignResponse.status,
        error: errorMessage,
        errorData
      })
      throw new Error(`Mailchimp API error: ${errorMessage}`)
    }

    const campaignData = await campaignResponse.json()

    // Get detailed reports for sent campaigns
    let reportData: any = null
    if (campaignData.status === 'sent') {
      const reportUrl = `https://${dc}.api.mailchimp.com/3.0/reports/${campaignId}`

      const reportResponse = await fetch(reportUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (reportResponse.ok) {
        reportData = await reportResponse.json()
      }
    }

    // Use report data if available, otherwise use report_summary from campaign
    const stats = reportData || campaignData.report_summary || {}

    logger.info('Successfully retrieved campaign stats from Mailchimp', {
      campaignId: campaignData.id,
      hasReportData: !!reportData
    })

    return {
      success: true,
      output: {
        opens: stats.opens || 0,
        uniqueOpens: stats.unique_opens || 0,
        openRate: stats.open_rate || 0,
        clicks: stats.clicks || 0,
        uniqueClicks: stats.unique_clicks || stats.subscriber_clicks || 0,
        clickRate: stats.click_rate || 0,
        unsubscribes: stats.unsubscribed || 0,
        bounces: (stats.hard_bounces || 0) + (stats.soft_bounces || 0),
        emailsSent: stats.emails_sent || campaignData.emails_sent || 0,
        revenue: stats.ecommerce?.total_revenue || 0,
        campaignId: campaignData.id,
        campaignStatus: campaignData.status,
        sendTime: campaignData.send_time
      },
      message: `Successfully retrieved stats for campaign ${campaignId}`
    }
  } catch (error: any) {
    logger.error('Mailchimp Get Campaign Stats error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to get campaign stats from Mailchimp'
    }
  }
}
