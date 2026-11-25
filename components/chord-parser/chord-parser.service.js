(function (global) {
  'use strict';

  /**
   * ============================================================================
   * Mellow Chords — Precision Chord Parser + Dynamic Learning Memory Service
   * - Standardized ChordPro output (`original_key`, `chordpro_content`,
   *   `source_domain`, `is_verified`)
   * - Vision AI client (Supabase Edge Function + Gemini/OpenAI direct + custom)
   *   with Dynamic Few-Shot Prompting from `chord_parser_memory`
   * - Diff-based OCR & Thai syllable alignment learning + auto-pruning (max 10)
   * - Spatial OCR + Thai-syllable ChordPro fallback for 100% offline resilience
   * ============================================================================
   */

  const CACHE_KEY = 'mellowchords.parsedChords.v1';
  const MEMORY_KEY = 'mellowchords.parserMemory.v1';
  const VISION_CFG_KEY = 'mellowchords.visionConfig.v1';
  const MAX_MEMORY_PER_DOMAIN = 10;
  const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

  const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const BASE   = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FLAT_KEYS = [5, 10, 3, 8, 1]; // F, Bb, Eb, Ab, Db

  // Strict chord regex: matches standard, slash & complex chords (C#m7, G/B, F#m7b5, Asus4, C6/9)
  const CHORD_RE =
    /^[A-G][#b]?(?:(?:maj|min|dim|aug|sus|add|m|M)(?:2|4|5|6|7|9|11|13)?|(?:2|4|5|6|7|9|11|13)|(?:6\/9)|[+\-°])*(?:[#b](?:5|9|11|13))*(?:\((?:add|sus|maj|min|dim|aug|no)?[#b+\-\d,/]+\))?(?:\/[A-G][#b]?)?$/;

  // Thai combining characters (vowels/tone marks that have 0 visual width above/below base consonants)
  const THAI_COMBINING_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
  const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;

  // Section header patterns (including ChordPro {comment: ...})
  const CHORDPRO_COMMENT_RE = /^\s*\{\s*(?:comment|c|section)\s*:\s*([^}]+)\}\s*$/i;
  const SECTION_ONLY_RE =
    /^\s*[\[\(\*]*\s*(?:intro|verse\s*\d*|pre[\s-]*chorus\s*\d*|chorus\s*\d*|hook\s*\d*|solo\s*\d*|bridge\s*\d*|outro|ending|interlude|instru(?:ment(?:al)?)?|coda|tag|rap|ท่อน\s*(?:ฮุค|แยก|จบ|อินโทร|โซโล่)?|อินโทร|ฮุค|โซโล่|จบ)\s*[\]\)\*:]*\s*$/i;

  const SECTION_PREFIX_RE =
    /^\s*[\[\(]?\s*(intro|verse\s*\d*|pre[\s-]*chorus\s*\d*|chorus\s*\d*|hook\s*\d*|solo\s*\d*|bridge\s*\d*|outro|ending|interlude|instru(?:ment(?:al)?)?|อินโทร|ฮุค|โซโล่)\s*[\]\)]?\s*[:\-–—/]\s*(.+)$/i;

  // Common Thai chord website headers, watermarks, and metadata lines to strip
  const WATERMARK_LINE_RE =
    /(?:chordtabs\.in\.th|chordzaa|dochord|siamchord|guitarthai|chordhit|https?:\/\/|www\.|\.in\.th|\.com\b|คอร์ดเพลง\s*[:：]?|ศิลปิน\s*[:：]|อัลบั้ม\s*[:：]|ต้นฉบับ\s*[:：]|จังหวะ\s*[:：]|tempo\s*[:：]|tuning\s*[:：]|capo\s*[:：]|key\s*[:：=]|คีย์\s*[:：=]|ตั้งสาย\s*[:：]|กดไลค์|ติดตาม|facebook|youtube|line\s*@)/i;

  const EXPLICIT_KEY_RE = /(?:key|คีย์(?:เดิม|เพลง)?)\s*[:：=]?\s*([A-G][#b♯♭]?m?)\b/i;

  // Non-chord punctuation tokens commonly seen on chord lines (bar lines, repeat markers)
  const CHORD_LINE_DECOR_RE = /^[\|\[\]\(\)\/\\\-–—•·.,:;*~xX0-9]+$/;

  // Exact Vision AI System Prompt Template
  const VISION_SYSTEM_PROMPT_TEMPLATE = [
    'You are an expert Thai music transcriber and OCR specialist.',
    'Your task is to convert the provided chord sheet image into accurate JSON containing the original key and lyrics in ChordPro format.',
    '',
    'STRICT RULES:',
    '1. Alignment: Place every chord in square brackets `[Chord]` IMMEDIATELY BEFORE the exact Thai syllable or character it sits above in the image.',
    '   - Example: If "G" is above the word "รัก", write `[G]รัก` (NOT `[G] รัก` unless there is an actual instrumental pause).',
    '2. Instrumental sections: For Intro, Solo, Interlude, or Outro, keep chords in brackets separated by spaces or bar lines, e.g., `[| C | G/B | Am7 | F |]`',
    '3. Sections: Preserve section headers clearly using `{comment: Intro}`, `{comment: Verse}`, `{comment: Chorus}`, etc.',
    '4. Accuracy: Pay close attention to similar-looking characters in chord sheets:',
    '   - Distinguish `m` vs `M` (minor vs major), `#` vs `b`, `7` vs `1`, `B` vs `8`, `F#m` vs `F#rn`.',
    '   - Do NOT invent, guess, or autocorrect chords that are not visible in the image.',
    '5. Output ONLY valid JSON in this exact schema:',
    '{',
    '  "title": "string",',
    '  "artist": "string",',
    '  "original_key": "string (e.g. C, Gm, F#)",',
    '  "chordpro_content": "string (multiline ChordPro text)"',
    '}',
    '',
    '{{DYNAMIC_LEARNED_RULES_AND_EXAMPLES_FROM_DB}}'
  ].join('\n');

  // Optional Supabase backend hooks configured by app.js
  let backendDeps = {
    getSupabase: function () { return null; },
    getCurrentUser: function () { return null; },
    isCloudActive: function () { return false; }
  };

  function configureBackend(deps) {
    if (!deps || typeof deps !== 'object') return;
    if (typeof deps.getSupabase === 'function') backendDeps.getSupabase = deps.getSupabase;
    if (typeof deps.getCurrentUser === 'function') backendDeps.getCurrentUser = deps.getCurrentUser;
    if (typeof deps.isCloudActive === 'function') backendDeps.isCloudActive = deps.isCloudActive;
  }

  /* ============================================================================
   * 1) Source Domain Detection & Vision Config
   * ============================================================================ */

  function detectSourceDomain(songOrSource) {
    if (!songOrSource) return 'chordtabs';
    if (typeof songOrSource === 'object') {
      if (songOrSource.source_domain && songOrSource.source_domain !== 'unknown') {
        return String(songOrSource.source_domain).trim().toLowerCase();
      }
      if (songOrSource.parsedChordSheet && songOrSource.parsedChordSheet.source_domain && songOrSource.parsedChordSheet.source_domain !== 'unknown') {
        return String(songOrSource.parsedChordSheet.source_domain).trim().toLowerCase();
      }
    }

    const candidates = [];
    if (typeof songOrSource === 'string') {
      candidates.push(songOrSource);
    } else if (typeof songOrSource === 'object') {
      if (songOrSource.src) candidates.push(String(songOrSource.src));
      if (songOrSource.url) candidates.push(String(songOrSource.url));
      if (songOrSource.sourceUrl) candidates.push(String(songOrSource.sourceUrl));
      if (songOrSource._ctSongId) return 'chordtabs';
      if (Array.isArray(songOrSource.images)) {
        for (let i = 0; i < songOrSource.images.length; i++) {
          const im = String(songOrSource.images[i] || '');
          if (im.startsWith('ct-img-')) return 'chordtabs';
          candidates.push(im);
        }
      }
    }

    const joined = candidates.join(' ').toLowerCase();
    if (joined.includes('chordtabs')) return 'chordtabs';
    if (joined.includes('dochord')) return 'dochord';
    if (joined.includes('chordzaa')) return 'chordzaa';
    if (joined.includes('siamchord')) return 'siamchord';
    if (joined.includes('guitarthai')) return 'guitarthai';
    if (joined.includes('musicatm')) return 'musicatm';
    if (/^img-|^data:|^blob:/.test(joined)) return 'upload';
    return 'chordtabs';
  }

  function getVisionConfig() {
    try {
      if (typeof localStorage === 'undefined') return { provider: 'auto', apiKey: '', model: 'gemini-3.8-flash', autoParseOnOpen: true };
      const raw = localStorage.getItem(VISION_CFG_KEY);
      if (!raw) return { provider: 'auto', apiKey: '', model: 'gemini-3.8-flash', autoParseOnOpen: true };
      const parsed = JSON.parse(raw);
      return {
        provider: (parsed && parsed.provider) || 'auto', // 'auto' | 'gemini' | 'openai' | 'edge' | 'ocr'
        apiKey: (parsed && parsed.apiKey) || '',
        model: (parsed && parsed.model) || 'gemini-3.8-flash',
        autoParseOnOpen: parsed && typeof parsed.autoParseOnOpen === 'boolean' ? parsed.autoParseOnOpen : true
      };
    } catch (_e) {
      return { provider: 'auto', apiKey: '', model: 'gemini-3.8-flash', autoParseOnOpen: true };
    }
  }

  function setVisionConfig(cfg) {
    try {
      if (typeof localStorage === 'undefined') return;
      const next = {
        provider: (cfg && cfg.provider) || 'auto',
        apiKey: String((cfg && cfg.apiKey) || '').trim(),
        model: String((cfg && cfg.model) || '').trim() || 'gemini-3.8-flash',
        autoParseOnOpen: typeof (cfg && cfg.autoParseOnOpen) === 'boolean' ? cfg.autoParseOnOpen : true
      };
      localStorage.setItem(VISION_CFG_KEY, JSON.stringify(next));
    } catch (_e) {}
  }

  /* ============================================================================
   * 2) Music Theory & Transposition Helpers
   * ============================================================================ */

  function noteIndex(note) {
    if (!note || typeof note !== 'string') return 0;
    const ch0 = note[0] ? note[0].toUpperCase() : '';
    const root = BASE[ch0];
    if (root === undefined) return 0;
    const acc = note[1] === '#' || note[1] === '♯' ? 1 : (note[1] === 'b' || note[1] === '♭' ? -1 : 0);
    return (root + acc + 12) % 12;
  }

  function isChordToken(token) {
    if (!token || typeof token !== 'string') return false;
    const cleaned = token.trim();
    if (!cleaned || cleaned.length > 20) return false;
    if (/^(Intro|Verse|Chorus|Hook|Solo|Bridge|Outro|Interlude|End|Fine)$/i.test(cleaned)) return false;
    return CHORD_RE.test(cleaned);
  }

  /**
   * Conservatively normalizes OCR artifacts on chord tokens.
   * Preserves real words so lyrics are not corrupted.
   */
  function normalizeOcrChordToken(token) {
    if (!token || typeof token !== 'string') return '';
    let t = token.trim();
    if (!t) return '';

    t = t
      .replace(/[♯＃]/g, '#')
      .replace(/♭/g, 'b')
      .replace(/[–—]/g, '-')
      .replace(/[／]/g, '/');

    t = t.replace(/^[_\|\[\{\.,;:*~•·(/\'\"“”‘’\^\\–—]+/, '').replace(/[_\|\]\}\.,;:*~•·)/\'\"“”‘’\^\\–—]+$/, '');
    if (t.startsWith('(') && t.endsWith(')') && !t.slice(1, -1).includes('(')) {
      const inner = t.slice(1, -1).trim();
      if (inner) t = inner;
    }
    t = t.replace(/^[_\|\[\{\.,;:*~•·(/\'\"“”‘’\^\\–—]+/, '').replace(/[_\|\]\}\.,;:*~•·)/\'\"“”‘’\^\\–—]+$/, '');

    if (!t) return '';
    if (isChordToken(t)) return t;

    let candidate = t;

    if (/^[a-g]#/.test(candidate)) {
      candidate = candidate[0].toUpperCase() + candidate.slice(1);
    }

    if (/^Cc$/i.test(candidate)) {
      candidate = 'C';
    }

    if (/^Fn$/i.test(candidate)) {
      candidate = 'F';
    }

    if (candidate === '๑ท' || candidate === '๑m' || candidate === 'Gท') {
      candidate = 'Gm';
    }

    if (candidate === '87') {
      candidate = 'B7';
    }

    // Fix OCR "rn" misread for "m" (Arn -> Am, F#rn -> F#m, Crnaj7 -> Cmaj7)
    candidate = candidate.replace(/^([A-G][#b]?)rn(aj)?/i, function (_m, root, aj) {
      const normRoot = root[0].toUpperCase() + (root[1] || '');
      return normRoot + 'm' + (aj ? aj.toLowerCase() : '');
    });

    // Fix OCR "6" misread for "G" when followed by chord quality or slash bass
    if (/^6(?:[#b]|m(?:aj|in)?|sus|add|dim|aug|\/[A-G])/i.test(candidate)) {
      candidate = 'G' + candidate.slice(1);
    }

    // Fix OCR "8" misread for "B" when followed by chord quality or slash bass
    if (/^8(?:b|m(?:aj|in)?|sus|add|dim|aug|\/[A-G])/i.test(candidate)) {
      candidate = 'B' + candidate.slice(1);
    }

    // Fix OCR trailing "l", "I", or "1" misread for "7" on chords (e.g. Aml -> Am7, F#m1 -> F#m7)
    if (/^[A-G][#b]?(?:m|maj|min|sus|dim)?[lI1]$/.test(candidate)) {
      candidate = candidate.slice(0, -1) + '7';
    }

    // Fix lowercase slash bass when root is valid (e.g. G/b -> G/B, D/f# -> D/F#)
    candidate = candidate.replace(/\/([a-g])([#b]?)$/, function (_m, bass, acc) {
      return '/' + bass.toUpperCase() + acc;
    });

    return isChordToken(candidate) ? candidate : t;
  }

  function transposeChord(chord, shift, useFlat) {
    if (!chord || typeof chord !== 'string') return chord || '';
    const s = (((parseInt(shift, 10) || 0) % 12) + 12) % 12;
    if (s === 0) return chord;

    const m = chord.replace(/♯/g, '#').replace(/♭/g, 'b').match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
    if (!m) return chord;

    const scale = useFlat ? FLATS : SHARPS;
    const tr = function (n) {
      return scale[(noteIndex(n) + s) % 12];
    };
    return tr(m[1]) + (m[2] || '') + (m[3] ? '/' + tr(m[3]) : '');
  }

  function preferFlat(key, shift) {
    const m = String(key || '').trim().match(/^([A-G][#b♯♭]?)(.*)$/);
    if (!m) return false;
    const isMinor = /^m(?!aj)/i.test(m[2]);
    const s = (((parseInt(shift, 10) || 0) % 12) + 12) % 12;
    const target = (noteIndex(m[1]) + s) % 12;
    const majorEq = isMinor ? (target + 3) % 12 : target;
    if (majorEq === 6) return m[1].includes('b') || m[1].includes('♭');
    return FLAT_KEYS.includes(majorEq);
  }

  function detectOriginalKey(chordList, rawText) {
    if (rawText) {
      const explicitMatch = String(rawText).match(EXPLICIT_KEY_RE);
      if (explicitMatch && explicitMatch[1]) {
        const cleaned = normalizeOcrChordToken(explicitMatch[1]);
        if (isChordToken(cleaned)) {
          const km = cleaned.match(/^([A-G][#b]?)(m(?!aj))?/);
          if (km) return km[1] + (km[2] || '');
        }
      }
      const dirKey = String(rawText).match(/\{\s*(?:key|k)\s*:\s*([A-G][#b]?m?)\s*\}/i);
      if (dirKey && dirKey[1]) return dirKey[1];
    }

    const valid = (chordList || [])
      .map(function (c) {
        return normalizeOcrChordToken(String(c || '')).replace(/\/.*$/, '').trim();
      })
      .filter(isChordToken);

    if (!valid.length) return '';

    const parsed = valid
      .map(function (c) {
        const m = c.match(/^([A-G][#b]?)(m(?!aj))?/);
        return m ? { raw: m[1] + (m[2] || ''), root: noteIndex(m[1]), isMinor: !!m[2] } : null;
      })
      .filter(Boolean);

    if (!parsed.length) return valid[0];

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
      for (let i = 0; i < parsed.length; i++) {
        const ch = parsed[i];
        for (let d = 0; d < DIATONIC.length; d++) {
          if ((tonic + DIATONIC[d].offset) % 12 === ch.root && DIATONIC[d].minor === ch.isMinor) {
            score += DIATONIC[d].weight;
            break;
          }
        }
      }

      const first = parsed[0];
      const last = parsed[parsed.length - 1];
      if (first.root === tonic && !first.isMinor) score += 4.5;
      if (last.root === tonic && !last.isMinor) score += 2.5;

      const relMinor = (tonic + 9) % 12;
      let minorScore = score;
      if (first.root === relMinor && first.isMinor) minorScore += 4.0;
      if (last.root === relMinor && last.isMinor) minorScore += 2.0;

      const scaleNames = FLAT_KEYS.includes(tonic) ? FLATS : SHARPS;

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

  /* ============================================================================
   * 3) Line Classification & Thai Visual Width Helpers
   * ============================================================================ */

  function countVisualChars(str) {
    if (!str) return 0;
    let count = 0;
    for (let i = 0; i < str.length; i++) {
      if (!THAI_COMBINING_RE.test(str[i])) count++;
    }
    return count;
  }

  function visualColToStringIndex(str, targetCol) {
    if (!str || targetCol <= 0) return 0;
    let col = 0;
    let idx = 0;
    while (idx < str.length && col < targetCol) {
      idx++;
      while (idx < str.length && THAI_COMBINING_RE.test(str[idx])) {
        idx++;
      }
      col++;
    }
    // Snap before Thai leading vowel (เ แ โ ใ ไ) if target landed right on the consonant after it
    if (idx > 0 && /[\u0E40-\u0E44]/.test(str[idx - 1]) && /[\u0E01-\u0E2E]/.test(str[idx] || '')) {
      idx = idx - 1;
    }
    return idx;
  }

  function normalizeThaiLeadingVowelChords(chordProText) {
    if (!chordProText) return '';
    return String(chordProText).replace(
      /([\u0E40-\u0E44])(\[[^\[\]\r\n]+\])([\u0E01-\u0E2E])/g,
      '$2$1$3'
    );
  }

  const BUILTIN_OCR_CORRECTIONS = [
    { wrong: '6 ทาล ]7', right: 'Gmaj7' },
    { wrong: '6 ทาล 7', right: 'Gmaj7' },
    { wrong: '6 ทาล]7', right: 'Gmaj7' },
    { wrong: '6ทาล]7', right: 'Gmaj7' },
    { wrong: '8 ทา 7', right: 'Bmaj7' },
    { wrong: '8ทา7', right: 'Bmaj7' },
    { wrong: 'คิเทา 7 0', right: 'Cmaj7' },
    { wrong: 'คิเทา 7', right: 'Cmaj7' },
    { wrong: 'คิเทา7', right: 'Cmaj7' },
    { wrong: '0 รนร 4', right: 'Dsus4' },
    { wrong: '0 รนร 2', right: 'Dsus2' },
    { wrong: '0รนร4', right: 'Dsus4' },
    { wrong: '0รนร2', right: 'Dsus2' },
    { wrong: '0 รนร', right: 'Dsus' },
    { wrong: '05 นร 2 87', right: 'Dsus2 B7' },
    { wrong: '05 นร 2', right: 'Dsus2' },
    { wrong: 'อ๒กา 7', right: 'Emaj7' },
    { wrong: 'โทรไหน', right: 'Intro' },
    { wrong: 'Am7 0', right: 'Am7' },
    { wrong: '(Fmaj7z)', right: 'Fmaj7' },
    { wrong: 'Fmaj7z', right: 'Fmaj7' },
    { wrong: 'อย าก', right: 'อยาก' }
  ];

  const OCR_PHRASE_RULES = [
    // Gmaj7 / Gmaj variants
    { pattern: /(?:6[ \t]*ทาล[ \t]*\]?7|6[ \t]*ทา[ \t]*7|6ทาล\]?7)/gi, replace: 'Gmaj7' },
    { pattern: /(?:6[ \t]*ทาล|6ทาล)/gi, replace: 'Gmaj' },
    { pattern: /(?:6[ \t]*ทา|6ทา)(?=[^\u0E00-\u0E7FA-Za-z0-9]|$)/gi, replace: 'Gmaj' },

    // Bmaj7 / Bmaj variants
    { pattern: /(?:8[ \t]*ทา[ \t]*\]?7|8[ \t]*ทา[ \t]*7|8ทา7)/gi, replace: 'Bmaj7' },
    { pattern: /(?:8[ \t]*ทา|8ทา)(?=[^\u0E00-\u0E7FA-Za-z0-9]|$)/gi, replace: 'Bmaj' },

    // Cmaj7 / Cmaj variants
    { pattern: /(?:คิเทา[ \t]*7[ \t]*0?|คิเทา7|คิเฑา[ \t]*7)/gi, replace: 'Cmaj7' },
    { pattern: /(?:คิเทา|คิเฑา)/gi, replace: 'Cmaj' },

    // Dsus variants
    { pattern: /(?:05[ \t]*นร[ \t]*2[ \t]*87|05[ \t]*นร[ \t]*2[ \t]*B7)/gi, replace: 'Dsus2 B7' },
    { pattern: /(?:0[ \t]*รนร[ \t]*4|0รนร4)/gi, replace: 'Dsus4' },
    { pattern: /(?:0[ \t]*รนร[ \t]*2|0รนร2|05[ \t]*นร[ \t]*2)/gi, replace: 'Dsus2' },
    { pattern: /(?:0[ \t]*รนร|0[ \t]*นร)/gi, replace: 'Dsus' },

    // Emaj7 / Emaj variants
    { pattern: /(?:อ๒กา[ \t]*7|อ๒กา7)/gi, replace: 'Emaj7' },
    { pattern: /(?:อ๒กา|อ๒)/gi, replace: 'Emaj' },

    // Sections
    { pattern: /(?:โทรไหน)/gi, replace: 'Intro' },
    { pattern: /(?:เอาโทร|0utro)/gi, replace: 'Outro' },
    { pattern: /(?:โซโล่|5olo)/gi, replace: 'Solo' },
    { pattern: /(?:ฮุค|ท่อนฮุก)/gi, replace: 'Chorus' },
    { pattern: /(?:อินโทร)/gi, replace: 'Intro' },

    // Complex chords & fixes
    { pattern: /(?:\/[ \t]*[”"'\^][ \t]*\/)/gi, replace: '/ F /' },
    { pattern: /\bIntro[ \t]*\/[ \t]*[”"'\^][ \t]*\//gi, replace: 'Intro / F /' },
    { pattern: /\bFn[ \t]*['"”’‘]?\b/gi, replace: 'F' },
    { pattern: /_([A-G][#b]?(?:m|maj|min|sus|dim|add|aug|7|\d+)?)\b/g, replace: '$1' },
    { pattern: /(?:๑[ \t]*ท|๑ท)(?=[ \t\r\n/|\]]|$)/g, replace: 'Gm' },
    { pattern: /\b๑m\b/g, replace: 'Gm' },
    { pattern: /\bGท\b/g, replace: 'Gm' },
    { pattern: /\bGm[ \t]+(?:6[ \t]*0|[o0]|Cc)\b/gi, replace: 'Gm C' },
    { pattern: /\b6[ \t]*0\b/g, replace: 'C' },
    { pattern: /\bCc[ \t]+[\u0E01-\u0E2E]\b/gi, replace: 'C' },
    { pattern: /\bCc\b/g, replace: 'C' },
    { pattern: /\bCC\b/g, replace: 'C' },
    { pattern: /\b([A-G][#b]?(?:m|maj|min|sus|dim|add|aug|7)?)[ \t]+[o0]\b/g, replace: '$1 C' },
    { pattern: /(?:F#rn7b5|F#m7b5z)/gi, replace: 'F#m7b5' },
    { pattern: /(?:Fmaj7z)/gi, replace: 'Fmaj7' },
    { pattern: /\((Fmaj7)\)D\b/g, replace: 'Fmaj7 D' },
    { pattern: /\bAm7[ \t]+0\b/g, replace: 'Am7' },
    { pattern: /\bBm[ \t]*7\b/g, replace: 'Bm7' },
    { pattern: /\b([A-G][#b]?)m[ \t]*7\b/g, replace: '$1m7' },
    { pattern: /\b([A-G][#b]?)maj[ \t]*7\b/g, replace: '$1maj7' },
    { pattern: /\b([A-G][#b]?)sus[ \t]*4\b/g, replace: '$1sus4' },
    { pattern: /\b([A-G][#b]?)sus[ \t]*2\b/g, replace: '$1sus2' },

    // Repeat counts: ( 3 Times) -> (x3)
    { pattern: /\([ \t]*(\d+)[ \t]*(?:Times|รอบ|เที่ยว)[ \t]*\)/gi, replace: '(x$1)' },
    { pattern: /\b(\d+)[ \t]*(?:Times|รอบ|เที่ยว)\b/gi, replace: '(x$1)' }
  ];

  function sanitizeChordLineText(line) {
    if (!line || typeof line !== 'string') return '';
    let t = line;
    for (let i = 0; i < OCR_PHRASE_RULES.length; i++) {
      const r = OCR_PHRASE_RULES[i];
      t = t.replace(r.pattern, r.replace);
    }
    return t;
  }

  /**
   * Aggressively purges non-chord garbage, stray OCR numbers (0, 05, ]7, 87),
   * and corrupted Thai misreads from chord progressions and ChordPro lines.
   */
  function cleanOcrArtifacts(text, userRules) {
    if (!text || typeof text !== 'string') return '';
    let out = String(text).replace(/\r\n/g, '\n');

    out = sanitizeChordLineText(out);

    const allRules = BUILTIN_OCR_CORRECTIONS.concat(Array.isArray(userRules) ? userRules : []);
    for (let i = 0; i < allRules.length; i++) {
      const rule = allRules[i];
      if (!rule || !rule.wrong || !rule.right || rule.wrong === rule.right) continue;
      if (out.indexOf(rule.wrong) !== -1) {
        out = out.split(rule.wrong).join(rule.right);
      }
    }

    const lines = out.split('\n');
    const cleanedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      const trimmed = l.trim();
      if (!trimmed) {
        cleanedLines.push('');
        continue;
      }

      // 1) Line with ChordPro brackets [Chord]
      if (/\[[^\]]+\]/.test(l)) {
        l = l.replace(/\[([^\]]+)\]/g, function (full, inner) {
          const inTrim = inner.trim();
          if (inTrim.indexOf('|') !== -1 || inTrim.indexOf(' ') !== -1 || inTrim.indexOf('/') !== -1) {
            const toks = inTrim.split(/\s+/).filter(Boolean);
            const validToks = [];
            for (let j = 0; j < toks.length; j++) {
              const tk = toks[j];
              if (/^[|/]+$/.test(tk) || /^\(x\d+\)$/i.test(tk) || /^x\d+$/i.test(tk)) {
                validToks.push(tk.indexOf('/') !== -1 ? '/' : tk);
              } else {
                const norm = normalizeOcrChordToken(tk);
                if (isChordToken(norm)) {
                  validToks.push(norm);
                } else if (tk === '87') {
                  validToks.push('B7');
                }
              }
            }
            return validToks.length > 0 ? '[' + validToks.join(' ') + ']' : '';
          }

          if (/^(Intro|Verse|Chorus|Hook|Solo|Bridge|Outro|Interlude|End)$/i.test(inTrim)) {
            return '{comment: ' + inTrim + '}';
          }
          const norm = normalizeOcrChordToken(inTrim);
          if (isChordToken(norm)) return '[' + norm + ']';
          if (inTrim === '87') return '[B7]';
          const subChords = inTrim.split(/\s+/).map(normalizeOcrChordToken).filter(isChordToken);
          if (subChords.length > 0) {
            return subChords.map(function (c) { return '[' + c + ']'; }).join(' ');
          }
          return '';
        });
        cleanedLines.push(normalizeThaiLeadingVowelChords(l));
        continue;
      }

      // 2) Instrumental section line e.g. "Intro / Gmaj7 Bm7 / Cmaj7 / (x3) /"
      const secPref = trimmed.match(SECTION_PREFIX_RE);
      if (secPref) {
        const secName = cleanSectionName(secPref[1]);
        const chordPart = secPref[2];
        const toks = chordPart.split(/\s+/).filter(Boolean);
        const validToks = [];
        let chordHits = 0;

        for (let j = 0; j < toks.length; j++) {
          const tk = toks[j];
          if (/^[|/\\–—]+$/.test(tk) || /^\(x\d+\)$/i.test(tk) || /^x\d+$/i.test(tk)) {
            validToks.push(tk.indexOf('/') !== -1 ? '/' : tk);
          } else {
            const norm = normalizeOcrChordToken(tk);
            if (isChordToken(norm)) {
              chordHits++;
              validToks.push(norm);
            } else if (tk === '87') {
              chordHits++;
              validToks.push('B7');
            }
          }
        }

        if (chordHits > 0) {
          cleanedLines.push((secName ? secName + ' : ' : '') + validToks.join(' '));
          continue;
        }
      }

      // 3) Chord-only progression line
      const toks = trimmed.split(/\s+/).filter(Boolean);
      let chordCount = 0;
      let meaningfulCount = 0;
      for (let j = 0; j < toks.length; j++) {
        const tk = toks[j];
        if (CHORD_LINE_DECOR_RE.test(tk)) continue;
        meaningfulCount++;
        const norm = normalizeOcrChordToken(tk);
        if (isChordToken(norm) || tk === '87') chordCount++;
      }

      if (meaningfulCount > 0 && chordCount / meaningfulCount >= 0.5) {
        const pureChords = [];
        for (let j = 0; j < toks.length; j++) {
          const tk = toks[j];
          if (/^[|/\\–—]+$/.test(tk) || /^\(x\d+\)$/i.test(tk) || /^x\d+$/i.test(tk)) {
            pureChords.push(tk.indexOf('/') !== -1 ? '/' : tk);
          } else {
            const norm = normalizeOcrChordToken(tk);
            if (isChordToken(norm)) {
              pureChords.push(norm);
            } else if (tk === '87') {
              pureChords.push('B7');
            }
          }
        }
        cleanedLines.push(pureChords.join(' '));
        continue;
      }

      cleanedLines.push(l);
    }

    return normalizeThaiLeadingVowelChords(cleanedLines.join('\n'));
  }

  function classifyTextLine(line) {
    const rawTrimmed = String(line || '').trim();
    if (!rawTrimmed) return 'blank';

    const trimmed = sanitizeChordLineText(rawTrimmed);
    if (CHORDPRO_COMMENT_RE.test(trimmed) || SECTION_ONLY_RE.test(trimmed)) return 'section';

    if (/\[[^\]]+\]/.test(trimmed)) {
      return 'mixed';
    }

    const secPref = trimmed.match(SECTION_PREFIX_RE);
    if (secPref) {
      const restTokens = secPref[2].trim().split(/\s+/).filter(Boolean);
      const chordHits = restTokens.filter(function (tok) {
        return isChordToken(normalizeOcrChordToken(tok)) || tok === '87';
      }).length;
      if (chordHits > 0) return 'mixed';
      return 'section';
    }

    const rawTokens = trimmed.split(/\s+/).filter(Boolean);
    if (!rawTokens.length) return 'blank';

    let chordCount = 0;
    let meaningfulCount = 0;

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (CHORD_LINE_DECOR_RE.test(tok)) continue;
      meaningfulCount++;
      const norm = normalizeOcrChordToken(tok);
      if (isChordToken(norm) || tok === '87') chordCount++;
    }

    if (chordCount > 0 && meaningfulCount > 0 && chordCount / meaningfulCount >= 0.5) {
      return 'chord';
    }

    if (THAI_CHAR_RE.test(trimmed)) {
      return 'lyric';
    }

    return 'lyric';
  }

  function extractChordsFromText(text) {
    const chords = [];
    const lines = String(text || '').split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const type = classifyTextLine(line);

      if (type === 'mixed') {
        const inlineRe = /\[([^\]]+)\]/g;
        let m;
        let foundInline = false;
        while ((m = inlineRe.exec(line)) !== null) {
          const innerParts = m[1].split(/[\s|]+/).filter(Boolean);
          for (let p = 0; p < innerParts.length; p++) {
            const norm = normalizeOcrChordToken(innerParts[p]);
            if (isChordToken(norm)) {
              chords.push(norm);
              foundInline = true;
            }
          }
        }
        if (!foundInline) {
          const secPref = line.match(SECTION_PREFIX_RE);
          const rest = secPref ? secPref[2] : line;
          const toks = rest.split(/\s+/);
          for (let j = 0; j < toks.length; j++) {
            const norm = normalizeOcrChordToken(toks[j]);
            if (isChordToken(norm)) chords.push(norm);
          }
        }
      } else if (type === 'chord') {
        const toks = line.trim().split(/\s+/);
        for (let j = 0; j < toks.length; j++) {
          const norm = normalizeOcrChordToken(toks[j]);
          if (isChordToken(norm)) chords.push(norm);
        }
      }
    }

    return chords;
  }

  function uniqueChords(chordList) {
    const seen = Object.create(null);
    const out = [];
    for (let i = 0; i < chordList.length; i++) {
      const c = chordList[i];
      if (c && !seen[c]) {
        seen[c] = true;
        out.push(c);
      }
    }
    return out;
  }

  /* ============================================================================
   * 4) Monospace <-> ChordPro Conversion & Transposition
   * ============================================================================ */

  function extractChordPositions(chordLine) {
    const sanitized = sanitizeChordLineText(chordLine);
    const positions = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(sanitized)) !== null) {
      const raw = m[0];
      if (CHORD_LINE_DECOR_RE.test(raw)) continue;
      const norm = normalizeOcrChordToken(raw);
      if (isChordToken(norm)) {
        positions.push({ chord: norm, col: m.index });
      } else if (raw === '87') {
        positions.push({ chord: 'B7', col: m.index });
      }
    }
    return positions;
  }

  function cleanSectionName(rawSection) {
    const dir = String(rawSection || '').match(CHORDPRO_COMMENT_RE);
    if (dir) return dir[1].trim();
    return String(rawSection || '')
      .replace(/^[\[\(\*\/\\\s]+/, '')
      .replace(/[\]\)\*:\/\\\s]+$/, '')
      .trim();
  }

  function convertMonospaceToChordPro(monospaceText) {
    const cleaned = cleanOcrArtifacts(monospaceText);
    const lines = String(cleaned || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const type = classifyTextLine(line);

      if (type === 'section') {
        if (CHORDPRO_COMMENT_RE.test(line)) {
          out.push(line.trim());
        } else {
          const secLabel = cleanSectionName(line);
          out.push(secLabel ? '{comment: ' + secLabel + '}' : line);
        }
        continue;
      }

      if (type === 'chord') {
        const chordPositions = extractChordPositions(line);
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        const nextType = nextLine !== null ? classifyTextLine(nextLine) : 'blank';

        if (nextType === 'lyric' && chordPositions.length > 0) {
          let result = nextLine;
          const insertions = chordPositions.map(function (cp) {
            return {
              chord: cp.chord,
              strIdx: visualColToStringIndex(nextLine, cp.col),
              col: cp.col
            };
          });

          const lyricVisualLen = countVisualChars(nextLine);
          let trailingChords = '';

          for (let k = insertions.length - 1; k >= 0; k--) {
            const ins = insertions[k];
            if (ins.col >= lyricVisualLen) {
              trailingChords = ' [' + ins.chord + ']' + trailingChords;
            } else {
              result =
                result.slice(0, ins.strIdx) +
                '[' + ins.chord + ']' +
                result.slice(ins.strIdx);
            }
          }

          out.push(normalizeThaiLeadingVowelChords((result + trailingChords).replace(/\s+$/, '')));
          i++;
        } else if (chordPositions.length > 0) {
          // Standalone instrumental progression -> [| C | G/B | Am7 | F |]
          const barChords = chordPositions.map(function (cp) { return cp.chord; }).join(' | ');
          out.push('[| ' + barChords + ' |]');
        } else {
          out.push(line);
        }
      } else if (type === 'mixed') {
        const secPref = line.match(SECTION_PREFIX_RE);
        if (secPref && !/\[[A-G|#b]/.test(line)) {
          const progChords = [];
          secPref[2].replace(/\S+/g, function (tok) {
            const norm = normalizeOcrChordToken(tok);
            if (isChordToken(norm)) progChords.push(norm);
            return tok;
          });
          if (progChords.length > 0) {
            out.push('{comment: ' + secPref[1].trim() + '}');
            out.push('[| ' + progChords.join(' | ') + ' |]');
          } else {
            out.push(line);
          }
        } else {
          out.push(normalizeThaiLeadingVowelChords(line));
        }
      } else {
        out.push(line);
      }
    }

    return out.join('\n');
  }

  /**
   * Converts ChordPro (`[C]เธอทำให้ฉัน[Em7]รู้สึก`) back into 2-line monospace format
   * for backward compatibility with legacy monospace viewers & plain text exports.
   */
  function convertChordProToMonospace(chordProText) {
    const lines = String(chordProText || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        out.push('');
        continue;
      }

      const commentMatch = trimmed.match(CHORDPRO_COMMENT_RE);
      if (commentMatch) {
        out.push('[' + commentMatch[1].trim() + ']');
        continue;
      }

      if (/^\{\s*(?:title|t|artist|subtitle|key|k)\s*:/i.test(trimmed)) {
        continue;
      }

      // Instrumental bracket block e.g. [| C | G/B | Am7 | F |]
      const instruBlock = trimmed.match(/^\[([^\[\]]+)\](?:\s*(x\d+))?$/i);
      if (instruBlock && !isChordToken(instruBlock[1].trim()) && /[|\s]/.test(instruBlock[1])) {
        out.push(instruBlock[1].trim() + (instruBlock[2] ? ' ' + instruBlock[2] : ''));
        continue;
      }

      if (!/\[[^\]]+\]/.test(rawLine)) {
        out.push(rawLine);
        continue;
      }

      let lyricLine = '';
      const positioned = [];
      const re = /\[([^\]]+)\]/g;
      let lastIdx = 0;
      let m;

      while ((m = re.exec(rawLine)) !== null) {
        const chunk = rawLine.slice(lastIdx, m.index);
        lyricLine += chunk;
        const inner = m[1].trim();
        if (isChordToken(inner)) {
          positioned.push({ chord: inner, col: countVisualChars(lyricLine) });
        } else {
          lyricLine += m[0];
        }
        lastIdx = re.lastIndex;
      }
      lyricLine += rawLine.slice(lastIdx);

      if (positioned.length > 0) {
        const chordLine = renderPositionedChords(positioned);
        if (lyricLine.trim()) {
          out.push(chordLine);
          out.push(lyricLine);
        } else {
          out.push(chordLine);
        }
      } else {
        out.push(lyricLine);
      }
    }

    return out.join('\n');
  }

  function transposeChordLinePreservingColumns(line, shift, useFlat) {
    return line.replace(/(\S+)([ \t]*)/g, function (full, tok, spaces) {
      if (CHORD_LINE_DECOR_RE.test(tok)) return full;
      const norm = normalizeOcrChordToken(tok);
      if (!isChordToken(norm)) return full;

      const transposed = transposeChord(norm, shift, useFlat);
      const diff = transposed.length - tok.length;

      if (diff === 0 || !spaces) return transposed + spaces;
      if (diff > 0) {
        const removable = Math.max(0, spaces.length - 1);
        const removeCount = Math.min(diff, removable);
        return transposed + spaces.slice(removeCount);
      }
      return transposed + spaces + ' '.repeat(-diff);
    });
  }

  function transposeMonospaceText(text, shift, originalKey) {
    const s = parseInt(shift, 10) || 0;
    if (!text || s === 0) return text || '';

    const key = originalKey || detectOriginalKey(extractChordsFromText(text), text);
    const useFlat = preferFlat(key, s);
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');

    return lines
      .map(function (line) {
        const type = classifyTextLine(line);
        if (type === 'chord') {
          return transposeChordLinePreservingColumns(line, s, useFlat);
        }
        if (type === 'mixed') {
          if (/\[[^\]]+\]/.test(line)) {
            return transposeChordProText(line, s, key);
          }
          const secPref = line.match(SECTION_PREFIX_RE);
          if (secPref) {
            const prefixLen = line.indexOf(secPref[2]);
            return line.slice(0, prefixLen) + transposeChordLinePreservingColumns(secPref[2], s, useFlat);
          }
        }
        return line;
      })
      .join('\n');
  }

  function transposeChordProText(text, shift, originalKey, accidentalMode) {
    if (global.MellowChordTextViewer && typeof global.MellowChordTextViewer.transposeChordPro === 'function') {
      return global.MellowChordTextViewer.transposeChordPro(text, shift, originalKey, accidentalMode || 'auto');
    }
    const s = parseInt(shift, 10) || 0;
    if (!text || s === 0) return text || '';

    const key = originalKey || detectOriginalKey(extractChordsFromText(text), text);
    const useFlat = accidentalMode === 'flat' ? true : (accidentalMode === 'sharp' ? false : preferFlat(key, s));

    return String(text).replace(/\[([^\]]+)\]/g, function (full, inner) {
      const trimmed = inner.trim();
      if (isChordToken(trimmed)) {
        return '[' + transposeChord(trimmed, s, useFlat) + ']';
      }
      // Handle instrumental bar blocks [| C | G/B | Am7 | F |]
      let changed = false;
      const mapped = inner.replace(/[A-G][#b]?[^\s|\]]*/g, function (tok) {
        const norm = normalizeOcrChordToken(tok);
        if (isChordToken(norm)) {
          changed = true;
          return transposeChord(norm, s, useFlat);
        }
        return tok;
      });
      return changed ? '[' + mapped + ']' : full;
    });
  }

  /* ============================================================================
   * 5) Dynamic Learning Memory (`chord_parser_memory`) & System Prompt Builder
   * ============================================================================ */

  function readLocalMemory() {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function writeLocalMemory(entries) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(MEMORY_KEY, JSON.stringify(entries));
    } catch (_e) {}
  }

  function pruneLocalMemoryList(entries) {
    const grouped = Object.create(null);
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      if (!item || !item.entry_type) continue;
      const k = (item.source_domain || 'chordtabs') + '::' + item.entry_type;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(item);
    }

    const out = [];
    const keys = Object.keys(grouped);
    for (let k = 0; k < keys.length; k++) {
      const bucket = grouped[keys[k]];
      bucket.sort(function (a, b) {
        const qDiff = (b.quality_score || 0) - (a.quality_score || 0);
        if (qDiff !== 0) return qDiff;
        return (Date.parse(b.updated_at || 0) || 0) - (Date.parse(a.updated_at || 0) || 0);
      });
      const kept = bucket.slice(0, MAX_MEMORY_PER_DOMAIN);
      for (let j = 0; j < kept.length; j++) out.push(kept[j]);
    }
    return out;
  }

  /**
   * Builds the dynamic section injected into {{DYNAMIC_LEARNED_RULES_AND_EXAMPLES_FROM_DB}}
   */
  function buildDynamicMemorySection(sourceDomain, correctionRules, verifiedExamples) {
    const domain = sourceDomain || 'chordtabs';
    const rules = Array.isArray(correctionRules) ? correctionRules : [];
    const examples = Array.isArray(verifiedExamples) ? verifiedExamples : [];
    const lines = [];

    if (rules.length > 0) {
      lines.push('LEARNED CORRECTION RULES (from previously verified "' + domain + '" sheets — DO NOT repeat these mistakes):');
      const cappedRules = rules.slice(0, 15);
      for (let i = 0; i < cappedRules.length; i++) {
        const r = cappedRules[i];
        const reasonSuffix = r.reason ? ' (' + r.reason + ')' : '';
        lines.push('- Mistake #' + (i + 1) + ': "' + r.wrong + '" -> MUST be "' + r.right + '"' + reasonSuffix);
      }
    }

    if (examples.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('VERIFIED FEW-SHOT CHORDPRO EXAMPLES (style reference for "' + domain + '"):');
      const cappedExamples = examples.slice(0, 3);
      for (let j = 0; j < cappedExamples.length; j++) {
        const ex = cappedExamples[j];
        lines.push(
          'Example #' + (j + 1) + ' [Source: ' + (ex.source_domain || domain) +
          ', Key: ' + (ex.original_key || 'C') + ']:\n' +
          String(ex.verified_chordpro || '').trim()
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates the full Vision AI System Prompt with dynamic rules & verified examples injected.
   */
  function buildVisionSystemPrompt(memoryContext) {
    const ctx = memoryContext || {};
    const dynamicSection = buildDynamicMemorySection(
      ctx.sourceDomain || 'chordtabs',
      ctx.correctionRules || [],
      ctx.verifiedExamples || []
    );
    return VISION_SYSTEM_PROMPT_TEMPLATE.replace(
      '{{DYNAMIC_LEARNED_RULES_AND_EXAMPLES_FROM_DB}}',
      dynamicSection
    ).trim();
  }

  /**
   * Fetches learned rules and verified few-shot examples from Supabase `chord_parser_memory`
   * merged with local offline memory for `sourceDomain`.
   */
  async function fetchParserMemory(sourceDomain) {
    const domain = String(sourceDomain || 'chordtabs').trim().toLowerCase() || 'chordtabs';
    let rows = readLocalMemory().filter(function (r) {
      return r && (r.source_domain === domain || r.source_domain === 'general');
    });

    const sb = backendDeps.getSupabase();
    if (sb && backendDeps.isCloudActive()) {
      try {
        const res = await sb
          .from('chord_parser_memory')
          .select('*')
          .in('source_domain', [domain, 'general'])
          .order('quality_score', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(20);

        if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
          // Merge remote + local by id / song_id+entry_type
          const mergedMap = new Map();
          res.data.concat(rows).forEach(function (item) {
            const key = item.id || ((item.song_id || '') + ':' + item.entry_type + ':' + (item.verified_chordpro || '').slice(0, 40));
            if (!mergedMap.has(key)) mergedMap.set(key, item);
          });
          rows = Array.from(mergedMap.values());
        }
      } catch (_err) {
        // Graceful fallback to local memory when offline or table unmigrated
      }
    }

    rows.sort(function (a, b) {
      const qDiff = (b.quality_score || 0) - (a.quality_score || 0);
      if (qDiff !== 0) return qDiff;
      return (Date.parse(b.updated_at || 0) || 0) - (Date.parse(a.updated_at || 0) || 0);
    });

    const ruleSeen = Object.create(null);
    const correctionRules = [];
    const verifiedExamples = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (Array.isArray(row.correction_rules)) {
        for (let r = 0; r < row.correction_rules.length; r++) {
          const rule = row.correction_rules[r];
          if (rule && rule.wrong && rule.right && rule.wrong !== rule.right) {
            const sig = rule.wrong + '=>' + rule.right;
            if (!ruleSeen[sig]) {
              ruleSeen[sig] = true;
              correctionRules.push(rule);
            }
          }
        }
      }
      if (row.entry_type === 'few_shot_example' && row.verified_chordpro && row.verified_chordpro.trim()) {
        verifiedExamples.push({
          id: row.id,
          source_domain: row.source_domain || domain,
          song_id: row.song_id || '',
          song_title: row.song_title || '',
          original_key: row.original_key || 'C',
          verified_chordpro: row.verified_chordpro.trim(),
          quality_score: row.quality_score || 100
        });
      }
    }

    return {
      sourceDomain: domain,
      correctionRules: correctionRules.slice(0, 15),
      verifiedExamples: verifiedExamples.slice(0, 3),
      allDomainExamplesCount: verifiedExamples.length,
      entries: rows
    };
  }

  function stripChordsFromChordProLine(line) {
    return String(line || '')
      .replace(/\[[^\[\]]+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Computes character overlap similarity (0..1) to pair raw vs verified lines.
   */
  function textSimilarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;
    const bigramsA = new Set();
    for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
    if (bigramsA.size === 0) return a === b ? 1 : 0;
    let hits = 0;
    let totalB = 0;
    for (let j = 0; j < b.length - 1; j++) {
      totalB++;
      if (bigramsA.has(b.slice(j, j + 2))) hits++;
    }
    return totalB === 0 ? 0 : (2 * hits) / (bigramsA.size + totalB);
  }

  /**
   * Extracts structured OCR & Thai alignment correction rules + best verified few-shot excerpt
   * by diffing `rawChordPro` against user-verified `verifiedChordPro`.
   */
  function extractLearningDiff(rawChordPro, verifiedChordPro) {
    const rawLines = String(rawChordPro || '').replace(/\r\n/g, '\n').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    const verLines = String(verifiedChordPro || '').replace(/\r\n/g, '\n').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

    const rules = [];
    const seen = Object.create(null);

    function addRule(wrong, right, type, reason) {
      const w = String(wrong || '').trim();
      const r = String(right || '').trim();
      if (!w || !r || w === r || w.length > 90 || r.length > 90) return;
      const key = w + '->' + r;
      if (seen[key]) return;
      seen[key] = true;
      rules.push({ wrong: w, right: r, type: type, reason: reason });
    }

    const usedRaw = Object.create(null);

    for (let v = 0; v < verLines.length; v++) {
      const vLine = verLines[v];
      const vLyric = stripChordsFromChordProLine(vLine);

      let bestIdx = -1;
      let bestSim = 0;

      for (let r = 0; r < rawLines.length; r++) {
        if (usedRaw[r]) continue;
        const rLine = rawLines[r];
        if (rLine === vLine) {
          bestIdx = r;
          bestSim = 1;
          break;
        }
        const rLyric = stripChordsFromChordProLine(rLine);
        const sim = vLyric && rLyric ? textSimilarity(rLyric, vLyric) : textSimilarity(rLine, vLine);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = r;
        }
      }

      if (bestIdx < 0 || bestSim < 0.45) continue;
      usedRaw[bestIdx] = true;

      const rLine = rawLines[bestIdx];
      if (rLine === vLine) continue;

      const rLyric = stripChordsFromChordProLine(rLine);
      const rBrackets = (rLine.match(/\[[^\[\]]+\]/g) || []);
      const vBrackets = (vLine.match(/\[[^\[\]]+\]/g) || []);

      // 1) Chord symbol OCR correction (same bracket count, chord text fixed e.g. [F#rn] -> [F#m])
      if (rBrackets.length === vBrackets.length && rBrackets.length > 0) {
        for (let b = 0; b < rBrackets.length; b++) {
          if (rBrackets[b] !== vBrackets[b]) {
            addRule(rBrackets[b], vBrackets[b], 'chord_ocr', 'Chord symbol OCR correction');
          }
        }
      }

      // 2) Thai syllable / space alignment correction (lyrics identical, [Chord] position shifted!)
      if (rLyric && rLyric === vLyric && rLine !== vLine) {
        addRule(rLine, vLine, 'thai_alignment', 'Exact Thai syllable chord placement');
      } else if (rLyric && vLyric && rLyric !== vLyric) {
        // 3) Lyric word OCR correction
        const rWords = rLyric.split(/\s+/);
        const vWords = vLyric.split(/\s+/);
        if (rWords.length === vWords.length) {
          for (let w = 0; w < rWords.length; w++) {
            if (rWords[w] !== vWords[w] && rWords[w].length <= 32 && vWords[w].length <= 32) {
              addRule(rWords[w], vWords[w], 'lyric_ocr', 'Thai lyric OCR correction');
            }
          }
        } else {
          addRule(rLine, vLine, 'line_correction', 'Verified line & chord correction');
        }
      }
    }

    // Extract best 4-8 line verified snippet for Few-Shot prompting & compute quality score
    const snippetLines = [];
    let hasSection = false;
    let chordBearingCount = 0;
    let thaiLyricCount = 0;

    for (let i = 0; i < verLines.length && snippetLines.length < 8; i++) {
      const l = verLines[i];
      if (CHORDPRO_COMMENT_RE.test(l)) {
        hasSection = true;
        snippetLines.push(l);
      } else if (/\[[^\[\]]+\]/.test(l)) {
        chordBearingCount++;
        if (THAI_CHAR_RE.test(l)) thaiLyricCount++;
        snippetLines.push(l);
      }
    }

    const bestSnippet = (snippetLines.length >= 2 ? snippetLines : verLines.slice(0, 8)).join('\n');
    let qualityScore = 75;
    if (thaiLyricCount >= 2) qualityScore += 10;
    if (chordBearingCount >= 3) qualityScore += 10;
    if (hasSection) qualityScore += 5;
    qualityScore = Math.min(100, qualityScore);

    return {
      correctionRules: rules.slice(0, 12),
      bestSnippet: bestSnippet,
      qualityScore: qualityScore
    };
  }

  /**
   * Applies learned correction rules to a parsed ChordPro text (used as post-processor
   * for offline/fallback OCR and safety guard against known recurring OCR errors).
   */
  function applyLearnedCorrectionRules(chordProText, correctionRules) {
    if (!chordProText) return '';
    return cleanOcrArtifacts(chordProText, correctionRules);
  }

  /**
   * Saves user-verified ChordPro to the song (`is_verified = true`) AND stores
   * extracted correction rules + verified few-shot snippet in `chord_parser_memory`
   * (capped to top 10 per source_domain).
   */
  async function saveVerifiedAndTeach(params) {
    const p = params || {};
    const song = p.song || {};
    const sourceDomain = detectSourceDomain(p.sourceDomain || song);
    const verifiedChordPro = normalizeThaiLeadingVowelChords(String(p.verifiedChordPro || '').trim());
    if (!verifiedChordPro) {
      throw new Error('กรุณากรอกเนื้อหา ChordPro ก่อนบันทึกและสอนระบบ');
    }

    const rawChordPro = String(
      p.rawChordPro ||
      (song.parsedChordSheet && (song.parsedChordSheet.rawAiOutput || song.parsedChordSheet.chordpro_content || song.parsedChordSheet.chordPro)) ||
      ''
    ).trim();

    const chords = uniqueChords(extractChordsFromText(verifiedChordPro));
    const originalKey = String(p.originalKey || '').trim() || detectOriginalKey(chords, verifiedChordPro) || song.key || 'C';
    const alignedMonospace = convertChordProToMonospace(verifiedChordPro);

    const updatedParsed = {
      original_key: originalKey,
      originalKey: originalKey,
      chordpro_content: verifiedChordPro,
      chordPro: verifiedChordPro,
      alignedText: alignedMonospace,
      monospaceText: alignedMonospace,
      source_domain: sourceDomain,
      sourceDomain: sourceDomain,
      is_verified: true,
      rawAiOutput: rawChordPro || verifiedChordPro,
      chords: chords,
      lineCount: verifiedChordPro.split('\n').length,
      source: 'verified',
      parsedAt: Date.now(),
      verifiedAt: Date.now()
    };

    saveParsedChord(song, updatedParsed, p.onSongUpdated);

    const diff = extractLearningDiff(rawChordPro, verifiedChordPro);
    const nowIso = new Date().toISOString();
    const user = backendDeps.getCurrentUser();
    const userId = user && user.id && !user.local && user.isCloud !== false ? user.id : null;

    const exampleEntry = {
      id: 'mem-ex-' + (song.id || Date.now().toString(36)),
      source_domain: sourceDomain,
      entry_type: 'few_shot_example',
      song_id: song.id || null,
      song_title: song.title || '',
      original_key: originalKey,
      raw_ai_output: rawChordPro,
      verified_chordpro: diff.bestSnippet,
      correction_rules: diff.correctionRules,
      quality_score: diff.qualityScore,
      usage_count: 1,
      created_by: userId,
      created_at: nowIso,
      updated_at: nowIso
    };

    // 1) Save & auto-prune in local memory (max 10 per domain + entry_type)
    const localList = readLocalMemory().filter(function (item) {
      return !(item && item.song_id && song.id && item.song_id === song.id && item.entry_type === 'few_shot_example');
    });
    localList.unshift(exampleEntry);

    if (diff.correctionRules.length > 0) {
      localList.unshift({
        id: 'mem-rule-' + Date.now().toString(36),
        source_domain: sourceDomain,
        entry_type: 'correction_rule',
        song_id: song.id || null,
        song_title: song.title || '',
        original_key: originalKey,
        raw_ai_output: rawChordPro.slice(0, 1000),
        verified_chordpro: diff.bestSnippet,
        correction_rules: diff.correctionRules,
        quality_score: 95,
        usage_count: 1,
        created_by: userId,
        created_at: nowIso,
        updated_at: nowIso
      });
    }

    const prunedLocal = pruneLocalMemoryList(localList);
    writeLocalMemory(prunedLocal);

    // 2) Sync to Supabase `public.chord_parser_memory` when cloud is active
    let cloudSaved = false;
    const sb = backendDeps.getSupabase();
    if (sb && backendDeps.isCloudActive() && userId) {
      try {
        const rowsToInsert = [
          {
            source_domain: sourceDomain,
            entry_type: 'few_shot_example',
            song_id: song.id || null,
            song_title: song.title || '',
            original_key: originalKey,
            raw_ai_output: rawChordPro,
            verified_chordpro: diff.bestSnippet,
            correction_rules: diff.correctionRules,
            quality_score: diff.qualityScore,
            created_by: userId
          }
        ];
        if (diff.correctionRules.length > 0) {
          rowsToInsert.push({
            source_domain: sourceDomain,
            entry_type: 'correction_rule',
            song_id: song.id || null,
            song_title: song.title || '',
            original_key: originalKey,
            raw_ai_output: rawChordPro.slice(0, 1500),
            verified_chordpro: diff.bestSnippet,
            correction_rules: diff.correctionRules,
            quality_score: 95,
            created_by: userId
          });
        }
        const ins = await sb.from('chord_parser_memory').insert(rowsToInsert);
        if (!ins.error) cloudSaved = true;
      } catch (_cloudErr) {
        // Local memory already persisted
      }
    }

    const domainExamplesCount = prunedLocal.filter(function (x) {
      return x.source_domain === sourceDomain && x.entry_type === 'few_shot_example';
    }).length;

    return {
      updatedParsed: updatedParsed,
      rulesLearned: diff.correctionRules,
      exampleSaved: diff.bestSnippet,
      qualityScore: diff.qualityScore,
      totalDomainExamples: domainExamplesCount,
      cloudSaved: cloudSaved
    };
  }

  /* ============================================================================
   * 6) Vision AI Runner (Edge Function / Gemini / OpenAI)
   * ============================================================================ */

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onloadend = function () {
          const res = String(reader.result || '');
          const comma = res.indexOf(',');
          resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = function (err) { reject(err || new Error('Failed to encode image')); };
        reader.readAsDataURL(blob);
        return;
      }
      reject(new Error('FileReader unavailable'));
    });
  }

  function extractJsonPayload(rawText) {
    const cleaned = String(rawText || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (_e) {
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) {
        return JSON.parse(cleaned.slice(first, last + 1));
      }
      throw new Error('Vision AI response is not valid JSON');
    }
  }

  async function invokeDirectVisionApi(cfg, systemPrompt, base64Data, mimeType) {
    if (cfg.provider === 'gemini') {
      const model = cfg.model || 'gemini-3.8-flash';
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(cfg.apiKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType || 'image/png', data: base64Data } },
              { text: 'Transcribe this Thai chord sheet image into the exact ChordPro JSON schema.' }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingBudget: 1024
            }
          }
        })
      });
      if (!res.ok) throw new Error('Gemini API error (' + res.status + ')');
      const data = await res.json();
      const txt = data && data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
      return extractJsonPayload(txt);
    }

    if (cfg.provider === 'openai') {
      const model = cfg.model || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Transcribe this Thai chord sheet image into the exact ChordPro JSON schema.' },
                { type: 'image_url', image_url: { url: 'data:' + (mimeType || 'image/png') + ';base64,' + base64Data, detail: 'high' } }
              ]
            }
          ]
        })
      });
      if (!res.ok) throw new Error('OpenAI API error (' + res.status + ')');
      const data = await res.json();
      const txt = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      return extractJsonPayload(txt);
    }

    return null;
  }

  async function tryVisionAiChordPro(imageBlob, context) {
    const cfg = getVisionConfig();
    if (cfg.provider === 'ocr') return null;

    // 1) Custom injected visionRunner (e.g. unit/E2E tests or custom host adapter)
    if (typeof context.visionRunner === 'function') {
      const customOut = await context.visionRunner(imageBlob, {
        systemPrompt: context.systemPrompt,
        sourceDomain: context.sourceDomain,
        memory: context.memory,
        songId: context.songId,
        onProgress: context.onProgress
      });
      if (customOut && typeof customOut === 'object' && customOut.chordpro_content) {
        return customOut;
      }
      if (typeof customOut === 'string') {
        return extractJsonPayload(customOut);
      }
    }

    if (!(typeof Blob !== 'undefined' && imageBlob instanceof Blob)) return null;

    // 2) Direct Gemini / OpenAI Vision API if user configured an API key
    const trimmedKey = (cfg.apiKey || '').trim();
    const effectiveProvider = (cfg.provider === 'auto' || !cfg.provider)
      ? (trimmedKey.startsWith('sk-') ? 'openai' : (trimmedKey ? 'gemini' : 'auto'))
      : cfg.provider;

    if (trimmedKey && (effectiveProvider === 'gemini' || effectiveProvider === 'openai')) {
      const activeCfg = Object.assign({}, cfg, {
        provider: effectiveProvider,
        apiKey: trimmedKey,
        model: cfg.model || (effectiveProvider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini')
      });
      context.onProgress('กำลังส่งภาพให้ Vision AI (' + (effectiveProvider === 'gemini' ? 'Gemini 3.8 Flash' : 'OpenAI') + ') แกะเป็น ChordPro...', 45);
      const base64 = await blobToBase64(imageBlob);
      return await invokeDirectVisionApi(activeCfg, context.systemPrompt, base64, imageBlob.type || 'image/png');
    }

    // 3) Supabase Edge Function `parse-chord-image`
    const sb = backendDeps.getSupabase();
    if (sb && sb.functions && typeof sb.functions.invoke === 'function') {
      try {
        context.onProgress('กำลังส่งภาพไปยัง Vision AI (Edge Function)...', 40);
        const base64 = await blobToBase64(imageBlob);
        const res = await sb.functions.invoke('parse-chord-image', {
          body: {
            imageBase64: base64,
            image_base64: base64,
            mimeType: imageBlob.type || 'image/png',
            mime_type: imageBlob.type || 'image/png',
            sourceDomain: context.sourceDomain,
            source_domain: context.sourceDomain,
            song_title: (context.song && context.song.title) || '',
            artist: (context.song && context.song.artist) || '',
            correctionRules: context.memory.correctionRules,
            verifiedExamples: context.memory.verifiedExamples
          }
        });
        if (res.error) {
          console.warn('[Vision AI Edge Function Warning]', res.error);
        }
        if (!res.error && res.data) {
          const payload = (res.data.data && res.data.data.chordpro_content) ? res.data.data : res.data;
          if (payload && payload.chordpro_content) {
            return payload;
          }
        }
      } catch (_edgeErr) {
        console.warn('[Vision AI Network/Edge exception]', _edgeErr);
        // Fallback smoothly to local Spatial OCR + ChordPro converter
      }
    }

    return null;
  }

  /* ============================================================================
   * 7) Spatial OCR Alignment Engine (Fallback & Hybrid Preprocessor)
   * ============================================================================ */

  function isWatermarkOrHeaderLine(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    if (WATERMARK_LINE_RE.test(trimmed)) {
      const hasSite = /(?:chordtabs|chordzaa|dochord|siamchord|guitarthai|http|www\.|\.in\.th|\.com)/i.test(trimmed);
      if (hasSite) return true;
      if (/^(?:คอร์ดเพลง|ศิลปิน|อัลบั้ม|ต้นฉบับ|จังหวะ|tempo|tuning|capo|key|คีย์|ตั้งสาย)/i.test(trimmed)) {
        return true;
      }
    }
    return false;
  }

  function extractOcrLines(ocrData) {
    if (!ocrData || typeof ocrData !== 'object') return null;
    const data = ocrData.data && typeof ocrData.data === 'object' ? ocrData.data : ocrData;

    if (Array.isArray(data.lines) && data.lines.length > 0) {
      return data.lines;
    }

    if (Array.isArray(data.blocks) && data.blocks.length > 0) {
      const collected = [];
      for (let b = 0; b < data.blocks.length; b++) {
        const block = data.blocks[b];
        const paragraphs = block && Array.isArray(block.paragraphs) ? block.paragraphs : [];
        for (let p = 0; p < paragraphs.length; p++) {
          const para = paragraphs[p];
          const lines = para && Array.isArray(para.lines) ? para.lines : [];
          for (let l = 0; l < lines.length; l++) {
            collected.push(lines[l]);
          }
        }
      }
      if (collected.length > 0) return collected;
    }

    return null;
  }

  function hasValidWordBboxes(ocrLines) {
    if (!Array.isArray(ocrLines) || !ocrLines.length) return false;
    let validLines = 0;
    for (let i = 0; i < ocrLines.length; i++) {
      const words = ocrLines[i] && ocrLines[i].words;
      if (Array.isArray(words) && words.some(function (w) {
        return w && w.bbox && typeof w.bbox.x0 === 'number' && typeof w.bbox.x1 === 'number';
      })) {
        validLines++;
      }
    }
    return validLines > 0;
  }

  function buildLyricWordMap(words, avgCharWidth) {
    const sorted = words
      .filter(function (w) {
        return w && typeof w.text === 'string' && w.text.trim().length > 0;
      })
      .slice()
      .sort(function (a, b) {
        return (a.bbox ? a.bbox.x0 : 0) - (b.bbox ? b.bbox.x0 : 0);
      });

    let text = '';
    const map = [];
    let currentVisualCol = 0;

    for (let i = 0; i < sorted.length; i++) {
      const w = sorted[i];
      const wText = w.text.trim();
      const prev = i > 0 ? sorted[i - 1] : null;

      if (prev && prev.bbox && w.bbox) {
        const gapPx = w.bbox.x0 - prev.bbox.x1;
        const prevIsThai = THAI_CHAR_RE.test(prev.text);
        const curIsThai = THAI_CHAR_RE.test(wText);
        if (gapPx > avgCharWidth * 1.35) {
          const spaces = Math.max(1, Math.min(8, Math.round(gapPx / avgCharWidth)));
          text += ' '.repeat(spaces);
          currentVisualCol += spaces;
        } else if (!prevIsThai || !curIsThai || gapPx > avgCharWidth * 0.65) {
          text += ' ';
          currentVisualCol += 1;
        }
      } else if (i > 0) {
        text += ' ';
        currentVisualCol += 1;
      }

      const vLen = Math.max(1, countVisualChars(wText));
      map.push({
        text: wText,
        x0: w.bbox ? w.bbox.x0 : 0,
        x1: w.bbox ? w.bbox.x1 : 0,
        colStart: currentVisualCol,
        colEnd: currentVisualCol + vLen,
        visualLen: vLen
      });

      text += wText;
      currentVisualCol += vLen;
    }

    return { text: text, words: map, totalVisualCols: currentVisualCol };
  }

  function mapChordXToLyricCol(chordX, lyricMap, pageLeftX, avgCharWidth) {
    if (!lyricMap || !lyricMap.words.length) {
      return Math.max(0, Math.round((chordX - pageLeftX) / avgCharWidth));
    }

    const words = lyricMap.words;
    const first = words[0];
    const last = words[words.length - 1];

    if (chordX <= first.x0) return 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (chordX >= w.x0 && chordX <= w.x1) {
        const spanPx = Math.max(1, w.x1 - w.x0);
        const ratio = (chordX - w.x0) / spanPx;
        return Math.round(w.colStart + ratio * w.visualLen);
      }
      if (i + 1 < words.length) {
        const next = words[i + 1];
        if (chordX > w.x1 && chordX < next.x0) {
          const gapPx = Math.max(1, next.x0 - w.x1);
          const ratio = (chordX - w.x1) / gapPx;
          return Math.round(w.colEnd + ratio * (next.colStart - w.colEnd));
        }
      }
    }

    const extraCols = Math.round((chordX - last.x1) / avgCharWidth);
    return Math.max(last.colEnd, last.colEnd + Math.min(extraCols, 12));
  }

  function renderPositionedChords(items) {
    if (!items.length) return '';
    const sorted = items.slice().sort(function (a, b) {
      return a.col - b.col;
    });

    let line = '';
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const desiredCol = Math.max(0, item.col);
      const minCol = line.length === 0 ? 0 : line.length + 1;
      const targetCol = Math.max(desiredCol, minCol);
      if (targetCol > line.length) {
        line += ' '.repeat(targetCol - line.length);
      }
      line += item.chord;
    }
    return line;
  }

  function parseRawTextToAlignedSheet(rawText) {
    const raw = String(rawText || '').replace(/\r\n/g, '\n');
    const rawLines = raw.split('\n');

    let explicitKey = '';
    const explicitMatch = raw.match(EXPLICIT_KEY_RE);
    if (explicitMatch && explicitMatch[1]) {
      const normK = normalizeOcrChordToken(explicitMatch[1]);
      if (isChordToken(normK)) explicitKey = normK;
    }

    const cleanedLines = [];
    const allChords = [];
    let consecutiveBlanks = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        consecutiveBlanks++;
        if (consecutiveBlanks <= 1 && cleanedLines.length > 0) {
          cleanedLines.push('');
        }
        continue;
      }

      if (isWatermarkOrHeaderLine(trimmed)) continue;

      consecutiveBlanks = 0;
      const type = classifyTextLine(line);

      if (type === 'chord') {
        const normalizedLine = line.replace(/\S+/g, function (tok) {
          if (CHORD_LINE_DECOR_RE.test(tok)) return tok;
          const norm = normalizeOcrChordToken(tok);
          if (isChordToken(norm)) {
            allChords.push(norm);
            return norm;
          }
          return tok;
        });
        cleanedLines.push(normalizedLine.replace(/\s+$/, ''));
      } else if (type === 'mixed') {
        const inlineRe = /\[([^\]]+)\]/g;
        let hasInline = false;
        const normalizedMixed = line.replace(inlineRe, function (full, inner) {
          const norm = normalizeOcrChordToken(inner);
          if (isChordToken(norm)) {
            hasInline = true;
            allChords.push(norm);
            return '[' + norm + ']';
          }
          // Check instrumental bar block [| C | G/B |]
          let barHit = false;
          const barMapped = inner.split(/(\s+|\|+)/).map(function (part) {
            const pTrim = part.trim();
            if (!pTrim || /^\|+$/.test(pTrim)) return part;
            const n2 = normalizeOcrChordToken(pTrim);
            if (isChordToken(n2)) {
              barHit = true;
              allChords.push(n2);
              return n2;
            }
            return part;
          }).join('');
          if (barHit) {
            hasInline = true;
            return '[' + barMapped + ']';
          }
          return full;
        });
        if (!hasInline) {
          const secPref = line.match(SECTION_PREFIX_RE);
          if (secPref) {
            const restNorm = secPref[2].replace(/\S+/g, function (tok) {
              if (CHORD_LINE_DECOR_RE.test(tok)) return tok;
              const norm = normalizeOcrChordToken(tok);
              if (isChordToken(norm)) {
                allChords.push(norm);
                return norm;
              }
              return tok;
            });
            cleanedLines.push(secPref[1].trim() + ': ' + restNorm.trim());
          } else {
            cleanedLines.push(normalizedMixed.replace(/\s+$/, ''));
          }
        } else {
          cleanedLines.push(normalizedMixed.replace(/\s+$/, ''));
        }
      } else {
        cleanedLines.push(trimmed);
      }
    }

    while (cleanedLines.length && cleanedLines[cleanedLines.length - 1] === '') {
      cleanedLines.pop();
    }

    const joined = cleanedLines.join('\n');
    const isAlreadyChordPro = /\[[A-G|#b][^\]]*\]/.test(joined) || CHORDPRO_COMMENT_RE.test(joined);
    const chordPro = isAlreadyChordPro
      ? normalizeThaiLeadingVowelChords(joined)
      : convertMonospaceToChordPro(joined);
    const alignedText = isAlreadyChordPro ? convertChordProToMonospace(chordPro) : joined;
    const originalKey = explicitKey || detectOriginalKey(allChords, raw);

    return {
      alignedText: alignedText,
      monospaceText: alignedText,
      chordPro: chordPro,
      chordpro_content: chordPro,
      originalKey: originalKey,
      original_key: originalKey,
      chords: uniqueChords(allChords),
      lineCount: cleanedLines.length,
      source: 'text'
    };
  }

  function alignOcrDataToChordSheet(ocrData) {
    if (typeof ocrData === 'string') {
      return parseRawTextToAlignedSheet(ocrData);
    }
    if (!ocrData || typeof ocrData !== 'object') {
      return {
        alignedText: '',
        monospaceText: '',
        chordPro: '',
        chordpro_content: '',
        originalKey: '',
        original_key: '',
        chords: [],
        lineCount: 0,
        source: 'text'
      };
    }

    // Direct JSON Vision AI response object
    if (typeof ocrData.chordpro_content === 'string' && ocrData.chordpro_content.trim()) {
      const cp = normalizeThaiLeadingVowelChords(ocrData.chordpro_content.trim());
      const mono = convertChordProToMonospace(cp);
      const chords = uniqueChords(extractChordsFromText(cp));
      const origKey = ocrData.original_key || detectOriginalKey(chords, cp) || 'C';
      return {
        alignedText: mono,
        monospaceText: mono,
        chordPro: cp,
        chordpro_content: cp,
        originalKey: origKey,
        original_key: origKey,
        title: ocrData.title || '',
        artist: ocrData.artist || '',
        chords: chords,
        lineCount: cp.split('\n').length,
        source: 'vision-ai'
      };
    }

    const data = ocrData.data && typeof ocrData.data === 'object' ? ocrData.data : ocrData;
    const rawText = typeof data.text === 'string' ? data.text : '';
    const ocrLines = extractOcrLines(data);

    if (!ocrLines || !hasValidWordBboxes(ocrLines)) {
      return parseRawTextToAlignedSheet(rawText);
    }

    let explicitKey = '';
    const explicitMatch = rawText.match(EXPLICIT_KEY_RE);
    if (explicitMatch && explicitMatch[1]) {
      const normK = normalizeOcrChordToken(explicitMatch[1]);
      if (isChordToken(normK)) explicitKey = normK;
    }

    const sortedLines = ocrLines
      .filter(function (l) {
        return l && ((l.text && l.text.trim()) || (Array.isArray(l.words) && l.words.length > 0));
      })
      .slice()
      .sort(function (a, b) {
        const ay = a.bbox && typeof a.bbox.y0 === 'number' ? a.bbox.y0 : 0;
        const by = b.bbox && typeof b.bbox.y0 === 'number' ? b.bbox.y0 : 0;
        return ay - by;
      });

    let pageLeftX = Infinity;
    let totalCharPx = 0;
    let totalVisualChars = 0;

    const prepared = [];
    for (let i = 0; i < sortedLines.length; i++) {
      const l = sortedLines[i];
      const words = Array.isArray(l.words)
        ? l.words.filter(function (w) {
            return w && typeof w.text === 'string' && w.text.trim().length > 0;
          })
        : [];
      const lineText =
        typeof l.text === 'string' && l.text.trim()
          ? l.text.trim()
          : words.map(function (w) { return w.text.trim(); }).join(' ');

      if (!lineText) continue;

      if (!explicitKey) {
        const km = lineText.match(EXPLICIT_KEY_RE);
        if (km && km[1]) {
          const nk = normalizeOcrChordToken(km[1]);
          if (isChordToken(nk)) explicitKey = nk;
        }
      }

      if (isWatermarkOrHeaderLine(lineText)) continue;

      const type = classifyTextLine(lineText);
      const y0 = l.bbox && typeof l.bbox.y0 === 'number' ? l.bbox.y0 : (words[0] && words[0].bbox ? words[0].bbox.y0 : 0);
      const y1 = l.bbox && typeof l.bbox.y1 === 'number' ? l.bbox.y1 : (words[0] && words[0].bbox ? words[0].bbox.y1 : y0 + 20);

      for (let w = 0; w < words.length; w++) {
        const word = words[w];
        if (word.bbox && typeof word.bbox.x0 === 'number' && typeof word.bbox.x1 === 'number') {
          if (word.bbox.x0 < pageLeftX) pageLeftX = word.bbox.x0;
          const vLen = countVisualChars(word.text.trim());
          const width = word.bbox.x1 - word.bbox.x0;
          if (vLen > 0 && width > 2) {
            totalCharPx += width;
            totalVisualChars += vLen;
          }
        }
      }

      prepared.push({
        type: type,
        text: lineText,
        words: words,
        y0: y0,
        y1: y1,
        height: Math.max(10, y1 - y0)
      });
    }

    if (!prepared.length) {
      return parseRawTextToAlignedSheet(rawText);
    }

    if (!isFinite(pageLeftX)) pageLeftX = 0;
    const avgCharWidth = totalVisualChars > 0 ? Math.max(6, totalCharPx / totalVisualChars) : 12;

    const heights = prepared.map(function (p) { return p.height; }).sort(function (a, b) { return a - b; });
    const medianHeight = heights[Math.floor(heights.length / 2)] || 24;

    const outputLines = [];
    const allChords = [];

    for (let i = 0; i < prepared.length; i++) {
      const cur = prepared[i];

      if (i > 0) {
        const prev = prepared[i - 1];
        const vGap = cur.y0 - prev.y1;
        if (vGap > medianHeight * 1.45 && outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
          outputLines.push('');
        }
      }

      if (cur.type === 'section') {
        if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== '') {
          outputLines.push('');
        }
        outputLines.push(cur.text);
        continue;
      }

      if (cur.type === 'chord') {
        const next = i + 1 < prepared.length ? prepared[i + 1] : null;
        const isPairedWithLyric =
          next &&
          next.type === 'lyric' &&
          next.y0 - cur.y1 <= medianHeight * 1.8;

        const lyricMap = isPairedWithLyric ? buildLyricWordMap(next.words, avgCharWidth) : null;

        const positioned = [];
        const sortedWords = cur.words.slice().sort(function (a, b) {
          return (a.bbox ? a.bbox.x0 : 0) - (b.bbox ? b.bbox.x0 : 0);
        });

        for (let w = 0; w < sortedWords.length; w++) {
          const word = sortedWords[w];
          const rawTok = word.text.trim();
          if (!rawTok) continue;
          if (CHORD_LINE_DECOR_RE.test(rawTok)) {
            const col = word.bbox
              ? mapChordXToLyricCol(word.bbox.x0, lyricMap, pageLeftX, avgCharWidth)
              : w * 4;
            positioned.push({ chord: rawTok, col: col });
            continue;
          }

          const norm = normalizeOcrChordToken(rawTok);
          if (isChordToken(norm)) allChords.push(norm);
          const col = word.bbox
            ? mapChordXToLyricCol(word.bbox.x0, lyricMap, pageLeftX, avgCharWidth)
            : w * 4;
          positioned.push({ chord: isChordToken(norm) ? norm : rawTok, col: col });
        }

        const chordLineStr = renderPositionedChords(positioned);
        if (chordLineStr) outputLines.push(chordLineStr);

        if (isPairedWithLyric && lyricMap) {
          outputLines.push(lyricMap.text);
          i++;
        }
        continue;
      }

      if (cur.type === 'mixed') {
        const secPref = cur.text.match(SECTION_PREFIX_RE);
        if (secPref) {
          const restNorm = secPref[2].replace(/\S+/g, function (tok) {
            if (CHORD_LINE_DECOR_RE.test(tok)) return tok;
            const norm = normalizeOcrChordToken(tok);
            if (isChordToken(norm)) {
              allChords.push(norm);
              return norm;
            }
            return tok;
          });
          outputLines.push(secPref[1].trim() + ': ' + restNorm.trim());
        } else {
          const normMixed = cur.text.replace(/\[([^\]]+)\]/g, function (full, inner) {
            const norm = normalizeOcrChordToken(inner);
            if (isChordToken(norm)) {
              allChords.push(norm);
              return '[' + norm + ']';
            }
            return full;
          });
          outputLines.push(normMixed);
        }
        continue;
      }

      const lyricMap = buildLyricWordMap(cur.words, avgCharWidth);
      outputLines.push(lyricMap.text || cur.text);
    }

    while (outputLines.length && outputLines[outputLines.length - 1] === '') {
      outputLines.pop();
    }

    const alignedText = outputLines.join('\n');
    const chordPro = convertMonospaceToChordPro(alignedText);
    const originalKey = explicitKey || detectOriginalKey(allChords, rawText);

    return {
      alignedText: alignedText,
      monospaceText: alignedText,
      chordPro: chordPro,
      chordpro_content: chordPro,
      originalKey: originalKey,
      original_key: originalKey,
      chords: uniqueChords(allChords),
      lineCount: outputLines.length,
      source: 'bbox'
    };
  }

  /* ============================================================================
   * 8) Image Preprocessing & Main Parse Pipeline (Vision AI + Memory + OCR)
   * ============================================================================ */

  async function preprocessImageForOcr(blob, opts) {
    if (!blob || typeof document === 'undefined' || typeof Blob === 'undefined') {
      return blob;
    }

    const minWidth = (opts && opts.minWidth) || 1200;
    const maxDim = (opts && opts.maxDim) || 2800;

    try {
      const img = await loadBlobAsImage(blob);
      const srcW = img.naturalWidth || img.width || 0;
      const srcH = img.naturalHeight || img.height || 0;
      if (!srcW || !srcH) return blob;

      let scale = 1;
      if (srcW < minWidth) scale = minWidth / srcW;
      if (srcW * scale > maxDim) scale = maxDim / srcW;
      if (srcH * scale > maxDim) scale = Math.min(scale, maxDim / srcH);

      const dstW = Math.max(1, Math.round(srcW * scale));
      const dstH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return blob;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, dstW, dstH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, dstW, dstH);

      const imgData = ctx.getImageData(0, 0, dstW, dstH);
      const pixels = imgData.data;

      let lumSum = 0;
      const pixelCount = pixels.length / 4;
      for (let i = 0; i < pixels.length; i += 4) {
        lumSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }
      const avgLum = pixelCount > 0 ? lumSum / pixelCount : 200;
      const invertDarkBg = avgLum < 110;

      const contrast = 1.45;
      for (let i = 0; i < pixels.length; i += 4) {
        let gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        if (invertDarkBg) gray = 255 - gray;
        gray = (gray - 128) * contrast + 128;
        if (gray < 0) gray = 0;
        else if (gray > 255) gray = 255;
        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
        pixels[i + 3] = 255;
      }

      ctx.putImageData(imgData, 0, 0);

      const processed = await new Promise(function (resolve) {
        canvas.toBlob(function (b) {
          resolve(b || blob);
        }, 'image/png');
      });

      return processed || blob;
    } catch (_err) {
      return blob;
    }
  }

  function loadBlobAsImage(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof URL === 'undefined' || typeof Image === 'undefined') {
        reject(new Error('Image API unavailable'));
        return;
      }
      const objUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objUrl);
        resolve(img);
      };
      img.onerror = function (err) {
        URL.revokeObjectURL(objUrl);
        reject(err || new Error('Failed to decode image'));
      };
      img.src = objUrl;
    });
  }

  async function fetchImageBlob(url) {
    if (!url) throw new Error('ไม่พบแหล่งรูปภาพสำหรับแกะคอร์ด');
    if (typeof Blob !== 'undefined' && url instanceof Blob) {
      return url;
    }

    const src = String(url).trim();
    if (!src) throw new Error('ไม่พบ URL รูปภาพ');

    if (src.startsWith('blob:') || src.startsWith('data:')) {
      const res = await fetch(src);
      if (!res.ok) throw new Error('โหลดรูปภาพไม่สำเร็จ (' + res.status + ')');
      return await res.blob();
    }

    const candidates = [
      src,
      'https://wsrv.nl/?url=' + encodeURIComponent(src) + '&output=png',
      'https://images.weserv.nl/?url=' + encodeURIComponent(src) + '&output=png'
    ];

    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      try {
        const res = await fetch(candidates[i], { mode: 'cors' });
        if (res.ok) {
          const b = await res.blob();
          if (b && b.size > 0) return b;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error('ไม่สามารถดาวน์โหลดรูปภาพได้');
  }

  async function defaultTesseractRunner(imageBlob, opts) {
    const onProgress = opts && typeof opts.onProgress === 'function' ? opts.onProgress : null;
    if (onProgress) onProgress('กำลังโหลดเอนจิน OCR (ไทย + อังกฤษ)...', 22);

    const mod = await import(TESSERACT_CDN_URL);
    const Tesseract = mod.default || mod;
    const createWorker = Tesseract.createWorker || mod.createWorker;

    if (typeof createWorker !== 'function') {
      throw new Error('ไม่สามารถเริ่มต้น Tesseract.js ได้');
    }

    const worker = await createWorker(['tha', 'eng'], 1, {
      logger: function (m) {
        if (!onProgress || !m) return;
        const p = typeof m.progress === 'number' ? m.progress : 0;
        if (m.status === 'recognizing text') {
          onProgress('กำลังอ่านคอร์ดและเนื้อเพลงจากรูป...', Math.round(35 + p * 52));
        } else if (m.status === 'loading language traineddata') {
          onProgress('กำลังโหลดข้อมูลภาษาไทย/อังกฤษ...', Math.round(24 + p * 11));
        }
      }
    });

    try {
      return await worker.recognize(imageBlob);
    } finally {
      try {
        await worker.terminate();
      } catch (_e) {}
    }
  }

  /**
   * Main entry point:
   * 1. Fetches learned rules + verified examples from `chord_parser_memory` for `source_domain`
   * 2. Builds Dynamic Few-Shot Vision AI System Prompt
   * 3. Dispatches to Vision AI (or Spatial OCR + Learned Memory Post-Processor fallback)
   * 4. Always outputs standardized ChordPro format (`chordpro_content`, `original_key`, `source_domain`, `is_verified`)
   */
  async function parseChordImage(imageSource, options) {
    const opts = options || {};
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    const fetcher = typeof opts.fetchImageBlob === 'function' ? opts.fetchImageBlob : fetchImageBlob;
    const sourceDomain = detectSourceDomain(opts.sourceDomain || opts.song || imageSource);

    onProgress('กำลังดึงความจำระบบ (Dynamic Few-Shot Memory)...', 6);
    const memory = await fetchParserMemory(sourceDomain);
    const systemPrompt = buildVisionSystemPrompt(memory);

    onProgress('กำลังเตรียมรูปภาพคอร์ด...', 10);
    let imageBlob = imageSource;
    if (!(typeof Blob !== 'undefined' && imageSource instanceof Blob)) {
      if (typeof imageSource === 'string') {
        imageBlob = await fetcher(imageSource);
      }
    }

    // Try Vision AI first unless caller explicitly supplied a custom ocrRunner
    if (!opts.ocrRunner) {
      try {
        const visionJson = await tryVisionAiChordPro(imageBlob, {
          systemPrompt: systemPrompt,
          sourceDomain: sourceDomain,
          memory: memory,
          songId: opts.songId,
          visionRunner: opts.visionRunner,
          onProgress: onProgress
        });

        if (visionJson && typeof visionJson.chordpro_content === 'string' && visionJson.chordpro_content.trim()) {
          onProgress('กำลังตรวจสอบความแม่นยำ ChordPro...', 94);
          const cleanedCp = applyLearnedCorrectionRules(visionJson.chordpro_content.trim(), memory.correctionRules);
          const mono = convertChordProToMonospace(cleanedCp);
          const chords = uniqueChords(extractChordsFromText(cleanedCp));
          const origKey = String(visionJson.original_key || '').trim() || detectOriginalKey(chords, cleanedCp) || 'C';

          onProgress('แกะคอร์ดด้วย Vision AI เสร็จสมบูรณ์', 100);
          return {
            title: String(visionJson.title || '').trim(),
            artist: String(visionJson.artist || '').trim(),
            original_key: origKey,
            originalKey: origKey,
            chordpro_content: cleanedCp,
            chordPro: cleanedCp,
            alignedText: mono,
            monospaceText: mono,
            source_domain: sourceDomain,
            sourceDomain: sourceDomain,
            is_verified: false,
            rawAiOutput: visionJson.chordpro_content.trim(),
            chords: chords,
            lineCount: cleanedCp.split('\n').length,
            source: 'vision-ai',
            isFallbackOcr: false,
            systemPromptUsed: systemPrompt,
            memoryApplied: {
              rulesCount: memory.correctionRules.length,
              examplesCount: memory.verifiedExamples.length
            },
            parsedAt: Date.now()
          };
        }
      } catch (_visionErr) {
        // If explicit visionRunner threw in test or Vision API failed, fall through only if fallback not disabled
        if (opts.strictVision) throw _visionErr;
      }
    }

    // Fallback: Preprocess + Spatial OCR + ChordPro Conversion + Learned Rules Application
    let processed = imageBlob;
    if (!opts.skipPreprocess && typeof Blob !== 'undefined' && imageBlob instanceof Blob) {
      onProgress('กำลังปรับความคมชัดรูปภาพ...', 15);
      processed = await preprocessImageForOcr(imageBlob);
    }

    const runner = typeof opts.ocrRunner === 'function' ? opts.ocrRunner : defaultTesseractRunner;
    const ocrResult = await runner(processed, {
      onProgress: onProgress,
      songId: opts.songId,
      systemPrompt: systemPrompt,
      memory: memory
    });

    onProgress('กำลังแปลงเป็น ChordPro และตรวจด้วยความจำระบบ...', 94);
    const aligned = alignOcrDataToChordSheet(ocrResult);
    const rawCp = aligned.chordpro_content || aligned.chordPro || '';
    const cleanedCp = cleanOcrArtifacts(rawCp);
    const postLearnedCp = applyLearnedCorrectionRules(cleanedCp, memory.correctionRules);
    const postMono = convertChordProToMonospace(postLearnedCp);
    const finalChords = uniqueChords(extractChordsFromText(postLearnedCp));
    const finalKey = aligned.originalKey || detectOriginalKey(finalChords, postLearnedCp) || 'C';

    onProgress('แกะคอร์ดเสร็จสมบูรณ์', 100);
    return {
      title: aligned.title || '',
      artist: aligned.artist || '',
      original_key: finalKey,
      originalKey: finalKey,
      chordpro_content: postLearnedCp,
      chordPro: postLearnedCp,
      alignedText: postMono,
      monospaceText: postMono,
      source_domain: sourceDomain,
      sourceDomain: sourceDomain,
      is_verified: false,
      rawAiOutput: rawCp,
      chords: finalChords,
      lineCount: postLearnedCp ? postLearnedCp.split('\n').length : 0,
      source: 'fallback-ocr',
      isFallbackOcr: true,
      systemPromptUsed: systemPrompt,
      memoryApplied: {
        rulesCount: memory.correctionRules.length,
        examplesCount: memory.verifiedExamples.length
      },
      parsedAt: Date.now()
    };
  }

  /* ============================================================================
   * 9) Persistence / DB Cache
   * ============================================================================ */

  function getImageSignature(song) {
    if (!song || typeof song !== 'object') return '';
    if (Array.isArray(song.images) && song.images.length && song.images[0]) {
      return 'img:' + String(song.images[0]).slice(0, 180);
    }
    if (Array.isArray(song.imgUrls) && song.imgUrls.length && song.imgUrls[0]) {
      return 'url:' + String(song.imgUrls[0]).slice(0, 180);
    }
    if (Array.isArray(song.imgIds) && song.imgIds.length && song.imgIds[0]) {
      return 'idb:' + String(song.imgIds[0]);
    }
    if (song.imageUrl) {
      return 'url:' + String(song.imageUrl).slice(0, 180);
    }
    return '';
  }

  function readCacheMap() {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function writeCacheMap(map) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify(map));
    } catch (_e) {}
  }

  function normalizeCachedRecord(record, song) {
    if (!record) return null;
    const fallbackDomain = detectSourceDomain(song);

    if (typeof record === 'string') {
      const trimmed = record.trim();
      if (!trimmed) return null;
      const parsed = parseRawTextToAlignedSheet(trimmed);
      return {
        original_key: parsed.originalKey,
        originalKey: parsed.originalKey,
        chordpro_content: parsed.chordPro,
        chordPro: parsed.chordPro,
        alignedText: parsed.alignedText,
        monospaceText: parsed.alignedText,
        source_domain: fallbackDomain,
        sourceDomain: fallbackDomain,
        is_verified: false,
        rawAiOutput: parsed.chordPro,
        chords: parsed.chords,
        lineCount: parsed.lineCount,
        source: parsed.source,
        parsedAt: Date.now()
      };
    }

    if (typeof record === 'object') {
      const rawCp = String(record.chordpro_content || record.chordPro || '').trim();
      const rawMono = String(record.alignedText || record.monospaceText || '').trim();
      if (!rawCp && !rawMono) return null;

      const chordPro = rawCp
        ? cleanOcrArtifacts(rawCp)
        : convertMonospaceToChordPro(rawMono);
      const alignedText = cleanOcrArtifacts(rawMono) || convertChordProToMonospace(chordPro);
      const chords = Array.isArray(record.chords) && record.chords.length
        ? record.chords
        : uniqueChords(extractChordsFromText(chordPro));
      const origKey = record.original_key || record.originalKey || detectOriginalKey(chords, chordPro) || '';
      const srcDomain = record.source_domain || record.sourceDomain || fallbackDomain;

      return {
        original_key: origKey,
        originalKey: origKey,
        chordpro_content: chordPro,
        chordPro: chordPro,
        alignedText: alignedText,
        monospaceText: alignedText,
        source_domain: srcDomain,
        sourceDomain: srcDomain,
        is_verified: Boolean(record.is_verified),
        rawAiOutput: record.rawAiOutput || chordPro,
        chords: chords,
        lineCount: record.lineCount || chordPro.split('\n').length,
        source: record.source || 'text',
        memoryApplied: record.memoryApplied || null,
        systemPromptUsed: record.systemPromptUsed || '',
        parsedAt: record.parsedAt || Date.now(),
        verifiedAt: record.verifiedAt || null
      };
    }

    return null;
  }

  function getCachedParsedChord(song) {
    if (!song || typeof song !== 'object') return null;

    // 1) Top-level standardized ChordPro song fields (from Supabase songs table)
    if (typeof song.chordpro_content === 'string' && song.chordpro_content.trim()) {
      const fromFields = normalizeCachedRecord({
        chordpro_content: song.chordpro_content,
        original_key: song.original_key || song.key || '',
        source_domain: song.source_domain || detectSourceDomain(song),
        is_verified: Boolean(song.is_verified),
        rawAiOutput: (song.parsedChordSheet && song.parsedChordSheet.rawAiOutput) || song.chordpro_content
      }, song);
      if (fromFields) return fromFields;
    }

    // 2) song.parsedChordSheet object
    if (song.parsedChordSheet) {
      const fromSong = normalizeCachedRecord(song.parsedChordSheet, song);
      if (fromSong) return fromSong;
    }

    // 3) LocalStorage cache by song.id or image signature
    const cache = readCacheMap();
    if (song.id && cache[song.id]) {
      const fromId = normalizeCachedRecord(cache[song.id], song);
      if (fromId) return fromId;
    }

    const sig = getImageSignature(song);
    if (sig && cache[sig]) {
      const fromSig = normalizeCachedRecord(cache[sig], song);
      if (fromSig) return fromSig;
    }

    return null;
  }

  function saveParsedChord(song, parsedData, saveToSongAdapter) {
    const normalized = normalizeCachedRecord(parsedData, song);
    if (!normalized) return null;

    const cache = readCacheMap();
    if (song && song.id) cache[song.id] = normalized;
    const sig = getImageSignature(song);
    if (sig) cache[sig] = normalized;
    writeCacheMap(cache);

    if (song && typeof song === 'object') {
      song.original_key = normalized.original_key;
      song.chordpro_content = normalized.chordpro_content;
      song.source_domain = normalized.source_domain;
      song.is_verified = normalized.is_verified;
      song.parsedChordSheet = normalized;
    }

    if (typeof saveToSongAdapter === 'function' && song && song.id) {
      try {
        saveToSongAdapter(song.id, normalized);
      } catch (_e) {}
    }

    return normalized;
  }

  function clearCachedParsedChord(songOrId) {
    if (!songOrId) return;
    const cache = readCacheMap();
    if (typeof songOrId === 'string') {
      delete cache[songOrId];
    } else if (typeof songOrId === 'object') {
      if (songOrId.id) delete cache[songOrId.id];
      const sig = getImageSignature(songOrId);
      if (sig) delete cache[sig];
    }
    writeCacheMap(cache);
  }

  /* ============================================================================
   * Public API
   * ============================================================================ */

  const api = {
    CACHE_KEY: CACHE_KEY,
    MEMORY_KEY: MEMORY_KEY,
    VISION_CFG_KEY: VISION_CFG_KEY,
    CHORD_RE: CHORD_RE,
    VISION_SYSTEM_PROMPT_TEMPLATE: VISION_SYSTEM_PROMPT_TEMPLATE,

    // Configuration & Domain Detection
    configureBackend: configureBackend,
    detectSourceDomain: detectSourceDomain,
    getVisionConfig: getVisionConfig,
    setVisionConfig: setVisionConfig,

    // Music theory & transposition
    noteIndex: noteIndex,
    isChordToken: isChordToken,
    normalizeOcrChordToken: normalizeOcrChordToken,
    transposeChord: transposeChord,
    preferFlat: preferFlat,
    detectOriginalKey: detectOriginalKey,
    convertMonospaceToChordPro: convertMonospaceToChordPro,
    convertChordProToMonospace: convertChordProToMonospace,
    transposeMonospaceText: transposeMonospaceText,
    transposeChordProText: transposeChordProText,

    // Dynamic Learning Memory & Few-Shot Prompt Builder
    buildVisionSystemPrompt: buildVisionSystemPrompt,
    fetchParserMemory: fetchParserMemory,
    extractLearningDiff: extractLearningDiff,
    applyLearnedCorrectionRules: applyLearnedCorrectionRules,
    cleanOcrArtifacts: cleanOcrArtifacts,
    sanitizeChordLineText: sanitizeChordLineText,
    sanitizeChordPro: cleanOcrArtifacts,
    saveVerifiedAndTeach: saveVerifiedAndTeach,

    // Spatial OCR alignment
    classifyTextLine: classifyTextLine,
    alignOcrDataToChordSheet: alignOcrDataToChordSheet,
    parseRawTextToAlignedSheet: parseRawTextToAlignedSheet,

    // Image preprocessing & Vision/OCR runner
    preprocessImageForOcr: preprocessImageForOcr,
    fetchImageBlob: fetchImageBlob,
    parseChordImage: parseChordImage,
    parseImageToChords: parseChordImage, // Alias for app.js OCR modal

    // Persistence / DB cache
    getCachedParsedChord: getCachedParsedChord,
    saveParsedChord: saveParsedChord,
    clearCachedParsedChord: clearCachedParsedChord
  };

  global.MellowChordParser = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
