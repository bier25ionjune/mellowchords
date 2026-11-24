(function (global) {
  'use strict';

  /**
   * ============================================================================
   * Mellow Chords — Image-to-Text Chord Parser Service
   * Self-contained music theory, transposition, spatial OCR alignment & caching.
   * ============================================================================
   */

  const CACHE_KEY = 'mellowchords.parsedChords.v1';
  const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

  const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const BASE   = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FLAT_KEYS = [5, 10, 3, 8, 1]; // F, Bb, Eb, Ab, Db

  // Strict chord regex: matches standard chords (C#m7, Bb/D, F#m, Gadd9, Em7, Bm7b5, Asus4, etc.)
  // while avoiding common English words like "And", "Bad", "Fade", "Bridge", "Chorus".
  const CHORD_RE =
    /^[A-G][#b]?(?:(?:maj|min|dim|aug|sus|add|m|M)(?:2|4|5|6|7|9|11|13)?|(?:2|4|5|6|7|9|11|13)|[+\-°])*(?:[#b](?:5|9|11|13))?(?:\((?:add|sus|maj|min|dim|aug|no)?[#b+\-\d,]+\))?(?:\/[A-G][#b]?)?$/;

  // Thai combining characters (vowels/tone marks that have 0 visual width above/below base consonants)
  const THAI_COMBINING_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
  const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;

  // Section header patterns
  const SECTION_ONLY_RE =
    /^\s*[\[\(\*]*\s*(?:intro|verse\s*\d*|pre[\s-]*chorus\s*\d*|chorus\s*\d*|hook\s*\d*|solo\s*\d*|bridge\s*\d*|outro|ending|interlude|instru(?:ment(?:al)?)?|coda|tag|rap|ท่อน\s*(?:ฮุค|แยก|จบ|อินโทร|โซโล่)?|อินโทร|ฮุค|โซโล่|จบ)\s*[\]\)\*:]*\s*$/i;

  const SECTION_PREFIX_RE =
    /^\s*[\[\(]?\s*(intro|verse\s*\d*|pre[\s-]*chorus\s*\d*|chorus\s*\d*|hook\s*\d*|solo\s*\d*|bridge\s*\d*|outro|ending|interlude|instru(?:ment(?:al)?)?|อินโทร|ฮุค|โซโล่)\s*[\]\)]?\s*[:\-–—]\s*(.+)$/i;

  // Common Thai chord website headers, watermarks, and metadata lines to strip
  const WATERMARK_LINE_RE =
    /(?:chordtabs\.in\.th|chordzaa|dochord|siamchord|guitarthai|chordhit|https?:\/\/|www\.|\.in\.th|\.com\b|คอร์ดเพลง\s*[:：]?|ศิลปิน\s*[:：]|อัลบั้ม\s*[:：]|ต้นฉบับ\s*[:：]|จังหวะ\s*[:：]|tempo\s*[:：]|tuning\s*[:：]|capo\s*[:：]|key\s*[:：=]|คีย์\s*[:：=]|ตั้งสาย\s*[:：]|กดไลค์|ติดตาม|facebook|youtube|line\s*@)/i;

  const EXPLICIT_KEY_RE = /(?:key|คีย์(?:เดิม|เพลง)?)\s*[:：=]?\s*([A-G][#b♯♭]?m?)\b/i;

  // Non-chord punctuation tokens commonly seen on chord lines (bar lines, repeat markers)
  const CHORD_LINE_DECOR_RE = /^[\|\[\]\(\)\/\\\-–—•·.,:;*~xX0-9]+$/;

  /* ============================================================================
   * 1) Music Theory & Transposition Helpers
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
    if (!cleaned || cleaned.length > 16) return false;
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

    // Normalize Unicode musical accidentals & fullwidth symbols
    t = t
      .replace(/[♯＃]/g, '#')
      .replace(/♭/g, 'b')
      .replace(/[–—]/g, '-')
      .replace(/[／]/g, '/');

    // Strip surrounding brackets/pipes/punctuation (keep internal parentheses like Cadd9 or C(add9))
    t = t.replace(/^[\|\[\{\.,;:*~•·]+/, '').replace(/[\|\]\}\.,;:*~•·]+$/, '');
    if (t.startsWith('(') && t.endsWith(')') && !t.slice(1, -1).includes('(')) {
      const inner = t.slice(1, -1).trim();
      if (inner) t = inner;
    }

    if (!t) return '';
    if (isChordToken(t)) return t;

    let candidate = t;

    // Fix lowercase root when followed by explicit sharp accidental (e.g. c#m -> C#m, f#m7 -> F#m7)
    if (/^[a-g]#/.test(candidate)) {
      candidate = candidate[0].toUpperCase() + candidate.slice(1);
    }

    // Fix OCR "rn" misread for "m" after a valid chord root (Arn -> Am, C#rn -> C#m, F#rn7 -> F#m7, Crnaj7 -> Cmaj7)
    candidate = candidate.replace(/^([A-G][#b]?)rn(aj)?/i, function (_m, root, aj) {
      const normRoot = root[0].toUpperCase() + (root[1] || '');
      return normRoot + 'm' + (aj ? aj.toLowerCase() : '');
    });

    // Fix OCR "rn" in slash chord bass or quality (rare, e.g. G/B stays G/B)
    // Fix OCR "6" misread for "G" ONLY when followed by a clear chord quality suffix or slash bass
    if (/^6(?:[#b]|m(?:aj|in)?|sus|add|dim|aug|\/[A-G])/i.test(candidate)) {
      candidate = 'G' + candidate.slice(1);
    }

    // Fix OCR "8" misread for "B" ONLY when followed by a clear chord quality suffix or slash bass
    if (/^8(?:b|m(?:aj|in)?|sus|add|dim|aug|\/[A-G])/i.test(candidate)) {
      candidate = 'B' + candidate.slice(1);
    }

    // Fix OCR trailing "l" misread for "7" on minor/major chords (e.g. Aml -> Am7, Eml -> Em7) — only if followed by nothing
    if (/^[A-G][#b]?m[lI]$/.test(candidate)) {
      candidate = candidate.slice(0, -1) + '7';
    }

    // Fix uppercase accidental B -> b in flat chords like BB -> Bb, EB -> Eb? No, too risky.
    // Fix lowercase slash bass when root is valid (e.g. G/b -> G/B, D/f# -> D/F#)
    candidate = candidate.replace(/\/([a-g])([#b]?)$/, function (_m, bass, acc) {
      return '/' + bass.toUpperCase() + acc;
    });

    return isChordToken(candidate) ? candidate : t;
  }

  function transposeChord(chord, shift, useFlat) {
    if (!chord || typeof chord !== 'string') return chord || '';
    const s = ((parseInt(shift, 10) || 0) % 12 + 12) % 12;
    if (s === 0) return chord;

    const m = chord.match(/^([A-G][#b]?)([^\/]*)(?:\/([A-G][#b]?))?$/);
    if (!m) return chord;

    const scale = useFlat ? FLATS : SHARPS;
    const tr = function (n) {
      return scale[(noteIndex(n) + s) % 12];
    };
    return tr(m[1]) + m[2] + (m[3] ? '/' + tr(m[3]) : '');
  }

  function preferFlat(key, shift) {
    const m = String(key || '').trim().match(/^([A-G][#b]?)(.*)$/);
    if (!m) return false;
    const isMinor = /^m(?!aj)/.test(m[2]);
    const s = ((parseInt(shift, 10) || 0) % 12 + 12) % 12;
    const target = (noteIndex(m[1]) + s) % 12;
    return FLAT_KEYS.includes(isMinor ? (target + 3) % 12 : target);
  }

  /**
   * Detects original key from explicit Key:/คีย์: labels first, then diatonic triad scoring
   * with first/last chord weighting.
   */
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

    // Major scale diatonic triads: I(0,Maj), ii(2,min), iii(4,min), IV(5,Maj), V(7,Maj), vi(9,min)
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
   * 2) Line Classification & Visual Width Helpers
   * ============================================================================ */

  function countVisualChars(str) {
    if (!str) return 0;
    let count = 0;
    for (let i = 0; i < str.length; i++) {
      if (!THAI_COMBINING_RE.test(str[i])) count++;
    }
    return count;
  }

  /**
   * Maps a visual column index (0-based, ignoring zero-width Thai combining marks)
   * to the actual UTF-16 string index in `str`.
   */
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
    return idx;
  }

  function classifyTextLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return 'blank';
    if (SECTION_ONLY_RE.test(trimmed)) return 'section';

    // Check inline ChordPro tags e.g. "[G]ค่ำคืนนี้[Em]เย็น"
    if (/\[[A-G][#b]?[^\]]*\]/.test(trimmed)) {
      return 'mixed';
    }

    // Check section prefix followed by chords e.g. "Intro: G Em C D"
    const secPref = trimmed.match(SECTION_PREFIX_RE);
    if (secPref) {
      const restTokens = secPref[2].trim().split(/\s+/).filter(Boolean);
      const chordHits = restTokens.filter(function (tok) {
        return isChordToken(normalizeOcrChordToken(tok));
      }).length;
      if (chordHits > 0) return 'mixed';
      return 'section';
    }

    // Lines containing Thai characters are lyrics (unless inline ChordPro handled above)
    if (THAI_CHAR_RE.test(trimmed)) {
      return 'lyric';
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
      if (isChordToken(norm)) {
        chordCount++;
      }
    }

    if (meaningfulCount === 0) return 'lyric';

    // Avoid classifying single-letter English sentence starts or words as chord lines
    // If all meaningful tokens are >= 60% valid chords, it's a chord line
    if (chordCount > 0 && chordCount / meaningfulCount >= 0.6) {
      // Extra guard: if there's only 1 token and it's "A" or "I", require no surrounding prose
      if (meaningfulCount === 1 && chordCount === 1 && rawTokens[0] === 'A') {
        return 'chord';
      }
      return 'chord';
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
          const norm = normalizeOcrChordToken(m[1]);
          if (isChordToken(norm)) {
            chords.push(norm);
            foundInline = true;
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
   * 3) Monospace <-> ChordPro Conversion & Transposition
   * ============================================================================ */

  /**
   * Extracts { chord, col } tokens from a monospace chord line.
   */
  function extractChordPositions(chordLine) {
    const positions = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(chordLine)) !== null) {
      const raw = m[0];
      if (CHORD_LINE_DECOR_RE.test(raw)) continue;
      const norm = normalizeOcrChordToken(raw);
      if (isChordToken(norm)) {
        positions.push({ chord: norm, col: m.index });
      }
    }
    return positions;
  }

  /**
   * Converts chord-over-lyric monospace text into ChordPro format (`[G]ค่ำคืนนี้ลม[Em]เย็น`),
   * preserving exact character index alignment.
   */
  function convertMonospaceToChordPro(monospaceText) {
    const lines = String(monospaceText || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const type = classifyTextLine(line);

      if (type === 'chord') {
        const chordPositions = extractChordPositions(line);
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        const nextType = nextLine !== null ? classifyTextLine(nextLine) : 'blank';

        if (nextType === 'lyric' && chordPositions.length > 0) {
          // Pair chord line with lyric line below it
          // Use visual column index so Thai combining marks don't shift chords
          let result = nextLine;
          // Insert from right to left so earlier indices remain valid
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

          out.push((result + trailingChords).replace(/\s+$/, ''));
          i++; // Consume paired lyric line
        } else if (chordPositions.length > 0) {
          // Standalone chord progression line (e.g. Intro/Solo)
          const formatted = line.replace(/\S+/g, function (tok) {
            if (CHORD_LINE_DECOR_RE.test(tok)) return tok;
            const norm = normalizeOcrChordToken(tok);
            return isChordToken(norm) ? '[' + norm + ']' : tok;
          });
          out.push(formatted.trim());
        } else {
          out.push(line);
        }
      } else if (type === 'mixed') {
        // Already contains [Chord] or section: chords
        const secPref = line.match(SECTION_PREFIX_RE);
        if (secPref && !/\[[A-G]/.test(line)) {
          const rest = secPref[2].replace(/\S+/g, function (tok) {
            if (CHORD_LINE_DECOR_RE.test(tok)) return tok;
            const norm = normalizeOcrChordToken(tok);
            return isChordToken(norm) ? '[' + norm + ']' : tok;
          });
          out.push(secPref[1] + ': ' + rest.trim());
        } else {
          out.push(line);
        }
      } else {
        out.push(line);
      }
    }

    return out.join('\n');
  }

  /**
   * Transposes a single monospace chord line while preserving column spacing.
   */
  function transposeChordLinePreservingColumns(line, shift, useFlat) {
    // Match token + following spaces
    return line.replace(/(\S+)([ \t]*)/g, function (full, tok, spaces) {
      if (CHORD_LINE_DECOR_RE.test(tok)) return full;
      const norm = normalizeOcrChordToken(tok);
      if (!isChordToken(norm)) return full;

      const transposed = transposeChord(norm, shift, useFlat);
      const diff = transposed.length - tok.length;

      if (diff === 0 || !spaces) {
        return transposed + spaces;
      }
      if (diff > 0) {
        // Chord got longer: absorb from trailing spaces while keeping at least 1 space
        const removable = Math.max(0, spaces.length - 1);
        const removeCount = Math.min(diff, removable);
        return transposed + spaces.slice(removeCount);
      }
      // Chord got shorter: pad with spaces to keep next chord aligned
      return transposed + spaces + ' '.repeat(-diff);
    });
  }

  /**
   * Transposes every chord token in chord lines and inline [Chord] tokens while preserving column spacing.
   */
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
          if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
            return line.replace(/\[([^\]]+)\]/g, function (full, inner) {
              const norm = normalizeOcrChordToken(inner);
              return isChordToken(norm) ? '[' + transposeChord(norm, s, useFlat) + ']' : full;
            });
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

  /**
   * Transposes every [Chord] token in ChordPro format.
   */
  function transposeChordProText(text, shift, originalKey) {
    const s = parseInt(shift, 10) || 0;
    if (!text || s === 0) return text || '';

    const key = originalKey || detectOriginalKey(extractChordsFromText(text), text);
    const useFlat = preferFlat(key, s);

    return String(text).replace(/\[([^\]]+)\]/g, function (full, inner) {
      const norm = normalizeOcrChordToken(inner);
      if (!isChordToken(norm)) return full;
      return '[' + transposeChord(norm, s, useFlat) + ']';
    });
  }

  /* ============================================================================
   * 4) Spatial OCR Alignment Engine
   * ============================================================================ */

  function isWatermarkOrHeaderLine(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    if (WATERMARK_LINE_RE.test(trimmed)) {
      // Do not strip if it actually contains multiple valid chords and no URL/website name
      const hasSite = /(?:chordtabs|chordzaa|dochord|siamchord|guitarthai|http|www\.|\.in\.th|\.com)/i.test(trimmed);
      if (hasSite) return true;
      if (/^(?:คอร์ดเพลง|ศิลปิน|อัลบั้ม|ต้นฉบับ|จังหวะ|tempo|tuning|capo|key|คีย์|ตั้งสาย)/i.test(trimmed)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extracts structured OCR lines from Tesseract v5 output (data.lines or blocks->paragraphs->lines).
   */
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

  /**
   * Reconstructs a lyric line from OCR words, recording each word's visual start column
   * and bounding box for precise chord-to-lyric spatial mapping.
   */
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
        // Thai words often have no space between them unless there's a noticeable gap
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

  /**
   * Maps a chord word's x0 pixel coordinate onto a visual character column
   * using the paired lyric line's word bounding boxes (or fallback avgCharWidth).
   */
  function mapChordXToLyricCol(chordX, lyricMap, pageLeftX, avgCharWidth) {
    if (!lyricMap || !lyricMap.words.length) {
      return Math.max(0, Math.round((chordX - pageLeftX) / avgCharWidth));
    }

    const words = lyricMap.words;
    const first = words[0];
    const last = words[words.length - 1];

    if (chordX <= first.x0) {
      return 0;
    }

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

    // Past the last lyric word
    const extraCols = Math.round((chordX - last.x1) / avgCharWidth);
    return Math.max(last.colEnd, last.colEnd + Math.min(extraCols, 12));
  }

  /**
   * Builds a monospace chord line string from positioned { chord, col } items,
   * ensuring chords never overlap.
   */
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

  /**
   * Fallback parser when only plain text (no bounding boxes) is available.
   */
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

      if (isWatermarkOrHeaderLine(trimmed)) {
        continue;
      }

      consecutiveBlanks = 0;
      const type = classifyTextLine(line);

      if (type === 'chord') {
        // Normalize OCR chord tokens while preserving column spacing
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

    // Trim trailing blank lines
    while (cleanedLines.length && cleanedLines[cleanedLines.length - 1] === '') {
      cleanedLines.pop();
    }

    const alignedText = cleanedLines.join('\n');
    const chordPro = convertMonospaceToChordPro(alignedText);
    const originalKey = explicitKey || detectOriginalKey(allChords, raw);

    return {
      alignedText: alignedText,
      chordPro: chordPro,
      originalKey: originalKey,
      chords: uniqueChords(allChords),
      lineCount: cleanedLines.length,
      source: 'text'
    };
  }

  /**
   * Aligns Tesseract v5 OCR output (with word bounding boxes) into a column-aligned
   * monospace chord sheet & ChordPro sheet. Falls back cleanly to plain text mode.
   */
  function alignOcrDataToChordSheet(ocrData) {
    if (typeof ocrData === 'string') {
      return parseRawTextToAlignedSheet(ocrData);
    }
    if (!ocrData || typeof ocrData !== 'object') {
      return {
        alignedText: '',
        chordPro: '',
        originalKey: '',
        chords: [],
        lineCount: 0,
        source: 'text'
      };
    }

    const data = ocrData.data && typeof ocrData.data === 'object' ? ocrData.data : ocrData;
    const rawText = typeof data.text === 'string' ? data.text : '';
    const ocrLines = extractOcrLines(data);

    if (!ocrLines || !hasValidWordBboxes(ocrLines)) {
      return parseRawTextToAlignedSheet(rawText);
    }

    // Extract explicit Key metadata before stripping header lines
    let explicitKey = '';
    const explicitMatch = rawText.match(EXPLICIT_KEY_RE);
    if (explicitMatch && explicitMatch[1]) {
      const normK = normalizeOcrChordToken(explicitMatch[1]);
      if (isChordToken(normK)) explicitKey = normK;
    }

    // Sort lines top-to-bottom by bbox.y0
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

    // Estimate page left margin & average character width from word bboxes
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

      // Capture explicit key from line if not found yet
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

    // Estimate median line height for detecting stanza/paragraph breaks
    const heights = prepared.map(function (p) { return p.height; }).sort(function (a, b) { return a - b; });
    const medianHeight = heights[Math.floor(heights.length / 2)] || 24;

    const outputLines = [];
    const allChords = [];

    for (let i = 0; i < prepared.length; i++) {
      const cur = prepared[i];

      // Insert blank line on large vertical stanza gap
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

        // Build positioned chord items using word bounding boxes
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
          if (isChordToken(norm)) {
            allChords.push(norm);
          }
          const col = word.bbox
            ? mapChordXToLyricCol(word.bbox.x0, lyricMap, pageLeftX, avgCharWidth)
            : w * 4;
          positioned.push({ chord: isChordToken(norm) ? norm : rawTok, col: col });
        }

        const chordLineStr = renderPositionedChords(positioned);
        if (chordLineStr) {
          outputLines.push(chordLineStr);
        }

        if (isPairedWithLyric && lyricMap) {
          outputLines.push(lyricMap.text);
          i++; // Consumed paired lyric line
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

      // Standalone lyric line
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
      chordPro: chordPro,
      originalKey: originalKey,
      chords: uniqueChords(allChords),
      lineCount: outputLines.length,
      source: 'bbox'
    };
  }

  /* ============================================================================
   * 5) Image Preprocessing & OCR Runner
   * ============================================================================ */

  /**
   * Upscales small images (minWidth: 1200) and converts to high-contrast grayscale
   * to sharpen chord symbols and Thai glyphs for Tesseract OCR.
   * Falls back cleanly to the original blob if canvas is unavailable or fails.
   */
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
      if (srcW < minWidth) {
        scale = minWidth / srcW;
      }
      if (srcW * scale > maxDim) {
        scale = maxDim / srcW;
      }
      if (srcH * scale > maxDim) {
        scale = Math.min(scale, maxDim / srcH);
      }

      const dstW = Math.max(1, Math.round(srcW * scale));
      const dstH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return blob;

      // White fill for transparent PNGs
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, dstW, dstH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, dstW, dstH);

      const imgData = ctx.getImageData(0, 0, dstW, dstH);
      const pixels = imgData.data;

      // Compute average luminance to detect dark-mode screenshots
      let lumSum = 0;
      const pixelCount = pixels.length / 4;
      for (let i = 0; i < pixels.length; i += 4) {
        lumSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }
      const avgLum = pixelCount > 0 ? lumSum / pixelCount : 200;
      const invertDarkBg = avgLum < 110;

      // High-contrast grayscale transform
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

  /**
   * Fetches an image source (Blob, blob:, data:, or http(s):) as a Blob,
   * with wsrv.nl / images.weserv.nl CORS proxy fallback for external URLs.
   */
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
    if (onProgress) onProgress('กำลังโหลดเอนจิน OCR (ไทย + อังกฤษ)...', 18);

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
          onProgress('กำลังอ่านคอร์ดและเนื้อเพลงจากรูป...', Math.round(35 + p * 55));
        } else if (m.status === 'loading language traineddata') {
          onProgress('กำลังโหลดข้อมูลภาษาไทย/อังกฤษ...', Math.round(20 + p * 15));
        }
      }
    });

    try {
      const result = await worker.recognize(imageBlob);
      return result;
    } finally {
      try {
        await worker.terminate();
      } catch (_e) {
        // Ignore terminate errors
      }
    }
  }

  /**
   * Main entry point: fetches, preprocesses, OCRs, and spatially aligns a chord sheet image.
   */
  async function parseChordImage(imageSource, options) {
    const opts = options || {};
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    const fetcher = typeof opts.fetchImageBlob === 'function' ? opts.fetchImageBlob : fetchImageBlob;
    const runner = typeof opts.ocrRunner === 'function' ? opts.ocrRunner : defaultTesseractRunner;

    onProgress('กำลังเตรียมรูปภาพคอร์ด...', 5);
    let imageBlob = imageSource;
    if (!(typeof Blob !== 'undefined' && imageSource instanceof Blob)) {
      if (typeof imageSource === 'string') {
        imageBlob = await fetcher(imageSource);
      }
    }

    let processed = imageBlob;
    if (!opts.skipPreprocess && typeof Blob !== 'undefined' && imageBlob instanceof Blob) {
      onProgress('กำลังปรับความคมชัดรูปภาพ...', 12);
      processed = await preprocessImageForOcr(imageBlob);
    }

    const ocrResult = await runner(processed, { onProgress: onProgress, songId: opts.songId });

    onProgress('กำลังจัดตำแหน่งคอร์ดให้ตรงกับเนื้อเพลง...', 94);
    const aligned = alignOcrDataToChordSheet(ocrResult);

    onProgress('แกะคอร์ดเสร็จสมบูรณ์', 100);
    return {
      alignedText: aligned.alignedText,
      chordPro: aligned.chordPro,
      originalKey: aligned.originalKey,
      chords: aligned.chords,
      lineCount: aligned.lineCount,
      source: aligned.source,
      parsedAt: Date.now()
    };
  }

  /* ============================================================================
   * 6) Persistence / DB Cache (No Re-parsing)
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
    } catch (_e) {
      // Ignore storage quota errors
    }
  }

  function normalizeCachedRecord(record) {
    if (!record) return null;
    if (typeof record === 'string') {
      const trimmed = record.trim();
      if (!trimmed) return null;
      const parsed = parseRawTextToAlignedSheet(trimmed);
      return {
        alignedText: parsed.alignedText,
        chordPro: parsed.chordPro,
        originalKey: parsed.originalKey,
        chords: parsed.chords,
        lineCount: parsed.lineCount,
        source: parsed.source,
        parsedAt: Date.now()
      };
    }
    if (typeof record === 'object' && typeof record.alignedText === 'string' && record.alignedText.trim()) {
      const chords = Array.isArray(record.chords) ? record.chords : uniqueChords(extractChordsFromText(record.alignedText));
      return {
        alignedText: record.alignedText,
        chordPro: typeof record.chordPro === 'string' && record.chordPro
          ? record.chordPro
          : convertMonospaceToChordPro(record.alignedText),
        originalKey: record.originalKey || detectOriginalKey(chords, record.alignedText),
        chords: chords,
        lineCount: record.lineCount || record.alignedText.split('\n').length,
        source: record.source || 'text',
        parsedAt: record.parsedAt || Date.now()
      };
    }
    return null;
  }

  /**
   * Checks `song.parsedChordSheet` (DB/song record) first, then localStorage cache by song.id or image signature.
   */
  function getCachedParsedChord(song) {
    if (!song || typeof song !== 'object') return null;

    if (song.parsedChordSheet) {
      const fromSong = normalizeCachedRecord(song.parsedChordSheet);
      if (fromSong) return fromSong;
    }

    const cache = readCacheMap();
    if (song.id && cache[song.id]) {
      const fromId = normalizeCachedRecord(cache[song.id]);
      if (fromId) return fromId;
    }

    const sig = getImageSignature(song);
    if (sig && cache[sig]) {
      const fromSig = normalizeCachedRecord(cache[sig]);
      if (fromSig) return fromSig;
    }

    return null;
  }

  /**
   * Saves parsed chord data to localStorage cache AND invokes optional `saveToSongAdapter(song.id, parsedData)`
   * so it persists to the songbook DB & syncs to Supabase.
   */
  function saveParsedChord(song, parsedData, saveToSongAdapter) {
    const normalized = normalizeCachedRecord(parsedData);
    if (!normalized) return null;

    const cache = readCacheMap();
    if (song && song.id) {
      cache[song.id] = normalized;
    }
    const sig = getImageSignature(song);
    if (sig) {
      cache[sig] = normalized;
    }
    writeCacheMap(cache);

    if (typeof saveToSongAdapter === 'function' && song && song.id) {
      try {
        saveToSongAdapter(song.id, normalized);
      } catch (_e) {
        // Adapter errors should not break UI flow
      }
    }

    return normalized;
  }

  function clearCachedParsedChord(songId) {
    if (!songId) return;
    const cache = readCacheMap();
    if (cache[songId]) {
      delete cache[songId];
      writeCacheMap(cache);
    }
  }

  /* ============================================================================
   * Public API
   * ============================================================================ */

  const api = {
    CACHE_KEY: CACHE_KEY,
    CHORD_RE: CHORD_RE,

    // Music theory & transposition
    noteIndex: noteIndex,
    isChordToken: isChordToken,
    normalizeOcrChordToken: normalizeOcrChordToken,
    transposeChord: transposeChord,
    preferFlat: preferFlat,
    detectOriginalKey: detectOriginalKey,
    convertMonospaceToChordPro: convertMonospaceToChordPro,
    transposeMonospaceText: transposeMonospaceText,
    transposeChordProText: transposeChordProText,

    // Spatial OCR alignment
    classifyTextLine: classifyTextLine,
    alignOcrDataToChordSheet: alignOcrDataToChordSheet,
    parseRawTextToAlignedSheet: parseRawTextToAlignedSheet,

    // Image preprocessing & OCR runner
    preprocessImageForOcr: preprocessImageForOcr,
    fetchImageBlob: fetchImageBlob,
    parseChordImage: parseChordImage,

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
