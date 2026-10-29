import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.goto('file://' + process.cwd() + '/icon.html'); await p.evaluate(() => document.fonts.load('900 200px "Frank Ruhl Libre"')); await p.waitForTimeout(300);
for (const [name, mask] of [['any', false], ['maskable', true]]) {
  await p.evaluate(m => window.draw(m), mask);
  const data = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  (await import('node:fs')).writeFileSync(`icon-${name}-1024.png`, Buffer.from(data.split(',')[1], 'base64'));
}
await b.close();
