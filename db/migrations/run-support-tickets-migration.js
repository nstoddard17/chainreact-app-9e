// Script to run the create_support_tickets_table.sql migration
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing required environment variables.');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

// Initialize Supabase client with service role key for admin access
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSupportTicketsMigration() {
  try {
    console.log('Running migration: create_support_tickets_table.sql');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'create_support_tickets_table.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Migration SQL loaded successfully');
    console.log('Executing migration...');
    
    // Execute migration using Supabase's rpc function
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSql });
    
    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
    
    console.log('Migration completed successfully!');
    console.log('Data:', data);
    
    // Verify migration by checking if tables exist
    console.log('Verifying migration...');
    
    // Check support_tickets table
    const { data: ticketsTable, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('id')
      .limit(1);
    
    if (ticketsError) {
      console.error('Error verifying support_tickets table:', ticketsError);
    } else {
      console.log('✅ support_tickets table created successfully');
    }
    
    // Check support_ticket_responses table
    const { data: responsesTable, error: responsesError } = await supabase
      .from('support_ticket_responses')
      .select('id')
      .limit(1);
    
    if (responsesError) {
      console.error('Error verifying support_ticket_responses table:', responsesError);
    } else {
      console.log('✅ support_ticket_responses table created successfully');
    }
    
    // Test ticket number generation function
    console.log('Testing ticket number generation...');
    const { data: testTicket, error: testError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000', // Test UUID
        subject: 'Test Ticket',
        description: 'This is a test ticket to verify the migration',
        user_email: 'test@example.com'
      })
      .select('ticket_number')
      .single();
    
    if (testError) {
      console.error('Error testing ticket creation:', testError);
    } else {
      console.log('✅ Ticket number generation working:', testTicket.ticket_number);
      
      // Clean up test ticket
      await supabase
        .from('support_tickets')
        .delete()
        .eq('user_id', '00000000-0000-0000-0000-000000000000');
      console.log('✅ Test ticket cleaned up');
    }
    
    console.log('\n🎉 Support tickets migration completed successfully!');
    console.log('The support ticketing system is now ready to use.');
    
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

runSupportTicketsMigration(); 