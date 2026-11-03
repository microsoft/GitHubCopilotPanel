// Browser verification: node demo/test/browser-verify.mjs [baseUrl] [shotsDir]
// Needs playwright-core and an installed Edge/Chrome (no browser download). Blocks every non-local request.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:8765/';
const shots = process.argv[3] || 'shots';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [], external = [];
await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base) || u.startsWith('data:')) r.continue(); else { external.push(u); r.abort(); } });
page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push('console: ' + m.text()); });
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
const check = (c, msg) => { if (!c) problems.push('FAIL: ' + msg); else console.log('ok  ' + msg); };
const txt = () => page.locator('#canvas').innerText();

await page.goto(base);
const pages = ['p0start', 'p1exec', 'p2reach', 'p3depth', 'p5models', 'p4value', 'p5appx'];
for (const p of pages) {
  await page.click(`[data-page=${p}]`);
  const t = await txt();
  check(!/NaN|undefined|Infinity/.test(t), `${p}: no NaN/undefined`);
  check((await page.locator('#canvas .card').count()) >= 4, `${p}: cards rendered`);
  await page.screenshot({ path: `${shots}/${p}.png` });
}
await page.click('[data-page=p1exec]');
const lic0 = await page.locator('.kpi .val').first().innerText();
check(lic0 === '200', 'exec licensed = 200 (got ' + lic0 + ')');
// organisation slicer
await page.click('.slicer details[data-key=org] summary');
await page.locator('.slicer details[data-key=org] input').nth(0).uncheck();
const lic1 = await page.locator('.kpi .val').first().innerText();
check(+lic1 < 200, 'org slicer reduces licensed (' + lic1 + ')');
await page.click('#resetf');
// date range
await page.fill('#d0', '2026-05-03'); await page.locator('#d0').dispatchEvent('change');
await page.screenshot({ path: `${shots}/exec-daterange.png` });
await page.click('#resetf');
// group-by + cross-filter
await page.click('[data-page=p2reach]');
await page.selectOption('#gb', 'fn');
check((await page.locator('#reachT tbody tr').count()) > 3, 'group by Function rows');
const before = await page.locator('.kpi .val').first().innerText();
await page.locator('#reachT tbody tr').first().click();
const after = await page.locator('.kpi .val').first().innerText();
check(+after < +before, `row click cross-filters (${before} -> ${after})`);
check(await page.locator('#chip').isVisible(), 'clear chip visible');
await page.screenshot({ path: `${shots}/reach-crossfilter.png` });
await page.click('#clear');
// sorting
await page.locator('#reachT th').nth(1).click();
// assumptions
await page.click('[data-page=p4value]');
const v0 = await page.locator('.kpi .val').nth(1).innerText();
await page.click('#assume-btn');
await page.fill('[data-cfg=loadedCost]', '300000'); await page.locator('[data-cfg=loadedCost]').dispatchEvent('change');
await page.click('#assume [data-close]');
const v1 = await page.locator('.kpi .val').nth(1).innerText();
check(v0 !== v1, `assumptions drive value (${v0} -> ${v1})`);
await page.click('#about-btn'); await page.screenshot({ path: `${shots}/about.png` }); await page.click('#about [data-close]');
check(/SYNTHETIC DATA/.test(await page.locator('#status').innerText()), 'synthetic banner shown');
await page.setViewportSize({ width: 800, height: 600 });
await page.screenshot({ path: `${shots}/narrow.png` });
check(external.length === 0, 'no external requests ' + JSON.stringify(external));
await browser.close();
const bad = problems.filter(p => !p.startsWith('ok'));
console.log(bad.length ? 'PROBLEMS:\n' + bad.join('\n') : 'ALL CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
