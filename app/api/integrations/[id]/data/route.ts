/**
 * Dynamic Integration Data Route
 *
 * Thin adapter that extracts the provider name from the [id] param
 * and delegates to the shared handler.
 *
 * Static provider routes (e.g., gmail/data/route.ts) take priority
 * in Next.js routing. This dynamic route handles all providers that
 * do not have a static route.
 */

import { type NextRequest } from 'next/server'
import { errorResponse } from '@/lib/utils/api-response'
import { handleIntegrationDataRequest } from '@/lib/integrations/data-route-handler'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Defensive: reject UUIDs — provider names are slugs, not IDs
  if (UUID_REGEX.test(id)) {
    return errorResponse('Invalid provider name', 400)
  }

  return handleIntegrationDataRequest(id, req)
}
