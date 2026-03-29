import { createSupabaseServerClient } from "@/utils/supabase/server"
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import { validateIntegrationAccess } from '@/lib/workflows/security/integrationAccessValidator'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fetch an integration by ID from the database with permission validation.
 *
 * Security: Every call must provide either `userId` (validated against
 * integration_permissions via RPC) or `trustedServerContext: true`
 * (explicit opt-in bypass for server-internal operations). Calls with
 * neither will throw (fail closed).
 *
 * @param integrationId - The integration ID to fetch
 * @param options - Configuration (at least one of userId or trustedServerContext required)
 * @param options.supabaseClient - Optional Supabase client. If not provided, creates a service role client
 * @param options.userId - User ID for permission validation
 * @param options.trustedServerContext - Explicit bypass for server-internal operations (no current caller needs this)
 */
export async function getIntegrationById(
  integrationId: string,
  options?: {
    supabaseClient?: SupabaseClient
    userId?: string
    trustedServerContext?: boolean
  }
): Promise<any> {
  const isTrusted = options?.trustedServerContext === true
  const userId = options?.userId

  // Fail closed: missing execution context is an error, not a silent bypass
  if (!userId && !isTrusted) {
    logger.error(`[getIntegrationById] Called without userId or trustedServerContext for integration ${integrationId}`)
    throw new Error('Access denied: you do not have permission to use this integration. Contact the integration admin to request access.')
  }

  // Validate permission before fetching (unless trusted server context)
  if (userId && !isTrusted) {
    await validateIntegrationAccess(userId, integrationId)
  }

  // Use provided client or create a service role client for server-side access
  const supabase = options?.supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  logger.info(`[getIntegrationById] Fetching integration ${integrationId}${userId ? ` for user ${userId}` : ' (trusted context)'}`)

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("id", integrationId)
    .single()

  if (error || !integration) {
    // Same generic error as permission denial — no information leakage
    logger.error(`[getIntegrationById] Integration ${integrationId} not found or DB error:`, error)
    throw new Error('Access denied: you do not have permission to use this integration. Contact the integration admin to request access.')
  }

  logger.info(`[getIntegrationById] Found integration: provider=${integration.provider}, status=${integration.status}`)
  return integration
}
