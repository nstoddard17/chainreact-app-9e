import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyName = searchParams.get('property')
    const integrationId = searchParams.get('integrationId')

    logger.debug('Property options request:', { propertyName, integrationId })

    if (!propertyName || !integrationId) {
      return NextResponse.json({ error: 'Property name and integration ID are required' }, { status: 400 })
    }

    // Get user from session
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    logger.debug('Auth check:', { hasUser: !!user, authError: authError?.message })
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get integration details
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('user_id', user.id)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
    }

    // Get HubSpot access token
    const { data: tokenData, error: tokenError } = await supabase
      .from('integration_tokens')
      .select('access_token, refresh_token')
      .eq('integration_id', integrationId)
      .eq('user_id', user.id)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'No valid token found' }, { status: 401 })
    }

    // Fetch property details from HubSpot
    const propertyResponse = await fetch(
      `https://api.hubapi.com/crm/v3/properties/contacts/${propertyName}`,
      {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!propertyResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch property details' }, { status: propertyResponse.status })
    }

    const propertyData = await propertyResponse.json()

    // Extract options if the property has them
    let options: { value: string; label: string }[] = []
    
    if (propertyData.options && Array.isArray(propertyData.options)) {
      options = propertyData.options.map((option: any) => ({
        value: option.value,
        label: option.label || option.value
      }))
    }

    return NextResponse.json({
      property: {
        name: propertyData.name,
        label: propertyData.label,
        type: propertyData.type,
        fieldType: propertyData.fieldType,
        options: options
      }
    })

  } catch (error) {
    logger.error('Error fetching HubSpot property options:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 