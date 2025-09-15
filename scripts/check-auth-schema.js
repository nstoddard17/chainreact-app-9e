import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key
const supabaseUrl = 'https://xzwsdwllmrnrgbltibxt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6d3Nkd2xsbXJucmdibHRpYnh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODU1NjI2NSwiZXhwIjoyMDY0MTMyMjY1fQ.DqarWXtuBjFjmElINOF8U6bQ8VZv9S4IsYKv4VnBTLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAuthSchema() {
  try {
    console.log('Checking auth.users table structure...\n');

    // Query to get column information from auth.users
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_auth_users_columns', {}, {
        get: true,
        head: false
      })
      .single();

    if (columnsError) {
      // If the function doesn't exist, let's create it and try again
      console.log('Creating helper function to inspect auth.users schema...');

      const { error: createFuncError } = await supabase.rpc('query', {
        query: `
          CREATE OR REPLACE FUNCTION get_auth_users_columns()
          RETURNS TABLE(
            column_name text,
            data_type text,
            is_nullable text,
            column_default text
          )
          LANGUAGE sql
          SECURITY DEFINER
          AS $$
            SELECT
              column_name::text,
              data_type::text,
              is_nullable::text,
              column_default::text
            FROM information_schema.columns
            WHERE table_schema = 'auth'
            AND table_name = 'users'
            ORDER BY ordinal_position;
          $$;
        `
      });

      if (createFuncError) {
        // Try a direct query approach
        console.log('Trying alternative approach...');

        // Get a sample user to understand the structure
        const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1
        });

        if (!usersError && users && users.users.length > 0) {
          console.log('Sample user structure:');
          const sampleUser = users.users[0];
          console.log(JSON.stringify({
            id: sampleUser.id,
            email: sampleUser.email,
            created_at: sampleUser.created_at,
            email_confirmed_at: sampleUser.email_confirmed_at,
            phone: sampleUser.phone,
            confirmed_at: sampleUser.confirmed_at,
            last_sign_in_at: sampleUser.last_sign_in_at,
            role: sampleUser.role,
            updated_at: sampleUser.updated_at
          }, null, 2));
        }
      }
    }

    // Generate SQL for manual user creation
    console.log('\n=== SQL to manually create a user in auth.users ===\n');

    console.log(`-- Option 1: Using Supabase's auth schema functions (RECOMMENDED)
-- This is the proper way to create users in Supabase

-- First, create the user using auth.users table
-- Note: You need to be connected as a superuser or service_role

-- Generate a unique UUID for the user
WITH new_user AS (
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES (
    gen_random_uuid(), -- or specify your own UUID
    'user@example.com', -- user's email
    crypt('password123', gen_salt('bf')), -- encrypted password
    NOW(), -- mark email as confirmed
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{}', -- user metadata
    false,
    'authenticated'
  )
  RETURNING id, email
)
-- Also create an identity record (required for auth to work properly)
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  new_user.id,
  jsonb_build_object(
    'sub', new_user.id::text,
    'email', new_user.email,
    'email_verified', true
  ),
  'email',
  new_user.id::text,
  NOW(),
  NOW(),
  NOW()
FROM new_user;

-- Option 2: Using Supabase Admin API (via JavaScript/Node.js)
-- This is the programmatic way and handles all the complexity for you
`);

    console.log(`
// JavaScript code to create a user programmatically:
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  '${supabaseUrl}',
  'YOUR_SERVICE_ROLE_KEY', // Use service role key, not anon key
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function createUser() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'user@example.com',
    password: 'password123',
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      first_name: 'John',
      last_name: 'Doe'
    }
  });

  if (error) {
    console.error('Error creating user:', error);
  } else {
    console.log('User created successfully:', data);

    // Also create user_profiles entry
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: data.user.id,
        email: data.user.email,
        display_name: 'John Doe',
        role: 'user' // or 'admin', 'beta-pro', etc.
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
    }
  }
}

createUser();
`);

    console.log('\n=== Important Notes ===\n');
    console.log('1. The auth.users table has constraints and triggers that must be respected');
    console.log('2. Always use encrypted passwords with crypt() function');
    console.log('3. The identities table must have a corresponding entry for login to work');
    console.log('4. Use the Supabase Admin API when possible - it handles all complexity');
    console.log('5. After creating in auth.users, also create entry in public.user_profiles');
    console.log('6. For beta testers, set role = "beta-pro" in user_profiles table');

  } catch (error) {
    console.error('Error:', error);
  }
}

checkAuthSchema();