import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logger } from '@/lib/utils/logger'

export async function GET() {
  const testResults = [];
  
  try {
    // Create two clients - one with anon key (simulates user), one with service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Test 1: Service role can access everything
    logger.debug('Testing service role access...');
    const criticalTables = ['user_profiles', 'integrations', 'workflows', 'organizations', 'subscriptions'];
    
    for (const table of criticalTables) {
      const { data, error } = await serviceClient
        .from(table)
        .select('*')
        .limit(1);
      
      testResults.push({
        test: `Service role access to ${table}`,
        passed: !error,
        message: error ? error.message : `✅ Can access ${table}`
      });
    }

    // Test 2: Anonymous client is properly restricted
    logger.debug('Testing anonymous restrictions...');
    const restrictedTables = ['integrations', 'workflows', 'subscriptions', 'user_profiles'];
    
    for (const table of restrictedTables) {
      const { data, error } = await anonClient
        .from(table)
        .select('*')
        .limit(1);
      
      // We expect empty results or an error for anonymous users
      const isRestricted = !data || data.length === 0 || error !== null;
      
      testResults.push({
        test: `Anonymous restriction on ${table}`,
        passed: isRestricted,
        message: isRestricted 
          ? `✅ Properly restricted from ${table}`
          : `❌ Anonymous can access ${table}!`
      });
    }

    // Test 3: Public tables are accessible
    logger.debug('Testing public access...');
    const { data: plans, error: plansError } = await anonClient
      .from('plans')
      .select('*');
    
    testResults.push({
      test: 'Public access to plans',
      passed: !plansError && plans !== null,
      message: plansError 
        ? `❌ Cannot access public plans: ${plansError.message}`
        : `✅ Public can access plans (${plans?.length || 0} found)`
    });

    // Test 4: Check RLS is enabled on all tables
    logger.debug('Checking RLS status...');
    const { data: rlsCheck } = await serviceClient.rpc('query_database', {
      query: `
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE rowsecurity = true) as secured
        FROM pg_tables 
        WHERE schemaname = 'public'
      `
    }).single();

    if (rlsCheck) {
      testResults.push({
        test: 'All tables have RLS enabled',
        passed: rlsCheck.secured === rlsCheck.total,
        message: `${rlsCheck.secured}/${rlsCheck.total} tables have RLS enabled`
      });
    }

    // Calculate summary
    const passedTests = testResults.filter(t => t.passed).length;
    const totalTests = testResults.length;
    const allPassed = passedTests === totalTests;

    return NextResponse.json({
      success: true,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        allPassed
      },
      results: testResults,
      message: allPassed 
        ? '✅ All RLS tests passed! Your database is properly secured.'
        : `⚠️ ${totalTests - passedTests} test(s) failed. Review the results.`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('RLS test error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      results: testResults,
      note: 'Some tests may have passed before the error occurred'
    }, { status: 500 });
  }
}