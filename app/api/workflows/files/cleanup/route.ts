import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;

export async function POST(request: Request) {
  try {
    // This endpoint should be called by a cron job or scheduled task
    // You might want to add authentication here (e.g., a secret key)
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN; // Set this in your env
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return errorResponse('Unauthorized' , 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get expired temporary files (older than 24 hours)
    const { data: expiredFiles, error: queryError } = await supabase
      .from('workflow_files')
      .select('id, file_path, user_id, node_id, workflow_id')
      .lt('expires_at', new Date().toISOString());

    if (queryError) {
      logger.error('Error querying expired files:', queryError);
      return errorResponse('Failed to query expired files', 500, { details: queryError.message 
       });
    }

    if (!expiredFiles || expiredFiles.length === 0) {
      return jsonResponse({ 
        message: 'No expired files to clean up',
        count: 0 
      });
    }

    logger.debug(`Found ${expiredFiles.length} expired files to clean up`);
    let cleanedCount = 0;
    let failedCount = 0;

    // Delete each expired file
    for (const file of expiredFiles) {
      try {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('workflow-files')
          .remove([file.file_path]);

        if (storageError) {
          logger.warn(`Failed to delete file from storage: ${file.file_path}`, storageError);
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('workflow_files')
          .delete()
          .eq('id', file.id);

        if (dbError) {
          logger.error(`Failed to delete file record: ${file.id}`, dbError);
          failedCount++;
        } else {
          cleanedCount++;
        }
      } catch (error) {
        logger.error(`Error cleaning up file ${file.id}:`, error);
        failedCount++;
      }
    }

    // Also clean up orphaned temporary files from storage
    // These are files in temp-attachments that don't have database records
    try {
      const { data: storageFiles } = await supabase.storage
        .from('workflow-files')
        .list('temp-attachments', {
          limit: 1000,
          offset: 0
        });

      if (storageFiles && storageFiles.length > 0) {
        // Get all file paths from database
        const { data: dbFiles } = await supabase
          .from('workflow_files')
          .select('file_path');

        const dbFilePaths = new Set(dbFiles?.map(f => f.file_path) || []);
        
        // Find orphaned files (in storage but not in database)
        const orphanedFiles = storageFiles.filter(file => {
          const fullPath = `temp-attachments/${file.name}`;
          return !dbFilePaths.has(fullPath);
        });

        if (orphanedFiles.length > 0) {
          logger.debug(`Found ${orphanedFiles.length} orphaned files in storage`);
          const orphanedPaths = orphanedFiles.map(f => `temp-attachments/${f.name}`);
          
          // Delete orphaned files from storage
          const { error: orphanError } = await supabase.storage
            .from('workflow-files')
            .remove(orphanedPaths);

          if (!orphanError) {
            cleanedCount += orphanedFiles.length;
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning up orphaned storage files:', error);
    }

    logger.debug(`Cleanup completed: ${cleanedCount} files cleaned, ${failedCount} failed`);

    return jsonResponse({ 
      message: 'Cleanup completed',
      cleaned: cleanedCount,
      failed: failedCount,
      total: expiredFiles.length
    });

  } catch (error: any) {
    logger.error('File cleanup error:', error);
    return errorResponse(error.message || 'Failed to clean up expired files' 
    , 500);
  }
}

// GET endpoint to check cleanup status
export async function GET(request: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Count expired files
    const { count: expiredCount } = await supabase
      .from('workflow_files')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString());

    // Count total files
    const { count: totalCount } = await supabase
      .from('workflow_files')
      .select('*', { count: 'exact', head: true });

    return jsonResponse({ 
      expiredFiles: expiredCount || 0,
      totalFiles: totalCount || 0,
      message: 'File cleanup status'
    });

  } catch (error: any) {
    logger.error('Status check error:', error);
    return errorResponse(error.message || 'Failed to check cleanup status' 
    , 500);
  }
}