import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const input = searchParams.get("input")

    if (!input || input.trim().length < 2) {
      return NextResponse.json({
        predictions: [],
        status: "INVALID_REQUEST"
      })
    }

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!googleMapsApiKey) {
      console.error("Google Maps API key not configured")
      return NextResponse.json({
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
      console.error("Google Places API error:", data)
      return NextResponse.json({
        predictions: [],
        status: data.status,
        error: data.error_message || "Google Places API error"
      })
    }

    return NextResponse.json({
      predictions: data.predictions || [],
      status: data.status
    })

  } catch (error: any) {
    console.error("Places autocomplete error:", error)
    return NextResponse.json({
      predictions: [],
      status: "REQUEST_DENIED",
      error: error.message || "Internal server error"
    }, { status: 500 })
  }
} 