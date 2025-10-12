import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
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

    // Get the file path from request body
    const { filePath } = await request.json();

    if (!filePath) {
      return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
    }

    // Generate a public URL for the file (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from('workflow-files')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      logger.error('Error generating signed URL:', error);
      return NextResponse.json({ error: 'Failed to generate preview URL' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      previewUrl: data.signedUrl
    });

  } catch (error: any) {
    logger.error('Preview generation error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to generate preview'
    }, { status: 500 });
  }
}