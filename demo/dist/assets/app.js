(function(){
"use strict";
// Calculation engine: a JavaScript port of the report's DAX measures, evaluated over the
// person-week synthetic fixtures. Pure (no DOM) so it can be unit-checked in Node.
const DAY = 86400000;

function createEngine(data) {
  const R = data.rows, n = R.p.length, W = data.weeks.length, P = data.people;
  const NF = data.features.length;
  const wd = data.weeks.map(s => Date.parse(s + 'T00:00:00Z') / DAY);
  const rowDay = Int32Array.from(R.w, w => wd[w]);
  const inter = new Float64Array(n), deleg = new Float64Array(n), act = new Uint8Array(n);
  const rungOf = data.features.map(f => f.order >= 3);
  const rungName = data.features.map(f => f.rung);
  for (let i = 0; i < n; i++) {
    let t = 0, d = 0;
    for (let f = 0; f < NF; f++) { const v = data.feat[i * NF + f]; t += v; if (rungOf[f]) d += v; }
    inter[i] = t; deleg[i] = d;
    act[i] = R.sug[i] + R.chat[i] > 0 ? 1 : 0;
  }
  const mByRow = Array.from({ length: n }, () => null), lByRow = Array.from({ length: n }, () => null);
  for (const c of data.modelCells) (mByRow[c[0]] ||= []).push(c);
  for (const c of data.langCells) (lByRow[c[0]] ||= []).push(c);
  const DIMS = { org: 'Organisation', team: 'Team', fn: 'Function', geo: 'Geography', sen: 'Seniority', role: 'Role type' };
  const bounds = { min: wd[0], max: wd[W - 1] };

  const addMonths = (day, k) => {
    const d = new Date(day * DAY), y = d.getUTCFullYear(), m = d.getUTCMonth() + k, dd = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(dd, last)) / DAY;
  };
  const median = a => { if (!a.length) return null; a = a.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const div = (a, b) => (b === 0 || b == null || a == null ? null : a / b);

  // Row selection: slicer sets (org, fn), optional group member / language-free cross filter, and a date range.
  function select(F, from, to) {
    const out = [], g = F.group;
    for (let i = 0; i < n; i++) {
      const d = rowDay[i];
      if (d < from || d > to) continue;
      if (F.org && !F.org.has(R.org[i])) continue;
      if (F.fn && !F.fn.has(R.fn[i])) continue;
      if (g && R[g.dim][i] !== g.idx) continue;
      out.push(i);
    }
    return out;
  }

  function measures(F, cfg, o = {}) {
    const from = o.from ?? F.start, to = o.to ?? F.end;
    const maxDay = o.maxDay ?? to, minDay = o.minDay ?? from;
    const rows = select(F, from, to);
    const seen = new Uint8Array(P), activeP = new Uint8Array(P), agentP = new Uint8Array(P);
    const pi = new Float64Array(P), pd = new Float64Array(P);
    let sug = 0, acc = 0, chat = 0, tInter = 0, tDeleg = 0;
    for (const i of rows) {
      const p = R.p[i]; seen[p] = 1;
      if (act[i]) activeP[p] = 1;
      if (R.agent[i]) agentP[p] = 1;
      pi[p] += inter[i]; pd[p] += deleg[i];
      sug += R.sug[i]; acc += R.acc[i]; chat += R.chat[i]; tInter += inter[i]; tDeleg += deleg[i];
    }
    let licensed = 0, active = 0, agent = 0;
    const deepP = new Uint8Array(P);
    let deep = 0;
    for (let p = 0; p < P; p++) {
      if (seen[p]) licensed++;
      if (activeP[p]) active++;
      if (agentP[p]) agent++;
      if (seen[p] && pi[p] > 0 && pd[p] / pi[p] > cfg.deepThreshold) { deepP[p] = 1; deep++; }
    }
    // Habitual: the trailing window replaces the date filter, as DATESINPERIOD does in the model.
    const wrows = select(F, maxDay - (7 * cfg.habitWindow - 1), maxDay);
    const cnt = new Int32Array(P);
    for (const i of wrows) if (act[i]) cnt[R.p[i]]++;
    let habitual = 0;
    for (let p = 0; p < P; p++) if (cnt[p] >= cfg.habitWeeks) habitual++;

    // Models and languages
    const classSum = {}, famSum = {}, famDeepPow = [0, 0, 0, 0];
    let mTot = 0;
    const langAgg = new Map();
    for (const i of rows) {
      const isDeep = deepP[R.p[i]];
      for (const c of mByRow[i] || []) {
        const m = data.models[c[1]];
        classSum[m.cls] = (classSum[m.cls] || 0) + c[2]; famSum[m.fam] = (famSum[m.fam] || 0) + c[2]; mTot += c[2];
        const k = isDeep ? 0 : 2; famDeepPow[k] += c[2]; if (m.cls === 'Powerful') famDeepPow[k + 1] += c[2];
      }
      for (const c of lByRow[i] || []) {
        const e = langAgg.get(c[1]) || [0, 0]; e[0] += c[2]; e[1] += c[3]; langAgg.set(c[1], e);
      }
    }
    const months = (maxDay - minDay + 1) / 30.44;
    const capacity = deep * cfg.uplift, onTable = (habitual - deep) * cfg.uplift;
    const valueRealised = capacity * cfg.loadedCost * months / 12;
    const invest = cfg.seats * cfg.seatCost * months + cfg.enablement * months / 12;
    const inactive = licensed - active;
    const m = {
      rows, licensed, active, inactive, habitual, deep, agent,
      activation: div(active, licensed), habitConv: div(habitual, active),
      interactions: tInter, delegated: tDeleg, delegationRate: div(tDeleg, tInter),
      depthConv: div(deep, habitual), deepShareActive: div(deep, active), agentRate: div(agent, active),
      neverUsed: inactive, activeNotHabitual: active - habitual, habitualNotDeep: Math.max(habitual - deep, 0),
      sug, acc, chat, acceptance: div(acc, sug), acceptedPerActive: div(acc, active),
      months, capacity, onTable, valueRealised, valueOnTable: onTable * cfg.loadedCost * months / 12,
      invest, net: valueRealised - invest, roi: div(valueRealised - invest, invest),
      costPerDeep: div(invest, deep), idleSeatCost: inactive * cfg.seatCost * months,
      modelTotal: mTot, classSum, famSum,
      powerfulShare: div(classSum.Powerful || 0, mTot), unclassifiedShare: div(classSum.Unclassified || 0, mTot),
      powerDeep: div(famDeepPow[1], famDeepPow[0]), powerOther: div(famDeepPow[3], famDeepPow[2]),
      topFamilyShare: mTot ? Math.max(0, ...Object.values(famSum)) / mTot : null,
      langAgg,
    };
    m.powerGap = m.powerDeep == null || m.powerOther == null ? null : m.powerDeep - m.powerOther;
    // cohort acceptance
    let sD = 0, aD = 0, sO = 0, aO = 0;
    for (const i of rows) { if (deepP[R.p[i]]) { sD += R.sug[i]; aD += R.acc[i]; } else { sO += R.sug[i]; aO += R.acc[i]; } }
    m.acceptDeep = div(aD, sD); m.acceptOther = div(aO, sO);
    m.qualityGap = m.acceptDeep == null || m.acceptOther == null ? null : m.acceptDeep - m.acceptOther;
    // CLI users (distinct people with any CLI interaction) and time to depth
    const cliIdx = data.features.findIndex(f => f.key === 'copilot_cli');
    const cli = new Uint8Array(P), firstUse = new Float64Array(P).fill(Infinity), firstDel = new Float64Array(P).fill(Infinity);
    for (const i of rows) {
      const p = R.p[i];
      if (data.feat[i * NF + cliIdx] > 0) cli[p] = 1;
      if (inter[i] > 0 && rowDay[i] < firstUse[p]) firstUse[p] = rowDay[i];
      if (deleg[i] > 0 && rowDay[i] < firstDel[p]) firstDel[p] = rowDay[i];
    }
    m.cliUsers = cli.reduce((a, b) => a + b, 0);
    const ttd = [];
    for (let p = 0; p < P; p++) if (isFinite(firstUse[p]) && isFinite(firstDel[p])) ttd.push((firstDel[p] - firstUse[p]) / 7);
    m.timeToDepth = median(ttd);
    return m;
  }

  // Everything one page render needs for a given filter state.
  function summary(F, cfg) {
    const m = measures(F, cfg);
    // prior month and first week
    const pmRows = measures(F, cfg, { from: addMonths(F.start, -1), to: addMonths(F.end, -1), maxDay: addMonths(F.end, -1) });
    m.delegationPM = pmRows.delegationRate;
    m.delegationChange = m.delegationRate == null || pmRows.delegationRate == null ? null : m.delegationRate - pmRows.delegationRate;
    const first = measures({ ...F, start: bounds.min, end: bounds.max }, cfg, { from: bounds.min, to: bounds.min });
    m.delegationFirst = first.delegationRate;
    m.delegationGain = m.delegationRate == null || first.delegationRate == null ? null : m.delegationRate - first.delegationRate;
    // assisted output growth
    const span = F.end - F.start + 1;
    if (span < 84) { m.outputGrowth = null; }
    else {
      const b = measures(F, cfg, { from: F.start + 28, to: F.start + 55 }).acceptedPerActive;
      const l = measures(F, cfg, { from: F.end - 27, to: F.end }).acceptedPerActive;
      m.outputGrowth = b == null || b === 0 || l == null ? null : (l - b) / b;
    }
    m.span = span;
    return m;
  }

  function weekly(F, cfg) {
    const out = [];
    for (let w = 0; w < W; w++) {
      const d = wd[w];
      if (d < F.start || d > F.end) continue;
      const m = measures(F, cfg, { from: d, to: d, minDay: d, maxDay: Math.min(d + 6, F.end) });
      if (!m.licensed) continue;
      const byRung = {};
      for (const i of m.rows) for (let f = 0; f < NF; f++) byRung[rungName[f]] = (byRung[rungName[f]] || 0) + data.feat[i * NF + f];
      out.push({ w, label: 'W' + String(w + 1).padStart(2, '0'), day: d, m, byRung });
    }
    return out;
  }

  function groups(F, cfg, dim) {
    const base = select(F, F.start, F.end), ids = new Set();
    for (const i of base) ids.add(R[dim][i]);
    return [...ids].map(idx => ({ idx, key: data.dict[dim][idx], m: measures({ ...F, group: { dim, idx } }, cfg) }));
  }

  function features(F) {
    const rows = select(F, F.start, F.end), sums = new Array(NF).fill(0);
    for (const i of rows) for (let f = 0; f < NF; f++) sums[f] += data.feat[i * NF + f];
    return data.features.map((f, i) => ({ ...f, interactions: sums[i] }));
  }

  return { measures, summary, weekly, groups, features, select, bounds, wd, DIMS, addMonths, median, data };
}

if (typeof module !== 'undefined') module.exports = { createEngine };

// Small SVG/HTML chart kit: stacked columns, lines, areas, horizontal bars, tables, cards.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = v => v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US');
const n1 = v => v == null || isNaN(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pc = (v, d = 1) => v == null || isNaN(v) ? '—' : (v * 100).toFixed(d) + '%';
const usd = v => v == null || isNaN(v) ? '—' : (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
const compact = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(Math.abs(v) >= 1e4 ? 0 : 1) + 'K' : String(Math.round(v * 10) / 10);
const COLORS = ['#4F73B8', '#09B39D', '#7F215D', '#F06549', '#8783FF', '#F1963A', '#95A9CE', '#DBDFE4', '#B36A8E', '#3F5C93'];
const FUNNEL = { never: '#C9D0DB', notHabitual: '#B8C4E0', habitualNotDeep: '#7290C8', deep: '#232F54' };

function ticks(max, n = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, out = [];
  for (let v = 0; v <= max + step * 0.999; v += step) { out.push(+v.toFixed(10)); if (v >= max) break; }
  return out;
}
const empty = (w, h) => `<div class="empty" style="width:${w}px;height:${h}px">No data in the selected period</div>`;
function legend(series) { return `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`; }

function frame(w, h, L, B, yt, yfmt, inner) {
  const T = 8, ih = h - T - B, iw = w - L - 8, top = yt[yt.length - 1] || 1;
  const y = v => T + ih - (v / top) * ih;
  const grid = yt.map(t => `<line class="grid" x1="${L}" x2="${w - 8}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 6}" y="${y(t) + 3}" text-anchor="end">${yfmt(t)}</text>`).join('');
  return { T, ih, iw, y, svg: `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${grid}${inner(y, iw, ih)}</svg>` };
}
function xlabels(cats, L, iw, h, B) {
  const step = Math.ceil(cats.length / Math.max(1, Math.floor(iw / 34)));
  return cats.map((c, i) => i % step ? '' : `<text class="ax" x="${L + (i + .5) * iw / cats.length}" y="${h - B + 14}" text-anchor="middle">${esc(c)}</text>`).join('');
}

function cols({ w, h, cats, series, pct = false, fmt = compact }) {
  if (!cats.length) return empty(w, h);
  const L = 44, B = 22, totals = cats.map((_, i) => series.reduce((a, s) => a + (s.vals[i] || 0), 0));
  const yt = pct ? [0, .25, .5, .75, 1] : ticks(Math.max(...totals));
  const f = frame(w, h, L, B, yt, pct ? v => v * 100 + '%' : fmt, (y, iw) => {
    const bw = Math.min(40, iw / cats.length * .7);
    let s = '';
    cats.forEach((c, i) => {
      let acc = 0; const cx = L + (i + .5) * iw / cats.length, tot = totals[i] || 1;
      series.forEach(sr => {
        const v = sr.vals[i] || 0, a = pct ? v / tot : v;
        if (a > 0) s += `<rect x="${cx - bw / 2}" y="${y(acc + a)}" width="${bw}" height="${Math.max(0, y(acc) - y(acc + a))}" fill="${sr.color}" data-tip="${esc(c)} · ${esc(sr.name)}: ${pct ? pc(v / tot) + ' (' + nf(v) + ')' : nf(v)}"/>`;
        acc += a;
      });
    });
    return s + xlabels(cats, L, iw, h, B);
  });
  return f.svg;
}

function lines({ w, h, cats, series, fmt = compact, area = false, pctAxis = false }) {
  if (!cats.length) return empty(w, h);
  const L = 44, B = 22;
  let max;
  if (area) { max = Math.max(...cats.map((_, i) => series.reduce((a, s) => a + (s.vals[i] || 0), 0))); }
  else max = Math.max(...series.flatMap(s => s.vals.map(v => v || 0)));
  const yt = pctAxis ? ticks(max * 100).map(v => v / 100).filter((v, i, a) => i < 7) : ticks(max);
  const f = frame(w, h, L, B, yt, pctAxis ? v => Math.round(v * 100) + '%' : fmt, (y, iw) => {
    const x = i => L + (cats.length === 1 ? iw / 2 : i * iw / (cats.length - 1));
    let s = '';
    if (area) {
      const base = cats.map(() => 0);
      series.forEach(sr => {
        const top = sr.vals.map((v, i) => base[i] + (v || 0));
        const d = top.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('') + base.map((_, i) => `L${x(cats.length - 1 - i)},${y(base[cats.length - 1 - i])}`).join('') + 'Z';
        s += `<path d="${d}" fill="${sr.color}" opacity=".9"/>`;
        top.forEach((v, i) => { base[i] = v; });
      });
      cats.forEach((c, i) => { s += `<rect x="${x(i) - iw / cats.length / 2}" y="8" width="${iw / cats.length}" height="${h - B - 8}" fill="transparent" data-tip="${esc(c)}: ${series.filter(sr => sr.vals[i]).map(sr => sr.name + ' ' + fmt(sr.vals[i])).join(', ')}"/>`; });
    } else {
      series.forEach(sr => {
        const pts = sr.vals.map((v, i) => v == null ? null : [x(i), y(v)]).filter(Boolean);
        s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join('')}" fill="none" stroke="${sr.color}" stroke-width="2.2"/>`;
        sr.vals.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${sr.color}" data-tip="${esc(cats[i])} · ${esc(sr.name)}: ${pctAxis ? pc(v) : fmt(v)}"/>`; });
      });
    }
    const step = Math.ceil(cats.length / Math.max(1, Math.floor(iw / 34)));
    return s + cats.map((c, i) => i % step ? '' : `<text class="ax" x="${x(i)}" y="${h - B + 14}" text-anchor="middle">${esc(c)}</text>`).join('');
  });
  return f.svg;
}

// Horizontal stacked bars. Each category carries a key used for cross-filter clicks.
function hbars({ w, h, cats, series, fmt = nf, sel = null, labelW = 120, maxOverride }) {
  if (!cats.length) return empty(w, h);
  const T = 6, B = 22, ih = h - T - B, rowH = ih / cats.length, bh = Math.min(22, rowH * .68);
  const totals = cats.map((_, i) => series.reduce((a, s) => a + (s.vals[i] || 0), 0));
  const yt = ticks(maxOverride ?? Math.max(...totals)), top = yt[yt.length - 1] || 1, iw = w - labelW - 12;
  const x = v => labelW + v / top * iw;
  let s = yt.map(t => `<line class="grid" y1="${T}" y2="${T + ih}" x1="${x(t)}" x2="${x(t)}"/><text class="ax" x="${x(t)}" y="${h - 6}" text-anchor="middle">${fmt === nf ? compact(t) : fmt(t)}</text>`).join('');
  cats.forEach((c, i) => {
    const cy = T + i * rowH + rowH / 2; let acc = 0;
    const dim = sel != null && sel !== c.key;
    s += `<g class="hb${dim ? ' dim' : ''}" data-sel="${esc(c.key)}"><text class="ax cat" x="${labelW - 6}" y="${cy + 3}" text-anchor="end">${esc(String(c.label).slice(0, 18))}</text>`;
    series.forEach(sr => { const v = sr.vals[i] || 0; if (v > 0) { s += `<rect x="${x(acc)}" y="${cy - bh / 2}" width="${Math.max(0, x(acc + v) - x(acc))}" height="${bh}" fill="${sr.color}" data-tip="${esc(c.label)} · ${esc(sr.name)}: ${fmt(v)}"/>`; } acc += v; });
    s += `<rect x="0" y="${cy - rowH / 2}" width="${w}" height="${rowH}" fill="transparent" data-tip="${esc(c.label)}: ${series.map(sr => sr.name + ' ' + fmt(sr.vals[i] || 0)).join(' · ')}"/></g>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${s}</svg>`;
}

function table({ id, cols: cs, rows, selKey = null, selected = null, height }) {
  const head = cs.map((c, i) => `<th class="${c.num ? 'n' : ''}" data-sort="${i}">${esc(c.h)}</th>`).join('');
  const body = rows.map(r => `<tr${r.key != null ? ` data-sel="${esc(r.key)}"` : ''} class="${selected != null && r.key === selected ? 'on' : ''}">${r.cells.map((c, i) => `<td class="${cs[i].num ? 'n' : ''}" data-v="${esc(c.v ?? c)}">${esc(c.t ?? c)}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl" style="max-height:${height}px"><table id="${id || ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function card(x, y, w, h, title, sub, body, cls = '') {
  return `<section class="card ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${title ? `<h3>${esc(title)}</h3>` : ''}${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${body}</section>`;
}
function kpi(x, y, w, h, title, value, sub, tip = '') {
  return card(x, y, w, h, title, sub, `<div class="val" ${tip ? `data-tip="${esc(tip)}"` : ''}>${esc(value)}</div>`, 'kpi');
}
const para = t => esc(t).replace(/\n/g, '<br>');

// Seven report pages at the template's 1280x720 coordinates. Each returns HTML for the canvas.
const PAGES = [
  { id: 'p0start', name: '0 Start Here', slicers: false },
  { id: 'p1exec', name: '1 Executive Summary', slicers: true },
  { id: 'p2reach', name: '2 Reach', slicers: true },
  { id: 'p3depth', name: '3 Depth', slicers: true },
  { id: 'p5models', name: '4 Models & Stacks', slicers: true },
  { id: 'p4value', name: '5 Value', slicers: true },
  { id: 'p5appx', name: '6 Appendix', slicers: false },
];
const ICON = '<svg class="ico" viewBox="0 0 26 26"><rect width="26" height="26" rx="6" fill="#232F54"/><path d="M6 15l4-4 3 3 7-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="9" r="1.6" fill="#09B39D"/></svg>';
function header(title, sub, state) {
  return `${ICON}<div class="ttl">${esc(title)}</div><div class="stl">${esc(sub)}</div><div class="rule"></div>`;
}
const T = (cfg) => ({
  deep: `over ${pc(cfg.deepThreshold, 0)} of their work is delegated`,
  habitual: `active in ${cfg.habitWeeks} of the last ${cfg.habitWindow} weeks`,
});

function titleExec(m) {
  const A = m.activation, D = m.depthConv;
  if (A == null) return 'No data in the selected period';
  if (A >= .8 && (D ?? 0) < .5) return 'Widely deployed. Not yet used deeply.';
  if (A >= .8) return 'Widely deployed and increasingly used well.';
  if (A < .5) return 'Deployment itself is still the constraint.';
  return 'Partly deployed, and depth is still building.';
}
function titleReach(m) { const A = m.activation; return A == null ? 'No data in the selected period' : A >= .85 ? 'Reach is nearly maxed out' : A >= .6 ? 'Reach is good but not complete' : 'Reach is the immediate constraint'; }
function titleDepth(m) {
  const D = m.depthConv, A = m.activation;
  if (D == null) return 'No data in the selected period';
  if (D < .4 && A >= .7) return 'Depth is the constraint';
  if (D < .4) return 'Depth is low, but reach is the bigger gap';
  return D < .7 ? 'Depth is building' : 'Depth is no longer the constraint';
}
function titleModels(m) {
  if (!m.modelTotal) return 'No model data in the selected period';
  if ((m.unclassifiedShare ?? 0) >= .10) return 'Routing you cannot yet explain';
  if ((m.powerGap ?? 0) > 0) return 'Depth costs more, and that is expected';
  return 'Where the work is actually going';
}
const signed = (v, d = 1) => v == null ? '—' : (v === 0 ? 'no different' : (v > 0 ? '+' : '-') + (Math.abs(v) * 100).toFixed(d) + '%');

function narratives(m, cfg, S) {
  const N = {};
  N.headline = `${nf(m.licensed)} licensed  ->  ${nf(m.active)} active  ->  ${nf(m.habitual)} habitual  ->  ${nf(m.deep)} deep. That last stage is worth ${n1(m.capacity)} FTE. Moving the ${nf(m.habitual - m.deep)} who are habitual but not yet deep would add ${n1(m.onTable)} more.`;
  N.legend = `NEVER USED\nHolds a seat, produced nothing.\n\nACTIVE, NOT HABITUAL\nUsed it, but under ${cfg.habitWeeks} of the last ${cfg.habitWindow} weeks.\n\nHABITUAL, NOT DEEP\nMost weeks, but under ${pc(cfg.deepThreshold, 0)} delegated.\n\nDEEP\nMost weeks and over ${pc(cfg.deepThreshold, 0)} delegated.`;
  N.depth = m.delegationRate == null ? 'No data in the selected period' : `${pc(m.delegationRate)} of interactions delegate real work, ${(m.delegationChange ?? 0) >= 0 ? 'up ' : 'down '}${pc(Math.abs(m.delegationChange ?? 0))} on last month and ${pc(Math.abs(m.delegationGain ?? 0))} since week 1.`;
  N.value = m.outputGrowth == null
    ? (m.span < 84 ? 'Select at least 12 weeks to compare settled usage against latest.' : 'First 4 settled weeks vs latest 4, ignoring the opening 4-week ramp.')
    : `Assisted output per developer is ${signed(m.outputGrowth)} once usage settled, and people reach delegation in ${m.timeToDepth == null ? '—' : Math.round(m.timeToDepth)} weeks. Both measured - no assumption behind either.`;
  N.aNever = `NEVER USED  |  ${nf(m.inactive)} seats produced nothing, costing ${usd(m.idleSeatCost)}. Reclaim before buying more.`;
  N.aHabit = `ACTIVE, NOT HABITUAL  |  ${nf(m.active - m.habitual)} use it occasionally. The cheapest cohort to move.`;
  N.aDeepNot = `HABITUAL, NOT DEEP  |  ${nf(m.habitual - m.deep)} have the habit but do not delegate. Worth ${n1(m.onTable)} FTE.`;
  N.aDeep = `DEEP  |  ${nf(m.deep)} are worth ${n1(m.capacity)} FTE. What they do differently is the playbook for the other ${nf(m.licensed - m.deep)}.`;
  N.method = `Delegation rate = interactions in agent, CLI, plan and app surfaces, divided by all interactions. Deep user = personal delegation rate above ${pc(cfg.deepThreshold, 0)}. Habitual = active in ${cfg.habitWeeks} of the last ${cfg.habitWindow} weeks. All three are counts.`;
  N.assume = `ONE assumption: deep users are ${pc(cfg.uplift)} more ${cfg.outputMetric} than matched peers, valued at ${usd(cfg.loadedCost)} per FTE per year. Everything else is counted. Change either value in the assumptions panel (demo control) and every figure follows.`;
  N.quality = m.qualityGap == null ? 'Not enough completion data in this period.' : `People who delegate real work accept ${pc(m.acceptDeep)} of the completions they are shown, against ${pc(m.acceptOther)} for everyone else — ${m.qualityGap >= 0 ? `a ${pc(Math.abs(m.qualityGap))} gap in their favour. Depth is not coming at the cost of care.` : `a ${pc(Math.abs(m.qualityGap))} gap against them, which is worth investigating.`}`;
  N.signature = `${nf(m.cliUsers)} people have used the CLI. Almost all of them are deep users, and almost no one else has touched it — which makes it the clearest single thing to teach someone who already has the habit.`;
  N.model = `Deep users send ${pc(m.powerDeep)} of their work to frontier models, against ${pc(m.powerOther)} for everyone else. Harder tasks need stronger models — which is a cost signal as much as a behaviour one.`;
  const gh = m.agentRate, own = m.deepShareActive;
  if (gh == null) N.bench = 'No agent adoption data in the selected period';
  else {
    const gap = (own ?? 0) - gh;
    N.bench = `GitHub flags ${pc(gh)} of active users as agent adopters. Our own test - more than ${pc(cfg.deepThreshold, 0)} of interactions delegated - picks ${pc(own)}. ` + (Math.abs(gap) <= .05 ? 'The two broadly agree, which is the best corroboration available for our threshold.' : gap < 0 ? 'Ours is the stricter test, so our deep user count is the conservative one.' : 'Ours is the looser test - worth raising the threshold before quoting the value figures.');
  }
  return N;
}

function langRows(m, data) {
  return [...m.langAgg].map(([i, [t, d]]) => ({ lang: data.langs[i], t, d, rate: t ? d / t : null })).sort((a, b) => b.t - a.t);
}
function langNarr(m, data) {
  const rows = langRows(m, data);
  if (!rows.length) return 'No language data in the selected period';
  const tot = rows.reduce((a, r) => a + r.t, 0), dt = rows.reduce((a, r) => a + r.d, 0);
  const busy = rows[0], deepest = rows.filter(r => r.t >= 1000).sort((a, b) => b.rate - a.rate)[0];
  return `${busy.lang} carries the most work at ${pc(busy.t / tot)} of attributed interactions. ${deepest ? deepest.lang : '—'} delegates the most at ${pc(deepest?.rate)}, against ${pc(dt / tot)} overall - so the stack people trust with whole tasks is not the one they use most.`;
}

const GROUP_LABEL = k => k;
function render(id, S) {
  const { E, F, cfg, dim, sel, data } = S;
  const Fx = F, Fsel = sel ? { ...F, group: sel } : F;
  const m = E.summary(Fsel, cfg), N = narratives(m, cfg, S), t = T(cfg);
  const dimName = E.DIMS[dim].toUpperCase();
  const grp = () => E.groups(Fx, cfg, dim).sort((a, b) => b.m.licensed - a.m.licensed);
  const wk = () => E.weekly(Fsel, cfg);
  const selKey = sel ? sel.idx : null;
  const dataNote = `SYNTHETIC DATA. ${nf(m.licensed)} people, ${new Set(E.weekly(Fsel, cfg).map(w => w.w)).size} weekly periods, ${fmtDate(F.start)} to ${fmtDate(F.end)}. No real person, organisation or telemetry is represented.`;
  let h = '';
  const funnelSeries = ws => [
    { name: 'Deep', color: FUNNEL.deep, vals: ws.map(w => w.m.deep) },
    { name: 'Habitual, not deep', color: FUNNEL.habitualNotDeep, vals: ws.map(w => w.m.habitualNotDeep) },
    { name: 'Active, not habitual', color: FUNNEL.notHabitual, vals: ws.map(w => w.m.activeNotHabitual) },
    { name: 'Never used', color: FUNNEL.never, vals: ws.map(w => w.m.neverUsed) },
  ];
  const noteGroup = `<p class="foot">Group By drives the breakdown charts and tables. Click a bar or row to cross-filter the page.</p>`;

  if (id === 'p0start') {
    h += header('Start here — what this measures', 'Three questions, one after the other. Every number below is a count, except where marked.');
    const q = (x, ttl, txt) => card(x, 96, 400, 148, ttl, '', `<p class="txt">${para(txt)}</p>`, 'q');
    h += q(24, '1 · REACH', 'Of the people holding a seat, how many ever use Copilot, and how many have built a habit — see Definitions below.\n\nA count. No assumptions.');
    h += q(440, '2 · DEPTH', 'What share of interactions delegate real work — agent, CLI, plan and app surfaces — rather than accepting a suggestion.\n\nThe delegation rate. Also a count.');
    h += q(856, '3 · VALUE', 'People whose own delegation rate clears the bar are deep users. They produce measurably more.\n\nDeep users × uplift = capacity, in FTE.');
    const f = E.features({ ...F, group: null });
    h += card(24, 260, 608, 265, 'THE FEATURE LADDER', 'where each surface sits, and what it saw in this synthetic period',
      table({ id: 'ladder', height: 205, cols: [{ h: 'Feature' }, { h: 'Rung' }, { h: 'Rung order', num: 1 }, { h: 'Interactions', num: 1 }], rows: f.map(x => ({ cells: [x.label, x.rung, x.order, { t: nf(x.interactions), v: x.interactions }] })) }));
    h += card(648, 260, 632, 265, 'THE ONE MEASURE', '', `<p class="txt"><b>Where the line sits</b><br><b>Suggest</b> and <b>Edit</b> — Copilot proposes, the developer decides. Below the line.<br><b>Review</b> and <b>Delegate</b> — a whole task is handed over. Above the line.<br><br>The delegation rate is simply the second group divided by all four. A weighted version was tested and dropped: it tracked the plain count almost exactly and barely moved the ranking, so it added apparatus without adding insight.</p><p class="txt big">${esc(N.depth)}</p>`);
    h += card(24, 539, 608, 149, 'ASSUMPTION NOTE', '', `<p class="txt">${esc(N.assume)}</p>`);
    h += card(648, 539, 632, 149, 'METHOD NOTE', '', `<p class="txt">${esc(N.method)}</p>`);
    h += `<div class="dnote">${esc(dataNote)}</div>`;
    return h;
  }

  if (id === 'p5appx') {
    h += header('Appendix', 'Definitions');
    h += card(24, 77, 1232, 81, 'METHOD NOTE', '', `<p class="txt">${esc(N.method)}</p>`);
    h += card(24, 163, 830, 545, 'GLOSSARY', 'what each metric means and how it is derived',
      table({ id: 'gloss', height: 470, cols: [{ h: 'Group' }, { h: 'Metric' }, { h: 'What it means' }, { h: 'How it is derived' }, { h: 'Basis' }], rows: data.glossary.map(r => ({ cells: r })) }));
    h += card(863, 163, 393, 304, 'CAVEATS', '', `<p class="txt sm">This is observational. Where delegation and output move together that is an association, not a proven cause. Compare adopted against not-yet-adopted teams over the same window rather than before against after.<br><br>Capacity valued at a loaded annual cost values time released, not value created. A mature model moves toward cycle time, change failure rate and review latency — none of which are in this extract.<br><br>Credit, token and billing consumption are excluded. This dataset does not carry them and inferring spend from usage would be a guess.<br><br>Which surfaces count as delegation is a judgement. It is held as data in the Feature table, so it can be argued with and changed without touching a measure.</p>`);
    h += card(870, 490, 386, 218, 'THE FOUR SURFACES', 'read live from the model',
      table({ id: 'surf', height: 150, cols: [{ h: 'Feature' }, { h: 'Rung' }, { h: 'Delegation?' }], rows: data.features.map(x => ({ cells: [x.label, x.rung, x.order >= 3 ? 'Yes' : 'No'] })) }));
    h += `<div class="dnote">${esc(dataNote)}</div>`;
    return h;
  }

  const ws = wk();
  if (id === 'p1exec') {
    h += header(titleExec(m), 'One funnel: licensed → active → habitual → deep. Reach asks how far people get, Depth how many reach the last stage, Value what that stage is worth.');
    h += card(24, 89, 1232, 59, '', '', `<p class="txt">${esc(N.headline)}</p>`, 'narr');
    const st = [['LICENSED', m.licensed, 'holds a seat'], ['ACTIVE', m.active, 'used it at least once'], ['HABITUAL', m.habitual, t.habitual], ['DEEP', m.deep, t.deep]];
    st.forEach((s, i) => { h += kpi(24 + i * 314, 156, 290, 88, s[0], nf(s[1]), s[2]); });
    h += card(24, 252, 945, 277, 'THE FUNNEL, WEEK BY WEEK', 'people in each stage, stacked',
      cols({ w: 925, h: 205, cats: ws.map(w => w.label), series: funnelSeries(ws) }) + legend(funnelSeries(ws)));
    h += card(981, 252, 275, 277, 'WHAT EACH SEGMENT MEANS', '', `<p class="txt sm">${para(N.legend)}</p>`);
    [N.aNever, N.aHabit, N.aDeepNot, N.aDeep].forEach((a, i) => { h += card(24 + i * 314, 540, 299 - (i === 3 ? 9 : 0), 82, '', '', `<p class="txt sm">${esc(a)}</p>`, 'act'); });
    h += kpi(24, 630, 405, 82, 'DELEGATION RATE', pc(m.delegationRate), 'agent, CLI, plan, app ÷ all');
    h += kpi(442, 630, 405, 82, 'CAPACITY GAINED (FTE)', n1(m.capacity), `deep users × ${pc(cfg.uplift)} more ${cfg.outputMetric}`, 'Assumption-based: depends on the uplift assumption');
    h += kpi(860, 630, 396, 82, 'NET VALUE', usd(m.net), 'value realised less investment · assumption-based', 'Assumption-based what-if, see Value page');
  }

  if (id === 'p2reach') {
    h += header(titleReach(m), 'Who holds a seat, who uses it, and who has built a habit.');
    [['LICENSED', nf(m.licensed), 'holds a seat'], ['ACTIVE', nf(m.active), 'used it at least once'], ['ACTIVATION %', pc(m.activation), 'active ÷ licensed'], ['HABITUAL', nf(m.habitual), t.habitual], ['PRODUCED NOTHING', nf(m.inactive), 'licensed, never active']]
      .forEach((c, i) => { h += kpi(24 + i * 248, 92, 240, 88, ...c); });
    const g = grp(), cats = g.map(x => ({ key: x.idx, label: x.key }));
    const ser = [
      { name: 'Habitual', color: FUNNEL.habitualNotDeep, vals: g.map(x => x.m.habitual) },
      { name: 'Active, not habitual', color: FUNNEL.notHabitual, vals: g.map(x => x.m.activeNotHabitual) },
      { name: 'Never used', color: FUNNEL.never, vals: g.map(x => x.m.neverUsed) },
    ];
    h += card(24, 190, 623, 277, `REACH BY ${dimName}`, 'licensed people split by stage · click a bar to cross-filter',
      hbars({ w: 603, h: 190, cats: cats.slice(0, 8), series: ser.map(s => ({ ...s, vals: s.vals.slice(0, 8) })), sel: selKey }) + legend(ser));
    h += card(658, 190, 599, 277, 'ACTIVE AND HABITUAL, WEEK BY WEEK', 'people',
      lines({ w: 579, h: 205, cats: ws.map(w => w.label), series: [{ name: 'Active', color: COLORS[0], vals: ws.map(w => w.m.active) }, { name: 'Habitual', color: COLORS[1], vals: ws.map(w => w.m.habitual) }] }) + legend([{ name: 'Active', color: COLORS[0] }, { name: 'Habitual', color: COLORS[1] }]));
    h += card(25, 474, 1232, 238, `REACH BY ${dimName}`, 'sortable · click a row to cross-filter',
      table({ id: 'reachT', height: 175, selected: selKey, cols: [{ h: E.DIMS[dim] }, { h: 'Licensed', num: 1 }, { h: 'Active', num: 1 }, { h: 'Activation %', num: 1 }, { h: 'Habitual', num: 1 }, { h: 'Produced nothing', num: 1 }], rows: g.map(x => ({ key: x.idx, cells: [x.key, { t: nf(x.m.licensed), v: x.m.licensed }, { t: nf(x.m.active), v: x.m.active }, { t: pc(x.m.activation), v: x.m.activation ?? -1 }, { t: nf(x.m.habitual), v: x.m.habitual }, { t: nf(x.m.inactive), v: x.m.inactive }] })) }));
    h += noteGroup;
  }

  if (id === 'p3depth') {
    h += header(titleDepth(m), 'One number: the share of interactions that hand over a whole task.');
    h += card(24, 90, 1232, 52, '', '', `<p class="txt">${esc(N.depth)}</p>`, 'narr');
    [['DELEGATION RATE', pc(m.delegationRate), 'agent, CLI, plan, app ÷ all'], ['VS LAST MONTH', m.delegationChange == null ? '—' : (m.delegationChange >= 0 ? '+' : '-') + (Math.abs(m.delegationChange) * 100).toFixed(1) + ' pts', 'change in delegation rate'], ['HABITUAL NOT DEEP', nf(m.habitualNotDeep), `under ${pc(cfg.deepThreshold, 0)} delegated`], ['DEEP USERS', nf(m.deep), t.deep], ['DEPTH CONVERSION', pc(m.depthConv), 'deep ÷ habitual users'], ['TIME TO DEPTH (WEEKS)', m.timeToDepth == null ? '—' : String(Math.round(m.timeToDepth)), 'median, first use to first delegation']]
      .forEach((c, i) => { h += kpi(24 + i * 207, 150, 199, 88, ...c); });
    const rungs = ['Suggest', 'Edit', 'Review', 'Delegate'], rc = ['#B8C4E0', '#95A9CE', '#7290C8', '#232F54'];
    const rs = rungs.map((r, i) => ({ name: r, color: rc[i], vals: ws.map(w => w.byRung[r] || 0) }));
    h += card(24, 244, 608, 319, 'WHERE THE WORK SITS, BY RUNG', 'share of interactions per week · Suggest and Edit below the line, Review and Delegate above',
      cols({ w: 588, h: 235, cats: ws.map(w => w.label), series: rs, pct: true }) + legend(rs));
    h += card(648, 244, 608, 319, 'DELEGATION RATE, WEEK BY WEEK', 'delegated interactions ÷ all',
      lines({ w: 588, h: 245, cats: ws.map(w => w.label), series: [{ name: 'Delegation rate', color: COLORS[0], vals: ws.map(w => w.m.delegationRate) }], pctAxis: true }));
    h += card(24, 581, 608, 130, 'QUALITY', 'completion acceptance, deep users vs everyone else', `<p class="txt">${esc(N.quality)}</p>`);
    h += card(648, 581, 608, 130, 'THE SIGNATURE BEHAVIOUR', '', `<p class="txt">${esc(N.signature)}</p>`);
  }

  if (id === 'p5models') {
    h += header(titleModels(m), "Which models the work is routed to, which stacks it lands in, and how our depth test compares with GitHub's own.");
    [['POWERFUL MODEL SHARE', pc(m.powerfulShare), 'frontier-class models ÷ all attributed interactions'], ['DEEP VS EVERYONE ELSE', m.powerGap == null ? '—' : (m.powerGap >= 0 ? '+' : '-') + (Math.abs(m.powerGap) * 100).toFixed(1) + ' pts', 'deep users less everyone else'], ['TOP VENDOR SHARE', pc(m.topFamilyShare), 'share going to the largest single vendor'], ['UNCLASSIFIED', pc(m.unclassifiedShare), 'auto or unknown model routing'], ['AGENT ADOPTION', pc(m.agentRate), "GitHub's own flag, not our threshold"]]
      .forEach((c, i) => { h += kpi(29 + i * 247, 87, 239, 100, ...c); });
    const fams = [...new Set(ws.flatMap(w => Object.keys(w.m.famSum)))].sort();
    const fser = fams.map((f, i) => ({ name: f, color: COLORS[i % COLORS.length], vals: ws.map(w => w.m.famSum[f] || 0) }));
    h += card(29, 195, 628, 250, 'WHERE THE WORK IS ROUTED', 'interactions by vendor, each week (synthetic)',
      lines({ w: 608, h: 160, cats: ws.map(w => w.label), series: fser, area: true }) + legend(fser));
    const lr = langRows(m, data), lrs = lr.slice().sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)).slice(0, 12);
    h += card(666, 195, 595, 383, 'DELEGATION RATE BY LANGUAGE', 'delegated ÷ all interactions that name a language',
      hbars({ w: 575, h: 300, cats: lrs.map(r => ({ key: r.lang, label: r.lang })), series: [{ name: 'Delegation rate', color: COLORS[0], vals: lrs.map(r => r.rate || 0) }], fmt: v => pc(v, 0), labelW: 90 }));
    h += card(29, 459, 620, 190, 'LANGUAGES', 'attributed interactions by language · sortable',
      table({ id: 'langT', height: 128, cols: [{ h: 'Language' }, { h: 'Interactions', num: 1 }, { h: 'Delegated', num: 1 }, { h: 'Delegation rate', num: 1 }], rows: lr.map(r => ({ cells: [r.lang, { t: nf(r.t), v: r.t }, { t: nf(r.d), v: r.d }, { t: pc(r.rate), v: r.rate ?? -1 }] })) }));
    h += card(29, 655, 620, 57, '', '', `<p class="txt sm">${esc(N.bench)}</p>`, 'narr');
    h += card(666, 599, 595, 112, 'LANGUAGE NARRATIVE', '', `<p class="txt sm">${esc(langNarr(m, data))}</p>`);
  }

  if (id === 'p4value') {
    h += header('What that depth is worth', 'Deep users produce more. That difference, times a headcount, is the whole value model.');
    const A = 'assumption-based';
    const r1 = [['CAPACITY GAINED (FTE)', n1(m.capacity), `deep users × ${pc(cfg.uplift)} more ${cfg.outputMetric}`], ['VALUE REALISED', usd(m.valueRealised), `capacity × ${usd(cfg.loadedCost)} a year, pro-rated`], ['INVESTMENT', usd(m.invest), `${nf(cfg.seats)} seats × ${usd(cfg.seatCost)} a month, pro-rated`], ['NET VALUE', usd(m.net), 'value realised less investment'], ['ROI', m.roi == null ? '—' : Math.round(m.roi * 100).toLocaleString('en-US') + '%', 'net value ÷ investment']];
    const r2 = [['STILL ON THE TABLE (FTE)', n1(m.onTable), 'if every habitual user went deep'], ['WORTH', usd(m.valueOnTable), 'on-the-table capacity × cost'], ['COST PER DEEP USER', usd(m.costPerDeep), 'investment ÷ deep users'], ['IDLE SEAT COST', usd(m.idleSeatCost), 'seats that produced nothing'], ['COMPLETION ACCEPTANCE', pc(m.acceptance), 'accepted ÷ suggested (measured)']];
    r1.forEach((c, i) => { h += kpi(29 + i * 247, 87, 239, 88, ...c, i === 4 || i === 3 || i < 4 ? 'Assumption-based what-if, driven by the demo assumptions panel' : ''); });
    r2.forEach((c, i) => { h += kpi(29 + i * 247, 183, 239, 88, ...c, i < 4 ? 'Assumption-based what-if' : 'Measured'); });
    h += card(29, 280, 628, 218, 'CAPACITY GAINED, WEEK BY WEEK', 'FTE · assumption-based',
      lines({ w: 608, h: 160, cats: ws.map(w => w.label), series: [{ name: 'Capacity (FTE)', color: COLORS[1], vals: ws.map(w => w.m.capacity) }], fmt: v => n1(v) }));
    const g = grp();
    h += card(666, 280, 595, 218, `CAPACITY BY ${dimName}`, 'FTE · click a bar to cross-filter',
      hbars({ w: 575, h: 160, cats: g.slice(0, 8).map(x => ({ key: x.idx, label: x.key })), series: [{ name: 'Capacity (FTE)', color: COLORS[1], vals: g.slice(0, 8).map(x => x.m.capacity) }], fmt: v => n1(v), sel: selKey }));
    h += card(31, 503, 800, 208, `VALUE BY ${dimName}`, 'sortable · click a row to cross-filter',
      table({ id: 'valT', height: 145, selected: selKey, cols: [{ h: E.DIMS[dim] }, { h: 'Habitual', num: 1 }, { h: 'Deep', num: 1 }, { h: 'Capacity (FTE)', num: 1 }, { h: 'Value realised', num: 1 }, { h: 'Still on the table', num: 1 }], rows: g.map(x => ({ key: x.idx, cells: [x.key, { t: nf(x.m.habitual), v: x.m.habitual }, { t: nf(x.m.deep), v: x.m.deep }, { t: n1(x.m.capacity), v: x.m.capacity }, { t: usd(x.m.valueRealised), v: x.m.valueRealised }, { t: usd(x.m.valueOnTable), v: x.m.valueOnTable }] })) }));
    h += card(851, 503, 429, 208, 'VALUE NARRATIVE', '', `<p class="txt sm">${esc(N.value)}</p><p class="txt sm mute">${esc(N.assume)}</p>`);
    void A;
  }
  h += `<div class="dnote">${esc(dataNote)}</div>`;
  return h;
}
function fmtDate(day) { return new Date(day * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }

// App shell: state, slicers, page tabs, scaling, tooltips, cross-filtering, assumptions panel.
const DATA = window.GHCP_DATA, E = createEngine(DATA);
const DEFAULTS = { deepThreshold: .10, habitWeeks: 3, habitWindow: 4, seats: 200, seatCost: 39, enablement: 0, uplift: .184, loadedCost: 150000, outputMetric: 'PRs merged per week' };
const S = { E, data: DATA, cfg: { ...DEFAULTS }, dim: 'org', sel: null, page: 'p1exec', F: { org: null, fn: null, group: null, start: E.bounds.min, end: E.bounds.max } };
const $ = s => document.querySelector(s);
const iso = d => new Date(d * 86400000).toISOString().slice(0, 10);
const day = s => Date.parse(s + 'T00:00:00Z') / 86400000;

function slicerHtml() {
  const multi = (x, label, key, dictKey) => {
    const all = DATA.dict[dictKey].map((v, i) => [v, i]).sort((a, b) => a[0].localeCompare(b[0]));
    const set = S.F[key];
    const txt = !set ? 'All' : set.size === 1 ? DATA.dict[dictKey][[...set][0]] : set.size + ' selected';
    return `<div class="slicer" style="left:${x}px"><label>${label}</label><details data-key="${key}"><summary>${esc(txt)}</summary><div class="menu">
      <a data-all="${key}">Select all</a>${all.map(([v, i]) => `<label class="opt"><input type="checkbox" data-k="${key}" value="${i}" ${!set || set.has(i) ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</div></details></div>`;
  };
  const gb = `<div class="slicer" style="left:628px"><label>Group By</label><select id="gb">${Object.entries(E.DIMS).map(([k, v]) => `<option value="${k}" ${k === S.dim ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`;
  const dt = `<div class="slicer date" style="left:1096px"><label>Date</label><input type="date" id="d0" value="${iso(S.F.start)}" min="${iso(E.bounds.min)}" max="${iso(E.bounds.max)}"><input type="date" id="d1" value="${iso(S.F.end)}" min="${iso(E.bounds.min)}" max="${iso(E.bounds.max)}"></div>`;
  return gb + multi(784, 'Organisation', 'org', 'org') + multi(940, 'Function Type', 'fn', 'fn') + dt;
}

function draw() {
  const pg = PAGES.find(p => p.id === S.page);
  const open = [...document.querySelectorAll('.slicer details[open]')].map(d => d.dataset.key);
  let html = render(S.page, S);
  const m = html.match(/<div class="dnote">(.*?)<\/div>/);
  html = html.replace(/<div class="dnote">.*?<\/div>/g, '');
  $('#status').textContent = m ? m[1].replace(/&amp;/g, '&') : '';
  $('#canvas').innerHTML = html + (pg.slicers ? slicerHtml() : '');
  open.forEach(k => { const d = document.querySelector(`.slicer details[data-key="${k}"]`); if (d) d.open = true; });
  $('#tabs').innerHTML = PAGES.map(p => `<button class="${p.id === S.page ? 'on' : ''}" data-page="${p.id}">${esc(p.name)}</button>`).join('');
  $('#chip').hidden = !S.sel;
  if (S.sel) $('#chip span').textContent = `${E.DIMS[S.sel.dim]}: ${DATA.dict[S.sel.dim][S.sel.idx]}`;
  document.title = 'GitHub Copilot Panel — interactive demo (synthetic data)';
  history.replaceState(null, '', '#' + S.page);
  fit();
}
function fit() {
  const st = $('#stage'), k = Math.min(st.clientWidth / 1280, st.clientHeight / 720);
  $('#canvas').style.transform = `scale(${k})`;
  $('#frame').style.width = 1280 * k + 'px'; $('#frame').style.height = 720 * k + 'px';
}
function applySel(key) {
  const idx = +key;
  S.sel = S.sel && S.sel.idx === idx && S.sel.dim === S.dim ? null : { dim: S.dim, idx };
  draw();
}

document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-page]')) { S.page = t.closest('[data-page]').dataset.page; draw(); return; }
  const th = t.closest('th[data-sort]');
  if (th) {
    const tb = th.closest('table').tBodies[0], i = +th.dataset.sort, dir = th.dataset.dir === 'asc' ? -1 : 1;
    th.closest('tr').querySelectorAll('th').forEach(x => { delete x.dataset.dir; });
    th.dataset.dir = dir === 1 ? 'asc' : 'desc';
    const v = tr => { const x = tr.cells[i].dataset.v, n = parseFloat(x); return isNaN(n) || /[A-Za-z]/.test(x) ? x : n; };
    [...tb.rows].sort((a, b) => { const x = v(a), y = v(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; }).forEach(r => tb.appendChild(r));
    return;
  }
  const row = t.closest('[data-sel]');
  if (row && row.closest('#canvas') && S.page !== 'p5models') { applySel(row.dataset.sel); return; }
  if (t.closest('[data-all]')) { S.F[t.closest('[data-all]').dataset.all] = null; draw(); return; }
  if (t.id === 'clear' || t.closest('#clear')) { S.sel = null; draw(); return; }
  if (t.closest('#about-btn')) { $('#about').showModal(); return; }
  if (t.closest('#assume-btn')) { $('#assume').showModal(); return; }
  if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
  if (t.id === 'reset') { S.cfg = { ...DEFAULTS }; fillAssume(); draw(); return; }
  if (t.id === 'resetf') { S.F = { org: null, fn: null, group: null, start: E.bounds.min, end: E.bounds.max }; S.sel = null; draw(); return; }
  if (!t.closest('.slicer details')) document.querySelectorAll('.slicer details[open]').forEach(d => { d.open = false; });
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'gb') { S.dim = t.value; S.sel = null; draw(); }
  else if (t.id === 'd0' || t.id === 'd1') {
    let a = day($('#d0').value), b = day($('#d1').value);
    if (isNaN(a) || isNaN(b)) return;
    if (a > b) [a, b] = [b, a];
    S.F.start = Math.max(E.bounds.min, a); S.F.end = Math.min(E.bounds.max, b); draw();
  } else if (t.dataset && t.dataset.k) {
    const key = t.dataset.k, box = [...document.querySelectorAll(`input[data-k="${key}"]`)];
    const on = box.filter(b => b.checked).map(b => +b.value);
    S.F[key] = on.length === box.length || !on.length ? null : new Set(on);
    draw();
  } else if (t.dataset && t.dataset.cfg) {
    const k = t.dataset.cfg, v = parseFloat(t.value);
    if (!isNaN(v)) { S.cfg[k] = t.dataset.pct ? v / 100 : v; draw(); }
  }
});
const tip = $('#tip');
document.addEventListener('mousemove', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY + 16) + 'px';
});
window.addEventListener('resize', fit);

function fillAssume() {
  const c = S.cfg, f = (k, label, v, pct, step) => `<label>${label}<input type="number" step="${step || 1}" data-cfg="${k}" ${pct ? 'data-pct="1"' : ''} value="${pct ? +(v * 100).toFixed(2) : v}"></label>`;
  $('#assume-body').innerHTML = f('uplift', 'Deep-user uplift (%)', c.uplift, 1, .1) + f('loadedCost', 'Loaded annual cost per FTE ($)', c.loadedCost, 0, 1000) + f('deepThreshold', 'Deep-user threshold (% delegated)', c.deepThreshold, 1, 1) + f('habitWeeks', 'Habit: weeks required', c.habitWeeks) + f('habitWindow', 'Habit: window (weeks)', c.habitWindow) + f('seats', 'Seats purchased', c.seats) + f('seatCost', 'Seat cost ($ per month)', c.seatCost);
}
fillAssume();
const hash = location.hash.slice(1);
if (PAGES.some(p => p.id === hash)) S.page = hash;
draw();
window.__GHCP = { S, E, draw };

})();
