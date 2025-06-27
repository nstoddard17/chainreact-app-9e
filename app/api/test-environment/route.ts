import { NextResponse } from "next/server"
import { getCurrentEnvironment, getEnvironmentConfig, getBaseUrl } from "@/lib/utils/environment"

export async function GET() {
  const env = getCurrentEnvironment()
  const config = getEnvironmentConfig()
  const baseUrl = getBaseUrl()
  
  return NextResponse.json({
    success: true,
    data: {
      currentEnvironment: env,
      environmentConfig: config,
      baseUrl: baseUrl,
      environmentVariables: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
        VERCEL_URL: process.env.VERCEL_URL,
        NEXT_PUBLIC_PROD_URL: process.env.NEXT_PUBLIC_PROD_URL,
        NEXT_PUBLIC_DEV_URL: process.env.NEXT_PUBLIC_DEV_URL,
        NEXT_PUBLIC_LOCAL_URL: process.env.NEXT_PUBLIC_LOCAL_URL,
      }
    }
  })
} 