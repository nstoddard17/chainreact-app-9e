import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { normalizeKey } from '@/lib/ai/businessContextFormatter'
import { requireActionLimit } from '@/lib/utils/require-entitlement'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = ['company_info', 'preferences', 'rules', 'mappings', 'style', 'defaults'] as const

/**
 * GET /api/business-context
 * List business context entries for the authenticated user.
 * Supports ?category= filter.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const category = request.nextUrl.searchParams.get('category')

    // Cast: business_context table not yet in generated Supabase types
    let query = (supabase as any)
      .from('business_context')
      .select('*')
      .eq('user_id', user.id)
      .order('usage_count', { ascending: false })

    if (category && VALID_CATEGORIES.includes(category as any)) {
      query = query.eq('category', category)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Failed to fetch business context', { error, userId: user.id })
      return errorResponse('Failed to fetch business context', 500)
    }

    return jsonResponse({ entries: data ?? [] })
  } catch (error) {
    logger.error('Business context GET error', { error })
    return errorResponse('Internal server error', 500)
  }
}

/**
 * POST /api/business-context
 * Create a new business context entry.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { key, value, category, relevance_tags, locked } = body

    if (!key || !value || !category) {
      return errorResponse('key, value, and category are required', 400)
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return errorResponse(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 400)
    }

    // Enforce plan-based entry limit
    const { count: currentCount } = await (supabase as any)
      .from('business_context')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const ent = await requireActionLimit(user.id, 'addBusinessContext', currentCount ?? 0)
    if (!ent.allowed) return ent.response

    // Normalize key to canonical form
    const normalizedKey = normalizeKey(key)

    const { data, error } = await (supabase as any)
      .from('business_context')
      .insert({
        user_id: user.id,
        key: normalizedKey,
        value,
        category,
        scope: 'user',
        source: 'manual',
        locked: locked ?? false,
        relevance_tags: relevance_tags ?? [],
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return errorResponse('A business context entry with this key already exists', 409)
      }
      logger.error('Failed to create business context entry', { error, userId: user.id })
      return errorResponse('Failed to create entry', 500)
    }

    return jsonResponse({ entry: data }, { status: 201 })
  } catch (error) {
    logger.error('Business context POST error', { error })
    return errorResponse('Internal server error', 500)
  }
}
