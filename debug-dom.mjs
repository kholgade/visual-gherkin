import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(1000);
  
  // Load data
  const input = await page.$('input');
  await input.fill('/tmp/gherkin-test');
  const buttons = await page.$$('button');
  await buttons[0].click();
  await page.waitForTimeout(2000);
  
  // Get first node's computed style
  const firstNode = await page.$('.scenario-node');
  if (firstNode) {
    const style = await firstNode.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        position: computed.position,
        width: computed.width,
        height: computed.height,
        left: computed.left,
        top: computed.top,
        zIndex: computed.zIndex,
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
      };
    });
    console.log('First node style:', JSON.stringify(style, null, 2));
  }
  
  // Check React Flow container
  const reactFlow = await page.$('.react-flow');
  if (reactFlow) {
    const style = await reactFlow.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        width: computed.width,
        height: computed.height,
        display: computed.display,
        backgroundColor: computed.backgroundColor,
      };
    });
    console.log('React Flow style:', JSON.stringify(style, null, 2));
  }
  
  // Check canvas container
  const canvas = await page.$('.canvas-container');
  if (canvas) {
    const style = await canvas.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        width: computed.width,
        height: computed.height,
        display: computed.display,
        flex: computed.flex,
      };
    });
    console.log('Canvas container style:', JSON.stringify(style, null, 2));
  }
  
  await browser.close();
})();
