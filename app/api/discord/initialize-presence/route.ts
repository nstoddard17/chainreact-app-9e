import { NextResponse } from "next/server"
import { initializeDiscordGateway, discordGateway } from "@/lib/integrations/discordGateway"

export async function POST() {
  try {
    await initializeDiscordGateway()
    
    const status = discordGateway.getStatus()
    
    return NextResponse.json({
      success: true,
      message: "Discord bot presence initialized",
      status
    })
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to initialize Discord bot presence"
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const status = discordGateway.getStatus()
    
    return NextResponse.json({
      success: true,
      status
    })
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to get Discord bot presence status"
    }, { status: 500 })
  }
} 