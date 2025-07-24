import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
    }

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY
    
    if (!googleMapsApiKey) {
      return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 })
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

    return NextResponse.json({
      predictions: data.predictions || [],
      status: data.status
    })

  } catch (error) {
    console.error('Google Maps Places API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch place suggestions' },
      { status: 500 }
    )
  }
} 