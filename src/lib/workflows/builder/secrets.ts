import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from "crypto"

import { createSupabaseServiceClient } from "@/utils/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

interface SecretRecord {
  id: string
  name: string
  value_encrypted: string
  iv: string
  auth_tag: string
  workspace_id: string | null
  created_at: string
}

const ALGORITHM = "aes-256-gcm"
const KEY_LENGTH = 32

function getSecretKey(): Buffer {
  const keyBase64 = process.env.FLOW_V2_SECRET_KEY || process.env.SECRET_ENCRYPTION_KEY
  if (!keyBase64) {
    throw new Error("FLOW_V2_SECRET_KEY not configured")
  }
  const key = Buffer.from(keyBase64, keyBase64.length === KEY_LENGTH ? "utf8" : "base64")
  if (key.length !== KEY_LENGTH) {
    throw new Error("FLOW_V2_SECRET_KEY must be 32 bytes")
  }
  return key
}

export function encryptSecret(value: string): { encryptedValue: string; iv: string; authTag: string } {
  const key = getSecretKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  }
}

export function decryptSecret(encryptedValue: string, iv: string, authTag: string): string {
  const key = getSecretKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(authTag, "base64"))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ])
  return decrypted.toString("utf8")
}

async function resolveClient(client?: SupabaseClient<any>) {
  return client ?? (await createSupabaseServiceClient())
}

export async function listSecrets(workspaceId?: string, client?: SupabaseClient<any>) {
  const supabase = await resolveClient(client)
  const query = supabase
    .from("v2_secrets")
    .select("id, name, created_at")
    .order("created_at", { ascending: false })

  if (workspaceId) {
    query.eq("workspace_id", workspaceId)
  } else {
    query.is("workspace_id", null)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createSecret({
  name,
  value,
  workspaceId,
  createdBy,
}: {
  name: string
  value: string
  workspaceId?: string
  createdBy?: string
  client?: SupabaseClient<any>
}) {
  const encrypted = encryptSecret(value)
  const supabase = await resolveClient(client)
  const { data, error } = await supabase
    .from("v2_secrets")
    .insert({
      id: randomUUID(),
      name,
      value_encrypted: JSON.stringify({
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      }),
      workspace_id: workspaceId ?? null,
      created_by: createdBy ?? null,
    })
    .select("id, name, created_at")
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function getSecretValue(name: string, workspaceId?: string, client?: SupabaseClient<any>): Promise<string | null> {
  const supabase = await resolveClient(client)
  const query = supabase
    .from("v2_secrets")
    .select("value_encrypted")
    .eq("name", name)

  if (workspaceId) {
    query.eq("workspace_id", workspaceId)
  } else {
    query.is("workspace_id", null)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(error.message)
  if (!data?.value_encrypted) {
    return resolveEnvSecret(name)
  }
  const payload = JSON.parse(data.value_encrypted) as { encryptedValue: string; iv: string; authTag: string }
  return decryptSecret(payload.encryptedValue, payload.iv, payload.authTag)
}

export function resolveEnvSecret(name: string): string | null {
  const key = `FLOW_V2_SECRET_${name.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`
  return process.env[key] ?? null
}

export function isSecretPlaceholder(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("{{secret:") && value.endsWith("}}");
}

export function extractSecretName(value: string): string | null {
  if (!isSecretPlaceholder(value)) return null
  return value.slice(9, -2)
}

export function redactSecrets<T>(payload: T, secretValues: string[]): T {
  if (!payload || typeof payload !== "object") return payload
  const json = JSON.stringify(payload)
  let redacted = json
  secretValues.forEach((secret) => {
    if (!secret) return
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    redacted = redacted.replace(new RegExp(escaped, "g"), "••••")
  })
  return JSON.parse(redacted)
}

export async function resolveConfigSecrets(
  value: any,
  workspaceId?: string,
  client?: SupabaseClient<any>
): Promise<{ resolved: any; secretsUsed: string[]; secretValues: string[] }> {
  const secretsUsed: string[] = []
  const secretValues: string[] = []

  async function walk(current: any): Promise<any> {
    if (typeof current === "string") {
      const name = extractSecretName(current)
      if (!name) return current
      secretsUsed.push(name)
      const secretValue = await getSecretValue(name, workspaceId, client)
      if (secretValue) {
        secretValues.push(secretValue)
        return secretValue
      }
      return current
    }
    if (Array.isArray(current)) {
      const next = []
      for (const item of current) {
        next.push(await walk(item))
      }
      return next
    }
    if (current && typeof current === "object") {
      const entries = await Promise.all(
        Object.entries(current).map(async ([key, val]) => [key, await walk(val)])
      )
      return Object.fromEntries(entries)
    }
    return current
  }

  const resolved = await walk(value)
  return { resolved, secretsUsed, secretValues }
}
