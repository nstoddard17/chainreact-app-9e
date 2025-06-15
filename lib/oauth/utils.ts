export function generateOAuthState(
  provider: string,
  userId: string,
  options: {
    reconnect?: boolean
    integrationId?: string
    returnUrl?: string
  } = {},
): string {
  const stateData = {
    provider,
    userId,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15),
    ...options,
  }

  return Buffer.from(JSON.stringify(stateData)).toString("base64")
}
