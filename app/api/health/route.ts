import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Check database connectivity
    const supabase = await createSupabaseRouteHandlerClient()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('count', { count: 'exact', head: true })

    const dbHealthy = !error
    const dbResponseTime = Date.now() - startTime

    const baseResponse = {
      status: dbHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
      services: {
        database: {
          status: dbHealthy ? "healthy" : "unhealthy",
          responseTime: `${dbResponseTime}ms`,
          ...(error && { error: error.message })
        }
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0"
    }

    return jsonResponse(baseResponse)

  } catch (error) {
    return jsonResponse({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
      services: {
        database: {
          status: "unhealthy",
          error: error instanceof Error ? error.message : "Unknown error"
        }
      }
    }, { status: 503 })
  }
}
