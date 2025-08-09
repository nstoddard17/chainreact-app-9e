import { createClient } from "@supabase/supabase-js"
import { decrypt } from "@/lib/security/encryption"
import { getWebhookUrl } from "@/lib/utils/getBaseUrl"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function ensureAirtableWebhooksForUser(userId: string) {
  // Fetch Airtable integration access token
  const { data: integ } = await supabase
    .from("integrations")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "airtable")
    .single()
  if (!integ) return

  const encryptionKey = process.env.ENCRYPTION_KEY!
  const token = decrypt(integ.access_token, encryptionKey)

  // Fetch all bases for this user
  const { data: bases } = await supabase
    .from("user_bases")
    .select("base_id,name")
    .eq("user_id", userId)
    .eq("provider", "airtable")

  const notificationUrl = getWebhookUrl("airtable")

  for (const b of bases || []) {
    await ensureWebhookForBase(userId, token, b.base_id, notificationUrl)
  }
}

async function ensureWebhookForBase(userId: string, token: string, baseId: string, notificationUrl: string) {
  // Check if we already have a webhook
  const { data: existing } = await supabase
    .from("airtable_webhooks")
    .select("id, webhook_id, expiration_time, status")
    .eq("user_id", userId)
    .eq("base_id", baseId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  // If active and not expiring soon, keep it
  const expiringSoon = existing?.expiration_time && new Date(existing.expiration_time).getTime() - Date.now() < 7 * 24 * 3600 * 1000
  if (existing && !expiringSoon) return

  // Create webhook via Airtable API
  const res = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      notificationUrl,
      specification: { options: { filters: { dataTypes: ["tableData"] } } }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Failed to create Airtable webhook', res.status, err)
    return
  }
  const data = await res.json()

  await supabase
    .from('airtable_webhooks')
    .upsert({
      user_id: userId,
      base_id: baseId,
      webhook_id: data.id,
      mac_secret_base64: data.macSecretBase64,
      expiration_time: data.expirationTime ? new Date(data.expirationTime).toISOString() : null,
      status: 'active'
    }, { onConflict: 'user_id, base_id, webhook_id' })
}

export function validateAirtableSignature(body: string, headers: Record<string,string>, macSecretBase64: string): boolean {
  try {
    const signature = headers['x-airtable-signature-256'] || headers['X-Airtable-Signature-256']
    if (!signature) return false
    const crypto = require('crypto') as typeof import('crypto')
    const macKey = Buffer.from(macSecretBase64, 'base64')
    const hmac = crypto.createHmac('sha256', macKey)
    hmac.update(body, 'utf8')
    const expected = hmac.digest('hex')
    // signature is hex per Airtable docs for v0
    return signature === expected
  } catch {
    return false
  }
}


