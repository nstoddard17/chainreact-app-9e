import type { Buffer } from 'buffer'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

import { logger } from '@/lib/utils/logger'

const DEFAULT_BUCKET = process.env.AIRTABLE_TEMP_STORAGE_BUCKET || 'workflow-files'
const DEFAULT_BASE_PATH = 'temp-attachments/airtable'
const SIGNED_URL_EXPIRATION_SECONDS = 60 * 60 // 1 hour
const CLEANUP_DELAY_MS = 60 * 10 * 1000 // 10 minutes

function sanitizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'attachment'
}

export interface SupabaseUploadResult {
  url: string
  filePath: string
}

let bucketInitialization: Promise<void> | null = null
let bucketIsPublic: boolean | null = null

async function ensureBucketReady(): Promise<void> {
  if (!bucketInitialization) {
    bucketInitialization = (async () => {
      const supabase = createAdminClient()
      const { data: buckets, error: listError } = await supabase.storage.listBuckets()
      if (listError) {
        logger.error('❌ [Airtable] Failed to list Supabase buckets:', listError)
        throw listError
      }

      const existing = buckets?.find((bucket) => bucket.name === DEFAULT_BUCKET)
      if (!existing) {
        const { error: createError } = await supabase.storage.createBucket(DEFAULT_BUCKET, {
          public: true,
          fileSizeLimit: 25 * 1024 * 1024 // 25MB, mirrors Gmail attachment rule
        })

        if (createError) {
          logger.error('❌ [Airtable] Failed to create Supabase bucket:', createError)
          throw createError
        }

        bucketIsPublic = true
      } else if (!existing.public) {
        bucketIsPublic = false
      } else {
        bucketIsPublic = true
      }
    })()
  }

  return bucketInitialization
}

export async function uploadTempAttachmentToSupabase(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<SupabaseUploadResult> {
  await ensureBucketReady()
  const supabase = createAdminClient()

  const safeFileName = sanitizePathSegment(fileName)
  const filePath = `${DEFAULT_BASE_PATH}/${randomUUID()}-${safeFileName}`

  const { error: uploadError } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true
    })

  if (uploadError) {
    throw new Error(`Failed to upload attachment to Supabase: ${uploadError.message}`)
  }

  let url: string | null = null

  if (bucketIsPublic) {
    const { data: publicUrlData } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(filePath)
    url = publicUrlData?.publicUrl ?? null
  }

  if (!url) {
    const { data: signedData, error: signedError } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRATION_SECONDS, { download: safeFileName })

    if (signedError || !signedData?.signedUrl) {
      await supabase.storage.from(DEFAULT_BUCKET).remove([filePath])
      const message = signedError?.message || 'unknown error creating signed URL'
      throw new Error(`Failed to create signed URL for Supabase attachment: ${message}`)
    }

    url = signedData.signedUrl
  }

  return {
    url,
    filePath
  }
}

export async function deleteTempAttachments(paths: string[]): Promise<void> {
  if (!paths.length) return

  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(DEFAULT_BUCKET).remove(paths)

  if (error) {
    throw new Error(`Failed to delete Supabase attachments: ${error.message}`)
  }
}

export function scheduleTempAttachmentCleanup(paths: string[], delayMs: number = CLEANUP_DELAY_MS): void {
  if (!paths.length) return

  setTimeout(async () => {
    try {
      await deleteTempAttachments(paths)
      logger.debug(`🧹 [Airtable] Cleaned up ${paths.length} temporary Supabase attachment(s)`) // eslint-disable-line no-console
    } catch (error) {
      logger.error('❌ [Airtable] Failed to clean up Supabase attachments:', error)
    }
  }, delayMs)
}
