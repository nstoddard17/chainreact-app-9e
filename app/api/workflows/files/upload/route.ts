import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createClient } from '@supabase/supabase-js';
import { FileStorageService } from '@/lib/storage/fileStorage';

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    // Get the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Unauthorized' , 401);
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create Supabase client with the user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401);
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const workflowId = formData.get('workflowId') as string;
    const nodeId = formData.get('nodeId') as string;

    if (!file) {
      return errorResponse('No file provided' , 400);
    }

    if (!nodeId) {
      return errorResponse('No node ID provided' , 400);
    }

    // Check file size (25MB limit for uploaded files)
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_FILE_SIZE) {
      return jsonResponse({ 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      }, { status: 400 });
    }

    // Generate unique file path
    const fileExtension = file.name.split('.').pop() || '';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileName = `${timestamp}_${randomId}.${fileExtension}`;
    const filePath = `workflow-files/${user.id}/${workflowId}/${nodeId}/${fileName}`;

    // Create storage bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'workflow-files');
    
    if (!bucketExists) {
      await supabase.storage.createBucket('workflow-files', {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE
      });
    }

    // Upload file to Supabase storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workflow-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true // Allow overwriting if file exists
      });

    if (uploadError) {
      logger.error('File upload error:', uploadError);
      return jsonResponse({ 
        error: `Failed to upload file: ${uploadError.message}` 
      }, { status: 500 });
    }

    // Check if there's an existing file for this node and delete it
    const { data: existingFiles } = await supabase
      .from('workflow_files')
      .select('file_path')
      .eq('user_id', user.id)
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId);

    if (existingFiles && existingFiles.length > 0) {
      // Delete old files from storage
      const filesToDelete = existingFiles.map(f => f.file_path);
      await supabase.storage.from('workflow-files').remove(filesToDelete);
      
      // Delete old records from database
      await supabase
        .from('workflow_files')
        .delete()
        .eq('user_id', user.id)
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId);
    }

    // For temporary nodes (not yet saved), we'll just store the file in storage
    // and return the info without creating a database record
    // The database record will be created when the node is actually saved
    
    // Check if the workflow and node actually exist in the database
    let isTemporaryUpload = false;
    
    // Check if workflow exists
    if (workflowId) {
      const { data: workflowExists } = await supabase
        .from('workflows')
        .select('id')
        .eq('id', workflowId)
        .eq('user_id', user.id)
        .single();
      
      if (!workflowExists) {
        isTemporaryUpload = true;
      } else if (nodeId) {
        // Workflow exists, check if node exists
        const { data: nodeExists } = await supabase
          .from('workflows_nodes')
          .select('id')
          .eq('id', nodeId)
          .eq('workflow_id', workflowId)
          .single();
        
        isTemporaryUpload = !nodeExists;
      }
    } else {
      isTemporaryUpload = true;
    }
    
    if (isTemporaryUpload) {
      // For temporary uploads, just return the file info without database storage
      // The file is already uploaded to Supabase storage
      logger.debug('Temporary file upload - skipping database record for:', { workflowId, nodeId, fileName: file.name });
      return jsonResponse({
        success: true,
        fileId: nodeId, // Use the node ID as identifier
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        filePath: filePath,
        isTemporary: true
      });
    }

    // For permanent nodes, store in database
    const { data: dbData, error: dbError } = await supabase
      .from('workflow_files')
      .insert({
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        file_path: filePath,
        user_id: user.id,
        workflow_id: workflowId,
        node_id: nodeId,
        expires_at: new Date('2099-12-31').toISOString()
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('workflow-files').remove([filePath]);
      logger.error('Database insert error:', dbError);
      return jsonResponse({ 
        error: `Failed to store file metadata: ${dbError.message}` 
      }, { status: 500 });
    }

    return jsonResponse({
      success: true,
      fileId: dbData.node_id, // Use node_id as the file identifier
      fileName: dbData.file_name,
      fileSize: dbData.file_size,
      fileType: dbData.file_type
    });

  } catch (error: any) {
    logger.error('File upload error:', error);
    return errorResponse(error.message || 'Failed to upload file' 
    , 500);
  }
}

// DELETE endpoint for file cleanup
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse('Unauthorized' , 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Unauthorized' , 401);
    }

    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');
    const workflowId = searchParams.get('workflowId');

    if (!nodeId || !workflowId) {
      return errorResponse('Missing nodeId or workflowId' , 400);
    }

    // Get file metadata
    const { data: files } = await supabase
      .from('workflow_files')
      .select('file_path')
      .eq('user_id', user.id)
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId);

    if (files && files.length > 0) {
      // Delete from storage
      const filePaths = files.map(f => f.file_path);
      await supabase.storage.from('workflow-files').remove(filePaths);
      
      // Delete from database
      await supabase
        .from('workflow_files')
        .delete()
        .eq('user_id', user.id)
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId);
    }

    return jsonResponse({ success: true });

  } catch (error: any) {
    logger.error('File deletion error:', error);
    return errorResponse(error.message || 'Failed to delete file' 
    , 500);
  }
}