import { NextResponse } from "next/server"

// This is a simple endpoint to clear any caching that might be happening
// It doesn't actually do anything except return a 200 response
// The real purpose is to provide a way to invalidate any client-side caching
export async function POST() {
  console.log("Cache clearing request received")
  return NextResponse.json({ success: true, timestamp: Date.now() })
}
