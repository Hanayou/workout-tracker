/* ============================================================
   IRONOS // GAINS TERMINAL  —  app logic
   Vanilla JS, offline-first, localStorage persistence.
   ============================================================ */
'use strict';

/* ---------------- Constants ---------------- */
const K = { EX: 'wt_exercises', ENTRIES: 'wt_entries', SETTINGS: 'wt_settings' };

const DEFAULT_EXERCISES = [
  ['Leg Press', 'Legs'],
  ['Leg Curl', 'Legs'],
  ['Leg Extension', 'Legs'],
  ['Chest Press', 'Chest'],
  ['Pec Fly', 'Chest'],
  ['Lat Pulldown', 'Back'],
  ['Seated Row', 'Back'],
  ['Shoulder Press', 'Shoulders'],
  ['Abdominal', 'Core'],
];

const DEFAULT_SETTINGS = { defaultReps: 12, defaultSets: 4, weightStep: 2.5, unit: 'kg' };

const PALETTE = ['#00f0ff','#ff2bd6','#b6ff00','#9d5cff','#ff8a1e','#00ff9d','#4d8bff','#ffd500','#ff3b5c','#e0e0e0'];

/* ---------------- State ---------------- */
let exercises = [];
let entries = [];
let settings = { ...DEFAULT_SETTINGS };

const chart = { mode: 'all', exerciseId: null, range: 'all', hidden: new Set(), selection: null };
let chartCtx = null; // populated on each chart render for hit-testing

/* ---------------- Utilities ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 8);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const DAY = 86400000;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDay(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
function fmtShort(t) { const d = new Date(t); return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]}`; }
function fmtLong(str) {
  const t = parseDay(str); const d = new Date(t);
  return `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtW(w) {
  const n = Math.round(Number(w) * 100) / 100;
  return (Number.isFinite(n) ? n : 0).toString();
}
function num(v, fallback = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }

function colorForIndex(i) { return PALETTE[i % PALETTE.length]; }
function exIndex(id) { return exercises.findIndex(e => e.id === id); }
function colorFor(id) { const i = exIndex(id); return colorForIndex(i < 0 ? 0 : i); }
function exById(id) { return exercises.find(e => e.id === id); }

/* ---------------- Storage ---------------- */
function load() {
  try { exercises = JSON.parse(localStorage.getItem(K.EX)) || []; } catch { exercises = []; }
  try { entries = JSON.parse(localStorage.getItem(K.ENTRIES)) || []; } catch { entries = []; }
  try { settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(K.SETTINGS)) || {}) }; }
  catch { settings = { ...DEFAULT_SETTINGS }; }

  if (!exercises.length) {
    exercises = DEFAULT_EXERCISES.map(([name, cat]) => ({
      id: uid(), name, category: cat, isDefault: true, createdAt: new Date().toISOString(),
    }));
    saveExercises();
  }
}
function saveExercises() { localStorage.setItem(K.EX, JSON.stringify(exercises)); }
function saveEntries() { localStorage.setItem(K.ENTRIES, JSON.stringify(entries)); }
function saveSettings() { localStorage.setItem(K.SETTINGS, JSON.stringify(settings)); }

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast' + (isErr ? ' err' : ''); }, 2400);
}

/* ---------------- Modal ---------------- */
function openModal({ title, bodyHTML, actions }) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  const wrap = $('#modal-actions');
  wrap.innerHTML = '';
  (actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.class || 'btn-ghost');
    b.innerHTML = `<span>${esc(a.label)}</span>`;
    b.addEventListener('click', () => { if (a.onClick) a.onClick(); });
    wrap.appendChild(b);
  });
  $('#modal-overlay').hidden = false;
}
function closeModal() { $('#modal-overlay').hidden = true; }
$('#modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });

/* ---------------- Exercise <select> population ---------------- */
function populateExerciseSelect(sel, selectedId) {
  sel.innerHTML = '';
  // Group by category for a tidy native picker
  const byCat = {};
  exercises.forEach(e => { (byCat[e.category] || (byCat[e.category] = [])).push(e); });
  Object.keys(byCat).forEach(cat => {
    const og = document.createElement('optgroup');
    og.label = cat;
    byCat[cat].forEach(e => {
      const o = document.createElement('option');
      o.value = e.id; o.textContent = e.name;
      if (e.id === selectedId) o.selected = true;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
}

/* ---------------- Log form ---------------- */
function lastEntryFor(exId) {
  const list = entries.filter(e => e.exerciseId === exId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1)));
  return list[0] || null;
}
function maxWeightFor(exId) {
  const ws = entries.filter(e => e.exerciseId === exId).map(e => e.weight);
  return ws.length ? Math.max(...ws) : null;
}

function prefillForm() {
  const exId = $('#f-exercise').value;
  const last = lastEntryFor(exId);
  const max = maxWeightFor(exId);
  const hint = $('#f-hint');

  if (last) {
    $('#f-weight').value = fmtW(last.weight);
    $('#f-reps').value = last.reps;
    $('#f-sets').value = last.sets;
    const u = settings.unit;
    let extra = '';
    if (max != null && max > last.weight) extra = ` · <span class="up">max ${fmtW(max)}${u}</span>`;
    hint.innerHTML = `last: <b>${fmtW(last.weight)}${u}</b> × ${last.reps} × ${last.sets}${extra} — <span style="color:var(--text-faint)">${fmtShort(parseDay(last.date))}</span>`;
  } else {
    $('#f-weight').value = '';
    $('#f-reps').value = settings.defaultReps;
    $('#f-sets').value = settings.defaultSets;
    hint.innerHTML = `// no history — set your baseline (${settings.defaultReps} × ${settings.defaultSets})`;
  }
}

function stepField(id, dir, step) {
  const el = $('#' + id);
  const cur = num(el.value, 0);
  let next = cur + dir * step;
  if (next < 0) next = 0;
  next = Math.round(next * 100) / 100;
  el.value = next;
}

function commitEntry(e) {
  e.preventDefault();
  const exId = $('#f-exercise').value;
  if (!exId) { toast('Select an exercise', true); return; }
  const weight = Math.max(0, num($('#f-weight').value, 0));
  const reps = Math.max(1, Math.round(num($('#f-reps').value, settings.defaultReps)));
  const sets = Math.max(1, Math.round(num($('#f-sets').value, settings.defaultSets)));
  const date = $('#f-date').value || todayStr();
  const notes = $('#f-notes').value.trim();

  entries.push({ id: uid(), exerciseId: exId, date, weight, reps, sets, notes, createdAt: new Date().toISOString() });
  saveEntries();

  $('#f-notes').value = '';
  toast(`Logged ${exById(exId).name} · ${fmtW(weight)}${settings.unit}`);
  renderRecent();
  prefillForm(); // reflects the new "last"
}

/* ---------------- Recent activity ---------------- */
function renderRecent() {
  const wrap = $('#recent-list');
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty-list">// no sets logged yet<br>commit your first lift above</div>`;
    return;
  }
  const sorted = [...entries].sort((a, b) =>
    (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1))
  );
  const recent = sorted.slice(0, 40);

  const groups = {};
  recent.forEach(en => { (groups[en.date] || (groups[en.date] = [])).push(en); });

  let html = '';
  Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)).forEach(date => {
    html += `<div class="session-group"><div class="session-date">${fmtLong(date)}</div>`;
    groups[date].forEach(en => {
      const ex = exById(en.exerciseId);
      const name = ex ? ex.name : '— removed —';
      const col = ex ? colorFor(ex.id) : 'var(--text-faint)';
      html += `
        <div class="entry-row" style="border-left-color:${col}">
          <div class="entry-main">
            <div class="entry-ex">${esc(name)}</div>
            <div class="entry-meta">${en.reps} reps × ${en.sets} sets</div>
            ${en.notes ? `<div class="entry-notes">“${esc(en.notes)}”</div>` : ''}
          </div>
          <div class="entry-weight">${fmtW(en.weight)}<small>${settings.unit}</small></div>
          <div class="entry-actions">
            <button class="icon-btn edit" data-edit="${en.id}" aria-label="Edit">✎</button>
            <button class="icon-btn del" data-del="${en.id}" aria-label="Delete">✕</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  });
  if (sorted.length > 40) html += `<div class="empty-list">// showing latest 40 of ${sorted.length}</div>`;
  wrap.innerHTML = html;
}

function editEntry(id) {
  const en = entries.find(x => x.id === id);
  if (!en) return;
  const body = `
    <div class="field"><label>EXERCISE</label><select id="m-ex"></select></div>
    <div class="field"><label>WEIGHT (${settings.unit})</label><input id="m-w" type="number" inputmode="decimal" step="any" value="${en.weight}"></div>
    <div class="field-row">
      <div class="field"><label>REPS</label><input id="m-r" type="number" inputmode="numeric" value="${en.reps}"></div>
      <div class="field"><label>SETS</label><input id="m-s" type="number" inputmode="numeric" value="${en.sets}"></div>
    </div>
    <div class="field"><label>DATE</label><input id="m-d" type="date" value="${en.date}"></div>
    <div class="field"><label>NOTES</label><input id="m-n" type="text" maxlength="140" value="${esc(en.notes || '')}"></div>`;
  openModal({
    title: 'EDIT SET',
    bodyHTML: body,
    actions: [
      { label: '✕ Delete', class: 'btn-danger', onClick: () => { closeModal(); deleteEntry(id); } },
      { label: '✓ Save', class: 'btn-primary', onClick: () => {
          en.exerciseId = $('#m-ex').value;
          en.weight = Math.max(0, num($('#m-w').value, en.weight));
          en.reps = Math.max(1, Math.round(num($('#m-r').value, en.reps)));
          en.sets = Math.max(1, Math.round(num($('#m-s').value, en.sets)));
          en.date = $('#m-d').value || en.date;
          en.notes = $('#m-n').value.trim();
          saveEntries(); closeModal(); renderRecent(); prefillForm();
          toast('Set updated');
        } },
    ],
  });
  populateExerciseSelect($('#m-ex'), en.exerciseId);
}

function deleteEntry(id) {
  entries = entries.filter(x => x.id !== id);
  saveEntries(); renderRecent(); prefillForm();
  toast('Set deleted');
}

/* ---------------- Exercises view ---------------- */
function renderExercises() {
  const wrap = $('#exercise-list');
  let html = '';
  exercises.forEach(ex => {
    const count = entries.filter(e => e.exerciseId === ex.id).length;
    const col = colorFor(ex.id);
    html += `
      <div class="ex-row">
        <span class="detail-dot" style="color:${col};background:${col}"></span>
        <div class="ex-info">
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-sub"><span class="ex-cat-tag">${esc(ex.category)}</span><span class="ex-count">${count} log${count === 1 ? '' : 's'}</span></div>
        </div>
        <div class="entry-actions">
          <button class="icon-btn edit" data-exedit="${ex.id}" aria-label="Edit">✎</button>
          <button class="icon-btn del" data-exdel="${ex.id}" aria-label="Delete">✕</button>
        </div>
      </div>`;
  });
  wrap.innerHTML = html;
}

function addExercise(e) {
  e.preventDefault();
  const name = $('#e-name').value.trim();
  const cat = $('#e-cat').value;
  if (!name) { toast('Enter a name', true); return; }
  if (exercises.some(x => x.name.toLowerCase() === name.toLowerCase())) {
    toast('Already exists', true); return;
  }
  exercises.push({ id: uid(), name, category: cat, isDefault: false, createdAt: new Date().toISOString() });
  saveExercises();
  $('#e-name').value = '';
  renderExercises();
  populateExerciseSelect($('#f-exercise'), $('#f-exercise').value);
  toast(`Added ${name}`);
}

function editExercise(id) {
  const ex = exById(id);
  if (!ex) return;
  const cats = ['Legs','Chest','Back','Shoulders','Arms','Core','Bodyweight','Cardio','Other'];
  const body = `
    <div class="field"><label>NAME</label><input id="m-exname" type="text" maxlength="40" value="${esc(ex.name)}"></div>
    <div class="field"><label>CATEGORY</label><select id="m-excat">
      ${cats.map(c => `<option value="${c}"${c === ex.category ? ' selected' : ''}>${c}</option>`).join('')}
    </select></div>`;
  openModal({
    title: 'EDIT MODULE',
    bodyHTML: body,
    actions: [
      { label: '✓ Save', class: 'btn-primary', onClick: () => {
          const nm = $('#m-exname').value.trim();
          if (!nm) { toast('Enter a name', true); return; }
          ex.name = nm; ex.category = $('#m-excat').value;
          saveExercises(); closeModal();
          renderExercises(); renderRecent();
          populateExerciseSelect($('#f-exercise'), $('#f-exercise').value);
          toast('Module updated');
        } },
    ],
  });
}

function deleteExercise(id) {
  const ex = exById(id);
  if (!ex) return;
  const count = entries.filter(e => e.exerciseId === id).length;
  const warn = count > 0
    ? `<p class="muted">“${esc(ex.name)}” has <b style="color:var(--red)">${count}</b> logged set${count === 1 ? '' : 's'}. Deleting the module will erase them permanently.</p>`
    : `<p class="muted">Delete “${esc(ex.name)}”?</p>`;
  openModal({
    title: 'DELETE MODULE',
    bodyHTML: warn,
    actions: [
      { label: 'Cancel', class: 'btn-ghost', onClick: closeModal },
      { label: '✕ Delete', class: 'btn-danger', onClick: () => {
          exercises = exercises.filter(x => x.id !== id);
          entries = entries.filter(e => e.exerciseId !== id);
          if (chart.exerciseId === id) { chart.mode = 'all'; chart.exerciseId = null; }
          saveExercises(); saveEntries(); closeModal();
          renderExercises(); renderRecent();
          populateExerciseSelect($('#f-exercise'), $('#f-exercise').value);
          prefillForm();
          toast('Module deleted');
        } },
    ],
  });
}

/* ---------------- Chart: data ---------------- */
function seriesFor(exId) {
  const byDay = {};
  entries.filter(e => e.exerciseId === exId).forEach(e => {
    if (byDay[e.date] == null || e.weight > byDay[e.date].w) byDay[e.date] = { w: e.weight, entries: [] };
  });
  // collect all entries per day (for readout)
  entries.filter(e => e.exerciseId === exId).forEach(e => { if (byDay[e.date]) byDay[e.date].entries.push(e); });
  return Object.keys(byDay).sort().map(date => ({
    t: parseDay(date), date, w: byDay[date].w, entries: byDay[date].entries,
  }));
}
function exercisesWithData() { return exercises.filter(ex => entries.some(e => e.exerciseId === ex.id)); }

function niceStep(range) {
  if (!(range > 0)) return 1;
  const rough = range / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow;
  const nice = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return nice * pow;
}

/* ---------------- Chart: render ---------------- */
function renderChartChips() {
  const withData = exercisesWithData();
  let html = `<div class="chip ${chart.mode === 'all' ? 'active' : ''}" data-chip="all">◊ ALL</div>`;
  withData.forEach(ex => {
    const on = chart.mode === 'single' && chart.exerciseId === ex.id;
    html += `<div class="chip ${on ? 'active' : ''}" data-chip="${ex.id}">
      <span class="dot" style="color:${colorFor(ex.id)};background:${colorFor(ex.id)}"></span>${esc(ex.name)}</div>`;
  });
  $('#chart-chips').innerHTML = html;
}

const RANGES = [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'ALL']];
function rangeCutoff() {
  if (chart.range === 'all') return -Infinity;
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[chart.range] || 0;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() - months);
  return d.getTime();
}
function renderChartRange() {
  $('#chart-range').innerHTML = '<span class="range-label">Range</span>' +
    RANGES.map(([v, l]) => `<div class="chip sm ${chart.range === v ? 'active' : ''}" data-range="${v}">${l}</div>`).join('');
}

function renderChart() {
  renderChartChips();
  renderChartRange();
  const withData = exercisesWithData();
  const wrap = $('#chart-wrap');
  const legend = $('#chart-legend');
  const statsEl = $('#chart-stats');

  // which series to draw
  let plotted;
  if (chart.mode === 'single') {
    plotted = withData.filter(ex => ex.id === chart.exerciseId);
  } else {
    plotted = withData.filter(ex => !chart.hidden.has(ex.id));
  }

  const cutoff = rangeCutoff();
  const seriesList = plotted.map(ex => ({ ex, color: colorFor(ex.id), pts: seriesFor(ex.id).filter(p => p.t >= cutoff) }))
    .filter(s => s.pts.length > 0);

  // stats
  statsEl.innerHTML = renderStats(seriesList, cutoff);

  // legend (all mode)
  if (chart.mode === 'all' && withData.length) {
    legend.innerHTML = withData.map(ex => {
      const off = chart.hidden.has(ex.id);
      return `<div class="chip ${off ? 'off' : ''}" data-legend="${ex.id}">
        <span class="dot" style="color:${colorFor(ex.id)};background:${colorFor(ex.id)}"></span>${esc(ex.name)}</div>`;
    }).join('');
  } else { legend.innerHTML = ''; }

  const allPts = seriesList.flatMap(s => s.pts);
  if (!allPts.length) {
    wrap.innerHTML = `<div class="chart-empty">// NO SIGNAL<br>log some sets to render the gains matrix</div>`;
    chartCtx = null;
    return;
  }

  // ---- dimensions: draw in REAL pixels (viewBox == container px) so axis text
  // and strokes stay legible on mobile instead of being scaled down ----
  const VBW = Math.max(260, Math.round(wrap.clientWidth || 340));
  const VBH = Math.min(340, Math.max(220, Math.round(VBW * 0.66)));
  const m = { l: 42, r: 14, t: 14, b: 32 };
  const plotW = VBW - m.l - m.r, plotH = VBH - m.t - m.b;

  // x-domain always fits the (range-filtered) data, so points fill the width —
  // the range chips zoom to recent data rather than padding out to today.
  let xMin = Math.min(...allPts.map(p => p.t));
  let xMax = Math.max(...allPts.map(p => p.t));
  if (xMin === xMax) { xMin -= DAY; xMax += DAY; }

  let wMin = Math.min(...allPts.map(p => p.w));
  let wMax = Math.max(...allPts.map(p => p.w));
  const range = Math.max(wMax - wMin, 1);
  const pad = range * 0.15;
  const step = niceStep((wMax + pad) - (wMin - pad));
  let yMin = Math.floor((wMin - pad) / step) * step;
  if (yMin < 0) yMin = 0;
  let yMax = Math.ceil((wMax + pad) / step) * step;
  if (yMax === yMin) yMax = yMin + step;

  const xScale = t => m.l + (t - xMin) / (xMax - xMin) * plotW;
  const yScale = w => m.t + (1 - (w - yMin) / (yMax - yMin)) * plotH;

  // ---- build svg ----
  let g = '';

  // y gridlines + labels
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const y = yScale(v);
    g += `<line class="grid-line" x1="${m.l}" y1="${y.toFixed(1)}" x2="${m.l + plotW}" y2="${y.toFixed(1)}"/>`;
    g += `<text class="axis-label" x="${m.l - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${fmtW(v)}</text>`;
  }
  // x gridlines + labels
  const nX = 4;
  for (let i = 0; i <= nX; i++) {
    const t = xMin + (xMax - xMin) * i / nX;
    const x = xScale(t);
    g += `<line class="grid-line" x1="${x.toFixed(1)}" y1="${m.t}" x2="${x.toFixed(1)}" y2="${m.t + plotH}"/>`;
    const anchor = i === 0 ? 'start' : i === nX ? 'end' : 'middle';
    g += `<text class="axis-label" x="${x.toFixed(1)}" y="${m.t + plotH + 19}" text-anchor="${anchor}">${fmtShort(t)}</text>`;
  }

  // series
  const hitPts = [];
  seriesList.forEach(s => {
    const coords = s.pts.map(p => ({ x: xScale(p.t), y: yScale(p.w), p }));
    if (chart.mode === 'single' && coords.length > 1) {
      // subtle area fill
      let area = `M ${coords[0].x.toFixed(1)} ${(m.t + plotH).toFixed(1)}`;
      coords.forEach(c => area += ` L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`);
      area += ` L ${coords[coords.length - 1].x.toFixed(1)} ${(m.t + plotH).toFixed(1)} Z`;
      g += `<path class="series-area" d="${area}" fill="${s.color}"/>`;
    }
    if (coords.length > 1) {
      const d = coords.map((c, i) => `${i ? 'L' : 'M'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
      g += `<path class="series-line" d="${d}" stroke="${s.color}"/>`;
    }
    coords.forEach(c => {
      g += `<circle class="series-dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.5" fill="${s.color}"/>`;
      hitPts.push({ x: c.x, y: c.y, exId: s.ex.id, date: c.p.date, color: s.color });
    });
  });

  // brush rect (hidden) + capture layer on top
  g += `<rect class="brush-rect" id="brush-rect" x="0" y="${m.t}" width="0" height="${plotH}" visibility="hidden"/>`;
  g += `<rect id="brush-capture" x="${m.l}" y="${m.t}" width="${plotW}" height="${plotH}" fill="transparent"/>`;

  wrap.innerHTML = `<svg id="chart-svg" viewBox="0 0 ${VBW} ${VBH}" preserveAspectRatio="xMidYMid meet">${g}</svg>`;

  chartCtx = { xMin, xMax, yMin, yMax, m, plotW, plotH, xScale, hitPts, seriesList };
  attachChartInteractions();
}

function renderStats(seriesList, cutoff) {
  const box = (val, label, cls = '') => `<div class="stat"><div class="stat-val ${cls}">${val}</div><div class="stat-label">${label}</div></div>`;
  if (chart.mode === 'single' && seriesList.length === 1) {
    const pts = seriesList[0].pts;
    const first = pts[0].w, latest = pts[pts.length - 1].w;
    const max = Math.max(...pts.map(p => p.w));
    const delta = latest - first;
    const dCls = delta > 0 ? 'lime' : delta < 0 ? 'mag' : '';
    const dTxt = (delta > 0 ? '+' : '') + fmtW(delta) + settings.unit;
    return box(fmtW(latest) + settings.unit, 'CURRENT') + box(fmtW(max) + settings.unit, 'PEAK', 'mag') + box(dTxt, 'PROGRESS', dCls);
  }
  const win = entries.filter(e => parseDay(e.date) >= cutoff);
  const totalEntries = win.length;
  const tonnage = win.reduce((s, e) => s + e.weight * e.reps * e.sets, 0);
  const tTxt = tonnage >= 1000 ? (tonnage / 1000).toFixed(1) + 't' : Math.round(tonnage) + settings.unit;
  const tracked = new Set(win.map(e => e.exerciseId)).size;
  return box(totalEntries, 'LIFTS') + box(tracked, 'TRACKED', 'lime') + box(tTxt, 'TONNAGE', 'mag');
}

/* ---------------- Chart: interactions ---------------- */
function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function attachChartInteractions() {
  const svg = $('#chart-svg');
  const capture = $('#brush-capture');
  const brush = $('#brush-rect');
  if (!svg || !capture) return;

  let startX = null, moved = false;

  capture.addEventListener('pointerdown', e => {
    try { capture.setPointerCapture(e.pointerId); } catch (_) {}
    const loc = svgPoint(svg, e.clientX, e.clientY);
    startX = loc.x; moved = false;
    brush.setAttribute('visibility', 'hidden');
  });

  capture.addEventListener('pointermove', e => {
    if (startX == null) return;
    const loc = svgPoint(svg, e.clientX, e.clientY);
    if (Math.abs(loc.x - startX) > 10) moved = true;
    if (moved) {
      e.preventDefault();
      const x0 = Math.min(startX, loc.x), x1 = Math.max(startX, loc.x);
      const lo = Math.max(chartCtx.m.l, x0), hi = Math.min(chartCtx.m.l + chartCtx.plotW, x1);
      brush.setAttribute('x', lo);
      brush.setAttribute('width', Math.max(0, hi - lo));
      brush.setAttribute('visibility', 'visible');
    }
  });

  capture.addEventListener('pointerup', e => {
    if (startX == null) return;
    const loc = svgPoint(svg, e.clientX, e.clientY);
    if (moved) {
      const x0 = Math.min(startX, loc.x), x1 = Math.max(startX, loc.x);
      const t0 = invX(x0), t1 = invX(x1);
      showRangeDetail(t0, t1);
    } else {
      // tap: nearest point
      const near = nearestPoint(loc.x, loc.y);
      if (near) showPointDetail(near.exId, near.date);
      else { brush.setAttribute('visibility', 'hidden'); }
    }
    startX = null;
  });
  capture.addEventListener('pointercancel', () => { startX = null; });
}

function invX(x) {
  const { xMin, xMax, m, plotW } = chartCtx;
  let t = xMin + (x - m.l) / plotW * (xMax - xMin);
  return Math.max(xMin, Math.min(xMax, t));
}
function nearestPoint(x, y) {
  if (!chartCtx) return null;
  let best = null, bd = Infinity;
  chartCtx.hitPts.forEach(p => {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  });
  return bd <= 30 * 30 ? best : null;
}

function highlightDot(exId, date) {
  $$('.series-dot').forEach(d => d.classList.remove('hi'));
  // re-mark
  if (!chartCtx) return;
  const idx = chartCtx.hitPts.findIndex(p => p.exId === exId && p.date === date);
  const dots = $$('.series-dot');
  if (dots[idx]) dots[idx].classList.add('hi');
}

function showPointDetail(exId, date) {
  const ex = exById(exId);
  const dayEntries = entries.filter(e => e.exerciseId === exId && e.date === date)
    .sort((a, b) => b.weight - a.weight);
  const col = colorFor(exId);
  let html = `<div class="detail-head">${esc(ex ? ex.name : '—')} // ${fmtLong(date)}</div>`;
  html += dayEntries.map(en => detailItem(en, col)).join('');
  $('#chart-details').innerHTML = html;
  highlightDot(exId, date);
  $('#detail-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showRangeDetail(t0, t1) {
  const d0 = new Date(t0), d1 = new Date(t1);
  const s0 = `${d0.getFullYear()}-${String(d0.getMonth()+1).padStart(2,'0')}-${String(d0.getDate()).padStart(2,'0')}`;
  const s1 = `${d1.getFullYear()}-${String(d1.getMonth()+1).padStart(2,'0')}-${String(d1.getDate()).padStart(2,'0')}`;

  // visible exercise ids
  const visIds = new Set(chartCtx.seriesList.map(s => s.ex.id));
  const inRange = entries.filter(e => visIds.has(e.exerciseId) && e.date >= s0 && e.date <= s1)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.weight - a.weight));

  let html = `<div class="detail-head">▚ ${fmtShort(t0)} → ${fmtShort(t1)} // ${inRange.length} set${inRange.length === 1 ? '' : 's'}</div>`;
  if (!inRange.length) {
    html += `<div class="empty-note">// no sets in this window</div>`;
  } else {
    const groups = {};
    inRange.forEach(en => { (groups[en.date] || (groups[en.date] = [])).push(en); });
    Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)).forEach(date => {
      html += `<div class="detail-head" style="color:var(--text-dim);border:none;margin:12px 0 4px">${fmtLong(date)}</div>`;
      html += groups[date].map(en => detailItem(en, colorFor(en.exerciseId), true)).join('');
    });
  }
  $('#chart-details').innerHTML = html;
  $('#detail-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function detailItem(en, col, showName = false) {
  const ex = exById(en.exerciseId);
  const name = showName ? `${esc(ex ? ex.name : '—')} ` : '';
  return `<div class="detail-item">
    <span class="detail-dot" style="color:${col};background:${col}"></span>
    <div class="detail-ex">${name}<small>${en.reps} × ${en.sets}${en.notes ? ' · “' + esc(en.notes) + '”' : ''}</small></div>
    <div class="detail-w">${fmtW(en.weight)}${settings.unit}</div>
  </div>`;
}

/* ---------------- Data view ---------------- */
function renderDataStats() {
  const box = (val, label, cls = '') => `<div class="stat"><div class="stat-val ${cls}">${val}</div><div class="stat-label">${label}</div></div>`;
  const days = new Set(entries.map(e => e.date)).size;
  $('#data-stats').innerHTML = box(entries.length, 'LIFTS') + box(exercises.length, 'MODULES', 'lime') + box(days, 'SESSIONS', 'mag');
}

function exportData() {
  const payload = {
    app: 'IRONOS', format: 1, exportedAt: new Date().toISOString(),
    settings, exercises, entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ironos-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Snapshot exported');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); }
    catch { toast('Invalid JSON file', true); return; }
    if (!data || !Array.isArray(data.exercises) || !Array.isArray(data.entries)) {
      toast('Unrecognised backup', true); return;
    }
    openModal({
      title: 'IMPORT SNAPSHOT',
      bodyHTML: `<p class="muted">Found <b>${data.exercises.length}</b> modules and <b>${data.entries.length}</b> sets.<br><br><b>Replace</b> wipes current data and restores this snapshot. <b>Merge</b> adds anything new, keeping your current data.</p>`,
      actions: [
        { label: 'Merge', class: 'btn-ghost', onClick: () => { doImport(data, false); closeModal(); } },
        { label: 'Replace', class: 'btn-primary', onClick: () => { doImport(data, true); closeModal(); } },
      ],
    });
  };
  reader.readAsText(file);
}

function doImport(data, replace) {
  if (replace) {
    exercises = data.exercises;
    entries = data.entries;
    if (data.settings) settings = { ...DEFAULT_SETTINGS, ...data.settings };
  } else {
    const nameSet = new Set(exercises.map(e => e.name.toLowerCase()));
    const idMap = {};
    data.exercises.forEach(ex => {
      const existing = exercises.find(e => e.name.toLowerCase() === ex.name.toLowerCase());
      if (existing) { idMap[ex.id] = existing.id; }
      else { const nid = ex.id && !exercises.some(e => e.id === ex.id) ? ex.id : uid(); idMap[ex.id] = nid; exercises.push({ ...ex, id: nid }); nameSet.add(ex.name.toLowerCase()); }
    });
    const existingIds = new Set(entries.map(e => e.id));
    data.entries.forEach(en => {
      const mappedEx = idMap[en.exerciseId] || en.exerciseId;
      const nid = en.id && !existingIds.has(en.id) ? en.id : uid();
      if (existingIds.has(nid)) return;
      existingIds.add(nid);
      entries.push({ ...en, id: nid, exerciseId: mappedEx });
    });
  }
  saveExercises(); saveEntries(); saveSettings();
  chart.hidden.clear(); chart.mode = 'all'; chart.exerciseId = null;
  syncSettingsInputs();
  populateExerciseSelect($('#f-exercise'));
  prefillForm(); renderRecent(); renderExercises(); renderChart(); renderDataStats();
  toast(replace ? 'Snapshot restored' : 'Snapshot merged');
}

function syncSettingsInputs() {
  $('#s-reps').value = settings.defaultReps;
  $('#s-sets').value = settings.defaultSets;
  $('#s-step').value = settings.weightStep;
  $('#s-unit').value = settings.unit;
}
function saveSettingsFromInputs() {
  settings.defaultReps = Math.max(1, Math.round(num($('#s-reps').value, 12)));
  settings.defaultSets = Math.max(1, Math.round(num($('#s-sets').value, 4)));
  settings.weightStep = Math.max(0.5, num($('#s-step').value, 2.5));
  settings.unit = $('#s-unit').value;
  saveSettings();
  syncSettingsInputs();
  $$('.unit-label').forEach(el => el.textContent = settings.unit);
  prefillForm();
  toast('Defaults saved');
}

function wipeData() {
  openModal({
    title: 'WIPE ALL DATA',
    bodyHTML: `<p class="muted">This permanently erases <b style="color:var(--red)">all</b> logged sets and custom modules on this device. Export a backup first if you might want it back.</p>`,
    actions: [
      { label: 'Cancel', class: 'btn-ghost', onClick: closeModal },
      { label: '⚠ Wipe Everything', class: 'btn-danger', onClick: () => {
          localStorage.removeItem(K.EX); localStorage.removeItem(K.ENTRIES); localStorage.removeItem(K.SETTINGS);
          exercises = []; entries = []; settings = { ...DEFAULT_SETTINGS };
          chart.hidden.clear(); chart.mode = 'all'; chart.exerciseId = null;
          load();
          syncSettingsInputs();
          populateExerciseSelect($('#f-exercise'));
          prefillForm(); renderRecent(); renderExercises(); renderChart(); renderDataStats();
          closeModal();
          toast('All data wiped');
        } },
    ],
  });
}

function showInstallHint() {
  openModal({
    title: 'INSTALL ON iPHONE',
    bodyHTML: `<p class="muted">In <b>Safari</b>:</p>
      <p class="muted">1. Tap the <b>Share</b> icon (□↑) at the bottom.<br>
      2. Scroll and tap <b>“Add to Home Screen”</b>.<br>
      3. Tap <b>Add</b>. IRONOS launches full-screen like a native app — and works fully offline.</p>`,
    actions: [{ label: 'Got it', class: 'btn-primary', onClick: closeModal }],
  });
}

/* ---------------- Navigation ---------------- */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'progress') renderChart();
  if (name === 'data') { renderDataStats(); syncSettingsInputs(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- Clock ---------------- */
function tickClock() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  $('#clock').textContent = `// ${hh}:${mm} · ONLINE`;
}

/* ---------------- Wire up events ---------------- */
function bindEvents() {
  // tabs
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  // log form
  $('#f-exercise').addEventListener('change', prefillForm);
  $('#entry-form').addEventListener('submit', commitEntry);
  $$('.step-btn').forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const dir = Number(btn.dataset.dir);
    const step = btn.dataset.step ? Number(btn.dataset.step) : settings.weightStep;
    stepField(target, dir, step);
  }));

  // recent list (delegation)
  $('#recent-list').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    const ed = e.target.closest('[data-edit]');
    if (del) deleteEntry(del.dataset.del);
    else if (ed) editEntry(ed.dataset.edit);
  });

  // exercises
  $('#exercise-form').addEventListener('submit', addExercise);
  $('#exercise-list').addEventListener('click', e => {
    const del = e.target.closest('[data-exdel]');
    const ed = e.target.closest('[data-exedit]');
    if (del) deleteExercise(del.dataset.exdel);
    else if (ed) editExercise(ed.dataset.exedit);
  });

  // chart chips + legend
  $('#chart-chips').addEventListener('click', e => {
    const chip = e.target.closest('[data-chip]');
    if (!chip) return;
    const v = chip.dataset.chip;
    chart.selection = null;
    $('#chart-details').innerHTML = `<div class="empty-note">// tap a node or drag across the timeline to inspect</div>`;
    if (v === 'all') { chart.mode = 'all'; chart.exerciseId = null; }
    else { chart.mode = 'single'; chart.exerciseId = v; }
    renderChart();
  });
  $('#chart-legend').addEventListener('click', e => {
    const chip = e.target.closest('[data-legend]');
    if (!chip) return;
    const id = chip.dataset.legend;
    if (chart.hidden.has(id)) chart.hidden.delete(id); else chart.hidden.add(id);
    renderChart();
  });
  $('#chart-range').addEventListener('click', e => {
    const chip = e.target.closest('[data-range]');
    if (!chip) return;
    chart.range = chip.dataset.range;
    chart.selection = null;
    $('#chart-details').innerHTML = `<div class="empty-note">// tap a node or drag across the timeline to inspect</div>`;
    renderChart();
  });

  // data view
  $('#btn-export').addEventListener('click', exportData);
  $('#import-file').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('#btn-save-settings').addEventListener('click', saveSettingsFromInputs);
  $('#btn-wipe').addEventListener('click', wipeData);
  $('#btn-install-hint').addEventListener('click', showInstallHint);

  // re-render the chart on viewport changes (orientation / resize) so it stays
  // pixel-crisp — the SVG is sized to the container's real width.
  let chartResizeRAF = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(chartResizeRAF);
    chartResizeRAF = requestAnimationFrame(() => {
      if ($('#view-progress').classList.contains('active')) renderChart();
    });
  });
}

/* ---------------- Init ---------------- */
function init() {
  load();
  bindEvents();
  populateExerciseSelect($('#f-exercise'));
  $('#f-date').value = todayStr();
  $$('.unit-label').forEach(el => el.textContent = settings.unit);
  prefillForm();
  renderRecent();
  renderExercises();
  syncSettingsInputs();
  tickClock();
  setInterval(tickClock, 30000);

  // service worker — core assets are network-first, so a deploy lands on the next
  // online launch; when the new worker takes over we reload once to show it.
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || window.__ironosReloading) return;
      window.__ironosReloading = true;
      window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
