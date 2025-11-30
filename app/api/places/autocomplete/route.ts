import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { checkRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute (standard)
  const rateLimitResult = checkRateLimit(request, RateLimitPresets.standard)
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const input = searchParams.get("input")

    if (!input || input.trim().length < 2) {
      return jsonResponse({
        predictions: [],
        status: "INVALID_REQUEST"
      })
    }

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!googleMapsApiKey) {
      logger.error("Google Maps API key not configured")
      return jsonResponse({
        predictions: [],
        status: "REQUEST_DENIED",
        error: "Google Maps API key not configured"
      })
    }

    // Build the Google Places API request
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json")
    url.searchParams.set("input", input.trim())
    url.searchParams.set("key", googleMapsApiKey)
    url.searchParams.set("types", "address")
    url.searchParams.set("components", "country:us|country:ca|country:gb|country:au") // Limit to common countries

    const response = await fetch(url.toString())
    
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`)
    }

    const data = await response.json()

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      logger.error("Google Places API error:", data)
      return jsonResponse({
        predictions: [],
        status: data.status,
        error: data.error_message || "Google Places API error"
      })
    }

    return jsonResponse({
      predictions: data.predictions || [],
      status: data.status
    })

  } catch (error: any) {
    logger.error("Places autocomplete error:", error)
    return jsonResponse({
      predictions: [],
      status: "REQUEST_DENIED",
      error: error.message || "Internal server error"
    }, { status: 500 })
  }
} 