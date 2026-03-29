/**
 * onenote Integration Data Route
 *
 * Thin adapter — delegates to shared handler with provider hardcoded to 'onenote'.
 * Required because this directory contains handler/type files, and the static
 * path takes priority over the dynamic [id]/data route in Next.js App Router.
 */

import { type NextRequest } from 'next/server'
import { handleIntegrationDataRequest } from '@/lib/integrations/data-route-handler'

export async function POST(req: NextRequest) {
  return handleIntegrationDataRequest('onenote', req)
}
