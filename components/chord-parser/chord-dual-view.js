(function (global) {
  'use strict';

  /**
   * ============================================================================
   * Mellow Chords — Dual View (Image <-> Aligned Text Chord Sheet) UI Component
   * Zero-build Vanilla JS, safe DOM construction (no unsafe innerHTML).
   * ============================================================================
   */

  function getParser() {
    if (global.MellowChordParser) return global.MellowChordParser;
    if (typeof require === 'function') {
      try {
        return require('./chord-parser.service.js');
      } catch (_e) {
        return null;
      }
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

  function normShift(s) {
    const n = parseInt(s, 10);
    if (isNaN(n)) return 0;
    const v = ((n % 12) + 12) % 12;
    return v > 6 ? v - 12 : v;
  }

  function formatShiftBadge(shift) {
    if (!shift) return 'คีย์เดิม';
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
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function createDualView(options) {
    const opts = options || {};
    const onModeChange = typeof opts.onModeChange === 'function' ? opts.onModeChange : function () {};
    const onShiftChange = typeof opts.onShiftChange === 'function' ? opts.onShiftChange : function () {};
    const onParsedSaved = typeof opts.onParsedSaved === 'function' ? opts.onParsedSaved : null;
    const onChordClick = typeof opts.onChordClick === 'function' ? opts.onChordClick : null;
    const getImageBlob = typeof opts.getImageBlob === 'function' ? opts.getImageBlob : null;
    const onToast = typeof opts.onToast === 'function' ? opts.onToast : function () {};
    const ocrRunner = typeof opts.ocrRunner === 'function' ? opts.ocrRunner : null;

    let toolbarEl = null;
    let viewEl = null;
    let currentSong = null;
    let currentShift = 0;
    let currentMode = 'image'; // 'image' | 'text'
    let currentFormat = 'monospace'; // 'monospace' | 'chordpro'
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
      const Parser = getParser();
      const orig = (parsedData && parsedData.originalKey) || (currentSong && currentSong.key) || '';
      if (!orig) return { originalKey: '-', currentKey: '-' };
      if (!Parser || !currentShift) return { originalKey: orig, currentKey: orig };
      const useFlat = Parser.preferFlat(orig, currentShift);
      const transposed = Parser.transposeChord(orig, currentShift, useFlat);
      return { originalKey: orig, currentKey: transposed || orig };
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

      // Segmented toggle
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

      const btnText = el('button', 'cdv-seg-btn' + (currentMode === 'text' ? ' is-active' : ''), '📝 แบบข้อความ');
      btnText.type = 'button';
      btnText.setAttribute('role', 'tab');
      btnText.setAttribute('aria-selected', currentMode === 'text' ? 'true' : 'false');
      btnText.addEventListener('click', function () {
        setMode('text');
      });

      seg.appendChild(btnImage);
      seg.appendChild(btnText);
      bar.appendChild(seg);

      // Right status / quick action
      const statusWrap = el('div', 'cdv-toolbar-status');
      if (isParsing) {
        const badge = el('span', 'cdv-badge cdv-badge-working', '⏳ กำลังแกะคอร์ด ' + parseProgress + '%');
        statusWrap.appendChild(badge);
      } else if (parsedData) {
        const badge = el('span', 'cdv-badge cdv-badge-done', '✓ แกะคอร์ดแล้ว');
        statusWrap.appendChild(badge);
      } else {
        const quickBtn = el('button', 'cdv-quick-parse-btn', '✨ แกะคอร์ดจากรูป');
        quickBtn.type = 'button';
        quickBtn.addEventListener('click', function () {
          setMode('text');
        });
        statusWrap.appendChild(quickBtn);
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
      const title = el('div', 'cdv-state-title', '✨ กำลังแกะคอร์ดและเนื้อเพลงจากรูปภาพ...');
      const msg = el('div', 'cdv-state-msg', parseStatus || 'กำลังประมวลผล OCR ภาษาไทยและอังกฤษ');

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

      const retryBtn = el('button', 'cdv-primary-btn', '🔄 ลองแกะคอร์ดอีกครั้ง');
      retryBtn.type = 'button';
      retryBtn.addEventListener('click', function () {
        triggerParse(true);
      });

      card.appendChild(title);
      card.appendChild(msg);
      card.appendChild(retryBtn);
      return card;
    }

    function renderEmptyParseCard() {
      const card = el('div', 'cdv-state-card');
      const title = el('div', 'cdv-state-title', 'ยังไม่ได้แกะคอร์ดเป็นข้อความ');
      const msg = el(
        'div',
        'cdv-state-msg',
        'กดปุ่มด้านล่างเพื่ออ่านคอร์ดและเนื้อเพลงจากรูปภาพ พร้อมจัดตำแหน่งและเปลี่ยนคีย์ได้ทันที (บันทึกไว้ใช้ครั้งต่อไปโดยไม่ต้องแกะซ้ำ)'
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

      // Row 1: Key Info & Transpose Controls
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

      const transposeGroup = el('div', 'cdv-transpose-group');

      const btnDown = el('button', 'cdv-tr-btn', '−');
      btnDown.type = 'button';
      btnDown.title = 'ลดคีย์ลง 1 ครึ่งเสียง';
      btnDown.setAttribute('aria-label', 'ลดคีย์');
      btnDown.addEventListener('click', function () {
        const next = normShift(currentShift - 1);
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
      btnUp.title = 'เพิ่มคีย์ขึ้น 1 ครึ่งเสียง';
      btnUp.setAttribute('aria-label', 'เพิ่มคีย์');
      btnUp.addEventListener('click', function () {
        const next = normShift(currentShift + 1);
        currentShift = next;
        onShiftChange(next);
        renderView();
      });

      transposeGroup.appendChild(btnDown);
      transposeGroup.appendChild(btnReset);
      transposeGroup.appendChild(btnUp);

      keyRow.appendChild(keyInfo);
      keyRow.appendChild(transposeGroup);
      bar.appendChild(keyRow);

      // Row 2: Format Toggle & Re-parse Action
      const actionRow = el('div', 'cdv-action-row');

      const fmtSeg = el('div', 'cdv-format-toggle');
      const btnMono = el(
        'button',
        'cdv-fmt-btn' + (currentFormat === 'monospace' ? ' is-active' : ''),
        '📐 จัดตำแหน่งตามรูป (Monospace)'
      );
      btnMono.type = 'button';
      btnMono.addEventListener('click', function () {
        if (currentFormat !== 'monospace') {
          currentFormat = 'monospace';
          renderView();
        }
      });

      const btnCp = el(
        'button',
        'cdv-fmt-btn' + (currentFormat === 'chordpro' ? ' is-active' : ''),
        '🎵 ChordPro'
      );
      btnCp.type = 'button';
      btnCp.addEventListener('click', function () {
        if (currentFormat !== 'chordpro') {
          currentFormat = 'chordpro';
          renderView();
        }
      });

      fmtSeg.appendChild(btnMono);
      fmtSeg.appendChild(btnCp);

      const btnReparse = el('button', 'cdv-reparse-btn', '🔄 แกะใหม่');
      btnReparse.type = 'button';
      btnReparse.title = 'แกะคอร์ดจากรูปภาพใหม่อีกครั้ง';
      btnReparse.addEventListener('click', function () {
        triggerParse(true);
      });

      actionRow.appendChild(fmtSeg);
      actionRow.appendChild(btnReparse);
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
      // Split into alternating whitespace and non-whitespace tokens so exact spacing is preserved
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

    function renderChordProLine(lineEl, lineText, Parser) {
      const re = /\[([^\]]+)\]/g;
      let lastIdx = 0;
      let m;

      while ((m = re.exec(lineText)) !== null) {
        if (m.index > lastIdx) {
          lineEl.appendChild(document.createTextNode(lineText.slice(lastIdx, m.index)));
        }
        const inner = m[1];
        if (Parser && Parser.isChordToken(inner)) {
          const chip = createChordButton(inner);
          chip.classList.add('is-inline');
          lineEl.appendChild(chip);
        } else {
          lineEl.appendChild(document.createTextNode(m[0]));
        }
        lastIdx = m.index + m[0].length;
      }

      if (lastIdx < lineText.length) {
        lineEl.appendChild(document.createTextNode(lineText.slice(lastIdx)));
      }
    }

    function renderSheetBody() {
      const Parser = getParser();
      const origKey = (parsedData && parsedData.originalKey) || (currentSong && currentSong.key) || '';
      const sheetWrap = el('div', 'cdv-sheet-wrap');
      const sheet = el('div', 'cdv-sheet' + (currentFormat === 'chordpro' ? ' is-chordpro' : ' is-monospace'));

      const rawDisplay =
        currentFormat === 'chordpro'
          ? (Parser
              ? Parser.transposeChordProText(parsedData.chordPro || '', currentShift, origKey)
              : (parsedData.chordPro || ''))
          : (Parser
              ? Parser.transposeMonospaceText(parsedData.alignedText || '', currentShift, origKey)
              : (parsedData.alignedText || ''));

      const lines = rawDisplay.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const type = Parser ? Parser.classifyTextLine(line) : (line.trim() ? 'lyric' : 'blank');

        if (type === 'blank') {
          sheet.appendChild(el('div', 'cdv-line cdv-line-blank', ' '));
          continue;
        }

        if (type === 'section') {
          sheet.appendChild(el('div', 'cdv-line cdv-line-section', line.trim()));
          continue;
        }

        if (currentFormat === 'chordpro') {
          const lineEl = el('div', 'cdv-line cdv-line-chordpro');
          renderChordProLine(lineEl, line, Parser);
          sheet.appendChild(lineEl);
          continue;
        }

        // Monospace mode
        if (type === 'chord') {
          const lineEl = el('div', 'cdv-line cdv-line-chord');
          renderMonospaceChordLine(lineEl, line, Parser);
          sheet.appendChild(lineEl);
        } else if (type === 'mixed') {
          const lineEl = el('div', 'cdv-line cdv-line-mixed');
          if (/\[[A-G][#b]?[^\]]*\]/.test(line)) {
            renderChordProLine(lineEl, line, Parser);
          } else {
            renderMonospaceChordLine(lineEl, line, Parser);
          }
          sheet.appendChild(lineEl);
        } else {
          sheet.appendChild(el('div', 'cdv-line cdv-line-lyric', line));
        }
      }

      sheetWrap.appendChild(sheet);
      return sheetWrap;
    }

    /* ------------------------------------------------------------------------
     * OCR Trigger & Lifecycle Methods
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
      } else if (currentSong.id) {
        Parser.clearCachedParsedChord(currentSong.id);
      }

      const myToken = ++parseToken;
      isParsing = true;
      parseProgress = 5;
      parseStatus = 'กำลังโหลดรูปภาพคอร์ด...';
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
          ocrRunner: ocrRunner || undefined,
          onProgress: function (msg, pct) {
            if (destroyed || myToken !== parseToken) return;
            parseStatus = msg || parseStatus;
            if (typeof pct === 'number') parseProgress = Math.max(0, Math.min(100, Math.round(pct)));
            renderToolbar();
            renderView();
          }
        });

        if (destroyed || myToken !== parseToken) return null;

        if (!result || !result.alignedText || !result.alignedText.trim()) {
          throw new Error('ไม่พบข้อความหรือคอร์ดในรูปภาพนี้');
        }

        parsedData = Parser.saveParsedChord(currentSong, result, onParsedSaved) || result;
        isParsing = false;
        parseProgress = 100;
        parseError = '';

        renderToolbar();
        renderView();
        notifyModeChange();
        onToast('แกะคอร์ดจากรูปและบันทึกเรียบร้อยแล้ว', false);
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
      parseToken++; // Invalidate any in-flight OCR for previous song
      currentSong = song || null;
      currentShift = normShift(shift || 0);
      currentMode = 'image';
      isParsing = false;
      parseProgress = 0;
      parseStatus = '';
      parseError = '';

      const Parser = getParser();
      parsedData = (Parser && currentSong && hasSongImages(currentSong))
        ? Parser.getCachedParsedChord(currentSong)
        : null;

      renderToolbar();
      renderView();
      notifyModeChange();
    }

    function setShift(shift) {
      const next = normShift(shift);
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
