import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/utils/supabase/server"

export async function GET() {
  const startTime = Date.now()
  
  try {
    // Check database connectivity
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('user_profiles')
      .select('count', { count: 'exact', head: true })
    
    const dbHealthy = !error
    const responseTime = Date.now() - startTime
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: {
          status: dbHealthy ? "healthy" : "unhealthy",
          responseTime: `${responseTime}ms`
        }
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0"
    })
  } catch (error) {
    return NextResponse.json({
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