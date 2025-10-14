import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { FileStorageService } from '@/lib/storage/fileStorage'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const workflowId = formData.get('workflowId') as string | null

    if (!files || files.length === 0) {
      return errorResponse('No files provided' , 400)
    }

    // Validate files
    const maxFileSize = 25 * 1024 * 1024 // 25MB
    for (const file of files) {
      if (file.size > maxFileSize) {
        return jsonResponse(
          { error: `File ${file.name} is too large. Maximum size is 25MB.` },
          { status: 400 }
        )
      }
    }

    // Store files
    const fileIds = await FileStorageService.storeFilesFromConfig(
      files,
      user.id,
      workflowId || undefined
    )

    return jsonResponse({
      success: true,
      fileIds,
      count: files.length
    })

  } catch (error: any) {
    logger.error('File storage error:', error)
    return errorResponse('Failed to store files', 500, { details: error.message  })
  }
}

// Get stored files metadata
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { searchParams } = new URL(request.url)
    const fileIds = searchParams.get('fileIds')?.split(',') || []

    if (fileIds.length === 0) {
      return jsonResponse({ files: [] })
    }

    // Get file metadata
    const { data: files, error } = await supabase
      .from('workflow_files')
      .select('id, file_name, file_type, file_size, created_at, expires_at')
      .in('id', fileIds)
      .eq('user_id', user.id)

    if (error) {
      throw error
    }

    return jsonResponse({
      files: files || []
    })

  } catch (error: any) {
    logger.error('Error retrieving file metadata:', error)
    return errorResponse('Failed to retrieve files', 500, { details: error.message  })
  }
}

// Delete stored files
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { fileIds } = await request.json()

    if (!fileIds || !Array.isArray(fileIds)) {
      return errorResponse('Invalid file IDs provided' , 400)
    }

    let deletedCount = 0
    const errors: string[] = []

    for (const fileId of fileIds) {
      try {
        const deleted = await FileStorageService.deleteFile(fileId, user.id)
        if (deleted) {
          deletedCount++
        } else {
          errors.push(`Failed to delete file ${fileId}`)
        }
      } catch (error: any) {
        errors.push(`Error deleting file ${fileId}: ${error.message}`)
      }
    }

    return jsonResponse({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    logger.error('File deletion error:', error)
    return errorResponse('Failed to delete files', 500, { details: error.message  })
  }
} 