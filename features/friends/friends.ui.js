/* ==============================================================================
 * Mellow Chords — Friends & Band Groups UI Controller
 * Zero-Build Vanilla ES6+ Classic Browser Script (IIFE)
 * Exposes: window.MellowFriendsUI
 * ============================================================================== */
(function (root) {
  'use strict';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initialChar(name) {
    var clean = String(name || '?').trim();
    return clean ? clean.charAt(0).toUpperCase() : '?';
  }

  function createFriendsUI(options) {
    var service = options.service;
    var onToast = typeof options.onToast === 'function' ? options.onToast : function () {};
    var onOpenLiveWithGroup = typeof options.onOpenLiveWithGroup === 'function' ? options.onOpenLiveWithGroup : function () {};
    var onDataChanged = typeof options.onDataChanged === 'function' ? options.onDataChanged : function () {};

    var rootEl = null;
    var activeTab = 'friends'; // 'friends' | 'search' | 'groups'
    var searchQuery = '';
    var state = {
      mode: 'local',
      friendships: [],
      searchResults: [],
      groups: [],
      loading: false
    };

    function getAcceptedFriends() {
      return state.friendships
        .filter(function (f) { return f.status === 'accepted'; })
        .map(function (f) { return f.otherUser; });
    }

    function getPendingIncoming() {
      return state.friendships.filter(function (f) {
        return f.status === 'pending' && f.direction === 'incoming';
      });
    }

    function getPendingOutgoing() {
      return state.friendships.filter(function (f) {
        return f.status === 'pending' && f.direction === 'outgoing';
      });
    }

    async function refresh() {
      state.loading = true;
      render();
      try {
        var results = await Promise.all([
          service.listFriendships(),
          service.listBandGroups(),
          service.searchUsers(searchQuery)
        ]);
        state.mode = results[0].mode || 'local';
        state.friendships = results[0].items || [];
        state.groups = results[1].groups || [];
        state.searchResults = results[2].users || [];
        onDataChanged({
          friends: getAcceptedFriends(),
          groups: state.groups
        });
      } catch (err) {
        onToast('โหลดข้อมูลเพื่อน/วงไม่สำเร็จ: ' + (err.message || err), true);
      } finally {
        state.loading = false;
        render();
      }
    }

    async function runSearch(q) {
      searchQuery = String(q || '');
      try {
        var res = await service.searchUsers(searchQuery);
        state.mode = res.mode || state.mode;
        state.searchResults = res.users || [];
        render();
      } catch (err) {
        onToast('ค้นหาผู้ใช้ไม่สำเร็จ: ' + (err.message || err), true);
      }
    }

    function renderFriendsTab() {
      var incoming = getPendingIncoming();
      var outgoing = getPendingOutgoing();
      var accepted = state.friendships.filter(function (f) { return f.status === 'accepted'; });

      var html = '';

      if (incoming.length) {
        html += '<div class="fr-card"><h3 class="fr-sec-title">📩 คำขอเป็นเพื่อนที่รอตอบรับ (' + incoming.length + ')</h3><div class="fr-list">';
        incoming.forEach(function (f) {
          var u = f.otherUser || {};
          html += '<div class="fr-row" data-friendship-id="' + esc(f.id) + '">' +
            '<div class="fr-user-meta">' +
              '<span class="fr-avatar">' + esc(initialChar(u.username || u.email)) + '</span>' +
              '<div class="fr-user-info">' +
                '<span class="fr-user-name">' + esc(u.username || u.email || 'ผู้ใช้') + '</span>' +
                '<span class="fr-user-sub">' + esc(u.email || '') + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="fr-actions">' +
              '<button type="button" class="small primary" data-fr-act="accept" data-id="' + esc(f.id) + '">✓ ตอบรับ</button>' +
              '<button type="button" class="small danger" data-fr-act="decline" data-id="' + esc(f.id) + '">✕ ปฏิเสธ</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      html += '<div class="fr-card">' +
        '<h3 class="fr-sec-title"><span>👥 เพื่อนของฉัน (' + accepted.length + ')</span>' +
        '<button type="button" class="small primary" data-fr-tab="search">➕ ค้นหาเพื่อนเพิ่ม</button></h3>';
      if (!accepted.length) {
        html += '<div class="fr-empty">ยังไม่มีรายชื่อเพื่อน กด "ค้นหาผู้ใช้" เพื่อเพิ่มเพื่อนนักดนตรีเข้าวงได้เลย</div>';
      } else {
        html += '<div class="fr-list">';
        accepted.forEach(function (f) {
          var u = f.otherUser || {};
          html += '<div class="fr-row" data-friend-uid="' + esc(u.id) + '">' +
            '<div class="fr-user-meta">' +
              '<span class="fr-avatar">' + esc(initialChar(u.username || u.email)) + '</span>' +
              '<div class="fr-user-info">' +
                '<span class="fr-user-name">' + esc(u.username || u.email || 'เพื่อน') + '</span>' +
                '<span class="fr-user-sub">' + esc(u.email || '') + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="fr-actions">' +
              '<button type="button" class="small danger" data-fr-act="remove" data-id="' + esc(f.id) + '">ลบเพื่อน</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      html += '</div>';

      if (outgoing.length) {
        html += '<div class="fr-card"><h3 class="fr-sec-title">⏳ คำขอที่ส่งไป (' + outgoing.length + ')</h3><div class="fr-list">';
        outgoing.forEach(function (f) {
          var u = f.otherUser || {};
          html += '<div class="fr-row">' +
            '<div class="fr-user-meta">' +
              '<span class="fr-avatar">' + esc(initialChar(u.username || u.email)) + '</span>' +
              '<div class="fr-user-info">' +
                '<span class="fr-user-name">' + esc(u.username || u.email || 'ผู้ใช้') + '</span>' +
                '<span class="fr-user-sub">รออีกฝ่ายตอบรับ...</span>' +
              '</div>' +
            '</div>' +
            '<div class="fr-actions">' +
              (state.mode === 'local'
                ? '<button type="button" class="small primary" data-fr-act="accept" data-id="' + esc(f.id) + '">✓ จำลองตอบรับ (Local)</button>'
                : '') +
              '<button type="button" class="small ghost" data-fr-act="remove" data-id="' + esc(f.id) + '">ยกเลิกคำขอ</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      return html;
    }

    function renderSearchTab() {
      var relMap = {};
      state.friendships.forEach(function (f) {
        if (f.otherUser && f.otherUser.id) relMap[f.otherUser.id] = f;
      });

      var html = '<div class="fr-card">' +
        '<h3 class="fr-sec-title">🔍 ค้นหาผู้ใช้เพื่อเพิ่มเพื่อน</h3>' +
        '<form class="fr-search-row" id="frSearchForm">' +
          '<input type="search" id="frSearchInput" class="fr-input" placeholder="พิมพ์ชื่อเล่น หรืออีเมลนักดนตรี..." value="' + esc(searchQuery) + '">' +
          '<button type="submit" class="small primary">🔍 ค้นหา</button>' +
        '</form>';

      if (!state.searchResults.length) {
        html += '<div class="fr-empty">ไม่พบผู้ใช้ที่ตรงกับคำค้นหา</div>';
      } else {
        html += '<div class="fr-list">';
        state.searchResults.forEach(function (u) {
          var rel = relMap[u.id];
          var actionHtml = '<button type="button" class="small primary" data-fr-act="add" data-uid="' + esc(u.id) + '">➕ เพิ่มเพื่อน</button>';
          if (rel) {
            if (rel.status === 'accepted') {
              actionHtml = '<span class="badge green">✓ เพื่อนกันแล้ว</span>';
            } else if (rel.status === 'pending' && rel.direction === 'outgoing') {
              actionHtml = '<span class="badge">⏳ ส่งคำขอแล้ว</span>' +
                (state.mode === 'local'
                  ? ' <button type="button" class="small primary" data-fr-act="accept" data-id="' + esc(rel.id) + '">✓ ตอบรับ (Local)</button>'
                  : '');
            } else if (rel.status === 'pending' && rel.direction === 'incoming') {
              actionHtml = '<button type="button" class="small primary" data-fr-act="accept" data-id="' + esc(rel.id) + '">✓ ตอบรับเพื่อน</button>';
            }
          }
          html += '<div class="fr-row">' +
            '<div class="fr-user-meta">' +
              '<span class="fr-avatar">' + esc(initialChar(u.username || u.email)) + '</span>' +
              '<div class="fr-user-info">' +
                '<span class="fr-user-name">' + esc(u.username || u.email) + '</span>' +
                '<span class="fr-user-sub">' + esc(u.email || '') + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="fr-actions">' + actionHtml + '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderGroupsTab() {
      var acceptedFriends = getAcceptedFriends();
      var html = '<div class="fr-card">' +
        '<h3 class="fr-sec-title">➕ สร้างกรุ๊ปวงดนตรีใหม่</h3>' +
        '<form class="fr-search-row" id="frCreateGroupForm">' +
          '<input type="text" id="frNewGroupName" class="fr-input" placeholder="ชื่อวงดนตรี เช่น The Midnight Band" maxlength="80" required>' +
          '<input type="text" id="frNewGroupDesc" class="fr-input" placeholder="รายละเอียด / แนวเพลง (ไม่บังคับ)" maxlength="120">' +
          '<button type="submit" class="small primary">🎸 สร้างวง</button>' +
        '</form>' +
      '</div>';

      html += '<div class="fr-card"><h3 class="fr-sec-title">🎸 กรุ๊ปวงดนตรีของฉัน (' + state.groups.length + ')</h3>';
      if (!state.groups.length) {
        html += '<div class="fr-empty">ยังไม่มีกรุ๊ปวงดนตรี สร้างกรุ๊ปวงแล้วดึงเพื่อนเข้าวงเพื่อเชิญเข้า Live Room ในคลิกเดียว</div>';
      } else {
        state.groups.forEach(function (g) {
          var memberIds = new Set(g.members.map(function (m) { return m.user_id; }));
          var availableFriends = acceptedFriends.filter(function (f) { return !memberIds.has(f.id); });

          html += '<div class="fr-group-card" data-group-id="' + esc(g.id) + '">' +
            '<div class="fr-group-top">' +
              '<div>' +
                '<h4 class="fr-group-name">🎸 ' + esc(g.name) + ' <span class="badge dim">' + g.members.length + ' คน</span></h4>' +
                (g.description ? '<p class="fr-group-desc">' + esc(g.description) + '</p>' : '') +
              '</div>' +
              '<div class="fr-actions">' +
                '<button type="button" class="small primary" data-fr-act="live-group" data-gid="' + esc(g.id) + '">🎤 เปิด Live Room กับวงนี้</button>' +
                (g.isOwner ? '<button type="button" class="small danger" data-fr-act="delete-group" data-gid="' + esc(g.id) + '">🗑 ลบวง</button>' : '') +
              '</div>' +
            '</div>' +
            '<div class="fr-members-wrap">';

          g.members.forEach(function (m) {
            var isOwner = m.role === 'owner';
            html += '<span class="fr-member-chip' + (isOwner ? ' owner' : '') + '">' +
              (isOwner ? '👑 ' : '🎵 ') + esc(m.username) +
              (g.isOwner && !isOwner
                ? ' <button type="button" class="fr-chip-remove" title="นำออกจากวง" data-fr-act="remove-member" data-gid="' + esc(g.id) + '" data-uid="' + esc(m.user_id) + '">✕</button>'
                : '') +
            '</span>';
          });
          html += '</div>';

          if (g.isOwner) {
            html += '<div class="fr-add-member-bar">';
            if (availableFriends.length) {
              html += '<select class="fr-select" data-group-select="' + esc(g.id) + '">';
              availableFriends.forEach(function (f) {
                html += '<option value="' + esc(f.id) + '">' + esc(f.username || f.email) + '</option>';
              });
              html += '</select>' +
                '<button type="button" class="small primary" data-fr-act="add-member" data-gid="' + esc(g.id) + '">➕ ดึงเพื่อนเข้าวง</button>';
            } else {
              html += '<span class="fr-user-sub">เพิ่มเพื่อนก่อน แล้วดึงเข้ากรุ๊ปวงได้จากที่นี่</span>';
            }
            html += '</div>';
          }

          html += '</div>';
        });
      }
      html += '</div>';
      return html;
    }

    function render() {
      if (!rootEl) return;
      var pendingCount = getPendingIncoming().length;
      var acceptedCount = getAcceptedFriends().length;

      var modeBadge = state.mode === 'cloud'
        ? '<span class="fr-mode-pill">☁️ Supabase Cloud</span>'
        : '<span class="fr-mode-pill local">⚡ Local Demo Mode (ออฟไลน์)</span>';

      var bodyHtml = activeTab === 'search'
        ? renderSearchTab()
        : (activeTab === 'groups' ? renderGroupsTab() : renderFriendsTab());

      rootEl.innerHTML =
        '<div class="fr-shell">' +
          '<div class="fr-header">' +
            '<h2 class="fr-title">👥 เพื่อน &amp; กรุ๊ปวงดนตรี ' + modeBadge + '</h2>' +
            '<button type="button" class="small ghost" id="frRefreshBtn">🔄 รีเฟรช</button>' +
          '</div>' +
          '<div class="fr-tabs" role="tablist">' +
            '<button type="button" class="fr-tab' + (activeTab === 'friends' ? ' active' : '') + '" data-fr-tab="friends">👥 เพื่อน (' + acceptedCount + ')' +
              (pendingCount ? ' <span class="fr-badge">' + pendingCount + '</span>' : '') +
            '</button>' +
            '<button type="button" class="fr-tab' + (activeTab === 'search' ? ' active' : '') + '" data-fr-tab="search">🔍 ค้นหาผู้ใช้</button>' +
            '<button type="button" class="fr-tab' + (activeTab === 'groups' ? ' active' : '') + '" data-fr-tab="groups">🎸 กรุ๊ปวงดนตรี (' + state.groups.length + ')</button>' +
          '</div>' +
          bodyHtml +
        '</div>';

      bindEvents();
    }

    function bindEvents() {
      if (!rootEl) return;

      var refreshBtn = rootEl.querySelector('#frRefreshBtn');
      if (refreshBtn) refreshBtn.onclick = function () { refresh(); };

      rootEl.querySelectorAll('[data-fr-tab]').forEach(function (btn) {
        btn.onclick = function () {
          activeTab = btn.dataset.frTab;
          render();
        };
      });

      var searchForm = rootEl.querySelector('#frSearchForm');
      if (searchForm) {
        searchForm.onsubmit = function (e) {
          e.preventDefault();
          var inp = rootEl.querySelector('#frSearchInput');
          runSearch(inp ? inp.value : '');
        };
      }

      var createGroupForm = rootEl.querySelector('#frCreateGroupForm');
      if (createGroupForm) {
        createGroupForm.onsubmit = async function (e) {
          e.preventDefault();
          var nameEl = rootEl.querySelector('#frNewGroupName');
          var descEl = rootEl.querySelector('#frNewGroupDesc');
          var name = nameEl ? nameEl.value.trim() : '';
          var desc = descEl ? descEl.value.trim() : '';
          if (!name) return;
          try {
            await service.createBandGroup(name, desc);
            onToast('สร้างกรุ๊ปวง "' + name + '" แล้ว 🎸');
            await refresh();
          } catch (err) {
            onToast('สร้างวงไม่สำเร็จ: ' + (err.message || err), true);
          }
        };
      }

      rootEl.querySelectorAll('[data-fr-act]').forEach(function (btn) {
        btn.onclick = async function () {
          var act = btn.dataset.frAct;
          try {
            if (act === 'add') {
              await service.sendFriendRequest(btn.dataset.uid);
              onToast('ส่งคำขอเป็นเพื่อนแล้ว ✔');
              await refresh();
            } else if (act === 'accept') {
              await service.respondFriendRequest(btn.dataset.id, 'accepted');
              onToast('ตอบรับเป็นเพื่อนแล้ว ✔');
              await refresh();
            } else if (act === 'decline') {
              await service.respondFriendRequest(btn.dataset.id, 'declined');
              await service.removeFriendship(btn.dataset.id);
              onToast('ปฏิเสธคำขอแล้ว');
              await refresh();
            } else if (act === 'remove') {
              await service.removeFriendship(btn.dataset.id);
              onToast('ลบออกจากรายชื่อเพื่อนแล้ว');
              await refresh();
            } else if (act === 'add-member') {
              var gid = btn.dataset.gid;
              var sel = rootEl.querySelector('[data-group-select="' + gid + '"]');
              var uid = sel ? sel.value : '';
              if (!uid) return;
              await service.addMemberToBandGroup(gid, uid);
              onToast('เพิ่มเพื่อนเข้ากรุ๊ปวงแล้ว 🎸');
              await refresh();
            } else if (act === 'remove-member') {
              await service.removeMemberFromBandGroup(btn.dataset.gid, btn.dataset.uid);
              onToast('นำสมาชิกออกจากวงแล้ว');
              await refresh();
            } else if (act === 'delete-group') {
              await service.deleteBandGroup(btn.dataset.gid);
              onToast('ลบกรุ๊ปวงดนตรีแล้ว');
              await refresh();
            } else if (act === 'live-group') {
              onOpenLiveWithGroup(btn.dataset.gid);
            }
          } catch (err) {
            onToast('ดำเนินการไม่สำเร็จ: ' + (err.message || err), true);
          }
        };
      });
    }

    function mount(containerEl) {
      rootEl = containerEl;
      render();
    }

    function setTab(tab) {
      activeTab = tab;
      render();
    }

    return {
      mount: mount,
      refresh: refresh,
      setTab: setTab,
      getFriends: getAcceptedFriends,
      getGroups: function () { return state.groups.slice(); }
    };
  }

  root.MellowFriendsUI = {
    createFriendsUI: createFriendsUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
