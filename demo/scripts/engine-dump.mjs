// Prints the engine's full-range headline figures as JSON (input for crosscheck.py).
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(dist, 'assets', 'data.js'), 'utf8'), ctx);
const { createEngine } = createRequire(import.meta.url)('../src/engine.js');
const E = createEngine(ctx.window.GHCP_DATA);
const cfg = { deepThreshold: .1, habitWeeks: 3, habitWindow: 4, seats: 200, seatCost: 39, enablement: 0, uplift: .184, loadedCost: 150000 };
const m = E.summary({ org: null, fn: null, group: null, start: E.bounds.min, end: E.bounds.max }, cfg);
const keys = ['licensed', 'active', 'habitual', 'deep', 'interactions', 'delegated', 'delegationRate', 'acceptance', 'capacity', 'powerfulShare', 'agent'];
console.log(JSON.stringify(Object.fromEntries(keys.map(k => [k, m[k]]))));
