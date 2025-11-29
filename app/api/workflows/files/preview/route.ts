import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response';
import { createClient } from '@supabase/supabase-js';

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;

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

    // Get the file path from request body
    const { filePath } = await request.json();

    if (!filePath) {
      return errorResponse('No file path provided' , 400);
    }

    // Generate a public URL for the file (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from('workflow-files')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      logger.error('Error generating signed URL:', error);
      return errorResponse('Failed to generate preview URL' , 500);
    }

    return jsonResponse({
      success: true,
      previewUrl: data.signedUrl
    });

  } catch (error: any) {
    logger.error('Preview generation error:', error);
    return errorResponse(error.message || 'Failed to generate preview'
    , 500);
  }
}