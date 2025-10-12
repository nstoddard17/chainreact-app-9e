import { NextRequest, NextResponse } from 'next/server'
import { FileStorageService } from '@/lib/storage/fileStorage'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const workflowId = formData.get('workflowId') as string | null

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    // Validate files
    const maxFileSize = 25 * 1024 * 1024 // 25MB
    for (const file of files) {
      if (file.size > maxFileSize) {
        return NextResponse.json(
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

    return NextResponse.json({
      success: true,
      fileIds,
      count: files.length
    })

  } catch (error: any) {
    logger.error('File storage error:', error)
    return NextResponse.json(
      { error: 'Failed to store files', details: error.message },
      { status: 500 }
    )
  }
}

// Get stored files metadata
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const fileIds = searchParams.get('fileIds')?.split(',') || []

    if (fileIds.length === 0) {
      return NextResponse.json({ files: [] })
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

    return NextResponse.json({
      files: files || []
    })

  } catch (error: any) {
    logger.error('Error retrieving file metadata:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve files', details: error.message },
      { status: 500 }
    )
  }
}

// Delete stored files
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { fileIds } = await request.json()

    if (!fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'Invalid file IDs provided' },
        { status: 400 }
      )
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

    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    logger.error('File deletion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete files', details: error.message },
      { status: 500 }
    )
  }
} 