import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3001');
  console.log('✅ Page loaded');
  
  // Wait 2 seconds for React to mount
  await page.waitForTimeout(2000);
  
  // Check what's rendered
  const root = await page.$('#root');
  console.log('Root div found:', !!root);
  
  const app = await page.$('.app');
  console.log('App div found:', !!app);
  
  const folderPicker = await page.$('.folder-picker');
  console.log('Folder picker found:', !!folderPicker);
  
  // Check for input
  const input = await page.$('input');
  if (input) {
    console.log('✅ Input found');
    await input.fill('/tmp/gherkin-test');
    
    // Find and click load button
    const buttons = await page.$$('button');
    if (buttons.length > 0) {
      console.log(`✅ Found ${buttons.length} buttons`);
      await buttons[0].click();
      console.log('✅ Clicked load button');
      
      // Wait for canvas
      await page.waitForTimeout(2000);
      
      const canvasContainer = await page.$('.canvas-container');
      console.log('Canvas container found:', !!canvasContainer);
      
      const reactFlow = await page.$('.react-flow');
      console.log('React Flow found:', !!reactFlow);
      
      const nodes = await page.$$('.scenario-node');
      console.log(`Nodes found: ${nodes.length}`);
      
      // Check console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log('CONSOLE ERROR:', msg.text());
        }
      });
    }
  }
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/visual-gherkin-screenshot.png' });
  console.log('✅ Screenshot saved');
  
  await browser.close();
})();
