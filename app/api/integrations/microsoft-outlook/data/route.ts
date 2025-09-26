
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { getOutlookEnhancedRecipients } from "./handlers/enhanced-recipients"

interface OutlookOptions {
  search?: string
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
      return [
        { value: 'default', label: 'Calendar' }
      ]
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

    if (!dataType) {
      return NextResponse.json({ error: 'Data type required' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: integration, error: integrationError } = await fetchIntegration({
      integrationId,
      userId: user.id
    })

    if (integrationError || !integration) {
      console.error('[Outlook Data API] No connected integration found:', integrationError)
      return NextResponse.json(
        { error: 'No connected Microsoft Outlook integration found' },
        { status: 404 }
      )
    }

    const data = await buildResponse(dataType, integration, { search })
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[Outlook Data API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Outlook data' },
      { status: 500 }
    )
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
      return NextResponse.json({ error: 'Data type required' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: integration, error: integrationError } = await fetchIntegration({
      integrationId,
      userId: user.id
    })

    if (integrationError || !integration) {
      console.error('[Outlook Data API] No connected integration found for POST:', integrationError)
      return NextResponse.json(
        { error: 'No connected Microsoft Outlook integration found' },
        { status: 404 }
      )
    }

    const data = await buildResponse(dataType, integration, options)
    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('[Outlook Data API] POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Outlook data' },
      { status: 500 }
    )
  }
}
