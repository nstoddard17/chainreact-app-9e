/**
 * Process Scheduled Executions Cron Job (HTTP handler)
 *
 * Scheduled execution goes through the consolidated /api/cron/every-minute endpoint.
 * This route remains available for manual/debug triggers.
 */

import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/utils/api-response'
import { processScheduledExecutionsCore } from '@/lib/cron/scheduled-executions-core'

export async function GET(req: NextRequest) {
  const result = await processScheduledExecutionsCore()
  return jsonResponse(result)
}

export async function POST(req: NextRequest) {
  const result = await processScheduledExecutionsCore()
  return jsonResponse(result)
}
