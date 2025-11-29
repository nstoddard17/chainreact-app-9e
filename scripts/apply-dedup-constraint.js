// Script to apply unique constraint to microsoft_webhook_dedup table
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

async function applyMigration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Read the migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251005_add_microsoft_dedup_unique_constraint.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  console.log('📝 Applying migration: 20251005_add_microsoft_dedup_unique_constraint.sql')
  console.log('SQL:', sql)

  try {
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      console.error('❌ Migration failed:', error)
      process.exit(1)
    }

    console.log('✅ Migration applied successfully!')
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

applyMigration()
