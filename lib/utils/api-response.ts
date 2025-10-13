/**
 * API Response Helpers
 * Provides consistent response formatting with proper headers
 */

import { NextResponse } from 'next/server'

/**
 * Create a JSON response with proper Content-Type charset
 * Use this instead of NextResponse.json() or Response.json()
 */
export function jsonResponse(data: any, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(data, init)

  // Add charset=utf-8 to Content-Type header
  response.headers.set('Content-Type', 'application/json; charset=utf-8')

  return response
}

/**
 * Create an error response with proper headers
 */
export function errorResponse(
  error: string,
  status: number = 500,
  details?: any
): NextResponse {
  return jsonResponse(
    { error, ...(details && { details }) },
    { status }
  )
}

/**
 * Create a success response with data
 */
export function successResponse(data: any, status: number = 200): NextResponse {
  return jsonResponse(data, { status })
}
