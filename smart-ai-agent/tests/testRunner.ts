#!/usr/bin/env node

import { SmartAIAgentTestSuite } from './testAgentOutput.js';

async function runTests() {
  console.log('🚀 Starting Smart AI Agent Test Suite...\n');
  
  const testSuite = new SmartAIAgentTestSuite();
  
  try {
    // Run all tests
    const results = await testSuite.runAllTests();
    
    // Output detailed results
    console.log('\n📊 DETAILED RESULTS:');
    console.log('='.repeat(50));
    
    console.log(`Total Tests: ${results.totalTests}`);
    console.log(`Passed: ${results.passedTests} ✅`);
    console.log(`Failed: ${results.failedTests} ❌`);
    console.log(`Success Rate: ${((results.passedTests / results.totalTests) * 100).toFixed(1)}%`);
    console.log(`Total Execution Time: ${results.executionTime}ms`);
    
    // Category breakdown
    console.log('\n📋 CATEGORY BREAKDOWN:');
    for (const [category, stats] of Object.entries(results.coverage.categories)) {
      const percentage = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
      console.log(`  ${category}: ${stats.passed}/${stats.total} (${percentage}%)`);
    }
    
    // Show failed tests details
    if (results.failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`\n  Test: ${result.testId}`);
          console.log(`  Error: ${result.error || 'Assertion failed'}`);
          console.log(`  Execution Time: ${result.executionTime}ms`);
          
          const failedAssertions = result.assertions.filter(a => !a.passed);
          if (failedAssertions.length > 0) {
            console.log('  Failed Assertions:');
            failedAssertions.forEach(assertion => {
              console.log(`    - ${assertion.name}: ${assertion.message}`);
              console.log(`      Expected: ${JSON.stringify(assertion.expected)}`);
              console.log(`      Actual: ${JSON.stringify(assertion.actual)}`);
            });
          }
        });
    }
    
    // Test performance summary
    const avgExecutionTime = results.results.reduce((sum, r) => sum + r.executionTime, 0) / results.results.length;
    const slowestTest = results.results.reduce((max, r) => r.executionTime > max.executionTime ? r : max);
    const fastestTest = results.results.reduce((min, r) => r.executionTime < min.executionTime ? r : min);
    
    console.log('\n⚡ PERFORMANCE SUMMARY:');
    console.log(`  Average Test Time: ${avgExecutionTime.toFixed(0)}ms`);
    console.log(`  Slowest Test: ${slowestTest.testId} (${slowestTest.executionTime}ms)`);
    console.log(`  Fastest Test: ${fastestTest.testId} (${fastestTest.executionTime}ms)`);
    
    // Write results to file for CI
    const resultData = {
      timestamp: new Date().toISOString(),
      summary: {
        total: results.totalTests,
        passed: results.passedTests,
        failed: results.failedTests,
        successRate: (results.passedTests / results.totalTests) * 100,
        executionTime: results.executionTime
      },
      categories: results.coverage.categories,
      failedTests: results.results.filter(r => !r.passed).map(r => ({
        id: r.testId,
        error: r.error,
        executionTime: r.executionTime,
        failedAssertions: r.assertions.filter(a => !a.passed).length
      }))
    };
    
    await import('fs').then(fs => {
      fs.writeFileSync('test-results.json', JSON.stringify(resultData, null, 2));
      console.log('\n📄 Test results saved to test-results.json');
    });
    
    // Exit with appropriate code
    process.exit(results.failedTests > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Test suite failed to run:', error);
    process.exit(1);
  }
}

// Run specific test categories if provided via command line
const args = process.argv.slice(2);
if (args.length > 0) {
  const category = args[0] as any;
  
  const testSuite = new SmartAIAgentTestSuite();
  
  console.log(`🎯 Running ${category} tests only...\n`);
  
  testSuite.runTestCategory(category)
    .then(results => {
      console.log(`\n✅ ${category} tests completed`);
      console.log(`Passed: ${results.filter(r => r.passed).length}/${results.length}`);
      
      const failed = results.filter(r => !r.passed);
      if (failed.length > 0) {
        console.log('\n❌ Failed tests:');
        failed.forEach(r => console.log(`  - ${r.testId}: ${r.error}`));
        process.exit(1);
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Category test failed:', error);
      process.exit(1);
    });
} else {
  // Run all tests
  runTests();
}