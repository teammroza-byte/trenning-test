'use strict';

const APP_VERSION = 'v1.0';

// ---------- Ustawienia domyślne ----------
const DEFAULT_ROSTER = [
  'BOCIE_ODHOLUJE', 'BLAKUNIO', 'BOCIAN', 'DIABEŁ', 'WILCZUŚ', '_EXTAZY',
  '_Th3_T1t4N_BoY_', 'DEADLOCK___', 'VOLTSTORM', 'RIED', 'FAKE1TAQXI1'
];

// Kolumny w kolejności z arkusza
const COLUMNS = [
  { key: 'battles', label: 'BITWY', cls: 'col-bitwy', argb: 'FFFFC000' },
  { key: 'dmg', label: 'DMG', cls: 'col-dmg', argb: 'FF45B0E1' },
  { key: 'frags', label: 'FRAGI', cls: 'col-fragi', argb: 'FFFF3B30' },
  { key: 'shots', label: 'STRZAŁY', cls: 'col-strzaly', argb: 'FFDAF2D0' },
  { key: 'pens', label: 'PRZEBITE', cls: 'col-przebite', argb: 'FFD86ECC' },
  { key: 'blocked', label: 'ZABLOKOWANE', cls: 'col-zablok', argb: 'FF00B050' },
  { key: 'extra', label: null, cls: 'col-extra', argb: 'FFFFFF00' }
];

// Co może pokazywać ostatnia, żółta kolumna
const EXTRA_OPTIONS = {
  frags: 'FRAGI',
  hits: 'TRAFIENIA',
  assist: 'ASYSTA',
  win: 'WYGRANE',
  xp: 'DOŚWIADCZENIE'
};

const ROOM_TYPES = {
  1: 'Losowa', 2: 'Pokój treningowy', 4: 'Turniej', 5: 'Szybki turniej', 7: 'Rankingowa',
  8: 'Szalone gry', 22: 'Realistyczna', 23: 'Powstanie', 24: 'Grawitacja', 25: 'Potyczka', 26: 'Płonące gry'
};

const STAT_KEYS = ['dmg', 'frags', 'shots', 'hits', 'pens', 'blocked', 'assist', 'xp', 'win'];

// ---------- Pamięć ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('bt:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bt:' + k, JSON.stringify(v)); } catch { toast('Brak miejsca na zapis danych'); } }
};

const S = {
  roster: store.get('roster', DEFAULT_ROSTER),
  aliases: store.get('aliases', {}),       // nick (małe litery) -> nazwa w tabeli
  results: store.get('results', {}),       // "idBitwy:idKonta" -> wynik gracza
  battles: store.get('battles', {}),       // idBitwy -> informacje o bitwie
  extra: store.get('extra', 'frags'),
  mode: store.get('mode', 'sum'),
  tab: store.get('tab', 'table'),
  sort: null
};

function persist() {
  store.set('roster', S.roster);
  store.set('aliases', S.aliases);
  store.set('results', S.results);
  store.set('battles', S.battles);
  store.set('extra', S.extra);
  store.set('mode', S.mode);
  store.set('tab', S.tab);
}

// ---------- Pomocnicze ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = (s) => String(s || '').trim().toLocaleLowerCase('pl-PL');

function fmt(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '';
  return v.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}

// Nick z powtórki -> nazwa gracza w tabeli (albo null)
function rosterNameFor(nick) {
  const l = low(nick);
  if (S.aliases[l]) return S.aliases[l];
  return S.roster.find((n) => low(n) === l) || null;
}

const extraLabel = () => EXTRA_OPTIONS[S.extra] || 'FRAGI';

// ---------- Liczenie ----------
function emptyAgg() {
  const a = { battles: 0 };
  for (const k of STAT_KEYS) a[k] = 0;
  return a;
}

function aggregate() {
  const byRoster = new Map(S.roster.map((n) => [n, emptyAgg()]));
  const others = new Map();
  for (const r of Object.values(S.results)) {
    const name = rosterNameFor(r.nick);
    let a;
    if (name && byRoster.has(name)) a = byRoster.get(name);
    else {
      if (!others.has(r.nick)) others.set(r.nick, { ...emptyAgg(), clan: r.clan || '' });
      a = others.get(r.nick);
    }
    a.battles += 1;
    for (const k of STAT_KEYS) a[k] += r[k] || 0;
  }
  return { byRoster, others };
}

// Wartość komórki (suma lub średnia na bitwę)
function cellValue(a, key, mode) {
  const k = key === 'extra' ? S.extra : key;
  if (k === 'battles') return { v: a.battles, d: 0 };
  if (!a.battles) return { v: null, d: 0 };
  if (mode === 'avg') {
    const v = a[k] / a.battles;
    return { v, d: k === 'dmg' || k === 'blocked' || k === 'assist' || k === 'xp' ? 0 : 2 };
  }
  return { v: a[k], d: 0 };
}

// ---------- Dodawanie plików ----------
async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  let added = 0, dupes = 0, battlesNew = 0;
  const problems = [];

  for (const f of files) {
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const res = await importExcel(await f.arrayBuffer());
        added += res.added; dupes += res.dupes; battlesNew += res.battles;
        continue;
      }
      const rep = BlitzReplay.parseReplay(await f.arrayBuffer());
      const meaningful = rep.results.filter((r) => r.dmg || r.shots || r.frags || r.blocked);
      if (!rep.results.length || !meaningful.length) {
        problems.push(`${f.name}: brak wyników (bitwa przerwana lub powtórka bez danych)`);
        continue;
      }
      if (rep.results.length === 1) {
        problems.push(`${f.name}: tylko wyniki autora (${rep.results[0].nick})`);
      }
      const isNewBattle = !S.battles[rep.arenaId];
      const prev = S.battles[rep.arenaId] || {};
      S.battles[rep.arenaId] = {
        ts: rep.timestamp, map: rep.map, room: rep.roomType,
        author: prev.author ? prev.author : rep.author,
        file: prev.file || f.name
      };
      if (isNewBattle) battlesNew++;
      for (const r of rep.results) {
        const key = `${rep.arenaId}:${r.accountId}`;
        if (S.results[key]) { dupes++; continue; }
        S.results[key] = { arenaId: rep.arenaId, ts: rep.timestamp, ...r };
        added++;
      }
    } catch (e) {
      problems.push(`${f.name}: ${e.message || e}`);
    }
  }

  persist();
  render();
  const lines = [];
  if (battlesNew) lines.push(`Nowe bitwy: ${battlesNew}, wyników graczy: ${added}`);
  if (!battlesNew && added) lines.push(`Dopisano wyniki graczy: ${added}`);
  if (dupes && !added) lines.push('Te bitwy były już policzone – nic nie dodano.');
  else if (dupes) lines.push(`Pominięto powtórzone wyniki: ${dupes}`);
  if (problems.length) lines.push(...problems.slice(0, 4), problems.length > 4 ? `…i ${problems.length - 4} więcej` : '');
  toast(lines.filter(Boolean).join('\n') || 'Nic nie dodano');
}

// ---------- Excel ----------
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function addTableSheet(wb, name, mode) {
  const ws = wb.addWorksheet(name);
  const { byRoster } = aggregate();
  ws.columns = [{ width: 22 }, ...COLUMNS.map((c) => ({ width: c.key === 'blocked' ? 15 : 11 }))];

  const header = ['', ...COLUMNS.map((c) => c.label || extraLabel())];
  ws.addRow(header);
  for (const n of S.roster) {
    const a = byRoster.get(n);
    ws.addRow([n, ...COLUMNS.map((c) => {
      const { v, d } = cellValue(a, c.key, mode);
      return v == null ? null : (d ? Math.round(v * 100) / 100 : Math.round(v));
    })]);
  }
  ws.eachRow((row) => {
    row.font = { name: 'Aptos Narrow', size: 11 };
    for (let col = 1; col <= COLUMNS.length + 1; col++) {
      const cell = row.getCell(col);
      cell.border = border;
      if (col > 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLUMNS[col - 2].argb } };
        if (row.number > 1 && mode === 'avg') cell.numFmt = COLUMNS[col - 2].key === 'battles' ? '0' : '0.##';
      }
    }
  });
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

async function exportExcel() {
  if (!Object.keys(S.results).length) { toast('Najpierw dodaj powtórki.'); return; }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Blitz Trening';
  addTableSheet(wb, 'Tabela', 'sum');
  addTableSheet(wb, 'Średnie', 'avg');

  // Arkusz z każdą bitwą – z niego aplikacja potrafi wczytać dane z powrotem
  const ws = wb.addWorksheet('Bitwy');
  ws.columns = [
    { header: 'Data', key: 'date', width: 18 },
    { header: 'Mapa', key: 'map', width: 14 },
    { header: 'Tryb', key: 'room', width: 16 },
    { header: 'ID bitwy', key: 'arenaId', width: 22 },
    { header: 'ID konta', key: 'accountId', width: 12 },
    { header: 'Nick', key: 'nick', width: 22 },
    { header: 'Gracz w tabeli', key: 'player', width: 20 },
    { header: 'Drużyna', key: 'team', width: 9 },
    { header: 'Wygrana', key: 'win', width: 9 },
    { header: 'DMG', key: 'dmg', width: 9 },
    { header: 'Fragi', key: 'frags', width: 8 },
    { header: 'Strzały', key: 'shots', width: 9 },
    { header: 'Trafienia', key: 'hits', width: 10 },
    { header: 'Przebite', key: 'pens', width: 9 },
    { header: 'Zablokowane', key: 'blocked', width: 12 },
    { header: 'Asysta', key: 'assist', width: 9 },
    { header: 'XP', key: 'xp', width: 8 },
    { header: 'Czas (unix)', key: 'ts', width: 12 }
  ];
  const rows = Object.values(S.results).sort((a, b) => a.ts - b.ts || a.team - b.team);
  for (const r of rows) {
    const b = S.battles[r.arenaId] || {};
    ws.addRow({
      date: r.ts ? new Date(r.ts * 1000) : null, map: b.map || '', room: ROOM_TYPES[b.room] || '',
      arenaId: String(r.arenaId), accountId: r.accountId, nick: r.nick, player: rosterNameFor(r.nick) || '',
      team: r.team, win: r.win ? 'tak' : 'nie', dmg: r.dmg, frags: r.frags, shots: r.shots, hits: r.hits,
      pens: r.pens, blocked: r.blocked, assist: r.assist, xp: r.xp, ts: r.ts
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.getColumn('date').numFmt = 'dd.mm.yyyy hh:mm';
  ws.autoFilter = { from: 'A1', to: 'R1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `Trening_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Wczytanie wcześniej zapisanego pliku (arkusz „Bitwy”)
async function importExcel(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.getWorksheet('Bitwy');
  if (!ws) throw new Error('W tym pliku nie ma arkusza „Bitwy” zapisanego przez Blitz Trening');
  const head = {};
  ws.getRow(1).eachCell((c, i) => { head[String(c.value).trim()] = i; });
  const col = (row, name) => { const i = head[name]; if (!i) return null; const v = row.getCell(i).value; return v && typeof v === 'object' && 'result' in v ? v.result : v; };
  const roomByName = Object.fromEntries(Object.entries(ROOM_TYPES).map(([k, v]) => [v, Number(k)]));

  let added = 0, dupes = 0, battles = 0;
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const arenaId = String(col(row, 'ID bitwy') || '').trim();
    const accountId = Number(col(row, 'ID konta')) || 0;
    const nick = String(col(row, 'Nick') || '').trim();
    if (!arenaId || !nick) return;
    const ts = Number(col(row, 'Czas (unix)')) || 0;
    if (!S.battles[arenaId]) {
      S.battles[arenaId] = { ts, map: String(col(row, 'Mapa') || ''), room: roomByName[col(row, 'Tryb')] || 0, author: '', file: 'Excel' };
      battles++;
    }
    const key = `${arenaId}:${accountId || nick}`;
    if (S.results[key]) { dupes++; return; }
    const n = (name) => Number(col(row, name)) || 0;
    S.results[key] = {
      arenaId, ts, accountId, nick, clan: '', team: n('Drużyna'),
      win: String(col(row, 'Wygrana')).toLowerCase() === 'tak' ? 1 : 0,
      dmg: n('DMG'), frags: n('Fragi'), shots: n('Strzały'), hits: n('Trafienia'),
      pens: n('Przebite'), blocked: n('Zablokowane'), assist: n('Asysta'), xp: n('XP'), tankId: 0
    };
    added++;
    // Przywróć przypisanie nicku do gracza z tabeli
    const player = String(col(row, 'Gracz w tabeli') || '').trim();
    if (player && low(player) !== low(nick)) {
      if (!S.roster.some((r) => r === player)) S.roster.push(player);
      S.aliases[low(nick)] = player;
    }
  });
  return { added, dupes, battles };
}

// ---------- Widoki ----------
function viewTable() {
  if (!Object.keys(S.results).length) {
    return `
      <div class="empty-state">
        <h2>Przeciągnij tu powtórki z treningu</h2>
        <p>Pliki <b>.wotbreplay</b> – możesz kilka naraz. Tabela uzupełni się sama.<br>
        Możesz też wczytać plik Excela zapisany wcześniej przez tę aplikację.</p>
        <label class="btn primary">Wybierz pliki<input type="file" accept=".wotbreplay,.xlsx" multiple hidden data-pick></label>
      </div>`;
  }
  const { byRoster } = aggregate();
  let names = [...S.roster];
  if (S.sort) {
    names.sort((a, b) => (cellValue(byRoster.get(b), S.sort, S.mode).v ?? -1) - (cellValue(byRoster.get(a), S.sort, S.mode).v ?? -1));
  }
  const head = COLUMNS.map((c) => `<th class="${c.cls} ${S.sort === c.key ? 'sorted' : ''}" data-sort="${c.key}" title="Kliknij, aby posortować">${esc(c.label || extraLabel())}</th>`).join('');
  const body = names.map((n) => {
    const a = byRoster.get(n);
    return `<tr class="${a.battles ? '' : 'empty'}"><td>${esc(n)}</td>${COLUMNS.map((c) => {
      const { v, d } = cellValue(a, c.key, S.mode);
      return `<td class="${c.cls}">${v == null ? '' : fmt(v, d)}</td>`;
    }).join('')}</tr>`;
  }).join('');

  const opts = Object.entries(EXTRA_OPTIONS).map(([k, l]) => `<option value="${k}" ${S.extra === k ? 'selected' : ''}>${l}</option>`).join('');
  return `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Widok">
        <button data-mode="sum" class="${S.mode === 'sum' ? 'active' : ''}">Suma</button>
        <button data-mode="avg" class="${S.mode === 'avg' ? 'active' : ''}">Średnia na bitwę</button>
      </div>
      <label>Żółta kolumna:<select id="extraSel">${opts}</select></label>
      ${S.sort ? '<button class="btn small" data-action="unsort">Kolejność jak na liście</button>' : ''}
    </div>
    <table class="sheet">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${aggregate().others.size ? `<p class="note">W powtórkach są też gracze spoza tabeli (${aggregate().others.size}). Jeśli któryś to ktoś z Twojej drużyny pod innym nickiem, przypisz go w zakładce <b>Inni gracze</b>.</p>` : ''}`;
}

function viewBattles() {
  const list = Object.entries(S.battles).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
  if (!list.length) return '<p class="note">Nie dodano jeszcze żadnej bitwy.</p>';
  const countBy = {};
  const inTable = {};
  for (const r of Object.values(S.results)) {
    countBy[r.arenaId] = (countBy[r.arenaId] || 0) + 1;
    if (rosterNameFor(r.nick)) inTable[r.arenaId] = (inTable[r.arenaId] || 0) + 1;
  }
  return `
    <div class="toolbar">
      <span class="note">Bitew: <b>${list.length}</b></span>
      <button class="btn small danger" data-action="clear-all">Wyczyść wszystko (nowa tabela)</button>
    </div>
    <table class="list">
      <thead><tr><th>Data</th><th>Mapa</th><th>Tryb</th><th>Powtórka od</th><th class="num">Graczy</th><th class="num">Z tabeli</th><th></th></tr></thead>
      <tbody>${list.map(([id, b]) => `
        <tr>
          <td>${fmtDate(b.ts)}</td>
          <td>${esc(b.map || '—')}</td>
          <td>${esc(ROOM_TYPES[b.room] || '—')}</td>
          <td>${esc(b.author || '—')}</td>
          <td class="num ${countBy[id] === 1 ? 'warn' : ''}" title="${countBy[id] === 1 ? 'W powtórce są wyniki tylko jednego gracza' : ''}">${countBy[id] || 0}</td>
          <td class="num">${inTable[id] || 0}</td>
          <td><button class="btn small danger" data-del="${esc(id)}">Usuń</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function viewOthers() {
  const { others } = aggregate();
  if (!others.size) return '<p class="note">Wszyscy gracze z powtórek są w tabeli.</p>';
  const rows = [...others.entries()].sort((a, b) => b[1].battles - a[1].battles);
  const options = S.roster.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  return `
    <p class="note">Gracze z powtórek, których nie ma w tabeli (np. przeciwnicy). Jeśli to ktoś z Twojej drużyny pod innym nickiem, przypisz go do gracza z tabeli albo dodaj jako nowego.</p>
    <table class="list">
      <thead><tr><th>Nick</th><th>Klan</th><th class="num">Bitwy</th><th class="num">DMG</th><th>Przypisz</th></tr></thead>
      <tbody>${rows.map(([nick, a]) => `
        <tr>
          <td>${esc(nick)}</td>
          <td>${esc(a.clan || '')}</td>
          <td class="num">${a.battles}</td>
          <td class="num">${fmt(a.dmg)}</td>
          <td>
            <select data-assign="${esc(nick)}">
              <option value="">— wybierz —</option>
              <option value="__new">+ Dodaj jako nowego gracza</option>
              ${options}
            </select>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function viewRoster() {
  const aliases = Object.entries(S.aliases);
  return `
    <div class="roster">
      <p class="note">Gracze w tabeli, po jednym w linijce, w kolejności jak w arkuszu. Wielkość liter nie ma znaczenia przy dopasowaniu do nicków z powtórek.</p>
      <textarea id="rosterText" spellcheck="false">${esc(S.roster.join('\n'))}</textarea>
      <p><button class="btn primary" data-action="save-roster">Zapisz listę</button></p>
      ${aliases.length ? `
        <h3>Przypisane nicki</h3>
        <table class="list">
          <thead><tr><th>Nick w grze</th><th>Gracz w tabeli</th><th></th></tr></thead>
          <tbody>${aliases.map(([nick, name]) => `<tr><td class="alias">${esc(nick)}</td><td>${esc(name)}</td><td><button class="btn small" data-unalias="${esc(nick)}">Odepnij</button></td></tr>`).join('')}</tbody>
        </table>` : ''}
    </div>`;
}

function render() {
  const battles = Object.keys(S.battles).length;
  const { byRoster, others } = aggregate();
  const active = [...byRoster.values()].filter((a) => a.battles).length;
  $('#summary').textContent = battles ? `${battles} ${battles === 1 ? 'bitwa' : battles < 5 ? 'bitwy' : 'bitew'} · graczy z tabeli: ${active}` : '';

  document.querySelectorAll('.tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === S.tab);
    if (b.dataset.tab === 'others') b.innerHTML = `Inni gracze${others.size ? `<span class="count">${others.size}</span>` : ''}`;
    if (b.dataset.tab === 'battles') b.innerHTML = `Bitwy${battles ? `<span class="count">${battles}</span>` : ''}`;
  });
  const views = { table: viewTable, battles: viewBattles, others: viewOthers, roster: viewRoster };
  $('#view').innerHTML = (views[S.tab] || viewTable)();
}

// ---------- Zdarzenia ----------
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  S.tab = b.dataset.tab;
  store.set('tab', S.tab);
  render();
});

$('#view').addEventListener('click', (e) => {
  const t = e.target.closest('[data-sort],[data-mode],[data-action],[data-del],[data-unalias]');
  if (!t) return;
  if (t.dataset.sort) S.sort = S.sort === t.dataset.sort ? null : t.dataset.sort;
  if (t.dataset.mode) { S.mode = t.dataset.mode; store.set('mode', S.mode); }
  if (t.dataset.del) {
    const id = t.dataset.del;
    delete S.battles[id];
    for (const k of Object.keys(S.results)) if (S.results[k].arenaId === id) delete S.results[k];
    persist();
    toast('Bitwa usunięta z tabeli.');
  }
  if (t.dataset.unalias) { delete S.aliases[t.dataset.unalias]; persist(); }
  switch (t.dataset.action) {
    case 'unsort': S.sort = null; break;
    case 'clear-all':
      if (!confirm('Usunąć wszystkie bitwy i zacząć nową tabelę?\nLista graczy zostanie. Jeśli chcesz zachować obecne wyniki, najpierw zapisz je do Excela.')) return;
      S.battles = {}; S.results = {}; persist(); toast('Tabela wyczyszczona.'); break;
    case 'save-roster': {
      const names = $('#rosterText').value.split('\n').map((s) => s.trim()).filter(Boolean);
      S.roster = [...new Set(names)];
      for (const [nick, name] of Object.entries(S.aliases)) if (!S.roster.includes(name)) delete S.aliases[nick];
      persist();
      toast('Lista graczy zapisana.');
      break;
    }
  }
  render();
});

$('#view').addEventListener('change', (e) => {
  if (e.target.id === 'extraSel') { S.extra = e.target.value; store.set('extra', S.extra); render(); return; }
  if (e.target.matches('[data-pick]')) { addFiles(e.target.files); e.target.value = ''; return; }
  const nick = e.target.dataset.assign;
  if (nick == null || !e.target.value) return;
  if (e.target.value === '__new') {
    S.roster.push(nick);
    toast(`Dodano ${nick} do tabeli.`);
  } else {
    S.aliases[low(nick)] = e.target.value;
    toast(`${nick} liczy się teraz jako ${e.target.value}.`);
  }
  persist();
  render();
});

$('#filePick').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#btnExport').addEventListener('click', () => exportExcel().catch((err) => toast('Nie udało się zapisać pliku: ' + err.message)));

// Przeciąganie plików na okno
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  addFiles(e.dataTransfer.files);
});

// ---------- Start ----------
$('#version').textContent = APP_VERSION;
render();
