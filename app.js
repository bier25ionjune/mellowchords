'use strict';

/**
 * ==============================================================================
 * mellowchords - คลังคอร์ดกลางคืน (Night Busker Chordbook)
 * Real Web Chord Extraction, Key-Consistent Alignment, Guitar Audio & Metronome
 * ==============================================================================
 */

/* ==============================================================================
 * 1) การตั้งค่า (Configuration) & คลังเพลงคอร์ดจริงมาตรฐานในแอป
 * ============================================================================== */
const CFG = {
  url: 'https://otbfzxypqyzobglbdrxp.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90YmZ6eHlwcXl6b2JnbGJkcnhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NzA2MTksImV4cCI6MjEwODU0NjYxOX0.GouGscQsPmLRrHZwSz9W71IY-sgDo_nmOZs55Eciqf4'
};

const POPULAR_SONGS = [];
const MOCK_DB = [];

function hash(s) {
  if (!s || typeof s !== 'string') return '0';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return '' + h;
}

/* ==============================================================================
 * 2) ทฤษฎีดนตรี, การวิเคราะห์คีย์จริงจากคอร์ดในเนื้อเพลง, เสียงดีดคอร์ดกีตาร์ & Capo
 * ============================================================================== */
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const BASE   = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FLAT_KEYS = [5, 10, 3, 8, 1]; // F, Bb, Eb, Ab, Db

const CHORD_RE = /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|\d+|[#b+\-°()])*(?:\/[A-G][#b]?)?$/;
const isChord = t => CHORD_RE.test(t);
const noteIndex = n => {
  if (!n || typeof n !== 'string') return 0;
  const ch0 = n[0] ? n[0].toUpperCase() : '';
  const root = BASE[ch0];
  if (root === undefined) return 0;
  return (root + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;
};

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
  const n = parseInt(s, 10);
  if (isNaN(n)) return 0;
  let v = ((n % 12) + 12) % 12;
  return v > 6 ? v - 12 : v;
};

function calcKeyShift(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  const m1 = String(fromKey).match(/([A-G][#b]?)/i);
  const m2 = String(toKey).match(/([A-G][#b]?)/i);
  if (!m1 || !m2) return 0;
  const r1 = noteIndex(m1[1].toUpperCase());
  const r2 = noteIndex(m2[1].toUpperCase());
  if (isNaN(r1) || isNaN(r2)) return 0;
  return normShift(r2 - r1);
}

const fmtShift = s => (s === 0 ? 'คีย์เดิม' : (s > 0 ? '+' : '') + s + ' คีย์');

// วิเคราะห์คีย์เพลงจริงจากชุดคอร์ดที่ปรากฏในเนื้อเพลงนั้นโดยตรง (เพื่อให้คีย์และคอร์ดบนเนื้อเพลงตรงกัน 100%)
function detectTrueKeyFromChords(chordList, explicitText = '') {
  const explicitMatch = String(explicitText || '').match(/(?:key|คีย์)\s*[:=]?\s*([A-G][#b]?m?)\b/i);
  if (explicitMatch && isChord(explicitMatch[1])) {
    return explicitMatch[1];
  }

  const valid = (chordList || [])
    .map(c => c.replace(/\/.*$/, '').trim())
    .filter(isChord);
  if (!valid.length) return '';

  const parsed = valid.map(c => {
    const m = c.match(/^([A-G][#b]?)(m(?!aj))?/);
    return m ? { raw: m[1] + (m[2] || ''), root: noteIndex(m[1]), isMinor: !!m[2] } : null;
  }).filter(Boolean);

  if (!parsed.length) return valid[0];

  // Major scale diatonic triads offsets: I(0,Maj), ii(2,min), iii(4,min), IV(5,Maj), V(7,Maj), vi(9,min)
  const DIATONIC = [
    { offset: 0, minor: false, weight: 3.0 },
    { offset: 2, minor: true,  weight: 1.5 },
    { offset: 4, minor: true,  weight: 1.5 },
    { offset: 5, minor: false, weight: 2.2 },
    { offset: 7, minor: false, weight: 2.5 },
    { offset: 9, minor: true,  weight: 2.2 }
  ];

  let bestKey = parsed[0].raw;
  let bestScore = -1;

  for (let tonic = 0; tonic < 12; tonic++) {
    let score = 0;
    for (const ch of parsed) {
      const match = DIATONIC.find(d => (tonic + d.offset) % 12 === ch.root && d.minor === ch.isMinor);
      if (match) score += match.weight;
    }
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    if (first.root === tonic && !first.isMinor) score += 4.5;
    if (last.root === tonic && !last.isMinor) score += 2.5;

    const relMinor = (tonic + 9) % 12;
    let minorScore = score;
    if (first.root === relMinor && first.isMinor) minorScore += 4.0;
    if (last.root === relMinor && last.isMinor) minorScore += 2.0;

    const useFlats = FLAT_KEYS.includes(tonic);
    const scaleNames = useFlats ? FLATS : SHARPS;

    if (score >= bestScore) {
      bestScore = score;
      bestKey = scaleNames[tonic];
    }
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestKey = scaleNames[relMinor] + 'm';
    }
  }

  return bestKey;
}

function getCapoRecommendation(origKey, targetKey) {
  if (!origKey || !targetKey) return '';
  const m = targetKey.match(/^([A-G][#b]?)(m(?!aj))?/);
  if (!m) return '';
  const targetIdx = noteIndex(m[1]);
  const isMinor = !!m[2];
  const easyShapes = isMinor
    ? [{ name: 'Am', idx: 9 }, { name: 'Em', idx: 4 }, { name: 'Dm', idx: 2 }]
    : [{ name: 'C', idx: 0 }, { name: 'G', idx: 7 }, { name: 'D', idx: 2 }, { name: 'A', idx: 9 }, { name: 'E', idx: 4 }];

  let best = null;
  for (const sh of easyShapes) {
    const capo = (targetIdx - sh.idx + 12) % 12;
    if (capo > 0 && capo <= 7) {
      if (!best || capo < best.capo) best = { capo, shape: sh.name };
    }
  }
  return best ? `🎸 Capo เฟรต ${best.capo} (จับทรง ${best.shape})` : '';
}

const GUITAR_VOICINGS = {
  'C': [-1, 3, 2, 0, 1, 0], 'Cm': [-1, 3, 5, 5, 4, 3], 'C7': [-1, 3, 2, 3, 1, 0], 'Cmaj7': [-1, 3, 2, 0, 0, 0],
  'C#': [-1, 4, 6, 6, 6, 4], 'Db': [-1, 4, 6, 6, 6, 4], 'C#m': [-1, 4, 6, 6, 5, 4], 'C#m7': [-1, 4, 6, 4, 5, 4],
  'D': [-1, -1, 0, 2, 3, 2], 'Dm': [-1, -1, 0, 2, 3, 1], 'D7': [-1, -1, 0, 2, 1, 2], 'Dmaj7': [-1, -1, 0, 2, 2, 2], 'Dm7': [-1, -1, 0, 2, 1, 1], 'Dsus4': [-1, -1, 0, 2, 3, 3],
  'D#': [-1, 6, 8, 8, 8, 6], 'Eb': [-1, 6, 8, 8, 8, 6], 'D#m': [-1, 6, 8, 8, 7, 6], 'Ebm': [-1, 6, 8, 8, 7, 6],
  'E': [0, 2, 2, 1, 0, 0], 'Em': [0, 2, 2, 0, 0, 0], 'E7': [0, 2, 0, 1, 0, 0], 'Emaj7': [0, 2, 1, 1, 0, 0], 'Em7': [0, 2, 0, 0, 0, 0], 'Esus4': [0, 2, 2, 2, 0, 0],
  'F': [1, 3, 3, 2, 1, 1], 'Fm': [1, 3, 3, 1, 1, 1], 'F7': [1, 3, 1, 2, 1, 1], 'Fmaj7': [-1, -1, 3, 2, 1, 0], 'Fm7': [1, 3, 1, 1, 1, 1],
  'F#': [2, 4, 4, 3, 2, 2], 'Gb': [2, 4, 4, 3, 2, 2], 'F#m': [2, 4, 4, 2, 2, 2], 'F#m7': [2, 4, 2, 2, 2, 2], 'F#7': [2, 4, 2, 3, 2, 2],
  'G': [3, 2, 0, 0, 0, 3], 'Gm': [3, 5, 5, 3, 3, 3], 'G7': [3, 2, 0, 0, 0, 1], 'Gmaj7': [3, 2, 0, 0, 0, 2], 'Gm7': [3, 5, 3, 3, 3, 3], 'Gsus4': [3, 3, 0, 0, 1, 3],
  'G#': [4, 6, 6, 5, 4, 4], 'Ab': [4, 6, 6, 5, 4, 4], 'G#m': [4, 6, 6, 4, 4, 4], 'Abm': [4, 6, 6, 4, 4, 4],
  'A': [-1, 0, 2, 2, 2, 0], 'Am': [-1, 0, 2, 2, 1, 0], 'A7': [-1, 0, 2, 0, 2, 0], 'Amaj7': [-1, 0, 2, 1, 2, 0], 'Am7': [-1, 0, 2, 0, 1, 0], 'Asus2': [-1, 0, 2, 2, 0, 0], 'Asus4': [-1, 0, 2, 2, 3, 0],
  'A#': [-1, 1, 3, 3, 3, 1], 'Bb': [-1, 1, 3, 3, 3, 1], 'A#m': [-1, 1, 3, 3, 2, 1], 'Bbm': [-1, 1, 3, 3, 2, 1], 'Bb7': [-1, 1, 3, 1, 3, 1],
  'B': [-1, 2, 4, 4, 4, 2], 'Bm': [-1, 2, 4, 4, 3, 2], 'B7': [-1, 2, 1, 2, 0, 2], 'Bm7': [-1, 2, 4, 2, 3, 2]
};

// Web Audio API Acoustic Guitar Chord Strum Synthesizer
let audioCtx = null;
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64]; // E2, A2, D3, G3, B3, E4

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function strumGuitarChord(chordName) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const baseName = chordName.replace(/\/.*$/, '');
  let frets = GUITAR_VOICINGS[baseName] || GUITAR_VOICINGS[baseName.replace(/add9|9|11|13/g, '')];

  // Fallback synthetic triad if uncommon chord
  if (!frets) {
    const m = baseName.match(/^([A-G][#b]?)(m(?!aj))?/);
    if (!m) return;
    const rootMidi = 48 + noteIndex(m[1]);
    const third = m[2] ? 3 : 4;
    playMidiNotes(ctx, [rootMidi - 12, rootMidi, rootMidi + third, rootMidi + 7]);
    return;
  }

  const midiNotes = [];
  for (let s = 0; s < 6; s++) {
    if (frets[s] >= 0) {
      midiNotes.push(OPEN_STRING_MIDI[s] + frets[s]);
    }
  }
  playMidiNotes(ctx, midiNotes);
}

function playMidiNotes(ctx, midiNotes) {
  const now = ctx.currentTime;
  midiNotes.forEach((midi, idx) => {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const start = now + idx * 0.035; // Guitar strum stagger across strings

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc2.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, start);
    osc2.frequency.setValueAtTime(freq * 1.002, start);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, start);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, start + 1.4);

    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + 1.8);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc2.start(start);
    osc.stop(start + 1.85);
    osc2.stop(start + 1.85);
  });
}

function buildChordDiagramSVG(chordName) {
  const baseName = chordName.replace(/\/.*$/, '');
  const frets = GUITAR_VOICINGS[baseName] || GUITAR_VOICINGS[baseName.replace(/add9|9|11|13/g, '')];
  if (!frets) return null;

  const activeFrets = frets.filter(f => f > 0);
  const minFret = activeFrets.length ? Math.min(...activeFrets) : 1;
  const maxFret = activeFrets.length ? Math.max(...activeFrets) : 4;
  const startFret = maxFret <= 4 ? 1 : minFret;

  let svg = `<svg viewBox="0 0 180 210" xmlns="http://www.w3.org/2000/svg">`;
  if (startFret === 1) {
    svg += `<rect x="30" y="34" width="120" height="5" fill="#f4f4f6" rx="2"/>`;
  } else {
    svg += `<text x="20" y="55" fill="#f59e0b" font-size="13" font-weight="bold" text-anchor="end">${startFret}fr</text>`;
  }

  for (let f = 0; f <= 5; f++) {
    const y = 38 + f * 30;
    svg += `<line x1="30" y1="${y}" x2="150" y2="${y}" stroke="#3a3a46" stroke-width="1.5"/>`;
  }

  for (let s = 0; s < 6; s++) {
    const x = 30 + s * 24;
    svg += `<line x1="${x}" y1="38" x2="${x}" y2="188" stroke="#71717a" stroke-width="${s < 3 ? 2 : 1.3}"/>`;
    const fret = frets[s];
    if (fret === -1) {
      svg += `<text x="${x}" y="26" fill="#ef4444" font-size="14" font-weight="bold" text-anchor="middle">✕</text>`;
    } else if (fret === 0) {
      svg += `<circle cx="${x}" cy="21" r="5" fill="none" stroke="#22c55e" stroke-width="2"/>`;
    } else {
      const relFret = fret - startFret + 1;
      const cy = 38 + (relFret - 0.5) * 30;
      svg += `<circle cx="${x}" cy="${cy}" r="9" fill="#f59e0b"/>`;
      svg += `<text x="${x}" y="${cy + 4}" fill="#09090b" font-size="11" font-weight="bold" text-anchor="middle">${fret}</text>`;
    }
  }
  svg += `</svg>`;
  return svg;
}

function showChordPopup(chordName) {
  strumGuitarChord(chordName);
  modal(`🎸 คอร์ด ${chordName}`, (box) => {
    const wrap = mk('div', 'chordDiagWrap');
    const svg = buildChordDiagramSVG(chordName);
    if (svg) {
      wrap.innerHTML = svg;
    } else {
      wrap.appendChild(mk('p', 'muted', `คอร์ด ${chordName} (คอร์ดประยุกต์ / Slash Chord)`));
    }
    const playBtn = btn(`🔊 ฟังเสียงดีดคอร์ด ${chordName}`, () => strumGuitarChord(chordName), 'primary small');
    playBtn.style.marginTop = '8px';
    const hint = mk('p', 'muted small', 'สาย 6 (ซ้าย) → สาย 1 (ขวา)');
    hint.style.textAlign = 'center';
    wrap.append(playBtn, hint);
    box.appendChild(wrap);
  });
}

/* ==============================================================================
 * 3) Smart Parser & Section Detector
 * ============================================================================== */
const THAI_MARK = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
const safeCut = (i, s) => {
  while (i < s.length && THAI_MARK.test(s[i])) i++;
  return i;
};

function isChordLine(l) {
  if (!l.trim()) return false;
  const cleaned = l.replace(/^\s*(intro|instru|instrument|interlude|solo|outro|outtro|ending)\s*[:\-]?\s*/i, '')
                   .replace(/\(.*?\)/g, '')
                   .replace(/[|/\\\-]+/g, ' ')
                   .trim();
  if (!cleaned) return false;
  const t = cleaned.split(/\s+/);
  return t.every(x => isChord(x) || x === '*' || x === '%') && t.some(isChord);
}

function getSectionType(line) {
  const clean = line.replace(/[\[\]():]/g, '').trim().toLowerCase();
  if (/^(intro|อินโทร)/i.test(clean)) return 'intro';
  if (/^(chorus|hook|ฮุก|ท่อนฮุก)/i.test(clean)) return 'chorus';
  if (/^(verse|ท่อน|เวิร์ส|\d+)/i.test(clean)) return 'verse';
  if (/^(bridge|ท่อนแยก|ส่ง)/i.test(clean)) return 'bridge';
  if (/^(solo|instru|instrument|interlude|โซโล่)/i.test(clean)) return 'solo';
  if (/^(outro|outtro|out-tro|ending|จบ|ท่อนจบ)/i.test(clean)) return 'outro';
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

    const introInline = line.match(/^\s*(intro|instru|instrument|interlude|solo|outro|outtro|ending)\s*[:\-]\s*(.+)$/i);
    if (introInline && isChordLine(introInline[2])) {
      const secName = introInline[1].charAt(0).toUpperCase() + introInline[1].slice(1).toLowerCase();
      out.push({ type: 'section', secType: getSectionType(secName), text: `[${secName}]` });
      const chordPart = introInline[2].replace(/[|/]+/g, '  ');
      const toks = [...chordPart.matchAll(/\S+/g)].map(m => ({ chord: isChord(m[0]) ? m[0] : '', text: isChord(m[0]) ? '' : m[0] + ' ' }));
      out.push({ type: 'line', chordOnly: toks.every(x => !x.text.trim()), segs: toks });
      continue;
    }

    if (isChordLine(line)) {
      const toks = [...line.matchAll(/\S+/g)].map(m => ({ t: m[0], i: m.index }));
      const next = L[i + 1];
      const isTabLine = next && /^\s*[1-6eBGDAE]\s*[|\-]/.test(next);
      if (next !== undefined && next.trim() && !isChordLine(next) && !isTabLine) {
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

    const isSection = line.length < 50 && (
      /^\s*\[[^\]]+\]\s*$/.test(line) ||
      /^\s*(intro|verse|chorus|hook|bridge|solo|instru|instrument|outro|outtro|ending|interlude|pre-?chorus|ท่อน|อินโทร|ฮุก|ท่อนฮุก|โซโล่|ท่อนจบ)\s*[:\-]?\s*$/i.test(line)
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

// ดึงรายชื่อคอร์ดทั้งหมดที่ปรากฏในเนื้อเพลงจริงๆ
function extractUniqueChordsFromSheet(text) {
  const list = [];
  for (const l of parseSong(text)) {
    if (l.segs) {
      for (const s of l.segs) {
        if (isChord(s.chord) && !list.includes(s.chord)) {
          list.push(s.chord);
        }
      }
    }
  }
  return list;
}

function detectKey(text, titleHint = '') {
  const allChords = [];
  for (const l of parseSong(text)) {
    if (l.segs) {
      for (const s of l.segs) {
        if (isChord(s.chord)) allChords.push(s.chord);
      }
    }
  }
  return detectTrueKeyFromChords(allChords, titleHint);
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

    const hasChord = item.segs.some(s => s.chord);
    const row = mk('div', 'line' + (item.chordOnly ? ' chordonly' : '') + (hasChord ? ' hasChords' : ' noChords'));
    for (const s of item.segs) {
      const seg = mk('span', 'seg');
      if (hasChord) {
        const trChord = s.chord ? transposeChord(s.chord, shift, flat) : '';
        const chSpan = mk('span', 'ch', trChord);
        if (trChord && isChord(trChord)) {
          chSpan.title = `แตะเพื่อฟังเสียงและดูตารางคอร์ด ${trChord}`;
          chSpan.onclick = (e) => {
            e.stopPropagation();
            showChordPopup(trChord);
          };
        }
        seg.appendChild(chSpan);
      }
      seg.appendChild(mk('span', 'ly', s.text));
      row.appendChild(seg);
    }
    box.appendChild(row);
  }
}

/* ==============================================================================
 * 4) Smart Formatter
 * ============================================================================== */
function smartFormatChordSheet(rawText, convertToBracket = false) {
  if (!rawText) return '';
  const lines = rawText.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  const formatted = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimEnd();

    const secMatch = line.match(/^\s*[\[(]?\s*(intro|verse\s*\d*|chorus|hook|bridge|solo|instru|instrument|outro|outtro|ending|pre-?chorus|อินโทร|ฮุก|ท่อนฮุก|โซโล่|ท่อนแยก|ท่อนจบ)\s*[:\])]?\s*$/i);
    if (secMatch) {
      let name = secMatch[1].trim();
      const lower = name.toLowerCase();
      if (/intro|อินโทร/i.test(lower)) name = 'Intro';
      else if (/chorus|hook|ฮุก|ท่อนฮุก/i.test(lower)) name = 'Chorus';
      else if (/solo|instru|instrument|โซโล่/i.test(lower)) name = 'Solo';
      else if (/bridge|ท่อนแยก/i.test(lower)) name = 'Bridge';
      else if (/outro|outtro|ending|ท่อนจบ/i.test(lower)) name = 'Outro';
      else if (/verse/i.test(lower)) name = name.charAt(0).toUpperCase() + name.slice(1);

      formatted.push(`\n[${name}]`);
      continue;
    }

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
      i++;
      continue;
    }

    formatted.push(line);
  }

  return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ==============================================================================
 * 5) Real Web Chord Search & Key-Consistent Extractor
 *    (ดึงเฉพาะตารางคอร์ดจริงจากเว็บ และซิงก์คีย์กับคอร์ดในเนื้อเพลงให้ตรงกัน 100%)
 * ============================================================================== */
function cleanTitle(t) {
  return (t || '')
    .replace(/\s*\(Key\s*[A-G][#b]?m?\)/gi, '')
    .replace(/\s*\(คอร์ด\s*ง่ายๆ?\).*$/i, '')
    .replace(/\s*-\s*เนื้อเพลง.*$/i, '')
    .replace(/^คอร์ด(เพลง)?\s*/i, '')
    .replace(/คอร์ด\s*$/i, '')
    .replace(/\s*เวอร์ชั่น\s*\d+.*$/i, '')
    .trim();
}

function parseTitleAndArtist(rawTitle, snippet = '', url = '') {
  let title = '', artist = '', key = '';
  let str = String(rawTitle || '').replace(/[\r\n]+/g, ' ').trim();

  // Extract key
  const km = str.match(/\(\s*Key\s*([A-G][#b]?m?)\s*\)/i) || str.match(/\bKey\s*([A-G][#b]?m?)\b/i);
  if (km) key = km[1];

  // 1. ตรวจหาชื่อศิลปินจาก snippet ก่อน (เช่น "- ศิลปิน Greasy Cafe" บน Chordtabs)
  if (snippet) {
    const artSnippet = String(snippet).match(/(?:ศิลปิน|artist)\s*[:：\-]?\s*([^\n,;|.]+?)(?=\s+(?:อัลบั้ม|album|ค่าย|สังกัด|คำร้อง|ทำนอง|เรียบเรียง|\||$|\n))/i);
    if (artSnippet) {
      artist = artSnippet[1].replace(/\*\*/g, '').replace(/\s*[-–—].*$/, '').trim();
    }
  }

  let cleaned = str
    .replace(/\(\s*Key\s*[A-G][#b]?m?\s*\)/gi, '')
    .replace(/\|\s*(Chordtabs(?:\.in\.th)?|MusicATM|คอร์ดกีตาร์|คอร์ดเพลง|sanook|guitarthai|chordzaa|meemodel).*$/i, '')
    .trim();

  // จัดการกรณี Title มี pipe เช่น "สิ่งเหล่านี้คอร์ด | คอร์ด สิ่งเหล่านี้ Greasy Cafe"
  if (cleaned.includes('|')) {
    const parts = cleaned.split('|').map(p => p.trim());
    cleaned = parts[0];
    if (!artist && parts.length > 1) {
      const p2 = parts[1].replace(/^(คอร์ด|เนื้อเพลง|คอร์ดเพลง|เพลง)\s*/i, '').trim();
      const p2Art = p2.match(/(?:ศิลปิน|artist)\s*[:：\-]?\s*([^\n,;|.]+)/i) ||
                    p2.match(/[-–—]\s*(.+)$/);
      if (p2Art) {
        artist = p2Art[1].trim();
      } else {
        const tPrefix = cleaned.replace(/\s*คอร์ด.*$/i, '').trim();
        if (tPrefix && p2.startsWith(tPrefix)) {
          artist = p2.slice(tPrefix.length).trim();
        }
      }
    }
  }

  // Common prefix clean
  cleaned = cleaned
    .replace(/^(เนื้อเพลง\s*และ\s*คอร์ด|เนื้อเพลง\s*คอร์ด|คอร์ดเพลง|คอร์ดกีตาร์|คอร์ด)\s*/i, '')
    .replace(/\s*คอร์ด(กีตาร์|เพลง)?\s*$/i, '')
    .replace(/\s*\(คอร์ด\s*ง่ายๆ?\).*$/i, '')
    .trim();

  // Split on hyphen or slash or 'โดย'
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(/\s+-\s+/);
    title = parts[0].trim();
    if (!artist) {
      artist = parts.slice(1).join(' - ')
        .replace(/\s*[-–—]\s*(คอร์ด|เนื้อเพลง|แทปกีตาร์|musicatm|chordtabs).*$/i, '')
        .replace(/\s*(คอร์ด|เนื้อเพลง|แทปกีตาร์|musicatm|chordtabs).*$/i, '')
        .replace(/\s*[-–—]\s*$/, '')
        .trim();
    }
  } else if (cleaned.includes(' / ')) {
    const parts = cleaned.split(/\s+\/\s+/);
    title = parts[0].trim();
    if (!artist) artist = parts.slice(1).join(' / ').trim();
  } else if (cleaned.includes(' โดย ')) {
    const parts = cleaned.split(/\s+โดย\s+/);
    title = parts[0].trim();
    if (!artist) artist = parts.slice(1).join(' โดย ').trim();
  } else {
    title = cleaned;
  }

  // ถ้า title ยังมีชื่อ artist ติดอยู่ที่ท้าย
  if (artist && title.toLowerCase().endsWith(artist.toLowerCase())) {
    title = title.slice(0, title.length - artist.length).trim();
  }

  title = title.replace(/\s*คอร์ด.*$/i, '').replace(/^คอร์ด\s*/i, '').trim();
  artist = (artist || '').replace(/^(โดย|by)\s*/i, '').replace(/\*\*/g, '').trim();

  if (!title && url) {
    try {
      title = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
        .replace(/\.\w+$/, '')
        .replace(/[-_+]+/g, ' ')
        .trim();
    } catch {}
  }
  return { title, artist, key };
}

function cleanExtractedWebChordPage(rawContent) {
  const lines = String(rawContent || '').replace(/\r/g, '').split('\n');
  let rawTitle = '';
  const bodyLines = [];
  let startedChordSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('Title:')) {
      rawTitle = trimmed.replace(/^Title:\s*/, '').trim();
      continue;
    }

    if (!startedChordSection) {
      if (
        /^(Intro|Instru|Instrument|Verse|Chorus|Solo)\s*[:\-]/i.test(trimmed) ||
        /^เพลง\s+.+/i.test(trimmed) ||
        isChordLine(line) ||
        (/\[([A-G][#b]?[^\]]*)\]/.test(line))
      ) {
        startedChordSection = true;
      } else {
        continue;
      }
    }

    if (
      /^(ความคิดเห็น|คอมเมนต์|เพลงอื่นๆ|คอร์ดเพลงอื่นๆ|แชร์ไปยัง|Tags:|Copyright|All Rights Reserved)/i.test(trimmed) ||
      trimmed.startsWith('*   [')
    ) {
      break;
    }

    if (/^!\[.*?\]\(.*?\)$/.test(trimmed) || /^\[.*?\]\(https?:\/\/.*?\)$/.test(trimmed)) {
      continue;
    }

    if (/^\s*[1-6eBGDAE]\s*[|\-][0-9hHpPsb/\-^]+/.test(trimmed) || /^-{15,}$/.test(trimmed)) {
      continue;
    }

    bodyLines.push(line.replace(/\s+$/, ''));
  }

  const finalSheet = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { rawTitle, text: finalSheet };
}

function extractChordTextFromHtml(html) {
  if (html.startsWith('Title:') && html.includes('Markdown Content:')) {
    return cleanExtractedWebChordPage(html);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const h1 = doc.querySelector('h1');
  const rawTitle = ((ogTitle && ogTitle.content) || (h1 && h1.textContent) || doc.title || '').trim();

  doc.querySelectorAll('script, style, nav, header, footer, noscript, svg, iframe, form, button, .ads, .ad, .advertisement, .banner, .social-share, .comments, .related-posts, #sidebar, .sidebar').forEach(n => n.remove());

  doc.querySelectorAll('[class*="chord"], [id*="chord"], font[color]').forEach(el => {
    const txt = el.textContent.trim();
    if (isChord(txt)) {
      el.replaceWith(`[${txt}]`);
    }
  });

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
  const cleaned = cleanExtractedWebChordPage(rawText);
  return { rawTitle, text: cleaned.text || rawText };
}

async function fetchPageWithFallbacks(url) {
  const userProxy = (LS.get(PROXY, '') || '').trim();
  if (userProxy) {
    const r = await fetch(userProxy.replace('{url}', encodeURIComponent(url)));
    if (r.ok) return r.text();
  }

  const endpoints = [
    `https://r.jina.ai/${url}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];

  for (const endpoint of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8500);
      const res = await fetch(endpoint, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 200 && !text.includes('Performing security verification')) {
          return text;
        }
      }
    } catch {}
  }

  throw new Error('ไม่สามารถดึงข้อมูลจากลิงก์นี้ได้');
}

function extractRealChordsFromSnippet(title, snippet) {
  const combined = `${title} ${snippet}`.replace(/\*\*/g, '');
  const chords = [];

  const chordMentions = [...combined.matchAll(/(?:คอร์ด|chord)\s+([A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|\d+)*(?:\/[A-G][#b]?)?)\b/gi)];
  for (const m of chordMentions) {
    if (isChord(m[1]) && !chords.includes(m[1])) chords.push(m[1]);
  }

  const listMatch = combined.match(/ประกอบด้วย[^.]*/i);
  if (listMatch) {
    for (const tok of listMatch[0].split(/[\s,]+/)) {
      const cleanTok = tok.replace(/[^A-Za-z0-9#b/]/g, '');
      if (isChord(cleanTok) && !chords.includes(cleanTok)) chords.push(cleanTok);
    }
  }

  const trueKey = detectTrueKeyFromChords(chords, combined);
  return { chords, trueKey };
}

function parseDdgLiteMarkdown(md, q) {
  const items = [];
  const entryRegex = /\d+\.\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\n([\s\S]*?)(?=\n\d+\.\[|$)/g;
  for (const m of md.matchAll(entryRegex)) {
    const rawLinkTitle = m[1].trim();
    let targetUrl = m[2].trim();
    const snippetBlock = m[3].trim();

    const uddgMatch = targetUrl.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      targetUrl = decodeURIComponent(uddgMatch[1]);
    }

    let domain = '';
    try {
      domain = new URL(targetUrl).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }

    const isChordtabs = domain.includes('chordtabs.in.th');
    if (/\/(artist|category|tag|search)\//i.test(targetUrl)) continue;
    if (isChordtabs && (!/\/\d+/.test(targetUrl) && !/song\.php/i.test(targetUrl))) continue;

    let { chords, trueKey } = extractRealChordsFromSnippet(rawLinkTitle, snippetBlock);
    const { title, artist, key } = parseTitleAndArtist(rawLinkTitle, snippetBlock, targetUrl);
    if (key && !trueKey) trueKey = key;

    const displayDomain = isChordtabs ? 'chordtabs.in.th (คอร์ดภาพ)' : domain;

    items.push({
      id: 'web-' + hash(targetUrl),
      title: title || q,
      artist: artist || '',
      key: trueKey || '',
      realChords: chords,
      url: targetUrl,
      domain: displayDomain,
      isChordtabs,
      snippet: snippetBlock.replace(/\*\*/g, '').split('\n')[0].slice(0, 120),
      source: 'web'
    });
  }
  return items;
}

// ค้นหาหน้าคอร์ดจริงจากเว็บ โดยอิง Chordtabs เป็นหลักตามโจทย์เล่นสด ไม่ดึงผลลัพธ์มั่วมากเกินไป
async function searchRealWebChords(query) {
  const q = query.trim();
  if (!q) return { results: [], webTrueKey: '' };

  const results = [];
  const qLower = q.toLowerCase();
  const t = qLower.split(/\s+/).filter(Boolean);

  // 1. คลังเพลงในเครื่องของผู้ใช้
  for (const s of loadBook()) {
    const h = (s.title + ' ' + (s.artist || '')).toLowerCase();
    if (t.every(x => h.includes(x))) {
      results.push({
        ...s,
        source: 'builtin',
        domain: '💾 ในคลังเครื่อง',
        realChords: extractUniqueChordsFromSheet(s.text)
      });
    }
  }

  // 2. ดึงจาก Chordtabs เป็นหลัก (คอร์ดภาพแม่นยำที่สุด)
  const fetchDdg = async (searchStr) => {
    try {
      const ddgUrl = `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(searchStr)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 16000);
      const res = await fetch(ddgUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return parseDdgLiteMarkdown(await res.text(), q);
    } catch {}
    return [];
  };

  const chordtabsItems = await fetchDdg(`${q} site:chordtabs.in.th`);

  let secondaryItems = [];
  // ถ้า Chordtabs มีน้อยกว่า 2 ผลลัพธ์ ให้ดึงเว็บข้อความคอร์ดเสริม
  if (chordtabsItems.length < 2) {
    secondaryItems = await fetchDdg(`${q} คอร์ด site:musicatm.com`);
  }

  const seenUrls = new Set();
  const rawWebList = [];
  for (const item of [...chordtabsItems, ...secondaryItems]) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    rawWebList.push(item);
  }

  // คัดกรองและจัดอันดับ: เพลงที่ชื่อตรงหรือมีคำค้นหาขึ้นก่อน
  const hasExactMatches = rawWebList.some(it => (it.title || '').toLowerCase().includes(qLower));
  const relevantWeb = hasExactMatches
    ? rawWebList.filter(it => (it.title || '').toLowerCase().includes(qLower) || (it.artist || '').toLowerCase().includes(qLower))
    : rawWebList;

  relevantWeb.sort((a, b) => {
    let scA = 0, scB = 0;
    const aT = (a.title || '').toLowerCase(), bT = (b.title || '').toLowerCase();
    const aA = (a.artist || '').toLowerCase(), bA = (b.artist || '').toLowerCase();

    if (aT === qLower) scA += 100; else if (aT.includes(qLower)) scA += 60;
    if (aA.includes(qLower)) scA += 30;

    if (bT === qLower) scB += 100; else if (bT.includes(qLower)) scB += 60;
    if (bA.includes(qLower)) scB += 30;

    return scB - scA;
  });

  for (const item of relevantWeb) {
    results.push(item);
  }

  // ไม่แสดงเยอะเกินไป ตัดเหลือ 6-8 ผลลัพธ์ที่ตรงที่สุด เพื่อความรวดเร็วและไม่รก
  const finalResults = results.slice(0, 8);
  const bestKey = finalResults.find(r => r.key)?.key || '';

  return { results: finalResults, webTrueKey: bestKey };
}

// ฟังก์ชันสกัดท่อนเพลงเริ่มต้นสำหรับเล่นสด
function autoExtractSectionsFromText(text) {
  if (!text) return [];
  const lines = text.split('\n');
  const sections = [];
  let secIdx = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(/^\[(Intro|Instru|Verse\s*\d*|Pre-Chorus|Chorus|Hook|Solo|Bridge|Outro|ท่อน[^\s\]]+)\]/i) ||
              trimmed.match(/^(Intro|Instru|Verse\s*\d*|Pre-Chorus|Chorus|Hook|Solo|Bridge|Outro|ท่อน[^\s:]+)\s*[:\-]/i);
    if (m) {
      const name = m[1].replace(/[:\-]$/, '').trim();
      const cue = trimmed.slice(m[0].length).replace(/^[\s:\-]+/, '').trim();
      sections.push({
        id: 'sec-' + (secIdx++),
        name,
        tag: name.toLowerCase().includes('chorus') ? 'x2' : '',
        cue: cue || ''
      });
    }
  }

  if (!sections.length) {
    sections.push(
      { id: 'sec-1', name: 'Intro', tag: '', cue: '' },
      { id: 'sec-2', name: 'Verse 1', tag: '', cue: '' },
      { id: 'sec-3', name: 'Pre-Chorus', tag: '', cue: '' },
      { id: 'sec-4', name: 'Chorus', tag: 'x2', cue: 'ร้องคู่' },
      { id: 'sec-5', name: 'Verse 2', tag: '', cue: '' },
      { id: 'sec-6', name: 'Chorus', tag: 'x2', cue: '' },
      { id: 'sec-7', name: 'Solo', tag: '8 ห้อง', cue: 'กีต้าร์ลีด' },
      { id: 'sec-8', name: 'Chorus', tag: 'x2', cue: 'ส่งกลองเต็ม' },
      { id: 'sec-9', name: 'Outro', tag: '', cue: 'จบ' }
    );
  }

  return sections;
}

// ดึงตารางคอร์ดจริง หรือรูปภาพคอร์ดจาก Chordtabs และบันทึกลง IndexedDB ให้ออฟไลน์ 100%
async function loadRealWebChordResult(item, allResults) {
  const candidateUrls = [];
  if (item.url) candidateUrls.push(item.url);

  // 1. ตรวจสอบว่าผลลัพธ์เป็น Chordtabs.in.th หรือไม่ (ดึงรูปภาพ + เนื้อเพลง + คีย์)
  const isChordtabs = candidateUrls.some(u => u.includes('chordtabs.in.th'));
  if (isChordtabs) {
    for (const targetUrl of candidateUrls.filter(u => u.includes('chordtabs.in.th'))) {
      try {
        const jinaUrl = `https://r.jina.ai/${targetUrl}`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(jinaUrl, { headers: { 'X-With-Images-Summary': 'true' }, signal: ctrl.signal });
        clearTimeout(timer);

        if (res.ok) {
          const md = await res.text();

          // หา Chord Image URL
          let chordImgUrl = '';
          const imgMatch = md.match(/!\[.*?\]\((https:\/\/chordtabs\.in\.th\/img\/nm\/[^\s)]+\.(?:png|webp|jpg))\)/i) ||
                           md.match(/(https:\/\/chordtabs\.in\.th\/img\/nm\/[^\s)]+\.(?:png|webp|jpg))/i);
          if (imgMatch) {
            chordImgUrl = imgMatch[1];
          } else {
            const idMatch = targetUrl.match(/chordtabs\.in\.th\/(\d+)/);
            if (idMatch) chordImgUrl = `https://chordtabs.in.th/img/nm/${idMatch[1]}.png`;
          }

          // สกัด Title, Artist, Key จาก Markdown และ Header
          let { title, artist, key } = parseTitleAndArtist(item.title || '', md, targetUrl);
          if (item.artist) artist = item.artist;
          const titleLine = md.split('\n').find(l => l.startsWith('Title:') || l.startsWith('# '));
          if (titleLine) {
            const parsedH = parseTitleAndArtist(titleLine.replace(/^Title:\s*|^#\s*/, ''), md, targetUrl);
            if (parsedH.title) title = parsedH.title;
            if (parsedH.artist && !artist) artist = parsedH.artist;
            if (parsedH.key && !key) key = parsedH.key;
          }

          // ตรวจสอบคอร์ดที่ใช้ในเพลงจากไอคอนคอร์ด
          const chordsUsed = [];
          for (const cm of md.matchAll(/chord-([A-G][#b]?(?:m|maj|dim|aug|sus|\d+)*)/gi)) {
            if (!chordsUsed.includes(cm[1])) chordsUsed.push(cm[1]);
          }
          if (!chordsUsed.length) {
            for (const cm of md.matchAll(/\/([A-G][#b]?(?:m|maj|dim|aug|sus|\d+)*)\.webp/gi)) {
              if (!chordsUsed.includes(cm[1])) chordsUsed.push(cm[1]);
            }
          }
          if (!key && chordsUsed.length) key = chordsUsed[0];

          // ดาวน์โหลดรูปภาพคอร์ดและบันทึกลง IndexedDB ให้เล่นออฟไลน์ 100% (ไม่แนบเนื้อเพลงที่รกตา)
          const images = [];
          if (chordImgUrl) {
            const proxyImg = `https://images.weserv.nl/?url=${encodeURIComponent(chordImgUrl)}&output=webp`;
            try {
              const imgCtrl = new AbortController();
              const imgTimer = setTimeout(() => imgCtrl.abort(), 7000);
              const imgRes = await fetch(proxyImg, { signal: imgCtrl.signal });
              clearTimeout(imgTimer);
              if (imgRes.ok) {
                const blob = await imgRes.blob();
                const imgId = 'ct-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
                await idbPut(imgId, blob);
                images.push(imgId);
              } else {
                images.push(proxyImg);
              }
            } catch (imgErr) {
              console.warn('Failed to cache image in idb, using proxy directly:', imgErr);
              images.push(proxyImg);
            }
            if (!images.length) images.push(proxyImg);
          }

          return {
            id: item.id || ('ct-' + Date.now().toString(36)),
            title: title || item.title,
            artist: artist || item.artist || '',
            key: key || item.key || (chordsUsed[0] || 'C'),
            text: '', // ตัดเนื้อเพลงที่แนบมาออก
            images,
            sections: [],
            src: targetUrl,
            shift: 0
          };
        }
      } catch (err) {
        console.warn('Chordtabs direct load error:', err);
      }
    }
  }

  // 2. ถ้าเป็นเว็บข้อความคอร์ดทั่วไป (เช่น MusicATM)
  for (const r of allResults) {
    if (r.url && r.domain && r.domain.includes('musicatm.com') && !candidateUrls.includes(r.url)) {
      candidateUrls.push(r.url);
    }
  }

  if (!candidateUrls.some(u => u.includes('musicatm.com'))) {
    try {
      const ddgUrl = `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(item.title + ' คอร์ด site:musicatm.com')}`;
      const res = await fetch(ddgUrl);
      if (res.ok) {
        const extra = parseDdgLiteMarkdown(await res.text(), item.title);
        for (const ex of extra) {
          if (ex.url && !candidateUrls.includes(ex.url)) candidateUrls.push(ex.url);
        }
      }
    } catch {}
  }

  for (const targetUrl of candidateUrls) {
    try {
      const rawHtml = await fetchPageWithFallbacks(targetUrl);
      const { rawTitle, text } = extractChordTextFromHtml(rawHtml);
      const formattedText = smartFormatChordSheet(text, false);
      const sheetChords = extractUniqueChordsFromSheet(formattedText);

      if (formattedText && formattedText.length > 80 && sheetChords.length >= 2) {
        const actualSheetKey = detectTrueKeyFromChords(sheetChords, formattedText);
        const parsed = parseTitleAndArtist(rawTitle, targetUrl);

        return {
          id: item.id,
          title: item.title || parsed.title,
          artist: (item.artist && !item.artist.includes('.com')) ? item.artist : (parsed.artist || item.artist),
          key: actualSheetKey || item.key || sheetChords[0],
          text: formattedText,
          sections: autoExtractSectionsFromText(formattedText),
          src: targetUrl
        };
      }
    } catch {}
  }

  throw new Error('เว็บปลายทางติดระบบป้องกันบอท');
}

/* ==============================================================================
 * 6) Image OCR / AI Chord Scanner
 * ============================================================================== */
async function scanImageWithOCR(imageFileOrBlob, progressCb) {
  if (progressCb) progressCb('กำลังโหลดโมดูล AI/OCR...', 5);
  const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js');

  const worker = await createWorker(['tha', 'eng'], 1, {
    logger: m => {
      if (progressCb && m.status) {
        const pct = m.progress != null ? Math.round(m.progress * 100) : 0;
        let msg = 'กำลังประมวลผล...';
        if (m.status.includes('loading')) msg = 'กำลังโหลดชุดภาษา Thai/Eng...';
        else if (m.status.includes('recognizing')) msg = `กำลังสแกนคอร์ดและเนื้อเพลง... (${pct}%)`;
        progressCb(msg, pct);
      }
    }
  });

  const ret = await worker.recognize(imageFileOrBlob);
  await worker.terminate();
  return ret.data.text;
}

/* ==============================================================================
 * 7) Storage & IndexedDB
 * ============================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (typeof text === 'string' || typeof text === 'number') {
    e.textContent = text;
  }
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

const BOOK = 'nightChordbook.v1', SITES = 'nightChordbook.sites', FSK = 'nightChordbook.fs', PROXY = 'nightChordbook.proxy', COLS = 'nightChordbook.cols';
const K = {
  cfg: 'nightChordbook.sbcfg',
  favs: 'nightChordbook.favs',
  pls: 'nightChordbook.playlists',
  meta: 'nightChordbook.syncmeta',
  localUser: 'nightChordbook.localuser'
};

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
 * 8) ระบบนำทางแบบ Native PWA, Metronome & Wake Lock
 * ============================================================================== */
let current = null, curPl = null, filterMode = 'all', wakeLock = null;
let activeSetlistContext = null;

// Metronome & Tap Tempo Engine
let metroBpm = 100, metroPlaying = false, metroTimer = null, metroBeat = 0;
let tapTimes = [];

function playMetronomeClick(isDownbeat) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(isDownbeat ? 1100 : 750, now);
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function setMetronome(on) {
  metroPlaying = on;
  clearInterval(metroTimer);
  const btnEl = $('#metroBtn');
  if (btnEl) {
    btnEl.classList.toggle('metroOn', on);
    btnEl.textContent = on ? `⏹️ ${metroBpm} BPM` : `⏱️ ${metroBpm} BPM`;
  }
  if (on) {
    metroBeat = 0;
    playMetronomeClick(true);
    metroTimer = setInterval(() => {
      metroBeat = (metroBeat + 1) % 4;
      playMetronomeClick(metroBeat === 0);
    }, (60 / metroBpm) * 1000);
  }
}

if ($('#metroBtn')) {
  $('#metroBtn').onclick = () => setMetronome(!metroPlaying);
}

if ($('#tapTempoBtn')) {
  $('#tapTempoBtn').onclick = () => {
    const now = performance.now();
    tapTimes = tapTimes.filter(t => now - t < 2500);
    tapTimes.push(now);
    if (tapTimes.length >= 2) {
      let sum = 0;
      for (let i = 1; i < tapTimes.length; i++) sum += tapTimes[i] - tapTimes[i - 1];
      const avgMs = sum / (tapTimes.length - 1);
      metroBpm = Math.min(240, Math.max(45, Math.round(60000 / avgMs)));
      if ($('#metroBtn')) {
        $('#metroBtn').textContent = metroPlaying ? `⏹️ ${metroBpm} BPM` : `⏱️ ${metroBpm} BPM`;
      }
      if (metroPlaying) setMetronome(true);
      toast(`⏱️ จังหวะ Tap Tempo: ${metroBpm} BPM`);
    } else {
      toast('👆 แตะซ้ำตามจังหวะเพลงอีก 2-3 ครั้งเพื่อวัด BPM');
    }
  };
}

if ($('#printBtn')) {
  $('#printBtn').onclick = () => window.print();
}

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

function updateBottomNav(viewName) {
  $$('#bottomNav .navTab').forEach(tab => {
    const nav = tab.dataset.nav;
    const isActive = (nav === viewName) ||
                     (nav === 'home' && viewName === 'song' && !activeSetlistContext) ||
                     (nav === 'playlists' && (viewName === 'playlist' || (viewName === 'song' && activeSetlistContext)));
    tab.classList.toggle('active', isActive);
  });
}

function show(name, push = true) {
  document.body.dataset.view = name;
  $('#placeholder').hidden = !(name === 'home' || name === 'playlists');
  $('#editorView').hidden = name !== 'editor';
  $('#songView').hidden = name !== 'song';
  $('#plView').hidden = name !== 'playlist';

  updateBottomNav(name);

  if (name !== 'song') {
    setFocus(false);
    setScroll(false);
    setMetronome(false);
    releaseWakeLock();
  } else {
    requestWakeLock();
  }

  scrollTo(0, 0);
  if (push && name !== 'home') history.pushState({ v: name }, '');
}

const goBack = () => {
  if (activeSetlistContext && document.body.dataset.view === 'song') {
    const plId = activeSetlistContext.plId;
    activeSetlistContext = null;
    openPlaylist(plId);
    return;
  }
  history.state && history.state.v ? history.back() : show('home', false);
};

addEventListener('popstate', e => {
  const v = e.state && e.state.v;
  show((v === 'song' && !current) || (v === 'playlist' && !curPl) ? 'home' : (v || 'home'), false);
});

$$('.backBtn').forEach(b => (b.onclick = goBack));
$('#plBack').onclick = () => {
  if (location.hash.startsWith('#/p/') || location.hash.startsWith('#/s/')) {
    history.replaceState(null, '', location.pathname);
  }
  show('playlists', false);
};

$('#brandHome').onclick = () => {
  activeSetlistContext = null;
  show('home', false);
};

$$('#bottomNav .navTab').forEach(tab => {
  tab.onclick = () => {
    const target = tab.dataset.nav;
    if (target === 'home') {
      activeSetlistContext = null;
      show('home', false);
    } else if (target === 'playlists') {
      activeSetlistContext = null;
      show('playlists', false);
    } else if (target === 'editor') {
      openEditor(null, $('#q').value.trim());
    } else if (target === 'settings') {
      openAcct();
    }
  };
});

/* ==============================================================================
 * 9) ค้นหาคอร์ดจริงจากเว็บในแอป & คลังเพลง
 * ============================================================================== */
function openInAppWebFinderModal(initialQuery = '') {
  modal('🔎 ดึงคอร์ดจากลิงก์เว็บเข้าแอปโดยตรง', (box, close) => {
    const qVal = initialQuery || $('#q').value.trim();
    const wrap = mk('div');
    wrap.innerHTML = `
      <p class="muted small" style="margin-top:0">
        วางลิงก์หน้าเว็บคอร์ดเพลง (เช่น MusicATM, Ultimate-Guitar, บล็อกคอร์ดเพลง) เพื่อดึงคอร์ดและวิเคราะห์คีย์ต้นฉบับเข้าแอปทันที
      </p>
    `;

    const urlLabel = mk('label', null, '🔗 ลิงก์หน้าเว็บคอร์ด');
    const urlRow = mk('div', 'row');
    const urlInp = mk('input', 'grow');
    urlInp.type = 'url';
    urlInp.placeholder = 'https://www.musicatm.com/chord/...';
    const fetchBtn = btn('🌐 ดึงคอร์ดจริง', async () => {
      const u = urlInp.value.trim();
      if (!/^https?:\/\//.test(u)) {
        toast('กรุณาวางลิงก์ที่ขึ้นต้นด้วย https://', true);
        return;
      }
      close();
      openEditor(null, qVal);
      $('#fUrl').value = u;
      importFromUrl();
    }, 'primary small');
    urlRow.append(urlInp, fetchBtn);

    wrap.append(urlLabel, urlRow);
    box.appendChild(wrap);
  });
}

if ($('#extGoogleModalBtn')) {
  $('#extGoogleModalBtn').onclick = () => openInAppWebFinderModal($('#q').value.trim());
}

let searchSeq = 0;
async function runInAppOnlineSearch() {
  const q = $('#q').value.trim();
  if (!q) {
    toast('พิมพ์ชื่อเพลงหรือศิลปินในช่องค้นหาก่อนครับ');
    $('#q').focus();
    return;
  }

  if (document.body.dataset.view !== 'home') {
    show('home', false);
  }

  const seq = ++searchSeq;
  const box = $('#resultsBox'), list = $('#results'), btnEl = $('#onlineSearchBtn');
  box.hidden = false;
  $('#resultsTitle').textContent = `🌐 กำลังค้นหาคอร์ดจริงจากเว็บสำหรับ “${q}”…`;
  btnEl.disabled = true;
  list.innerHTML = `<div class="empty"><span class="spinner"></span> กำลังสืบค้นตารางคอร์ดจริงจากเว็บคอร์ด…</div>`;

  const { results: items, webTrueKey } = await searchRealWebChords(q);
  if (seq !== searchSeq) return;
  btnEl.disabled = false;

  const keyInfo = webTrueKey ? ` · คีย์ต้นฉบับ: ${webTrueKey}` : '';
  $('#resultsTitle').textContent = `🌐 คอร์ดจากเว็บสำหรับ “${q}” (${items.length})${keyInfo}`;
  list.replaceChildren();

  if (!items.length) {
    const empty = mk('div', 'empty');
    empty.innerHTML = `<b>🔍</b>ไม่พบหน้าเว็บคอร์ดสำหรับ “${q}”`;
    const customBtn = btn('🔗 วางลิงก์เว็บคอร์ดเอง / พิมพ์คอร์ด', () => openInAppWebFinderModal(q), 'primary small');
    customBtn.style.marginTop = '10px';
    empty.appendChild(customBtn);
    list.appendChild(empty);
    return;
  }

  for (const it of items) {
    const row = mk('div', 'item');
    const b = mk('button', 'open');
    const displayTitle = it.artist && !it.title.toLowerCase().includes(it.artist.toLowerCase())
      ? `${it.title} - ${it.artist}`
      : it.title;
    const titleEl = mk('div', 't', displayTitle);

    if (it.key) {
      titleEl.appendChild(mk('span', 'badge', `Key ${it.key}`));
    }
    titleEl.appendChild(mk('span', 'badge green', it.domain));

    if (it.realChords && it.realChords.length) {
      const chordsEl = mk('div', 'a');
      chordsEl.innerHTML = `<span class="muted small">คอร์ดในเพลง: ${it.realChords.slice(0, 8).join(' ')}</span>`;
      b.append(titleEl, chordsEl);
    } else {
      b.append(titleEl);
    }

    b.onclick = async () => {
      activeSetlistContext = null;
      if (it.source === 'builtin') {
        openSong({ ...it }, 0);
        return;
      }

      b.disabled = true;
      const origSub = b.lastChild.textContent;
      const isImgTab = it.isChordtabs || (it.domain && it.domain.includes('chordtabs'));
      b.lastChild.textContent = isImgTab ? '⏳ กำลังดึงรูปคอร์ดจาก Chordtabs เข้าแอป…' : '⏳ กำลังดึงตารางคอร์ดเข้าแอป…';
      try {
        const loadedSong = await loadRealWebChordResult(it, items);
        openSong(loadedSong, 0);
        const displayName = loadedSong.artist && !loadedSong.title.toLowerCase().includes(loadedSong.artist.toLowerCase())
          ? `${loadedSong.title} - ${loadedSong.artist}`
          : loadedSong.title;
        toast(isImgTab ? `ดึงรูปคอร์ด “${displayName}” สำเร็จ ✔` : `ดึงตารางคอร์ด “${displayName}” (คีย์ ${loadedSong.key}) เรียบร้อย ✔`);
      } catch (err) {
        console.warn('Load web chord error:', err);
        toast('การเชื่อมต่อไปยังเว็บต้นทางใช้เวลานานหรือติดขัด กรุณาลองใหม่อีกครั้งครับ', true);
      } finally {
        b.disabled = false;
        b.lastChild.textContent = origSub;
      }
    };

    row.appendChild(b);
    list.appendChild(row);
  }
}

$('#searchForm').onsubmit = e => {
  e.preventDefault();
  runInAppOnlineSearch();
};

$('#clearSearchBtn').onclick = () => {
  $('#q').value = '';
  $('#clearSearchBtn').hidden = true;
  $('#resultsBox').hidden = true;
  renderSongbook();
  $('#q').focus();
};


const POPULAR_SEARCH_CHIPS = [];

function renderPopularChips() {
  const bar = $('#popularChipsBar');
  if (bar) bar.hidden = true;
}

let deb, onlineDeb;
function doInstantLocalFilter() {
  const q = $('#q').value.trim();
  $('#clearSearchBtn').hidden = !q;
  renderSongbook();

  if (!q) {
    $('#resultsBox').hidden = true;
    return;
  }

  const t = q.toLowerCase().split(/\s+/).filter(Boolean);
  const allLookup = loadBook();
  const seenIds = new Set();
  const localMatches = allLookup.filter(s => {
    if (seenIds.has(s.id)) return false;
    const h = (s.title + ' ' + (s.artist || '')).toLowerCase();
    const match = t.every(x => h.includes(x));
    if (match) seenIds.add(s.id);
    return match;
  });

  const box = $('#resultsBox'), list = $('#results');
  if (localMatches.length) {
    box.hidden = false;
    $('#resultsTitle').textContent = `🎵 พบในคลังเพลง (${localMatches.length}) · กด “🌐 ค้นออนไลน์” เพื่อดึงจากเว็บคอร์ด`;
    list.replaceChildren();
    for (const it of localMatches) {
      const displayTitle = it.artist && !it.title.toLowerCase().includes(it.artist.toLowerCase())
        ? `${it.title} - ${it.artist}`
        : it.title;
      const row = mk('div', 'item'), b = mk('button', 'open'), titleEl = mk('div', 't', displayTitle);
      if (it.key) titleEl.appendChild(mk('span', 'badge', `Key ${it.key}`));
      titleEl.appendChild(mk('span', 'badge green', '💾 ในคลัง'));
      b.append(titleEl);
      b.onclick = () => {
        activeSetlistContext = null;
        openSong(it, it.shift || 0);
      };
      row.appendChild(b);
      list.appendChild(row);
    }
  }
}

$('#q').oninput = () => {
  clearTimeout(deb);
  clearTimeout(onlineDeb);
  deb = setTimeout(doInstantLocalFilter, 120);
  const qVal = $('#q').value.trim();
  if (qVal.length >= 2) {
    onlineDeb = setTimeout(() => {
      runInAppOnlineSearch();
    }, 600);
  }
};

$$('.filterTabs .pillTab').forEach(pill => {
  pill.onclick = () => {
    filterMode = pill.dataset.filter;
    $$('.filterTabs .pillTab').forEach(p => p.classList.toggle('active', p === pill));
    renderSongbook();
  };
});

const favs = () => new Set(LS.get(K.favs, [])), setFavs = s => LS.set(K.favs, [...s]);
function toggleFav(id) {
  const F = favs();
  F.has(id) ? F.delete(id) : F.add(id);
  setFavs(F);
  renderSongbook();
  paintFav();
}
function paintFav() {
  if (current) {
    const isFav = favs().has(current.song.id);
    $('#favBtn').textContent = isFav ? '★' : '☆';
    $('#favBtn').style.color = isFav ? 'var(--accent)' : '';
  }
}
$('#favBtn').onclick = () => {
  const id = current.song.id;
  if (!loadBook().some(s => s.id === id)) $('#saveBtn').click();
  toggleFav(id);
};

function renderSongbook() {
  const q = $('#q').value.trim().toLowerCase(), F = favs();
  const savedBook = loadBook();

  let book = [];
  if (filterMode === 'fav') {
    book = savedBook.filter(s => F.has(s.id));
  } else if (filterMode === 'recent') {
    book = [...savedBook].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } else {
    // filterMode === 'all'
    book = [...savedBook];
  }

  if (filterMode === 'recent') {
    // already sorted
  } else if (q) {
    book.sort((a, b) => {
      const aTitleMatch = a.title.toLowerCase().includes(q);
      const bTitleMatch = b.title.toLowerCase().includes(q);
      if (aTitleMatch && !bTitleMatch) return -1;
      if (!aTitleMatch && bTitleMatch) return 1;
      return a.title.localeCompare(b.title, 'th');
    });
  } else {
    book.sort((a, b) => a.title.localeCompare(b.title, 'th'));
  }

  if (q) {
    book = book.filter(s => (s.title + ' ' + (s.artist || '') + ' ' + (s.text || '')).toLowerCase().includes(q));
  }

  $('#count').textContent = savedBook.length;
  const list = $('#songbook');
  list.replaceChildren();

  if (!book.length) {
    const emptyBox = mk('div', 'empty');
    emptyBox.innerHTML = `<b>🎶</b>${q ? `ไม่พบเพลง “${escapeHtml(q)}” ในคลังเครื่อง` : (filterMode === 'fav' ? 'ยังไม่มีเพลงรายการโปรด (กด ☆ บนเพลงที่ชอบ)' : 'ยังไม่มีเพลงในคลัง — แตะ “+ เพิ่มเพลง / รูปคอร์ด” หรือค้นหาจากเว็บเพื่อเพิ่มเพลง')}`;
    if (q) {
      const searchOnlineNowBtn = btn(`🌐 ค้นหาคอร์ดจริง “${q}” จากเว็บ`, runInAppOnlineSearch, 'primary small');
      searchOnlineNowBtn.style.marginTop = '10px';
      emptyBox.appendChild(searchOnlineNowBtn);
    }
    list.appendChild(emptyBox);
    return;
  }

  for (const s of book) {
    const isCurrent = current && current.song.id === s.id;
    const row = mk('div', 'item' + (isCurrent ? ' active' : ''));
    const open = mk('button', 'open');
    open.type = 'button';
    const displayTitle = s.artist && !s.title.toLowerCase().includes(s.artist.toLowerCase())
      ? `${s.title} - ${s.artist}`
      : s.title;
    const t = mk('div', 't', displayTitle);

    const actualKey = (s.text ? detectKey(s.text) : '') || s.key || '';
    if (actualKey) t.appendChild(mk('span', 'badge', `Key ${actualKey}`));
    if (s.shift) t.appendChild(mk('span', 'badge dim', (s.shift > 0 ? '+' : '') + s.shift));
    if (s.images && s.images.length) t.appendChild(mk('span', 'badge dim', '🖼 ' + s.images.length));
    t.appendChild(mk('span', 'badge green', '💾 ในคลัง'));

    open.append(t);
    open.onclick = () => {
      activeSetlistContext = null;
      openSong(s, s.shift || 0);
    };

    const actions = mk('div', 'itemActions');
    const favButton = btn(F.has(s.id) ? '★' : '☆', (e) => {
      e.stopPropagation();
      toggleFav(s.id);
    }, F.has(s.id) ? 'favOn' : '');
    favButton.title = 'รายการโปรด';
    actions.appendChild(favButton);

    if (isSaved) {
      const delButton = btn('🗑', (e) => {
        e.stopPropagation();
        removeSong(s.id, s.title);
      });
      delButton.title = 'ลบเพลงออกจากคลัง';
      actions.appendChild(delButton);
    }

    row.append(open, actions);
    list.appendChild(row);
  }
  schedSync();
}

async function removeSong(id, title) {
  if (!confirm(`ลบเพลง “${title}” ออกจากคลังเพลง?`)) return;
  const s = loadBook().find(x => x.id === id);
  if (s && s.images) {
    for (const i of s.images) await idbDel(i).catch(() => {});
    cloudDelImgs(s.images);
  }
  saveBook(loadBook().filter(x => x.id !== id));
  renderSongbook();
  if (current && current.song.id === id) {
    current = null;
    show('home', false);
  }
  toast('ลบเพลงแล้ว');
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
    const name = 'mellowchords-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
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
    toast('ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว ✔');
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
    toast(`นำเข้า ${n} เพลงเรียบร้อยแล้ว ✔`);
  } catch {
    toast('ไฟล์สำรองข้อมูลไม่ถูกต้อง', true);
  }
};

/* ==============================================================================
 * 10) หน้าแสดงคอร์ดเพลง, แถบสรุปคอร์ดทั้งหมดในเพลง & ตัวเลือกคีย์แบบกดข้ามคีย์ได้ทันที
 * ============================================================================== */
let twoCols = LS.get(COLS, false);
function applyCols() {
  $('#sheet').classList.toggle('cols2', twoCols);
  $('#colToggleBtn').textContent = twoCols ? '📖 2 คอลัมน์' : '📄 1 คอลัมน์';
}
$('#colToggleBtn').onclick = () => {
  twoCols = !twoCols;
  LS.set(COLS, twoCols);
  applyCols();
};
applyCols();

function openSong(song, shift = 0) {
  // Ensure the song's base key always matches the actual chords in its text sheet
  const sheetDetectedKey = detectKey(song.text);
  const syncedSong = {
    ...song,
    key: sheetDetectedKey || song.key || ''
  };
  current = { song: syncedSong, shift: normShift(shift) };
  renderSong(true);
  renderSongbook();
  show('song');
}

// เปิดป๊อปอัปให้เลือกคีย์ที่ต้องการเล่นได้โดยตรง (เช่น C, Db, D, Eb, E, F...) แล้วทดคอร์ดทั้งเพลงให้ตรงคีย์ทันที
function openDirectKeyPickerModal() {
  if (!current) return;
  const origKey = detectKey(current.song.text) || current.song.key;
  if (!origKey) return;

  const m = origKey.match(/^([A-G][#b]?)(m(?!aj))?/);
  if (!m) return;
  const origRoot = noteIndex(m[1]);
  const isMinor = !!m[2];
  const curShift = current.shift;

  modal('🎹 เลือกคีย์ที่ต้องการเล่น (Instant Key Jump)', (box, close) => {
    const info = mk('p', 'muted small', `คีย์ต้นฉบับบนชีท: ${origKey} · แตะเลือกคีย์ที่ต้องการเพื่อให้ระบบทดคอร์ดบนเนื้อเพลงทั้งหมดให้ตรงคีย์ทันที`);
    info.style.marginTop = '0';
    const grid = mk('div', 'keyGrid');

    const keysList = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    for (const kRoot of keysList) {
      const targetIdx = noteIndex(kRoot);
      const diff = normShift(targetIdx - origRoot);
      const label = kRoot + (isMinor ? 'm' : '');
      const isCur = diff === curShift;
      const shiftTxt = diff === 0 ? ' (เดิม)' : ` (${diff > 0 ? '+' : ''}${diff})`;

      const kBtn = btn(label + shiftTxt, () => {
        setShift(diff);
        close();
        toast(`เปลี่ยนเป็นคีย์ ${label} เรียบร้อย ✔`);
      }, isCur ? 'activeKey' : '');
      grid.appendChild(kBtn);
    }

    const resetBtn = btn('🔄 รีเซ็ตกลับคีย์ต้นฉบับ (' + origKey + ')', () => {
      setShift(0);
      close();
    }, 'small');
    resetBtn.style.width = '100%';
    resetBtn.style.marginTop = '8px';

    box.append(info, grid, resetBtn);
  });
}

let stageInvertImg = LS.get('stage_invert_img', false);

function applyImgInvertFilter() {
  document.querySelectorAll('.sheetImg').forEach(im => {
    im.classList.toggle('invertFilter', stageInvertImg);
  });
  const btnEl = $('#toggleInvertImgBtn');
  if (btnEl) {
    btnEl.textContent = stageInvertImg ? '☀️ สีกระดาษปกติ' : '🌓 โหมดมืดเวที';
  }
}

if ($('#toggleInvertImgBtn')) {
  $('#toggleInvertImgBtn').onclick = () => {
    stageInvertImg = !stageInvertImg;
    LS.set('stage_invert_img', stageInvertImg);
    applyImgInvertFilter();
    toast(stageInvertImg ? 'เปิดโหมดมืดเวที (พื้นดำ ตัวหนังสือขาว) แล้ว 🌓' : 'กลับสู่สีต้นฉบับ ☀️');
  };
}

let hideLyrics = LS.get('hide_lyrics', false);

function applyLyricsVisibility() {
  const sheetEl = $('#sheet');
  if (sheetEl) sheetEl.classList.toggle('hideLyrics', hideLyrics);
  const btnEl = $('#toggleLyricsBtn');
  if (btnEl) {
    btnEl.textContent = hideLyrics ? '📄 แสดงเนื้อเพลง' : '🎸 ตัดเนื้อเพลง';
    btnEl.classList.toggle('active', hideLyrics);
  }
}

if ($('#toggleLyricsBtn')) {
  $('#toggleLyricsBtn').onclick = () => {
    hideLyrics = !hideLyrics;
    LS.set('hide_lyrics', hideLyrics);
    applyLyricsVisibility();
    toast(hideLyrics ? 'ตัดเนื้อเพลงออก — แสดงเฉพาะคอร์ด 🎸' : 'แสดงเนื้อเพลงควบคู่คอร์ด 📄');
  };
}

if ($('#openImgLightboxBtn')) {
  $('#openImgLightboxBtn').onclick = () => {
    if (galUrls.length) openLightbox(galUrls[0]);
  };
}

function updateSetlistQueueBar() {
  const nav = $('#setlistNav');
  const cueBanner = $('#liveCueBanner');

  if (!activeSetlistContext || !activeSetlistContext.songs.length) {
    nav.hidden = true;
    if (cueBanner) {
      if (current && current.song && current.song.cue) {
        cueBanner.hidden = false;
        $('#liveCueText').textContent = current.song.cue;
        $('#liveCuePills').replaceChildren(mk('span', 'cuePill', `คีย์: ${$('#cKeyNow').textContent}`));
        $('#liveCueNextRow').hidden = true;
      } else {
        cueBanner.hidden = true;
      }
    }
    return;
  }

  nav.hidden = false;
  const { name, songs, index } = activeSetlistContext;
  const curSong = songs[index] || current.song;
  $('#setlistName').textContent = `🎼 สคริปต์สด: ${name}`;
  $('#setlistPos').textContent = `เพลงที่ ${index + 1} / ${songs.length} · ${curSong ? curSong.title : ''}`;
  $('#prevSongBtn').disabled = index <= 0;
  $('#nextSongBtn').disabled = index >= songs.length - 1;

  if (cueBanner && curSong) {
    cueBanner.hidden = false;
    const itemCue = curSong.cue || (curSong.sections && curSong.sections.find(s => s.cue)?.cue) || 'คิวพร้อมเล่นสด — โฟกัสท่อนเพลง';
    $('#liveCueText').textContent = itemCue;

    const pills = $('#liveCuePills');
    pills.replaceChildren();

    if (curSong.singer) pills.appendChild(mk('span', 'cuePill', `🎤 ร้อง: ${curSong.singer}`));
    if (curSong.targetKey) pills.appendChild(mk('span', 'cuePill', `🎹 คีย์เล่นจริง: ${curSong.targetKey}`));
    if (curSong.bpm) {
      pills.appendChild(mk('span', 'cuePill', `⏱️ ${curSong.bpm} BPM`));
      metroBpm = parseInt(curSong.bpm, 10) || metroBpm;
      updateMetroBtnLabel();
    }

    const nextRow = $('#liveCueNextRow');
    if (index < songs.length - 1) {
      nextRow.hidden = false;
      const nextSong = songs[index + 1];
      $('#liveCueNextTitle').textContent = `${nextSong.title} (${nextSong.artist || 'ศิลปิน'})`;
      const nextKey = nextSong.targetKey || detectKey(nextSong.text) || nextSong.key || '-';
      $('#liveCueNextKey').textContent = `Key ${nextKey}`;
    } else {
      nextRow.hidden = true;
    }
  }
}

function renderSongRoadmap(song) {
  const mapWrap = $('#songRoadmap');
  const chipsBox = $('#roadmapChips');
  const summaryEl = $('#roadmapSummary');
  if (!mapWrap || !chipsBox) return;

  const sections = song.sections && song.sections.length
    ? song.sections
    : autoExtractSectionsFromText(song.text || '');

  if (!sections.length) {
    mapWrap.hidden = true;
    return;
  }

  mapWrap.hidden = false;
  chipsBox.replaceChildren();
  if (summaryEl) summaryEl.textContent = `${sections.length} ท่อน`;

  sections.forEach((sec, idx) => {
    if (idx > 0) {
      chipsBox.appendChild(mk('span', 'roadmapArrow', '➔'));
    }
    const chip = mk('button', 'roadmapChip');
    chip.type = 'button';
    chip.textContent = sec.name;

    if (sec.tag) {
      chip.appendChild(mk('span', 'badge', sec.tag));
    }
    if (sec.cue) {
      chip.appendChild(mk('span', 'roadmapCue', `📢 ${sec.cue}`));
    }

    chip.onclick = () => {
      chipsBox.querySelectorAll('.roadmapChip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (song.text) {
        const needle = sec.name.toLowerCase();
        const headers = Array.from($('#sheet').querySelectorAll('.secBadge, b, .ch'));
        const target = headers.find(h => h.textContent.toLowerCase().includes(needle));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };

    chipsBox.appendChild(chip);
  });
}

$('#prevSongBtn').onclick = () => {
  if (!activeSetlistContext || activeSetlistContext.index <= 0) return;
  activeSetlistContext.index--;
  const prev = activeSetlistContext.songs[activeSetlistContext.index];
  openSong(prev, prev.shift || 0);
};

$('#nextSongBtn').onclick = () => {
  if (!activeSetlistContext || activeSetlistContext.index >= activeSetlistContext.songs.length - 1) return;
  activeSetlistContext.index++;
  const next = activeSetlistContext.songs[activeSetlistContext.index];
  openSong(next, next.shift || 0);
};

let galTok = 0, galUrls = [];
function renderSong(reload = true) {
  if (!current) return;
  const { song, shift } = current;
  const hasImages = !!(song.images && song.images.length);
  // ถ้ามีภาพคอร์ด ให้ตัดเนื้อเพลงที่แนบมาออก ไม่แสดงเนื้อเพลงใต้รูป
  const hasText = !hasImages && !!(song.text && song.text.trim());

  const key = detectKey(song.text) || song.key;
  const flat = preferFlat(key, shift);
  const now = key ? transposeChord(key, shift, flat) : '-';

  $('#cTitle').textContent = song.title;
  $('#cArtist').textContent = song.artist || 'ไม่ระบุศิลปิน';
  $('#cKeyOrig').textContent = key || '-';
  $('#cKeyNow').textContent = now;
  $('#dockKey').textContent = now;
  $('#shiftLabel').textContent = fmtShift(shift);

  const capoStr = getCapoRecommendation(key, now);
  const capoEl = $('#capoHint');
  if (capoStr) {
    capoEl.textContent = capoStr;
    capoEl.hidden = false;
  } else {
    capoEl.hidden = true;
  }

  // Render All Chords Used in This Song Bar
  const chordsBar = $('#songChordsBar');
  if (chordsBar) {
    const baseChords = extractUniqueChordsFromSheet(song.text);
    if (baseChords.length) {
      chordsBar.hidden = false;
      chordsBar.replaceChildren(mk('small', null, `🎸 คอร์ดในเพลง (คีย์ ${now}):`));
      const seenTransposed = new Set();
      for (const ch of baseChords) {
        const tr = transposeChord(ch, shift, flat);
        if (seenTransposed.has(tr)) continue;
        seenTransposed.add(tr);
        const chip = btn(tr, () => showChordPopup(tr), 'chordChip');
        chip.title = `แตะเพื่อฟังเสียงและดูวิธีจับคอร์ด ${tr}`;
        chordsBar.appendChild(chip);
      }
    } else {
      chordsBar.hidden = true;
    }
  }

  $('#sheet').hidden = !hasText;
  $('#tpGrp').hidden = !hasText;
  if (hasText) {
    renderSheet($('#sheet'), song.text, shift, flat);
    applyLyricsVisibility();
  }
  const lyricsToggleBtn = $('#toggleLyricsBtn');
  if (lyricsToggleBtn) lyricsToggleBtn.hidden = !hasText;
  if (reload) loadGallery(song);
  renderSongRoadmap(song);

  const saved = loadBook().some(s => s.id === song.id);
  $('#savedTag').hidden = !saved;
  $('#deleteBtn').hidden = !saved;
  $('#saveBtn').textContent = saved ? '💾 อัปเดตคีย์' : '💾 บันทึกเข้าคลัง';
  $('#saveBtn').hidden = saved && (loadBook().find(s => s.id === song.id)?.shift || 0) === shift;

  paintFav();
  updateSetlistQueueBar();
}

async function loadGallery(song) {
  const tok = ++galTok, g = $('#gallery'), wrap = $('#galleryWrap');
  galUrls.forEach(u => URL.revokeObjectURL(u));
  galUrls = [];
  g.replaceChildren();
  if (!song.images || !song.images.length) {
    if (wrap) wrap.hidden = true;
    g.hidden = true;
    return;
  }
  if (wrap) wrap.hidden = false;
  g.hidden = false;

  for (const id of song.images) {
    if (typeof id === 'string' && (id.startsWith('http://') || id.startsWith('https://') || id.startsWith('data:'))) {
      const im = mk('img', 'sheetImg');
      if (stageInvertImg) im.classList.add('invertFilter');
      im.src = id;
      im.alt = 'ภาพคอร์ด';
      im.onclick = () => openLightbox(id);
      g.appendChild(im);
      continue;
    }
    let b = await getImg(id);
    if (tok !== galTok) return;
    if (!b) {
      g.appendChild(mk('div', 'empty', 'ไม่พบภาพในเครื่อง (อาจลบไปแล้ว)'));
      continue;
    }
    const url = URL.createObjectURL(b);
    galUrls.push(url);
    const im = mk('img', 'sheetImg');
    if (stageInvertImg) im.classList.add('invertFilter');
    im.src = url;
    im.alt = 'ภาพคอร์ด';
    im.onclick = () => openLightbox(url);
    g.appendChild(im);
  }
  applyImgInvertFilter();
}

const setShift = n => {
  current.shift = normShift(n);
  renderSong(false);
};
$('#upBtn').onclick = () => setShift(current.shift + 1);
$('#downBtn').onclick = () => setShift(current.shift - 1);
$('#resetBtn').onclick = () => openDirectKeyPickerModal();

$('#saveBtn').onclick = () => {
  const { song, shift } = current;
  const e = {
    id: song.id,
    title: song.title,
    artist: song.artist || '',
    key: detectKey(song.text) || song.key,
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
  toast(existed ? 'บันทึกคีย์ปัจจุบันแล้ว ✔' : 'บันทึกเข้าคลังเพลงแล้ว ✔');
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

let fs = LS.get(FSK, 1.65);
const applyFs = () => document.documentElement.style.setProperty('--fs', fs + 'rem');
const bumpFs = d => {
  fs = Math.min(3.5, Math.max(0.95, +(fs + d).toFixed(2)));
  applyFs();
  LS.set(FSK, fs);
};
$('#fontUp').onclick = () => bumpFs(0.15);
$('#fontDown').onclick = () => bumpFs(-0.15);
applyFs();

function setFocus(on) {
  document.body.classList.toggle('focus', on);
  $('#exitFocus').hidden = !on;
  if ($('#stageQuickSearchBtn')) $('#stageQuickSearchBtn').hidden = !on;
  if (on) {
    scrollTo(0, 0);
    requestWakeLock();
  }
}
$('#focusBtn').onclick = () => setFocus(true);
$('#exitFocus').onclick = () => setFocus(false);

const SPEEDS = [['1x (ช้า)', 18, '1x'], ['2x (กลาง)', 32, '2x'], ['3x (เร็ว)', 55, '3x'], ['4x (ไว)', 85, '4x']];
let spIdx = 1, scrolling = false, lastT = 0, acc = 0;
$('#speedBtn').textContent = SPEEDS[spIdx][2];

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
  $('#scrollBtn').textContent = on ? '⏸ หยุด' : '⏬ เลื่อน';
  if (on) {
    lastT = performance.now();
    acc = 0;
    requestAnimationFrame(tick);
  }
}
$('#scrollBtn').onclick = () => setScroll(!scrolling);
$('#speedBtn').onclick = () => {
  spIdx = (spIdx + 1) % SPEEDS.length;
  $('#speedBtn').textContent = SPEEDS[spIdx][2];
  toast(`ความเร็วเลื่อนอัตโนมัติ: ${SPEEDS[spIdx][0]}`);
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

addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    openQuickSongSwitcherModal();
    return;
  }
  if (document.body.dataset.view !== 'song') return;
  if (e.code === 'Space') {
    e.preventDefault();
    setScroll(!scrolling);
  } else if (e.code === 'ArrowRight' && activeSetlistContext) {
    $('#nextSongBtn').click();
  } else if (e.code === 'ArrowLeft' && activeSetlistContext) {
    $('#prevSongBtn').click();
  }
});

/* ==============================================================================
 * 11) เพิ่ม / แก้ไขเพลง, ดูตัวอย่างคอร์ดสด (Live Preview), จัดท่อนเพลง & OCR
 * ============================================================================== */
let editingId = null, edImgs = [], edRemoved = [], edSections = [];

function switchEditorMode(mode) {
  $('#tabEditBtn').classList.toggle('active', mode === 'edit');
  if ($('#tabSectionsBtn')) $('#tabSectionsBtn').classList.toggle('active', mode === 'sections');
  $('#tabPreviewBtn').classList.toggle('active', mode === 'preview');

  $('#fText').hidden = mode !== 'edit';
  if ($('#sectionEditorBox')) $('#sectionEditorBox').hidden = mode !== 'sections';
  $('#livePreviewBox').hidden = mode !== 'preview';

  if (mode === 'sections') {
    if (!edSections.length) {
      edSections = autoExtractSectionsFromText($('#fText').value.trim());
    }
    renderSectionEditorList(edSections);
  } else if (mode === 'preview') {
    const text = $('#fText').value.trim();
    const key = detectKey(text) || $('#fKey').value.trim();
    if (text) {
      renderSheet($('#livePreviewBox'), text, 0, preferFlat(key, 0));
    } else {
      $('#livePreviewBox').innerHTML = `<div class="muted" style="text-align:center; padding:40px 10px">ยังไม่มีข้อความคอร์ด — พิมพ์หรือวางคอร์ดในแท็บแก้ไขข้อความ</div>`;
    }
  }
}

function renderSectionEditorList(sections) {
  const list = $('#sectionCardList');
  if (!list) return;
  list.replaceChildren();

  if (!sections.length) {
    list.innerHTML = `<div class="muted small" style="text-align:center; padding:15px">ยังไม่มีท่อนเพลง — กดปุ่ม “เพิ่มท่อนด่วน” ด้านบน หรือ “✨ สกัดท่อนจากเนื้อเพลง”</div>`;
    return;
  }

  sections.forEach((sec, idx) => {
    const card = mk('div', 'sectionCard');

    const nameInp = mk('input', 'secName');
    nameInp.value = sec.name || '';
    nameInp.placeholder = 'ชื่อท่อน (เช่น Chorus)';
    nameInp.oninput = () => { sec.name = nameInp.value; };

    const tagInp = mk('input', 'secTag');
    tagInp.value = sec.tag || '';
    tagInp.placeholder = 'ซ้ำ (เช่น x2)';
    tagInp.oninput = () => { sec.tag = tagInp.value; };

    const cueInp = mk('input', 'secCue');
    cueInp.value = sec.cue || '';
    cueInp.placeholder = 'โน้ตบอกคิวในวง (เช่น ร้องคู่ / โซโล่ 8 ห้อง)';
    cueInp.oninput = () => { sec.cue = cueInp.value; };

    const actions = mk('div', 'sectionCardActions');
    const moveUpBtn = btn('↑', () => {
      if (idx > 0) {
        [sections[idx - 1], sections[idx]] = [sections[idx], sections[idx - 1]];
        renderSectionEditorList(sections);
      }
    });
    const moveDownBtn = btn('↓', () => {
      if (idx < sections.length - 1) {
        [sections[idx + 1], sections[idx]] = [sections[idx], sections[idx + 1]];
        renderSectionEditorList(sections);
      }
    });
    const dupBtn = btn('⧉', () => {
      sections.splice(idx + 1, 0, { ...sec, id: 'sec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5) });
      renderSectionEditorList(sections);
    });
    const delBtn = btn('✕', () => {
      sections.splice(idx, 1);
      renderSectionEditorList(sections);
    });

    actions.append(moveUpBtn, moveDownBtn, dupBtn, delBtn);
    card.append(nameInp, tagInp, cueInp, actions);
    list.appendChild(card);
  });
}

$('#tabEditBtn').onclick = () => switchEditorMode('edit');
if ($('#tabSectionsBtn')) $('#tabSectionsBtn').onclick = () => switchEditorMode('sections');
$('#tabPreviewBtn').onclick = () => switchEditorMode('preview');
$('#topSaveEditorBtn').onclick = () => $('#editorForm').requestSubmit();

document.querySelectorAll('.addSecBtn').forEach(b => {
  b.onclick = () => {
    const rawName = b.dataset.name;
    const name = rawName === 'Custom' ? (prompt('ชื่อท่อน (เช่น Hook, ท่อนแยก)') || 'ท่อนใหม่') : rawName;
    edSections.push({
      id: 'sec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      name,
      tag: name.toLowerCase().includes('chorus') ? 'x2' : '',
      cue: ''
    });
    renderSectionEditorList(edSections);
  };
});

if ($('#autoExtractSectionsBtn')) {
  $('#autoExtractSectionsBtn').onclick = () => {
    edSections = autoExtractSectionsFromText($('#fText').value);
    renderSectionEditorList(edSections);
    toast('สกัดโครงสร้างท่อนจากเนื้อเพลงเรียบร้อย ✔');
  };
}

async function openEditor(song, prefill = '') {
  const keep = song && (song.id.startsWith('u-') || song.id.startsWith('sh-') || loadBook().some(s => s.id === song.id));
  editingId = keep ? song.id : null;
  edImgs = [];
  edRemoved = [];
  edSections = song && song.sections && song.sections.length
    ? JSON.parse(JSON.stringify(song.sections))
    : autoExtractSectionsFromText(song ? song.text || '' : '');

  $('#editorTitle').textContent = song ? 'แก้ไขเพลง' : 'เพิ่มเพลงใหม่';
  $('#fTitle').value = song ? song.title : prefill;
  $('#fArtist').value = song ? song.artist || '' : '';
  $('#fKey').value = song ? (detectKey(song.text) || song.key || '') : '';
  $('#fText').value = song ? song.text || '' : '';
  $('#fUrl').value = song ? song.src || '' : '';
  switchEditorMode('edit');
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
    }, 'delImgBtn');

    const ocrBtn = btn('🔍 สแกน', () => {
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
  if (n) toast(`แนบ ${n} ภาพแล้ว (กด “🔍 สแกน” บนภาพเพื่อแปลงเป็นข้อความได้)`);
}

$('#fImgs').onchange = async e => {
  const f = [...e.target.files];
  e.target.value = '';
  await addImageFiles(f);
};

$('#pasteImgBtn').onclick = async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast('กดค้างที่ช่องข้อความแล้วเลือก “วาง” หรือเลือกรูปจากเครื่อง');
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
    toast('อ่านคลิปบอร์ดไม่ได้ — ลองเลือกรูปจากปุ่ม “📁 เลือกรูปภาพ”');
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

$('#formatTextBtn').onclick = () => {
  const currentText = $('#fText').value;
  if (!currentText.trim()) {
    toast('ยังไม่มีข้อความคอร์ดในช่อง');
    return;
  }
  $('#fText').value = smartFormatChordSheet(currentText, false);
  const actualKey = detectKey($('#fText').value);
  if (actualKey) $('#fKey').value = actualKey;
  if (!$('#livePreviewBox').hidden) switchEditorMode('preview');
  toast('✨ จัดระเบียบชื่อท่อนเพลงและซิงก์คีย์เรียบร้อย ✔');
};

$('#convertBracketBtn').onclick = () => {
  const currentText = $('#fText').value;
  if (!currentText.trim()) {
    toast('ยังไม่มีข้อความคอร์ดในช่อง');
    return;
  }
  $('#fText').value = smartFormatChordSheet(currentText, true);
  if (!$('#livePreviewBox').hidden) switchEditorMode('preview');
  toast('🔤 แปลงคอร์ดเป็น [G]เนื้อเพลง เรียบร้อย (คอร์ดไม่เพี้ยนบนมือถือ) ✔');
};

async function runOcrOnImage(blob) {
  modal('🔍 AI สแกนคอร์ดจากภาพ', (box, close) => {
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

      const detected = detectKey($('#fText').value);
      if (detected) $('#fKey').value = detected;
      toast('สแกนเสร็จสิ้น — นำเข้าเนื้อเพลงและคอร์ดแล้ว ✔');
    }).catch(err => {
      statusText.textContent = 'เกิดข้อผิดพลาดในการสแกน: ' + (err.message || err);
      statusText.className = 'err';
    });
  });
}

$('#ocrScanBtn').onclick = () => {
  if (!edImgs.length) {
    $('#fImgs').click();
    toast('เลือกรูปภาพคอร์ดที่ต้องการสแกน');
    return;
  }
  runOcrOnImage(edImgs[0].blob);
};

$('#editorForm').onsubmit = async e => {
  e.preventDefault();
  let text = $('#fText').value.replace(/\s+$/, '');
  if (!text.trim() && !edImgs.length) {
    toast('ใส่ข้อความคอร์ด หรือแนบรูปคอร์ดอย่างน้อย 1 อย่าง', true);
    return;
  }

  const sheetKey = detectKey(text);
  const keyRaw = $('#fKey').value.trim();
  const finalKey = isChord(keyRaw) ? keyRaw : (sheetKey || '');

  const song = {
    id: editingId || 'u-' + Date.now(),
    title: $('#fTitle').value.trim(),
    artist: $('#fArtist').value.trim(),
    key: finalKey,
    text,
    images: edImgs.map(i => i.id),
    sections: edSections,
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
  toast('บันทึกเพลงเรียบร้อย ✔');
};

$('#addBtn').onclick = () => openEditor(null, $('#q').value.trim());
$('#pasteBtn').onclick = async () => {
  const clip = navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject();
  openEditor(null, $('#q').value.trim());
  try {
    const t = (await clip).trim();
    if (!t) {
      toast('คลิปบอร์ดว่างเปล่า — วางข้อความหรือเลือกรูปคอร์ดได้เลย');
      return;
    }
    if (/^https?:\/\/\S+$/.test(t) || /^\d{3,6}$/.test(t)) {
      $('#fUrl').value = t;
      importFromUrl();
    } else {
      const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
      if (!$('#fTitle').value && lines.length && !isChordLine(lines[0]) && lines[0].length < 45) {
        const { title, artist } = parseTitleAndArtist(lines[0]);
        if (title) $('#fTitle').value = title;
        if (artist) $('#fArtist').value = artist;
      }
      $('#fText').value = smartFormatChordSheet(t, false);
      const guessedKey = detectKey($('#fText').value);
      if (guessedKey) $('#fKey').value = guessedKey;
      toast(`วางและวิเคราะห์คีย์จากคอร์ดในเพลง (${guessedKey || 'อัตโนมัติ'}) เรียบร้อย ✔`);
    }
  } catch {
    toast('กดค้างในช่องข้อความแล้วเลือก “วาง” ได้เลย');
    $('#fText').focus();
  }
};

async function importFromUrl() {
  let url = $('#fUrl').value.trim();
  const b = $('#fetchUrlBtn');
  if (/^\d{3,6}$/.test(url)) {
    url = `https://chordtabs.in.th/${url}/`;
    $('#fUrl').value = url;
  }
  if (!/^https?:\/\//.test(url)) {
    toast('วางลิงก์ https://chordtabs.in.th/… หรือรหัสเพลงก่อนครับ', true);
    return;
  }
  b.disabled = true;
  const old = b.textContent;
  b.textContent = 'กำลังดึง…';
  try {
    if (url.includes('chordtabs.in.th')) {
      const loaded = await loadRealWebChordResult({ url, title: '', artist: '', id: 'imp-' + Date.now() }, []);
      if (loaded.title) $('#fTitle').value = loaded.title;
      if (loaded.artist) $('#fArtist').value = loaded.artist;
      if (loaded.key) $('#fKey').value = loaded.key;
      if (loaded.text) $('#fText').value = loaded.text;
      if (loaded.sections && loaded.sections.length) {
        edSections = loaded.sections;
        renderSectionEditorList(edSections);
      }
      if (loaded.images && loaded.images.length) {
        for (const id of loaded.images) {
          const blob = await getImg(id);
          if (blob) {
            edImgs.push({ id, blob, url: URL.createObjectURL(blob), isNew: false });
          } else if (typeof id === 'string' && (id.startsWith('http://') || id.startsWith('https://'))) {
            edImgs.push({ id, url: id, isNew: false });
          }
        }
        renderThumbs();
      }
      toast(`ดึงรูปคอร์ด “${loaded.title}” จาก Chordtabs สำเร็จแล้ว ✔`);
      return;
    }

    const html = await fetchPageWithFallbacks(url);
    const { rawTitle, text } = extractChordTextFromHtml(html);
    const { title, artist } = parseTitleAndArtist(rawTitle, url);

    if (title && !$('#fTitle').value) $('#fTitle').value = title;
    if (artist && !$('#fArtist').value) $('#fArtist').value = artist;
    const formatted = smartFormatChordSheet(text, false);
    $('#fText').value = formatted;
    edSections = autoExtractSectionsFromText(formatted);
    renderSectionEditorList(edSections);

    const trueKey = detectKey(formatted);
    if (trueKey) $('#fKey').value = trueKey;

    toast(`ดึงคอร์ดจริงและคีย์ต้นฉบับ (Key ${trueKey || '-'}) เรียบร้อยแล้ว ✔`);
  } catch {
    toast('เว็บปลายทางติดระบบป้องกันบอท — คัดลอกเนื้อเพลงมาวางแทนได้ครับ', true);
  } finally {
    b.disabled = false;
    b.textContent = old;
  }
}

$('#fetchUrlBtn').onclick = importFromUrl;
$('#fUrl').addEventListener('paste', () => setTimeout(() => {
  const val = $('#fUrl').value.trim();
  if (/^https?:\/\//.test(val) || /^\d{3,6}$/.test(val)) importFromUrl();
}, 60));

/* ==============================================================================
 * 12) ระบบบัญชีไฮบริด (Hybrid Cloud + Local Account) & ตัวตรวจสอบสถานะ Supabase
 * ============================================================================== */
let sb = null, user = null, syncing = false, status = '', sbErr = '';
const conf = () => {
  const s = LS.get(K.cfg, {});
  return { url: s.url || CFG.url || '', key: s.key || CFG.key || '' };
};
const getPls = () => LS.get(K.pls, []), setPls = p => LS.set(K.pls, p);
const getMeta = () => LS.get(K.meta, { songs: {}, pls: {} });
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
  bar.style.marginBottom = '10px';
  bar.append(mk('h2', null, title), btn('✕', () => ov.remove(), 'small iconBtn'));
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

  const savedLocal = LS.get(K.localUser, null);
  if (savedLocal) {
    user = savedLocal;
  }

  if (!window.supabase) {
    sbErr = 'ไลบรารีคลาวด์ไม่พร้อม — ใช้งานโหมดบัญชีในเครื่องได้ตามปกติ';
    paintAcct();
    return;
  }
  if (!c.url || !c.key) {
    sbErr = 'ยังไม่ได้ตั้งค่า Supabase URL / Key';
    paintAcct();
    return;
  }
  try {
    sb = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    sb.auth.onAuthStateChange((_e, s) => {
      if (s && s.user) {
        user = s.user;
        LS.set(K.localUser, null);
        paintAcct();
        setTimeout(syncAll, 0);
      } else if (!LS.get(K.localUser, null)) {
        user = null;
        paintAcct();
      }
    });
  } catch (e) {
    sb = null;
    sbErr = 'ตั้งค่าไม่ถูกต้อง: ' + e.message;
  }
  paintAcct();
}

const setStatus = s => {
  status = s;
  paintAcct();
};

function paintAcct() {
  let t = '👤 เข้าสู่ระบบ';
  if (user) {
    const name = (user.email || 'นักดนตรี').split('@')[0];
    const badge = user.isLocal ? '📱' : ({ ok: '☁️✓', sync: '☁️⟳', err: '📱', off: '⚡' }[status] || '☁️');
    t = `${badge} ${name}`;
  }
  $('#acct').textContent = t;
}
$('#acct').onclick = () => openAcct();

function signInLocalProfile(email) {
  const cleanEmail = (email || 'musician@local').trim();
  const localProfile = {
    id: 'local-' + hash(cleanEmail),
    email: cleanEmail,
    isLocal: true,
    createdAt: Date.now()
  };
  LS.set(K.localUser, localProfile);
  user = localProfile;
  setStatus('ok');
  paintAcct();
}

function openAcct() {
  modal('👤 บัญชีผู้ใช้ & ตั้งค่า Supabase', box => {
    const body = mk('div');
    box.appendChild(body);
    const draw = () => {
      body.replaceChildren();

      const pwaBox = mk('div', 'installBanner');
      pwaBox.append(
        mk('div', null, '📲 ติดตั้งแอปลงจอมือถือ/แท็บเล็ต (ใช้งานออฟไลน์ 100%)'),
        btn('วิธีติดตั้ง', installPWA, 'primary small')
      );
      body.appendChild(pwaBox);

      const accTitle = mk('label', null, '👤 บัญชีผู้ใช้งาน');
      accTitle.style.marginTop = '4px';
      body.appendChild(accTitle);

      if (user) {
        const userCard = mk('div', 'card');
        userCard.style.padding = '14px';
        const modeBadge = user.isLocal
          ? `<span class="badge green">📱 โหมดโปรไฟล์ในเครื่อง (พร้อมใช้งาน & แชร์เซ็ตเพลงได้ทันที)</span>`
          : `<span class="badge">☁️ เชื่อมต่อบัญชีคลาวด์ Supabase แล้ว</span>`;

        userCard.innerHTML = `
          <div style="font-weight:700; font-size:1.05rem; margin-bottom:6px">${user.email}</div>
          <div style="margin-bottom:12px">${modeBadge}</div>
        `;

        const btnRow = mk('div', 'row');
        if (!user.isLocal && sb) {
          btnRow.appendChild(
            btn('🔄 ซิงก์คลาวด์ตอนนี้', async () => {
              await syncAll();
              toast('ซิงก์ข้อมูลเรียบร้อย ✔');
            }, 'primary small')
          );
        }
        btnRow.appendChild(
          btn('⬇ สำรองไฟล์เพลงทั้งหมด', () => $('#exportBtn').click(), 'small')
        );
        btnRow.appendChild(
          btn('ออกจากระบบ', async () => {
            if (sb && !user.isLocal) await sb.auth.signOut().catch(() => {});
            LS.set(K.localUser, null);
            LS.set(K.meta, { songs: {}, pls: {} });
            user = null;
            paintAcct();
            draw();
            toast('ออกจากระบบแล้ว');
          }, 'danger small')
        );
        userCard.appendChild(btnRow);
        body.appendChild(userCard);
      } else {
        const em = mk('input');
        em.type = 'email';
        em.placeholder = 'ชื่อผู้ใช้ หรือ อีเมล (เช่น guitarist@band.com)';
        em.autocapitalize = 'none';
        em.autocomplete = 'email';

        const pw = mk('input');
        pw.type = 'password';
        pw.placeholder = 'รหัสผ่าน (6 ตัวขึ้นไป หรือเว้นว่างหากใช้เฉพาะในเครื่อง)';
        pw.autocomplete = 'current-password';

        const msg = mk('div', 'err');
        const b1 = btn('เข้าสู่ระบบ / เริ่มใช้งาน', () => go(false), 'primary small');
        const b2 = btn('สมัครบัญชีคลาวด์', () => go(true), 'small');

        const go = async up => {
          msg.style.color = '';
          msg.textContent = '';
          const rawIdentity = em.value.trim();
          if (!rawIdentity) {
            msg.textContent = 'กรุณาใส่ชื่อผู้ใช้หรืออีเมล';
            em.focus();
            return;
          }
          const emailVal = rawIdentity.includes('@') ? rawIdentity : `${rawIdentity}@mellowchords.local`;

          if (!pw.value || !sb) {
            signInLocalProfile(emailVal);
            toast('เข้าสู่ระบบเรียบร้อย ✔');
            draw();
            return;
          }

          if (pw.value.length < 6) {
            msg.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
            return;
          }

          b1.disabled = b2.disabled = true;
          msg.style.color = 'var(--muted)';
          msg.textContent = 'กำลังตรวจสอบเซิร์ฟเวอร์ Supabase…';

          try {
            const c = { email: emailVal, password: pw.value };
            const authPromise = up ? sb.auth.signUp(c) : sb.auth.signInWithPassword(c);
            const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error('CLOUD_TIMEOUT')), 4500));
            const { data, error } = await Promise.race([authPromise, timeoutPromise]);

            msg.style.color = '';
            if (error) {
              if (/fetch|network|502|503|timeout|load failed/i.test(error.message || '')) {
                signInLocalProfile(emailVal);
                toast('เข้าสู่ระบบในโหมดโปรไฟล์เครื่องเรียบร้อย ✔ (Supabase พักอยู่)');
                draw();
                return;
              }
              msg.textContent = error.message;
              return;
            }

            if (data && data.session) {
              user = data.session.user;
              LS.set(K.localUser, null);
              paintAcct();
              toast('เข้าสู่ระบบคลาวด์ Supabase สำเร็จ ✔');
              draw();
            } else {
              signInLocalProfile(emailVal);
              toast('เข้าสู่ระบบพร้อมใช้งานทันที ✔');
              draw();
            }
          } catch (e) {
            signInLocalProfile(emailVal);
            toast('เข้าสู่ระบบในโหมดโปรไฟล์เครื่องเรียบร้อย ✔');
            draw();
          } finally {
            b1.disabled = b2.disabled = false;
          }
        };

        const btnWrap = mk('div', 'row');
        btnWrap.append(b1, b2);
        body.append(em, pw, msg, btnWrap);
      }

      const guideDetails = mk('details');
      guideDetails.innerHTML = `
        <summary>💡 วิธีเปิดใช้งาน Supabase Cloud Sync (เช็คจุดที่ต้องเปิด)</summary>
        <div class="small" style="line-height:1.55; margin-top:8px; color:#d4d4d8">
          <p style="margin:0 0 8px">โปรเจกต์ Supabase ในโค้ดปัจจุบัน (<code>otbfzxypqyzobglbdrxp</code>) ตอบกลับเป็น <b>HTTP 502 (Paused)</b> เนื่องจากไม่ได้ใช้งานเกิน 7 วัน วิธีเปิดใช้งานมี 3 ขั้นตอนครับ:</p>
          <ol style="padding-left:20px; margin:0">
            <li><b>ปลุกโปรเจกต์ (Restore Project):</b> เข้าเว็บ <a href="https://supabase.com/dashboard/project/otbfzxypqyzobglbdrxp" target="_blank" rel="noopener" style="color:var(--accent)">Supabase Dashboard</a> → กดปุ่ม <b>“Restore project”</b> (หรือสร้างโปรเจกต์ใหม่) แล้วรอประมาณ 1–2 นาที</li>
            <li><b>เปิดระบบสมัครและล็อกอินด้วยอีเมล:</b> ไปที่เมนูซ้าย <b>Authentication → Providers → Email</b>:
              <ul style="padding-left:18px; margin:4px 0">
                <li>เปิด <b>Enable Email provider</b> = ON</li>
                <li>ปิด <b>Confirm email</b> = OFF (เพื่อให้สมัครแล้วล็อกอินเข้าใช้งานได้ทันทีโดยไม่ต้องรอกดลิงก์ในอีเมล)</li>
              </ul>
            </li>
            <li><b>กรณีสร้างโปรเจกต์ Supabase ใหม่:</b> ไปที่ <b>Project Settings (รูปเฟือง) → API</b> แล้วคัดลอก <b>Project URL</b> กับ <b>anon public key</b> มาใส่ในช่องตั้งค่าด้านล่างนี้</li>
          </ol>
        </div>
      `;
      body.appendChild(guideDetails);

      const advDetails = mk('details');
      const proxyInput = mk('input');
      proxyInput.placeholder = 'Custom Proxy URL เช่น https://xxx.workers.dev/?url={url}';
      proxyInput.value = LS.get(PROXY, '') || '';
      proxyInput.onchange = e => {
        LS.set(PROXY, e.target.value.trim());
        toast('บันทึก Proxy แล้ว');
      };

      const u = mk('input'), k = mk('input');
      u.placeholder = 'Supabase Project URL (https://xxxx.supabase.co)';
      u.value = conf().url;
      k.placeholder = 'Supabase anon public key';
      k.value = conf().key;

      advDetails.append(
        mk('summary', null, '🛠️ เปลี่ยน Project URL / Key ของ Supabase & ตั้งค่า Proxy'),
        mk('label', null, 'Supabase Project URL & anon key'),
        u,
        k,
        mk('label', null, 'Custom CORS Proxy'),
        proxyInput,
        btn('บันทึกการตั้งค่าเซิร์ฟเวอร์', () => {
          LS.set(K.cfg, { url: u.value.trim(), key: k.value.trim() });
          initClient();
          paintAcct();
          draw();
          toast('บันทึกการตั้งค่าเซิร์ฟเวอร์แล้ว ✔');
        }, 'small primary')
      );
      body.appendChild(advDetails);
    };
    draw();
  });
}

const BUCKET = 'chord-images';
async function getImg(id) {
  let b = await idbGet(id).catch(() => null);
  if (!b && sb && user && !user.isLocal) {
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
  if (!sb || !user || user.isLocal) return;
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
  if (!sb || !user || user.isLocal || !ids || !ids.length) return;
  sb.storage.from(BUCKET).remove(ids.map(i => user.id + '/' + i + '.jpg')).catch(() => {});
}

function needsSync() {
  if (!sb || !user || user.isLocal) return false;
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
  if (!sb || !user || user.isLocal || syncing) return;
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
    console.warn('[Sync] Cloud unavailable, running in local mode:', e);
    setStatus('err');
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
 * 13) เซ็ตเพลง / Playlist & แชร์ลิงก์แบบไม่ต้องง้อเซิร์ฟเวอร์
 * ============================================================================== */
function encodePlaylistSharePayload(plName, songs) {
  const payload = {
    n: plName,
    s: songs.map(s => ({
      i: s.id,
      t: s.title,
      a: s.artist || '',
      k: detectKey(s.text) || s.key || '',
      x: s.text || '',
      h: s.shift || 0
    }))
  };
  const jsonStr = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(jsonStr);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePlaylistSharePayload(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  return {
    name: obj.n || 'เซ็ตเพลงที่แชร์มา',
    songs: (obj.s || []).map(x => ({
      id: x.i || 's-' + Math.random().toString(36).slice(2, 7),
      title: x.t,
      artist: x.a,
      key: x.k,
      text: x.x,
      shift: x.h || 0
    }))
  };
}

function normalizePlItem(it) {
  if (!it) return { id: 'it-' + Math.random().toString(36).slice(2, 7), type: 'song', songId: '' };
  if (typeof it === 'string') return { id: 'it-' + hash(it), type: 'song', songId: it, targetKey: '', singer: '', bpm: '', cue: '' };
  return {
    id: it.id || ('it-' + hash(it.songId || it.title || Math.random())),
    type: it.type || 'song',
    songId: it.songId || '',
    targetKey: it.targetKey || '',
    singer: it.singer || '',
    bpm: it.bpm || '',
    cue: it.cue || '',
    title: it.title || ''
  };
}

function encodePlaylistSharePayload(plName, songs, rawItems = []) {
  const payload = {
    n: plName,
    s: songs.map(s => ({
      i: s.id,
      t: s.title,
      a: s.artist || '',
      k: detectKey(s.text) || s.key || '',
      x: s.text || '',
      h: s.shift || 0,
      c: s.cue || '',
      sec: s.sections || []
    })),
    it: rawItems
  };
  const jsonStr = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(jsonStr);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePlaylistSharePayload(b64) {
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  return {
    name: obj.n || 'สคริปต์เพลงที่แชร์มา',
    songs: (obj.s || []).map(x => ({
      id: x.i || 's-' + Math.random().toString(36).slice(2, 7),
      title: x.t,
      artist: x.a,
      key: x.k,
      text: x.x,
      shift: x.h || 0,
      cue: x.c || '',
      sections: x.sec || []
    })),
    rawItems: obj.it || []
  };
}

function createPlaylist(name, songIds = []) {
  const normIds = songIds.map(normalizePlItem);
  const p = { id: crypto.randomUUID(), name, songIds: normIds, shared: false, token: null, updatedAt: Date.now() };
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
  const n = (prompt('ตั้งชื่อสคริปต์เล่นสด / Setlist (เช่น เล่นสดคืนวันศุกร์, เซ็ต 1 ร้านชิล)') || '').trim();
  if (n) createPlaylist(n);
};

function renderPlaylists() {
  const P = getPls(), box = $('#plList');
  $('#plCount').textContent = P.length;
  box.replaceChildren();
  if (!P.length) {
    const empty = mk('div', 'empty');
    empty.innerHTML = `<b>🎼</b>ยังไม่มีเซ็ตสคริปต์เพลง — กด <b>“＋ สร้างเซ็ตใหม่”</b> หรือ <b>“📥 นำเข้าสคริปต์วง”</b> เพื่อจัดลำดับเพลงขึ้นเล่นสด`;
    box.appendChild(empty);
    return;
  }
  for (const p of P) {
    const row = mk('div', 'item'), b = mk('button', 'open'), t = mk('div', 't', p.name);
    const count = (p.songIds || []).filter(i => (typeof i === 'string' ? true : i.type !== 'break')).length;
    t.appendChild(mk('span', 'badge dim', count + ' เพลง'));
    if (p.shared) t.appendChild(mk('span', 'badge', 'แชร์ลิงก์'));
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
  let songs = [], p = null, items = [];

  if (curPl.shared) {
    $('#plTitle').textContent = '🎼 ' + curPl.data.name + ' (แชร์มา)';
    songs = curPl.data.songs.map(s => ({
      id: 'sh-' + (curPl.token || 'link').slice(0, 6) + '-' + s.id,
      title: s.title,
      artist: s.artist,
      key: detectKey(s.text) || s.key,
      text: s.text,
      shift: s.shift || 0,
      cue: s.cue || '',
      sections: s.sections || []
    }));
    bar.append(
      btn('▶️ เริ่มเล่นเซ็ตนี้', () => {
        if (!songs.length) return;
        activeSetlistContext = { plId: 'shared', name: curPl.data.name, songs, index: 0 };
        openSong(songs[0], songs[0].shift || 0);
      }, 'primary small'),
      btn('💾 บันทึกทั้งเซ็ตเข้าคลังของฉัน', importShared, 'small')
    );
  } else {
    p = getPls().find(x => x.id === curPl.id);
    if (!p) {
      show('home', false);
      return;
    }
    $('#plTitle').textContent = '🎼 ' + p.name;
    const book = loadBook();
    const allLookup = [...book];
    items = (p.songIds || []).map(normalizePlItem);

    // Build playable songs list
    songs = [];
    items.forEach(it => {
      if (it.type === 'break') {
        songs.push({
          type: 'break',
          id: it.id,
          title: it.title || 'ช่วงพูดคุย / พักเบรก',
          cue: it.cue || ''
        });
        return;
      }
      let found = allLookup.find(s => s.id === it.songId);
      if (!found && it.title) found = it;
      if (found) {
        songs.push({
          ...found,
          targetKey: it.targetKey || found.targetKey || '',
          singer: it.singer || found.singer || '',
          bpm: it.bpm || found.bpm || '',
          cue: it.cue || found.cue || '',
          itemId: it.id
        });
      }
    });

    const playableOnly = songs.filter(s => s.type !== 'break');

    if (playableOnly.length) {
      bar.append(
        btn('▶️ เริ่มเล่นเซ็ตนี้', () => {
          activeSetlistContext = { plId: p.id, name: p.name, songs: playableOnly, index: 0 };
          const first = playableOnly[0];
          let startShift = first.shift || 0;
          if (first.targetKey) {
            const origKey = detectKey(first.text) || first.key;
            if (origKey) {
              const diff = noteIndex(first.targetKey.replace(/m$/, '')) - noteIndex(origKey.replace(/m$/, ''));
              startShift = normShift(diff);
            }
          }
          openSong(first, startShift);
        }, 'primary small')
      );
    }

    bar.append(
      btn('📢 + เพิ่มช่วงพูด/พักเบรก', () => openAddBreakModal(p.id), 'small'),
      btn('📦 ส่งสคริปต์ให้เพื่อนในวง', () => exportBandScriptPackage(p.id), 'small primary'),
      btn('✏️ เปลี่ยนชื่อ', () => {
        const n = (prompt('ชื่อเซ็ตใหม่', p.name) || '').trim();
        if (n) {
          mutPl(p.id, x => { x.name = n; });
          renderPlView();
        }
      }, 'small'),
      btn(p.shared ? '🔗 แชร์อยู่' : '🔗 สร้างลิงก์แชร์', () => sharePlaylist(p.id), 'small'),
      btn('🗑 ลบเซ็ต', () => delPlaylist(p.id), 'danger small')
    );

    if (p.shared) {
      const encodedData = encodePlaylistSharePayload(p.name, playableOnly, items);
      const link = location.origin + location.pathname + '#/s/' + encodedData;
      const inp = mk('input');
      inp.readOnly = true;
      inp.value = link;
      inp.style.flex = '1';
      lk.className = 'plLink';
      lk.append(
        inp,
        btn('📤 คัดลอก/ส่งลิงก์', () => shareLink(p, link), 'primary small'),
        btn('🚫 ปิดแชร์', () => {
          mutPl(p.id, x => { x.shared = false; });
          renderPlView();
        }, 'small')
      );
    }
  }

  if (!songs.length) {
    box.appendChild(mk('div', 'empty', 'ยังไม่มีเพลงในสคริปต์นี้ — เปิดเพลงแล้วกดปุ่ม “➕ เซ็ตเพลง” หรือเพิ่มช่วงพูดคุย'));
    return;
  }

  let songIndex = 0;
  songs.forEach((s, idx) => {
    if (s.type === 'break') {
      const breakCard = mk('div', 'plBreakCard');
      const left = mk('div', 'row');
      left.style.gap = '10px';
      left.style.alignItems = 'center';
      const bTitleWrap = mk('div');
      bTitleWrap.appendChild(mk('b', null, s.title));
      if (s.cue) {
        bTitleWrap.appendChild(mk('div', 'small muted', `📢 ${s.cue}`));
      }
      left.append(mk('span', 'plBreakIcon', '🎙️'), bTitleWrap);

      const actions = mk('div', 'itemActions');
      const curPlIndex = p ? p.songIds.findIndex(x => {
        const norm = normalizePlItem(x);
        return norm.id === s.id;
      }) : -1;
      const targetPlIdx = curPlIndex >= 0 ? curPlIndex : idx;

      const mv = d => {
        if (!p) return;
        mutPl(p.id, x => {
          const j = targetPlIdx + d;
          if (j >= 0 && j < x.songIds.length) [x.songIds[targetPlIdx], x.songIds[j]] = [x.songIds[j], x.songIds[targetPlIdx]];
        });
        renderPlView();
      };
      actions.append(
        btn('↑', () => mv(-1)),
        btn('↓', () => mv(1)),
        btn('✕', () => {
          if (!p) return;
          mutPl(p.id, x => { x.songIds.splice(targetPlIdx, 1); });
          renderPlView();
        })
      );

      breakCard.append(left, actions);
      box.appendChild(breakCard);
      return;
    }

    songIndex++;
    const row = mk('div', 'plItemCard');
    const topRow = mk('div', 'plItemTop');

    const mainBtn = mk('button', 'plItemMainBtn');
    mainBtn.type = 'button';
    const titleWrap = mk('div', 'row');
    titleWrap.style.gap = '8px';
    titleWrap.style.alignItems = 'center';

    const t = mk('b', null, `${songIndex}. ${s.title}`);
    const origK = (s.text ? detectKey(s.text) : '') || s.key || '';
    titleWrap.append(t);

    if (origK) titleWrap.appendChild(mk('span', 'badge', `Key ${origK}`));
    if (s.targetKey && s.targetKey !== origK) {
      titleWrap.appendChild(mk('span', 'badge green', `เล่นจริง: ${s.targetKey}`));
    }
    if (s.images && s.images.length) {
      titleWrap.appendChild(mk('span', 'badge', '🖼️ คอร์ดภาพ'));
    }

    mainBtn.append(titleWrap, mk('div', 'small muted', s.artist || 'ไม่ระบุศิลปิน'));

    const openThisSong = () => {
      const playableOnly = songs.filter(x => x.type !== 'break');
      const playIdx = playableOnly.findIndex(x => (x.itemId && s.itemId ? x.itemId === s.itemId : x.id === s.id));
      activeSetlistContext = {
        plId: p ? p.id : 'shared',
        name: p ? p.name : curPl.data.name,
        songs: playableOnly,
        index: playIdx >= 0 ? playIdx : 0
      };

      let startShift = typeof s.shift === 'number' && !isNaN(s.shift) ? s.shift : 0;
      if (s.targetKey && origK) {
        startShift = calcKeyShift(origK, s.targetKey);
      }
      openSong(s, startShift);
    };

    mainBtn.onclick = (e) => {
      e.stopPropagation();
      openThisSong();
    };

    row.onclick = (e) => {
      if (e.target.closest('.itemActions') || e.target.closest('button')) return;
      openThisSong();
    };

    topRow.appendChild(mainBtn);

    if (p) {
      const actions = mk('div', 'itemActions');
      const curPlItem = items.find(it => (it.id && s.itemId ? it.id === s.itemId : it.songId === s.id)) || items[idx] || {};
      const curPlIndex = p.songIds.findIndex(x => {
        const norm = normalizePlItem(x);
        return (norm.id && s.itemId ? norm.id === s.itemId : norm.songId === s.id);
      });
      const targetPlIdx = curPlIndex >= 0 ? curPlIndex : idx;

      const mv = d => {
        mutPl(p.id, x => {
          const j = targetPlIdx + d;
          if (j >= 0 && j < x.songIds.length) [x.songIds[targetPlIdx], x.songIds[j]] = [x.songIds[j], x.songIds[targetPlIdx]];
        });
        renderPlView();
      };
      const editCueBtn = btn('✏️ สคริปต์/คีย์', () => openEditPlaylistItemModal(p.id, curPlItem, s), 'small secondary');
      actions.append(
        editCueBtn,
        btn('↑', () => mv(-1)),
        btn('↓', () => mv(1)),
        btn('✕', () => {
          mutPl(p.id, x => { x.songIds.splice(targetPlIdx, 1); });
          renderPlView();
        })
      );
      topRow.appendChild(actions);
    }
    row.appendChild(topRow);

    // Cue Info Sub-bar
    const cuesRow = mk('div', 'plItemCues');
    if (s.singer) cuesRow.appendChild(mk('span', 'cuePill', `🎤 ร้อง: ${s.singer}`));
    if (s.bpm) cuesRow.appendChild(mk('span', 'cuePill', `⏱️ ${s.bpm} BPM`));
    if (s.cue) cuesRow.appendChild(mk('span', 'cuePill', `📢 ${s.cue}`));
    if (!s.singer && !s.bpm && !s.cue) {
      cuesRow.appendChild(mk('span', 'small muted', '💡 แตะ “✏️ สคริปต์/คีย์” เพื่อนัดแนะคีย์, ผู้ร้อง และคิวในวง'));
    }
    row.appendChild(cuesRow);

    box.appendChild(row);
  });
}

function openEditPlaylistItemModal(plId, item, song) {
  modal(`✏️ ตั้งค่าคิวสด: ${song.title}`, (box, close) => {
    const origKey = detectKey(song.text) || song.key || 'C';

    const form = mk('div');
    form.innerHTML = `
      <div class="row" style="margin-top:0">
        <div class="grow" style="min-width:140px">
          <label style="margin-top:0">คีย์ที่วงเล่นจริง (ออริจินอล: ${origKey})</label>
          <input id="cueKeyInp" placeholder="เช่น ${origKey}" value="${item.targetKey || origKey}" autocapitalize="characters">
        </div>
        <div class="grow" style="min-width:120px">
          <label style="margin-top:0">ผู้ร้องนำ</label>
          <input id="cueSingerInp" placeholder="เช่น บอย, เมย์" value="${item.singer || ''}">
        </div>
        <div style="width:105px">
          <label style="margin-top:0">จังหวะ (BPM)</label>
          <input id="cueBpmInp" type="number" placeholder="เช่น 100" value="${item.bpm || ''}">
        </div>
      </div>
      <label style="margin-top:10px">📢 โน้ตบอกคิวเล่นสด / สคริปต์ส่งเพลงในวง</label>
      <textarea id="cueNoteInp" rows="3" placeholder="เช่น ส่งไม้กลอง 4 จังหวะ, จบแล้วต่อเพลงซมซานทันที (Medley), ท่อนฮุกรอบสุดท้ายดรอปเครื่อง">${item.cue || ''}</textarea>
    `;

    const saveBtn = btn('💾 บันทึกคิวนี้', () => {
      const targetKey = $('#cueKeyInp').value.trim();
      const singer = $('#cueSingerInp').value.trim();
      const bpm = $('#cueBpmInp').value.trim();
      const cue = $('#cueNoteInp').value.trim();

      mutPl(plId, x => {
        const it = x.songIds.find(i => (typeof i === 'string' ? i : i.id) === item.id || (i.songId && i.songId === song.id));
        if (it) {
          if (typeof it === 'string') {
            const idx = x.songIds.indexOf(it);
            x.songIds[idx] = { id: 'it-' + hash(it), type: 'song', songId: it, targetKey, singer, bpm, cue };
          } else {
            it.targetKey = targetKey;
            it.singer = singer;
            it.bpm = bpm;
            it.cue = cue;
          }
        }
      });
      close();
      renderPlView();
      toast('บันทึกคิวและคีย์เรียบร้อย ✔');
    }, 'primary');
    saveBtn.style.width = '100%';
    saveBtn.style.marginTop = '12px';

    box.append(form, saveBtn);
  });
}

function openAddBreakModal(plId) {
  modal('📢 เพิ่มช่วงพูดคุย / พักเบรกในสคริปต์', (box, close) => {
    const form = mk('div');
    form.innerHTML = `
      <label style="margin-top:0">ชื่อช่วงกิจกรรม *</label>
      <input id="brkTitleInp" placeholder="เช่น ช่วงทักทายคนดู & แนะนำวง (3 นาที)" value="ช่วงพูดคุย / แนะนำวง">
      <label style="margin-top:10px">โน้ตบอกคิวในวง (ไม่บังคับ)</label>
      <textarea id="brkCueInp" rows="2" placeholder="เช่น เปิดเพลงคลอเบาๆ, นักร้องนำพูดขอบคุณร้าน"></textarea>
    `;

    const addBtn = btn('➕ เพิ่มลงในสคริปต์', () => {
      const title = $('#brkTitleInp').value.trim() || 'ช่วงพูดคุย / พักเบรก';
      const cue = $('#brkCueInp').value.trim();
      mutPl(plId, x => {
        x.songIds.push({
          id: 'brk-' + Date.now(),
          type: 'break',
          title,
          cue
        });
      });
      close();
      renderPlView();
      toast('เพิ่มช่วงพักเบรกในสคริปต์แล้ว ✔');
    }, 'primary');
    addBtn.style.width = '100%';
    addBtn.style.marginTop = '12px';

    box.append(form, addBtn);
  });
}

// ส่งออกแพ็กเกจสคริปต์วง (.mellow / .json) พร้อมรูปคอร์ดออฟไลน์ 100% ส่งเข้า LINE / AirDrop ได้ทันที
async function exportBandScriptPackage(plId) {
  const p = getPls().find(x => x.id === plId);
  if (!p) return;
  const book = loadBook();
  const allLookup = [...book];
  const items = (p.songIds || []).map(normalizePlItem);
  const bundleSongs = [];

  for (const it of items) {
    if (it.type === 'break') continue;
    const s = allLookup.find(x => x.id === it.songId);
    if (!s) continue;
    const songObj = { ...s };
    if (s.images && s.images.length) {
      songObj.imagesData = [];
      for (const imgId of s.images) {
        const blob = await getImg(imgId);
        if (blob) {
          songObj.imagesData.push({ id: imgId, data: await blobToDataURL(blob) });
        }
      }
    }
    bundleSongs.push(songObj);
  }

  const pkg = {
    type: 'mellowchords-band-package',
    version: 1,
    playlist: p,
    songs: bundleSongs,
    exportedAt: new Date().toISOString()
  };

  const fileName = `band-script-${p.name.replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_')}.mellow`;
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const file = new File([blob], fileName, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `สคริปต์เล่นสด: ${p.name}` });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }

  const a = mk('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`สร้างไฟล์สคริปต์วง “${p.name}” พร้อมรูปคอร์ดออฟไลน์เรียบร้อย ✔`);
}

// นำเข้าแพ็กเกจสคริปต์วงจากเพื่อน (.mellow / .json)
async function importBandScriptPackage(file) {
  try {
    const text = await file.text();
    const pkg = JSON.parse(text);
    if (!pkg || !pkg.playlist || !Array.isArray(pkg.songs)) {
      toast('ไฟล์สคริปต์วงไม่ถูกต้อง', true);
      return;
    }
    const book = loadBook();
    const map = new Map(book.map(s => [s.id, s]));
    let imgCount = 0;

    for (const s of pkg.songs) {
      if (!s || !s.id) continue;
      const { imagesData, ...cleanSong } = s;
      if (imagesData && imagesData.length) {
        for (const im of imagesData) {
          try {
            const resp = await fetch(im.data);
            const blob = await resp.blob();
            await idbPut(im.id, blob);
            imgCount++;
          } catch {}
        }
      }
      map.set(String(s.id), { ...cleanSong, id: String(s.id) });
    }
    saveBook([...map.values()]);

    const pls = getPls();
    const existingIdx = pls.findIndex(p => p.id === pkg.playlist.id);
    if (existingIdx >= 0) {
      pls[existingIdx] = pkg.playlist;
    } else {
      pls.push(pkg.playlist);
    }
    setPls(pls);
    renderSongbook();
    renderPlaylists();
    openPlaylist(pkg.playlist.id);
    toast(`นำเข้าสคริปต์ “${pkg.playlist.name}” (${pkg.songs.length} เพลง, ${imgCount} รูปคอร์ด) สำเร็จแล้ว ✔`);
  } catch (err) {
    toast('นำเข้าไฟล์สคริปต์ไม่สำเร็จ', true);
  }
}

if ($('#plImportBandBtn')) {
  $('#plImportBandBtn').onclick = () => $('#importBandFile').click();
}
if ($('#importBandFile')) {
  $('#importBandFile').onchange = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importBandScriptPackage(f);
  };
}

function delPlaylist(id) {
  if (!confirm('ลบเซ็ตเพลงนี้? (เพลงในคลังหลักจะไม่ถูกลบ)')) return;
  setPls(getPls().filter(p => p.id !== id));
  renderPlaylists();
  schedSync();
  show('playlists', false);
}

$('#plBtn').onclick = () => {
  const song = current.song;
  if (!loadBook().some(s => s.id === song.id)) $('#saveBtn').click();
  modal('➕ เพิ่มเพลงเข้าสคริปต์ / Setlist', box => {
    const body = mk('div');
    box.appendChild(body);
    const draw = () => {
      body.replaceChildren();
      const pls = getPls();
      if (!pls.length) {
        body.appendChild(mk('p', 'muted small', 'ยังไม่มีเซ็ตสคริปต์เพลง กดปุ่มด้านล่างเพื่อสร้างเซ็ตแรกได้เลย'));
      }
      for (const p of pls) {
        const inn = (p.songIds || []).some(i => (typeof i === 'string' ? i : i.songId) === song.id);
        const b = btn((inn ? '✅ ' : '⬜ ') + p.name + ` (${p.songIds.length})`, () => {
          mutPl(p.id, x => {
            x.songIds = inn
              ? x.songIds.filter(i => (typeof i === 'string' ? i : i.songId) !== song.id)
              : [...x.songIds, { id: 'it-' + Date.now(), type: 'song', songId: song.id, targetKey: song.key || '', singer: '', bpm: 100, cue: '' }];
          });
          draw();
        });
        b.style.cssText = 'display:flex;justify-content:flex-start;width:100%;margin:6px 0';
        body.appendChild(b);
      }
      const newBtn = btn('＋ สร้างเซ็ตเพลงใหม่พร้อมเพิ่มเพลงนี้', () => {
        const n = (prompt('ชื่อเซ็ตสคริปต์ใหม่') || '').trim();
        if (n) {
          createPlaylist(n, [{ id: 'it-' + Date.now(), type: 'song', songId: song.id, targetKey: song.key || '', singer: '', bpm: 100, cue: '' }]);
          draw();
          toast(`เพิ่มเข้าสคริปต์ “${n}” แล้ว ✔`);
        }
      }, 'primary');
      newBtn.style.width = '100%';
      newBtn.style.marginTop = '10px';
      body.appendChild(newBtn);
    };
    draw();
  });
};

async function sharePlaylist(id) {
  mutPl(id, p => {
    p.shared = true;
    p.token = p.token || (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  });
  renderPlView();
  toast('สร้างลิงก์แชร์เซ็ตเพลงเรียบร้อย ✔ กด “📤 คัดลอก/ส่งลิงก์” ได้เลย');
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
    toast('คัดลอกลิงก์แชร์แล้ว ✔ ส่งให้เพื่อนในวงได้เลย');
  } catch {
    prompt('คัดลอกลิงก์นี้', link);
  }
}

async function openShared(token) {
  if (!sb) {
    toast('ลิงก์นี้ต้องการการเชื่อมต่อเซิร์ฟเวอร์', true);
    return;
  }
  const { data, error } = await sb.rpc('get_shared_playlist', { p_token: token });
  if (error || !data) {
    toast('ไม่พบเซ็ตเพลงนี้ หรือเจ้าของปิดการแชร์แล้ว', true);
    return;
  }
  curPl = { shared: true, data, token };
  show('playlist');
  renderPlView();
}

function importShared() {
  const { data, token } = curPl, book = loadBook(), have = new Set(book.map(s => s.id)), ids = [];
  for (const s of data.songs) {
    const id = 'sh-' + (token || 'set').slice(0, 6) + '-' + s.id;
    ids.push(id);
    if (!have.has(id)) {
      book.push({
        id,
        title: s.title,
        artist: s.artist,
        key: detectKey(s.text) || s.key,
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
  toast('บันทึกทั้งเซ็ตเพลงเข้าคลังแล้ว ✔');
  if (location.hash.startsWith('#/p/') || location.hash.startsWith('#/s/')) {
    history.replaceState(history.state, '', location.pathname);
  }
  curPl = { id: p.id };
  renderPlView();
}

function route() {
  const selfMatch = location.hash.match(/^#\/s\/([A-Za-z0-9_-]+)/);
  if (selfMatch) {
    try {
      const data = decodePlaylistSharePayload(selfMatch[1]);
      curPl = { shared: true, data, token: selfMatch[1].slice(0, 8) };
      show('playlist');
      renderPlView();
      return;
    } catch {
      toast('ลิงก์แชร์เซ็ตเพลงไม่ถูกต้อง', true);
    }
  }

  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  if (m) openShared(m[1]);
}

/* ==============================================================================
 * 14) PWA Controller & Service Worker
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
              toast('💡 อัปเดตแอปเป็นเวอร์ชันใหม่แล้ว');
            }
          });
        });
      }).catch(() => {});
    });
  }

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
    toast('🎉 ติดตั้งแอปลงเครื่องเรียบร้อยแล้ว!');
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
    modal('📲 วิธีติดตั้งแอปลงมือถือ / แท็บเล็ต', (box, close) => {
      const info = mk('div');
      info.innerHTML = `
        <p style="margin-top:0">เมื่อติดตั้งแล้ว แอปจะเปิดแบบ<b>เต็มจอไร้แถบเบราว์เซอร์</b> และ<b>เปิดดูคอร์ดออฟไลน์ได้ 100%</b>:</p>
        <div class="card" style="padding:12px; margin-bottom:10px">
          <b style="color:var(--accent)">🍎 สำหรับ iPhone / iPad (Safari)</b>
          <ol style="margin:6px 0 0; padding-left:20px; font-size:0.92rem">
            <li>แตะปุ่ม <b>แชร์ (Share ⎙)</b> ที่แถบด้านล่างหรือมุมบนของ Safari</li>
            <li>เลื่อนลงมาแล้วเลือก <b>“เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)</b></li>
            <li>กด <b>“เพิ่ม” (Add)</b> แล้วเปิดแอปจากไอคอนบนหน้าจอโฮมได้เลย</li>
          </ol>
        </div>
        <div class="card" style="padding:12px; margin-bottom:14px">
          <b style="color:var(--ok)">🤖 สำหรับ Android / Chrome</b>
          <ol style="margin:6px 0 0; padding-left:20px; font-size:0.92rem">
            <li>แตะเมนู <b>⋮ (มุมขวาบน)</b> ของเบราว์เซอร์ Chrome</li>
            <li>เลือก <b>“ติดตั้งแอป” (Install app)</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></li>
          </ol>
        </div>
      `;
      const okBtn = btn('เข้าใจแล้ว', close, 'primary');
      okBtn.style.width = '100%';
      box.append(info, okBtn);
    });
  }
}

const pwaBtn = $('#pwaInstallHeaderBtn');
if (pwaBtn) pwaBtn.onclick = installPWA;


/* ==============================================================================
 * 14.5) โหมดค้นหาเพลงต่อไปด่วน (Next Song Quick Switcher จากทุกหน้า)
 * ============================================================================== */
function openQuickSongSwitcherModal(initialQuery = '') {
  modal('🔍 ค้นหาและเปลี่ยนเพลงต่อไปทันที', (box, close) => {
    box.classList.add('quickSwitcherBox');

    const contextBanner = mk('div', 'qsContextBanner');
    if (activeSetlistContext && activeSetlistContext.songs && activeSetlistContext.songs.length) {
      const curIdx = activeSetlistContext.index;
      const total = activeSetlistContext.songs.length;
      contextBanner.innerHTML = `
        <div class="qsContextTitle">🎼 เซ็ตเพลง: <b>${escapeHtml(activeSetlistContext.name)}</b> (เพลงที่ ${curIdx + 1}/${total})</div>
        <small class="muted">แตะเพลงถัดไปในเซ็ต หรือค้นหาเพลงใหม่เพื่อเปลี่ยนเพลงทันที</small>
      `;
    } else if (current && current.song) {
      contextBanner.innerHTML = `
        <div class="qsContextTitle">🎸 เพลงปัจจุบัน: <b>${escapeHtml(current.song.title)}</b></div>
        <small class="muted">แตะเพลงด้านล่าง หรือพิมพ์ค้นหาเพื่อเล่นเพลงต่อไปทันที</small>
      `;
    } else {
      contextBanner.innerHTML = `
        <div class="qsContextTitle">🎵 ค้นหาเพลงที่ต้องการเล่น</div>
        <small class="muted">พิมพ์ชื่อเพลงเพื่อเปิดคอร์ดทันที</small>
      `;
    }

    const searchWrap = mk('div', 'searchWrap');
    searchWrap.style.margin = '10px 0 8px';
    const sIcon = mk('span', 'sIcon', '🔍');
    const input = mk('input');
    input.type = 'search';
    input.id = 'qsModalInput';
    input.placeholder = 'พิมพ์ชื่อเพลงที่ต้องการเล่นต่อ…';
    input.value = initialQuery;
    input.autocomplete = 'off';
    input.autocapitalize = 'none';

    const clearBtn = mk('button', 'clearBtn', '✕');
    clearBtn.type = 'button';
    clearBtn.hidden = !initialQuery;
    clearBtn.onclick = () => {
      input.value = '';
      clearBtn.hidden = true;
      renderQsResults('');
      input.focus();
    };

    searchWrap.append(sIcon, input, clearBtn);

    const resultsContainer = mk('div', 'qsResultsContainer');
    let qsWebDeb = null, qsWebSeq = 0;

    function renderQsResults(qStr) {
      const q = qStr.trim().toLowerCase();
      resultsContainer.replaceChildren();

      const savedBook = loadBook();
      const allKnown = [...savedBook];

      if (!q) {
        // 1. Show upcoming in current setlist if inside setlist
        if (activeSetlistContext && activeSetlistContext.songs && activeSetlistContext.songs.length) {
          const songs = activeSetlistContext.songs;
          const curIdx = activeSetlistContext.index;
          const upcoming = songs.map((s, idx) => ({ ...s, origIdx: idx })).filter(x => x.origIdx !== curIdx);

          if (upcoming.length) {
            const setHeader = mk('div', 'qsSecHeader', `🎼 เพลงในเซ็ตลิสต์นี้ (${upcoming.length} เพลง):`);
            resultsContainer.appendChild(setHeader);

            for (const s of upcoming) {
              const card = mk('button', 'qsItem' + (s.origIdx === curIdx + 1 ? ' qsNextInQueue' : ''));
              card.type = 'button';
              const isNext = s.origIdx === curIdx + 1;
              const titleDiv = mk('div', 'qsTitleRow');
              titleDiv.innerHTML = `
                <b class="qsTitle">${s.origIdx + 1}. ${escapeHtml(s.title)}</b>
                ${s.key ? `<span class="badge">Key ${s.key}</span>` : ''}
                ${s.targetKey && s.targetKey !== s.key ? `<span class="badge green">เล่นจริง: ${s.targetKey}</span>` : ''}
                ${isNext ? '<span class="badge accent">⏭ คิวต่อไป</span>' : ''}
                ${s.cue ? `<span class="badge dim">📢 ${escapeHtml(s.cue)}</span>` : ''}
              `;

              const playIcon = mk('span', 'qsPlayAction', '▶️ เล่นทันที');
              card.append(titleDiv, playIcon);

              card.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                activeSetlistContext.index = s.origIdx;
                let startShift = typeof s.shift === 'number' ? s.shift : 0;
                if (s.targetKey && s.key) {
                  startShift = calcKeyShift(s.key, s.targetKey);
                }
                close();
                openSong(s, startShift);
                toast(`🎶 เปิดเพลง “${s.title}” เรียบร้อย ✔`);
              };

              resultsContainer.appendChild(card);
            }
          }
        }

        // 2. Show library
        const hotHeader = mk('div', 'qsSecHeader', '📚 เพลงในคลังของคุณ:');
        resultsContainer.appendChild(hotHeader);

        if (!allKnown.length) {
          const emptyHint = mk('div', 'muted small');
          emptyHint.style.padding = '8px 4px';
          emptyHint.textContent = 'ยังไม่มีเพลงในคลัง — พิมพ์ชื่อเพลงด้านบนเพื่อค้นหาจากเว็บ';
          resultsContainer.appendChild(emptyHint);
        }

        for (const s of allKnown.slice(0, 15)) {
          const card = mk('button', 'qsItem');
          card.type = 'button';
          const titleDiv = mk('div', 'qsTitleRow');
          titleDiv.innerHTML = `
            <b class="qsTitle">${escapeHtml(s.title)}</b>
            ${s.key ? `<span class="badge">Key ${s.key}</span>` : ''}
            <span class="badge green">💾 ในคลัง</span>
            ${s.images && s.images.length ? '<span class="badge dim">🖼️ คอร์ดภาพ</span>' : ''}
          `;

          const playIcon = mk('span', 'qsPlayAction', '▶️ เล่นทันที');
          card.append(titleDiv, playIcon);

          card.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            activeSetlistContext = null;
            close();
            openSong(s, s.shift || 0);
            toast(`🎶 เปิดเพลง “${s.title}” เรียบร้อย ✔`);
          };

          resultsContainer.appendChild(card);
        }
        return;
      }

      // Filter with query (prioritizing title)
      const tokens = q.split(/\s+/).filter(Boolean);
      const matches = allKnown.filter(s => {
        const full = (s.title + ' ' + (s.artist || '') + ' ' + (s.text || '')).toLowerCase();
        return tokens.every(tok => full.includes(tok));
      });

      matches.sort((a, b) => {
        const aExact = a.title.toLowerCase() === q;
        const bExact = b.title.toLowerCase() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = a.title.toLowerCase().startsWith(q);
        const bStarts = b.title.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.title.localeCompare(b.title, 'th');
      });

      if (matches.length) {
        const header = mk('div', 'qsSecHeader', `🎵 พบ ${matches.length} เพลง:`);
        resultsContainer.appendChild(header);

        for (const s of matches) {
          const card = mk('button', 'qsItem');
          card.type = 'button';
          const isSaved = savedBook.some(x => x.id === s.id);
          const inSetlist = activeSetlistContext && activeSetlistContext.songs.some(x => x.id === s.id);

          const displayTitle = s.artist && !s.title.toLowerCase().includes(s.artist.toLowerCase())
            ? `${s.title} - ${s.artist}`
            : s.title;

          const titleDiv = mk('div', 'qsTitleRow');
          titleDiv.innerHTML = `
            <b class="qsTitle">${escapeHtml(displayTitle)}</b>
            ${s.key ? `<span class="badge">Key ${s.key}</span>` : ''}
            ${inSetlist ? '<span class="badge accent">🎼 ในเซ็ต</span>' : ''}
            <span class="badge ${isSaved ? 'green' : 'dim'}">${isSaved ? '💾 ในคลัง' : '🌐 เว็บ'}</span>
            ${s.images && s.images.length ? '<span class="badge dim">🖼️ คอร์ดภาพ</span>' : ''}
          `;

          const playIcon = mk('span', 'qsPlayAction', '▶️ เล่นทันที');
          card.append(titleDiv, playIcon);

          card.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inSetlist) {
              const idx = activeSetlistContext.songs.findIndex(x => x.id === s.id);
              if (idx >= 0) activeSetlistContext.index = idx;
            } else {
              activeSetlistContext = null;
            }
            close();
            openSong(s, s.shift || 0);
            toast(`🎶 เปิดเพลง “${displayTitle}” เรียบร้อย ✔`);
          };

          resultsContainer.appendChild(card);
        }
      }

      // Always show 1-Tap Web Search & Open Card if searching
      const webActionCard = mk('button', 'qsItem qsWebActionCard');
      webActionCard.type = 'button';
      webActionCard.style.marginTop = matches.length ? '10px' : '0';
      webActionCard.innerHTML = `
        <div class="qsTitleRow">
          <b class="qsTitle">🌐 ดึงคอร์ด “${escapeHtml(qStr)}” จาก Chordtabs และเปิดเล่นทันที</b>
          <span class="badge green">chordtabs.in.th (คอร์ดภาพ)</span>
        </div>
        <span class="qsPlayAction">⚡ เปิดทันที</span>
      `;

      webActionCard.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        webActionCard.disabled = true;
        toast(`⏳ กำลังดึงคอร์ดเพลง “${qStr}” จากเว็บ…`);
        close();

        try {
          const { results: webResults } = await searchRealWebChords(qStr);
          if (webResults && webResults.length) {
            const targetItem = webResults[0];
            try {
              const loaded = await loadRealWebChordResult(targetItem, webResults);
              activeSetlistContext = null;
              openSong(loaded, 0);
              const dispName = loaded.artist && !loaded.title.toLowerCase().includes(loaded.artist.toLowerCase())
                ? `${loaded.title} - ${loaded.artist}`
                : loaded.title;
              toast(`🎶 เปิดเพลง “${dispName}” เรียบร้อย ✔`);
              return;
            } catch {}

            // Direct fallback with targetItem
            activeSetlistContext = null;
            openSong({
              id: targetItem.id,
              title: targetItem.title || qStr,
              artist: targetItem.artist || '',
              key: targetItem.key || 'C',
              text: targetItem.realChords && targetItem.realChords.length
                ? `[Intro]\n${targetItem.realChords.join('   ')}`
                : '',
              images: targetItem.images || [],
              src: targetItem.url || ''
            }, 0);
            const dispFallback = targetItem.artist && !targetItem.title.toLowerCase().includes(targetItem.artist.toLowerCase())
              ? `${targetItem.title} - ${targetItem.artist}`
              : (targetItem.title || qStr);
            toast(`🎶 เปิดเพลง “${dispFallback}” เรียบร้อย ✔`);
            return;
          }
        } catch {}

        // Fallback: always open song sheet for qStr so user is never stuck on previous song!
        activeSetlistContext = null;
        openSong({
          id: 'q-' + Date.now(),
          title: qStr,
          artist: '',
          key: 'C',
          text: '',
          images: [],
          src: ''
        }, 0);
        toast(`🎶 เปิดหน้าคอร์ดเพลง “${qStr}” เรียบร้อย ✔`);
      };

      resultsContainer.appendChild(webActionCard);

      // Live Chordtabs results list inside modal
      if (qStr.trim().length >= 2) {
        const webListWrap = mk('div');
        webListWrap.style.marginTop = '10px';
        webListWrap.innerHTML = `<div class="muted small" style="padding:6px 4px"><span class="spinner"></span> กำลังค้นหาคอร์ดจาก Chordtabs สำหรับ “${escapeHtml(qStr)}”…</div>`;
        resultsContainer.appendChild(webListWrap);

        clearTimeout(qsWebDeb);
        const curTok = ++qsWebSeq;
        qsWebDeb = setTimeout(async () => {
          try {
            const { results: webItems } = await searchRealWebChords(qStr);
            if (curTok !== qsWebSeq) return;
            webListWrap.replaceChildren();
            const onlyWeb = (webItems || []).filter(x => x.source !== 'builtin');
            if (!onlyWeb.length) return;

            webListWrap.appendChild(mk('div', 'qsSecHeader', `🌐 เลือกศิลปินจาก Chordtabs (${onlyWeb.length}):`));
            for (const item of onlyWeb) {
              const wCard = mk('button', 'qsItem');
              wCard.type = 'button';
              const disp = item.artist && !item.title.toLowerCase().includes(item.artist.toLowerCase())
                ? `${item.title} - ${item.artist}`
                : item.title;
              const tRow = mk('div', 'qsTitleRow');
              tRow.innerHTML = `
                <b class="qsTitle">${escapeHtml(disp)}</b>
                ${item.key ? `<span class="badge">Key ${item.key}</span>` : ''}
                <span class="badge green">${escapeHtml(item.domain)}</span>
              `;
              const pAct = mk('span', 'qsPlayAction', '▶️ เปิดคอร์ด');
              wCard.append(tRow, pAct);

              wCard.onclick = async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                wCard.disabled = true;
                pAct.textContent = '⏳ กำลังดึง…';
                toast(`⏳ กำลังดึงรูปคอร์ด “${disp}”…`);
                close();
                try {
                  const loaded = await loadRealWebChordResult(item, onlyWeb);
                  activeSetlistContext = null;
                  openSong(loaded, 0);
                  toast(`🎶 เปิดเพลง “${disp}” เรียบร้อย ✔`);
                } catch {
                  toast('การเชื่อมต่อไปยังเว็บต้นทางติดขัด กรุณาลองใหม่ครับ', true);
                }
              };
              webListWrap.appendChild(wCard);
            }
          } catch {}
        }, 420);
      }
    }

    input.oninput = () => {
      clearBtn.hidden = !input.value.trim();
      renderQsResults(input.value);
    };

    box.append(contextBanner, searchWrap, resultsContainer);
    renderQsResults(initialQuery);
    setTimeout(() => input.focus(), 80);
  });
}
if ($('#hdrSearchBtn')) $('#hdrSearchBtn').onclick = () => openQuickSongSwitcherModal();
if ($('#quickNextSongBtn')) $('#quickNextSongBtn').onclick = () => openQuickSongSwitcherModal();
if ($('#dockSearchBtn')) $('#dockSearchBtn').onclick = () => openQuickSongSwitcherModal();
if ($('#stageQuickSearchBtn')) $('#stageQuickSearchBtn').onclick = () => openQuickSongSwitcherModal();
if ($('#setlistSearchBtn')) $('#setlistSearchBtn').onclick = () => openQuickSongSwitcherModal();
if ($('#setlistInfoTrigger')) $('#setlistInfoTrigger').onclick = () => openQuickSongSwitcherModal();
if ($('#liveCueNextRow')) {
  $('#liveCueNextRow').onclick = () => {
    if (activeSetlistContext && activeSetlistContext.songs && activeSetlistContext.index < activeSetlistContext.songs.length - 1) {
      activeSetlistContext.index++;
      const nextSong = activeSetlistContext.songs[activeSetlistContext.index];
      let startShift = typeof nextSong.shift === 'number' && !isNaN(nextSong.shift) ? nextSong.shift : 0;
      if (nextSong.targetKey && nextSong.key) {
        startShift = calcKeyShift(nextSong.key, nextSong.targetKey);
      }
      openSong(nextSong, startShift);
      toast(`▶️ เปิดเพลงถัดไป: “${nextSong.title}” เรียบร้อย ✔`);
    } else {
      openQuickSongSwitcherModal();
    }
  };
}

/* ==============================================================================
 * 15) การเริ่มต้นระบบ (Initialization)
 * ============================================================================== */
const setHH = () => document.documentElement.style.setProperty('--hh', $('#hdr').offsetHeight + 'px');
addEventListener('resize', setHH);
setHH();

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

window.addEventListener('online', () => {
  toast('⚡ ออนไลน์แล้ว');
  syncAll();
});
window.addEventListener('offline', () => {
  toast('⚡ โหมดออฟไลน์ (เปิดคอร์ดในเครื่องได้ตามปกติ 100%)');
  setStatus('off');
});

initClient();
paintAcct();
renderPlaylists();
renderPopularChips();
renderSongbook();
route();
registerPWA();

if (matchMedia('(min-width: 920px)').matches && !current && !location.hash.startsWith('#/p/') && !location.hash.startsWith('#/s/')) {
  const firstSong = loadBook()[0] || MOCK_DB[0];
  if (firstSong) openSong(firstSong, firstSong.shift || 0);
}

addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncAll();
    if (document.body.dataset.view === 'song') requestWakeLock();
  }
});
setInterval(() => {
  if (document.visibilityState === 'visible') syncAll();
}, 90000);
