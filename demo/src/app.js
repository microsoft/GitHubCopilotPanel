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
