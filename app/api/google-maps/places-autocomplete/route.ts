import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')
    
    if (!query) {
      return errorResponse('Query parameter is required' , 400)
    }

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY
    
    if (!googleMapsApiKey) {
      return errorResponse('Google Maps API key not configured' , 500)
    }

    // Call Google Places API
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${googleMapsApiKey}&types=establishment|geocode`
    )

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Maps API error: ${data.status} - ${data.error_message || 'Unknown error'}`)
    }

    return jsonResponse({
      predictions: data.predictions || [],
      status: data.status
    })

  } catch (error) {
    logger.error('Google Maps Places API error:', error)
    return errorResponse('Failed to fetch place suggestions' , 500)
  }
} 