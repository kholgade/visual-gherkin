/**
 * Playwright headed test — loads SpecMaster feature files, exercises expand/collapse
 */
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 600 });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:3001');

  // --- Load directory ---
  console.log('Loading directory...');
  const input = page.locator('input[type="text"], input[placeholder]').first();
  await input.fill('/Users/yashodhankholgade/SpecMaster/tests');
  await page.keyboard.press('Enter');

  // Wait for canvas to appear (ReactFlow background renders an svg pattern)
  await page.waitForSelector('.react-flow__background', { timeout: 15000 });
  console.log('Canvas loaded.');
  await page.waitForTimeout(1500);

  // --- Collapse All (default state — already collapsed, so button says "Expand All") ---
  const toggleBtn = page.locator('button', { hasText: /Expand All|Collapse All/ });
  const btnText = await toggleBtn.textContent();
  console.log(`Button state: "${btnText?.trim()}"`);

  // Expand All
  if ((btnText ?? '').includes('Expand')) {
    console.log('Clicking Expand All...');
    await toggleBtn.click();
    await page.waitForTimeout(1500);
    console.log('Expanded all.');
  }

  await page.waitForTimeout(1000);

  // Collapse All
  console.log('Clicking Collapse All...');
  await toggleBtn.click();
  await page.waitForTimeout(1500);
  console.log('Collapsed all.');

  await page.waitForTimeout(1000);

  // Expand All again
  console.log('Expanding all again...');
  await toggleBtn.click();
  await page.waitForTimeout(1500);

  // --- Expand/collapse individual nodes ---
  // Find visible toggle buttons on nodes (▼ / ▶)
  const nodeToggleBtns = page.locator('.react-flow__node button');
  const count = await nodeToggleBtns.count();
  console.log(`Found ${count} node toggle buttons.`);

  if (count > 0) {
    // Collapse first node — use dispatchEvent to bypass viewport restriction
    console.log('Collapsing first node...');
    await nodeToggleBtns.first().dispatchEvent('click');
    await page.waitForTimeout(1000);

    // Collapse second node if available
    if (count > 1) {
      console.log('Collapsing second node...');
      await nodeToggleBtns.nth(1).dispatchEvent('click');
      await page.waitForTimeout(1000);
    }

    // Expand first node back
    console.log('Re-expanding first node...');
    await nodeToggleBtns.first().dispatchEvent('click');
    await page.waitForTimeout(1000);
  }

  // --- Undo a few times ---
  console.log('Undoing...');
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(800);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(800);
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(800);
  console.log('Undo done.');

  await page.waitForTimeout(2000);
  console.log('Done. Closing in 3s...');
  await page.waitForTimeout(3000);
  await browser.close();
})();
