import { NextResponse } from "next/server"
import { configValidator } from "@/lib/config/validator"

export async function GET() {
  try {
    const validation = configValidator.validateAll()
    
    const healthStatus = {
      timestamp: new Date().toISOString(),
      overall: validation.isValid ? 'healthy' : 'unhealthy',
      components: Object.entries(validation.results).map(([component, result]) => ({
        component,
        status: result.isValid ? 'healthy' : 'unhealthy',
        missingVars: result.missingVars,
        message: result.isValid 
          ? `${component} configuration is valid`
          : `${component} configuration is missing: ${result.missingVars.join(', ')}`
      })),
      summary: {
        total: Object.keys(validation.results).length,
        healthy: Object.values(validation.results).filter(r => r.isValid).length,
        unhealthy: Object.values(validation.results).filter(r => !r.isValid).length
      }
    }

    const statusCode = validation.isValid ? 200 : 503

    return jsonResponse(healthStatus, { status: statusCode })
  } catch (error: any) {
    return jsonResponse({
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error.message || 'Unknown error during configuration validation'
    }, { status: 500 })
  }
} 