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
