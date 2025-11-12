import puppeteer from 'puppeteer';

async function testPuppeteer() {
  console.log('🚀 Testing Puppeteer installation...\n');

  try {
    console.log('1️⃣ Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ Browser launched successfully\n');

    console.log('2️⃣ Creating new page...');
    const page = await browser.newPage();
    console.log('✅ Page created\n');

    console.log('3️⃣ Navigating to example.com...');
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });
    console.log('✅ Navigation successful\n');

    console.log('4️⃣ Getting page title...');
    const title = await page.title();
    console.log(`✅ Page title: "${title}"\n`);

    console.log('5️⃣ Capturing screenshot...');
    const screenshot = await page.screenshot({ type: 'png' });
    console.log(`✅ Screenshot captured (${screenshot.length} bytes)\n`);

    console.log('6️⃣ Extracting text content...');
    const content = await page.evaluate(() => document.body.innerText);
    console.log(`✅ Text extracted (${content.length} characters)\n`);

    await browser.close();
    console.log('✅ Browser closed\n');

    console.log('🎉 SUCCESS! Puppeteer is fully functional.\n');
    console.log('Your Extract Website Data node will work perfectly!');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\nPuppeteer failed to launch. See setup instructions below.\n');
    process.exit(1);
  }
}

testPuppeteer();
