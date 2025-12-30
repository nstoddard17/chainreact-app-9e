
import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { getOutlookEnhancedRecipients } from "./handlers/enhanced-recipients"
import { getOutlookCalendars } from "./handlers/calendars"
import { getOutlookCalendarEvents } from "./handlers/calendar-events"
import { getOutlookContacts } from "./handlers/contacts"

import { logger } from '@/lib/utils/logger'

interface OutlookOptions {
  search?: string
  calendarId?: string
}

async function getServiceClient() {
  return await createSupabaseServiceClient()
}

async function fetchIntegration({
  integrationId,
  userId
}: {
  integrationId?: string
  userId?: string
}) {
  const supabase = await getServiceClient()
  let query = supabase
    .from('integrations')
    .select('*')
    .eq('provider', 'microsoft-outlook')
    .eq('status', 'connected')

  if (integrationId) {
    query = query.eq('id', integrationId)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }

  return query.single()
}

async function buildResponse(
  dataType: string,
  integration: any,
  options: OutlookOptions = {}
) {
  switch (dataType) {
    case 'outlook-enhanced-recipients': {
      const recipients = await getOutlookEnhancedRecipients(integration)
      if (!options.search) {
        return recipients
      }

      const searchLower = options.search.toLowerCase()
      return recipients.filter(recipient =>
        recipient.email.toLowerCase().includes(searchLower) ||
        recipient.label.toLowerCase().includes(searchLower)
      )
    }

    case 'outlook_folders': {
      return [
        { value: 'inbox', label: 'Inbox' },
        { value: 'sentitems', label: 'Sent Items' },
        { value: 'drafts', label: 'Drafts' },
        { value: 'deleteditems', label: 'Deleted Items' },
        { value: 'archive', label: 'Archive' }
      ]
    }

    case 'outlook_messages': {
      return []
    }

    case 'outlook_calendars': {
      const calendars = await getOutlookCalendars(integration)
      return calendars
    }

    case 'outlook_calendar_events': {
      const events = await getOutlookCalendarEvents(integration, {
        calendarId: options.calendarId,
        search: options.search
      })
      return events
    }

    case 'outlook_contacts': {
      const contacts = await getOutlookContacts(integration, {
        search: options.search
      })
      return contacts
    }

    default:
      throw new Error(`Unknown data type: ${dataType}`)
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const dataType = url.searchParams.get('type')
    const search = url.searchParams.get('search') || undefined
    const integrationId = url.searchParams.get('integrationId') || undefined
    const calendarId = url.searchParams.get('calendarId') || undefined

    if (!dataType) {
      return errorResponse('Data type required' , 400)
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { data: integration, error: integrationError } = await fetchIntegration({
      integrationId,
      userId: user.id
    })

    if (integrationError || !integration) {
      logger.error('[Outlook Data API] No connected integration found:', integrationError)
      return errorResponse('No connected Microsoft Outlook integration found' , 404)
    }

    const data = await buildResponse(dataType, integration, { search, calendarId })
    return jsonResponse({ data })
  } catch (error: any) {
    logger.error('[Outlook Data API] Error:', error)
    return errorResponse(error.message || 'Failed to fetch Outlook data' , 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { integrationId, dataType, options = {} } = body as {
      integrationId?: string
      dataType?: string
      options?: OutlookOptions
    }

    if (!dataType) {
      return errorResponse('Data type required' , 400)
    }

    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { data: integration, error: integrationError } = await fetchIntegration({
      integrationId,
      userId: user.id
    })

    if (integrationError || !integration) {
      logger.error('[Outlook Data API] No connected integration found for POST:', integrationError)
      return errorResponse('No connected Microsoft Outlook integration found' , 404)
    }

    const data = await buildResponse(dataType, integration, options)
    return jsonResponse({ data })
  } catch (error: any) {
    logger.error('[Outlook Data API] POST error:', error)
    return errorResponse(error.message || 'Failed to fetch Outlook data' , 500)
  }
}
