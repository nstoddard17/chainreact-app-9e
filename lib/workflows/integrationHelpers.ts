import { createSupabaseServerClient } from "@/utils/supabase/server"
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fetch an integration by ID from the database
 * Extracted to avoid circular dependencies between registry.ts and executeNode.ts
 *
 * @param integrationId - The integration ID to fetch
 * @param options - Optional configuration
 * @param options.supabaseClient - Optional Supabase client. If not provided, creates a service role client
 * @param options.userId - Optional user ID for validation (recommended for security)
 */
export async function getIntegrationById(
  integrationId: string,
  options?: {
    supabaseClient?: SupabaseClient
    userId?: string
  }
): Promise<any> {
  // Use provided client or create a service role client for server-side access
  const supabase = options?.supabaseClient || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  logger.debug(`[getIntegrationById] Fetching integration ${integrationId}${options?.userId ? ` for user ${options.userId}` : ''}`)

  let query = supabase
    .from("integrations")
    .select("*")
    .eq("id", integrationId)

  // Add user ID filter if provided (for security)
  if (options?.userId) {
    query = query.eq("user_id", options.userId)
  }

  const { data: integration, error } = await query.single()

  if (error) {
    logger.error(`[getIntegrationById] Database error fetching integration ${integrationId}:`, error)
    throw new Error(`Database error: ${error.message}`)
  }

  if (!integration) {
    const message = options?.userId
      ? `No integration found with ID ${integrationId} for this user`
      : `No integration found with ID ${integrationId}`
    logger.error(`[getIntegrationById] ${message}`)
    throw new Error(message)
  }

  logger.debug(`[getIntegrationById] Found integration: provider=${integration.provider}, status=${integration.status}`)
  return integration
}
