import { chromium } from 'playwright';

async function simpleWorkflowTest() {
  console.log('🧪 Testing workflow changes with Chrome...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    channel: 'chrome',
    slowMo: 300
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate directly to builder
    console.log('📍 Going to workflow builder...');
    await page.goto('http://localhost:3000/workflows/builder');
    await page.waitForTimeout(3000);
    
    console.log('✅ Page loaded\n');
    
    // The browser is now open for manual testing
    console.log('📋 Manual Test Checklist:');
    console.log('');
    console.log('1. AI Workflow Generator:');
    console.log('   - Click "AI Workflow Generator" button');
    console.log('   - Enter a description and generate workflow');
    console.log('   - Verify AI Agent and chains are created');
    console.log('');
    console.log('2. Chain Spacing (450px):');
    console.log('   - Click plus button on AI Agent node');
    console.log('   - Add 2-3 chains');
    console.log('   - Verify chains are spaced 450px apart');
    console.log('');
    console.log('3. Edge Plus Buttons:');
    console.log('   - Hover over edges between actions');
    console.log('   - Verify plus button appears');
    console.log('   - Click to insert action between nodes');
    console.log('');
    console.log('4. Node Insertion:');
    console.log('   - When inserting between actions');
    console.log('   - Verify lower node moves down 160px');
    console.log('   - Verify add action button is preserved');
    console.log('');
    console.log('5. Airtable Config:');
    console.log('   - Add Airtable Create Record action');
    console.log('   - Verify Base and Table marked required');
    console.log('');
    console.log('6. Test Button:');
    console.log('   - Open any config modal');
    console.log('   - Verify button says "Test" not "Listen"');
    console.log('');
    
    console.log('🔍 Browser is open for manual testing...');
    console.log('Press Ctrl+C when done.\n');
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  await new Promise(() => {});
}

simpleWorkflowTest();