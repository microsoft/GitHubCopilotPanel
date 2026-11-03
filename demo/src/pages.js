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
