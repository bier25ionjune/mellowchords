'use strict';

/**
 * ==============================================================================
 * mellowchords - คลังคอร์ดกลางคืน (Night Busker Chordbook)
 * Modern PWA & Smart Chord Sheet Manager
 * ==============================================================================
 */

/* ==============================================================================
 * 1) การตั้งค่า (Configuration) & ฐานข้อมูลเพลงตัวอย่าง
 * ============================================================================== */
const CFG = {
  url: 'https://otbfzxypqyzobglbdrxp.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90YmZ6eHlwcXl6b2JnbGJkcnhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NzA2MTksImV4cCI6MjEwODU0NjYxOX0.GouGscQsPmLRrHZwSz9W71IY-sgDo_nmOZs55Eciqf4'
};

const MOCK_DB = [
  {
    id: 'mock-amazing',
    title: 'Amazing Grace',
    artist: 'Traditional',
    key: 'G',
    text: `[Verse 1]
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
I [G]once was [G7]lost, but [C]now am [G]found
Was [Em]blind but [D]now I [G]see`
  },
  {
    id: 'mock-rising',
    title: 'The House of the Rising Sun',
    artist: 'Traditional',
    key: 'Am',
    text: `[Verse 1]
Am    C    D        F
There is a house in New Orleans
Am   C        E7
They call the Rising Sun`
  },
  {
    id: 'mock-night',
    title: 'ค่ำคืนริมทาง (เพลงตัวอย่าง)',
    artist: 'Night Busker Demo',
    key: 'G',
    text: `[Intro]
[G] [Em] [C] [D]

[Verse 1]
[G]ค่ำคืนนี้ลมเย็น[Em]พัดผ่านมา
[C]กีตาร์ตัวเก่าๆ ยัง[D]เล่นเพลงเดิม

[Chorus]
[G]ร้องเพลงใต้แสงดาว [Em]เคล้าเสียงผู้คน
[C]บนถนนสายเดิมที่[D]คุ้นเคย [G]`
  }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function searchSongs(q) {
  await sleep(150);
  const t = q.toLowerCase().split(/\s+/).filter(Boolean);
  return MOCK_DB.filter(s => {
    const h = (s.title + ' ' + s.artist).toLowerCase();
    return t.every(x => h.includes(x));
  });
}

/* ==============================================================================
 * 2) ทฤษฎีดนตรี & การทดคีย์ (Music Theory & Transpose)
 * ============================================================================== */
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const BASE   = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FLAT_KEYS = [5, 10, 3, 8, 1]; // F, Bb, Eb, Ab, Db

const CHORD_RE = /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|\d+|[#b+\-°()])*(?:\/[A-G][#b]?)?$/;
const isChord = t => CHORD_RE.test(t);
const noteIndex = n => (BASE[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;

function transposeChord(ch, shift, flat) {
  if (!shift) return ch;
  const m = ch.match(/^([A-G][#b]?)([^\/]*)(?:\/([A-G][#b]?))?$/);
  if (!m) return ch;
  const N = flat ? FLATS : SHARPS, tr = n => N[(noteIndex(n) + shift + 12) % 12];
  return tr(m[1]) + m[2] + (m[3] ? '/' + tr(m[3]) : '');
}

function preferFlat(key, shift) {
  const m = (key || '').match(/^([A-G][#b]?)(.*)$/);
  if (!m) return false;
  const minor = /^m(?!aj)/.test(m[2]), t = (noteIndex(m[1]) + shift + 12) % 12;
  return FLAT_KEYS.includes(minor ? (t + 3) % 12 : t);
}

const normShift = s => {
  s = ((s % 12) + 12) % 12;
  return s > 6 ? s - 12 : s;
};

const fmtShift = s => (s > 0 ? '+' : '') + s;

/* ==============================================================================
 * 3) Smart Parser & Section Detector (จัดท่อนเพลง & เรนเดอร์คอร์ด)
 * ============================================================================== */
const THAI_MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
const safeCut = (i, s) => {
  while (i < s.length && THAI_MARK.test(s[i])) i++;
  return i;
};

function isChordLine(l) {
  if (!l.trim()) return false;
  const t = l.trim().split(/\s+/);
  return t.every(x => isChord(x) || x === '|' || x === '/' || x === '-') && t.some(isChord);
}

function getSectionType(line) {
  const clean = line.replace(/[\[\]():]/g, '').trim().toLowerCase();
  if (/^(intro|อินโทร)/i.test(clean)) return 'intro';
  if (/^(chorus|hook|ฮุก|ท่อนฮุก)/i.test(clean)) return 'chorus';
  if (/^(verse|ท่อน|เวิร์ส|\d+)/i.test(clean)) return 'verse';
  if (/^(bridge|ท่อนแยก|ส่ง)/i.test(clean)) return 'bridge';
  if (/^(solo|โซโล่)/i.test(clean)) return 'solo';
  if (/^(outro|out-tro|จบ|ท่อนจบ)/i.test(clean)) return 'outro';
  return 'general';
}

function parseSong(text) {
  const L = String(text || '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const out = [];

  for (let i = 0; i < L.length; i++) {
    const line = L[i];
    if (!line.trim()) {
      out.push({ type: 'blank' });
      continue;
    }

    // Two-line format: chord line on top, lyric line below
    if (isChordLine(line)) {
      const toks = [...line.matchAll(/\S+/g)].map(m => ({ t: m[0], i: m.index }));
      const next = L[i + 1];
      if (next !== undefined && next.trim() && !isChordLine(next)) {
        let p = 0;
        const cuts = toks.map(k => (p = Math.max(p, safeCut(k.i, next))));
        const segs = [];
        if (cuts[0] > 0) segs.push({ chord: '', text: next.slice(0, cuts[0]) });
        toks.forEach((k, n) => segs.push({ chord: k.t, text: next.slice(cuts[n], cuts[n + 1]) }));
        out.push({ type: 'line', segs });
        i++;
      } else {
        out.push({ type: 'line', chordOnly: true, segs: toks.map(k => ({ chord: k.t, text: '' })) });
      }
      continue;
    }

    // Inline bracket format: [G]ค่ำคืนนี้[Em]
    const re = /\[([^\]]+)\]/g;
    if ([...line.matchAll(re)].some(m => isChord(m[1]))) {
      const segs = [];
      let cur = { chord: '', text: '' }, last = 0;
      for (const m of line.matchAll(re)) {
        cur.text += line.slice(last, m.index);
        last = m.index + m[0].length;
        if (isChord(m[1])) {
          segs.push(cur);
          cur = { chord: m[1], text: '' };
        } else {
          cur.text += m[0];
        }
      }
      cur.text += line.slice(last);
      segs.push(cur);
      out.push({ type: 'line', segs: segs.filter(s => s.chord || s.text) });
      continue;
    }

    // Section header check (e.g. [Intro], [Chorus], Verse 1:, Solo:)
    const isSection = line.length < 50 && (
      /^\s*\[[^\]]+\]\s*$/.test(line) ||
      /^\s*(intro|verse|chorus|hook|bridge|solo|outro|interlude|pre-?chorus|ท่อน|อินโทร|ฮุก|ท่อนฮุก|โซโล่|ท่อนจบ)/i.test(line)
    );

    if (isSection) {
      const secType = getSectionType(line);
      out.push({ type: 'section', secType, text: line.trim() });
    } else {
      out.push({ type: 'line', segs: [{ chord: '', text: line }] });
    }
  }
  return out;
}

function detectKey(text) {
  for (const l of parseSong(text)) {
    if (l.segs) {
      for (const s of l.segs) {
        if (isChord(s.chord)) return s.chord.replace(/\/.*$/, '');
      }
    }
  }
  return '';
}

function renderSheet(box, text, shift, flat) {
  box.replaceChildren();
  for (const item of parseSong(text)) {
    if (item.type === 'blank') {
      box.appendChild(mk('div', 'line blank'));
      continue;
    }

    if (item.type === 'section') {
      const secBadge = mk('div', `secBadge sec-${item.secType}`, item.text);
      box.appendChild(secBadge);
      continue;
    }

    const row = mk('div', 'line' + (item.chordOnly ? ' chordonly' : ''));
    const hasChord = item.segs.some(s => s.chord);
    for (const s of item.segs) {
      const seg = mk('span', 'seg');
      if (hasChord) {
        seg.appendChild(mk('span', 'ch', s.chord ? transposeChord(s.chord, shift, flat) : ''));
      }
      seg.appendChild(mk('span', 'ly', s.text));
      row.appendChild(seg);
    }
    box.appendChild(row);
  }
}

/* ==============================================================================
 * 4) Smart Formatter (จัดระเบียบเนื้อเพลง & คอร์ดอัตโนมัติ)
 * ============================================================================== */
function smartFormatChordSheet(rawText, convertToBracket = false) {
  if (!rawText) return '';
  const lines = rawText.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const formatted = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();

    // Normalize Section names
    const secMatch = line.match(/^\s*[\[(]?\s*(intro|verse\s*\d*|chorus|hook|bridge|solo|outro|pre-?chorus|อินโทร|ฮุก|ท่อนฮุก|โซโล่|ท่อนแยก|ท่อนจบ)\s*[:\])]?\s*$/i);
    if (secMatch) {
      let name = secMatch[1].trim();
      const lower = name.toLowerCase();
      if (/intro|อินโทร/i.test(lower)) name = 'Intro';
      else if (/chorus|hook|ฮุก|ท่อนฮุก/i.test(lower)) name = 'Chorus';
      else if (/solo|โซโล่/i.test(lower)) name = 'Solo';
      else if (/bridge|ท่อนแยก/i.test(lower)) name = 'Bridge';
      else if (/outro|ท่อนจบ/i.test(lower)) name = 'Outro';
      else if (/verse/i.test(lower)) name = name.charAt(0).toUpperCase() + name.slice(1);
      
      formatted.push(`\n[${name}]`);
      continue;
    }

    // Convert two-line format into inline bracket format if requested
    if (convertToBracket && isChordLine(line) && i + 1 < lines.length && lines[i + 1].trim() && !isChordLine(lines[i + 1])) {
      const next = lines[i + 1].trimEnd();
      const toks = [...line.matchAll(/\S+/g)].map(m => ({ t: m[0], i: m.index }));
      let p = 0;
      const cuts = toks.map(k => (p = Math.max(p, safeCut(k.i, next))));
      let result = '';
      if (cuts[0] > 0) result += next.slice(0, cuts[0]);
      toks.forEach((k, idx) => {
        result += `[${k.t}]` + next.slice(cuts[idx], cuts[idx + 1] || next.length);
      });
      formatted.push(result);
      i++; // Skip the lyric line since we combined it
      continue;
    }

    formatted.push(line);
  }

  // Deduplicate excessive empty lines (max 2 consecutive empty lines)
  return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ==============================================================================
 * 5) Smart Web Scraper & Multi-Proxy Fetcher (ดึงคอร์ดจากเว็บ)
 * ============================================================================== */
function cleanTitle(t) {
  return (t || '')
    .replace(/\s*[|｜]\s.*$/, '')
    .replace(/^คอร์ด(เพลง)?\s*/i, '')
    .replace(/\s*-\s*เนื้อเพลง.*$/i, '')
    .replace(/\s*\(คอร์ดง่าย\).*$/i, '')
    .trim();
}

function parseTitleAndArtist(rawTitle, url = '') {
  let cleaned = cleanTitle(rawTitle);
  let title = '', artist = '';

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    title = parts[0].trim();
    artist = parts[1].trim();
  } else if (cleaned.includes(' / ')) {
    const parts = cleaned.split(' / ');
    title = parts[0].trim();
    artist = parts[1].trim();
  } else {
    title = cleaned;
  }

  if (!title && url) {
    try {
      title = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
        .replace(/\.\w+$/, '')
        .replace(/[-_+]+/g, ' ')
        .trim();
    } catch {}
  }
  return { title, artist };
}

function extractChordTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Title extraction
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const h1 = doc.querySelector('h1');
  const rawTitle = ((ogTitle && ogTitle.content) || (h1 && h1.textContent) || doc.title || '').trim();

  // Strip noise elements
  doc.querySelectorAll('script, style, nav, header, footer, noscript, svg, iframe, form, button, .ads, .ad, .advertisement, .banner, .social-share, .comments, .related-posts, #sidebar, .sidebar').forEach(n => n.remove());

  // Convert inline chord tags (<span class="chord">G</span>, <font color="..."> etc.) to [G] before stripping
  doc.querySelectorAll('[class*="chord"], [id*="chord"], font[color]').forEach(el => {
    const txt = el.textContent.trim();
    if (isChord(txt)) {
      el.replaceWith(`[${txt}]`);
    }
  });

  // Target specific chord containers if present
  const chordRoot = doc.querySelector('#chord_text') ||
                    doc.querySelector('.chord_text') ||
                    doc.querySelector('.chord-content') ||
                    doc.querySelector('.song-content') ||
                    doc.querySelector('pre.chord') ||
                    doc.querySelector('.entry-content pre') ||
                    doc.querySelector('article pre') ||
                    doc.querySelector('pre') ||
                    doc.querySelector('.entry-content') ||
                    doc.querySelector('article') ||
                    doc.querySelector('main') ||
                    doc.body;

  chordRoot.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  chordRoot.querySelectorAll('p, div, li, h1, h2, h3, h4, tr').forEach(n => n.append('\n'));

  const rawText = (chordRoot.textContent || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { rawTitle, text: rawText };
}

async function fetchPageWithFallbacks(url) {
  // 1. Supabase Edge Function (if authenticated and available)
  if (sb && user) {
    try {
      const { data, error } = await sb.functions.invoke('fetch-page', { body: { url } });
      if (!error && data && data.html) return data.html;
    } catch {}
  }

  // 2. Custom User Proxy (if specified in settings)
  const userProxy = (LS.get(PROXY, '') || '').trim();
  if (userProxy) {
    const r = await fetch(userProxy.replace('{url}', encodeURIComponent(url)));
    if (r.ok) return r.text();
  }

  // 3. Multi-Proxy Automatic Fallbacks (CORS bypass for web)
  const proxyEndpoints = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`
  ];

  for (const endpoint of proxyEndpoints) {
    try {
      const res = await fetch(endpoint, { headers: { 'Accept': 'text/html,application/xhtml+xml' } });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 100) return text;
      }
    } catch {}
  }

  // 4. Direct Fetch as final attempt
  const direct = await fetch(url);
  if (!direct.ok) throw new Error(`HTTP ${direct.status}`);
  return direct.text();
}

/* ==============================================================================
 * 6) Image OCR / AI Chord Scanner (สแกนคอร์ดจากภาพด้วย Tesseract.js)
 * ============================================================================== */
let tesseractWorker = null;

async function scanImageWithOCR(imageFileOrBlob, progressCb) {
  // Dynamically import Tesseract.js v5 ESM
  if (progressCb) progressCb('กำลังโหลดโมดูล AI/OCR...', 5);
  
  const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');

  const worker = await createWorker(['tha', 'eng'], 1, {
    logger: m => {
      if (progressCb && m.status) {
        const pct = m.progress != null ? Math.round(m.progress * 100) : 0;
        let msg = 'กำลังประมวลผล...';
        if (m.status.includes('loading')) msg = 'กำลังโหลดชุดภาษา Thai/Eng...';
        else if (m.status.includes('recognizing')) msg = `กำลังตรวจจับคอร์ดและเนื้อเพลง... (${pct}%)`;
        progressCb(msg, pct);
      }
    }
  });

  const ret = await worker.recognize(imageFileOrBlob);
  await worker.terminate();
  return ret.data.text;
}

/* ==============================================================================
 * 7) Storage & IndexedDB (จัดเก็บข้อมูลภาพและเพลง)
 * ============================================================================== */
const $ = (s, r = document) => r.querySelector(s);
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const btn = (t, fn, cls) => {
  const b = mk('button', cls || null, t);
  b.type = 'button';
  b.onclick = fn;
  return b;
};

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  }
};

const BOOK = 'nightChordbook.v1', SITES = 'nightChordbook.sites', FSK = 'nightChordbook.fs', PROXY = 'nightChordbook.proxy';
const K = { cfg: 'nightChordbook.sbcfg', favs: 'nightChordbook.favs', pls: 'nightChordbook.playlists', meta: 'nightChordbook.syncmeta' };

const loadBook = () => {
  const b = LS.get(BOOK, []);
  return Array.isArray(b) ? b : [];
};
const saveBook = b => LS.set(BOOK, b) || (toast('บันทึกไม่สำเร็จ (พื้นที่เต็มหรือถูกปิดใช้งาน)', true), false);

let toastT;
function toast(m, isErr = false) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.toggle('err', isErr);
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3400);
}

let _db;
const idb = () =>
  _db ||
  (_db = new Promise((res, rej) => {
    const r = indexedDB.open('nightChordbook', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('imgs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

const idbTx = async (mode, fn) => {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('imgs', mode);
    const req = fn(tx.objectStore('imgs'));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
};

const idbPut = (id, b) => idbTx('readwrite', s => s.put(b, id));
const idbGet = id => idbTx('readonly', s => s.get(id));
const idbDel = id => idbTx('readwrite', s => s.delete(id));

function shrinkImage(file, max = 4096) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k);
      c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      c.toBlob(b => {
        URL.revokeObjectURL(u);
        b ? res(b) : rej();
      }, 'image/jpeg', 0.88);
    };
    im.onerror = () => {
      URL.revokeObjectURL(u);
      rej();
    };
    im.src = u;
  });
}

const blobToDataURL = b =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

/* ==============================================================================
 * 8) สลับหน้าจอ & การควบคุม (Navigation & Wake Lock)
 * ============================================================================== */
let current = null, curPl = null, favOnly = false, wakeLock = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      $('#wakeLockBadge').hidden = false;
      wakeLock.addEventListener('release', () => {
        $('#wakeLockBadge').hidden = true;
        wakeLock = null;
      });
    } catch {}
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
    $('#wakeLockBadge').hidden = true;
  }
}

function show(name, push = true) {
  document.body.dataset.view = name;
  $('#placeholder').hidden = name !== 'home';
  $('#editorView').hidden = name !== 'editor';
  $('#songView').hidden = name !== 'song';
  $('#plView').hidden = name !== 'playlist';

  if (name !== 'song') {
    setFocus(false);
    setScroll(false);
    releaseWakeLock();
  } else {
    requestWakeLock();
  }

  scrollTo(0, 0);
  if (push && name !== 'home') history.pushState({ v: name }, '');
}

const goBack = () => {
  history.state && history.state.v ? history.back() : show('home', false);
};

addEventListener('popstate', e => {
  const v = e.state && e.state.v;
  show((v === 'song' && !current) || (v === 'playlist' && !curPl) ? 'home' : (v || 'home'), false);
});
document.querySelectorAll('.backBtn').forEach(b => (b.onclick = goBack));
$('#plBack').onclick = () => {
  if (location.hash.startsWith('#/p/')) history.replaceState(null, '', location.pathname);
  goBack();
};

/* ==============================================================================
 * 9) ค้นหาเพลง & คลังเพลงของฉัน (Search & Songbook)
 * ============================================================================== */
let sites = LS.get(SITES, [{ d: 'busk.town', on: false }, { d: 'chordtabs.in.th', on: false }]);
function renderSites() {
  const box = $('#sites');
  box.replaceChildren();
  sites.forEach((s, i) => {
    const c = mk('span', 'chip' + (s.on ? ' on' : ''));
    c.append(
      btn((s.on ? '✓ ' : '') + s.d, () => {
        s.on = !s.on;
        LS.set(SITES, sites);
        renderSites();
      }, 'lbl'),
      btn('✕', () => {
        sites.splice(i, 1);
        LS.set(SITES, sites);
        renderSites();
      }, 'x')
    );
    box.appendChild(c);
  });
}

$('#addSite').onclick = () => {
  const v = $('#newSite').value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  if (!v || !v.includes('.')) {
    toast('ใส่ชื่อเว็บให้ถูกต้อง เช่น chordtabs.in.th', true);
    return;
  }
  if (!sites.some(s => s.d === v)) sites.push({ d: v, on: true });
  LS.set(SITES, sites);
  $('#newSite').value = '';
  renderSites();
};

function webSearch() {
  const q = $('#q').value.trim();
  if (!q) {
    toast('พิมพ์ชื่อเพลงหรือศิลปินก่อน');
    $('#q').focus();
    return;
  }
  const on = sites.filter(s => s.on).map(s => 'site:' + s.d);
  window.open('https://www.google.com/search?q=' + encodeURIComponent(q + ' คอร์ด' + (on.length ? ' (' + on.join(' OR ') + ')' : '')), '_blank', 'noopener');
}
$('#searchForm').onsubmit = e => {
  e.preventDefault();
  webSearch();
};

let sTok = 0, deb;
async function doSearch() {
  const q = $('#q').value.trim(), tok = ++sTok, box = $('#resultsBox'), list = $('#results');
  renderSongbook();
  if (!q) {
    box.hidden = true;
    return;
  }
  if (matchMedia('(max-width:899px)').matches && document.body.dataset.view !== 'home') show('home', false);
  const items = await searchSongs(q);
  if (tok !== sTok) return;
  box.hidden = !items.length;
  list.replaceChildren();
  for (const it of items) {
    const row = mk('div', 'item'), b = mk('button', 'open'), t = mk('div', 't', it.title);
    t.appendChild(mk('span', 'badge', it.key));
    b.append(t, mk('div', 'a', it.artist));
    b.onclick = () => {
      const sv = loadBook().find(s => s.id === it.id);
      sv ? openSong(sv, sv.shift || 0) : openSong({ ...it }, 0);
    };
    row.appendChild(b);
    list.appendChild(row);
  }
}
$('#q').oninput = () => {
  clearTimeout(deb);
  deb = setTimeout(doSearch, 300);
};

const favs = () => new Set(LS.get(K.favs, [])), setFavs = s => LS.set(K.favs, [...s]);
function toggleFav(id) {
  const F = favs();
  F.has(id) ? F.delete(id) : F.add(id);
  setFavs(F);
  renderSongbook();
  paintFav();
}
function paintFav() {
  if (current) $('#favBtn').textContent = favs().has(current.song.id) ? '★ รายการโปรด' : '☆ รายการโปรด';
}
$('#favFilter').onclick = () => {
  favOnly = !favOnly;
  $('#favFilter').textContent = '⭐ เฉพาะรายการโปรด: ' + (favOnly ? 'เปิด' : 'ปิด');
  renderSongbook();
};
$('#favBtn').onclick = () => {
  const id = current.song.id;
  if (!loadBook().some(s => s.id === id)) $('#saveBtn').click();
  toggleFav(id);
};

function renderSongbook() {
  const q = $('#q').value.trim().toLowerCase(), F = favs();
  const all = loadBook().sort((a, b) => a.title.localeCompare(b.title, 'th'));
  let book = q ? all.filter(s => (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q)) : all;
  if (favOnly) book = book.filter(s => F.has(s.id));
  $('#count').textContent = all.length;
  const list = $('#songbook');
  list.replaceChildren();
  if (!book.length) list.appendChild(mk('div', 'empty', all.length ? 'ไม่พบเพลง' : 'ยังไม่มีเพลงที่บันทึกไว้'));
  for (const s of book) {
    const row = mk('div', 'item'), open = mk('button', 'open'), t = mk('div', 't', (F.has(s.id) ? '⭐ ' : '') + s.title);
    if (s.key) t.appendChild(mk('span', 'badge', s.key));
    if (s.shift) t.appendChild(mk('span', 'badge dim', fmtShift(s.shift)));
    if (s.images && s.images.length) t.appendChild(mk('span', 'badge dim', '🖼 ' + s.images.length));
    open.append(t, mk('div', 'a', s.artist || '—'));
    open.onclick = () => openSong(s, s.shift || 0);
    row.append(open, btn(F.has(s.id) ? '★' : '☆', () => toggleFav(s.id), 'del'), btn('🗑', () => removeSong(s.id, s.title), 'del danger'));
    list.appendChild(row);
  }
  schedSync();
}

async function removeSong(id, title) {
  if (!confirm(`ลบ “${title}” ออกจากคลังเพลง?`)) return;
  const s = loadBook().find(x => x.id === id);
  if (s && s.images) {
    for (const i of s.images) await idbDel(i).catch(() => {});
    cloudDelImgs(s.images);
  }
  saveBook(loadBook().filter(x => x.id !== id));
  renderSongbook();
  if (current && current.song.id === id) renderSong(false);
  toast('ลบแล้ว');
}

$('#exportBtn').onclick = async () => {
  try {
    const out = [];
    for (const s of loadBook()) {
      const o = { ...s };
      if (s.images && s.images.length) {
        o.imagesData = [];
        for (const id of s.images) {
          const b = await getImg(id);
          if (b) o.imagesData.push({ id, data: await blobToDataURL(b) });
        }
      }
      out.push(o);
    }
    const name = 'my-songbook-' + new Date().toISOString().slice(0, 10) + '.json';
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' }), file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const a = mk('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    toast('สำรองข้อมูลไม่สำเร็จ', true);
  }
};

$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data)) throw 0;
    const map = new Map(loadBook().map(s => [s.id, s]));
    let n = 0;
    for (const s of data) {
      if (!s || !s.id || !s.title || (!s.text && !(s.images && s.images.length))) continue;
      const { imagesData, ...clean } = s;
      for (const im of imagesData || []) await idbPut(im.id, await (await fetch(im.data)).blob());
      map.set(String(s.id), { ...clean, id: String(s.id) });
      n++;
    }
    saveBook([...map.values()]);
    renderSongbook();
    toast(`นำเข้า ${n} เพลงแล้ว ✔`);
  } catch {
    toast('ไฟล์ไม่ถูกต้อง', true);
  }
};

/* ==============================================================================
 * 10) การ์ดเพลง & โหมดเวที (Song View & Stage Mode)
 * ============================================================================== */
function openSong(song, shift = 0) {
  current = { song: { ...song }, shift: normShift(shift) };
  renderSong(true);
  show('song');
}

let galTok = 0, galUrls = [];
function renderSong(reload = true) {
  if (!current) return;
  const { song, shift } = current, hasText = !!(song.text && song.text.trim());
  const key = song.key || detectKey(song.text), flat = preferFlat(key, shift), now = key ? transposeChord(key, shift, flat) : '-';
  $('#cTitle').textContent = song.title;
  $('#cArtist').textContent = song.artist || 'ไม่ระบุศิลปิน';
  $('#cKeyOrig').textContent = key || '-';
  $('#cKeyNow').textContent = now;
  $('#dockKey').textContent = now;
  $('#shiftLabel').textContent = fmtShift(shift);
  $('#sheet').hidden = !hasText;
  $('#tpGrp').hidden = !hasText;
  if (hasText) renderSheet($('#sheet'), song.text, shift, flat);
  if (reload) loadGallery(song);
  const saved = loadBook().some(s => s.id === song.id);
  $('#savedTag').hidden = !saved;
  $('#deleteBtn').hidden = !saved;
  $('#saveBtn').textContent = saved ? '💾 อัปเดตเพลงที่บันทึกไว้' : '💾 บันทึกเข้าคลังเพลงของฉัน';
  paintFav();
}

async function loadGallery(song) {
  const tok = ++galTok, g = $('#gallery');
  galUrls.forEach(u => URL.revokeObjectURL(u));
  galUrls = [];
  g.replaceChildren();
  if (!song.images || !song.images.length) {
    g.hidden = true;
    return;
  }
  g.hidden = false;
  for (const id of song.images) {
    const b = await getImg(id);
    if (tok !== galTok) return;
    if (!b) {
      g.appendChild(mk('div', 'empty', 'ไม่พบภาพ (ล็อกอินและซิงก์เพื่อดึงภาพจากคลาวด์)'));
      continue;
    }
    const url = URL.createObjectURL(b);
    galUrls.push(url);
    const im = mk('img', 'sheetImg');
    im.src = url;
    im.alt = 'ภาพคอร์ด';
    im.onclick = () => openLightbox(url);
    g.appendChild(im);
  }
}

const setShift = n => {
  current.shift = normShift(n);
  renderSong(false);
};
$('#upBtn').onclick = () => setShift(current.shift + 1);
$('#downBtn').onclick = () => setShift(current.shift - 1);
$('#resetBtn').onclick = () => setShift(0);

$('#saveBtn').onclick = () => {
  const { song, shift } = current;
  const e = {
    id: song.id,
    title: song.title,
    artist: song.artist || '',
    key: song.key || detectKey(song.text),
    text: song.text || '',
    images: song.images || [],
    src: song.src || '',
    shift,
    savedAt: Date.now()
  };
  const book = loadBook(), i = book.findIndex(s => s.id === e.id), existed = i >= 0;
  if (existed) book[i] = e; else book.push(e);
  if (!saveBook(book)) return;
  renderSongbook();
  renderSong(false);
  toast(existed ? 'อัปเดตแล้ว ✔' : 'บันทึกเข้าคลังเพลงแล้ว ✔');
};

$('#deleteBtn').onclick = () => removeSong(current.song.id, current.song.title);
$('#editBtn').onclick = () => openEditor(current.song);

function openLightbox(url) {
  $('#lbImg').src = url;
  $('#lbBody').classList.remove('zoom');
  $('#lightbox').hidden = false;
}
$('#lbClose').onclick = () => ($('#lightbox').hidden = true);
$('#lbZoom').onclick = () => $('#lbBody').classList.toggle('zoom');

let fs = LS.get(FSK, 1.7);
const applyFs = () => document.documentElement.style.setProperty('--fs', fs + 'rem');
const bumpFs = d => {
  fs = Math.min(3.6, Math.max(1, +(fs + d).toFixed(2)));
  applyFs();
  LS.set(FSK, fs);
};
$('#fontUp').onclick = () => bumpFs(0.15);
$('#fontDown').onclick = () => bumpFs(-0.15);
applyFs();

function setFocus(on) {
  document.body.classList.toggle('focus', on);
  $('#exitFocus').hidden = !on;
  if (on) {
    scrollTo(0, 0);
    requestWakeLock();
  }
}
$('#focusBtn').onclick = () => setFocus(true);
$('#exitFocus').onclick = () => setFocus(false);

const SPEEDS = [['ช้า', 18], ['กลาง', 32], ['เร็ว', 55], ['เร็วมาก', 90]];
let spIdx = 1, scrolling = false, lastT = 0, acc = 0;
function tick(t) {
  if (!scrolling) return;
  acc += SPEEDS[spIdx][1] * (t - lastT) / 1000;
  lastT = t;
  const px = Math.floor(acc);
  if (px >= 1) {
    scrollBy(0, px);
    acc -= px;
  }
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
    setScroll(false);
    return;
  }
  requestAnimationFrame(tick);
}
function setScroll(on) {
  scrolling = on;
  $('#scrollBtn').textContent = on ? '⏸ หยุดเลื่อน' : '⏬ เลื่อนอัตโนมัติ';
  if (on) {
    lastT = performance.now();
    acc = 0;
    requestAnimationFrame(tick);
  }
}
$('#scrollBtn').onclick = () => setScroll(!scrolling);
$('#speedBtn').onclick = () => {
  spIdx = (spIdx + 1) % SPEEDS.length;
  $('#speedBtn').textContent = SPEEDS[spIdx][0];
};
['touchstart', 'wheel'].forEach(ev =>
  addEventListener(
    ev,
    e => {
      if (scrolling && !(e.target.closest && e.target.closest('.dock'))) setScroll(false);
    },
    { passive: true }
  )
);

/* ==============================================================================
 * 11) เพิ่ม / แก้ไขเพลง & OCR สแกนภาพคอร์ด
 * ============================================================================== */
let editingId = null, edImgs = [], edRemoved = [];
async function openEditor(song, prefill = '') {
  const keep = song && (song.id.startsWith('u-') || song.id.startsWith('sh-') || loadBook().some(s => s.id === song.id));
  editingId = keep ? song.id : null;
  edImgs = [];
  edRemoved = [];
  $('#editorTitle').textContent = song ? 'แก้ไขเพลง' : 'เพิ่มเพลงเอง';
  $('#fTitle').value = song ? song.title : prefill;
  $('#fArtist').value = song ? song.artist || '' : '';
  $('#fKey').value = song ? song.key || '' : '';
  $('#fText').value = song ? song.text || '' : '';
  $('#fUrl').value = song ? song.src || '' : '';
  show('editor');
  renderThumbs();
  if (keep && song.images && song.images.length) {
    for (const id of song.images) {
      const b = await getImg(id);
      if (b) edImgs.push({ id, blob: b, url: URL.createObjectURL(b), isNew: false });
    }
    renderThumbs();
  }
}

function renderThumbs() {
  const box = $('#thumbs');
  box.replaceChildren();
  edImgs.forEach((im, i) => {
    const d = mk('div', 'thumb'), img = mk('img');
    img.src = im.url;
    img.alt = '';

    const delBtn = btn('✕', () => {
      if (!im.isNew) edRemoved.push(im.id);
      edImgs.splice(i, 1);
      renderThumbs();
    });

    const ocrBtn = btn('🔍 สแกน', async () => {
      runOcrOnImage(im.blob);
    }, 'ocrThisBtn');

    d.append(img, delBtn, ocrBtn);
    box.appendChild(d);
  });
}

async function addImageFiles(files) {
  let n = 0;
  for (const f of files) {
    if (!f.type || !f.type.startsWith('image/')) continue;
    try {
      const blob = await shrinkImage(f);
      edImgs.push({ id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), blob, url: URL.createObjectURL(blob), isNew: true });
      n++;
    } catch {
      toast('อ่านภาพนี้ไม่ได้ (ลองแคปหน้าจอเป็น PNG/JPG)', true);
    }
  }
  renderThumbs();
  if (n) toast(`เพิ่ม ${n} ภาพแล้ว`);
}

$('#fImgs').onchange = async e => {
  const f = [...e.target.files];
  e.target.value = '';
  await addImageFiles(f);
};

$('#pasteImgBtn').onclick = async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast('ไม่รองรับปุ่มนี้ — กดค้างที่ช่องข้อความแล้วเลือก “วาง”');
    return;
  }
  try {
    const files = [];
    for (const it of await navigator.clipboard.read()) {
      const type = it.types.find(t => t.startsWith('image/'));
      if (type) files.push(new File([await it.getType(type)], 'paste.' + type.split('/')[1], { type }));
    }
    if (!files.length) {
      toast('ในคลิปบอร์ดไม่มีรูปภาพ');
      return;
    }
    addImageFiles(files);
  } catch {
    toast('อ่านคลิปบอร์ดไม่ได้ — ลองกดค้างที่ช่องข้อความแล้วเลือก “วาง”');
  }
};

document.addEventListener('paste', e => {
  if ($('#editorView').hidden || !e.clipboardData) return;
  let files = [...(e.clipboardData.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (!files.length) files = [...(e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  if (!e.clipboardData.getData('text/plain')) e.preventDefault();
  addImageFiles(files);
});

const edView = $('#editorView');
edView.addEventListener('dragover', e => e.preventDefault());
edView.addEventListener('drop', e => {
  const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  addImageFiles(files);
});

// Smart Format Button handler
$('#formatTextBtn').onclick = () => {
  const currentText = $('#fText').value;
  if (!currentText.trim()) {
    toast('ยังไม่มีข้อความคอร์ดในช่อง');
    return;
  }
  const formatted = smartFormatChordSheet(currentText, false);
  $('#fText').value = formatted;
  toast('✨ จัดระเบียบท่อนเพลงและคอร์ดเรียบร้อยแล้ว ✔');
};

// Convert to Bracket Format Button handler
$('#convertBracketBtn').onclick = () => {
  const currentText = $('#fText').value;
  if (!currentText.trim()) {
    toast('ยังไม่มีข้อความคอร์ดในช่อง');
    return;
  }
  const converted = smartFormatChordSheet(currentText, true);
  $('#fText').value = converted;
  toast('✨ แปลงคอร์ดเป็นรูปแบบ [G]เนื้อเพลง เรียบร้อยแล้ว (ไม่หลุดบรรทัดบนมือถือ) ✔');
};

// OCR Modal and Execution
async function runOcrOnImage(blob) {
  modal('🔍 AI / OCR สแกนคอร์ดจากภาพ', (box, close) => {
    const statusText = mk('p', 'muted', 'กำลังเตรียมโมดูลสแกน...');
    const progressBar = mk('div', 'progressBar');
    const progressFill = mk('div', 'progressFill');
    progressBar.appendChild(progressFill);
    const cancelBtn = btn('ยกเลิก', close, 'small');

    box.append(statusText, progressBar, cancelBtn);

    scanImageWithOCR(blob, (msg, pct) => {
      statusText.textContent = msg;
      progressFill.style.width = pct + '%';
    }).then(extractedText => {
      if (!extractedText || !extractedText.trim()) {
        statusText.textContent = 'ไม่พบข้อความในภาพนี้';
        return;
      }
      close();
      const formatted = smartFormatChordSheet(extractedText, false);
      const existing = $('#fText').value.trim();
      $('#fText').value = existing ? existing + '\n\n' + formatted : formatted;

      // Guess key if not set
      if (!$('#fKey').value.trim()) {
        const detected = detectKey(formatted);
        if (detected) $('#fKey').value = detected;
      }
      toast('สแกนเสร็จสิ้น — นำเข้าข้อความและคอร์ดแล้ว ✔');
    }).catch(err => {
      console.error(err);
      statusText.textContent = 'เกิดข้อผิดพลาดในการสแกน: ' + (err.message || err);
      statusText.className = 'err';
    });
  });
}

$('#ocrScanBtn').onclick = () => {
  if (!edImgs.length) {
    toast('แนบภาพคอร์ดอย่างน้อย 1 ภาพก่อน แล้วกดสแกน');
    return;
  }
  runOcrOnImage(edImgs[0].blob);
};

$('#editorForm').onsubmit = async e => {
  e.preventDefault();
  const text = $('#fText').value.replace(/\s+$/, '');
  if (!text.trim() && !edImgs.length) {
    toast('ใส่ข้อความคอร์ด หรือแนบภาพอย่างน้อยหนึ่งอย่าง', true);
    return;
  }
  const keyRaw = $('#fKey').value.trim(), badKey = keyRaw && !isChord(keyRaw);
  const song = {
    id: editingId || 'u-' + Date.now(),
    title: $('#fTitle').value.trim(),
    artist: $('#fArtist').value.trim(),
    key: isChord(keyRaw) ? keyRaw : detectKey(text),
    text,
    images: edImgs.map(i => i.id),
    src: $('#fUrl').value.trim(),
    shift: 0,
    savedAt: Date.now()
  };
  try {
    for (const i of edImgs) if (i.isNew) await idbPut(i.id, i.blob);
    for (const id of edRemoved) await idbDel(id);
    cloudDelImgs(edRemoved);
  } catch {
    toast('บันทึกภาพไม่สำเร็จ (พื้นที่เก็บข้อมูลอาจเต็ม)', true);
    return;
  }
  const book = loadBook(), i = book.findIndex(s => s.id === song.id);
  if (i >= 0) book[i] = song; else book.push(song);
  if (!saveBook(book)) return;
  renderSongbook();
  openSong(song, 0);
  toast(badKey ? 'บันทึกแล้ว (คีย์ไม่ถูกต้อง ใช้คีย์จากคอร์ดแรกแทน)' : 'บันทึกแล้ว ✔');
};

$('#addBtn').onclick = () => openEditor(null, $('#q').value.trim());
$('#pasteBtn').onclick = async () => {
  const clip = navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject();
  openEditor(null, $('#q').value.trim());
  try {
    const t = (await clip).trim();
    if (!t) {
      toast('ไม่มีข้อความในคลิปบอร์ด — ถ้าเป็นรูป กดปุ่ม “วางรูปจากคลิปบอร์ด”');
      return;
    }
    if (/^https?:\/\/\S+$/.test(t)) {
      $('#fUrl').value = t;
      importFromUrl();
    } else {
      $('#fText').value = t;
      toast('วางแล้ว — ตรวจชื่อเพลงและคอร์ดก่อนบันทึก');
    }
  } catch {
    toast('อ่านคลิปบอร์ดไม่ได้ — กดค้างที่ช่องข้อความแล้วเลือก “วาง”');
    $('#fText').focus();
  }
};

async function importFromUrl() {
  const url = $('#fUrl').value.trim(), b = $('#fetchUrlBtn');
  if (!/^https?:\/\//.test(url)) {
    toast('ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)', true);
    return;
  }
  b.disabled = true;
  const old = b.textContent;
  b.textContent = 'กำลังดึง…';
  try {
    const html = await fetchPageWithFallbacks(url);
    const { rawTitle, text } = extractChordTextFromHtml(html);
    const { title, artist } = parseTitleAndArtist(rawTitle, url);

    if (title && !$('#fTitle').value) $('#fTitle').value = title;
    if (artist && !$('#fArtist').value) $('#fArtist').value = artist;
    $('#fText').value = smartFormatChordSheet(text, false);

    if (!$('#fKey').value.trim()) {
      const k = detectKey(text);
      if (k) $('#fKey').value = k;
    }

    toast(text.length < 80 ? 'ได้ข้อความน้อยมาก — หน้านี้อาจเป็นภาพ ให้แคปหน้าจอแล้วแนบภาพ' : 'ดึงแล้ว — จัดระเบียบเนื้อเพลงและคอร์ดให้เรียบร้อยแล้ว ✔');
  } catch (err) {
    console.warn(err);
    toast('ดึงไม่ได้ (เว็บบล็อกการเข้าถึง) — คัดลอกมาวางในช่องแทนได้', true);
  } finally {
    b.disabled = false;
    b.textContent = old;
  }
}
$('#fetchUrlBtn').onclick = importFromUrl;
$('#fUrl').addEventListener('paste', () => setTimeout(() => {
  if (/^https?:\/\//.test($('#fUrl').value.trim())) importFromUrl();
}, 60));

$('#proxy').value = LS.get(PROXY, '') || '';
$('#proxy').onchange = e => {
  LS.set(PROXY, e.target.value.trim());
  toast('บันทึกการตั้งค่า Proxy แล้ว');
};

/* ==============================================================================
 * 12) Supabase ซิงก์ข้อมูล & บัญชีผู้ใช้ (Cloud Sync)
 * ============================================================================== */
let sb = null, user = null, syncing = false, status = '', sbErr = '';
const conf = () => {
  const s = LS.get(K.cfg, {});
  return { url: CFG.url || s.url || '', key: CFG.key || s.key || '' };
};
const getPls = () => LS.get(K.pls, []), setPls = p => LS.set(K.pls, p);
const getMeta = () => LS.get(K.meta, { songs: {}, pls: {} });
const hash = s => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return '' + h;
};
const songH = (s, f) => hash(JSON.stringify([s.title, s.artist, s.key, s.text, s.shift || 0, !(!f), s.images || []]));
const plH = p => hash(JSON.stringify([p.name, p.songIds, !(!p.shared), p.token || '']));
const toRow = (s, f) => ({
  user_id: user.id,
  id: s.id,
  title: s.title,
  artist: s.artist || '',
  song_key: s.key || '',
  content: s.text || '',
  src: s.src || '',
  shift: s.shift || 0,
  favorite: !(!f),
  images: s.images || []
});
const fromRow = (r, old) => ({
  ...(old || {}),
  id: r.id,
  title: r.title,
  artist: r.artist,
  key: r.song_key,
  text: r.content,
  src: r.src,
  shift: r.shift,
  images: r.images || [],
  savedAt: Date.parse(r.updated_at)
});
const fromP = r => ({
  id: r.id,
  name: r.name,
  shared: r.is_shared,
  token: r.share_token,
  updatedAt: Date.parse(r.updated_at),
  songIds: (r.playlist_items || []).slice().sort((a, b) => a.position - b.position).map(x => x.song_id)
});

function modal(title, build) {
  const ov = mk('div', 'modal'), box = mk('div', 'box'), bar = mk('div', 'row between');
  bar.append(mk('h2', null, title), btn('✕', () => ov.remove()));
  box.appendChild(bar);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  ov.appendChild(box);
  document.body.appendChild(ov);
  build(box, () => ov.remove());
}

function initClient() {
  const c = conf();
  sb = null;
  sbErr = '';
  if (!window.supabase) {
    sbErr = 'โหลดไลบรารี Supabase ไม่ได้ — กำลังทำงานในโหมดออฟไลน์';
    return;
  }
  if (!c.url || !c.key) {
    sbErr = 'ยังไม่ได้ใส่ Project URL / anon key';
    return;
  }
  try {
    sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    sb.auth.onAuthStateChange((_e, s) => {
      user = s ? s.user : null;
      paintAcct();
      if (user) setTimeout(syncAll, 0);
    });
  } catch (e) {
    sb = null;
    sbErr = 'ตั้งค่าไม่ถูกต้อง: ' + e.message;
  }
}

const setStatus = s => {
  status = s;
  paintAcct();
};

function paintAcct() {
  let t = '⚠️ เชื่อมต่อไม่ได้';
  if (sb) {
    t = user ? '☁️ ' + (user.email || '').split('@')[0] + ' ' + ({ ok: '✓', sync: '⟳', err: '⚠', off: '⚡' }[status] || '') : '👤 เข้าสู่ระบบ';
  }
  $('#acct').textContent = t;
}
$('#acct').onclick = () => openAcct();

const authMsg = m => {
  m = String(m || '');
  if (/signups? (are )?not allowed|signup.*disabled/i.test(m)) return 'โปรเจกต์ปิดการสมัครไว้ — เปิด “Enable sign ups” ใน Supabase';
  if (/rate limit/i.test(m)) return 'ส่งอีเมลถี่เกินกำหนด — ปิด “Confirm email” ใน Supabase หรือรอสักครู่';
  if (/not authorized/i.test(m)) return 'ส่งอีเมลยืนยันไม่ได้ — ปิด “Confirm email” ใน Supabase';
  if (/invalid login/i.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (/already (been )?registered/i.test(m)) return 'อีเมลนี้สมัครแล้ว — กด “เข้าสู่ระบบ”';
  if (/password/i.test(m) && /(least|short|weak)/i.test(m)) return 'รหัสผ่านสั้นหรืออ่อนเกินไป (อย่างน้อย 6 ตัว)';
  if (/email/i.test(m) && /invalid/i.test(m)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  if (/failed to fetch|network|load failed/i.test(m)) return 'เชื่อมต่อ Supabase ไม่ได้ — กำลังทำงานในโหมดออฟไลน์';
  return m;
};

function openAcct() {
  modal('บัญชี & ซิงก์', box => {
    const body = mk('div');
    box.appendChild(body);
    const draw = () => {
      body.replaceChildren();

      // PWA Install Prompt in Account Modal
      if (deferredPrompt) {
        const pwaBox = mk('div', 'installBanner');
        pwaBox.append(
          mk('div', null, '📲 ติดตั้ง mellowchords เป็นแอปบนเครื่อง'),
          btn('ติดตั้งทันที', installPWA, 'primary small')
        );
        body.appendChild(pwaBox);
      }

      if (sb && user) {
        body.append(
          mk('p', null, 'เข้าสู่ระบบเป็น ' + user.email),
          btn('🔄 ซิงก์ตอนนี้', async () => {
            await syncAll();
            toast('ซิงก์แล้ว ✔');
          }, 'primary'),
          ' ',
          btn('ออกจากระบบ', async () => {
            await sb.auth.signOut();
            LS.set(K.meta, { songs: {}, pls: {} });
            user = null;
            paintAcct();
            draw();
          }, 'danger')
        );
      } else if (sb) {
        const em = mk('input');
        em.type = 'email';
        em.placeholder = 'อีเมล';
        em.autocapitalize = 'none';
        em.autocomplete = 'email';
        const pw = mk('input');
        pw.type = 'password';
        pw.placeholder = 'รหัสผ่าน (อย่างน้อย 6 ตัว)';
        pw.autocomplete = 'current-password';
        const msg = mk('div', 'err');
        const b1 = btn('เข้าสู่ระบบ', () => go(false), 'primary'), b2 = btn('สมัครสมาชิก', () => go(true));
        const go = async up => {
          msg.style.color = '';
          msg.textContent = '';
          if (!/^\S+@\S+\.\S+$/.test(em.value.trim())) {
            msg.textContent = 'ใส่อีเมลให้ถูกต้อง';
            return;
          }
          if (pw.value.length < 6) {
            msg.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
            return;
          }
          b1.disabled = b2.disabled = true;
          msg.style.color = 'var(--muted)';
          msg.textContent = 'กำลังดำเนินการ…';
          try {
            const c = { email: em.value.trim(), password: pw.value };
            const { data, error } = up ? await sb.auth.signUp(c) : await sb.auth.signInWithPassword(c);
            msg.style.color = '';
            if (error) {
              msg.textContent = authMsg(error.message);
              return;
            }
            if (up && data.user && data.user.identities && !data.user.identities.length) {
              msg.textContent = 'อีเมลนี้สมัครแล้ว — กด “เข้าสู่ระบบ”';
              return;
            }
            if (!data.session) {
              msg.textContent = 'สมัครแล้ว แต่ยังเข้าไม่ได้: ยืนยันอีเมลก่อน หรือปิด Confirm email';
              return;
            }
            user = data.session.user;
            paintAcct();
            toast('เข้าสู่ระบบสำเร็จ ✔');
            draw();
          } catch (e) {
            msg.style.color = '';
            msg.textContent = authMsg(e.message);
          } finally {
            b1.disabled = b2.disabled = false;
          }
        };
        body.append(em, pw, msg, b1, ' ', b2);
      } else {
        body.appendChild(mk('div', 'err', 'เชื่อมต่อ Supabase ไม่ได้: ' + sbErr));
      }

      const d = mk('details'), u = mk('input'), k = mk('input');
      u.placeholder = 'Project URL (https://xxxx.supabase.co)';
      u.value = conf().url;
      k.placeholder = 'anon public key';
      k.value = conf().key;
      d.append(
        mk('summary', null, '⚙️ ตั้งค่า Supabase ด้วยตัวเอง'),
        u,
        k,
        btn('บันทึกการตั้งค่า', () => {
          LS.set(K.cfg, { url: u.value.trim(), key: k.value.trim() });
          initClient();
          paintAcct();
          draw();
        })
      );
      body.appendChild(d);
    };
    draw();
  });
}

const BUCKET = 'chord-images';
async function getImg(id) {
  let b = await idbGet(id).catch(() => null);
  if (!b && sb && user) {
    try {
      const { data, error } = await sb.storage.from(BUCKET).download(user.id + '/' + id + '.jpg');
      if (!error && data) {
        b = data;
        idbPut(id, b).catch(() => {});
      }
    } catch {}
  }
  return b;
}

async function pushImages(m, list) {
  m.imgs = m.imgs || {};
  for (const s of list) {
    for (const id of s.images || []) {
      if (m.imgs[id]) continue;
      const b = await idbGet(id).catch(() => null);
      if (!b) continue;
      const { error } = await sb.storage.from(BUCKET).upload(user.id + '/' + id + '.jpg', b, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      m.imgs[id] = 1;
    }
  }
}

function cloudDelImgs(ids) {
  if (!sb || !user || !ids || !ids.length) return;
  sb.storage.from(BUCKET).remove(ids.map(i => user.id + '/' + i + '.jpg')).catch(() => {});
}

function needsSync() {
  if (!sb || !user) return false;
  const m = getMeta(), f = favs(), book = loadBook(), ids = new Set(book.map(s => s.id)), P = getPls(), pids = new Set(P.map(p => p.id));
  return (
    book.some(s => !m.songs[s.id] || m.songs[s.id].h !== songH(s, f.has(s.id))) ||
    Object.keys(m.songs).some(i => !ids.has(i)) ||
    P.some(p => !m.pls[p.id] || m.pls[p.id].h !== plH(p)) ||
    Object.keys(m.pls).some(i => !pids.has(i))
  );
}

let st;
const schedSync = () => {
  clearTimeout(st);
  st = setTimeout(() => {
    if (needsSync()) syncAll();
  }, 2500);
};

async function syncAll() {
  if (!sb || !user || syncing) return;
  if (!navigator.onLine) {
    setStatus('off');
    return;
  }
  syncing = true;
  setStatus('sync');
  const m = getMeta(), f = favs();
  try {
    const { data: cs, error: e1 } = await sb.from('songs').select('*');
    if (e1) throw e1;
    const cmap = new Map(cs.map(r => [r.id, r])), book = loadBook(), ids = new Set(book.map(s => s.id));
    const gone = Object.keys(m.songs).filter(i => !ids.has(i)), del = gone.filter(i => cmap.has(i));
    if (del.length) {
      const { error } = await sb.from('songs').delete().in('id', del);
      if (error) throw error;
    }
    gone.forEach(i => delete m.songs[i]);
    const up = [], rep = new Map(), rem = new Set(), add = [];
    for (const s of book) {
      const c = cmap.get(s.id), mm = m.songs[s.id], dirty = !mm || mm.h !== songH(s, f.has(s.id));
      if (!c) {
        if (mm) {
          delete m.songs[s.id];
          f.delete(s.id);
          rem.add(s.id);
        } else up.push(s);
        continue;
      }
      const newer = mm ? c.updated_at !== mm.cu : Date.parse(c.updated_at) > (s.savedAt || 0);
      if (dirty && !(newer && !mm)) up.push(s);
      else if (newer) {
        const n = fromRow(c, s);
        rep.set(s.id, n);
        c.favorite ? f.add(n.id) : f.delete(n.id);
        m.songs[n.id] = { h: songH(n, c.favorite), cu: c.updated_at };
      }
    }
    for (const c of cs) {
      if (!ids.has(c.id) && !gone.includes(c.id)) {
        const n = fromRow(c);
        add.push(n);
        if (c.favorite) f.add(n.id);
        m.songs[n.id] = { h: songH(n, c.favorite), cu: c.updated_at };
      }
    }
    if (up.length) {
      const { data, error } = await sb.from('songs').upsert(up.map(s => toRow(s, f.has(s.id))), { onConflict: 'user_id,id' }).select('id,updated_at');
      if (error) throw error;
      for (const r of data) {
        const s = up.find(x => x.id === r.id);
        m.songs[r.id] = { h: songH(s, f.has(r.id)), cu: r.updated_at };
      }
    }
    await pushImages(m, loadBook());
    if (rep.size || rem.size || add.length) {
      const cur = loadBook().filter(s => !rem.has(s.id)).map(s => rep.get(s.id) || s), have = new Set(cur.map(s => s.id));
      add.forEach(n => have.has(n.id) || cur.push(n));
      saveBook(cur);
    }
    setFavs(f);

    const { data: cp, error: e2 } = await sb.from('playlists').select('*,playlist_items(song_id,position)');
    if (e2) throw e2;
    const pm = new Map(cp.map(r => [r.id, r])), P = getPls(), pids = new Set(P.map(p => p.id));
    const pgone = Object.keys(m.pls).filter(i => !pids.has(i)), pdel = pgone.filter(i => pm.has(i));
    if (pdel.length) {
      const { error } = await sb.from('playlists').delete().in('id', pdel);
      if (error) throw error;
    }
    pgone.forEach(i => delete m.pls[i]);
    const pup = [], prep = new Map(), prem = new Set(), padd = [];
    for (const p of P) {
      const c = pm.get(p.id), mm = m.pls[p.id], dirty = !mm || mm.h !== plH(p);
      if (!c) {
        if (mm) {
          delete m.pls[p.id];
          prem.add(p.id);
        } else pup.push(p);
        continue;
      }
      const newer = mm ? c.updated_at !== mm.cu : Date.parse(c.updated_at) > (p.updatedAt || 0);
      if (dirty && !(newer && !mm)) pup.push(p);
      else if (newer) {
        const n = fromP(c);
        prep.set(p.id, n);
        m.pls[n.id] = { h: plH(n), cu: c.updated_at };
      }
    }
    for (const c of cp) {
      if (!pids.has(c.id) && !pgone.includes(c.id)) {
        const n = fromP(c);
        padd.push(n);
        m.pls[n.id] = { h: plH(n), cu: c.updated_at };
      }
    }
    for (const p of pup) {
      const { data, error } = await sb.from('playlists').upsert({ id: p.id, user_id: user.id, name: p.name, is_shared: !(!p.shared), share_token: p.token || null }, { onConflict: 'id' }).select('id,updated_at');
      if (error) throw error;
      const { error: e3 } = await sb.from('playlist_items').delete().eq('playlist_id', p.id);
      if (e3) throw e3;
      if (p.songIds.length) {
        const { error: e4 } = await sb.from('playlist_items').insert(p.songIds.map((sid, i) => ({ playlist_id: p.id, song_id: sid, position: i })));
        if (e4) throw e4;
      }
      m.pls[p.id] = { h: plH(p), cu: data[0].updated_at };
    }
    if (prep.size || prem.size || padd.length) {
      const cur = getPls().filter(p => !prem.has(p.id)).map(p => prep.get(p.id) || p), have = new Set(cur.map(p => p.id));
      padd.forEach(n => have.has(n.id) || cur.push(n));
      setPls(cur);
    }
    setStatus('ok');
  } catch (e) {
    console.error(e);
    setStatus('err');
    toast('ซิงก์ไม่สำเร็จ: ' + (e.message || e), true);
  } finally {
    LS.set(K.meta, m);
    syncing = false;
    renderPlaylists();
    renderSongbook();
    if (!$('#plView').hidden) renderPlView();
    if (current) paintFav();
  }
}

/* ==============================================================================
 * 13) Playlist & การแชร์เซ็ตเพลง (Setlist & Sharing)
 * ============================================================================== */
function createPlaylist(name, songIds = []) {
  const p = { id: crypto.randomUUID(), name, songIds, shared: false, token: null, updatedAt: Date.now() };
  setPls([...getPls(), p]);
  renderPlaylists();
  schedSync();
  return p;
}

function mutPl(id, fn) {
  const P = getPls(), p = P.find(x => x.id === id);
  if (!p) return;
  fn(p);
  p.updatedAt = Date.now();
  setPls(P);
  renderPlaylists();
  schedSync();
  return p;
}

$('#plNew').onclick = () => {
  const n = (prompt('ชื่อ Playlist (เช่น เซ็ตคืนวันศุกร์)') || '').trim();
  if (n) createPlaylist(n);
};

function renderPlaylists() {
  const P = getPls(), box = $('#plList');
  $('#plCount').textContent = P.length;
  box.replaceChildren();
  if (!P.length) box.appendChild(mk('div', 'empty', 'ยังไม่มี Playlist'));
  for (const p of P) {
    const row = mk('div', 'item'), b = mk('button', 'open'), t = mk('div', 't', p.name);
    t.appendChild(mk('span', 'badge dim', p.songIds.length + ' เพลง'));
    if (p.shared) t.appendChild(mk('span', 'badge', 'แชร์'));
    b.appendChild(t);
    b.onclick = () => openPlaylist(p.id);
    row.appendChild(b);
    box.appendChild(row);
  }
}

function openPlaylist(id) {
  curPl = { id };
  show('playlist');
  renderPlView();
}

function renderPlView() {
  const box = $('#plSongs'), bar = $('#plBar'), lk = $('#plLink');
  [box, bar, lk].forEach(e => e.replaceChildren());
  lk.className = '';
  if (!curPl) return;
  let songs, p = null;
  if (curPl.shared) {
    $('#plTitle').textContent = '🎼 ' + curPl.data.name + ' (แชร์มา)';
    songs = curPl.data.songs.map(s => ({
      id: 'sh-' + curPl.token.slice(0, 6) + '-' + s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      text: s.text,
      shift: s.shift || 0
    }));
    bar.append(btn('💾 บันทึกทั้ง Playlist เข้าคลังของฉัน', importShared, 'primary'));
  } else {
    p = getPls().find(x => x.id === curPl.id);
    if (!p) {
      show('home', false);
      return;
    }
    $('#plTitle').textContent = '🎼 ' + p.name;
    const book = loadBook();
    songs = p.songIds.map(id => book.find(s => s.id === id)).filter(Boolean);
    bar.append(
      btn('✏️ เปลี่ยนชื่อ', () => {
        const n = (prompt('ชื่อใหม่', p.name) || '').trim();
        if (n) {
          mutPl(p.id, x => { x.name = n; });
          renderPlView();
        }
      }),
      btn(p.shared ? '🔗 แชร์อยู่' : '🔗 เปิดแชร์', () => sharePlaylist(p.id), p.shared ? '' : 'primary'),
      btn('🗑 ลบ', () => delPlaylist(p.id), 'danger')
    );
    if (p.shared && p.token) {
      const link = location.origin + location.pathname + '#/p/' + p.token, inp = mk('input');
      inp.readOnly = true;
      inp.value = link;
      inp.style.flex = '1';
      lk.className = 'plLink';
      lk.append(
        inp,
        btn('📤 ส่งลิงก์', () => shareLink(p, link), 'primary'),
        btn('🚫 เลิกแชร์', () => {
          mutPl(p.id, x => { x.shared = false; });
          renderPlView();
          syncAll();
        })
      );
    }
  }
  if (!songs.length) box.appendChild(mk('div', 'empty', 'ยังไม่มีเพลง — เปิดเพลงแล้วกด “➕ Playlist”'));
  songs.forEach(s => {
    const row = mk('div', 'item'), o = mk('button', 'open'), t = mk('div', 't', s.title);
    if (s.key) t.appendChild(mk('span', 'badge', s.key));
    o.append(t, mk('div', 'a', s.artist || '—'));
    o.onclick = () => openSong(s, s.shift || 0);
    row.appendChild(o);
    if (p) {
      const mv = d => {
        mutPl(p.id, x => {
          const i = x.songIds.indexOf(s.id), j = i + d;
          if (j >= 0 && j < x.songIds.length) [x.songIds[i], x.songIds[j]] = [x.songIds[j], x.songIds[i]];
        });
        renderPlView();
      };
      row.append(
        btn('↑', () => mv(-1), 'del'),
        btn('↓', () => mv(1), 'del'),
        btn('✕', () => {
          mutPl(p.id, x => { x.songIds = x.songIds.filter(i => i !== s.id); });
          renderPlView();
        }, 'del danger')
      );
    }
    box.appendChild(row);
  });
}

function delPlaylist(id) {
  if (!confirm('ลบ Playlist นี้? (เพลงในคลังไม่ถูกลบ)')) return;
  setPls(getPls().filter(p => p.id !== id));
  renderPlaylists();
  schedSync();
  goBack();
}

$('#plBtn').onclick = () => {
  const song = current.song;
  if (!loadBook().some(s => s.id === song.id)) $('#saveBtn').click();
  modal('เพิ่มเข้า Playlist', box => {
    const body = mk('div');
    box.appendChild(body);
    const draw = () => {
      body.replaceChildren();
      for (const p of getPls()) {
        const inn = p.songIds.includes(song.id);
        const b = btn((inn ? '✅ ' : '⬜ ') + p.name, () => {
          mutPl(p.id, x => {
            x.songIds = inn ? x.songIds.filter(i => i !== song.id) : [...x.songIds, song.id];
          });
          draw();
        });
        b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0';
        body.appendChild(b);
      }
      body.appendChild(
        btn('＋ สร้าง Playlist ใหม่', () => {
          const n = (prompt('ชื่อ Playlist') || '').trim();
          if (n) {
            createPlaylist(n, [song.id]);
            draw();
          }
        }, 'primary')
      );
    };
    draw();
  });
};

async function sharePlaylist(id) {
  if (!sb || !user) {
    toast(sb ? 'ต้องเข้าสู่ระบบก่อนจึงจะแชร์ได้' : 'ยังไม่ได้เชื่อมต่อ Supabase', true);
    openAcct();
    return;
  }
  mutPl(id, p => {
    p.shared = true;
    p.token = p.token || (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  });
  renderPlView();
  toast('กำลังซิงก์…');
  await syncAll();
  toast('พร้อมแชร์ ✔ กด “ส่งลิงก์”');
  renderPlView();
}

async function shareLink(p, link) {
  if (navigator.share) {
    try {
      await navigator.share({ title: p.name, url: link });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    toast('คัดลอกลิงก์แล้ว ✔');
  } catch {
    prompt('คัดลอกลิงก์นี้', link);
  }
}

async function openShared(token) {
  if (!sb) {
    toast('ลิงก์นี้ต้องใช้แอปที่เชื่อมต่อ Supabase ได้', true);
    return;
  }
  const { data, error } = await sb.rpc('get_shared_playlist', { p_token: token });
  if (error || !data) {
    toast('ไม่พบ Playlist นี้ หรือเจ้าของปิดการแชร์แล้ว', true);
    return;
  }
  curPl = { shared: true, data, token };
  show('playlist');
  renderPlView();
}

function importShared() {
  const { data, token } = curPl, book = loadBook(), have = new Set(book.map(s => s.id)), ids = [];
  for (const s of data.songs) {
    const id = 'sh-' + token.slice(0, 6) + '-' + s.id;
    ids.push(id);
    if (!have.has(id)) {
      book.push({
        id,
        title: s.title,
        artist: s.artist,
        key: s.key,
        text: s.text,
        images: [],
        src: '',
        shift: s.shift || 0,
        savedAt: Date.now()
      });
    }
  }
  saveBook(book);
  const p = createPlaylist(data.name, ids);
  renderSongbook();
  toast('บันทึกทั้ง Playlist เข้าคลังแล้ว ✔');
  if (location.hash.startsWith('#/p/')) history.replaceState(history.state, '', location.pathname);
  curPl = { id: p.id };
  renderPlView();
}

function route() {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  if (m) openShared(m[1]);
}

/* ==============================================================================
 * 14) PWA Controller & Service Worker (รองรับออฟไลน์และติดตั้ง)
 * ============================================================================== */
let deferredPrompt = null;

function registerPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              toast('💡 มีการอัปเดตรุ่นใหม่ — รีเฟรชเพื่อใช้งานฟีเจอร์ล่าสุด');
            }
          });
        });
      }).catch(err => console.warn('[PWA] ServiceWorker registration failed:', err));
    });
  }

  // Capture Install Prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = $('#pwaInstallHeaderBtn');
    if (btn) btn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = $('#pwaInstallHeaderBtn');
    if (btn) btn.hidden = true;
    toast('🎉 ติดตั้ง mellowchords เป็นแอปเรียบร้อยแล้ว!');
  });
}

async function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      const btn = $('#pwaInstallHeaderBtn');
      if (btn) btn.hidden = true;
    }
    deferredPrompt = null;
  } else {
    // Helpful guide for iOS Safari
    modal('📲 วิธีติดตั้งบน iPhone / iPad', box => {
      box.append(
        mk('p', null, 'สำหรับ iOS (Safari):'),
        mk('ol', null, ''),
        btn('เข้าใจแล้ว', () => box.closest('.modal').remove(), 'primary')
      );
      const ol = box.querySelector('ol');
      const step1 = mk('li', null, 'แตะปุ่มแชร์ (Share ⎙) ด้านล่างของจอ');
      const step2 = mk('li', null, 'เลื่อนลงมาแล้วเลือก “เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)');
      const step3 = mk('li', null, 'แตะ “เพิ่ม” (Add) มุมขวาบน จะมีไอคอน mellowchords ให้เปิดใช้แบบแอปเต็มจอ!');
      ol.append(step1, step2, step3);
    });
  }
}

const pwaBtn = $('#pwaInstallHeaderBtn');
if (pwaBtn) pwaBtn.onclick = installPWA;

/* ==============================================================================
 * 15) การเริ่มต้นระบบ (Initialization)
 * ============================================================================== */
const setHH = () => document.documentElement.style.setProperty('--hh', $('#hdr').offsetHeight + 'px');
addEventListener('resize', setHH);
setHH();

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// Online/Offline listener
window.addEventListener('online', () => {
  toast('⚡ กลับมาออนไลน์แล้ว — กำลังตรวจสอบการซิงก์');
  syncAll();
});
window.addEventListener('offline', () => {
  toast('⚡ คุณกำลังอยู่ในโหมดออฟไลน์ (ใช้งานคลังเพลงในเครื่องได้ 100%)');
  setStatus('off');
});

initClient();
paintAcct();
renderSites();
renderPlaylists();
renderSongbook();
route();
registerPWA();

addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncAll();
});
setInterval(() => {
  if (document.visibilityState === 'visible') syncAll();
}, 90000);
