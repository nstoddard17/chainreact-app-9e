const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local if available
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') })
} catch (e) {
  // dotenv not available, rely on environment variables
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  if (!supabaseUrl) console.error('   - NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseServiceKey) console.error('   - SUPABASE_SECRET_KEY')
  console.error('\nPlease set these in your .env.local file or environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeSql() {
  try {
    const sqlPath = path.join(__dirname, '../supabase/migrations/20251027025743_allow_standalone_team_creation.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('Executing RLS policy migration...')

    // Execute the SQL using the REST API
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async (err) => {
      // If the RPC doesn't exist, try direct query
      console.log('Trying direct query execution...')
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: sql })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response.json()
    })

    if (error) {
      console.error('Error executing SQL:', error)
      process.exit(1)
    }

    console.log('✅ RLS policies updated successfully!')
    console.log('You can now revert the API to use the regular client instead of service role.')
  } catch (error) {
    console.error('Failed to execute SQL:', error.message)
    process.exit(1)
  }
}

executeSql()
