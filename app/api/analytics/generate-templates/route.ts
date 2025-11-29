/**
 * API Route: /api/analytics/generate-templates
 * Trigger dynamic template generation from clusters
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateTemplatesFromClusters, validateTemplate } from '@/lib/workflows/ai-agent/dynamicTemplates'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    // Create client inside handler to avoid build-time initialization
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('admin')
      .eq('id', user.id)
      .single()

    if (!profile?.admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get request body
    const body = await request.json().catch(() => ({}))
    const minSimilarPrompts = body.minSimilarPrompts || 5
    const minConfidence = body.minConfidence || 70

    logger.info('[Analytics API] Generating templates from clusters', {
      userId: user.id,
      minSimilarPrompts,
      minConfidence
    })

    // Generate templates
    const results = await generateTemplatesFromClusters(minSimilarPrompts, minConfidence)

    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    logger.info('[Analytics API] Template generation complete', {
      total: results.length,
      successful: successful.length,
      failed: failed.length
    })

    return NextResponse.json({
      success: true,
      results: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        templates: successful.map(r => ({
          templateId: r.templateId,
          confidence: r.confidence
        })),
        errors: failed.map(r => ({
          reason: r.reason,
          confidence: r.confidence
        }))
      }
    })

  } catch (error: any) {
    logger.error('[Analytics API] Error generating templates:', error)
    return NextResponse.json(
      { error: 'Failed to generate templates', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/analytics/generate-templates
 * Get list of pending (unvalidated) dynamic templates
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('admin')
      .eq('id', user.id)
      .single()

    if (!profile?.admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    logger.debug('[Analytics API] Fetching pending templates', {
      userId: user.id
    })

    // Get pending templates
    const { data: templates, error } = await supabase
      .from('dynamic_templates')
      .select('*')
      .eq('is_validated', false)
      .order('confidence_score', { ascending: false })

    if (error) {
      logger.error('[Analytics API] Failed to fetch pending templates:', error)
      return NextResponse.json(
        { error: 'Failed to fetch templates', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      templates: templates || [],
      count: templates?.length || 0
    })

  } catch (error: any) {
    logger.error('[Analytics API] Error fetching pending templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/analytics/generate-templates
 * Validate/activate a dynamic template
 */
export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('admin')
      .eq('id', user.id)
      .single()

    if (!profile?.admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get request body
    const body = await request.json()
    const { templateId, activate } = body

    if (!templateId) {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      )
    }

    logger.info('[Analytics API] Validating template', {
      userId: user.id,
      templateId,
      activate
    })

    // Validate template
    const success = await validateTemplate(templateId, user.id, activate !== false)

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to validate template' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      templateId,
      activated: activate !== false
    })

  } catch (error: any) {
    logger.error('[Analytics API] Error validating template:', error)
    return NextResponse.json(
      { error: 'Failed to validate template', details: error.message },
      { status: 500 }
    )
  }
}
