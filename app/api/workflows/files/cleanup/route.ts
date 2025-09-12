import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    // This endpoint should be called by a cron job or scheduled task
    // You might want to add authentication here (e.g., a secret key)
    const authHeader = request.headers.get('Authorization');
    const expectedToken = process.env.CLEANUP_SECRET_TOKEN; // Set this in your env
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get expired temporary files (older than 24 hours)
    const { data: expiredFiles, error: queryError } = await supabase
      .from('workflow_files')
      .select('id, file_path, user_id, node_id, workflow_id')
      .lt('expires_at', new Date().toISOString());

    if (queryError) {
      console.error('Error querying expired files:', queryError);
      return NextResponse.json({ 
        error: 'Failed to query expired files',
        details: queryError.message 
      }, { status: 500 });
    }

    if (!expiredFiles || expiredFiles.length === 0) {
      return NextResponse.json({ 
        message: 'No expired files to clean up',
        count: 0 
      });
    }

    console.log(`Found ${expiredFiles.length} expired files to clean up`);
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
          console.warn(`Failed to delete file from storage: ${file.file_path}`, storageError);
        }

        // Delete from database
        const { error: dbError } = await supabase
          .from('workflow_files')
          .delete()
          .eq('id', file.id);

        if (dbError) {
          console.error(`Failed to delete file record: ${file.id}`, dbError);
          failedCount++;
        } else {
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error cleaning up file ${file.id}:`, error);
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
          console.log(`Found ${orphanedFiles.length} orphaned files in storage`);
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
      console.error('Error cleaning up orphaned storage files:', error);
    }

    console.log(`Cleanup completed: ${cleanedCount} files cleaned, ${failedCount} failed`);

    return NextResponse.json({ 
      message: 'Cleanup completed',
      cleaned: cleanedCount,
      failed: failedCount,
      total: expiredFiles.length
    });

  } catch (error: any) {
    console.error('File cleanup error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to clean up expired files' 
    }, { status: 500 });
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

    return NextResponse.json({ 
      expiredFiles: expiredCount || 0,
      totalFiles: totalCount || 0,
      message: 'File cleanup status'
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to check cleanup status' 
    }, { status: 500 });
  }
}