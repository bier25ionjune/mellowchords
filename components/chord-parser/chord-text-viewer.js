(function (global) {
  'use strict';

  /**
   * ============================================================================
   * Mellow Chords — ChordTextViewer Component & Precision Transpose Engine
   * Renders ChordPro (`[C]เธอทำให้ฉัน[Em7]รู้สึก...`) with chords floating
   * directly above exact Thai syllables using CSS inline-flex (zero spacebars).
   * Supports real-time +/- 12 semitones transpose, Slash chords, complex chords,
   * smart #/b selection, and seamless embedding in Song View & Live Room.
   * Exposes: window.MellowChordTextViewer
   * ============================================================================
   */

  const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const BASE_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Major tonics that naturally use flat key signatures: F(5), Bb(10), Eb(3), Ab(8), Db(1)
  const FLAT_MAJOR_TONICS = new Set([5, 10, 3, 8, 1]);

  // Strict chord recognizer (avoids English prose words & section names)
  const STRICT_CHORD_RE =
    /^[A-G](?:#|b|♯|♭)?(?:(?:maj|min|dim|aug|sus|add|m|M)(?:2|4|5|6|7|9|11|13)?|(?:2|4|5|6|7|9|11|13)|(?:6\/9)|[+\-°])*(?:(?:#|b|♯|♭)(?:5|9|11|13))*(?:\((?:add|sus|maj|min|dim|aug|no)?[#b♯♭+\-\d,/]+\))?(?:\/[A-G](?:#|b|♯|♭)?)?$/;

  // Decomposes a valid chord into: [1] Root, [2] Quality/Extension suffix, [3] Optional Slash Bass Note
  const CHORD_PARTS_RE = /^([A-G](?:#|b|♯|♭)?)(.*?)(?:\/([A-G](?:#|b|♯|♭)?))?$/;

  // Thai leading vowels (เ แ โ ใ ไ) and combining vowels/tone marks
  const THAI_COMBINING_START_RE = /^[\u0E31\u0E33-\u0E3A\u0E47-\u0E4E]+/;
  const SECTION_DIRECTIVE_RE = /^\s*\{\s*(?:comment|c|section)\s*:\s*([^}]+)\}\s*$/i;
  const META_DIRECTIVE_RE = /^\s*\{\s*(title|t|artist|subtitle|st|key|k|tempo|capo)\s*:\s*([^}]+)\}\s*$/i;
  const LEGACY_SECTION_LINE_RE =
    /^\s*[\[\(]?\s*(intro|verse\s*\d*|pre[\s-]*chorus\s*\d*|chorus\s*\d*|hook\s*\d*|solo\s*\d*|bridge\s*\d*|outro|ending|interlude|instru(?:mental)?|อินโทร|ท่อนฮุค|ฮุค|โซโล่|ท่อนแยก|จบ)\s*[\]\)]?\s*:?\s*$/i;

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clampSemitones(semitones) {
    const n = parseInt(semitones, 10);
    if (isNaN(n)) return 0;
    return Math.max(-12, Math.min(12, n));
  }

  function getNoteIndex(note) {
    if (!note || typeof note !== 'string') return -1;
    const base = BASE_SEMITONE[note[0].toUpperCase()];
    if (base === undefined) return -1;
    const acc = note[1] === '#' || note[1] === '♯' ? 1
              : note[1] === 'b' || note[1] === '♭' ? -1 : 0;
    return (base + acc + 12) % 12;
  }

  function isValidChordToken(token) {
    if (!token || typeof token !== 'string') return false;
    const t = token.trim();
    if (!t || t.length > 20) return false;
    if (/^(Intro|Verse|Chorus|Hook|Solo|Bridge|Outro|Interlude|End|Fine)$/i.test(t)) return false;
    return STRICT_CHORD_RE.test(t);
  }

  /**
   * Determines whether transposed chords should be spelled with flats (`b`) or sharps (`#`).
   * Supports 'auto' (key-signature aware, including relative minors), 'sharp', or 'flat'.
   */
  function shouldPreferFlats(originalKey, semitones, accidentalMode) {
    const mode = accidentalMode || 'auto';
    if (mode === 'flat') return true;
    if (mode === 'sharp') return false;

    const cleanKey = String(originalKey || 'C').trim();
    const m = cleanKey.match(/^([A-G](?:#|b|♯|♭)?)(.*)$/);
    if (!m) return false;

    const origIdx = getNoteIndex(m[1]);
    if (origIdx < 0) return false;

    const isMinor = /^m(?!aj)/i.test(m[2]);
    const modShift = (((parseInt(semitones, 10) || 0) % 12) + 12) % 12;
    const targetTonic = (origIdx + modShift) % 12;
    const majorEquivalent = isMinor ? (targetTonic + 3) % 12 : targetTonic;

    if (majorEquivalent === 6) {
      return m[1].indexOf('b') !== -1 || m[1].indexOf('♭') !== -1;
    }
    return FLAT_MAJOR_TONICS.has(majorEquivalent);
  }

  /**
   * Transposes a single chord symbol (e.g. C, G/B, F#m7b5, Asus4, C7#9, C6/9).
   */
  function transposeChordSymbol(chord, semitones, useFlat, forceRespell) {
    const raw = String(chord || '').trim();
    if (!raw || !isValidChordToken(raw)) return raw;

    const normalizedRaw = raw.replace(/♯/g, '#').replace(/♭/g, 'b');
    const modShift = (((parseInt(semitones, 10) || 0) % 12) + 12) % 12;
    if (modShift === 0 && !forceRespell) return normalizedRaw;

    const match = normalizedRaw.match(CHORD_PARTS_RE);
    if (!match) return normalizedRaw;

    const rootNote = match[1];
    const suffix = match[2] || '';
    const bassNote = match[3] || '';
    const scale = useFlat ? FLATS : SHARPS;

    const shiftNote = function (n) {
      const idx = getNoteIndex(n);
      return idx < 0 ? n : scale[(idx + modShift) % 12];
    };

    return shiftNote(rootNote) + suffix + (bassNote ? '/' + shiftNote(bassNote) : '');
  }

  /**
   * Computes the transposed key name for display (e.g. original 'G' + 2 -> 'A', 'Gm' + 1 -> 'Abm').
   */
  function getTransposedKey(originalKey, semitones, accidentalMode) {
    const orig = String(originalKey || '').trim();
    if (!orig || orig === '-') return '-';
    const useFlat = shouldPreferFlats(orig, semitones, accidentalMode);
    const forceRespell = accidentalMode === 'sharp' || accidentalMode === 'flat';
    return transposeChordSymbol(orig, semitones, useFlat, forceRespell) || orig;
  }

  /**
   * Transposes inside a bracket token: handles both single chords `[G/B]`
   * and instrumental bar blocks `[| C | G/B | Am7 | F |]`.
   */
  function transposeBracketContent(inner, modShift, useFlat, forceRespell) {
    const trimmed = String(inner || '').trim();
    if (!trimmed) return inner;

    if (isValidChordToken(trimmed)) {
      return transposeChordSymbol(trimmed, modShift, useFlat, forceRespell);
    }

    // Check if it is an instrumental bar/progression bracket e.g. "| C | G/B | Am7 | F |"
    const tokens = trimmed.split(/(\s+|\|+)/);
    let chordCount = 0;
    const mapped = tokens.map(function (tok) {
      const clean = tok.trim();
      if (!clean || /^\|+$/.test(clean) || /^[-–—•·.,xX\d()]+$/.test(clean)) return tok;
      if (isValidChordToken(clean)) {
        chordCount++;
        return transposeChordSymbol(clean, modShift, useFlat, forceRespell);
      }
      return tok;
    });

    return chordCount > 0 ? mapped.join('') : inner;
  }

  /**
   * Normalizes Thai vowel/syllable edge cases in ChordPro text so chords never
   * split leading Thai vowels (`เ[C]ธอ` -> `[C]เธอ`) or combining marks (`รั[G]ก`).
   */
  function normalizeThaiChordProPlacement(text) {
    if (!text) return '';
    // Snap [Chord] placed immediately after a Thai leading vowel (เ แ โ ใ ไ) before its base consonant
    return String(text).replace(
      /([\u0E40-\u0E44])(\[[^\[\]\r\n]+\])([\u0E01-\u0E2E])/g,
      '$2$1$3'
    );
  }

  /**
   * Transposes an entire ChordPro document (+/- 12 semitones).
   */
  function transposeChordPro(chordProText, semitones, originalKey, accidentalMode) {
    if (!chordProText) return '';
    const clamped = clampSemitones(semitones);
    const mode = accidentalMode || 'auto';
    const useFlat = shouldPreferFlats(originalKey || 'C', clamped, mode);
    const forceRespell = mode === 'sharp' || mode === 'flat';

    if (clamped === 0 && !forceRespell) {
      return normalizeThaiChordProPlacement(chordProText);
    }

    const normalized = normalizeThaiChordProPlacement(chordProText);
    return normalized.replace(/\[([^\[\]\r\n]+)\]/g, function (full, inner) {
      const updated = transposeBracketContent(inner, clamped, useFlat, forceRespell);
      return '[' + updated + ']';
    });
  }

  /**
   * Auto-upgrades legacy monospace chord-over-lyric text into ChordPro if needed,
   * so ChordTextViewer works seamlessly on every song in Mellow Chords.
   */
  function ensureChordProContent(content) {
    const raw = String(content || '').replace(/\r\n/g, '\n');
    if (!raw.trim()) return '';

    // Already has ChordPro chord brackets or directives
    if (/\[[A-G|#b][^\[\]\n]*\]/.test(raw) || /\{\s*(?:comment|c)\s*:/i.test(raw)) {
      return normalizeThaiChordProPlacement(raw);
    }

    if (global.MellowChordParser && typeof global.MellowChordParser.convertMonospaceToChordPro === 'function') {
      return normalizeThaiChordProPlacement(global.MellowChordParser.convertMonospaceToChordPro(raw));
    }

    return raw;
  }

  /**
   * Checks if a bracket string is a multi-token instrumental bar block e.g. `| C | G/B | Am7 | F |`
   */
  function parseInstrumentalBracketTokens(inner) {
    const trimmed = String(inner || '').trim();
    if (isValidChordToken(trimmed)) return null;
    if (trimmed.indexOf('|') === -1 && trimmed.indexOf(' ') === -1) return null;

    const rawParts = trimmed.split(/\s+/).filter(Boolean);
    const items = [];
    let chordHits = 0;

    for (let i = 0; i < rawParts.length; i++) {
      // Split attached pipes like "|C" or "F|"
      const sub = rawParts[i].split(/(\|+)/).filter(Boolean);
      for (let j = 0; j < sub.length; j++) {
        const tok = sub[j];
        if (/^\|+$/.test(tok)) {
          items.push({ kind: 'bar', value: '|' });
        } else if (isValidChordToken(tok)) {
          chordHits++;
          items.push({ kind: 'chord', value: tok });
        } else {
          items.push({ kind: 'text', value: tok });
        }
      }
    }

    return chordHits > 0 ? items : null;
  }

  /**
   * Parses a single ChordPro lyric+chord line into floating segments:
   * `[{ chord: 'C', lyric: 'เธอทำให้ฉัน' }, { chord: 'Em7', lyric: 'รู้สึก' }]`
   */
  function parseChordProLineToSegments(line) {
    const normalized = normalizeThaiChordProPlacement(line);
    const segments = [];
    const re = /\[([^\[\]]+)\]/g;
    let lastIdx = 0;
    let pendingChord = null;
    let m;

    while ((m = re.exec(normalized)) !== null) {
      let before = normalized.slice(lastIdx, m.index);

      // Prevent orphaned Thai combining marks at start of segment after a [Chord]
      if (pendingChord !== null && segments.length > 0 && THAI_COMBINING_START_RE.test(before)) {
        const marks = before.match(THAI_COMBINING_START_RE)[0];
        segments[segments.length - 1].lyric += marks;
        before = before.slice(marks.length);
      }

      const candidate = m[1].trim();
      if (isValidChordToken(candidate)) {
        if (pendingChord !== null || before.length > 0) {
          segments.push({ chord: pendingChord, lyric: before });
        }
        pendingChord = candidate;
      } else {
        // Non-chord bracket e.g. [x2] stays inline as text
        const combined = before + m[0];
        if (pendingChord !== null) {
          segments.push({ chord: pendingChord, lyric: combined });
          pendingChord = null;
        } else if (segments.length > 0) {
          segments[segments.length - 1].lyric += combined;
        } else {
          segments.push({ chord: null, lyric: combined });
        }
      }

      lastIdx = re.lastIndex;
    }

    let tail = normalized.slice(lastIdx);
    if (pendingChord !== null && segments.length > 0 && THAI_COMBINING_START_RE.test(tail)) {
      const marks = tail.match(THAI_COMBINING_START_RE)[0];
      segments[segments.length - 1].lyric += marks;
      tail = tail.slice(marks.length);
    }

    if (pendingChord !== null || tail.length > 0) {
      segments.push({ chord: pendingChord, lyric: tail });
    }

    return segments;
  }

  /**
   * Parses a full ChordPro text (already transposed if desired) into structured AST lines.
   */
  function parseChordProDocument(chordProText) {
    const lines = String(chordProText || '').replace(/\r\n/g, '\n').split('\n');
    const parsedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        parsedLines.push({ type: 'blank' });
        continue;
      }

      const metaMatch = trimmed.match(META_DIRECTIVE_RE);
      if (metaMatch) {
        parsedLines.push({
          type: 'meta',
          key: metaMatch[1].toLowerCase(),
          value: metaMatch[2].trim()
        });
        continue;
      }

      const secDir = trimmed.match(SECTION_DIRECTIVE_RE);
      if (secDir) {
        parsedLines.push({ type: 'section', label: secDir[1].trim() });
        continue;
      }

      const legacySec = trimmed.match(LEGACY_SECTION_LINE_RE);
      if (legacySec) {
        parsedLines.push({ type: 'section', label: legacySec[1].trim() });
        continue;
      }

      // Check full-line instrumental bracket e.g. `[| C | G/B | Am7 | F |]`
      const singleBracketMatch = trimmed.match(/^\[([^\[\]]+)\](?:\s*(x\d+|\(\d+x\)))?$/i);
      if (singleBracketMatch) {
        const instruItems = parseInstrumentalBracketTokens(singleBracketMatch[1]);
        if (instruItems) {
          if (singleBracketMatch[2]) {
            instruItems.push({ kind: 'text', value: singleBracketMatch[2] });
          }
          parsedLines.push({ type: 'instrumental', items: instruItems });
          continue;
        }
      }

      // Check bar-separated chord-only line e.g. `Intro: | [C] | [G/B] | [Am7] | [F] |`
      const strippedBrackets = trimmed.replace(/\[([^\[\]]+)\]/g, '$1');
      if (!/[\u0E00-\u0E7F]/.test(strippedBrackets) && trimmed.indexOf('|') !== -1) {
        const prefixMatch = trimmed.match(/^([A-Za-z0-9\s]+:)\s*(.+)$/);
        const bodyPart = prefixMatch ? prefixMatch[2] : trimmed;
        const unwrapped = bodyPart.replace(/\[([^\[\]]+)\]/g, '$1');
        const instruItems2 = parseInstrumentalBracketTokens(unwrapped);
        if (instruItems2) {
          if (prefixMatch) {
            instruItems2.unshift({ kind: 'text', value: prefixMatch[1] });
          }
          parsedLines.push({ type: 'instrumental', items: instruItems2 });
          continue;
        }
      }

      const segments = parseChordProLineToSegments(rawLine);
      const hasAnyChord = segments.some(function (s) { return !!s.chord; });

      if (!hasAnyChord) {
        parsedLines.push({ type: 'lyric_only', text: rawLine });
      } else {
        parsedLines.push({ type: 'chord_lyric', segments: segments });
      }
    }

    return parsedLines;
  }

  /**
   * Renders ChordPro (or legacy monospace) into a DOM element using safe DOM nodes.
   */
  function renderChordProToElement(container, chordProInput, options) {
    if (!container) return;
    const opts = options || {};
    const semitones = clampSemitones(opts.semitones || 0);
    const originalKey = opts.originalKey || 'C';
    const accidentalMode = opts.accidentalMode || 'auto';
    const onChordClick = typeof opts.onChordClick === 'function' ? opts.onChordClick : null;
    const cardStyle = opts.card !== false;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const ensured = ensureChordProContent(chordProInput);
    const transposed = transposeChordPro(ensured, semitones, originalKey, accidentalMode);
    const ast = parseChordProDocument(transposed);

    const sheet = document.createElement('div');
    sheet.className = 'ctv-sheet' + (cardStyle ? ' is-card' : '');

    for (let i = 0; i < ast.length; i++) {
      const node = ast[i];
      if (node.type === 'meta') continue;

      if (node.type === 'blank') {
        const gap = document.createElement('div');
        gap.className = 'ctv-stanza-gap';
        sheet.appendChild(gap);
        continue;
      }

      if (node.type === 'section') {
        const secRow = document.createElement('div');
        secRow.className = 'ctv-section-row';
        const badge = document.createElement('span');
        badge.className = 'ctv-section-badge';
        badge.textContent = node.label;
        secRow.appendChild(badge);
        sheet.appendChild(secRow);
        continue;
      }

      if (node.type === 'instrumental') {
        const instruEl = document.createElement('div');
        instruEl.className = 'ctv-instru-line';
        for (let k = 0; k < node.items.length; k++) {
          const item = node.items[k];
          if (item.kind === 'bar') {
            const sep = document.createElement('span');
            sep.className = 'ctv-bar-sep';
            sep.textContent = '|';
            instruEl.appendChild(sep);
          } else if (item.kind === 'chord') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ctv-chord-pill';
            btn.dataset.chord = item.value;
            btn.textContent = item.value;
            if (onChordClick) {
              btn.addEventListener('click', function () {
                onChordClick(item.value);
              });
            }
            instruEl.appendChild(btn);
          } else {
            const txt = document.createElement('span');
            txt.className = 'ctv-instru-text';
            txt.textContent = item.value;
            instruEl.appendChild(txt);
          }
        }
        sheet.appendChild(instruEl);
        continue;
      }

      if (node.type === 'lyric_only') {
        const plainEl = document.createElement('div');
        plainEl.className = 'ctv-line is-lyric-only';
        plainEl.textContent = node.text;
        sheet.appendChild(plainEl);
        continue;
      }

      if (node.type === 'chord_lyric') {
        const lineEl = document.createElement('div');
        lineEl.className = 'ctv-line';

        for (let s = 0; s < node.segments.length; s++) {
          const seg = node.segments[s];
          const pairEl = document.createElement('span');
          pairEl.className = 'ctv-pair';

          const chordSlot = document.createElement('span');
          if (seg.chord) {
            chordSlot.className = 'ctv-chord-slot';
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'ctv-chord-pill';
            pill.dataset.chord = seg.chord;
            pill.textContent = seg.chord;
            if (onChordClick) {
              pill.addEventListener('click', function () {
                onChordClick(seg.chord);
              });
            }
            chordSlot.appendChild(pill);
          } else {
            chordSlot.className = 'ctv-chord-slot is-empty';
            chordSlot.textContent = '\u200B';
          }

          const lyricSlot = document.createElement('span');
          if (seg.lyric && seg.lyric.length > 0) {
            lyricSlot.className = 'ctv-lyric-slot';
            lyricSlot.textContent = seg.lyric;
          } else {
            lyricSlot.className = 'ctv-lyric-slot is-chord-tail';
            lyricSlot.textContent = '\u00A0';
          }

          pairEl.appendChild(chordSlot);
          pairEl.appendChild(lyricSlot);
          lineEl.appendChild(pairEl);
        }

        sheet.appendChild(lineEl);
      }
    }

    container.appendChild(sheet);
  }

  /**
   * Renders ChordPro (or legacy monospace) to an HTML string — ideal for Live Room innerHTML slots.
   */
  function renderChordProToHtml(chordProInput, options) {
    const opts = options || {};
    const semitones = clampSemitones(opts.semitones || 0);
    const originalKey = opts.originalKey || 'C';
    const accidentalMode = opts.accidentalMode || 'auto';
    const cardStyle = opts.card !== false;

    const ensured = ensureChordProContent(chordProInput);
    const transposed = transposeChordPro(ensured, semitones, originalKey, accidentalMode);
    const ast = parseChordProDocument(transposed);

    const out = ['<div class="ctv-sheet' + (cardStyle ? ' is-card' : '') + '">'];

    for (let i = 0; i < ast.length; i++) {
      const node = ast[i];
      if (node.type === 'meta') continue;

      if (node.type === 'blank') {
        out.push('<div class="ctv-stanza-gap"></div>');
        continue;
      }

      if (node.type === 'section') {
        out.push(
          '<div class="ctv-section-row"><span class="ctv-section-badge">' +
          escHtml(node.label) +
          '</span></div>'
        );
        continue;
      }

      if (node.type === 'instrumental') {
        const innerHtml = node.items.map(function (item) {
          if (item.kind === 'bar') return '<span class="ctv-bar-sep">|</span>';
          if (item.kind === 'chord') {
            return '<button type="button" class="ctv-chord-pill" data-chord="' +
              escHtml(item.value) + '">' + escHtml(item.value) + '</button>';
          }
          return '<span class="ctv-instru-text">' + escHtml(item.value) + '</span>';
        }).join('');
        out.push('<div class="ctv-instru-line">' + innerHtml + '</div>');
        continue;
      }

      if (node.type === 'lyric_only') {
        out.push('<div class="ctv-line is-lyric-only">' + escHtml(node.text) + '</div>');
        continue;
      }

      if (node.type === 'chord_lyric') {
        const segHtml = node.segments.map(function (seg) {
          const chordHtml = seg.chord
            ? '<span class="ctv-chord-slot"><button type="button" class="ctv-chord-pill" data-chord="' +
              escHtml(seg.chord) + '">' + escHtml(seg.chord) + '</button></span>'
            : '<span class="ctv-chord-slot is-empty">&#8203;</span>';
          const lyricHtml = (seg.lyric && seg.lyric.length > 0)
            ? '<span class="ctv-lyric-slot">' + escHtml(seg.lyric) + '</span>'
            : '<span class="ctv-lyric-slot is-chord-tail">&nbsp;</span>';
          return '<span class="ctv-pair">' + chordHtml + lyricHtml + '</span>';
        }).join('');
        out.push('<div class="ctv-line">' + segHtml + '</div>');
      }
    }

    out.push('</div>');
    return out.join('');
  }

  /**
   * Stateful, Live-Ready `ChordTextViewer` Component Factory
   */
  function createChordTextViewer(initialOptions) {
    const opts = Object.assign({
      chordPro: '',
      originalKey: 'C',
      semitones: 0,
      accidentalMode: 'auto', // 'auto' | 'sharp' | 'flat'
      showControls: true,
      card: true,
      onShiftChange: null,
      onAccidentalChange: null,
      onChordClick: null
    }, initialOptions || {});

    let rootEl = null;
    let barMount = null;
    let sheetMount = null;

    let state = {
      chordPro: opts.chordPro || '',
      originalKey: opts.originalKey || 'C',
      semitones: clampSemitones(opts.semitones),
      accidentalMode: opts.accidentalMode || 'auto',
      showControls: opts.showControls !== false,
      card: opts.card !== false
    };

    function formatShift(s) {
      if (!s) return '0 (คีย์เดิม)';
      return (s > 0 ? '+' : '') + s + ' semitones';
    }

    function renderBar() {
      if (!barMount) return;
      while (barMount.firstChild) barMount.removeChild(barMount.firstChild);

      if (!state.showControls) {
        barMount.hidden = true;
        return;
      }
      barMount.hidden = false;

      const bar = document.createElement('div');
      bar.className = 'ctv-bar';

      // Left: Original & Playing Key
      const summary = document.createElement('div');
      summary.className = 'ctv-key-summary';

      const origPill = document.createElement('span');
      origPill.className = 'ctv-pill';
      origPill.innerHTML = 'คีย์ต้นฉบับ <strong>' + escHtml(state.originalKey || '-') + '</strong>';

      const playKey = getTransposedKey(state.originalKey, state.semitones, state.accidentalMode);
      const playPill = document.createElement('span');
      playPill.className = 'ctv-pill is-playing';
      playPill.innerHTML = 'คีย์ที่แสดง <strong class="ctv-playing-key">' + escHtml(playKey) + '</strong>';

      const shiftTag = document.createElement('span');
      shiftTag.className = 'ctv-shift-tag' + (state.semitones !== 0 ? ' is-active' : '');
      shiftTag.textContent = formatShift(state.semitones);

      summary.appendChild(origPill);
      summary.appendChild(playPill);
      summary.appendChild(shiftTag);

      // Right: Transpose (-12..+12) + Accidental Mode (Auto / # / b)
      const right = document.createElement('div');
      right.className = 'ctv-controls-right';

      const tpGroup = document.createElement('div');
      tpGroup.className = 'ctv-btn-group';

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'ctv-btn ctv-btn-down';
      btnDown.textContent = '−';
      btnDown.title = 'ลดคีย์ 1 ครึ่งเสียง (ต่ำสุด -12)';
      btnDown.disabled = state.semitones <= -12;
      btnDown.addEventListener('click', function () {
        setShift(state.semitones - 1, true);
      });

      const btnReset = document.createElement('button');
      btnReset.type = 'button';
      btnReset.className = 'ctv-btn ctv-btn-reset';
      btnReset.textContent = '0';
      btnReset.title = 'รีเซ็ตกลับคีย์ต้นฉบับ';
      btnReset.disabled = state.semitones === 0;
      btnReset.addEventListener('click', function () {
        setShift(0, true);
      });

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'ctv-btn ctv-btn-up';
      btnUp.textContent = '+';
      btnUp.title = 'เพิ่มคีย์ 1 ครึ่งเสียง (สูงสุด +12)';
      btnUp.disabled = state.semitones >= 12;
      btnUp.addEventListener('click', function () {
        setShift(state.semitones + 1, true);
      });

      tpGroup.appendChild(btnDown);
      tpGroup.appendChild(btnReset);
      tpGroup.appendChild(btnUp);

      const accGroup = document.createElement('div');
      accGroup.className = 'ctv-btn-group';
      accGroup.setAttribute('aria-label', 'รูปแบบเครื่องหมายจร (# / b)');

      [
        { id: 'auto', label: 'Auto' },
        { id: 'sharp', label: '♯' },
        { id: 'flat', label: '♭' }
      ].forEach(function (item) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctv-btn ctv-acc-btn' + (state.accidentalMode === item.id ? ' is-active' : '');
        b.dataset.accMode = item.id;
        b.textContent = item.label;
        b.addEventListener('click', function () {
          setAccidentalMode(item.id, true);
        });
        accGroup.appendChild(b);
      });

      right.appendChild(tpGroup);
      right.appendChild(accGroup);

      bar.appendChild(summary);
      bar.appendChild(right);
      barMount.appendChild(bar);
    }

    function renderBody() {
      if (!sheetMount) return;
      renderChordProToElement(sheetMount, state.chordPro, {
        semitones: state.semitones,
        originalKey: state.originalKey,
        accidentalMode: state.accidentalMode,
        card: state.card,
        onChordClick: opts.onChordClick
      });
    }

    function renderAll() {
      renderBar();
      renderBody();
    }

    function mount(containerEl) {
      rootEl = containerEl;
      if (!rootEl) return;
      while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);

      const wrap = document.createElement('div');
      wrap.className = 'ctv-root';

      barMount = document.createElement('div');
      sheetMount = document.createElement('div');

      wrap.appendChild(barMount);
      wrap.appendChild(sheetMount);
      rootEl.appendChild(wrap);

      renderAll();
    }

    function setShift(semitones, emit) {
      const next = clampSemitones(semitones);
      if (next === state.semitones) return;
      state.semitones = next;
      renderAll();
      if (emit && typeof opts.onShiftChange === 'function') {
        opts.onShiftChange(next);
      }
    }

    function setAccidentalMode(mode, emit) {
      const valid = mode === 'sharp' || mode === 'flat' ? mode : 'auto';
      if (valid === state.accidentalMode) return;
      state.accidentalMode = valid;
      renderAll();
      if (emit && typeof opts.onAccidentalChange === 'function') {
        opts.onAccidentalChange(valid);
      }
    }

    function update(nextProps) {
      if (!nextProps) return;
      if (typeof nextProps.chordPro === 'string') state.chordPro = nextProps.chordPro;
      if (typeof nextProps.originalKey === 'string') state.originalKey = nextProps.originalKey || 'C';
      if (typeof nextProps.semitones === 'number') state.semitones = clampSemitones(nextProps.semitones);
      if (typeof nextProps.accidentalMode === 'string') state.accidentalMode = nextProps.accidentalMode;
      if (typeof nextProps.showControls === 'boolean') state.showControls = nextProps.showControls;
      if (typeof nextProps.card === 'boolean') state.card = nextProps.card;
      renderAll();
    }

    function destroy() {
      if (rootEl) {
        while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild);
      }
      rootEl = null;
      barMount = null;
      sheetMount = null;
    }

    return {
      mount: mount,
      update: update,
      setShift: function (s) { setShift(s, false); },
      setAccidentalMode: function (m) { setAccidentalMode(m, false); },
      getState: function () { return Object.assign({}, state); },
      destroy: destroy
    };
  }

  const api = {
    clampSemitones: clampSemitones,
    getNoteIndex: getNoteIndex,
    isValidChordToken: isValidChordToken,
    shouldPreferFlats: shouldPreferFlats,
    transposeChordSymbol: transposeChordSymbol,
    getTransposedKey: getTransposedKey,
    normalizeThaiChordProPlacement: normalizeThaiChordProPlacement,
    transposeChordPro: transposeChordPro,
    ensureChordProContent: ensureChordProContent,
    parseChordProLineToSegments: parseChordProLineToSegments,
    parseChordProDocument: parseChordProDocument,
    renderChordProToElement: renderChordProToElement,
    renderChordProToHtml: renderChordProToHtml,
    createChordTextViewer: createChordTextViewer
  };

  global.MellowChordTextViewer = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
