import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const getSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export interface StoredFile {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  filePath: string
  userId: string
  workflowId?: string
  createdAt: Date
  expiresAt: Date
}

export class FileStorageService {
  private static readonly TEMP_STORAGE_HOURS = 24 // Files expire after 24 hours
  private static readonly MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB limit

  /**
   * Store a file temporarily for workflow execution
   */
  static async storeFile(
    file: File,
    userId: string,
    workflowId?: string
  ): Promise<StoredFile> {
    try {
      const supabase = getSupabaseClient()
      
      // Validate file size
      if (file.size > this.MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} is too large. Maximum size is ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`)
      }

      // Generate unique file path
      const fileExtension = file.name.split('.').pop() || ''
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).substr(2, 9)
      const fileName = `${timestamp}_${randomId}.${fileExtension}`
      const filePath = `temp-attachments/${userId}/${fileName}`

      // Upload file to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('workflow-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('File upload error:', uploadError)
        throw new Error(`Failed to upload file: ${uploadError.message}`)
      }

      // Store file metadata in database
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + this.TEMP_STORAGE_HOURS)

      const { data: dbData, error: dbError } = await supabase
        .from('workflow_files')
        .insert({
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_path: filePath,
          user_id: userId,
          workflow_id: workflowId,
          expires_at: expiresAt.toISOString()
        })
        .select()
        .single()

      if (dbError) {
        // Clean up uploaded file if database insert fails
        await supabase.storage.from('workflow-files').remove([filePath])
        console.error('Database insert error:', dbError)
        throw new Error(`Failed to store file metadata: ${dbError.message}`)
      }

      return {
        id: dbData.id,
        fileName: dbData.file_name,
        fileType: dbData.file_type,
        fileSize: dbData.file_size,
        filePath: dbData.file_path,
        userId: dbData.user_id,
        workflowId: dbData.workflow_id,
        createdAt: new Date(dbData.created_at),
        expiresAt: new Date(dbData.expires_at)
      }
    } catch (error) {
      console.error('Error storing file:', error)
      throw error
    }
  }

  /**
   * Retrieve a stored file for workflow execution
   */
  static async getFile(fileId: string, userId: string): Promise<{ file: Blob; metadata: StoredFile } | null> {
    try {
      const supabase = getSupabaseClient()

      // Get file metadata
      const { data: metadata, error: metadataError } = await supabase
        .from('workflow_files')
        .select('*')
        .eq('id', fileId)
        .eq('user_id', userId)
        .single()

      if (metadataError || !metadata) {
        console.error('File metadata not found:', metadataError)
        return null
      }

      // Check if file has expired
      if (new Date() > new Date(metadata.expires_at)) {
        console.warn('File has expired:', fileId)
        await this.deleteFile(fileId, userId)
        return null
      }

      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('workflow-files')
        .download(metadata.file_path)

      if (downloadError || !fileData) {
        console.error('File download error:', downloadError)
        return null
      }

      return {
        file: fileData,
        metadata: {
          id: metadata.id,
          fileName: metadata.file_name,
          fileType: metadata.file_type,
          fileSize: metadata.file_size,
          filePath: metadata.file_path,
          userId: metadata.user_id,
          workflowId: metadata.workflow_id,
          createdAt: new Date(metadata.created_at),
          expiresAt: new Date(metadata.expires_at)
        }
      }
    } catch (error) {
      console.error('Error retrieving file:', error)
      return null
    }
  }

  /**
   * Delete a stored file
   */
  static async deleteFile(fileId: string, userId: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient()

      // Get file metadata first
      const { data: metadata, error: metadataError } = await supabase
        .from('workflow_files')
        .select('file_path')
        .eq('id', fileId)
        .eq('user_id', userId)
        .single()

      if (metadataError || !metadata) {
        console.error('File metadata not found for deletion:', metadataError)
        return false
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('workflow-files')
        .remove([metadata.file_path])

      if (storageError) {
        console.error('Storage deletion error:', storageError)
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('workflow_files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', userId)

      if (dbError) {
        console.error('Database deletion error:', dbError)
        return false
      }

      return true
    } catch (error) {
      console.error('Error deleting file:', error)
      return false
    }
  }

  /**
   * Clean up expired files (to be run as a scheduled job)
   */
  static async cleanupExpiredFiles(): Promise<number> {
    try {
      const supabase = getSupabaseClient()

      // Get expired files
      const { data: expiredFiles, error: queryError } = await supabase
        .from('workflow_files')
        .select('id, file_path, user_id')
        .lt('expires_at', new Date().toISOString())

      if (queryError) {
        console.error('Error querying expired files:', queryError)
        return 0
      }

      if (!expiredFiles || expiredFiles.length === 0) {
        return 0
      }

      let cleanedCount = 0

      // Delete each expired file
      for (const file of expiredFiles) {
        const deleted = await this.deleteFile(file.id, file.user_id)
        if (deleted) {
          cleanedCount++
        }
      }

      console.log(`Cleaned up ${cleanedCount} expired files`)
      return cleanedCount
    } catch (error) {
      console.error('Error cleaning up expired files:', error)
      return 0
    }
  }

  /**
   * Convert FileList to stored file references for workflow configuration
   */
  static async storeFilesFromConfig(
    files: FileList | File[],
    userId: string,
    workflowId?: string
  ): Promise<string[]> {
    const fileIds: string[] = []
    const filesArray = Array.from(files)

    for (const file of filesArray) {
      try {
        const storedFile = await this.storeFile(file, userId, workflowId)
        fileIds.push(storedFile.id)
      } catch (error) {
        console.error(`Error storing file ${file.name}:`, error)
        throw error
      }
    }

    return fileIds
  }

  /**
   * Retrieve files from stored file references for workflow execution
   */
  static async getFilesFromReferences(
    fileIds: string[],
    userId: string
  ): Promise<{ fileName: string; content: ArrayBuffer; mimeType: string }[]> {
    const files: { fileName: string; content: ArrayBuffer; mimeType: string }[] = []

    for (const fileId of fileIds) {
      try {
        const result = await this.getFile(fileId, userId)
        if (result) {
          const content = await result.file.arrayBuffer()
          files.push({
            fileName: result.metadata.fileName,
            content,
            mimeType: result.metadata.fileType
          })
        }
      } catch (error) {
        console.error(`Error retrieving file ${fileId}:`, error)
      }
    }

    return files
  }
} 