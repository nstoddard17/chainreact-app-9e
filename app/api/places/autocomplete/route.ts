import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  // Check if Google Places API key is configured
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.error('Google Places API key is not configured')
    return NextResponse.json({ 
      error: "Google Places API key is not configured",
      predictions: [] 
    }, { status: 200 })
  }

  try {
    console.log('Fetching place suggestions for query:', query)
    
    // Use Google Places API for autocomplete
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=establishment|geocode&key=${apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('Google Places API HTTP error:', response.status, response.statusText)
      throw new Error(`Google Places API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('Google Places API response status:', data.status)

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message)
      return NextResponse.json({ 
        error: `Google Places API error: ${data.status}`,
        predictions: [] 
      }, { status: 200 })
    }

    return NextResponse.json({
      predictions: data.predictions || []
    })
  } catch (error) {
    console.error('Error fetching place suggestions:', error)
    return NextResponse.json({ 
      error: "Failed to fetch place suggestions",
      predictions: [] 
    }, { status: 200 })
  }
} 