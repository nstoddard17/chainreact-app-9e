import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    console.log('📎 [Gmail Attachment Upload] Starting upload process');
    
    // Get the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Create Supabase client with the user's token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const workflowId = formData.get('workflowId') as string;
    const nodeId = formData.get('nodeId') as string;

    console.log('📎 [Gmail Attachment Upload] Request details:', {
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      workflowId,
      nodeId,
      userId: user.id
    });

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!nodeId) {
      return NextResponse.json({ error: 'No node ID provided' }, { status: 400 });
    }

    // Check file size (25MB limit for Gmail attachments)
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (Gmail's limit)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      }, { status: 400 });
    }

    // Generate unique file path for Gmail attachments
    const fileExtension = file.name.split('.').pop() || '';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const fileName = `${timestamp}_${randomId}.${fileExtension}`;
    const filePath = `gmail-attachments/${user.id}/${workflowId}/${nodeId}/${fileName}`;

    console.log('📎 [Gmail Attachment Upload] Generated file path:', filePath);

    // Create storage bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === 'workflow-files');
    
    if (!bucketExists) {
      await supabase.storage.createBucket('workflow-files', {
        public: false,
        fileSizeLimit: MAX_FILE_SIZE
      });
    }

    // Convert file to buffer and get base64 for Gmail
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Content = buffer.toString('base64');
    
    // Upload file to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('workflow-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true // Allow overwriting if file exists
      });

    if (uploadError) {
      console.error('📎 [Gmail Attachment Upload] Storage upload error:', uploadError);
      return NextResponse.json({ 
        error: `Failed to upload file: ${uploadError.message}` 
      }, { status: 500 });
    }

    console.log('📎 [Gmail Attachment Upload] File uploaded to storage successfully');

    // Check if there's an existing attachment for this node in storage and delete it
    // Since we're not using the database, we need to check storage directly
    const existingBasePath = `gmail-attachments/${user.id}/${workflowId || 'temp'}/${nodeId}/`;
    const { data: existingFiles } = await supabase.storage
      .from('workflow-files')
      .list(existingBasePath);

    if (existingFiles && existingFiles.length > 0) {
      console.log('📎 [Gmail Attachment Upload] Deleting existing attachments:', existingFiles.length);
      
      // Delete old files from storage
      const filesToDelete = existingFiles.map(f => `${existingBasePath}${f.name}`);
      await supabase.storage.from('workflow-files').remove(filesToDelete);
    }

    // For Gmail attachments, always treat as temporary since nodes may not be saved yet
    // The workflow_files table has a foreign key constraint on node_id that requires it to exist in workflow_nodes
    // Since we're uploading before the workflow is saved, we can't use the database table
    const isTemporaryUpload = true; // Always temporary for Gmail attachments
    
    // Always return as temporary upload with file info embedded
    console.log('📎 [Gmail Attachment Upload] Returning file info with embedded content');
    
    return NextResponse.json({
      success: true,
      file: {
        id: `temp_${nodeId}_${timestamp}`,
        nodeId: nodeId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        filePath: filePath,
        isTemporary: true,
        // Include base64 content for immediate use
        content: base64Content,
        mimeType: file.type || 'application/octet-stream'
      }
    });

  } catch (error: any) {
    console.error('📎 [Gmail Attachment Upload] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to upload file' 
    }, { status: 500 });
  }
}

// DELETE endpoint for file cleanup
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');
    const workflowId = searchParams.get('workflowId');
    
    if (!nodeId) {
      return NextResponse.json({ error: 'Node ID required' }, { status: 400 });
    }

    console.log('📎 [Gmail Attachment Delete] Deleting attachments for node:', nodeId);

    // Since we're not using the database, construct the file path directly
    // The path pattern is: gmail-attachments/{userId}/{workflowId}/{nodeId}/{fileName}
    const basePath = `gmail-attachments/${user.id}/${workflowId || 'temp'}/${nodeId}/`;
    
    // List all files in this path
    const { data: files } = await supabase.storage
      .from('workflow-files')
      .list(basePath);
    
    if (files && files.length > 0) {
      // Delete all files for this node
      const paths = files.map(f => `${basePath}${f.name}`);
      const { error } = await supabase.storage.from('workflow-files').remove(paths);
      
      if (error) {
        console.error('📎 [Gmail Attachment Delete] Error deleting files:', error);
      } else {
        console.log('📎 [Gmail Attachment Delete] Deleted', files.length, 'files');
      }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('📎 [Gmail Attachment Delete] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to delete files' 
    }, { status: 500 });
  }
}