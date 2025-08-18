import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/security/encryption'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(request: NextRequest) {
  try {
    const { integrationId, name } = await request.json()

    if (!integrationId || !name) {
      return NextResponse.json(
        { error: 'Missing required parameters: integrationId and name' },
        { status: 400 }
      )
    }

    // Get integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Gmail integration not found' },
        { status: 404 }
      )
    }

    // Decrypt the access token
    const accessToken = integration.access_token ? decrypt(integration.access_token) : null
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Gmail integration not properly configured' },
        { status: 401 }
      )
    }

    // Create the label in Gmail
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: `Gmail API error: ${response.status} - ${errorData.error?.message || response.statusText}` },
        { status: response.status }
      )
    }

    const labelData = await response.json()

    return NextResponse.json({
      success: true,
      id: labelData.id,
      name: labelData.name,
      type: labelData.type
    })

  } catch (error) {
    console.error('Error creating Gmail label:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { integrationId, labelId } = await request.json()

    if (!integrationId || !labelId) {
      return NextResponse.json(
        { error: 'Missing required parameters: integrationId and labelId' },
        { status: 400 }
      )
    }

    // Get integration from database
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json(
        { error: 'Gmail integration not found' },
        { status: 404 }
      )
    }

    // Decrypt the access token
    const accessToken = integration.access_token ? decrypt(integration.access_token) : null
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Gmail integration not properly configured' },
        { status: 401 }
      )
    }

    // Delete the label in Gmail
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      
      // Handle specific Gmail API errors
      if (response.status === 400 && errorData.error?.message?.includes('cannot be deleted')) {
        return NextResponse.json(
          { error: 'This label cannot be deleted (it may be a system label or required label)' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { error: `Gmail API error: ${response.status} - ${errorData.error?.message || response.statusText}` },
        { status: response.status }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Label deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting Gmail label:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}