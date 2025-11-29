import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/utils/logger'

export async function GET() {
  const authResult = await requireAdmin()
  if (!authResult.isAdmin) {
    return authResult.response
  }
  const { serviceClient: supabase } = authResult

  try {
    logger.debug('Checking execution_progress table...')

    // First check if the table exists
    const { data: tableExists, error: checkError } = await supabase
      .from('execution_progress')
      .select('id')
      .limit(1)

    if (!checkError) {
      logger.debug('✅ execution_progress table already exists')
      return jsonResponse({
        success: true,
        message: 'execution_progress table already exists',
        exists: true
      })
    }

    // If table doesn't exist, try to create it
    if (checkError?.message?.includes('relation') && checkError?.message?.includes('does not exist')) {
      logger.debug('Table does not exist, attempting to create it...')

      // Create the table using raw SQL
      const createTableSQL = `
        -- Create execution_progress table
        CREATE TABLE IF NOT EXISTS public.execution_progress (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          execution_id TEXT NOT NULL,
          workflow_id UUID NOT NULL,
          user_id UUID NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          current_node_id TEXT,
          current_node_name TEXT,
          completed_nodes JSONB DEFAULT '[]'::jsonb,
          pending_nodes JSONB DEFAULT '[]'::jsonb,
          failed_nodes JSONB DEFAULT '[]'::jsonb,
          node_outputs JSONB DEFAULT '{}'::jsonb,
          error_message TEXT,
          progress_percentage INTEGER DEFAULT 0,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ,

          -- Add foreign key constraints if tables exist
          CONSTRAINT fk_workflow FOREIGN KEY (workflow_id)
            REFERENCES workflows(id) ON DELETE CASCADE,
          CONSTRAINT fk_user FOREIGN KEY (user_id)
            REFERENCES auth.users(id) ON DELETE CASCADE
        );

        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_execution_progress_execution ON execution_progress(execution_id);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_workflow ON execution_progress(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_status ON execution_progress(execution_id, status);
        CREATE INDEX IF NOT EXISTS idx_execution_progress_user ON execution_progress(user_id);

        -- Enable Row Level Security
        ALTER TABLE execution_progress ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Users can view their own execution progress" ON execution_progress;
        DROP POLICY IF EXISTS "Users can create their own execution progress" ON execution_progress;
        DROP POLICY IF EXISTS "Users can update their own execution progress" ON execution_progress;
        DROP POLICY IF EXISTS "Users can delete their own execution progress" ON execution_progress;
        DROP POLICY IF EXISTS "Service role can manage all execution progress" ON execution_progress;

        -- Create RLS policies
        CREATE POLICY "Users can view their own execution progress"
          ON execution_progress FOR SELECT
          USING (auth.uid() = user_id);

        CREATE POLICY "Users can create their own execution progress"
          ON execution_progress FOR INSERT
          WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own execution progress"
          ON execution_progress FOR UPDATE
          USING (auth.uid() = user_id);

        CREATE POLICY "Users can delete their own execution progress"
          ON execution_progress FOR DELETE
          USING (auth.uid() = user_id);

        CREATE POLICY "Service role can manage all execution progress"
          ON execution_progress FOR ALL
          USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

        -- Create function to update updated_at timestamp
        CREATE OR REPLACE FUNCTION update_execution_progress_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        -- Create trigger for updated_at
        DROP TRIGGER IF EXISTS execution_progress_updated_at ON execution_progress;
        CREATE TRIGGER execution_progress_updated_at
          BEFORE UPDATE ON execution_progress
          FOR EACH ROW
          EXECUTE FUNCTION update_execution_progress_updated_at();
      `

      // Use the Supabase SQL admin endpoint
      const { error: createError } = await supabase.rpc('exec', {
        sql: createTableSQL
      }).catch((rpcError) => {
        logger.error('RPC exec failed:', rpcError)
        return {
          error: {
            message: 'Cannot create table programmatically. Please use the SQL script manually in Supabase dashboard.',
            details: rpcError
          }
        }
      })

      if (createError) {
        logger.error('Failed to create table:', createError)
        return jsonResponse({
          success: false,
          message: 'Failed to create execution_progress table. Please create it manually using the SQL script.',
          error: createError.message,
          sqlScript: '/CREATE_EXECUTION_PROGRESS_TABLE.sql'
        }, { status: 500 })
      }

      // Verify table was created
      const { error: verifyError } = await supabase
        .from('execution_progress')
        .select('id')
        .limit(1)

      if (verifyError) {
        logger.error('Table creation verification failed:', verifyError)
        return jsonResponse({
          success: false,
          message: 'Table creation could not be verified',
          error: verifyError.message
        }, { status: 500 })
      }

      logger.debug('✅ execution_progress table created successfully')
      return jsonResponse({
        success: true,
        message: 'execution_progress table created successfully',
        created: true
      })
    }

    // Some other error occurred
    return jsonResponse({
      success: false,
      message: 'Error checking execution_progress table',
      error: checkError.message
    }, { status: 500 })

  } catch (error: any) {
    logger.error('Error ensuring execution_progress table:', error)
    return jsonResponse({
      success: false,
      error: error.message || 'Failed to ensure execution_progress table',
      sqlScript: '/CREATE_EXECUTION_PROGRESS_TABLE.sql',
      instructions: 'Please run the SQL script manually in your Supabase dashboard'
    }, { status: 500 })
  }
}

export async function POST() {
  const authResult = await requireAdmin()
  if (!authResult.isAdmin) {
    return authResult.response
  }
  const { serviceClient: supabase } = authResult

  try {
    const { error } = await supabase
      .from('execution_progress')
      .select('id')
      .limit(1)

    if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
      return jsonResponse({
        exists: false,
        message: 'execution_progress table does not exist',
        instructions: [
          '1. Go to your Supabase dashboard',
          '2. Navigate to SQL Editor',
          '3. Create a new query',
          '4. Paste the contents of /CREATE_EXECUTION_PROGRESS_TABLE.sql',
          '5. Run the query',
          '6. The table will be created with all necessary indexes and RLS policies'
        ],
        sqlScript: '/CREATE_EXECUTION_PROGRESS_TABLE.sql'
      })
    }

    if (error) {
      return errorResponse('Error checking table existence', 500, { message: error.message })
    }

    return jsonResponse({
      exists: true,
      message: 'execution_progress table exists and is ready'
    })

  } catch (error: any) {
    return errorResponse(error.message || 'Failed to check table status', 500)
  }
}
