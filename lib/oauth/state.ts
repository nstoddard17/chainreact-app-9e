import { randomBytes } from "crypto"

export interface OAuthStateData {
  reconnect?: boolean
  integrationId?: string
  timestamp?: number
}

export function generateOAuthState(provider: string, userId: string, data: OAuthStateData = {}): string {
  const stateData = {
    provider,
    userId,
    timestamp: Date.now(),
    ...data,
  }

  // Create a base64 encoded state with some randomness for security
  const randomSuffix = randomBytes(8).toString("hex")
  const stateString = JSON.stringify(stateData)
  const encodedState = Buffer.from(stateString).toString("base64")

  return `${encodedState}.${randomSuffix}`
}

export function parseOAuthState(state: string): {
  provider: string
  userId: string
  data: OAuthStateData
} | null {
  try {
    // Remove the random suffix
    const [encodedState] = state.split(".")
    const stateString = Buffer.from(encodedState, "base64").toString()
    const parsed = JSON.parse(stateString)

    return {
      provider: parsed.provider,
      userId: parsed.userId,
      data: {
        reconnect: parsed.reconnect,
        integrationId: parsed.integrationId,
        timestamp: parsed.timestamp,
      },
    }
  } catch (error) {
    console.error("Failed to parse OAuth state:", error)
    return null
  }
}
