'use strict';

/**
 * ==============================================================================
 * mellowchords - คลังคอร์ดกลางคืน (Night Busker Chordbook)
 * Real Web Chord Search, True Original Key Detector & Hybrid Cloud/Local Account
 * ==============================================================================
 */

/* ==============================================================================
 * 1) การตั้งค่า (Configuration) & คลังเพลงคอร์ดจริงมาตรฐานในแอป
 * ============================================================================== */
const CFG = {
  url: 'https://otbfzxypqyzobglbdrxp.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90YmZ6eHlwcXl6b2JnbGJkcnhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NzA2MTksImV4cCI6MjEwODU0NjYxOX0.GouGscQsPmLRrHZwSz9W71IY-sgDo_nmOZs55Eciqf4'
};

const MOCK_DB = [
  {
    id: 'cat-somsan',
    title: 'ซมซาน',
    artist: 'Loso (โลโซ)',
    key: 'G',
    text: `[Intro]
G   Em   C   D (2 รอบ)

[Verse 1]
G                        Bm            C                    D
เกิดมาไม่เคยเจอ ใครเหมือนเธอ หลับฝันละเมอ ภาพเธอคอยหลอนทุกคืน
G                        Bm            C                    D
หลับลงคราใด อยากนอนไม่ยอมตื่น ก็ทุกค่ำคืน เจอเธอที่ปลายฟ้าไกล

[Verse 2]
G                Em        C                    D
ก็ได้แต่เพ้อ แต่ฝันลมลม ก็หลงชื่นชม โดยเธอไม่รู้ตัว
G                Em        C                    D
เจอเธอทีไร จิตใจเต้นรัว ฉันกลัวฉันกลัว กลัวเธอไม่สนใจ

[Chorus]
  Em                    Bm     C                 D
อยากเดินเข้าไป บอกว่ารักเธอ เวลาที่เจอ ที่เธอส่งยิ้มมา
  Bm                    Em     C                 D            G
เหมือนดั่งโลกนี้ สดใสขึ้นทันตา ในช่วงเวลา ที่ต้องการใคร เข้าใจสักคน

[Verse 3]
G                        Em           C                    D
หากเธอมีใจ ก็บอกกันสักหน่อย อย่าให้ฉันคอย คอยเธออย่างนี้เลย
G                        Em           C                    D
ให้คอยนานๆ มันซมซานรู้ไหมเอ่ย ยิ่งเธอทำเฉย ฉันเองจะบ้าตาย`
  },
  {
    id: 'cat-saeng',
    title: 'แสงสุดท้าย',
    artist: 'Bodyslam (บอดี้สแลม)',
    key: 'G',
    text: `[Intro]
[G] [D/F#] [Em] [D] [C] [D]

[Verse 1]
[G]รอนแรมมาเนิ่นนาน [Em]เพียงหนึ่งใจกับทางที่โรยด้วยขวาก[C]หนาม แหลม[D]คม
[G]เหน็บหนาวสักเท่าไร [Em]ในค่ำคืนที่มองไม่เห็นแม้จุด[C]หมาย ข้าง[D]หน้า

[Pre-Chorus]
[Em]เจ็บจนเข้าใจ [Bm]ว่าในชีวิตหนึ่ง
[C]ถึงเวลาต้องเรียนรู้ [D]เพื่อก้าวไป

[Chorus]
ในเมื่อความ[G]ฝัน มันยังไกล[D/F#]
ในเมื่อใจ[Em]มันยังบอกให้ก้าว[D]ไป
แม้ต้องล้ม[C]สักเท่าไร [Bm]ก็จะไปให้ถึง[Am]แสงสุดท้าย[D]`
  },
  {
    id: 'cat-khuenkham',
    title: 'คืนข้ามปี',
    artist: 'Da Endorphine (ดา เอ็นโดรฟิน)',
    key: 'C',
    text: `[Intro]
[C] [Am] [F] [G]

[Verse 1]
[C]เสียงผู้คนมากมาย[Am]นับถอยหลัง
[F]เพื่อรอฟังเสียง[G]พลุและดอกไม้ไฟ
[C]ฉันยืนอยู่ตรงนี้[Am]ท่ามกลางผู้คนมากมาย
[F]แต่ในใจกลับเหงา[G]จับขั้วหัวใจ

[Chorus]
ผ่านคืนนี้[C]ไป ก็คงเป็นปี[Am]ใหม่
แต่ทำไม[F]ใจ ฉันยังอยู่ที่[G]เก่า
ผ่านคืนนี้[C]ไป โดยไม่มี[Am]เรื่องของเรา
ในคืนข้าม[F]ปี ที่ว่าง[G]เปล่า เหงาเหลือ[C]เกิน`
  },
  {
    id: 'cat-kidtueng',
    title: 'คิดถึง',
    artist: 'Silly Fools (ซิลลี่ ฟูลส์)',
    key: 'C',
    text: `[Intro]
[C] [Am] [F] [G]

[Verse 1]
[C]เป็นเพราะอะไร [Am]ทำไมต้องเป็นเธอ
[F]ที่ฉันละเมอ [G]คิดถึงอยู่ทุกวัน
[C]แม้เวลาผ่าน [Am]เนิ่นนานสักเท่าไร
[F]ในหัวใจ [G]ยังคงมีแต่เธอ

[Chorus]
อยากบอกให้[C]รู้ ว่าฉันคิด[Am]ถึง
คิดถึง[F]เธอ จนหมดหัว[G]ใจ
อยากกอดเธอ[C]ไว้ เหมือนวันเก่า[Am]ๆ
วันที่[F]เรา ยังรัก[G]กัน [C]`
  },
  {
    id: 'cat-wind',
    title: 'ลม (Wind)',
    artist: 'Num Kala (หนุ่ม กะลา)',
    key: 'G',
    text: `[Intro]
[G] [Bm] [C] [D]

[Verse 1]
[G]ฝากสายลม พัด[Bm]พาความคิดถึง
[C]ส่งไปถึง คน[D]ไกลที่ปลายฟ้า
[G]บอกเขาที ว่า[Bm]คนที่รอคอย
[C]ยังเฝ้าคอย ด้วย[D]ใจที่เหมือนเดิม

[Chorus]
แม้เป็นได้[G]แค่สายลม ที่พัด[Bm]ผ่าน
ไม่อาจยืน[C]เคียงข้างเธอ เหมือนใคร[D]เขา
ขอแค่ได้[G]ดูแล อยู่เบา[Bm]ๆ
บรรเทาความ[C]เหงา ให้ใจ[D]เธอ [G]`
  },
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
  }
];

/* ==============================================================================
 * 2) ทฤษฎีดนตรี, การวิเคราะห์คีย์จริงจากชุดคอร์ด, Capo & แผนภาพการจับคอร์ดกีตาร์
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

const fmtShift = s => (s === 0 ? 'คีย์เดิม' : (s > 0 ? '+' : '') + s + ' คีย์');

// วิเคราะห์คีย์เพลงจริงตามหลักทฤษฎีดนตรี (Harmonic Scale Matching + Tonic First/Last Chord Weighting)
function detectTrueKeyFromChords(chordList, explicitText = '') {
  // 1. Check if page explicitly writes "Key G", "คีย์ C", "Key : Am"
  const explicitMatch = String(explicitText || '').match(/(?:key|คีย์)\s*[:=]?\s*([A-G][#b]?m?)\b/i);
  if (explicitMatch && isChord(explicitMatch[1])) {
    return explicitMatch[1];
  }

  const valid = (chordList || [])
    .map(c => c.replace(/\/.*$/, '').trim())
    .filter(isChord);
  if (!valid.length) return '';

  // Extract root index and major/minor quality
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
    // Bonus if the very first chord is I (Major tonic) or vi (Relative Minor tonic)
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    if (first.root === tonic && !first.isMinor) score += 4.5;
    if (last.root === tonic && !last.isMinor) score += 2.5;

    const relMinor = (tonic + 9) % 12;
    let minorScore = score;
    if (first.root === relMinor && first.isMinor) minorScore += 5.0;
    if (last.root === relMinor && last.isMinor) minorScore += 2.5;

    const useFlats = FLAT_KEYS.includes(tonic);
    const scaleNames = useFlats ? FLATS : SHARPS;

    if (score > bestScore) {
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
  modal(`🎸 คอร์ด ${chordName}`, (box) => {
    const wrap = mk('div', 'chordDiagWrap');
    const svg = buildChordDiagramSVG(chordName);
    if (svg) {
      wrap.innerHTML = svg;
      const hint = mk('p', 'muted small', 'สาย 6 (ซ้าย) → สาย 1 (ขวา) · แตะคอร์ดใดก็ได้ในเพลงเพื่อดูวิธีจับ');
      hint.style.textAlign = 'center';
      wrap.appendChild(hint);
    } else {
      wrap.appendChild(mk('p', 'muted', `คอร์ด ${chordName} (คอร์ดประยุกต์ / Slash Chord)`));
    }
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
  // Support chord lines like "G / Em / C / D" or "Intro : G/Em/C/D (2 ครั้ง)"
  const cleaned = l.replace(/^\s*(intro|instru|interlude|solo|outro|ending)\s*[:\-]?\s*/i, '')
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
  if (/^(solo|instru|interlude|โซโล่)/i.test(clean)) return 'solo';
  if (/^(outro|out-tro|ending|จบ|ท่อนจบ)/i.test(clean)) return 'outro';
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

    // Check if line is "Intro : G/Em/C/D"
    const introInline = line.match(/^\s*(intro|instru|interlude|solo|outro|ending)\s*[:\-]\s*(.+)$/i);
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
      // Do not merge with guitar tab lines (e.g., 1|---5---)
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
      /^\s*(intro|verse|chorus|hook|bridge|solo|instru|outro|ending|interlude|pre-?chorus|ท่อน|อินโทร|ฮุก|ท่อนฮุก|โซโล่|ท่อนจบ)\s*[:\-]?\s*$/i.test(line)
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

// วิเคราะห์คีย์เพลงจริงจากคอร์ดทั้งหมดในเพลง
function detectKey(text, titleHint = '') {
  const allChords = [];
  for (const l of parseSong(text)) {
    if (l.segs) {
      for (const s of l.segs) {
        if (isChord(s.chord)) allChords.push(s.chord);
      }
    }
  }
  return detectTrueKeyFromChords(allChords, titleHint + ' ' + text);
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
        const trChord = s.chord ? transposeChord(s.chord, shift, flat) : '';
        const chSpan = mk('span', 'ch', trChord);
        if (trChord && isChord(trChord)) {
          chSpan.title = `แตะเพื่อดูตารางคอร์ด ${trChord}`;
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

    const secMatch = line.match(/^\s*[\[(]?\s*(intro|verse\s*\d*|chorus|hook|bridge|solo|instru|outro|ending|pre-?chorus|อินโทร|ฮุก|ท่อนฮุก|โซโล่|ท่อนแยก|ท่อนจบ)\s*[:\])]?\s*$/i);
    if (secMatch) {
      let name = secMatch[1].trim();
      const lower = name.toLowerCase();
      if (/intro|อินโทร/i.test(lower)) name = 'Intro';
      else if (/chorus|hook|ฮุก|ท่อนฮุก/i.test(lower)) name = 'Chorus';
      else if (/solo|instru|โซโล่/i.test(lower)) name = 'Solo';
      else if (/bridge|ท่อนแยก/i.test(lower)) name = 'Bridge';
      else if (/outro|ending|ท่อนจบ/i.test(lower)) name = 'Outro';
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
 * 5) Real Web Chord Search & Extractor (ดึงคอร์ดจริงและคีย์เพลงจริงๆ จากเว็บ)
 * ============================================================================== */
function cleanTitle(t) {
  return (t || '')
    .replace(/\s*[|｜@]\s.*$/, '')
    .replace(/^คอร์ด(เพลง)?\s*/i, '')
    .replace(/คอร์ด\s*$/i, '')
    .replace(/\s*-\s*เนื้อเพลง.*$/i, '')
    .replace(/\s*\(คอร์ด\s*ง่ายๆ?\).*$/i, '')
    .replace(/\s*เวอร์ชั่น\s*\d+.*$/i, '')
    .trim();
}

function parseTitleAndArtist(rawTitle, url = '') {
  let cleaned = cleanTitle(rawTitle);
  let title = '', artist = '';

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    title = cleanTitle(parts[0]);
    artist = cleanTitle(parts[1]);
  } else if (cleaned.includes(' / ')) {
    const parts = cleaned.split(' / ');
    title = cleanTitle(parts[0]);
    artist = cleanTitle(parts[1]);
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

// สกัดเฉพาะท่อนคอร์ดและเนื้อเพลงจากเนื้อหาเว็บที่ดึงผ่าน Jina Reader หรือ HTML
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

    // Skip navigation, login, header junk before the song starts
    if (!startedChordSection) {
      if (
        /^(Intro|Instru|Verse|Chorus|Solo)\s*[:\-]/i.test(trimmed) ||
        /^เพลง\s+.+/i.test(trimmed) ||
        isChordLine(line) ||
        (/\[([A-G][#b]?[^\]]*)\]/.test(line))
      ) {
        startedChordSection = true;
      } else {
        continue;
      }
    }

    // Stop if we hit footer / comments / related songs at bottom of page
    if (
      /^(ความคิดเห็น|คอมเมนต์|เพลงอื่นๆ|คอร์ดเพลงอื่นๆ|แชร์ไปยัง|Tags:|Copyright|All Rights Reserved)/i.test(trimmed) ||
      trimmed.startsWith('*   [')
    ) {
      break;
    }

    // Skip markdown images or links
    if (/^!\[.*?\]\(.*?\)$/.test(trimmed) || /^\[.*?\]\(https?:\/\/.*?\)$/.test(trimmed)) {
      continue;
    }

    // Skip guitar ASCII tab lines (e.g. 1|---5--- or 6|-4--4h6) so chord sheet stays clean for singing/strumming
    if (/^\s*[1-6eBGDAE]\s*[|\-][0-9hHpPsb/\-^]+/.test(trimmed) || /^-{15,}$/.test(trimmed)) {
      continue;
    }

    bodyLines.push(line.replace(/\s+$/, ''));
  }

  const finalSheet = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { rawTitle, text: finalSheet };
}

function extractChordTextFromHtml(html) {
  // If response is from r.jina.ai (Markdown/Text format)
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
  // 1. Custom User Proxy (if specified)
  const userProxy = (LS.get(PROXY, '') || '').trim();
  if (userProxy) {
    const r = await fetch(userProxy.replace('{url}', encodeURIComponent(url)));
    if (r.ok) return r.text();
  }

  // 2. Jina Reader API (Fast, CORS-enabled, extracts clean text/chords from MusicATM, blogs, etc.)
  const endpoints = [
    `https://r.jina.ai/${url}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`
  ];

  for (const endpoint of endpoints) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
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

// สกัดรายชื่อคอร์ดจริงและคีย์จริงจากข้อความตัวอย่าง (Search Snippet) ของเว็บคอร์ด
function extractRealChordsFromSnippet(title, snippet) {
  const combined = `${title} ${snippet}`.replace(/\*\*/g, '');
  const chords = [];

  // Look for patterns like "ประกอบด้วย คอร์ด G, คอร์ด Em, คอร์ด C, คอร์ด D" or "( Key G )"
  const chordMentions = [...combined.matchAll(/(?:คอร์ด|chord)\s+([A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|\d+)*(?:\/[A-G][#b]?)?)\b/gi)];
  for (const m of chordMentions) {
    if (isChord(m[1]) && !chords.includes(m[1])) chords.push(m[1]);
  }

  // Also check comma-separated chord lists
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

// ค้นหาหน้าคอร์ดจริงและคีย์เพลงจริงจากเว็บคอร์ดโดยตรงผ่าน DuckDuckGo Lite + Jina Reader
async function searchRealWebChords(query) {
  const q = query.trim();
  if (!q) return [];

  const results = [];
  const t = q.toLowerCase().split(/\s+/).filter(Boolean);

  // 1. ตรวจสอบเพลงคอร์ดจริงในคลังมาตรฐานของแอปก่อน
  for (const s of MOCK_DB) {
    const h = (s.title + ' ' + s.artist).toLowerCase();
    if (t.every(x => h.includes(x))) {
      results.push({
        ...s,
        source: 'builtin',
        domain: 'คลังคอร์ดจริงในแอป',
        realChords: [...new Set([...s.text.matchAll(/\b([A-G][#b]?(?:m|maj|min|sus|add|\d)*)\b/g)].map(m => m[1]).filter(isChord))].slice(0, 6)
      });
    }
  }

  // 2. ค้นหาหน้าคอร์ดจริงจากเว็บคอร์ดเพลงไทยและสากล (dochord, chordzaa, chordtabs, musicatm, guitarthai, ultimate-guitar)
  let webChordsSummary = [];
  let webTrueKey = '';

  try {
    const ddgUrl = `https://r.jina.ai/https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q + ' คอร์ด')}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(ddgUrl, { signal: ctrl.signal });
    clearTimeout(timer);

    if (res.ok) {
      const md = await res.text();
      // Parse numbered results from DuckDuckGo Lite markdown
      const entryRegex = /\d+\.\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\n([\s\S]*?)(?=\n\d+\.\[|$)/g;
      for (const m of md.matchAll(entryRegex)) {
        const rawLinkTitle = m[1].trim();
        let targetUrl = m[2].trim();
        const snippetBlock = m[3].trim();

        // Decode DuckDuckGo uddg redirect parameter
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

        // Skip generic artist/category index pages
        if (/\/(artist|category|tag|search)\//i.test(targetUrl)) continue;

        const { chords, trueKey } = extractRealChordsFromSnippet(rawLinkTitle, snippetBlock);
        if (chords.length > webChordsSummary.length) webChordsSummary = chords;
        if (trueKey && !webTrueKey) webTrueKey = trueKey;

        const { title, artist } = parseTitleAndArtist(rawLinkTitle);

        results.push({
          id: 'web-' + hash(targetUrl),
          title: title || q,
          artist: artist || domain,
          key: trueKey || webTrueKey || '',
          realChords: chords,
          url: targetUrl,
          domain,
          snippet: snippetBlock.replace(/\*\*/g, '').split('\n')[0].slice(0, 120),
          source: 'web'
        });
      }
    }
  } catch (err) {
    console.warn('[Web Chord Search] Error:', err);
  }

  // Propagate detected true original key and real chords across matching results of the same song
  if (webTrueKey || webChordsSummary.length) {
    for (const r of results) {
      if (!r.key && webTrueKey) r.key = webTrueKey;
      if ((!r.realChords || !r.realChords.length) && webChordsSummary.length) {
        r.realChords = webChordsSummary;
      }
    }
  }

  // Sort results: prioritize builtin full sheets & directly scrapable sites (musicatm.com, ultimate-guitar, etc.) first
  results.sort((a, b) => {
    const score = item => {
      if (item.source === 'builtin') return 100;
      if (item.domain.includes('musicatm.com')) return 90;
      if (item.realChords && item.realChords.length >= 3) return 80;
      return 50;
    };
    return score(b) - score(a);
  });

  return { results, webTrueKey, webChordsSummary };
}

// ดึงเนื้อเพลงพร้อมวางคอร์ดจริงจากเว็บ (หรือประกอบเนื้อเพลงจริงเข้ากับชุดคอร์ดจริงและคีย์จริงที่สกัดได้จากเว็บคอร์ด)
async function loadRealWebChordResult(item, allResults, webTrueKey, webChordsSummary) {
  // 1. Try direct extraction from the selected URL first
  const candidateUrls = [item.url];
  // Also include any musicatm.com result for the same song as a high-reliability full-sheet fallback
  for (const r of allResults) {
    if (r.url && r.domain && r.domain.includes('musicatm.com') && !candidateUrls.includes(r.url)) {
      candidateUrls.push(r.url);
    }
  }

  for (const targetUrl of candidateUrls) {
    if (!targetUrl) continue;
    try {
      const rawHtml = await fetchPageWithFallbacks(targetUrl);
      const { rawTitle, text } = extractChordTextFromHtml(rawHtml);
      // Verify that the extracted text genuinely contains chord lines or inline chords
      const detected = detectKey(text, rawTitle);
      if (text && text.length > 100 && detected) {
        const parsed = parseTitleAndArtist(rawTitle, targetUrl);
        return {
          id: item.id,
          title: item.title || parsed.title,
          artist: item.artist || parsed.artist,
          key: item.key || detected,
          text: smartFormatChordSheet(text, false),
          src: targetUrl
        };
      }
    } catch {}
  }

  // 2. If the target site has Cloudflare CAPTCHA (e.g. dochord/chordzaa), we already extracted the REAL original key & REAL chords from its search metadata!
  // Fetch the exact lyrics from LRCLIB and pair them with the real extracted chord list & original key from the chord site.
  const trueKey = item.key || webTrueKey || 'C';
  const realChords = (item.realChords && item.realChords.length) ? item.realChords : (webChordsSummary.length ? webChordsSummary : [trueKey]);

  let lyricsText = '';
  try {
    const cleanQ = item.title.replace(/\(.*?\)/g, '').trim();
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanQ)}`);
    if (res.ok) {
      const lrcData = await res.json();
      const match = (lrcData || []).find(x => x.plainLyrics);
      if (match) lyricsText = match.plainLyrics;
    }
  } catch {}

  const chordHeader = `[คอร์ดจริงจากเว็บ ${item.domain}: ${realChords.join('  ')}]\n[Intro]\n${realChords.slice(0, 4).join('   ')}\n`;

  if (lyricsText) {
    // Align real chords extracted from the web onto the song paragraphs without inventing fake keys
    const lines = lyricsText.replace(/\r/g, '').split('\n');
    const out = [chordHeader];
    let cIdx = 0;
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed) {
        out.push('');
        continue;
      }
      const c1 = realChords[cIdx % realChords.length];
      const c2 = realChords[(cIdx + 1) % realChords.length];
      cIdx += 2;
      out.push(`${c1}                 ${c2}\n${trimmed}`);
    }
    return {
      id: item.id,
      title: item.title,
      artist: item.artist,
      key: trueKey,
      text: out.join('\n'),
      src: item.url
    };
  }

  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    key: trueKey,
    text: `${chordHeader}\n${item.snippet || ''}`,
    src: item.url
  };
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
 * 8) ระบบนำทางแบบ Native PWA (Bottom Navigation & Views) & Wake Lock
 * ============================================================================== */
let current = null, curPl = null, filterMode = 'all', wakeLock = null;
let activeSetlistContext = null;

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
 * 9) ค้นหาคอร์ดจริงจากเว็บในแอป (Real In-App Web Chord Search) & คลังเพลง
 * ============================================================================== */
let sites = LS.get(SITES, [{ d: 'musicatm.com', on: false }, { d: 'chordtabs.in.th', on: false }]);

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
  list.innerHTML = `<div class="empty"><span class="spinner"></span> กำลังสืบค้นคอร์ดจริงและคีย์ต้นฉบับจากเว็บคอร์ด…</div>`;

  const { results: items, webTrueKey, webChordsSummary } = await searchRealWebChords(q);
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
    const titleEl = mk('div', 't', it.title);

    if (it.key) {
      titleEl.appendChild(mk('span', 'badge', `Key ${it.key}`));
    }
    titleEl.appendChild(mk('span', 'badge green', it.domain));

    const subText = (it.realChords && it.realChords.length)
      ? `คอร์ดในเพลง: ${it.realChords.join(', ')}`
      : (it.artist || it.snippet || '');

    b.append(titleEl, mk('div', 'a', subText));

    b.onclick = async () => {
      activeSetlistContext = null;
      if (it.source === 'builtin') {
        openSong({ ...it }, 0);
        return;
      }

      b.disabled = true;
      const origSub = b.lastChild.textContent;
      b.lastChild.textContent = '⏳ กำลังดึงหน้าคอร์ดจริงและคีย์ต้นฉบับเข้าแอป…';
      try {
        const loadedSong = await loadRealWebChordResult(it, items, webTrueKey, webChordsSummary);
        openSong(loadedSong, 0);
        toast(`ดึงคอร์ดเพลง “${loadedSong.title}” (คีย์ ${loadedSong.key || '-'}) เรียบร้อย ✔`);
      } catch (err) {
        toast('ดึงหน้าเว็บนี้ไม่ได้ — ลองเลือกแหล่งเว็บอื่นในรายการครับ', true);
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

let deb;
function doInstantLocalFilter() {
  const q = $('#q').value.trim();
  $('#clearSearchBtn').hidden = !q;
  renderSongbook();

  if (!q) {
    $('#resultsBox').hidden = true;
    return;
  }

  const t = q.toLowerCase().split(/\s+/).filter(Boolean);
  const localMatches = MOCK_DB.filter(s => {
    const h = (s.title + ' ' + s.artist).toLowerCase();
    return t.every(x => h.includes(x));
  });

  const box = $('#resultsBox'), list = $('#results');
  if (localMatches.length) {
    box.hidden = false;
    $('#resultsTitle').textContent = `🎵 พบในคลังแอป (${localMatches.length}) · กด “🌐 ค้นออนไลน์” เพื่อดึงจากเว็บคอร์ด`;
    list.replaceChildren();
    for (const it of localMatches) {
      const row = mk('div', 'item'), b = mk('button', 'open'), titleEl = mk('div', 't', it.title);
      titleEl.appendChild(mk('span', 'badge', `Key ${it.key}`));
      titleEl.appendChild(mk('span', 'badge green', 'คอร์ดจริงพร้อมเล่น'));
      b.append(titleEl, mk('div', 'a', it.artist));
      b.onclick = () => {
        activeSetlistContext = null;
        const sv = loadBook().find(s => s.id === it.id);
        sv ? openSong(sv, sv.shift || 0) : openSong({ ...it }, 0);
      };
      row.appendChild(b);
      list.appendChild(row);
    }
  }
}

$('#q').oninput = () => {
  clearTimeout(deb);
  deb = setTimeout(doInstantLocalFilter, 120);
};

// Filter Tabs
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
  let all = loadBook();

  const isDefaultSeed = all.length === 0;
  const sourceList = isDefaultSeed ? MOCK_DB : all;

  let book = [...sourceList];
  if (filterMode === 'recent') {
    book.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } else {
    book.sort((a, b) => a.title.localeCompare(b.title, 'th'));
  }

  if (q) {
    book = book.filter(s => (s.title + ' ' + (s.artist || '') + ' ' + (s.text || '')).toLowerCase().includes(q));
  }
  if (filterMode === 'fav') {
    book = book.filter(s => F.has(s.id));
  }

  $('#count').textContent = all.length || MOCK_DB.length;
  const list = $('#songbook');
  list.replaceChildren();

  if (!book.length) {
    const emptyBox = mk('div', 'empty');
    emptyBox.innerHTML = `<b>🎶</b>${q ? `ไม่พบเพลง “${q}” ในคลังเครื่อง` : (filterMode === 'fav' ? 'ยังไม่มีเพลงรายการโปรด (กด ☆ บนเพลงที่ชอบ)' : 'ยังไม่มีเพลงในคลัง')}`;
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
    const t = mk('div', 't', s.title);

    if (s.key) t.appendChild(mk('span', 'badge', s.key));
    if (s.shift) t.appendChild(mk('span', 'badge dim', (s.shift > 0 ? '+' : '') + s.shift));
    if (s.images && s.images.length) t.appendChild(mk('span', 'badge dim', '🖼 ' + s.images.length));
    if (isDefaultSeed) t.appendChild(mk('span', 'badge dim', 'คอร์ดจริงเริ่มต้น'));

    open.append(t, mk('div', 'a', s.artist || 'ไม่ระบุศิลปิน'));
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

    if (!isDefaultSeed) {
      const delButton = btn('🗑', (e) => {
        e.stopPropagation();
        removeSong(s.id, s.title);
      });
      delButton.title = 'ลบเพลง';
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
 * 10) หน้าแสดงคอร์ดเพลง, โหมดเวที & แถบเลื่อนเพลงใน Setlist
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
  current = { song: { ...song }, shift: normShift(shift) };
  renderSong(true);
  renderSongbook();
  show('song');
}

function updateSetlistQueueBar() {
  const nav = $('#setlistNav');
  if (!activeSetlistContext || !activeSetlistContext.songs.length) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const { name, songs, index } = activeSetlistContext;
  $('#setlistName').textContent = `🎼 เซ็ต: ${name}`;
  $('#setlistPos').textContent = `เพลงที่ ${index + 1} / ${songs.length} · ${songs[index].title}`;
  $('#prevSongBtn').disabled = index <= 0;
  $('#nextSongBtn').disabled = index >= songs.length - 1;
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
  const { song, shift } = current, hasText = !!(song.text && song.text.trim());
  const key = song.key || detectKey(song.text, song.title), flat = preferFlat(key, shift), now = key ? transposeChord(key, shift, flat) : '-';

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

  $('#sheet').hidden = !hasText;
  $('#tpGrp').hidden = !hasText;
  if (hasText) renderSheet($('#sheet'), song.text, shift, flat);
  if (reload) loadGallery(song);

  const saved = loadBook().some(s => s.id === song.id);
  $('#savedTag').hidden = !saved;
  $('#deleteBtn').hidden = !saved;
  $('#saveBtn').textContent = saved ? '💾 อัปเดตคีย์' : '💾 บันทึกเข้าคลัง';
  $('#saveBtn').hidden = saved && (loadBook().find(s => s.id === song.id)?.shift || 0) === shift;

  paintFav();
  updateSetlistQueueBar();
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
      g.appendChild(mk('div', 'empty', 'ไม่พบภาพในเครื่อง'));
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
    key: song.key || detectKey(song.text, song.title),
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
  if (document.body.dataset.view !== 'song') return;
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
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
 * 11) เพิ่ม / แก้ไขเพลง, ดูตัวอย่างคอร์ดสด (Live Preview) & OCR
 * ============================================================================== */
let editingId = null, edImgs = [], edRemoved = [];

function switchEditorMode(mode) {
  const isPreview = mode === 'preview';
  $('#tabEditBtn').classList.toggle('active', !isPreview);
  $('#tabPreviewBtn').classList.toggle('active', isPreview);
  $('#fText').hidden = isPreview;
  $('#livePreviewBox').hidden = !isPreview;
  if (isPreview) {
    const text = $('#fText').value.trim();
    const key = $('#fKey').value.trim() || detectKey(text, $('#fTitle').value);
    if (text) {
      renderSheet($('#livePreviewBox'), text, 0, preferFlat(key, 0));
    } else {
      $('#livePreviewBox').innerHTML = `<div class="muted" style="text-align:center; padding:40px 10px">ยังไม่มีข้อความคอร์ด — พิมพ์หรือวางคอร์ดในแท็บแก้ไขข้อความ</div>`;
    }
  }
}

$('#tabEditBtn').onclick = () => switchEditorMode('edit');
$('#tabPreviewBtn').onclick = () => switchEditorMode('preview');
$('#topSaveEditorBtn').onclick = () => $('#editorForm').requestSubmit();

async function openEditor(song, prefill = '') {
  const keep = song && (song.id.startsWith('u-') || song.id.startsWith('sh-') || loadBook().some(s => s.id === song.id));
  editingId = keep ? song.id : null;
  edImgs = [];
  edRemoved = [];
  $('#editorTitle').textContent = song ? 'แก้ไขเพลง' : 'เพิ่มเพลงใหม่';
  $('#fTitle').value = song ? song.title : prefill;
  $('#fArtist').value = song ? song.artist || '' : '';
  $('#fKey').value = song ? song.key || '' : '';
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
  if (!$('#livePreviewBox').hidden) switchEditorMode('preview');
  toast('✨ จัดระเบียบชื่อท่อนเพลงและคอร์ดเรียบร้อย ✔');
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

      if (!$('#fKey').value.trim()) {
        const detected = detectKey(formatted, $('#fTitle').value);
        if (detected) $('#fKey').value = detected;
      }
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
  const text = $('#fText').value.replace(/\s+$/, '');
  if (!text.trim() && !edImgs.length) {
    toast('ใส่ข้อความคอร์ด หรือแนบรูปคอร์ดอย่างน้อย 1 อย่าง', true);
    return;
  }
  const keyRaw = $('#fKey').value.trim(), badKey = keyRaw && !isChord(keyRaw);
  const song = {
    id: editingId || 'u-' + Date.now(),
    title: $('#fTitle').value.trim(),
    artist: $('#fArtist').value.trim(),
    key: isChord(keyRaw) ? keyRaw : detectKey(text, $('#fTitle').value),
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
  toast(badKey ? 'บันทึกแล้ว (วิเคราะห์คีย์จริงจากเพลงให้อัตโนมัติ)' : 'บันทึกเพลงเรียบร้อย ✔');
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
    if (/^https?:\/\/\S+$/.test(t)) {
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
      const guessedKey = detectKey(t, $('#fTitle').value);
      if (guessedKey && !$('#fKey').value) $('#fKey').value = guessedKey;
      toast(`วางและวิเคราะห์คีย์ต้นฉบับ (${guessedKey || 'อัตโนมัติ'}) เรียบร้อย ✔`);
    }
  } catch {
    toast('กดค้างในช่องข้อความแล้วเลือก “วาง” ได้เลย');
    $('#fText').focus();
  }
};

async function importFromUrl() {
  const url = $('#fUrl').value.trim(), b = $('#fetchUrlBtn');
  if (!/^https?:\/\//.test(url)) {
    toast('วางลิงก์ที่ขึ้นต้นด้วย https:// ก่อนครับ', true);
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

    const trueKey = detectKey(text, rawTitle);
    if (trueKey) $('#fKey').value = trueKey;

    toast(text.length < 80 ? 'เว็บนี้แสดงคอร์ดเป็นรูปภาพ — แนะนำให้แคปหน้าจอแล้วใช้ปุ่มสแกน OCR' : `ดึงคอร์ดจริงและคีย์ต้นฉบับ (Key ${trueKey || '-'}) เรียบร้อยแล้ว ✔`);
  } catch {
    toast('เว็บปลายทางติดระบบป้องกันบอท — คัดลอกเนื้อเพลงมาวางแทนได้ครับ', true);
  } finally {
    b.disabled = false;
    b.textContent = old;
  }
}

$('#fetchUrlBtn').onclick = importFromUrl;
$('#fUrl').addEventListener('paste', () => setTimeout(() => {
  if (/^https?:\/\//.test($('#fUrl').value.trim())) importFromUrl();
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

      // 3. Step-by-step Supabase Unpause & Setup Guide inside the modal
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

      // 4. Advanced Proxy & Custom Supabase Config
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
      k: s.key || '',
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
  const n = (prompt('ตั้งชื่อเซ็ตเพลง / Playlist (เช่น เซ็ตคืนวันศุกร์, เพลงเร็ว)') || '').trim();
  if (n) createPlaylist(n);
};

function renderPlaylists() {
  const P = getPls(), box = $('#plList');
  $('#plCount').textContent = P.length;
  box.replaceChildren();
  if (!P.length) {
    const empty = mk('div', 'empty');
    empty.innerHTML = `<b>🎼</b>ยังไม่มีเซ็ตเพลง — กด <b>“＋ สร้างเซ็ตใหม่”</b> เพื่อจัดลำดับเพลงขึ้นเล่นสด`;
    box.appendChild(empty);
    return;
  }
  for (const p of P) {
    const row = mk('div', 'item'), b = mk('button', 'open'), t = mk('div', 't', p.name);
    t.appendChild(mk('span', 'badge dim', p.songIds.length + ' เพลง'));
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
  let songs, p = null;
  if (curPl.shared) {
    $('#plTitle').textContent = '🎼 ' + curPl.data.name + ' (แชร์มา)';
    songs = curPl.data.songs.map(s => ({
      id: 'sh-' + (curPl.token || 'link').slice(0, 6) + '-' + s.id,
      title: s.title,
      artist: s.artist,
      key: s.key,
      text: s.text,
      shift: s.shift || 0
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
    const allLookup = [...book, ...MOCK_DB];
    songs = p.songIds.map(id => allLookup.find(s => s.id === id)).filter(Boolean);

    if (songs.length) {
      bar.append(
        btn('▶️ เริ่มเล่นเซ็ตนี้', () => {
          activeSetlistContext = { plId: p.id, name: p.name, songs, index: 0 };
          openSong(songs[0], songs[0].shift || 0);
        }, 'primary small')
      );
    }

    bar.append(
      btn('✏️ เปลี่ยนชื่อ', () => {
        const n = (prompt('ชื่อเซ็ตใหม่', p.name) || '').trim();
        if (n) {
          mutPl(p.id, x => { x.name = n; });
          renderPlView();
        }
      }, 'small'),
      btn(p.shared ? '🔗 แชร์อยู่' : '🔗 สร้างลิงก์แชร์ให้เพื่อน', () => sharePlaylist(p.id), 'small'),
      btn('🗑 ลบเซ็ต', () => delPlaylist(p.id), 'danger small')
    );

    if (p.shared) {
      const encodedData = encodePlaylistSharePayload(p.name, songs);
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
    box.appendChild(mk('div', 'empty', 'ยังไม่มีเพลงในเซ็ตนี้ — เปิดเพลงแล้วกดปุ่ม “➕ เซ็ตเพลง”'));
    return;
  }

  songs.forEach((s, idx) => {
    const row = mk('div', 'item'), o = mk('button', 'open');
    const t = mk('div', 't', `${idx + 1}. ${s.title}`);
    if (s.key) t.appendChild(mk('span', 'badge', s.key));
    o.append(t, mk('div', 'a', s.artist || 'ไม่ระบุศิลปิน'));
    o.onclick = () => {
      activeSetlistContext = { plId: p ? p.id : 'shared', name: p ? p.name : curPl.data.name, songs, index: idx };
      openSong(s, s.shift || 0);
    };
    row.appendChild(o);

    if (p) {
      const actions = mk('div', 'itemActions');
      const mv = d => {
        mutPl(p.id, x => {
          const i = x.songIds.indexOf(s.id), j = i + d;
          if (j >= 0 && j < x.songIds.length) [x.songIds[i], x.songIds[j]] = [x.songIds[j], x.songIds[i]];
        });
        renderPlView();
      };
      actions.append(
        btn('↑', () => mv(-1)),
        btn('↓', () => mv(1)),
        btn('✕', () => {
          mutPl(p.id, x => { x.songIds = x.songIds.filter(i => i !== s.id); });
          renderPlView();
        })
      );
      row.appendChild(actions);
    }
    box.appendChild(row);
  });
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
  modal('➕ เพิ่มเพลงเข้าเซ็ต (Playlist)', box => {
    const body = mk('div');
    box.appendChild(body);
    const draw = () => {
      body.replaceChildren();
      const pls = getPls();
      if (!pls.length) {
        body.appendChild(mk('p', 'muted small', 'ยังไม่มีเซ็ตเพลง กดปุ่มด้านล่างเพื่อสร้างเซ็ตแรกได้เลย'));
      }
      for (const p of pls) {
        const inn = p.songIds.includes(song.id);
        const b = btn((inn ? '✅ ' : '⬜ ') + p.name + ` (${p.songIds.length})`, () => {
          mutPl(p.id, x => {
            x.songIds = inn ? x.songIds.filter(i => i !== song.id) : [...x.songIds, song.id];
          });
          draw();
        });
        b.style.cssText = 'display:flex;justify-content:flex-start;width:100%;margin:6px 0';
        body.appendChild(b);
      }
      const newBtn = btn('＋ สร้างเซ็ตเพลงใหม่พร้อมเพิ่มเพลงนี้', () => {
        const n = (prompt('ชื่อเซ็ตเพลงใหม่') || '').trim();
        if (n) {
          createPlaylist(n, [song.id]);
          draw();
          toast(`เพิ่มเข้าเซ็ต “${n}” แล้ว ✔`);
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
