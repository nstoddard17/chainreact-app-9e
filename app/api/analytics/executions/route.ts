import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { requireFeature } from '@/lib/utils/require-entitlement'

export async function GET() {
  const supabase = await createSupabaseRouteHandlerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return errorResponse('Unauthorized', 401)
  }

  const entitlement = await requireFeature(user.id, 'advancedAnalytics')
  if (!entitlement.allowed) return entitlement.response

  // Stub: return empty array until real analytics implementation
  return jsonResponse([])
}
