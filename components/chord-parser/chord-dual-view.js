(function (global) {
  'use strict';

  /**
   * ============================================================================
   * Mellow Chords — Dual View (Image <-> Live-Ready ChordTextViewer) + Verify & Teach
   * Uses `MellowChordTextViewer` (CSS Flex/Inline-flex floating chords over
   * exact Thai syllables), +/- 12 semitones transpose, smart #/b selection,
   * Re-parse with Dynamic Few-Shot Memory, and Side-by-Side Calibration Modal.
   * ============================================================================
   */

  function getParser() {
    if (global.MellowChordParser) return global.MellowChordParser;
    if (typeof require === 'function') {
      try { return require('./chord-parser.service.js'); } catch (_e) { return null; }
    }
    return null;
  }

  function getViewer() {
    if (global.MellowChordTextViewer) return global.MellowChordTextViewer;
    if (typeof require === 'function') {
      try { return require('./chord-text-viewer.js'); } catch (_e) { return null; }
    }
    return null;
  }

  function getVerifyModal() {
    if (global.MellowChordVerifyModal) return global.MellowChordVerifyModal;
    if (typeof require === 'function') {
      try { return require('./chord-verify-modal.js'); } catch (_e) { return null; }
    }
    return null;
  }

  function hasSongImages(song) {
    if (!song || typeof song !== 'object') return false;
    if (Array.isArray(song.images) && song.images.length > 0) return true;
    if (Array.isArray(song.imgUrls) && song.imgUrls.length > 0) return true;
    if (Array.isArray(song.imgIds) && song.imgIds.length > 0) return true;
    if (typeof song.imageUrl === 'string' && song.imageUrl.trim().length > 0) return true;
    return false;
  }

  function clampShift(s) {
    const n = parseInt(s, 10);
    if (isNaN(n)) return 0;
    return Math.max(-12, Math.min(12, n));
  }

  function formatShiftBadge(shift) {
    if (!shift) return 'คีย์เดิม (0)';
    return (shift > 0 ? '+' : '') + shift;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clearEl(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function createDualView(options) {
    const opts = options || {};
    const onModeChange = typeof opts.onModeChange === 'function' ? opts.onModeChange : function () {};
    const onShiftChange = typeof opts.onShiftChange === 'function' ? opts.onShiftChange : function () {};
    const onParsedSaved = typeof opts.onParsedSaved === 'function' ? opts.onParsedSaved : null;
    const onChordClick = typeof opts.onChordClick === 'function' ? opts.onChordClick : null;
    const getImageBlob = typeof opts.getImageBlob === 'function' ? opts.getImageBlob : null;
    const resolveImageUrls = typeof opts.resolveImageUrls === 'function' ? opts.resolveImageUrls : null;
    const onToast = typeof opts.onToast === 'function' ? opts.onToast : function () {};
    const ocrRunner = typeof opts.ocrRunner === 'function' ? opts.ocrRunner : null;
    const visionRunner = typeof opts.visionRunner === 'function' ? opts.visionRunner : null;

    let toolbarEl = null;
    let viewEl = null;
    let currentSong = null;
    let currentShift = 0;
    let currentAccidental = 'auto'; // 'auto' | 'sharp' | 'flat'
    let currentMode = 'image';      // 'image' | 'text'
    let currentFormat = 'chordpro'; // 'chordpro' (Floating ChordTextViewer) | 'monospace'
    let parsedData = null;
    let isParsing = false;
    let parseProgress = 0;
    let parseStatus = '';
    let parseError = '';
    let parseToken = 0;
    let destroyed = false;

    function notifyModeChange() {
      onModeChange(currentMode, !!parsedData);
    }

    function computeCurrentKey() {
      const Viewer = getViewer();
      const Parser = getParser();
      const orig =
        (parsedData && (parsedData.original_key || parsedData.originalKey)) ||
        (currentSong && (currentSong.original_key || currentSong.key)) ||
        '';
      if (!orig) return { originalKey: '-', currentKey: '-' };
      if (Viewer) {
        return {
          originalKey: orig,
          currentKey: Viewer.getTransposedKey(orig, currentShift, currentAccidental)
        };
      }
      if (!Parser || !currentShift) return { originalKey: orig, currentKey: orig };
      const useFlat = Parser.preferFlat(orig, currentShift);
      const transposed = Parser.transposeChord(orig, currentShift, useFlat);
      return { originalKey: orig, currentKey: transposed || orig };
    }

    function openVerifyTeachDialog() {
      const VerifyModal = getVerifyModal();
      if (!VerifyModal || !currentSong) {
        onToast('ไม่สามารถเปิดหน้าตรวจสอบเทียบภาพได้', true);
        return;
      }
      VerifyModal.openVerifyModal({
        song: currentSong,
        initialShift: currentShift,
        getImageBlob: getImageBlob,
        resolveImageUrls: resolveImageUrls,
        visionRunner: visionRunner || undefined,
        ocrRunner: ocrRunner || undefined,
        onChordClick: onChordClick,
        onToast: onToast,
        onSaved: function (songId, updatedParsed) {
          parsedData = updatedParsed;
          if (currentSong) {
            currentSong.parsedChordSheet = updatedParsed;
            currentSong.original_key = updatedParsed.original_key;
            currentSong.chordpro_content = updatedParsed.chordpro_content;
            currentSong.source_domain = updatedParsed.source_domain;
            currentSong.is_verified = updatedParsed.is_verified;
            if (updatedParsed.original_key) currentSong.key = updatedParsed.original_key;
          }
          if (onParsedSaved && currentSong) {
            onParsedSaved(songId || currentSong.id, updatedParsed);
          }
          currentMode = 'text';
          renderToolbar();
          renderView();
          notifyModeChange();
        }
      });
    }

    /* ------------------------------------------------------------------------
     * Render: Mode Switcher Toolbar
     * ------------------------------------------------------------------------ */
    function renderToolbar() {
      if (!toolbarEl || destroyed) return;
      clearEl(toolbarEl);

      if (!currentSong || !hasSongImages(currentSong)) {
        toolbarEl.hidden = true;
        return;
      }

      toolbarEl.hidden = false;

      const bar = el('div', 'cdv-toolbar');

      const seg = el('div', 'cdv-segmented');
      seg.setAttribute('role', 'tablist');
      seg.setAttribute('aria-label', 'โหมดการแสดงคอร์ด');

      const btnImage = el('button', 'cdv-seg-btn' + (currentMode === 'image' ? ' is-active' : ''), '🖼️ แบบรูปภาพ');
      btnImage.type = 'button';
      btnImage.setAttribute('role', 'tab');
      btnImage.setAttribute('aria-selected', currentMode === 'image' ? 'true' : 'false');
      btnImage.addEventListener('click', function () {
        setMode('image');
      });

      const btnText = el('button', 'cdv-seg-btn' + (currentMode === 'text' ? ' is-active' : ''), '📝 แบบข้อความ (ChordPro)');
      btnText.type = 'button';
      btnText.setAttribute('role', 'tab');
      btnText.setAttribute('aria-selected', currentMode === 'text' ? 'true' : 'false');
      btnText.addEventListener('click', function () {
        setMode('text');
      });

      seg.appendChild(btnImage);
      seg.appendChild(btnText);
      bar.appendChild(seg);

      const statusWrap = el('div', 'cdv-toolbar-status');
      if (isParsing) {
        const badge = el('span', 'cdv-badge cdv-badge-working', '⏳ กำลังแกะคอร์ด ' + parseProgress + '%');
        statusWrap.appendChild(badge);
      } else if (parsedData) {
        const isVer = Boolean(parsedData.is_verified || (currentSong && currentSong.is_verified));
        const badge = el(
          'span',
          'cdv-badge ' + (isVer ? 'cdv-badge-verified' : 'cdv-badge-done'),
          isVer ? '✓ Verified (ตรวจแก้แล้ว)' : '✓ แกะคอร์ดแล้ว'
        );
        statusWrap.appendChild(badge);

        const verifyBtn = el('button', 'cdv-verify-trigger-btn', '🎯 ตรวจสอบและสอนระบบ');
        verifyBtn.type = 'button';
        verifyBtn.id = 'cdvOpenVerifyBtn';
        verifyBtn.addEventListener('click', openVerifyTeachDialog);
        statusWrap.appendChild(verifyBtn);
      } else {
        const quickBtn = el('button', 'cdv-quick-parse-btn', '✨ แกะคอร์ดจากรูป');
        quickBtn.type = 'button';
        quickBtn.addEventListener('click', function () {
          setMode('text');
        });
        statusWrap.appendChild(quickBtn);

        const verifyBtn2 = el('button', 'cdv-verify-trigger-btn', '🎯 เทียบภาพ/สอนระบบ');
        verifyBtn2.type = 'button';
        verifyBtn2.id = 'cdvOpenVerifyBtn';
        verifyBtn2.addEventListener('click', openVerifyTeachDialog);
        statusWrap.appendChild(verifyBtn2);
      }

      bar.appendChild(statusWrap);
      toolbarEl.appendChild(bar);
    }

    /* ------------------------------------------------------------------------
     * Render: Dual Text View Panel
     * ------------------------------------------------------------------------ */
    function renderView() {
      if (!viewEl || destroyed) return;
      clearEl(viewEl);

      if (!currentSong || !hasSongImages(currentSong) || currentMode !== 'text') {
        viewEl.hidden = true;
        return;
      }

      viewEl.hidden = false;

      const panel = el('div', 'cdv-panel');

      if (isParsing) {
        panel.appendChild(renderProgressCard());
        viewEl.appendChild(panel);
        return;
      }

      if (parseError && !parsedData) {
        panel.appendChild(renderErrorCard());
        viewEl.appendChild(panel);
        return;
      }

      if (!parsedData) {
        panel.appendChild(renderEmptyParseCard());
        viewEl.appendChild(panel);
        return;
      }

      panel.appendChild(renderControlBar());
      panel.appendChild(renderSheetBody());
      viewEl.appendChild(panel);
    }

    function renderProgressCard() {
      const card = el('div', 'cdv-state-card');
      const title = el('div', 'cdv-state-title', '✨ กำลังแกะคอร์ดและเนื้อเพลงเป็น ChordPro...');
      const msg = el('div', 'cdv-state-msg', parseStatus || 'กำลังประมวลผลด้วย Vision AI & Dynamic Few-Shot Memory');

      const track = el('div', 'cdv-progress-track');
      const fill = el('div', 'cdv-progress-fill');
      fill.style.width = Math.max(4, Math.min(100, parseProgress)) + '%';
      track.appendChild(fill);

      const pct = el('div', 'cdv-progress-pct', parseProgress + '%');

      card.appendChild(title);
      card.appendChild(msg);
      card.appendChild(track);
      card.appendChild(pct);
      return card;
    }

    function renderErrorCard() {
      const card = el('div', 'cdv-state-card is-error');
      const title = el('div', 'cdv-state-title', 'แกะคอร์ดจากรูปภาพไม่สำเร็จ');
      const msg = el('div', 'cdv-state-msg', parseError || 'เกิดข้อผิดพลาดระหว่างการอ่านรูปภาพ');

      const btnRow = el('div', 'cdv-format-toggle');
      const retryBtn = el('button', 'cdv-primary-btn', '🔄 ลองแกะใหม่ (Re-parse)');
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', function () {
        triggerParse(true);
      });

      const manualVerifyBtn = el('button', 'cdv-verify-trigger-btn', '🎯 เปิดโหมดเทียบภาพ/พิมพ์เอง');
      manualVerifyBtn.type = 'button';
      manualVerifyBtn.addEventListener('click', openVerifyTeachDialog);

      btnRow.appendChild(retryBtn);
      btnRow.appendChild(manualVerifyBtn);

      card.appendChild(title);
      card.appendChild(msg);
      card.appendChild(btnRow);
      return card;
    }

    function renderEmptyParseCard() {
      const card = el('div', 'cdv-state-card');
      const title = el('div', 'cdv-state-title', 'ยังไม่ได้แกะคอร์ดเป็น ChordPro');
      const msg = el(
        'div',
        'cdv-state-msg',
        'กดปุ่มด้านล่างเพื่ออ่านคอร์ดและเนื้อเพลงเป็นมาตรฐาน ChordPro วางคอร์ดลอยเหนือพยางค์และปรับคีย์ +/- 12 semitones ได้ทันที'
      );

      const startBtn = el('button', 'cdv-primary-btn', '✨ เริ่มแกะคอร์ดจากรูป');
      startBtn.type = 'button';
      startBtn.addEventListener('click', function () {
        triggerParse(false);
      });

      card.appendChild(title);
      card.appendChild(msg);
      card.appendChild(startBtn);
      return card;
    }

    function renderControlBar() {
      const bar = el('div', 'cdv-controls');
      const keys = computeCurrentKey();

      // Row 1: Key Info, +/- 12 Semitone Transpose & #/b Selector
      const keyRow = el('div', 'cdv-key-row');

      const keyInfo = el('div', 'cdv-key-info');
      const origChip = el('span', 'cdv-key-chip');
      origChip.appendChild(el('span', 'cdv-key-label', 'คีย์เดิม: '));
      origChip.appendChild(el('strong', 'cdv-key-val', keys.originalKey));

      const playChip = el('span', 'cdv-key-chip is-current');
      playChip.appendChild(el('span', 'cdv-key-label', 'คีย์ที่เล่น: '));
      playChip.appendChild(el('strong', 'cdv-key-val', keys.currentKey));

      const shiftBadge = el(
        'span',
        'cdv-shift-badge' + (currentShift !== 0 ? ' is-shifted' : ''),
        formatShiftBadge(currentShift)
      );

      keyInfo.appendChild(origChip);
      keyInfo.appendChild(playChip);
      keyInfo.appendChild(shiftBadge);

      const controlsRight = el('div', 'cdv-transpose-group');

      const btnDown = el('button', 'cdv-tr-btn', '−');
      btnDown.type = 'button';
      btnDown.title = 'ลดคีย์ลง 1 ครึ่งเสียง (ต่ำสุด -12)';
      btnDown.setAttribute('aria-label', 'ลดคีย์');
      btnDown.disabled = currentShift <= -12;
      btnDown.addEventListener('click', function () {
        const next = clampShift(currentShift - 1);
        currentShift = next;
        onShiftChange(next);
        renderView();
      });

      const btnReset = el('button', 'cdv-tr-btn cdv-tr-reset', 'รีเซ็ต');
      btnReset.type = 'button';
      btnReset.disabled = currentShift === 0;
      btnReset.addEventListener('click', function () {
        currentShift = 0;
        onShiftChange(0);
        renderView();
      });

      const btnUp = el('button', 'cdv-tr-btn', '+');
      btnUp.type = 'button';
      btnUp.title = 'เพิ่มคีย์ขึ้น 1 ครึ่งเสียง (สูงสุด +12)';
      btnUp.setAttribute('aria-label', 'เพิ่มคีย์');
      btnUp.disabled = currentShift >= 12;
      btnUp.addEventListener('click', function () {
        const next = clampShift(currentShift + 1);
        currentShift = next;
        onShiftChange(next);
        renderView();
      });

      // Accidental (# / b / Auto) switcher
      const accSeg = el('div', 'cdv-acc-group');
      [
        { id: 'auto', text: 'Auto' },
        { id: 'sharp', text: '♯' },
        { id: 'flat', text: '♭' }
      ].forEach(function (acc) {
        const b = el('button', 'cdv-fmt-btn' + (currentAccidental === acc.id ? ' is-active' : ''), acc.text);
        b.type = 'button';
        b.dataset.accidental = acc.id;
        b.title = acc.id === 'auto' ? 'เลือก #/b อัตโนมัติตามคีย์' : ('บังคับแสดงเป็น ' + acc.text);
        b.addEventListener('click', function () {
          currentAccidental = acc.id;
          renderView();
        });
        accSeg.appendChild(b);
      });

      controlsRight.appendChild(btnDown);
      controlsRight.appendChild(btnReset);
      controlsRight.appendChild(btnUp);
      controlsRight.appendChild(accSeg);

      keyRow.appendChild(keyInfo);
      keyRow.appendChild(controlsRight);
      bar.appendChild(keyRow);

      // Row 2: Renderer Mode Toggle, Verify & Teach, and Re-parse
      const actionRow = el('div', 'cdv-action-row');

      const fmtSeg = el('div', 'cdv-format-toggle');
      const btnFloating = el(
        'button',
        'cdv-fmt-btn' + (currentFormat === 'chordpro' ? ' is-active' : ''),
        '🎵 ChordTextViewer (คอร์ดลอยเหนือพยางค์)'
      );
      btnFloating.type = 'button';
      btnFloating.addEventListener('click', function () {
        if (currentFormat !== 'chordpro') {
          currentFormat = 'chordpro';
          renderView();
        }
      });

      const btnMono = el(
        'button',
        'cdv-fmt-btn' + (currentFormat === 'monospace' ? ' is-active' : ''),
        '📐 Monospace'
      );
      btnMono.type = 'button';
      btnMono.addEventListener('click', function () {
        if (currentFormat !== 'monospace') {
          currentFormat = 'monospace';
          renderView();
        }
      });

      fmtSeg.appendChild(btnFloating);
      fmtSeg.appendChild(btnMono);

      const rightBtns = el('div', 'cdv-format-toggle');

      const btnClean = el('button', 'cdv-clean-btn', '🧹 คลีนคอร์ด');
      btnClean.type = 'button';
      btnClean.id = 'cdvCleanChordsBtn';
      btnClean.title = 'ล้างคำแปลกปลอมนอกรูปแบบคอร์ด และแปลงคำผิดจาก OCR ให้เป็นคอร์ดมาตรฐาน';
      btnClean.addEventListener('click', function () {
        if (!parsedData || (!parsedData.chordpro_content && !parsedData.alignedText)) return;
        const Parser = getParser();
        if (!Parser || typeof Parser.cleanOcrArtifacts !== 'function') return;
        const rawContent = parsedData.chordpro_content || parsedData.alignedText || '';
        const cleanedCp = Parser.cleanOcrArtifacts(rawContent);
        parsedData.chordpro_content = cleanedCp;
        parsedData.chordPro = cleanedCp;
        parsedData.alignedText = Parser.convertChordProToMonospace(cleanedCp);
        parsedData.monospaceText = parsedData.alignedText;
        parsedData.chords = Parser.uniqueChords(Parser.extractChordsFromText(cleanedCp));
        Parser.saveParsedChord(currentSong, parsedData);
        renderView();
        if (typeof global.toast === 'function') {
          global.toast('✨ ล้างคำแปลกปลอมและจัดรูปแบบคอร์ดเรียบร้อยแล้ว');
        }
      });

      const btnVerify = el('button', 'cdv-verify-trigger-btn', '🎯 ตรวจสอบและสอนระบบ');
      btnVerify.type = 'button';
      btnVerify.addEventListener('click', openVerifyTeachDialog);

      const btnReparse = el('button', 'cdv-reparse-btn', '🔄 ลองแกะใหม่ (Re-parse)');
      btnReparse.type = 'button';
      btnReparse.id = 'cdvReparseBtn';
      btnReparse.title = 'ดึงความจำล่าสุดจาก chord_parser_memory แล้วแกะรูปใหม่อีกครั้ง';
      btnReparse.addEventListener('click', function () {
        triggerParse(true);
      });

      rightBtns.appendChild(btnClean);
      rightBtns.appendChild(btnVerify);
      rightBtns.appendChild(btnReparse);

      actionRow.appendChild(fmtSeg);
      actionRow.appendChild(rightBtns);
      bar.appendChild(actionRow);

      return bar;
    }

    function createChordButton(chordText) {
      const btn = el('button', 'cdv-chord-token', chordText);
      btn.type = 'button';
      btn.dataset.chord = chordText;
      if (onChordClick) {
        btn.addEventListener('click', function () {
          onChordClick(chordText);
        });
      }
      return btn;
    }

    function renderMonospaceChordLine(lineEl, lineText, Parser) {
      const parts = lineText.split(/(\s+)/);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          lineEl.appendChild(document.createTextNode(part));
        } else if (Parser && Parser.isChordToken(part)) {
          lineEl.appendChild(createChordButton(part));
        } else {
          lineEl.appendChild(document.createTextNode(part));
        }
      }
    }

    function renderSheetBody() {
      const Viewer = getViewer();
      const Parser = getParser();
      const origKey =
        (parsedData && (parsedData.original_key || parsedData.originalKey)) ||
        (currentSong && (currentSong.original_key || currentSong.key)) ||
        'C';

      // Default: Live-Ready Floating ChordTextViewer (CSS Inline-Flex over exact syllables)
      if (currentFormat === 'chordpro' && Viewer) {
        const viewerWrap = el('div', 'cdv-viewer-host');
        const cpContent =
          (parsedData && (parsedData.chordpro_content || parsedData.chordPro)) ||
          (parsedData && parsedData.alignedText) ||
          '';
        Viewer.renderChordProToElement(viewerWrap, cpContent, {
          semitones: currentShift,
          originalKey: origKey,
          accidentalMode: currentAccidental,
          card: true,
          onChordClick: onChordClick
        });
        return viewerWrap;
      }

      // Secondary fallback: Legacy Monospace
      const sheetWrap = el('div', 'cdv-sheet-wrap');
      const sheet = el('div', 'cdv-sheet is-monospace');
      const rawDisplay = Parser
        ? Parser.transposeMonospaceText(parsedData.alignedText || '', currentShift, origKey)
        : (parsedData.alignedText || '');

      const lines = rawDisplay.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const type = Parser ? Parser.classifyTextLine(line) : (line.trim() ? 'lyric' : 'blank');
        if (type === 'blank') {
          sheet.appendChild(el('div', 'cdv-line cdv-line-blank', ' '));
        } else if (type === 'section') {
          sheet.appendChild(el('div', 'cdv-line cdv-line-section', line.trim()));
        } else if (type === 'chord' || type === 'mixed') {
          const lineEl = el('div', 'cdv-line cdv-line-chord');
          renderMonospaceChordLine(lineEl, line, Parser);
          sheet.appendChild(lineEl);
        } else {
          sheet.appendChild(el('div', 'cdv-line cdv-line-lyric', line));
        }
      }

      sheetWrap.appendChild(sheet);
      return sheetWrap;
    }

    /* ------------------------------------------------------------------------
     * Vision AI / OCR Trigger & Lifecycle Methods
     * ------------------------------------------------------------------------ */
    async function triggerParse(force) {
      if (destroyed || !currentSong || !hasSongImages(currentSong)) return null;

      const Parser = getParser();
      if (!Parser) {
        parseError = 'ไม่พบโมดูล MellowChordParser';
        onToast(parseError, true);
        renderView();
        return null;
      }

      if (!force) {
        const cached = Parser.getCachedParsedChord(currentSong);
        if (cached) {
          parsedData = cached;
          parseError = '';
          renderToolbar();
          renderView();
          notifyModeChange();
          return cached;
        }
      } else {
        Parser.clearCachedParsedChord(currentSong);
      }

      const myToken = ++parseToken;
      isParsing = true;
      parseProgress = 5;
      parseStatus = 'กำลังเตรียมรูปภาพและดึงความจำระบบ...';
      parseError = '';
      renderToolbar();
      renderView();

      try {
        let imgSource = null;
        if (getImageBlob) {
          imgSource = await getImageBlob(currentSong);
        }
        if (!imgSource) {
          if (Array.isArray(currentSong.images) && currentSong.images.length) {
            imgSource = currentSong.images[0];
          } else if (Array.isArray(currentSong.imgUrls) && currentSong.imgUrls.length) {
            imgSource = currentSong.imgUrls[0];
          } else if (currentSong.imageUrl) {
            imgSource = currentSong.imageUrl;
          }
        }

        if (!imgSource) {
          throw new Error('ไม่พบไฟล์รูปภาพของเพลงนี้');
        }

        const result = await Parser.parseChordImage(imgSource, {
          songId: currentSong.id,
          song: currentSong,
          ocrRunner: ocrRunner || undefined,
          visionRunner: visionRunner || undefined,
          onProgress: function (msg, pct) {
            if (destroyed || myToken !== parseToken) return;
            parseStatus = msg || parseStatus;
            if (typeof pct === 'number') parseProgress = Math.max(0, Math.min(100, Math.round(pct)));
            renderToolbar();
            renderView();
          }
        });

        if (destroyed || myToken !== parseToken) return null;

        const hasCp = result && ((result.chordpro_content && result.chordpro_content.trim()) || (result.alignedText && result.alignedText.trim()));
        if (!hasCp) {
          throw new Error('ไม่พบข้อความหรือคอร์ดในรูปภาพนี้');
        }

        parsedData = Parser.saveParsedChord(currentSong, result, onParsedSaved) || result;
        isParsing = false;
        parseProgress = 100;
        parseError = '';

        renderToolbar();
        renderView();
        notifyModeChange();

        const applied = parsedData.memoryApplied;
        if (force && applied && (applied.rulesCount > 0 || applied.examplesCount > 0)) {
          onToast(
            'แกะคอร์ดใหม่สำเร็จ! (ใช้ความจำระบบ: กฎ ' + applied.rulesCount + ' ข้อ, ตัวอย่าง ' + applied.examplesCount + ' รายการ)',
            false
          );
        } else {
          onToast('แกะคอร์ดเป็น ChordPro เรียบร้อยแล้ว ✔', false);
        }
        return parsedData;
      } catch (err) {
        if (destroyed || myToken !== parseToken) return null;
        isParsing = false;
        parseError = (err && err.message) ? err.message : 'ไม่สามารถแกะคอร์ดจากรูปภาพได้';
        renderToolbar();
        renderView();
        onToast(parseError, true);
        return null;
      }
    }

    function mount(tEl, vEl) {
      toolbarEl = tEl || null;
      viewEl = vEl || null;
      renderToolbar();
      renderView();
    }

    function setSong(song, shift) {
      parseToken++;
      currentSong = song || null;
      currentShift = clampShift(shift || 0);
      currentMode = 'image';
      isParsing = false;
      parseProgress = 0;
      parseStatus = '';
      parseError = '';

      const Parser = getParser();
      parsedData = (Parser && currentSong && hasSongImages(currentSong))
        ? Parser.getCachedParsedChord(currentSong)
        : null;

      if (parsedData && Parser && typeof Parser.cleanOcrArtifacts === 'function') {
        const raw = parsedData.chordpro_content || parsedData.alignedText || '';
        if (raw && /(?:6\s*ทาล|8\s*ทา|0\s*รนร|คิเทา|อ๒กา|โทรไหน|05\s*นร)/.test(raw)) {
          const cleaned = Parser.cleanOcrArtifacts(raw);
          parsedData.chordpro_content = cleaned;
          parsedData.chordPro = cleaned;
          parsedData.alignedText = Parser.convertChordProToMonospace(cleaned);
          parsedData.monospaceText = parsedData.alignedText;
          Parser.saveParsedChord(currentSong, parsedData);
        }
      }

      // If song is already verified, default to text mode
      if (parsedData && (parsedData.is_verified || (currentSong && currentSong.is_verified))) {
        currentMode = 'text';
      }

      const visionCfg = (Parser && typeof Parser.getVisionConfig === 'function')
        ? Parser.getVisionConfig()
        : null;
      const shouldAutoParse = Boolean(
        visionCfg &&
        visionCfg.autoParseOnOpen !== false &&
        currentSong &&
        hasSongImages(currentSong) &&
        !parsedData
      );

      if (shouldAutoParse) {
        setTimeout(function () {
          if (!destroyed && !parsedData && !isParsing && currentSong === song) {
            triggerParse(false);
          }
        }, 150);
      }

      renderToolbar();
      renderView();
      notifyModeChange();
    }

    function setShift(shift) {
      const next = clampShift(shift);
      if (next === currentShift) return;
      currentShift = next;
      if (currentMode === 'text' && parsedData) {
        renderView();
      }
    }

    function setMode(mode) {
      const target = mode === 'text' ? 'text' : 'image';
      if (!currentSong || !hasSongImages(currentSong)) {
        currentMode = 'image';
        renderToolbar();
        renderView();
        notifyModeChange();
        return;
      }

      currentMode = target;
      renderToolbar();
      renderView();
      notifyModeChange();

      if (currentMode === 'text' && !parsedData && !isParsing) {
        triggerParse(false);
      }
    }

    function getMode() {
      return currentMode;
    }

    function destroy() {
      destroyed = true;
      parseToken++;
      clearEl(toolbarEl);
      clearEl(viewEl);
      if (toolbarEl) toolbarEl.hidden = true;
      if (viewEl) viewEl.hidden = true;
      toolbarEl = null;
      viewEl = null;
      currentSong = null;
      parsedData = null;
    }

    return {
      mount: mount,
      setSong: setSong,
      setShift: setShift,
      setMode: setMode,
      getMode: getMode,
      triggerParse: triggerParse,
      openVerifyModal: openVerifyTeachDialog,
      destroy: destroy
    };
  }

  const api = {
    createDualView: createDualView
  };

  global.MellowChordDualView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
