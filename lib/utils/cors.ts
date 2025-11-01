import { NextRequest, NextResponse } from 'next/server'

/**
 * CORS Security Configuration
 *
 * This utility provides secure CORS headers for API routes.
 *
 * SECURITY NOTE:
 * - NEVER use 'Access-Control-Allow-Origin: *' with credentials
 * - Always validate origins against a whitelist
 * - Only allow specific, trusted domains
 * - Use the most secure protocol (HTTPS) when possible
 */

/**
 * Allowed origins for CORS requests
 * Only these domains can make authenticated requests to the API
 */
const ALLOWED_ORIGINS = [
  'https://www.chainreact.app',
  'https://chainreact.app',
  ...(process.env.NODE_ENV === 'development'
    ? [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        // Development tunnel services (if needed)
        ...(process.env.NGROK_URL ? [process.env.NGROK_URL] : [])
      ]
    : []
  )
]

/**
 * Check if the origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false

  // Exact match for allowed origins
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true
  }

  // In development, allow ngrok domains
  if (process.env.NODE_ENV === 'development') {
    const ngrokPattern = /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/
    if (ngrokPattern.test(origin)) {
      return true
    }
  }

  return false
}

/**
 * Get secure CORS headers for API responses
 *
 * @param request - The incoming request
 * @param options - CORS configuration options
 * @returns Object with CORS headers
 */
export function getCorsHeaders(
  request: NextRequest,
  options: {
    allowCredentials?: boolean
    allowedMethods?: string[]
    allowedHeaders?: string[]
    maxAge?: number
  } = {}
): Record<string, string> {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = {}

  // Only set CORS headers if origin is allowed
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin

    // Only allow credentials if explicitly requested AND origin is trusted
    if (options.allowCredentials) {
      headers['Access-Control-Allow-Credentials'] = 'true'
    }

    // Allowed methods (default to common safe methods)
    headers['Access-Control-Allow-Methods'] = (
      options.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    ).join(', ')

    // Allowed headers
    headers['Access-Control-Allow-Headers'] = (
      options.allowedHeaders || [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
      ]
    ).join(', ')

    // Max age for preflight cache (default 1 hour)
    headers['Access-Control-Max-Age'] = String(options.maxAge || 3600)
  }

  // Always set security headers
  headers['X-Content-Type-Options'] = 'nosniff'
  headers['X-Frame-Options'] = 'DENY'
  headers['Content-Security-Policy'] = "frame-ancestors 'none'"
  headers['X-XSS-Protection'] = '1; mode=block'
  headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

  // Prevent caching of API responses (sensitive/user-specific data)
  headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, private'
  headers['Pragma'] = 'no-cache'
  headers['Expires'] = '0'
  headers['Permissions-Policy'] = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    // 'ambient-light-sensor=()' removed - no longer recognized by browsers
    'autoplay=()',
    'encrypted-media=()',
    'picture-in-picture=()',
    'sync-xhr=()',
    'midi=()',
    'display-capture=()',
    'fullscreen=(self)',
  ].join(', ')
  headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'

  return headers
}

/**
 * Handle CORS preflight OPTIONS request
 *
 * @param request - The incoming request
 * @param options - CORS configuration options
 * @returns NextResponse with appropriate CORS headers
 */
export function handleCorsPreFlight(
  request: NextRequest,
  options: {
    allowCredentials?: boolean
    allowedMethods?: string[]
    allowedHeaders?: string[]
    maxAge?: number
  } = {}
): NextResponse {
  const headers = getCorsHeaders(request, options)

  return new NextResponse(null, {
    status: 204,
    headers,
  })
}

/**
 * Create a JSON response with CORS headers
 *
 * @param data - The response data
 * @param request - The incoming request
 * @param options - Additional options
 * @returns NextResponse with CORS headers
 */
export function corsJsonResponse(
  data: any,
  request: NextRequest,
  options: {
    status?: number
    allowCredentials?: boolean
    allowedMethods?: string[]
    allowedHeaders?: string[]
  } = {}
): NextResponse {
  const { status = 200, ...corsOptions } = options
  const headers = getCorsHeaders(request, corsOptions)

  return NextResponse.json(data, {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Middleware helper to add CORS headers to existing response
 *
 * @param response - The original response
 * @param request - The incoming request
 * @param options - CORS options
 * @returns Response with CORS headers added
 */
export function addCorsHeaders(
  response: NextResponse,
  request: NextRequest,
  options: {
    allowCredentials?: boolean
    allowedMethods?: string[]
    allowedHeaders?: string[]
  } = {}
): NextResponse {
  const headers = getCorsHeaders(request, options)

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}
