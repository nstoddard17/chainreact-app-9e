import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabaseClient'

/**
 * Universal folder loader for storage services
 * Routes to the appropriate provider based on storageService parameter
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { storageService } = body

    if (!storageService) {
      return NextResponse.json(
        { error: 'storageService parameter is required' },
        { status: 400 }
      )
    }

    // Map storage service to the appropriate provider endpoint
    const providerMap: Record<string, string> = {
      'google_drive': '/api/integrations/google-drive/data',
      'onedrive': '/api/integrations/onedrive/data',
      'dropbox': '/api/integrations/dropbox/data'
    }

    const providerEndpoint = providerMap[storageService]

    if (!providerEndpoint) {
      return NextResponse.json(
        { error: `Unknown storage service: ${storageService}` },
        { status: 400 }
      )
    }

    // Forward the request to the appropriate provider
    // Construct the full URL for the internal API call
    const baseUrl = request.nextUrl.origin
    const fullUrl = `${baseUrl}${providerEndpoint}`

    const providerResponse = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('Cookie') || ''
      },
      body: JSON.stringify({
        ...body,
        resource: 'folders',
        provider: storageService.replace('_', '-') // Convert google_drive to google-drive
      })
    })

    if (!providerResponse.ok) {
      const errorText = await providerResponse.text()
      return NextResponse.json(
        { error: `Provider request failed: ${errorText}` },
        { status: providerResponse.status }
      )
    }

    const data = await providerResponse.json()
    return NextResponse.json(data)

  } catch (error: any) {
    console.error('[Folders API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
