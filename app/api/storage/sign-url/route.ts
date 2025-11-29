import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!

const ALLOWED_BUCKETS = new Set(['workflow-files', 'trello-attachments', 'user-avatars'])

const MAX_EXPIRY_SECONDS = 60 * 60 * 24 // 24 hours
const MIN_EXPIRY_SECONDS = 60 // 1 minute

const getObjectOwnerId = (bucket: string, objectPath: string, userId: string) => {
  const segments = objectPath.split('/').filter(Boolean)
  if (segments.length === 0) {
    return null
  }

  // Common patterns we use in storage helpers today:
  // workflow-files/<userId>/...
  // temp-attachments/<userId>/...
  // trello/<userId>/...
  // user avatars are stored as <userId>/...
  // Some older uploads were stored as workflow-files/<userId>/..., so handle that too

  const first = segments[0]
  const second = segments[1]

  if (first === userId) return userId

  if (bucket === 'workflow-files') {
    if (first === 'workflow-files' && second === userId) return userId
    if (first === 'temp-attachments' && second === userId) return userId
  }

  if (bucket === 'trello-attachments') {
    if (first === 'trello' && second === userId) return userId
  }

  // Fallback: if the second segment matches and the first is a known static prefix
  const knownPrefixes = ['workflow-files', 'temp-attachments', 'trello', 'trello-attachments']
  if (second === userId && knownPrefixes.includes(first)) {
    return userId
  }

  // For any other pattern, require the first segment to match userId
  return first
}

export async function POST(request: NextRequest) {
  if (!supabaseServiceKey) {
    logger.error('Missing SUPABASE_SECRET_KEY environment variable')
    return errorResponse('Server configuration error', 500)
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Unauthorized', 401)
  }

  const token = authHeader.slice('Bearer '.length)
  let body: { bucket?: string; path?: string; expiresIn?: number; downloadName?: string }

  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  const bucket = body.bucket?.trim()
  const rawPath = body.path?.trim()
  const expiresIn = Math.round(body.expiresIn ?? 600)
  const downloadName = body.downloadName?.trim()

  if (!bucket || !rawPath) {
    return errorResponse('Bucket and path are required', 400)
  }

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return errorResponse('Bucket not allowed', 403)
  }

  const expires = Math.max(MIN_EXPIRY_SECONDS, Math.min(MAX_EXPIRY_SECONDS, expiresIn))
  const objectPath = rawPath.replace(/^\/+/, '')

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return errorResponse('Unauthorized', 401)
  }

  const ownerId = getObjectOwnerId(bucket, objectPath, user.id)

  if (!ownerId || ownerId !== user.id) {
    logger.warn('Blocked signed URL request for unauthorized object', {
      bucket,
      objectPath,
      requester: user.id,
    })
    return errorResponse('Forbidden', 403)
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expires, downloadName ? { download: downloadName } : undefined)

  if (error || !data) {
    logger.error('Failed to create signed URL', { bucket, objectPath, error })
    return errorResponse('Failed to create signed URL', 500)
  }

  return jsonResponse({
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + expires * 1000,
    path: objectPath,
    bucket,
  })
}
