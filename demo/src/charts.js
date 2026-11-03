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
