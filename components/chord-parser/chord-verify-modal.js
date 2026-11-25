(function (global) {
  'use strict';

  /**
   * ============================================================================
   * Mellow Chords — Side-by-Side Calibration & Learning UI ("Verify & Teach")
   * Left Pane : Original Chord Sheet Image (Zoom / Scroll / Dark Invert)
   * Right Pane: ChordPro Editor + Real-time ChordTextViewer Preview (+/-12 Key)
   *             + Dynamic Few-Shot System Prompt Inspector + Re-parse & Teach DB
   * Exposes   : window.MellowChordVerifyModal
   * ============================================================================
   */

  function getParser() {
    return global.MellowChordParser || null;
  }

  function getViewer() {
    return global.MellowChordTextViewer || null;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function openVerifyModal(options) {
    const opts = options || {};
    const song = opts.song || {};
    const Parser = getParser();
    const Viewer = getViewer();
    const onToast = typeof opts.onToast === 'function' ? opts.onToast : function () {};
    const onSaved = typeof opts.onSaved === 'function' ? opts.onSaved : function () {};
    const getImageBlob = typeof opts.getImageBlob === 'function' ? opts.getImageBlob : null;
    const resolveImageUrls = typeof opts.resolveImageUrls === 'function' ? opts.resolveImageUrls : null;
    const visionRunner = typeof opts.visionRunner === 'function' ? opts.visionRunner : undefined;
    const ocrRunner = typeof opts.ocrRunner === 'function' ? opts.ocrRunner : undefined;
    const onChordClick = typeof opts.onChordClick === 'function' ? opts.onChordClick : null;

    if (!Parser) {
      onToast('ไม่พบโมดูล MellowChordParser', true);
      return null;
    }

    // Remove any existing verify modal instance
    const existing = document.getElementById('cvmOverlay');
    if (existing) existing.remove();

    const cached = Parser.getCachedParsedChord(song);
    const initialDomain = Parser.detectSourceDomain(song);
    const initialChordPro =
      (cached && (cached.chordpro_content || cached.chordPro)) ||
      song.chordpro_content ||
      (Viewer && song.text ? Viewer.ensureChordProContent(song.text) : (song.text || ''));
    const initialRawAi =
      (cached && cached.rawAiOutput) ||
      initialChordPro;
    const initialKey =
      (cached && (cached.original_key || cached.originalKey)) ||
      song.original_key ||
      song.key ||
      'C';

    let isVerified = Boolean((cached && cached.is_verified) || song.is_verified);
    let baselineRawOutput = initialRawAi;
    let zoomPct = 100;
    let invertImg = false;
    let isReparsing = false;
    let isSaving = false;
    let activeObjectUrls = [];
    let previewInstance = null;
    let currentMemory = { sourceDomain: initialDomain, correctionRules: [], verifiedExamples: [], allDomainExamplesCount: 0 };

    // Build Modal DOM
    const overlay = el('div', 'cvm-overlay');
    overlay.id = 'cvmOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'ตรวจสอบและสอนระบบแกะคอร์ด (Verify & Teach)');

    const shell = el('div', 'cvm-shell');

    /* -------------------- Top Header -------------------- */
    const header = el('div', 'cvm-header');
    const titleGroup = el('div', 'cvm-title-group');
    const titleEl = el('h2', 'cvm-title', '🎯 ตรวจสอบและสอนระบบ (Verify & Teach)');
    const verifyBadge = el('span', 'cvm-verify-badge');
    const memoryBadge = el('span', 'cvm-memory-badge', '🧠 กำลังโหลดความจำระบบ...');

    function updateHeaderBadges() {
      verifyBadge.className = 'cvm-verify-badge ' + (isVerified ? 'is-verified' : 'is-draft');
      verifyBadge.textContent = isVerified ? '✓ Verified (ตรวจแก้แล้ว)' : '⏳ รอตรวจสอบเทียบภาพ';
      const rCount = (currentMemory.correctionRules || []).length;
      const eCount = currentMemory.allDomainExamplesCount || (currentMemory.verifiedExamples || []).length;
      memoryBadge.textContent =
        '🧠 ความจำ ' + (domainSelect ? domainSelect.value : initialDomain) +
        ': กฎ ' + rCount + ' ข้อ • ตัวอย่าง ' + eCount + '/10';
    }

    titleGroup.appendChild(titleEl);
    titleGroup.appendChild(verifyBadge);
    titleGroup.appendChild(memoryBadge);

    const headerActions = el('div', 'cvm-header-actions');
    const promptToggleBtn = el('button', 'cvm-btn cvm-btn-ghost', '⚙️ Vision AI & Prompt');
    promptToggleBtn.type = 'button';
    promptToggleBtn.id = 'cvmTogglePromptBtn';

    const topCleanBtn = el('button', 'cvm-btn cvm-btn-secondary', '🧹 คลีนคอร์ด (Clean)');
    topCleanBtn.type = 'button';
    topCleanBtn.id = 'cvmTopCleanBtn';
    topCleanBtn.title = 'ล้างคำแปลกปลอมนอกรูปแบบคอร์ด และแปลงคำผิดจาก OCR ให้เป็นคอร์ดถูกต้อง';

    const topReparseBtn = el('button', 'cvm-btn cvm-btn-secondary', '🔄 ลองแกะใหม่ (Re-parse)');
    topReparseBtn.type = 'button';
    topReparseBtn.id = 'cvmTopReparseBtn';

    const closeBtn = el('button', 'cvm-btn cvm-btn-close', '✕ ปิด');
    closeBtn.type = 'button';
    closeBtn.id = 'cvmCloseBtn';

    headerActions.appendChild(promptToggleBtn);
    headerActions.appendChild(topCleanBtn);
    headerActions.appendChild(topReparseBtn);
    headerActions.appendChild(closeBtn);
    header.appendChild(titleGroup);
    header.appendChild(headerActions);

    /* -------------------- Collapsible Vision AI Config & Prompt Inspector -------------------- */
    const inspectorDrawer = el('div', 'cvm-inspector');
    inspectorDrawer.id = 'cvmPromptInspector';
    inspectorDrawer.hidden = true;

    const visionCfg = Parser.getVisionConfig();
    const cfgRow = el('div', 'cvm-cfg-row');

    const provWrap = el('div', 'cvm-field');
    provWrap.appendChild(el('label', 'cvm-label', 'เอนจินแกะคอร์ด (Vision AI Provider)'));
    const provSelect = el('select', 'cvm-select');
    provSelect.id = 'cvmVisionProviderSelect';
    [
      { v: 'auto', t: 'Auto (Google Gemini Flash / Edge Function)' },
      { v: 'gemini', t: 'Google Gemini Flash (Direct Browser API)' },
      { v: 'openai', t: 'OpenAI Vision API (gpt-4o-mini / gpt-4o)' },
      { v: 'ocr', t: 'Offline Spatial OCR + Learned Memory Rules' }
    ].forEach(function (opt) {
      const o = el('option', '', opt.t);
      o.value = opt.v;
      if (visionCfg.provider === opt.v) o.selected = true;
      provSelect.appendChild(o);
    });
    provWrap.appendChild(provSelect);

    const keyWrap = el('div', 'cvm-field cvm-grow');
    keyWrap.appendChild(el('label', 'cvm-label', 'Google Gemini API Key (ใส่เพื่อใช้ Gemini Flash แกะตรงจากภาพ)'));
    const apiKeyInp = el('input', 'cvm-input');
    apiKeyInp.type = 'password';
    apiKeyInp.id = 'cvmVisionApiKeyInput';
    apiKeyInp.placeholder = 'วาง Gemini API Key ที่นี่ (ขึ้นต้นด้วย AIza...)';
    apiKeyInp.value = visionCfg.apiKey || '';
    apiKeyInp.addEventListener('input', function () {
      const val = apiKeyInp.value.trim();
      const current = Parser.getVisionConfig();
      Parser.setVisionConfig({
        apiKey: val,
        provider: current.provider === 'auto' && val ? (val.startsWith('sk-') ? 'openai' : 'gemini') : current.provider
      });
    });
    keyWrap.appendChild(apiKeyInp);

    const autoParseWrap = el('div', 'cvm-field cvm-field-checkbox');
    const autoParseLabel = el('label', 'cvm-label cvm-check-inline');
    const autoParseInp = el('input', 'cvm-checkbox');
    autoParseInp.type = 'checkbox';
    autoParseInp.id = 'cvmAutoParseCheckbox';
    autoParseInp.checked = visionCfg.autoParseOnOpen !== false;
    autoParseLabel.appendChild(autoParseInp);
    autoParseLabel.appendChild(document.createTextNode(' ⚡ แกะคอร์ดอัตโนมัติเมื่อเปิดเพลง (Auto-Parse on Open)'));
    autoParseWrap.appendChild(autoParseLabel);

    const saveCfgBtn = el('button', 'cvm-btn cvm-btn-secondary', '💾 บันทึกตั้งค่า AI');
    saveCfgBtn.type = 'button';
    saveCfgBtn.addEventListener('click', function () {
      const enteredKey = apiKeyInp.value.trim();
      let chosenProv = provSelect.value;
      if (enteredKey && chosenProv === 'auto') {
        chosenProv = enteredKey.startsWith('sk-') ? 'openai' : 'gemini';
        provSelect.value = chosenProv;
      }
      Parser.setVisionConfig({
        provider: chosenProv,
        apiKey: enteredKey,
        model: visionCfg.model || (chosenProv === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'),
        autoParseOnOpen: autoParseInp.checked
      });
      onToast('บันทึกการตั้งค่า Vision AI เรียบร้อยแล้ว ✔', false);
    });

    cfgRow.appendChild(provWrap);
    cfgRow.appendChild(keyWrap);
    cfgRow.appendChild(autoParseWrap);
    cfgRow.appendChild(saveCfgBtn);

    const promptLabel = el('div', 'cvm-label', '📜 System Prompt ปัจจุบัน (พร้อม Dynamic Few-Shot & กฎจาก chord_parser_memory):');
    const promptPre = el('pre', 'cvm-prompt-pre');
    promptPre.id = 'cvmSystemPromptPreview';

    inspectorDrawer.appendChild(cfgRow);
    inspectorDrawer.appendChild(promptLabel);
    inspectorDrawer.appendChild(promptPre);

    promptToggleBtn.addEventListener('click', function () {
      inspectorDrawer.hidden = !inspectorDrawer.hidden;
    });

    /* -------------------- Status / Learning Feedback Banner -------------------- */
    const statusBanner = el('div', 'cvm-status-banner');
    statusBanner.id = 'cvmStatusBanner';
    statusBanner.hidden = true;

    function showBanner(msg, tone) {
      statusBanner.hidden = false;
      statusBanner.className = 'cvm-status-banner is-' + (tone || 'info');
      statusBanner.textContent = msg;
    }

    /* -------------------- Main Side-by-Side Body -------------------- */
    const bodyGrid = el('div', 'cvm-grid');

    // LEFT PANE: Original Chord Sheet Image
    const leftPane = el('section', 'cvm-pane cvm-left-pane');
    const leftBar = el('div', 'cvm-pane-bar');
    leftBar.appendChild(el('strong', 'cvm-pane-title', '🖼️ รูปภาพต้นฉบับ (' + (song.title || 'ชีทคอร์ด') + ')'));

    const zoomGroup = el('div', 'cvm-zoom-controls');
    const zoomOutBtn = el('button', 'cvm-mini-btn', '−');
    zoomOutBtn.type = 'button';
    const zoomLabel = el('span', 'cvm-zoom-val', '100%');
    const zoomInBtn = el('button', 'cvm-mini-btn', '+');
    zoomInBtn.type = 'button';
    const zoomResetBtn = el('button', 'cvm-mini-btn', 'Fit');
    zoomResetBtn.type = 'button';
    const invertBtn = el('button', 'cvm-mini-btn', '🌓 โหมดมืด');
    invertBtn.type = 'button';

    zoomGroup.appendChild(zoomOutBtn);
    zoomGroup.appendChild(zoomLabel);
    zoomGroup.appendChild(zoomInBtn);
    zoomGroup.appendChild(zoomResetBtn);
    zoomGroup.appendChild(invertBtn);
    leftBar.appendChild(zoomGroup);

    const imgViewport = el('div', 'cvm-img-viewport');
    imgViewport.id = 'cvmImageViewport';
    const imgStage = el('div', 'cvm-img-stage');

    function applyImageTransform() {
      zoomLabel.textContent = zoomPct + '%';
      imgStage.style.width = zoomPct + '%';
      imgStage.classList.toggle('is-inverted', invertImg);
    }

    zoomOutBtn.addEventListener('click', function () {
      zoomPct = Math.max(60, zoomPct - 25);
      applyImageTransform();
    });
    zoomInBtn.addEventListener('click', function () {
      zoomPct = Math.min(250, zoomPct + 25);
      applyImageTransform();
    });
    zoomResetBtn.addEventListener('click', function () {
      zoomPct = 100;
      applyImageTransform();
    });
    invertBtn.addEventListener('click', function () {
      invertImg = !invertImg;
      invertBtn.classList.toggle('is-active', invertImg);
      applyImageTransform();
    });

    imgViewport.appendChild(imgStage);
    leftPane.appendChild(leftBar);
    leftPane.appendChild(imgViewport);

    // RIGHT PANE: ChordPro Editor + Live ChordTextViewer Preview
    const rightPane = el('section', 'cvm-pane cvm-right-pane');

    // Meta row (Original Key + Source Domain + Live Diff Count)
    const metaBar = el('div', 'cvm-meta-bar');

    const keyField = el('div', 'cvm-field-inline');
    keyField.appendChild(el('label', 'cvm-label-inline', 'คีย์ต้นฉบับ:'));
    const origKeyInput = el('input', 'cvm-input cvm-key-input');
    origKeyInput.id = 'cvmOriginalKeyInput';
    origKeyInput.value = initialKey;
    origKeyInput.placeholder = 'เช่น C, Gm, F#';
    keyField.appendChild(origKeyInput);

    const domainField = el('div', 'cvm-field-inline');
    domainField.appendChild(el('label', 'cvm-label-inline', 'แหล่งที่มา:'));
    const domainSelect = el('select', 'cvm-select cvm-domain-select');
    domainSelect.id = 'cvmSourceDomainSelect';
    ['chordtabs', 'dochord', 'chordzaa', 'siamchord', 'guitarthai', 'musicatm', 'upload'].forEach(function (d) {
      const o = el('option', '', d);
      o.value = d;
      if (d === initialDomain) o.selected = true;
      domainSelect.appendChild(o);
    });
    domainField.appendChild(domainSelect);

    const diffHint = el('span', 'cvm-diff-chip', 'พร้อมตรวจทาน');
    diffHint.id = 'cvmDiffChip';

    metaBar.appendChild(keyField);
    metaBar.appendChild(domainField);
    metaBar.appendChild(diffHint);

    // Quick ChordPro Snippet Toolbar + Editor
    const editorSection = el('div', 'cvm-editor-section');
    const editorHeader = el('div', 'cvm-editor-head');
    editorHeader.appendChild(el('strong', 'cvm-sub-title', '✏️ แก้ไข ChordPro (วาง [Chord] หน้าพยางค์ตรงตามภาพ)'));

    const quickTokens = el('div', 'cvm-quick-tokens');
    [
      { label: '[Chord]', insert: '[C]', selectInner: true },
      { label: '{Intro}', insert: '{comment: Intro}\n[| C | G/B | Am7 | F |]\n' },
      { label: '{Verse}', insert: '{comment: Verse}\n' },
      { label: '{Chorus}', insert: '{comment: Chorus}\n' },
      { label: '{Solo}', insert: '{comment: Solo}\n[| C | G | Am | F |]\n' }
    ].forEach(function (snippet) {
      const b = el('button', 'cvm-mini-btn', snippet.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        const start = editorArea.selectionStart || 0;
        const end = editorArea.selectionEnd || 0;
        const val = editorArea.value;
        editorArea.value = val.slice(0, start) + snippet.insert + val.slice(end);
        editorArea.focus();
        if (snippet.selectInner) {
          editorArea.setSelectionRange(start + 1, start + snippet.insert.length - 1);
        } else {
          const caret = start + snippet.insert.length;
          editorArea.setSelectionRange(caret, caret);
        }
        handleEditorInput();
      });
      quickTokens.appendChild(b);
    });

    const cleanOcrBtn = el('button', 'cvm-mini-btn', '🧹 คลีนคอร์ด');
    cleanOcrBtn.type = 'button';
    cleanOcrBtn.id = 'cvmCleanEditorBtn';
    cleanOcrBtn.title = 'ล้างคำแปลกปลอมนอกรูปแบบคอร์ด และแปลงคำผิดจาก OCR ให้เป็นคอร์ดมาตรฐาน';
    cleanOcrBtn.style.color = '#34d399';
    cleanOcrBtn.style.borderColor = 'rgba(52, 211, 153, 0.45)';
    quickTokens.appendChild(cleanOcrBtn);

    editorHeader.appendChild(quickTokens);

    const editorArea = el('textarea', 'cvm-textarea');
    editorArea.id = 'cvmChordProEditor';
    editorArea.spellcheck = false;
    editorArea.placeholder = 'ตัวอย่าง:\n{comment: Intro}\n[| C | G/B | Am7 | F |]\n\n[C]เธอทำให้ฉัน[Em7]รู้สึก ว่าความ[Am7]รักนั้นเป็นอย่างไร';
    editorArea.value = initialChordPro;

    editorSection.appendChild(editorHeader);
    editorSection.appendChild(editorArea);

    // Live ChordTextViewer Preview Section
    const previewSection = el('div', 'cvm-preview-section');
    const previewHead = el('div', 'cvm-preview-head');
    previewHead.appendChild(el('strong', 'cvm-sub-title', '👁️ พรีวิวผลลัพธ์จริง & ทดสอบปรับคีย์ (+/- 12 Semitones)'));
    const previewMount = el('div', 'cvm-preview-mount');
    previewMount.id = 'cvmLivePreview';

    previewSection.appendChild(previewHead);
    previewSection.appendChild(previewMount);

    rightPane.appendChild(metaBar);
    rightPane.appendChild(editorSection);
    rightPane.appendChild(previewSection);

    bodyGrid.appendChild(leftPane);
    bodyGrid.appendChild(rightPane);

    /* -------------------- Footer Actions -------------------- */
    const footer = el('div', 'cvm-footer');
    const footerNote = el(
      'div',
      'cvm-footer-note',
      '💡 เมื่อกด "บันทึกและสอนระบบ" แอปจะตั้งค่า is_verified = true และสกัดจุดที่แก้ผิดเก็บลง chord_parser_memory เพื่อใช้เป็น Few-Shot ในเพลงถัดไปอัตโนมัติ'
    );

    const footerBtns = el('div', 'cvm-footer-btns');
    const reparseBtn = el('button', 'cvm-btn cvm-btn-secondary', '🔄 ลองแกะใหม่ (Re-parse)');
    reparseBtn.type = 'button';
    reparseBtn.id = 'cvmReparseBtn';

    const saveTeachBtn = el('button', 'cvm-btn cvm-btn-primary', '🎓 บันทึกและสอนระบบ');
    saveTeachBtn.type = 'button';
    saveTeachBtn.id = 'cvmSaveTeachBtn';

    footerBtns.appendChild(reparseBtn);
    footerBtns.appendChild(saveTeachBtn);
    footer.appendChild(footerNote);
    footer.appendChild(footerBtns);

    shell.appendChild(header);
    shell.appendChild(inspectorDrawer);
    shell.appendChild(statusBanner);
    shell.appendChild(bodyGrid);
    shell.appendChild(footer);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    /* -------------------- Initialize Live Preview & Memory -------------------- */
    if (Viewer) {
      previewInstance = Viewer.createChordTextViewer({
        chordPro: editorArea.value,
        originalKey: origKeyInput.value.trim() || 'C',
        semitones: opts.initialShift || 0,
        accidentalMode: 'auto',
        showControls: true,
        card: true,
        onChordClick: onChordClick
      });
      previewInstance.mount(previewMount);
    }

    function updateDiffSummary() {
      const currentVal = editorArea.value.trim();
      const diff = Parser.extractLearningDiff(baselineRawOutput, currentVal);
      const count = diff.correctionRules.length;
      if (count > 0) {
        diffHint.className = 'cvm-diff-chip has-changes';
        diffHint.textContent = '✨ พบจุดสอนระบบ ' + count + ' รายการ';
      } else {
        diffHint.className = 'cvm-diff-chip';
        diffHint.textContent = isVerified ? '✓ ข้อมูลตรงตามที่ยืนยันแล้ว' : 'แก้ไขข้อความเพื่อสอนระบบ';
      }
    }

    function handleEditorInput() {
      if (previewInstance) {
        previewInstance.update({
          chordPro: editorArea.value,
          originalKey: origKeyInput.value.trim() || 'C'
        });
      }
      updateDiffSummary();
    }

    function runCleanChords() {
      const before = editorArea.value;
      const cleaned = (Parser && typeof Parser.cleanOcrArtifacts === 'function')
        ? Parser.cleanOcrArtifacts(before)
        : before;
      editorArea.value = cleaned;
      handleEditorInput();
      const detected = Parser && typeof Parser.detectOriginalKey === 'function'
        ? Parser.detectOriginalKey(null, cleaned)
        : '';
      if (detected && !origKeyInput.value.trim()) {
        origKeyInput.value = detected;
      }
      if (typeof global.toast === 'function') {
        global.toast('✨ ล้างคำแปลกปลอมและจัดรูปแบบคอร์ดเรียบร้อยแล้ว');
      }
    }

    cleanOcrBtn.addEventListener('click', runCleanChords);
    topCleanBtn.addEventListener('click', runCleanChords);

    editorArea.addEventListener('input', handleEditorInput);
    origKeyInput.addEventListener('input', handleEditorInput);

    async function refreshMemoryAndPrompt() {
      const domain = domainSelect.value || initialDomain;
      currentMemory = await Parser.fetchParserMemory(domain);
      promptPre.textContent = Parser.buildVisionSystemPrompt(currentMemory);
      updateHeaderBadges();
    }

    domainSelect.addEventListener('change', function () {
      refreshMemoryAndPrompt();
    });

    /* -------------------- Load Original Song Images -------------------- */
    async function renderOriginalImages() {
      while (imgStage.firstChild) imgStage.removeChild(imgStage.firstChild);

      let urls = [];
      if (resolveImageUrls) {
        try {
          urls = await resolveImageUrls(song);
        } catch (_e) {}
      }

      if (!urls.length && Array.isArray(song.images) && song.images.length) {
        for (let i = 0; i < song.images.length; i++) {
          const item = song.images[i];
          if (typeof item === 'string' && /^(https?:|data:|blob:)/i.test(item)) {
            urls.push(item);
          } else if (getImageBlob && i === 0) {
            try {
              const b = await getImageBlob(song);
              if (b instanceof Blob) {
                const objUrl = URL.createObjectURL(b);
                activeObjectUrls.push(objUrl);
                urls.push(objUrl);
              }
            } catch (_err) {}
          }
        }
      }

      if (!urls.length) {
        imgStage.appendChild(el('div', 'cvm-empty-img', 'ไม่พบรูปภาพต้นฉบับของเพลงนี้'));
        return;
      }

      urls.forEach(function (u, idx) {
        const img = document.createElement('img');
        img.className = 'cvm-orig-img';
        img.alt = (song.title || 'Chord Sheet') + ' หน้า ' + (idx + 1);
        img.referrerPolicy = 'no-referrer';
        img.src = u;
        img.onerror = function () {
          if (!img.dataset.fallback && /^https?:\/\//i.test(u) && !u.includes('wsrv.nl')) {
            img.dataset.fallback = '1';
            img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(u) + '&output=webp&q=90';
          }
        };
        imgStage.appendChild(img);
      });
    }

    /* -------------------- Re-parse Action (Test Dynamic Learning) -------------------- */
    async function runReparse() {
      if (isReparsing || isSaving) return;
      isReparsing = true;
      reparseBtn.disabled = true;
      topReparseBtn.disabled = true;
      reparseBtn.textContent = '⏳ กำลังแกะใหม่...';
      topReparseBtn.textContent = '⏳ กำลังแกะใหม่...';

      try {
        Parser.clearCachedParsedChord(song);
        await refreshMemoryAndPrompt();

        showBanner(
          '⏳ กำลังลองแกะคอร์ดใหม่ด้วย Dynamic Few-Shot Prompt (กฎ ' +
          currentMemory.correctionRules.length + ' ข้อ, ตัวอย่าง ' +
          currentMemory.verifiedExamples.length + ' รายการ)...',
          'working'
        );

        let imgSource = null;
        if (getImageBlob) {
          try {
            imgSource = await getImageBlob(song);
          } catch (_e) {}
        }
        if (!imgSource && Array.isArray(song.images) && song.images.length) {
          imgSource = song.images[0];
        }
        if (!imgSource) {
          throw new Error('ไม่พบรูปภาพต้นฉบับสำหรับลองแกะใหม่');
        }

        const currentInpKey = (apiKeyInp.value || '').trim();
        if (currentInpKey) {
          const cfg = Parser.getVisionConfig();
          if (cfg.apiKey !== currentInpKey) {
            Parser.setVisionConfig({
              apiKey: currentInpKey,
              provider: cfg.provider === 'auto' ? (currentInpKey.startsWith('sk-') ? 'openai' : 'gemini') : cfg.provider
            });
          }
        }

        const result = await Parser.parseChordImage(imgSource, {
          songId: song.id,
          song: song,
          sourceDomain: domainSelect.value,
          visionRunner: visionRunner,
          ocrRunner: ocrRunner,
          onProgress: function (msg, pct) {
            showBanner('⏳ ' + msg + (typeof pct === 'number' ? ' (' + pct + '%)' : ''), 'working');
          }
        });

        if (!result || !(result.chordpro_content || result.chordPro)) {
          throw new Error('ไม่ได้รับผลลัพธ์ ChordPro จากการแกะใหม่');
        }

        const newCp = result.chordpro_content || result.chordPro;
        baselineRawOutput = result.rawAiOutput || newCp;
        editorArea.value = newCp;
        if (result.original_key || result.originalKey) {
          origKeyInput.value = result.original_key || result.originalKey;
        }
        if (result.systemPromptUsed) {
          promptPre.textContent = result.systemPromptUsed;
        }
        isVerified = false;
        updateHeaderBadges();
        handleEditorInput();

        const applied = result.memoryApplied || { rulesCount: 0, examplesCount: 0 };
        if (result.source === 'fallback-ocr' || result.isFallbackOcr) {
          if (result.visionError) {
            const warnMsg =
              '⚠️ เชื่อมต่อ Google Gemini Vision AI ไม่สำเร็จ: ' + result.visionError + '\n' +
              '👉 ระบบได้สลับมาใช้ Offline OCR สำรองและล้างคอร์ดให้อัตโนมัติ (สามารถเปิดดูการตั้งค่าใน "⚙️ Vision AI & Prompt")';
            showBanner(warnMsg, 'error');
            onToast('⚠️ Gemini Vision: ' + result.visionError, true);
          } else {
            const warnMsg =
              '⚠️ ฟังก์ชัน Edge ยังไม่เปิดใช้งาน และยังไม่ได้ใส่ Gemini API Key ในระบบ (กำลังใช้ Offline OCR สำรอง + ล้างอักขระเพี้ยนอัตโนมัติ)\n' +
              '👉 กดที่ปุ่ม "⚙️ Vision AI & Prompt" ด้านบนขวา แล้วใส่ Google Gemini API Key เพื่อให้ระบบใช้โมเดล Gemini Flash แกะตรงจากภาพได้อย่างแม่นยำ 100%!';
            showBanner(warnMsg, 'error');
            onToast('⚠️ กำลังใช้ Offline OCR สำรอง — แนะนำใส่ Gemini API Key ใน ⚙️ Vision AI & Prompt เพื่อความแม่นยำสูงสุด', true);
          }
        } else {
          const modelTag = result.modelUsed || result.provider || 'Gemini Flash';
          const summaryMsg =
            '✅ ลองแกะใหม่สำเร็จด้วย ' + modelTag + '! (ใช้ความจำจาก "' + domainSelect.value +
            '" กฎแก้คำผิด ' + applied.rulesCount + ' ข้อ + ตัวอย่าง Verified ' +
            applied.examplesCount + ' รายการ)';
          showBanner(summaryMsg, 'success');
          onToast(summaryMsg, false);
        }
      } catch (err) {
        const errMsg = (err && err.message) ? err.message : 'ลองแกะใหม่ไม่สำเร็จ';
        showBanner('⚠️ ' + errMsg, 'error');
        onToast(errMsg, true);
      } finally {
        isReparsing = false;
        reparseBtn.disabled = false;
        topReparseBtn.disabled = false;
        reparseBtn.textContent = '🔄 ลองแกะใหม่ (Re-parse)';
        topReparseBtn.textContent = '🔄 ลองแกะใหม่ (Re-parse)';
      }
    }

    reparseBtn.addEventListener('click', runReparse);
    topReparseBtn.addEventListener('click', runReparse);

    /* -------------------- Save & Teach System Action -------------------- */
    async function runSaveAndTeach() {
      if (isSaving || isReparsing) return;
      const verifiedText = editorArea.value.trim();
      if (!verifiedText) {
        onToast('กรุณากรอกเนื้อหา ChordPro ก่อนบันทึก', true);
        return;
      }

      isSaving = true;
      saveTeachBtn.disabled = true;
      saveTeachBtn.textContent = '⏳ กำลังบันทึกและสอนระบบ...';

      try {
        const outcome = await Parser.saveVerifiedAndTeach({
          song: song,
          rawChordPro: baselineRawOutput,
          verifiedChordPro: verifiedText,
          originalKey: origKeyInput.value.trim() || 'C',
          sourceDomain: domainSelect.value,
          onSongUpdated: function (songId, normalizedParsed) {
            onSaved(songId, normalizedParsed);
          }
        });

        // Ensure onSaved fires even for unsaved/ad-hoc songs without prior cache adapter
        if (!song.id) {
          onSaved(null, outcome.updatedParsed);
        }

        isVerified = true;
        baselineRawOutput = outcome.updatedParsed.chordpro_content;
        await refreshMemoryAndPrompt();
        updateDiffSummary();

        const learnedCount = outcome.rulesLearned.length;
        const msg =
          '🎓 บันทึกและสอนระบบเรียบร้อย! ตั้งค่า is_verified = true • เรียนรู้กฎใหม่ ' +
          learnedCount + ' ข้อ และเก็บตัวอย่างคุณภาพสูงลง chord_parser_memory (' +
          outcome.totalDomainExamples + '/10)';
        showBanner(msg, 'success');
        onToast(msg, false);
      } catch (err) {
        const errMsg = (err && err.message) ? err.message : 'บันทึกไม่สำเร็จ';
        showBanner('⚠️ ' + errMsg, 'error');
        onToast(errMsg, true);
      } finally {
        isSaving = false;
        saveTeachBtn.disabled = false;
        saveTeachBtn.textContent = '🎓 บันทึกและสอนระบบ';
      }
    }

    saveTeachBtn.addEventListener('click', runSaveAndTeach);

    /* -------------------- Close & Cleanup -------------------- */
    function close() {
      document.removeEventListener('keydown', onKeyDown);
      if (previewInstance) {
        previewInstance.destroy();
        previewInstance = null;
      }
      activeObjectUrls.forEach(function (u) {
        try { URL.revokeObjectURL(u); } catch (_e) {}
      });
      activeObjectUrls = [];
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }

    document.addEventListener('keydown', onKeyDown);
    closeBtn.addEventListener('click', close);

    // Kick off async loads
    updateHeaderBadges();
    updateDiffSummary();
    renderOriginalImages();
    refreshMemoryAndPrompt();

    // Auto-trigger initial parse if song has image but zero ChordPro text yet
    if (!initialChordPro.trim()) {
      runReparse();
    }

    return {
      close: close,
      reparse: runReparse,
      saveAndTeach: runSaveAndTeach
    };
  }

  const api = {
    openVerifyModal: openVerifyModal
  };

  global.MellowChordVerifyModal = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
