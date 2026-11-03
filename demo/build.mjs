// Builds the static demo: node demo/build.mjs  ->  demo/dist/
// Reads ../sample-data (synthetic CSVs), writes a compact data bundle and copies the app.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(here, 'src');
const dist = path.join(here, 'dist');
const csvDir = path.join(root, 'sample-data');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const csv = f => parseCsv(fs.readFileSync(path.join(csvDir, f + '.csv'), 'utf8').replace(/^\uFEFF/, ''));

const FEATURES = csv('FeatureLadder');
const MODELS = csv('ModelClass');
const featIdx = new Map(FEATURES.map((f, i) => [f.Feature, i]));
const modelIdx = new Map(MODELS.map((m, i) => [m.Model, i]));

const people = csv('PeopleMetaData');
const activity = new Map(csv('PersonGitHubActivityMetrics').map(r => [r.PeopleHistoricalId, r]));
const weeks = [...new Set([...activity.values()].map(r => r.MetricDate))].sort();
const weekIdx = new Map(weeks.map((w, i) => [w, i]));

const dict = { org: [], team: [], fn: [], geo: [], sen: [], role: [] };
const dix = k => { const m = new Map(); return v => { v = v || 'Unknown'; if (!m.has(v)) { m.set(v, dict[k].length); dict[k].push(v); } return m.get(v); }; };
const D = Object.fromEntries(Object.keys(dict).map(k => [k, dix(k)]));
const seniority = l => { l = l === '' ? NaN : +l; return isNaN(l) ? 'Unknown' : l <= 4 ? 'Executive' : l <= 6 ? 'Senior' : l <= 8 ? 'Mid' : 'Early'; };

// stable ordering: by person id then week, ids replaced by small integers
people.sort((a, b) => a.PeopleHistoricalId.localeCompare(b.PeopleHistoricalId));
const personIx = new Map();
const rowOf = new Map();
const R = { p: [], w: [], org: [], team: [], fn: [], geo: [], sen: [], role: [], agent: [], sug: [], acc: [], chat: [] };
const feat = [];
people.forEach(o => {
  const a = activity.get(o.PeopleHistoricalId);
  if (!a) return;
  const pid = o.PeopleHistoricalId.slice(0, 36);
  if (!personIx.has(pid)) personIx.set(pid, personIx.size);
  rowOf.set(o.PeopleHistoricalId, R.p.length);
  R.p.push(personIx.get(pid));
  R.w.push(weekIdx.get(a.MetricDate));
  R.org.push(D.org(o.Organization)); R.team.push(D.team(o.full_name_7)); R.fn.push(D.fn(o.FunctionType));
  R.geo.push(D.geo(o.area)); R.sen.push(D.sen(seniority(o.Layer))); R.role.push(D.role(o.Role_identifier));
  R.agent.push(String(a['Agent adoption']).toLowerCase() === 'true' ? 1 : 0);
  R.sug.push(+a['Code completions suggested']); R.acc.push(+a['Code completions accepted']); R.chat.push(+a['User-initiated chat requests']);
  feat.push(...new Array(FEATURES.length).fill(0));
});
for (const r of csv('GitHubActivityBreakdownByFeatureMetrics')) {
  const i = rowOf.get(r.PeopleHistoricalId); if (i === undefined) continue;
  feat[i * FEATURES.length + featIdx.get(r.Feature)] += +r['Feature Usage Count'];
}

const langs = [];
const langIx = new Map();
const delegation = new Map(FEATURES.map(f => [f.Feature, +f.RungOrder >= 3]));
const lc = new Map();
for (const r of csv('GitHubActivityBreakdownByLanguageFeatureMetrics')) {
  const i = rowOf.get(r.PeopleHistoricalId); if (i === undefined) continue;
  if (!langIx.has(r.Language)) { langIx.set(r.Language, langs.length); langs.push(r.Language); }
  const k = i + ':' + langIx.get(r.Language), n = +r['Usage count by language and feature'];
  const e = lc.get(k) || [i, langIx.get(r.Language), 0, 0];
  e[2] += n; if (delegation.get(r.Feature)) e[3] += n; lc.set(k, e);
}
const mc = new Map();
for (const r of csv('GitHubActivityBreakdownByModelFeatureMetrics')) {
  const i = rowOf.get(r.PeopleHistoricalId); if (i === undefined) continue;
  const k = i + ':' + modelIdx.get(r.Model), e = mc.get(k) || [i, modelIdx.get(r.Model), 0];
  e[2] += +r['Usage count by model and feature']; mc.set(k, e);
}
const familyOf = { OpenAI: 'OpenAI', Anthropic: 'Anthropic' };

const data = {
  weeks, dict, rows: R, feat,
  features: FEATURES.map(f => ({ key: f.Feature, rung: f.Rung, order: +f.RungOrder, label: f.Feature.replaceAll('_', ' ').replace('chat panel ', '') })),
  models: MODELS.map(m => ({ key: m.Model, cls: m.ModelClass, fam: m.ModelFamily })),
  langs,
  modelCells: [...mc.values()],
  langCells: [...lc.values()],
  glossary: JSON.parse(fs.readFileSync(path.join(src, 'glossary.json'), 'utf8')),
  people: personIx.size,
};
void familyOf;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
fs.writeFileSync(path.join(dist, 'assets', 'data.js'), 'window.GHCP_DATA=' + JSON.stringify(data) + ';\n');

const js = ['engine.js', 'charts.js', 'pages.js', 'app.js'].map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(dist, 'assets', 'app.js'), '(function(){\n"use strict";\n' + js + '\n})();\n');
fs.copyFileSync(path.join(src, 'styles.css'), path.join(dist, 'assets', 'styles.css'));
fs.copyFileSync(path.join(src, 'index.html'), path.join(dist, 'index.html'));

const BASE = '962df65ec8fb2eca3a422133a17f42aa202abf1f';
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dist, 'LICENSE'));
let rev = 'unknown', dirty = 'unknown', demoSrc = 'unknown';
try {
  rev = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  dirty = execSync('git status --porcelain -- . ":(exclude)demo"', { cwd: root }).toString().trim() ? 'modified' : 'unchanged-from-build-revision';
  demoSrc = execSync('git status --porcelain -- demo/src demo/build.mjs', { cwd: root }).toString().trim() ? 'uncommitted-changes' : 'committed';
} catch { /* not a git checkout */ }
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
const manifest = {
  demo: 'GitHub Copilot Panel – interactive browser demo (synthetic data)',
  repository: 'microsoft/GitHubCopilotPanel', baseRevision: BASE, buildRevision: rev,
  templateAndDataVsBuildRevision: dirty, demoSourceState: demoSrc, licence: 'MIT (see LICENSE)',
  files: Object.fromEntries(files.map(f => [path.relative(dist, f).replaceAll('\\', '/'), crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),
};
fs.writeFileSync(path.join(dist, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`built ${files.length} files, ${data.rows.p.length} person-weeks -> ${path.relative(root, dist)}`);
