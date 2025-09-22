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

export async function ensureAirtableWebhookForBase(userId: string, baseId: string, notificationUrl: string, tableName?: string) {
  // Fetch Airtable integration access token
  const { data: integ } = await supabase
    .from("integrations")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "airtable")
    .single()

  if (!integ) {
    throw new Error('Airtable integration not found')
  }

  const encryptionKey = process.env.ENCRYPTION_KEY!
  const token = decrypt(integ.access_token, encryptionKey)

  return ensureWebhookForBase(userId, token, baseId, notificationUrl, tableName)
}

async function ensureWebhookForBase(userId: string, token: string, baseId: string, notificationUrl: string, tableName?: string) {
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

  // First, list all bases to verify this base exists
  console.log(`🔍 Verifying base ${baseId} exists...`)
  const basesRes = await fetch(`https://api.airtable.com/v0/meta/bases`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!basesRes.ok) {
    const error = await basesRes.text()
    console.error('❌ Failed to list bases:', error)
    throw new Error('Failed to access Airtable bases. Token may be invalid.')
  }

  const basesData = await basesRes.json()
  const targetBase = basesData.bases.find((b: any) => b.id === baseId)

  if (!targetBase) {
    console.error(`❌ Base ${baseId} not found in user's bases`)
    console.log('Available bases:', basesData.bases.map((b: any) => ({ id: b.id, name: b.name })))
    throw new Error(`Base ${baseId} not found. Please use a valid base ID from your Airtable account.`)
  }

  console.log(`✅ Found base: ${targetBase.name} (${targetBase.id})`)

  // Now check detailed base access
  console.log(`🔍 Checking detailed access to base ${baseId}...`)
  const baseCheckRes = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!baseCheckRes.ok) {
    const baseError = await baseCheckRes.text()
    console.error(`❌ Cannot access base ${baseId}:`, baseCheckRes.status, baseError)

    let errorMessage = 'Cannot access Airtable base'
    try {
      const errorData = JSON.parse(baseError)
      if (errorData.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
        errorMessage = `Base ${baseId} not found or no access. Please check the base ID and ensure your Airtable account has access to this base.`
      }
    } catch {}

    throw new Error(errorMessage)
  }

  console.log(`✅ Base ${baseId} is accessible`)

  // Get table ID if table name is specified
  let tableId: string | undefined
  if (tableName) {
    console.log(`🔍 Looking for table "${tableName}" in base...`)
    const baseMetadata = await baseCheckRes.json()
    const table = baseMetadata.tables?.find((t: any) => t.name === tableName)
    if (table) {
      tableId = table.id
      console.log(`✅ Found table: ${tableName} (${tableId})`)
    } else {
      console.log(`⚠️ Table "${tableName}" not found, monitoring entire base`)
    }
  }

  // Create webhook via Airtable API
  const webhookPayload: any = {
    notificationUrl,
    specification: {
      options: {
        filters: {
          dataTypes: ["tableData"]
        }
      }
    }
  }

  // Add recordChangeScope if we have a specific table
  if (tableId) {
    webhookPayload.specification.options.filters.recordChangeScope = tableId
    console.log(`🎯 Webhook will monitor only table: ${tableName} (${tableId})`)
  } else {
    console.log(`🎯 Webhook will monitor entire base: ${baseId}`)
  }

  console.log(`📤 Creating webhook for base ${baseId} with payload:`, JSON.stringify(webhookPayload, null, 2))

  const res = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(webhookPayload)
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Failed to create Airtable webhook', res.status, err)

    // Parse error message for better user feedback
    let errorMessage = 'Failed to create Airtable webhook'
    try {
      const errorData = JSON.parse(err)
      if (errorData.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
        errorMessage = 'Invalid Airtable permissions or base not found. Please check that your Airtable integration has access to this base.'
      } else if (errorData.error?.message) {
        errorMessage = errorData.error.message
      }
    } catch {
      // If not JSON, use the raw error text
      if (err) errorMessage = err
    }

    throw new Error(errorMessage)
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

export async function unregisterAirtableWebhook(userId: string, baseId: string) {
  try {
    // Get webhook details
    const { data: webhook } = await supabase
      .from("airtable_webhooks")
      .select("webhook_id")
      .eq("user_id", userId)
      .eq("base_id", baseId)
      .eq("status", "active")
      .single()

    if (!webhook) return

    // Get Airtable token
    const { data: integ } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", userId)
      .eq("provider", "airtable")
      .single()

    if (!integ) return

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const token = decrypt(integ.access_token, encryptionKey)

    // Delete webhook via Airtable API
    await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhook.webhook_id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    // Mark as inactive in our database
    await supabase
      .from('airtable_webhooks')
      .update({ status: 'inactive' })
      .eq('webhook_id', webhook.webhook_id)
  } catch (error) {
    console.error('Failed to unregister Airtable webhook:', error)
  }
}

export async function fetchAirtableWebhookPayloads(baseId: string, webhookId: string, cursor?: number) {
  try {
    // Get the user and token for this webhook
    const { data: webhook } = await supabase
      .from("airtable_webhooks")
      .select("user_id")
      .eq("base_id", baseId)
      .eq("webhook_id", webhookId)
      .single()

    if (!webhook) throw new Error('Webhook not found')

    const { data: integ } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", webhook.user_id)
      .eq("provider", "airtable")
      .single()

    if (!integ) throw new Error('Integration not found')

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const token = decrypt(integ.access_token, encryptionKey)

    // Fetch payloads from Airtable
    let url = `https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhookId}/payloads`
    if (cursor) {
      url += `?cursor=${cursor}`
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch payloads: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch Airtable webhook payloads:', error)
    throw error
  }
}

export async function refreshAirtableWebhook(userId: string, baseId: string) {
  try {
    // Get existing webhook
    const { data: webhook } = await supabase
      .from("airtable_webhooks")
      .select("webhook_id")
      .eq("user_id", userId)
      .eq("base_id", baseId)
      .eq("status", "active")
      .single()

    if (!webhook) return

    // Get Airtable token
    const { data: integ } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("user_id", userId)
      .eq("provider", "airtable")
      .single()

    if (!integ) return

    const encryptionKey = process.env.ENCRYPTION_KEY!
    const token = decrypt(integ.access_token, encryptionKey)

    // Refresh webhook via Airtable API
    const response = await fetch(`https://api.airtable.com/v0/bases/${baseId}/webhooks/${webhook.webhook_id}/refresh`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (response.ok) {
      const data = await response.json()

      // Update expiration in database
      await supabase
        .from('airtable_webhooks')
        .update({
          expiration_time: data.expirationTime ? new Date(data.expirationTime).toISOString() : null
        })
        .eq('webhook_id', webhook.webhook_id)

      console.log('✅ Airtable webhook refreshed, new expiration:', data.expirationTime)
    }
  } catch (error) {
    console.error('Failed to refresh Airtable webhook:', error)
  }
}

export async function cleanupInactiveAirtableWebhooks() {
  try {
    // Get all expired webhooks
    const now = new Date()
    const { data: expiredWebhooks } = await supabase
      .from('airtable_webhooks')
      .select('user_id, base_id, webhook_id')
      .eq('status', 'active')
      .lt('expiration_time', now.toISOString())

    if (!expiredWebhooks || expiredWebhooks.length === 0) return

    for (const webhook of expiredWebhooks) {
      // Mark as inactive
      await supabase
        .from('airtable_webhooks')
        .update({ status: 'inactive' })
        .eq('webhook_id', webhook.webhook_id)

      console.log(`Marked webhook ${webhook.webhook_id} as inactive due to expiration`)
    }
  } catch (error) {
    console.error('Failed to cleanup inactive Airtable webhooks:', error)
  }
}


