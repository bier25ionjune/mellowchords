/* ==============================================================================
 * Mellow Chords - Setlist Picker UI Component
 * Responsive Side Panel (desktop >= 960px) / Bottom Drawer (mobile < 960px)
 * Supports Songbook instant 1-tap add & Online Search auto-add to setlist.
 * Exposes: window.MellowSetlistPicker
 * ============================================================================== */
(function (global) {
  'use strict';

  var FILTER_DEFS = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'not_in_set', label: 'ยังไม่ในเซ็ต' },
    { id: 'in_set', label: 'อยู่ในเซ็ตแล้ว' },
    { id: 'fav', label: '⭐ โปรด' }
  ];

  /**
   * Safe DOM element builder (never uses innerHTML).
   */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function getService() {
    if (!global.MellowSetlistPickerService) {
      throw new Error('MellowSetlistPickerService must be loaded before setlist-picker.js');
    }
    return global.MellowSetlistPickerService;
  }

  function getSongMediaLabel(song) {
    var hasImg = Boolean(song && Array.isArray(song.images) && song.images.length > 0);
    var hasTxt = Boolean(song && typeof song.text === 'string' && song.text.trim().length > 0);
    if (hasImg && hasTxt) return '🖼️+📝';
    if (hasImg) return '🖼️ ภาพ';
    if (hasTxt) return '📝 เนื้อ';
    return '';
  }

  function getResultKey(item, idx) {
    if (!item) return 'res-' + idx;
    return String(item.id || item.url || item.sourceUrl || ('res-' + idx));
  }

  /**
   * Create a Setlist Picker controller instance.
   * @param {object} initialOptions
   * @returns {{ open, close, update, isOpen, getElement, destroy }}
   */
  function createPicker(initialOptions) {
    var opts = Object.assign({
      setlistId: '',
      setlistName: '',
      currentSongIds: [],
      getSongbook: function () { return []; },
      getFavIds: null,
      searchOnline: null,
      loadOnlineSong: null,
      saveSongToBook: null,
      addSongToSetlist: null,
      removeSongFromSetlist: null,
      onChanged: null,
      onToast: null,
      onClose: null
    }, initialOptions || {});

    var state = {
      open: false,
      destroyed: false,
      activeTab: 'book', // 'book' | 'online'
      bookQuery: '',
      bookFilter: 'all',
      onlineQuery: '',
      onlineResults: [],
      onlineLoading: false,
      onlineError: '',
      onlineHasSearched: false,
      loadingResultKeys: new Set(),
      addedResultKeys: new Set(),
      selectedBookIds: new Set(),
      currentSongIds: Array.isArray(opts.currentSongIds)
        ? opts.currentSongIds.map(String)
        : []
    };

    var searchAbortController = null;
    var closeTimer = null;
    var titleId = 'sp-title-' + Math.random().toString(36).slice(2, 9);

    // -------------------------------------------------------------------------
    // Build static shell DOM (100% safe DOM APIs)
    // -------------------------------------------------------------------------
    var root = el('div', 'sp-root');
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');

    var backdrop = el('div', 'sp-backdrop');
    root.appendChild(backdrop);

    var panel = el('aside', 'sp-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', titleId);
    root.appendChild(panel);

    // Mobile drag handle indicator
    var handleWrap = el('div', 'sp-handle-wrap');
    handleWrap.setAttribute('aria-hidden', 'true');
    handleWrap.appendChild(el('div', 'sp-handle'));
    panel.appendChild(handleWrap);

    // Header
    var header = el('div', 'sp-header');
    var headerText = el('div', 'sp-header-text');
    var titleEl = el('h2', 'sp-title', '➕ เพิ่มเพลงเข้าเซ็ต');
    titleEl.id = titleId;
    var subtitleEl = el('div', 'sp-subtitle', '');
    headerText.appendChild(titleEl);
    headerText.appendChild(subtitleEl);

    var closeBtn = el('button', 'sp-close-btn', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'ปิดหน้าต่างเพิ่มเพลง');

    header.appendChild(headerText);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Tabs
    var tabsBar = el('div', 'sp-tabs');
    tabsBar.setAttribute('role', 'tablist');

    var tabBookBtn = el('button', 'sp-tab is-active');
    tabBookBtn.type = 'button';
    tabBookBtn.setAttribute('role', 'tab');
    tabBookBtn.setAttribute('aria-selected', 'true');
    tabBookBtn.dataset.tab = 'book';
    var tabBookLabel = el('span', 'sp-tab-label', '📚 คลังเพลง');
    var tabBookCount = el('span', 'sp-tab-count', '0');
    tabBookBtn.appendChild(tabBookLabel);
    tabBookBtn.appendChild(tabBookCount);

    var tabOnlineBtn = el('button', 'sp-tab');
    tabOnlineBtn.type = 'button';
    tabOnlineBtn.setAttribute('role', 'tab');
    tabOnlineBtn.setAttribute('aria-selected', 'false');
    tabOnlineBtn.dataset.tab = 'online';
    tabOnlineBtn.appendChild(el('span', 'sp-tab-label', '🌐 ค้นหาออนไลน์'));

    tabsBar.appendChild(tabBookBtn);
    tabsBar.appendChild(tabOnlineBtn);
    panel.appendChild(tabsBar);

    // Body container
    var body = el('div', 'sp-body');
    panel.appendChild(body);

    // --- Tab 1: Songbook ---
    var bookPane = el('div', 'sp-pane');
    bookPane.setAttribute('role', 'tabpanel');

    var bookControls = el('div', 'sp-controls');
    var bookSearchWrap = el('div', 'sp-search-wrap');
    var bookSearchInput = el('input', 'sp-input');
    bookSearchInput.type = 'search';
    bookSearchInput.placeholder = 'ค้นหาชื่อเพลง, ศิลปิน, คีย์...';
    bookSearchInput.setAttribute('aria-label', 'ค้นหาในคลังเพลง');
    bookSearchInput.autocomplete = 'off';

    var bookClearBtn = el('button', 'sp-input-clear', '✕');
    bookClearBtn.type = 'button';
    bookClearBtn.setAttribute('aria-label', 'ล้างคำค้นหา');
    bookClearBtn.hidden = true;

    bookSearchWrap.appendChild(bookSearchInput);
    bookSearchWrap.appendChild(bookClearBtn);
    bookControls.appendChild(bookSearchWrap);

    var pillsWrap = el('div', 'sp-pills');
    pillsWrap.setAttribute('role', 'group');
    pillsWrap.setAttribute('aria-label', 'ตัวกรองคลังเพลง');

    var pillButtons = {};
    for (var i = 0; i < FILTER_DEFS.length; i++) {
      (function (def) {
        var pill = el('button', 'sp-pill' + (def.id === 'all' ? ' is-active' : ''), def.label);
        pill.type = 'button';
        pill.dataset.filter = def.id;
        pill.setAttribute('aria-pressed', def.id === 'all' ? 'true' : 'false');
        pill.addEventListener('click', function () {
          state.bookFilter = def.id;
          updateFilterPills();
          renderBookList();
        });
        pillsWrap.appendChild(pill);
        pillButtons[def.id] = pill;
      })(FILTER_DEFS[i]);
    }
    bookControls.appendChild(pillsWrap);
    bookPane.appendChild(bookControls);

    var bookListEl = el('div', 'sp-list');
    bookPane.appendChild(bookListEl);
    body.appendChild(bookPane);

    // --- Tab 2: Online Search ---
    var onlinePane = el('div', 'sp-pane');
    onlinePane.setAttribute('role', 'tabpanel');
    onlinePane.hidden = true;

    var onlineControls = el('div', 'sp-controls');
    var onlineForm = el('form', 'sp-online-form');
    var onlineInput = el('input', 'sp-input');
    onlineInput.type = 'search';
    onlineInput.placeholder = 'พิมพ์ชื่อเพลงหรือศิลปินเพื่อค้นหาออนไลน์...';
    onlineInput.setAttribute('aria-label', 'ค้นหาเพลงออนไลน์');
    onlineInput.autocomplete = 'off';

    var onlineSearchBtn = el('button', 'sp-btn-primary sp-online-submit', 'ค้นหา');
    onlineSearchBtn.type = 'submit';

    onlineForm.appendChild(onlineInput);
    onlineForm.appendChild(onlineSearchBtn);
    onlineControls.appendChild(onlineForm);
    onlinePane.appendChild(onlineControls);

    var onlineListEl = el('div', 'sp-list');
    onlinePane.appendChild(onlineListEl);
    body.appendChild(onlinePane);

    if (document.body) {
      document.body.appendChild(root);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    function notifyToast(msg, isErr) {
      if (typeof opts.onToast === 'function') {
        opts.onToast(msg, Boolean(isErr));
      }
    }

    function notifyChanged(info) {
      if (typeof opts.onChanged === 'function') {
        opts.onChanged(info);
      }
    }

    function abortOngoingSearch() {
      if (searchAbortController) {
        try {
          searchAbortController.abort();
        } catch (_) {}
        searchAbortController = null;
      }
    }

    function syncHeader() {
      var name = opts.setlistName ? String(opts.setlistName) : 'เซ็ตเพลง';
      var count = state.currentSongIds.length;
      subtitleEl.textContent = name + ' • ' + count + ' เพลงในเซ็ต';

      var book = typeof opts.getSongbook === 'function' ? (opts.getSongbook() || []) : [];
      tabBookCount.textContent = String(book.length);
    }

    function updateFilterPills() {
      for (var k in pillButtons) {
        if (!Object.prototype.hasOwnProperty.call(pillButtons, k)) continue;
        var active = k === state.bookFilter;
        pillButtons[k].classList.toggle('is-active', active);
        pillButtons[k].setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    function switchTab(tab) {
      state.activeTab = tab === 'online' ? 'online' : 'book';
      var isBook = state.activeTab === 'book';

      tabBookBtn.classList.toggle('is-active', isBook);
      tabBookBtn.setAttribute('aria-selected', isBook ? 'true' : 'false');
      tabOnlineBtn.classList.toggle('is-active', !isBook);
      tabOnlineBtn.setAttribute('aria-selected', !isBook ? 'true' : 'false');

      bookPane.hidden = !isBook;
      onlinePane.hidden = isBook;

      if (isBook) {
        renderBookList();
      } else {
        renderOnlineList();
        if (state.open) {
          setTimeout(function () {
            if (!state.destroyed && state.open && state.activeTab === 'online') {
              onlineInput.focus();
            }
          }, 40);
        }
      }
    }

    // -------------------------------------------------------------------------
    // Render: Songbook Tab
    // -------------------------------------------------------------------------
    function handleBookAdd(song) {
      if (!song || typeof opts.addSongToSetlist !== 'function') return;
      var ok = opts.addSongToSetlist(opts.setlistId, song);
      if (ok === false) return;

      var idStr = String(song.id);
      if (state.currentSongIds.indexOf(idStr) === -1) {
        state.currentSongIds.push(idStr);
      }
      syncHeader();
      renderBookList();
      if (state.onlineResults.length) renderOnlineList();

      notifyToast('เพิ่ม "' + (song.title || 'เพลง') + '" เข้าเซ็ตเพลงแล้ว ✔', false);
      notifyChanged({
        action: 'add',
        setlistId: opts.setlistId,
        song: song,
        currentSongIds: state.currentSongIds.slice()
      });
    }

    function handleBookRemove(song) {
      if (!song || typeof opts.removeSongFromSetlist !== 'function') return;
      var ok = opts.removeSongFromSetlist(opts.setlistId, song.id);
      if (ok === false) return;

      var idStr = String(song.id);
      state.currentSongIds = state.currentSongIds.filter(function (id) {
        return id !== idStr;
      });
      // Allow re-adding from online results if previously marked added
      state.addedResultKeys.clear();

      syncHeader();
      renderBookList();
      if (state.onlineResults.length) renderOnlineList();

      notifyToast('นำ "' + (song.title || 'เพลง') + '" ออกจากเซ็ตแล้ว', false);
      notifyChanged({
        action: 'remove',
        setlistId: opts.setlistId,
        song: song,
        currentSongIds: state.currentSongIds.slice()
      });
    }

    function renderBookList() {
      clearNode(bookListEl);
      var service = getService();
      var book = typeof opts.getSongbook === 'function' ? (opts.getSongbook() || []) : [];
      var favIds = typeof opts.getFavIds === 'function' ? (opts.getFavIds() || []) : undefined;

      var items = service.filterSongbook(book, {
        query: state.bookQuery,
        filter: state.bookFilter,
        currentSongIds: state.currentSongIds,
        favIds: favIds
      });

      if (!items.length) {
        var empty = el('div', 'sp-empty');
        var icon = el('div', 'sp-empty-icon', book.length ? '🔍' : '📚');
        var msg = el(
          'div',
          'sp-empty-text',
          book.length
            ? 'ไม่พบเพลงที่ตรงกับเงื่อนไข'
            : 'ยังไม่มีเพลงในคลัง'
        );
        empty.appendChild(icon);
        empty.appendChild(msg);

        if (state.bookQuery.trim() && typeof opts.searchOnline === 'function') {
          var jumpBtn = el(
            'button',
            'sp-btn-secondary sp-empty-action',
            '🌐 ค้นหา "' + state.bookQuery.trim() + '" ออนไลน์'
          );
          jumpBtn.type = 'button';
          jumpBtn.addEventListener('click', function () {
            var q = state.bookQuery.trim();
            state.onlineQuery = q;
            onlineInput.value = q;
            switchTab('online');
            runOnlineSearch(q);
          });
          empty.appendChild(jumpBtn);
        }

        bookListEl.appendChild(empty);
        return;
      }

      var frag = document.createDocumentFragment();
      var canRemove = typeof opts.removeSongFromSetlist === 'function';

      var bulkBar = el('div', '');
      bulkBar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:6px 8px;margin-bottom:8px;border-radius:8px;background:rgba(255,255,255,0.04)';
      var allIds = items.map(function (it) { return it.song && it.song.id; }).filter(Boolean);
      var allSelected = allIds.length > 0 && allIds.every(function (id) { return state.selectedBookIds.has(id); });
      var selAllBtn = el('button', 'sp-btn-add', allSelected ? 'ล้างที่เลือก' : ('☑️ ทั้งหมด (' + allIds.length + ')'));
      selAllBtn.type = 'button';
      selAllBtn.style.background = 'rgba(255,255,255,0.08)';
      selAllBtn.addEventListener('click', function () {
        if (allSelected) allIds.forEach(function (id) { state.selectedBookIds.delete(id); });
        else allIds.forEach(function (id) { state.selectedBookIds.add(id); });
        renderBookList();
      });
      bulkBar.appendChild(selAllBtn);

      var addableSelected = items.filter(function (it) { return !it.inSetlist && state.selectedBookIds.has(it.song.id); });
      var bulkAddBtn = el('button', 'sp-btn-add', '➕ เพิ่มที่เลือก (' + addableSelected.length + ')');
      bulkAddBtn.type = 'button';
      bulkAddBtn.addEventListener('click', function () {
        if (!addableSelected.length) {
          toast('กรุณาติ๊กเลือกเพลงที่ยังไม่อยู่ในเซ็ตก่อน', true);
          return;
        }
        addableSelected.forEach(function (it) {
          handleBookAdd(it.song);
          state.selectedBookIds.delete(it.song.id);
        });
        toast('เพิ่ม ' + addableSelected.length + ' เพลงเข้าเซ็ตแล้ว ✔', false);
        renderBookList();
      });
      bulkBar.appendChild(bulkAddBtn);

      if (canRemove) {
        var removableSelected = items.filter(function (it) { return it.inSetlist && state.selectedBookIds.has(it.song.id); });
        if (removableSelected.length) {
          var bulkRemBtn = el('button', 'sp-btn-remove', '🗑 นำออก (' + removableSelected.length + ')');
          bulkRemBtn.type = 'button';
          bulkRemBtn.style.width = 'auto';
          bulkRemBtn.style.padding = '4px 10px';
          bulkRemBtn.addEventListener('click', function () {
            removableSelected.forEach(function (it) {
              handleBookRemove(it.song);
              state.selectedBookIds.delete(it.song.id);
            });
            toast('นำออก ' + removableSelected.length + ' เพลงจากเซ็ตแล้ว', false);
            renderBookList();
          });
          bulkBar.appendChild(bulkRemBtn);
        }
      }
      frag.appendChild(bulkBar);

      for (var i = 0; i < items.length; i++) {
        (function (entry) {
          var song = entry.song;
          var row = el('div', 'sp-item' + (entry.inSetlist ? ' is-in-set' : ''));

          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = state.selectedBookIds.has(song.id);
          cb.style.cssText = 'width:18px;height:18px;flex-shrink:0;margin-right:8px;accent-color:#10b981;cursor:pointer';
          cb.addEventListener('change', function () {
            if (cb.checked) state.selectedBookIds.add(song.id);
            else state.selectedBookIds.delete(song.id);
            renderBookList();
          });
          row.appendChild(cb);

          var info = el('div', 'sp-item-info');
          var titleRow = el('div', 'sp-item-title-row');
          if (entry.isFav) {
            titleRow.appendChild(el('span', 'sp-fav-star', '⭐'));
          }
          titleRow.appendChild(el('span', 'sp-item-title', song.title || 'ไม่มีชื่อเพลง'));
          info.appendChild(titleRow);

          var meta = el('div', 'sp-item-meta');
          if (song.artist) {
            meta.appendChild(el('span', 'sp-item-artist', song.artist));
          }
          if (song.key) {
            meta.appendChild(el('span', 'sp-badge sp-badge-key', song.key));
          }
          var mediaLabel = getSongMediaLabel(song);
          if (mediaLabel) {
            meta.appendChild(el('span', 'sp-badge sp-badge-media', mediaLabel));
          }
          if (meta.childNodes.length) {
            info.appendChild(meta);
          }

          var actions = el('div', 'sp-item-actions');
          if (entry.inSetlist) {
            actions.appendChild(el('span', 'sp-badge-added', '✓ อยู่ในเซ็ตแล้ว'));
            if (canRemove) {
              var remBtn = el('button', 'sp-btn-remove', '✕');
              remBtn.type = 'button';
              remBtn.title = 'นำออกจากเซ็ต';
              remBtn.setAttribute('aria-label', 'นำ ' + (song.title || 'เพลง') + ' ออกจากเซ็ต');
              remBtn.addEventListener('click', function () {
                handleBookRemove(song);
              });
              actions.appendChild(remBtn);
            }
          } else {
            var addBtn = el('button', 'sp-btn-add', '+ เพิ่ม');
            addBtn.type = 'button';
            addBtn.addEventListener('click', function () {
              handleBookAdd(song);
            });
            actions.appendChild(addBtn);
          }

          row.appendChild(info);
          row.appendChild(actions);
          frag.appendChild(row);
        })(items[i]);
      }

      bookListEl.appendChild(frag);
    }

    // -------------------------------------------------------------------------
    // Render & Logic: Online Search Tab
    // -------------------------------------------------------------------------
    async function runOnlineSearch(rawQuery) {
      var q = String(rawQuery || '').trim();
      if (!q) {
        notifyToast('กรุณาพิมพ์ชื่อเพลงหรือศิลปินก่อนค้นหา', true);
        onlineInput.focus();
        return;
      }
      if (typeof opts.searchOnline !== 'function') {
        notifyToast('ไม่รองรับการค้นหาออนไลน์ในขณะนี้', true);
        return;
      }

      abortOngoingSearch();
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      searchAbortController = controller;

      state.onlineQuery = q;
      state.onlineLoading = true;
      state.onlineError = '';
      state.onlineHasSearched = true;
      state.onlineResults = [];
      onlineSearchBtn.disabled = true;
      renderOnlineList();

      try {
        var results = await opts.searchOnline(q, controller ? controller.signal : undefined);
        if (controller && controller.signal.aborted) return;
        if (state.destroyed) return;

        state.onlineResults = Array.isArray(results) ? results : [];
        state.onlineLoading = false;
        onlineSearchBtn.disabled = false;
        renderOnlineList();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        if (state.destroyed) return;

        state.onlineLoading = false;
        state.onlineError = (err && err.message) ? err.message : 'เกิดข้อผิดพลาดในการค้นหาออนไลน์';
        onlineSearchBtn.disabled = false;
        renderOnlineList();
      }
    }

    async function handleOnlineAutoAdd(item, resultKey) {
      if (state.loadingResultKeys.has(resultKey)) return;

      var service = getService();
      state.loadingResultKeys.add(resultKey);
      renderOnlineList();

      try {
        var result = await service.onlineAutoAddToSetlist({
          item: item,
          allResults: state.onlineResults,
          setlistId: opts.setlistId,
          currentSongIds: state.currentSongIds,
          adapters: {
            getSongbook: opts.getSongbook,
            loadOnlineSong: opts.loadOnlineSong,
            saveSongToBook: opts.saveSongToBook,
            addSongToSetlist: opts.addSongToSetlist
          }
        });

        if (state.destroyed) return;

        var savedSong = result.song;
        var savedId = savedSong && savedSong.id != null ? String(savedSong.id) : '';
        if (savedId && state.currentSongIds.indexOf(savedId) === -1) {
          state.currentSongIds.push(savedId);
        }
        state.addedResultKeys.add(resultKey);

        var songTitle = (savedSong && savedSong.title) || (item && item.title) || 'เพลง';
        if (result.alreadyInSetlist) {
          notifyToast('เพลง "' + songTitle + '" อยู่ในเซ็ตแล้ว', false);
        } else if (result.alreadyInBook) {
          notifyToast('พบในคลังแล้ว — เพิ่มเข้าเซ็ตเพลง ✔', false);
        } else {
          notifyToast('เพิ่ม "' + songTitle + '" เข้าคลังและเซ็ตเพลงแล้ว ✔', false);
        }

        syncHeader();
        renderBookList();
        notifyChanged({
          action: 'online_add',
          setlistId: opts.setlistId,
          song: savedSong,
          alreadyInBook: result.alreadyInBook,
          alreadyInSetlist: result.alreadyInSetlist,
          currentSongIds: state.currentSongIds.slice()
        });
      } catch (err) {
        if (!state.destroyed) {
          notifyToast((err && err.message) ? err.message : 'ดึงและเพิ่มเพลงไม่สำเร็จ', true);
        }
      } finally {
        state.loadingResultKeys.delete(resultKey);
        if (!state.destroyed) {
          renderOnlineList();
        }
      }
    }

    function isOnlineItemInSetlist(item, resultKey, book, currentSet, service) {
      if (state.addedResultKeys.has(resultKey)) return true;
      var dup = service.findDuplicateInSongbook(book, item);
      if (dup && dup.id != null && currentSet.has(String(dup.id))) {
        return true;
      }
      return false;
    }

    function renderOnlineSkeleton() {
      var wrap = el('div', 'sp-loading-wrap');
      var head = el('div', 'sp-loading-head');
      head.appendChild(el('span', 'sp-spinner'));
      head.appendChild(el('span', 'sp-loading-text', 'กำลังค้นหาคอร์ดเพลงออนไลน์...'));
      wrap.appendChild(head);

      for (var i = 0; i < 4; i++) {
        var skel = el('div', 'sp-skeleton-row');
        var skelInfo = el('div', 'sp-skeleton-info');
        skelInfo.appendChild(el('div', 'sp-skeleton-line sp-skeleton-title'));
        skelInfo.appendChild(el('div', 'sp-skeleton-line sp-skeleton-sub'));
        skel.appendChild(skelInfo);
        skel.appendChild(el('div', 'sp-skeleton-btn'));
        wrap.appendChild(skel);
      }
      onlineListEl.appendChild(wrap);
    }

    function renderOnlineList() {
      clearNode(onlineListEl);

      if (state.onlineLoading) {
        renderOnlineSkeleton();
        return;
      }

      if (state.onlineError) {
        var errBox = el('div', 'sp-empty sp-empty-error');
        errBox.appendChild(el('div', 'sp-empty-icon', '⚠️'));
        errBox.appendChild(el('div', 'sp-empty-text', state.onlineError));
        var retryBtn = el('button', 'sp-btn-secondary sp-empty-action', 'ลองค้นหาอีกครั้ง');
        retryBtn.type = 'button';
        retryBtn.addEventListener('click', function () {
          runOnlineSearch(state.onlineQuery || onlineInput.value);
        });
        errBox.appendChild(retryBtn);
        onlineListEl.appendChild(errBox);
        return;
      }

      if (!state.onlineHasSearched) {
        var intro = el('div', 'sp-empty');
        intro.appendChild(el('div', 'sp-empty-icon', '🌐'));
        intro.appendChild(el('div', 'sp-empty-text', 'ค้นหาเพลงออนไลน์แล้วกดเพิ่มเข้าคลังและเซ็ตได้ในปุ่มเดียว'));
        onlineListEl.appendChild(intro);
        return;
      }

      if (!state.onlineResults.length) {
        var none = el('div', 'sp-empty');
        none.appendChild(el('div', 'sp-empty-icon', '🎵'));
        none.appendChild(el('div', 'sp-empty-text', 'ไม่พบผลลัพธ์ออนไลน์สำหรับ "' + state.onlineQuery + '"'));
        onlineListEl.appendChild(none);
        return;
      }

      var service = getService();
      var book = typeof opts.getSongbook === 'function' ? (opts.getSongbook() || []) : [];
      var currentSet = new Set(state.currentSongIds.map(String));
      var frag = document.createDocumentFragment();

      for (var i = 0; i < state.onlineResults.length; i++) {
        (function (item, idx) {
          var rKey = getResultKey(item, idx);
          var isLoading = state.loadingResultKeys.has(rKey);
          var alreadyAdded = isOnlineItemInSetlist(item, rKey, book, currentSet, service);

          var row = el('div', 'sp-item' + (alreadyAdded ? ' is-in-set' : '') + (isLoading ? ' is-loading' : ''));

          var info = el('div', 'sp-item-info');
          var titleRow = el('div', 'sp-item-title-row');
          titleRow.appendChild(el('span', 'sp-item-title', item.title || 'ไม่มีชื่อเพลง'));
          info.appendChild(titleRow);

          var meta = el('div', 'sp-item-meta');
          if (item.artist) {
            meta.appendChild(el('span', 'sp-item-artist', item.artist));
          }
          if (item.key) {
            meta.appendChild(el('span', 'sp-badge sp-badge-key', item.key));
          }
          var sourceLabel = item.domain || item.source || 'ออนไลน์';
          meta.appendChild(el('span', 'sp-badge sp-badge-source', sourceLabel));
          info.appendChild(meta);

          var actions = el('div', 'sp-item-actions');
          if (alreadyAdded) {
            actions.appendChild(el('span', 'sp-badge-added', '✓ อยู่ในเซ็ตแล้ว'));
          } else if (isLoading) {
            var loadBtn = el('button', 'sp-btn-online-add is-busy');
            loadBtn.type = 'button';
            loadBtn.disabled = true;
            loadBtn.appendChild(el('span', 'sp-spinner sp-spinner-sm'));
            loadBtn.appendChild(el('span', '', 'กำลังดึง...'));
            actions.appendChild(loadBtn);
          } else {
            var addBtn = el('button', 'sp-btn-online-add', '+ ดึงและเพิ่มเข้าเซ็ต');
            addBtn.type = 'button';
            addBtn.addEventListener('click', function () {
              handleOnlineAutoAdd(item, rKey);
            });
            actions.appendChild(addBtn);
          }

          row.appendChild(info);
          row.appendChild(actions);
          frag.appendChild(row);
        })(state.onlineResults[i], i);
      }

      onlineListEl.appendChild(frag);
    }

    // -------------------------------------------------------------------------
    // Event Listeners
    // -------------------------------------------------------------------------
    function onKeyDown(e) {
      if (state.open && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }

    backdrop.addEventListener('click', function () {
      close();
    });

    closeBtn.addEventListener('click', function () {
      close();
    });

    tabBookBtn.addEventListener('click', function () {
      switchTab('book');
    });

    tabOnlineBtn.addEventListener('click', function () {
      switchTab('online');
    });

    bookSearchInput.addEventListener('input', function () {
      state.bookQuery = bookSearchInput.value;
      bookClearBtn.hidden = !state.bookQuery;
      renderBookList();
    });

    bookClearBtn.addEventListener('click', function () {
      state.bookQuery = '';
      bookSearchInput.value = '';
      bookClearBtn.hidden = true;
      renderBookList();
      bookSearchInput.focus();
    });

    onlineForm.addEventListener('submit', function (e) {
      e.preventDefault();
      runOnlineSearch(onlineInput.value);
    });

    document.addEventListener('keydown', onKeyDown);

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    function applyOptions(nextOpts) {
      if (!nextOpts || typeof nextOpts !== 'object') return;
      var prevSetlistId = opts.setlistId;
      Object.assign(opts, nextOpts);

      if (Array.isArray(nextOpts.currentSongIds)) {
        state.currentSongIds = nextOpts.currentSongIds.map(String);
      }
      if (nextOpts.setlistId && nextOpts.setlistId !== prevSetlistId) {
        state.addedResultKeys.clear();
      }
    }

    function open(openOpts) {
      if (state.destroyed) return;
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }

      applyOptions(openOpts);

      if (!root.parentNode && document.body) {
        document.body.appendChild(root);
      }

      state.open = true;
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');

      syncHeader();
      updateFilterPills();
      if (state.activeTab === 'online') {
        renderOnlineList();
      } else {
        renderBookList();
      }

      // Trigger CSS transition on next animation frame
      global.requestAnimationFrame(function () {
        if (!state.destroyed && state.open) {
          root.classList.add('is-open');
        }
      });

      setTimeout(function () {
        if (!state.destroyed && state.open) {
          if (state.activeTab === 'online') {
            onlineInput.focus();
          } else {
            bookSearchInput.focus();
          }
        }
      }, 60);
    }

    function close() {
      if (state.destroyed || !state.open) return;
      state.open = false;
      abortOngoingSearch();
      state.onlineLoading = false;
      onlineSearchBtn.disabled = false;

      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');

      closeTimer = setTimeout(function () {
        closeTimer = null;
        if (!state.open && !state.destroyed) {
          root.hidden = true;
        }
      }, 240);

      if (typeof opts.onClose === 'function') {
        opts.onClose();
      }
    }

    function update(nextOpts) {
      if (state.destroyed) return;
      applyOptions(nextOpts);
      syncHeader();
      if (state.open) {
        renderBookList();
        if (state.onlineResults.length || state.activeTab === 'online') {
          renderOnlineList();
        }
      }
    }

    function isOpen() {
      return state.open;
    }

    function getElement() {
      return root;
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.open = false;
      abortOngoingSearch();
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      document.removeEventListener('keydown', onKeyDown);
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    }

    return {
      open: open,
      close: close,
      update: update,
      isOpen: isOpen,
      getElement: getElement,
      destroy: destroy
    };
  }

  global.MellowSetlistPicker = {
    createPicker: createPicker
  };
})(typeof window !== 'undefined' ? window : globalThis);
