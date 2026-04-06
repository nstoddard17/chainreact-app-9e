import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/plans
 * Returns all active plans with pricing, limits, and features.
 * This is the single source of truth for plan data — no hardcoded values.
 * Public endpoint (no auth required) — plans are not sensitive.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: plans, error } = await supabase
      .from('plans')
      .select('id, name, display_name, description, price_monthly, price_yearly, sort_order, is_active, limits, features')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      logger.error('[Plans] Failed to fetch plans', { error: error.message })
      return errorResponse("Failed to fetch plans", 500)
    }

    // Normalize the response shape for consumers
    const normalized = (plans || []).map(plan => ({
      id: plan.id,
      name: plan.name,
      displayName: plan.display_name || plan.name,
      description: plan.description,
      priceMonthly: Number(plan.price_monthly) || 0,
      priceAnnual: Number(plan.price_yearly) || 0,
      sortOrder: plan.sort_order,
      limits: plan.limits || {},
      features: plan.features || [],
    }))

    return jsonResponse({ plans: normalized }, {
      headers: {
        // Cache for 5 minutes — plans don't change often
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    })
  } catch (error: any) {
    logger.error('[Plans] Unexpected error', { error: error.message })
    return errorResponse("Failed to fetch plans", 500)
  }
}
