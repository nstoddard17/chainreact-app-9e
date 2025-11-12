/**
 * Admin Webhook Settings API
 *
 * Allows admins to configure webhooks for system notifications
 * (error reports, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

// Helper to create Supabase client at request time
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET - Fetch all webhook settings
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { data: settings, error} = await supabase
      .from('webhook_settings')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Failed to fetch webhook settings:', error)
      return NextResponse.json(
        { error: 'Failed to fetch webhook settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({ settings })

  } catch (error: any) {
    logger.error('Error in GET /api/admin/webhook-settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update webhook setting
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const { id, webhook_url, webhook_type, enabled, description, metadata } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Webhook setting ID is required' },
        { status: 400 }
      )
    }

    // Build update object
    const updates: any = {}
    if (webhook_url !== undefined) updates.webhook_url = webhook_url
    if (webhook_type !== undefined) updates.webhook_type = webhook_type
    if (enabled !== undefined) updates.enabled = enabled
    if (description !== undefined) updates.description = description
    if (metadata !== undefined) updates.metadata = metadata

    const { data, error } = await supabase
      .from('webhook_settings')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      logger.error('Failed to update webhook setting:', error)
      return NextResponse.json(
        { error: 'Failed to update webhook setting' },
        { status: 500 }
      )
    }

    logger.info('Webhook setting updated:', { id, updates })

    return NextResponse.json({ setting: data })

  } catch (error: any) {
    logger.error('Error in PUT /api/admin/webhook-settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new webhook setting
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await request.json()
    const { setting_key, webhook_url, webhook_type, enabled, description, metadata } = body

    if (!setting_key || !webhook_url || !webhook_type) {
      return NextResponse.json(
        { error: 'setting_key, webhook_url, and webhook_type are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('webhook_settings')
      .insert({
        setting_key,
        webhook_url,
        webhook_type,
        enabled: enabled ?? true,
        description,
        metadata: metadata || {}
      })
      .select()
      .single()

    if (error) {
      logger.error('Failed to create webhook setting:', error)
      return NextResponse.json(
        { error: 'Failed to create webhook setting' },
        { status: 500 }
      )
    }

    logger.info('Webhook setting created:', { setting_key, webhook_type })

    return NextResponse.json({ setting: data })

  } catch (error: any) {
    logger.error('Error in POST /api/admin/webhook-settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete webhook setting
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Webhook setting ID is required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('webhook_settings')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Failed to delete webhook setting:', error)
      return NextResponse.json(
        { error: 'Failed to delete webhook setting' },
        { status: 500 }
      )
    }

    logger.info('Webhook setting deleted:', { id })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    logger.error('Error in DELETE /api/admin/webhook-settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
