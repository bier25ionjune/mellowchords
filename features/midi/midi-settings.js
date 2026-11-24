/* ==============================================================================
 * Mellow Chords — MIDI Footswitch Settings Modal, Panel & Status Badge
 * Zero-Build Vanilla ES6+ Classic Browser Script (IIFE)
 * Attaches: openSettingsModal, renderSettingsPanel, createStatusBadge on window.MellowMidi
 * ============================================================================== */
(function (root) {
  'use strict';

  var activeModalClose = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function pad3(n) {
    if (n < 10) return '00' + n;
    if (n < 100) return '0' + n;
    return String(n);
  }

  function formatTimestamp(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) + '.' + pad3(d.getMilliseconds());
  }

  function formatMappingSafe(mapping) {
    var ns = root.MellowMidi;
    if (ns && typeof ns.formatMidiMapping === 'function') {
      return ns.formatMidiMapping(mapping);
    }
    if (!mapping || !mapping.type) {
      return 'ยังไม่ได้ตั้งค่า';
    }
    return String(mapping.type).toUpperCase() + ' #' + mapping.number + ' (Ch ' + mapping.channel + ')';
  }

  function getStatusMeta(state) {
    var status = state && state.status ? state.status : 'idle';
    if (state && state.learningAction) {
      return {
        dotClass: 'midi-dot-amber midi-dot-pulse',
        label: 'กำลังรอสัญญาณ MIDI Learn...',
        shortLabel: 'MIDI Learn',
        bannerClass: 'midi-banner-amber'
      };
    }
    switch (status) {
      case 'connected':
        if (state.config && !state.config.enabled) {
          return {
            dotClass: 'midi-dot-amber',
            label: 'เชื่อมต่อแล้ว (ปิดใช้งานชั่วคราว)',
            shortLabel: 'MIDI ปิด',
            bannerClass: 'midi-banner-amber'
          };
        }
        return {
          dotClass: 'midi-dot-ok',
          label: 'เชื่อมต่ออุปกรณ์ MIDI แล้ว',
          shortLabel: 'MIDI พร้อม',
          bannerClass: 'midi-banner-ok'
        };
      case 'disconnected':
        return {
          dotClass: 'midi-dot-amber',
          label: 'ไม่พบอุปกรณ์ MIDI (เสียบสาย USB/BLE เพื่อเชื่อมต่ออัตโนมัติ)',
          shortLabel: 'MIDI',
          bannerClass: 'midi-banner-muted'
        };
      case 'denied':
        return {
          dotClass: 'midi-dot-danger',
          label: state.error || 'ไม่ได้รับอนุญาตให้เข้าถึงอุปกรณ์ MIDI',
          shortLabel: 'MIDI ถูกบล็อก',
          bannerClass: 'midi-banner-danger'
        };
      case 'unsupported':
        return {
          dotClass: 'midi-dot-gray',
          label: 'เบราว์เซอร์นี้ไม่รองรับ Web MIDI (ยังสามารถใช้ตัวจำลองได้)',
          shortLabel: 'MIDI',
          bannerClass: 'midi-banner-muted'
        };
      default:
        return {
          dotClass: 'midi-dot-gray',
          label: 'พร้อมเชื่อมต่อ Web MIDI API',
          shortLabel: 'MIDI',
          bannerClass: 'midi-banner-muted'
        };
    }
  }

  function describeMatchedAction(matchedAction) {
    if (!matchedAction) {
      return { text: 'ไม่ได้จับคู่ปุ่ม', cls: 'midi-tag-muted' };
    }
    if (matchedAction === 'nextSong') {
      return { text: '⏭ เพลงถัดไป', cls: 'midi-tag-ok' };
    }
    if (matchedAction === 'prevSong') {
      return { text: '⏮ เพลงก่อนหน้า', cls: 'midi-tag-ok' };
    }
    if (matchedAction === 'learn:nextSong') {
      return { text: '🎯 ตั้งค่า: เพลงถัดไป', cls: 'midi-tag-accent' };
    }
    if (matchedAction === 'learn:prevSong') {
      return { text: '🎯 ตั้งค่า: เพลงก่อนหน้า', cls: 'midi-tag-accent' };
    }
    return { text: String(matchedAction), cls: 'midi-tag-muted' };
  }

  /**
   * Creates a compact header/toolbar status pill (`🎹 MIDI` with green/amber/gray dot)
   * that opens the MIDI Settings modal (or calls custom onClick) when clicked.
   */
  function createStatusBadge(controller, onClick) {
    var btn = el('button', 'midi-status-badge');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'ตั้งค่า MIDI Footswitch');

    var dot = el('span', 'midi-dot midi-dot-gray');
    dot.setAttribute('aria-hidden', 'true');
    var label = el('span', 'midi-status-badge-label', '🎹 MIDI');

    btn.appendChild(dot);
    btn.appendChild(label);

    function sync(state) {
      var meta = getStatusMeta(state);
      dot.className = 'midi-dot ' + meta.dotClass;
      btn.title = meta.label + (state && state.connectedCount ? ' (' + state.connectedCount + ' อุปกรณ์)' : '');
      if (state && state.status === 'connected' && state.config && state.config.enabled) {
        btn.classList.add('midi-status-badge-active');
      } else {
        btn.classList.remove('midi-status-badge-active');
      }
    }

    btn.addEventListener('click', function (e) {
      if (typeof onClick === 'function') {
        onClick(e, controller);
      } else {
        openSettingsModal(controller);
      }
    });

    var unsubscribe = function () {};
    if (controller && typeof controller.getState === 'function') {
      sync(controller.getState());
    }
    if (controller && typeof controller.subscribe === 'function') {
      unsubscribe = controller.subscribe(sync);
    }

    btn.destroy = function () {
      unsubscribe();
    };

    return btn;
  }

  /**
   * Renders the interactive MIDI Footswitch settings panel inside `container`.
   * Returns `{ update, destroy }`.
   */
  function renderSettingsPanel(container, controller, options) {
    if (!container || !controller) {
      return { update: function () {}, destroy: function () {} };
    }
    var opts = options && typeof options === 'object' ? options : {};

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var rootEl = el('div', 'midi-panel');

    // -------------------------------------------------------------------------
    // 1) Connection Status Banner
    // -------------------------------------------------------------------------
    var statusSection = el('section', 'midi-section midi-status-banner');

    var statusTop = el('div', 'midi-status-top');
    var statusInfo = el('div', 'midi-status-info');
    var statusDot = el('span', 'midi-dot midi-dot-gray');
    statusDot.setAttribute('aria-hidden', 'true');
    var statusTextWrap = el('div', 'midi-status-text-wrap');
    var statusTitle = el('div', 'midi-status-title', 'สถานะ MIDI');
    var statusCount = el('span', 'midi-count-pill', '0 อุปกรณ์');
    statusTextWrap.appendChild(statusTitle);
    statusInfo.appendChild(statusDot);
    statusInfo.appendChild(statusTextWrap);
    statusTop.appendChild(statusInfo);
    statusTop.appendChild(statusCount);

    var deviceRow = el('div', 'midi-device-row');
    var deviceSelect = el('select', 'midi-select');
    deviceSelect.setAttribute('aria-label', 'เลือกอุปกรณ์ MIDI');

    var refreshBtn = el('button', 'midi-btn midi-btn-secondary', '🔄 รีเฟรชอุปกรณ์');
    refreshBtn.type = 'button';

    deviceRow.appendChild(deviceSelect);
    deviceRow.appendChild(refreshBtn);

    statusSection.appendChild(statusTop);
    statusSection.appendChild(deviceRow);
    rootEl.appendChild(statusSection);

    // -------------------------------------------------------------------------
    // 2) Controls: Enable Toggle & Debounce Slider/Input
    // -------------------------------------------------------------------------
    var controlsSection = el('section', 'midi-section');
    var controlsHeader = el('div', 'midi-section-header');
    controlsHeader.appendChild(el('h3', 'midi-section-title', 'การควบคุมพื้นฐาน'));
    controlsSection.appendChild(controlsHeader);

    var toggleRow = el('label', 'midi-toggle-row');
    var toggleLabelWrap = el('div', 'midi-toggle-text');
    toggleLabelWrap.appendChild(el('span', 'midi-toggle-title', 'เปิดใช้งาน MIDI Footswitch'));
    toggleLabelWrap.appendChild(el('span', 'midi-toggle-sub', 'รับสัญญาณเหยียบแป้นเพื่อเปลี่ยนเพลงถัดไป/ก่อนหน้า'));

    var switchWrap = el('span', 'midi-switch');
    var enabledCheckbox = el('input', 'midi-switch-input');
    enabledCheckbox.type = 'checkbox';
    var switchTrack = el('span', 'midi-switch-track');
    switchWrap.appendChild(enabledCheckbox);
    switchWrap.appendChild(switchTrack);

    toggleRow.appendChild(toggleLabelWrap);
    toggleRow.appendChild(switchWrap);
    controlsSection.appendChild(toggleRow);

    var debounceBox = el('div', 'midi-debounce-box');
    var debounceHeader = el('div', 'midi-debounce-header');
    debounceHeader.appendChild(el('span', 'midi-label', 'กันกดเบิ้ล (Debounce)'));
    var debounceReadout = el('span', 'midi-debounce-value', '350 ms');
    debounceHeader.appendChild(debounceReadout);

    var debounceControls = el('div', 'midi-debounce-controls');
    var debounceRange = el('input', 'midi-range');
    debounceRange.type = 'range';
    debounceRange.min = '100';
    debounceRange.max = '1000';
    debounceRange.step = '10';
    debounceRange.setAttribute('aria-label', 'ระยะเวลา Debounce (มิลลิวินาที)');

    var debounceNumber = el('input', 'midi-input midi-debounce-number');
    debounceNumber.type = 'number';
    debounceNumber.min = '100';
    debounceNumber.max = '1000';
    debounceNumber.step = '10';
    debounceNumber.setAttribute('aria-label', 'ค่า Debounce เป็นมิลลิวินาที');

    debounceControls.appendChild(debounceRange);
    debounceControls.appendChild(debounceNumber);
    debounceBox.appendChild(debounceHeader);
    debounceBox.appendChild(debounceControls);
    controlsSection.appendChild(debounceBox);
    rootEl.appendChild(controlsSection);

    // -------------------------------------------------------------------------
    // 3) MIDI Learn Mappings
    // -------------------------------------------------------------------------
    var mappingSection = el('section', 'midi-section');
    var mappingHeader = el('div', 'midi-section-header');
    mappingHeader.appendChild(el('h3', 'midi-section-title', 'ตั้งค่าปุ่มเหยียบ (MIDI Learn)'));

    var resetBtn = el('button', 'midi-btn midi-btn-ghost midi-btn-sm', '↺ คืนค่าเริ่มต้น');
    resetBtn.type = 'button';
    mappingHeader.appendChild(resetBtn);
    mappingSection.appendChild(mappingHeader);

    var mappingGrid = el('div', 'midi-mapping-grid');

    function createMappingCard(actionKey, titleText) {
      var card = el('div', 'midi-mapping-card');
      card.dataset.action = actionKey;

      var cardTop = el('div', 'midi-mapping-top');
      var titleEl = el('div', 'midi-mapping-title', titleText);
      var badgeEl = el('span', 'midi-binding-badge', 'ยังไม่ได้ตั้งค่า');
      cardTop.appendChild(titleEl);
      cardTop.appendChild(badgeEl);

      var actionsRow = el('div', 'midi-mapping-actions');
      var learnBtn = el('button', 'midi-btn midi-btn-primary midi-learn-btn', '🎯 MIDI Learn');
      learnBtn.type = 'button';

      var clearBtn = el('button', 'midi-btn midi-btn-danger-ghost midi-btn-sm', '✕ ล้าง');
      clearBtn.type = 'button';

      actionsRow.appendChild(learnBtn);
      actionsRow.appendChild(clearBtn);

      card.appendChild(cardTop);
      card.appendChild(actionsRow);

      learnBtn.addEventListener('click', function () {
        var st = controller.getState();
        if (st.learningAction === actionKey) {
          controller.cancelLearn();
        } else {
          controller.startLearn(actionKey);
        }
      });

      clearBtn.addEventListener('click', function () {
        controller.clearMapping(actionKey);
      });

      return {
        card: card,
        badgeEl: badgeEl,
        learnBtn: learnBtn,
        clearBtn: clearBtn
      };
    }

    var nextCard = createMappingCard('nextSong', '⏭ เพลงถัดไป (Next Song)');
    var prevCard = createMappingCard('prevSong', '⏮ เพลงก่อนหน้า (Previous Song)');
    mappingGrid.appendChild(nextCard.card);
    mappingGrid.appendChild(prevCard.card);
    mappingSection.appendChild(mappingGrid);
    rootEl.appendChild(mappingSection);

    // -------------------------------------------------------------------------
    // 4) Simulator Panel (ทดสอบเมื่อไม่มีอุปกรณ์จริง)
    // -------------------------------------------------------------------------
    var simSection = el('section', 'midi-section midi-sim-section');
    var simHeader = el('div', 'midi-section-header');
    simHeader.appendChild(el('h3', 'midi-section-title', 'ทดสอบเมื่อไม่มีอุปกรณ์จริง (Simulator)'));
    simSection.appendChild(simHeader);

    var quickSimRow = el('div', 'midi-sim-quick-row');
    var simPrevBtn = el('button', 'midi-btn midi-btn-accent-soft', '⚡ จำลองเหยียบ: เพลงก่อนหน้า');
    simPrevBtn.type = 'button';
    var simNextBtn = el('button', 'midi-btn midi-btn-accent-soft', '⚡ จำลองเหยียบ: เพลงถัดไป');
    simNextBtn.type = 'button';
    quickSimRow.appendChild(simPrevBtn);
    quickSimRow.appendChild(simNextBtn);
    simSection.appendChild(quickSimRow);

    var customSimBox = el('div', 'midi-sim-custom');
    var simGrid = el('div', 'midi-sim-grid');

    function createSimField(labelText, inputEl) {
      var field = el('label', 'midi-field');
      field.appendChild(el('span', 'midi-field-label', labelText));
      field.appendChild(inputEl);
      return field;
    }

    var simTypeSelect = el('select', 'midi-select midi-select-sm');
    [
      { value: 'cc', label: 'CC (Control Change)' },
      { value: 'pc', label: 'PC (Program Change)' },
      { value: 'note', label: 'Note On' }
    ].forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      simTypeSelect.appendChild(opt);
    });

    var simChannelInput = el('input', 'midi-input midi-input-sm');
    simChannelInput.type = 'number';
    simChannelInput.min = '1';
    simChannelInput.max = '16';
    simChannelInput.value = '1';

    var simNumberInput = el('input', 'midi-input midi-input-sm');
    simNumberInput.type = 'number';
    simNumberInput.min = '0';
    simNumberInput.max = '127';
    simNumberInput.value = '64';

    var simValueInput = el('input', 'midi-input midi-input-sm');
    simValueInput.type = 'number';
    simValueInput.min = '0';
    simValueInput.max = '127';
    simValueInput.value = '127';

    simGrid.appendChild(createSimField('Type', simTypeSelect));
    simGrid.appendChild(createSimField('Channel (1-16)', simChannelInput));
    simGrid.appendChild(createSimField('Number (0-127)', simNumberInput));
    simGrid.appendChild(createSimField('Value (0-127)', simValueInput));

    var simSendBtn = el('button', 'midi-btn midi-btn-secondary midi-sim-send-btn', '📡 ส่งสัญญาณจำลอง');
    simSendBtn.type = 'button';

    customSimBox.appendChild(simGrid);
    customSimBox.appendChild(simSendBtn);
    simSection.appendChild(customSimBox);
    rootEl.appendChild(simSection);

    // -------------------------------------------------------------------------
    // 5) Live MIDI Event Monitor
    // -------------------------------------------------------------------------
    var monitorSection = el('section', 'midi-section');
    var monitorHeader = el('div', 'midi-section-header');
    monitorHeader.appendChild(el('h3', 'midi-section-title', 'Live MIDI Event Monitor'));
    monitorHeader.appendChild(el('span', 'midi-muted-note', '10 สัญญาณล่าสุด'));
    monitorSection.appendChild(monitorHeader);

    var monitorList = el('div', 'midi-monitor-list');
    monitorSection.appendChild(monitorList);
    rootEl.appendChild(monitorSection);

    container.appendChild(rootEl);

    // -------------------------------------------------------------------------
    // Event Wiring
    // -------------------------------------------------------------------------
    deviceSelect.addEventListener('change', function () {
      controller.updateConfig({ deviceId: deviceSelect.value || 'all' });
    });

    refreshBtn.addEventListener('click', function () {
      var st = controller.getState();
      if (st.status === 'idle' || st.status === 'denied') {
        controller.init();
      } else {
        controller.refreshDevices();
      }
    });

    enabledCheckbox.addEventListener('change', function () {
      controller.updateConfig({ enabled: enabledCheckbox.checked });
    });

    debounceRange.addEventListener('input', function () {
      var val = Number(debounceRange.value);
      debounceReadout.textContent = val + ' ms';
      debounceNumber.value = String(val);
      controller.updateConfig({ debounceMs: val });
    });

    debounceNumber.addEventListener('change', function () {
      var val = Number(debounceNumber.value);
      controller.updateConfig({ debounceMs: val });
    });

    resetBtn.addEventListener('click', function () {
      controller.resetConfig();
    });

    simPrevBtn.addEventListener('click', function () {
      controller.simulateAction('prevSong');
    });

    simNextBtn.addEventListener('click', function () {
      controller.simulateAction('nextSong');
    });

    simTypeSelect.addEventListener('change', function () {
      simValueInput.disabled = simTypeSelect.value === 'pc';
    });

    simSendBtn.addEventListener('click', function () {
      controller.simulateMidiEvent({
        type: simTypeSelect.value,
        channel: Number(simChannelInput.value),
        number: Number(simNumberInput.value),
        value: simTypeSelect.value === 'pc' ? 127 : Number(simValueInput.value)
      });
    });

    // -------------------------------------------------------------------------
    // State Sync Renderer
    // -------------------------------------------------------------------------
    function renderMappingCardState(cardRefs, actionKey, state) {
      var mapping = state.config.mappings[actionKey];
      var isLearning = state.learningAction === actionKey;

      cardRefs.badgeEl.textContent = formatMappingSafe(mapping);
      if (mapping) {
        cardRefs.badgeEl.classList.remove('midi-binding-empty');
      } else {
        cardRefs.badgeEl.classList.add('midi-binding-empty');
      }

      if (isLearning) {
        cardRefs.card.classList.add('midi-learn-active');
        cardRefs.learnBtn.classList.add('midi-learn-btn-active');
        cardRefs.learnBtn.textContent = 'กำลังรอสัญญาณ... เหยียบแป้น MIDI (คลิกเพื่อยกเลิก)';
      } else {
        cardRefs.card.classList.remove('midi-learn-active');
        cardRefs.learnBtn.classList.remove('midi-learn-btn-active');
        cardRefs.learnBtn.textContent = '🎯 MIDI Learn';
      }

      cardRefs.clearBtn.disabled = !mapping;
    }

    function renderDeviceOptions(state) {
      var currentSelected = state.config.deviceId || 'all';
      while (deviceSelect.firstChild) {
        deviceSelect.removeChild(deviceSelect.firstChild);
      }

      var allOpt = document.createElement('option');
      allOpt.value = 'all';
      allOpt.textContent = 'ทุกอุปกรณ์ (All)';
      deviceSelect.appendChild(allOpt);

      var foundSelected = currentSelected === 'all';
      state.devices.forEach(function (dev) {
        var opt = document.createElement('option');
        opt.value = dev.id;
        var statusTag = dev.state === 'connected' ? '' : ' (ตัดการเชื่อมต่อ)';
        opt.textContent = dev.name + (dev.manufacturer ? ' — ' + dev.manufacturer : '') + statusTag;
        deviceSelect.appendChild(opt);
        if (dev.id === currentSelected) {
          foundSelected = true;
        }
      });

      if (!foundSelected) {
        var missingOpt = document.createElement('option');
        missingOpt.value = currentSelected;
        missingOpt.textContent = 'อุปกรณ์ที่บันทึกไว้ (ออฟไลน์)';
        deviceSelect.appendChild(missingOpt);
      }

      deviceSelect.value = currentSelected;
    }

    function renderMonitor(state) {
      while (monitorList.firstChild) {
        monitorList.removeChild(monitorList.firstChild);
      }

      if (!state.eventLog || state.eventLog.length === 0) {
        monitorList.appendChild(
          el('div', 'midi-monitor-empty', 'ยังไม่มีสัญญาณ MIDI — เหยียบแป้น MIDI หรือกดปุ่มจำลองด้านบนเพื่อทดสอบ')
        );
        return;
      }

      state.eventLog.forEach(function (entry) {
        var row = el('div', 'midi-monitor-row');
        if (entry.debounced) {
          row.classList.add('midi-monitor-row-debounced');
        }

        var timeEl = el('span', 'midi-monitor-time', formatTimestamp(entry.timestamp));
        var signalText = formatMappingSafe(entry.event);
        if (entry.event && entry.event.type !== 'pc') {
          signalText += ' · val ' + entry.event.value;
        }
        var signalEl = el('span', 'midi-monitor-signal', signalText);

        var tagsWrap = el('span', 'midi-monitor-tags');
        if (entry.simulated) {
          tagsWrap.appendChild(el('span', 'midi-tag midi-tag-info', 'SIM'));
        }

        var actionDesc = describeMatchedAction(entry.matchedAction);
        tagsWrap.appendChild(el('span', 'midi-tag ' + actionDesc.cls, actionDesc.text));

        if (entry.debounced) {
          tagsWrap.appendChild(el('span', 'midi-tag midi-tag-warn', '[Debounced]'));
        }

        row.appendChild(timeEl);
        row.appendChild(signalEl);
        row.appendChild(tagsWrap);
        monitorList.appendChild(row);
      });
    }

    function update(state) {
      var st = state || controller.getState();
      var meta = getStatusMeta(st);

      statusSection.className = 'midi-section midi-status-banner ' + meta.bannerClass;
      statusDot.className = 'midi-dot ' + meta.dotClass;
      statusTitle.textContent = meta.label;
      statusCount.textContent = st.connectedCount + ' อุปกรณ์';

      renderDeviceOptions(st);

      enabledCheckbox.checked = Boolean(st.config.enabled);
      debounceReadout.textContent = st.config.debounceMs + ' ms';
      if (document.activeElement !== debounceRange) {
        debounceRange.value = String(st.config.debounceMs);
      }
      if (document.activeElement !== debounceNumber) {
        debounceNumber.value = String(st.config.debounceMs);
      }

      renderMappingCardState(nextCard, 'nextSong', st);
      renderMappingCardState(prevCard, 'prevSong', st);
      renderMonitor(st);
    }

    var unsubscribe = controller.subscribe(update);
    update(controller.getState());

    if (opts.autoInit && controller.getState().status === 'idle') {
      controller.init();
    }

    return {
      update: update,
      destroy: function () {
        unsubscribe();
        if (rootEl.parentNode === container) {
          container.removeChild(rootEl);
        }
      }
    };
  }

  /**
   * Opens the MIDI Footswitch Settings modal dialog.
   * Closes on Escape key, backdrop click, or close button, and cleans up subscriptions.
   */
  function openSettingsModal(controller, options) {
    if (!controller || typeof document === 'undefined') {
      return null;
    }
    var opts = options && typeof options === 'object' ? options : {};

    if (typeof activeModalClose === 'function') {
      activeModalClose();
    }

    var backdrop = el('div', 'midi-modal-backdrop');
    backdrop.setAttribute('role', 'presentation');

    var dialog = el('div', 'midi-modal-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', opts.title || 'ตั้งค่า MIDI Footswitch');

    var header = el('div', 'midi-modal-header');
    var titleEl = el('h2', 'midi-modal-title', opts.title || '🎹 ตั้งค่า MIDI Footswitch');
    var closeBtn = el('button', 'midi-modal-close', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'ปิดหน้าต่างตั้งค่า MIDI');

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    var body = el('div', 'midi-modal-body');
    dialog.appendChild(header);
    dialog.appendChild(body);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    var panelHandle = renderSettingsPanel(body, controller, opts);
    var closed = false;

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }

    function onBackdropClick(e) {
      if (e.target === backdrop) {
        close();
      }
    }

    function close() {
      if (closed) {
        return;
      }
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      backdrop.removeEventListener('click', onBackdropClick);
      if (controller && typeof controller.cancelLearn === 'function') {
        controller.cancelLearn();
      }
      if (panelHandle && typeof panelHandle.destroy === 'function') {
        panelHandle.destroy();
      }
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      if (activeModalClose === close) {
        activeModalClose = null;
      }
      if (typeof opts.onClose === 'function') {
        opts.onClose();
      }
    }

    activeModalClose = close;
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);

    closeBtn.focus();

    return {
      close: close,
      element: backdrop
    };
  }

  var ns = root.MellowMidi || (root.MellowMidi = {});
  ns.openSettingsModal = openSettingsModal;
  ns.renderSettingsPanel = renderSettingsPanel;
  ns.createStatusBadge = createStatusBadge;
})(typeof window !== 'undefined' ? window : globalThis);
