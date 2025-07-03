import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

async function fetchGmailLabels(integrationId?: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log('🔍 Gmail labels: Looking for integration, integrationId:', integrationId, 'userId:', user.id)

  // Get Gmail integration - try integrationId first, then fall back to user/provider lookup
  let integration = null
  
  if (integrationId) {
    console.log('🔍 Gmail labels: Trying to find integration by ID...')
    const { data: integrationById, error: byIdError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('user_id', user.id) // Security: ensure user owns this integration
      .single()
    console.log('🔍 Gmail labels: Integration by ID result:', integrationById, 'error:', byIdError)
    integration = integrationById
  }
  
  // Fallback to finding by user and provider if integrationId lookup failed
  if (!integration) {
    console.log('🔍 Gmail labels: Trying to find integration by user/provider...')
    const { data: integrationByProvider, error: byProviderError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'gmail')
      .eq('status', 'connected')
      .single()
    console.log('🔍 Gmail labels: Integration by provider result:', integrationByProvider, 'error:', byProviderError)
    integration = integrationByProvider
  }

  if (!integration) {
    console.log('❌ Gmail labels: No integration found!')
    return NextResponse.json({ 
      success: false, 
      error: "Integration not found: gmail" 
    }, { status: 404 })
  }

  console.log('✅ Gmail labels: Integration found:', integration.id, 'status:', integration.status)

  // Use access token directly from integration record
  const accessToken = integration.access_token
  if (!accessToken) {
    console.error('❌ Gmail labels: No access token in integration record')
    return NextResponse.json({ 
      success: false, 
      error: "No access token available" 
    }, { status: 500 })
  }

  console.log('🔑 Gmail labels: Using access token from integration record')

  // Fetch Gmail labels
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status}`)
  }

  const labelsData = await response.json()
  const labels = labelsData.labels || []

  // Filter out system labels that users typically don't want to see
  const userLabels = labels.filter((label: any) => 
    label.type === 'user' || 
    ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT', 'STARRED'].includes(label.id)
  )

  return NextResponse.json({
    success: true,
    data: userLabels.map((label: any) => ({
      value: label.id,
      label: label.name
    }))
  })
}

export async function GET() {
  try {
    return await fetchGmailLabels()
  } catch (error: any) {
    console.error("Error fetching Gmail labels:", error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Failed to fetch Gmail labels" 
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { integrationId } = body
    return await fetchGmailLabels(integrationId)
  } catch (error: any) {
    console.error("Error fetching Gmail labels:", error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Failed to fetch Gmail labels" 
    }, { status: 500 })
  }
} 