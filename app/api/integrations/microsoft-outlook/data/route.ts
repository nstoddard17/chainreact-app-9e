import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"
import { getOutlookEnhancedRecipients } from "./handlers/enhanced-recipients"

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const dataType = url.searchParams.get('type')
    const search = url.searchParams.get('search')

    const supabase = await createSupabaseServerClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get Outlook integration for the user
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft-outlook')
      .eq('status', 'connected')
      .single()

    if (integrationError || !integration) {
      console.error('[Outlook Data API] No connected integration found:', integrationError)
      return NextResponse.json(
        { error: 'No connected Microsoft Outlook integration found' },
        { status: 404 }
      )
    }

    // Handle different data types
    switch (dataType) {
      case 'outlook-enhanced-recipients': {
        const recipients = await getOutlookEnhancedRecipients(integration)

        // Filter by search if provided
        let filteredRecipients = recipients
        if (search) {
          const searchLower = search.toLowerCase()
          filteredRecipients = recipients.filter(r =>
            r.email.toLowerCase().includes(searchLower) ||
            r.label.toLowerCase().includes(searchLower)
          )
        }

        return NextResponse.json(filteredRecipients)
      }

      case 'outlook_folders': {
        // TODO: Implement folder fetching
        return NextResponse.json([
          { value: 'inbox', label: 'Inbox' },
          { value: 'sentitems', label: 'Sent Items' },
          { value: 'drafts', label: 'Drafts' },
          { value: 'deleteditems', label: 'Deleted Items' },
          { value: 'archive', label: 'Archive' }
        ])
      }

      case 'outlook_messages': {
        // TODO: Implement message fetching with search
        return NextResponse.json([])
      }

      case 'outlook_calendars': {
        // TODO: Implement calendar fetching
        return NextResponse.json([
          { value: 'default', label: 'Calendar' }
        ])
      }

      default:
        return NextResponse.json(
          { error: `Unknown data type: ${dataType}` },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('[Outlook Data API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Outlook data' },
      { status: 500 }
    )
  }
}