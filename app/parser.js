// Odczyt powtórek WoT Blitz (.wotbreplay)
// Powtórka to archiwum ZIP. Plik battle_results.dat zawiera obiekt pickle
// (id bitwy, bufor), a bufor to wiadomość protobuf z wynikami wszystkich graczy.
// Numery pól na podstawie projektu eigenein/wotbreplay-parser (licencja MIT).
(function (root) {
  'use strict';

  const fflate = root.fflate || (typeof require === 'function' ? require('./lib/fflate.min.js') : null);

  // ---------- protobuf ----------
  function readVarint(b, pos) {
    let result = 0, mul = 1, byte;
    do {
      if (pos.i >= b.length) throw new Error('Uszkodzony plik (varint)');
      byte = b[pos.i++];
      result += (byte & 0x7f) * mul;
      mul *= 128;
    } while (byte & 0x80);
    return result;
  }

  // Zwraca mapę: numer pola -> lista wartości (liczby lub Uint8Array)
  function decode(b) {
    const out = new Map();
    const pos = { i: 0 };
    while (pos.i < b.length) {
      const key = readVarint(b, pos);
      const field = Math.floor(key / 8), wire = key % 8;
      let val;
      if (wire === 0) val = readVarint(b, pos);
      else if (wire === 2) { const len = readVarint(b, pos); val = b.subarray(pos.i, pos.i + len); pos.i += len; }
      else if (wire === 5) { val = new DataView(b.buffer, b.byteOffset + pos.i, 4).getFloat32(0, true); pos.i += 4; }
      else if (wire === 1) { pos.i += 8; val = 0; }
      else throw new Error('Nieznany format danych (' + wire + ')');
      if (!out.has(field)) out.set(field, []);
      out.get(field).push(val);
    }
    return out;
  }
  const num = (m, f) => (m.has(f) && typeof m.get(f)[0] === 'number' ? m.get(f)[0] : 0);
  const txt = (m, f) => (m.has(f) ? new TextDecoder().decode(m.get(f)[0]) : '');

  // ---------- pickle (tylko to, co jest w battle_results.dat) ----------
  function unpickle(b) {
    let i = 0, arenaId = null, buffer = null;
    const le = (n) => { let v = 0n; for (let k = n - 1; k >= 0; k--) v = (v << 8n) | BigInt(b[i + k]); return v; };
    while (i < b.length) {
      const op = b[i++];
      switch (op) {
        case 0x80: i += 1; break;                                   // PROTO
        case 0x8a: { const n = b[i++]; if (arenaId == null) arenaId = le(n).toString(); i += n; break; } // LONG1
        case 0x4a: if (arenaId == null) arenaId = String(new DataView(b.buffer, b.byteOffset + i, 4).getInt32(0, true)); i += 4; break; // BININT
        case 0x4b: if (arenaId == null) arenaId = String(b[i]); i += 1; break; // BININT1
        case 0x4d: if (arenaId == null) arenaId = String(b[i] | (b[i + 1] << 8)); i += 2; break; // BININT2
        case 0x54: case 0x42: { const n = new DataView(b.buffer, b.byteOffset + i, 4).getUint32(0, true); i += 4; if (!buffer) buffer = b.subarray(i, i + n); i += n; break; } // BINSTRING / BINBYTES
        case 0x55: case 0x43: { const n = b[i++]; if (!buffer) buffer = b.subarray(i, i + n); i += n; break; } // SHORT_BINSTRING / SHORT_BINBYTES
        case 0x8e: { const n = Number(new DataView(b.buffer, b.byteOffset + i, 8).getBigUint64(0, true)); i += 8; if (!buffer) buffer = b.subarray(i, i + n); i += n; break; } // BINBYTES8
        case 0x71: i += 1; break;                                   // BINPUT
        case 0x72: i += 4; break;                                   // LONG_BINPUT
        case 0x95: i += 8; break;                                   // FRAME
        case 0x85: case 0x86: case 0x87: case 0x94: break;          // TUPLE1-3, MEMOIZE
        case 0x2e: return { arenaId, buffer };                      // STOP
        default: throw new Error('Nieobsługiwany format pliku wyników (0x' + op.toString(16) + ')');
      }
    }
    return { arenaId, buffer };
  }

  // ---------- powtórka ----------
  function parseReplay(arrayBuffer) {
    let files;
    try {
      files = fflate.unzipSync(new Uint8Array(arrayBuffer));
    } catch (e) {
      throw new Error('To nie jest plik powtórki (.wotbreplay)');
    }
    let meta = {};
    try { if (files['meta.json']) meta = JSON.parse(new TextDecoder().decode(files['meta.json'])); } catch { /* brak meta */ }
    if (!files['battle_results.dat']) {
      throw new Error('Powtórka nie zawiera wyników bitwy (bitwa nie została dokończona?)');
    }

    const { arenaId, buffer } = unpickle(files['battle_results.dat']);
    if (!buffer) throw new Error('Nie udało się odczytać wyników bitwy');
    const top = decode(buffer);

    // Gracze: id konta -> nick, drużyna
    const players = new Map();
    for (const raw of top.get(201) || []) {
      const p = decode(raw);
      const info = p.has(2) ? decode(p.get(2)[0]) : new Map();
      players.set(num(p, 1), { nick: txt(info, 1), team: num(info, 3), clan: txt(info, 5) });
    }

    const winner = num(top, 3);
    const results = [];
    for (const raw of top.get(301) || []) {
      const r = decode(raw);
      if (!r.has(2)) continue;
      const s = decode(r.get(2)[0]);
      const accountId = num(s, 101);
      const p = players.get(accountId) || { nick: `Gracz #${accountId}`, team: 0 };
      results.push({
        accountId,
        nick: p.nick,
        clan: p.clan || '',
        team: p.team,
        win: winner && p.team ? (winner === p.team ? 1 : 0) : 0,
        dmg: num(s, 8),
        frags: num(s, 18),
        shots: num(s, 4),
        hits: num(s, 5),
        pens: num(s, 7),
        blocked: num(s, 117),
        assist: num(s, 9) + num(s, 10),
        xp: num(s, 3),
        tankId: num(s, 103)
      });
    }

    return {
      arenaId: String(arenaId || meta.arenaUniqueId || ''),
      timestamp: num(top, 2) || Number(meta.battleStartTime) || 0,
      roomType: num(top, 9),
      map: meta.mapName || '',
      author: meta.playerName || '',
      duration: Number(meta.battleDuration) || 0,
      results
    };
  }

  const api = { parseReplay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BlitzReplay = api;
})(typeof self !== 'undefined' ? self : globalThis);
