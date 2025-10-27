const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = 'https://xzwsdwllmrnrgbltibxt.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6d3Nkd2xsbXJucmdibHRpYnh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODU1NjI2NSwiZXhwIjoyMDY0MTMyMjY1fQ.DqarWXtuBjFjmElINOF8U6bQ8VZv9S4IsYKv4VnBTLs'

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
      const { PostgrestClient } = require('@supabase/postgrest-js')
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
