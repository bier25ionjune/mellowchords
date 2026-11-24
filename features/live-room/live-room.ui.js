/* ==============================================================================
 * Mellow Chords — Real-time Live Room UI Controller
 * Zero-Build Vanilla ES6+ Classic Browser Script (IIFE)
 * Supports Host Setlist Sync, 1-Click Band Group Invite, Presence, Key Sync,
 * and MIDI Footswitch Integration (Host syncs all / Member locked or local)
 * Exposes: window.MellowLiveRoomUI
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

  function normShift(n) {
    var x = Number(n) || 0;
    while (x > 11) x -= 12;
    while (x < -11) x += 12;
    return x;
  }

  function createLiveRoomUI(options) {
    var service = options.service;
    var friendsService = options.friendsService;
    var getSetlists = typeof options.getSetlists === 'function' ? options.getSetlists : function () { return []; };
    var getSongbook = typeof options.getSongbook === 'function' ? options.getSongbook : function () { return []; };
    var transposeText = typeof options.transposeText === 'function' ? options.transposeText : function (t) { return t; };
    var transposeChord = typeof options.transposeChord === 'function' ? options.transposeChord : function (c) { return c; };
    var renderChordHtml = typeof options.renderChordHtml === 'function' ? options.renderChordHtml : null;
    var onToast = typeof options.onToast === 'function' ? options.onToast : function () {};

    var rootEl = null;
    var activeRoom = null;
    var isHost = false;
    var localOverride = false;
    var localSongIndex = 0;
    var localKeyShift = 0;
    var onlineMembers = [];
    var myRooms = [];
    var friends = [];
    var bandGroups = [];
    var preselectedGroupId = null;
    var selectedFriendIds = new Set();

    function getSnapshotSongs() {
      return activeRoom && Array.isArray(activeRoom.setlist_snapshot)
        ? activeRoom.setlist_snapshot
        : [];
    }

    function getDisplayedIndex() {
      var songs = getSnapshotSongs();
      var idx = localOverride ? localSongIndex : (activeRoom ? activeRoom.current_song_index : 0);
      return Math.max(0, Math.min(songs.length - 1, Number(idx) || 0));
    }

    function getDisplayedShift() {
      return normShift(localOverride ? localKeyShift : (activeRoom ? activeRoom.current_key_shift : 0));
    }

    async function refreshLobbyData() {
      try {
        var results = await Promise.all([
          service.listMyRooms(),
          friendsService ? friendsService.listFriendships() : Promise.resolve({ items: [] }),
          friendsService ? friendsService.listBandGroups() : Promise.resolve({ groups: [] })
        ]);
        myRooms = results[0].rooms || [];
        friends = (results[1].items || [])
          .filter(function (f) { return f.status === 'accepted'; })
          .map(function (f) { return f.otherUser; });
        bandGroups = results[2].groups || [];

        if (preselectedGroupId) {
          applyBandGroupSelection(preselectedGroupId, true);
        }
      } catch (err) {
        onToast('โหลดข้อมูล Live Room ไม่สำเร็จ: ' + (err.message || err), true);
      }
      render();
    }

    function applyBandGroupSelection(groupId, silent) {
      preselectedGroupId = groupId || null;
      var group = bandGroups.find(function (g) { return g.id === groupId; });
      if (!group) return;
      var me = service.getMe();
      group.members.forEach(function (m) {
        if (m.user_id && m.user_id !== me.id) {
          selectedFriendIds.add(m.user_id);
        }
      });
      if (!silent) {
        onToast('ดึงสมาชิกทั้งวง "' + group.name + '" (' + group.members.length + ' คน) เข้าคำเชิญแล้ว 🎸');
      }
    }

    function enterRoom(room, opts) {
      var me = service.getMe();
      activeRoom = room;
      var forceRole = opts && opts.forceRole;
      isHost = forceRole ? (forceRole === 'host') : (room.host_id === me.id);
      localOverride = false;
      localSongIndex = Number(room.current_song_index) || 0;
      localKeyShift = normShift(room.current_key_shift || 0);
      onlineMembers = [];

      service.subscribeToRoom(room, {
        role: isHost ? 'host' : 'member',
        displayName: (opts && opts.displayName) || (isHost ? (me.username || 'Host') : (me.username || 'สมาชิก')),
        onPresenceChange: function (members) {
          onlineMembers = members || [];
          renderOnlineBar();
        },
        onStateSync: function (payload) {
          if (!activeRoom || !payload) return;
          var songs = getSnapshotSongs();
          var nextIdx = Math.max(0, Math.min(songs.length - 1, Number(payload.current_song_index) || 0));
          var nextShift = normShift(payload.current_key_shift || 0);
          var songChanged = nextIdx !== activeRoom.current_song_index;
          var keyChanged = nextShift !== activeRoom.current_key_shift;

          activeRoom.current_song_index = nextIdx;
          activeRoom.current_song_id = payload.current_song_id || (songs[nextIdx] && songs[nextIdx].id) || null;
          activeRoom.current_key_shift = nextShift;

          if (!localOverride) {
            localSongIndex = nextIdx;
            localKeyShift = nextShift;
            if (songChanged && songs[nextIdx]) {
              onToast('⚡ ซิงก์เพลงจาก Host: ' + songs[nextIdx].title + (payload.source === 'midi' ? ' (🎹 MIDI)' : ''));
            } else if (keyChanged) {
              onToast('⚡ ซิงก์คีย์จาก Host: ' + (nextShift >= 0 ? '+' + nextShift : nextShift));
            }
          }
          render();
        },
        onRoomClosed: function () {
          onToast('ห้อง Live Room ถูกปิดโดย Host แล้ว');
          leaveRoom();
        }
      });

      render();
    }

    async function leaveRoom() {
      service.unsubscribe();
      activeRoom = null;
      isHost = false;
      localOverride = false;
      onlineMembers = [];
      await refreshLobbyData();
    }

    async function hostSelectSong(index, opts) {
      if (!activeRoom) return;
      var songs = getSnapshotSongs();
      if (index < 0 || index >= songs.length) return;
      var target = songs[index];
      var nextShift = typeof target.shift === 'number' && !isNaN(target.shift) ? normShift(target.shift) : 0;

      if (!isHost) {
        if (!localOverride) {
          onToast('🔒 โหมดซิงก์ตาม Host — เปิด "ดูอิสระเฉพาะเครื่องนี้" หากต้องการเลื่อนเอง');
          return;
        }
        localSongIndex = index;
        localKeyShift = nextShift;
        render();
        return;
      }

      activeRoom.current_song_index = index;
      activeRoom.current_song_id = target.id;
      activeRoom.current_key_shift = nextShift;
      localSongIndex = index;
      localKeyShift = nextShift;
      render();

      await service.broadcastRoomState(activeRoom, {
        current_song_index: index,
        current_song_id: target.id,
        current_key_shift: nextShift,
        source: (opts && opts.source) || 'ui'
      });

      if (opts && opts.source === 'midi') {
        onToast('🎹 MIDI (Host) → ' + target.title + ' (ซิงก์ทั้งห้องแล้ว)');
      }
    }

    async function hostStepSong(delta, opts) {
      if (!activeRoom) return false;
      var songs = getSnapshotSongs();
      if (!songs.length) return false;

      if (!isHost && !localOverride) {
        onToast('🔒 โหมดซิงก์ตาม Host — เฉพาะ Host ที่ใช้ Footswitch เปลี่ยนเพลงทั้งห้องได้');
        return true;
      }

      var curIdx = getDisplayedIndex();
      var nextIdx = curIdx + delta;
      if (nextIdx < 0 || nextIdx >= songs.length) {
        onToast(delta > 0 ? '🎹 ถึงเพลงสุดท้ายของเซ็ตในห้องแล้ว' : '🎹 อยู่ที่เพลงแรกของเซ็ตในห้องแล้ว');
        return true;
      }

      await hostSelectSong(nextIdx, opts);
      return true;
    }

    async function hostChangeKeyShift(newShift) {
      if (!activeRoom) return;
      var clamped = normShift(newShift);

      if (!isHost) {
        if (!localOverride) {
          onToast('🔒 โหมดซิงก์ตาม Host — เปิด "ดูอิสระเฉพาะเครื่องนี้" เพื่อทดคีย์เฉพาะหน้าจอคุณ');
          return;
        }
        localKeyShift = clamped;
        render();
        return;
      }

      var songs = getSnapshotSongs();
      var curIdx = activeRoom.current_song_index || 0;
      activeRoom.current_key_shift = clamped;
      localKeyShift = clamped;
      render();

      await service.broadcastRoomState(activeRoom, {
        current_song_index: curIdx,
        current_song_id: songs[curIdx] ? songs[curIdx].id : null,
        current_key_shift: clamped,
        source: 'key'
      });
    }

    function renderOnlineBar() {
      if (!rootEl) return;
      var bar = rootEl.querySelector('#lrOnlineBar');
      if (!bar) return;
      var chips = onlineMembers.map(function (m) {
        return '<span class="lr-online-chip">' +
          '<span class="lr-dot"></span>' +
          (m.role === 'host' ? '👑 ' : '🎸 ') + esc(m.username || 'สมาชิก') +
        '</span>';
      }).join('');
      bar.innerHTML = '<strong>🟢 ออนไลน์ในห้อง (' + onlineMembers.length + '):</strong> ' +
        (chips || '<span class="fr-user-sub">กำลังเชื่อมต่อ...</span>');
    }

    function buildSetlistOptions() {
      var playlists = getSetlists() || [];
      var songbook = getSongbook() || [];
      var opts = [];
      playlists.forEach(function (pl) {
        var resolved = Array.isArray(pl.songs) ? pl.songs : [];
        if (!resolved.length) return;
        opts.push({
          id: 'pl:' + pl.id,
          label: '🎼 เซ็ต: ' + pl.name + ' (' + resolved.length + ' เพลง)',
          songs: resolved
        });
      });
      if (songbook.length) {
        opts.push({
          id: 'book:all',
          label: '📚 คลังเพลงทั้งหมดของฉัน (' + songbook.length + ' เพลง)',
          songs: songbook
        });
      }
      return opts;
    }

    function renderLobby() {
      var setlistOpts = buildSetlistOptions();

      var html = '<div class="lr-shell">' +
        '<div class="lr-header">' +
          '<h2 class="lr-title">🎤 ห้องซิงก์คอร์ดเรียลไทม์ (Live Room)</h2>' +
          '<button type="button" class="small ghost" id="lrRefreshBtn">🔄 รีเฟรช</button>' +
        '</div>' +
        '<div class="lr-grid-2">' +
          // Card 1: Create Room
          '<div class="lr-card">' +
            '<h3 class="fr-sec-title">🚀 สร้างห้องใหม่ (เป็น Host)</h3>' +
            '<form id="lrCreateForm" style="display:flex;flex-direction:column;gap:10px">' +
              '<div>' +
                '<label class="lr-label" for="lrRoomName">ชื่อห้อง / งานเล่นสด</label>' +
                '<input id="lrRoomName" class="lr-input" type="text" placeholder="เช่น คืนวันศุกร์ รอบ 21:00" value="Live Session คืนนี้" required>' +
              '</div>' +
              '<div>' +
                '<label class="lr-label" for="lrSetlistSelect">เลือก Setlist ที่จะเล่น</label>' +
                '<select id="lrSetlistSelect" class="lr-select">' +
                  (setlistOpts.length
                    ? setlistOpts.map(function (o) {
                        return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>';
                      }).join('')
                    : '<option value="">ยังไม่มีเซ็ตเพลงหรือเพลงในคลัง</option>') +
                '</select>' +
              '</div>' +
              '<div>' +
                '<label class="lr-label">🎸 ดึงเข้ามาทั้งกรุ๊ปวง (1 คลิก)</label>' +
                (bandGroups.length
                  ? '<div class="lr-band-quick-list">' + bandGroups.map(function (g) {
                      var sel = preselectedGroupId === g.id ? ' selected' : '';
                      return '<button type="button" class="lr-band-btn' + sel + '" data-lr-pick-group="' + esc(g.id) + '">🎸 ' + esc(g.name) + ' (' + g.members.length + ' คน)</button>';
                    }).join('') + '</div>'
                  : '<div class="fr-user-sub">ยังไม่มีกรุ๊ปวง — สร้างได้ในหน้า "👥 เพื่อน/วง"</div>') +
              '</div>' +
              '<div>' +
                '<label class="lr-label">👥 หรือเชิญเพื่อนรายคน (' + selectedFriendIds.size + ' คนที่เลือก)</label>' +
                (friends.length
                  ? '<div class="lr-friend-checks">' + friends.map(function (f) {
                      var checked = selectedFriendIds.has(f.id) ? ' checked' : '';
                      return '<label class="lr-check-pill">' +
                        '<input type="checkbox" data-lr-friend-cb="' + esc(f.id) + '"' + checked + '>' +
                        '<span>' + esc(f.username || f.email) + '</span>' +
                      '</label>';
                    }).join('') + '</div>'
                  : '<div class="fr-user-sub">ยังไม่มีรายชื่อเพื่อน (สร้างห้องแล้วแชร์โค้ด 6 หลักให้เพื่อนเข้าได้ทันที)</div>') +
              '</div>' +
              '<button type="submit" id="lrCreateSubmitBtn" class="primary" style="margin-top:4px">🎤 สร้างห้อง &amp; เริ่มเล่นสด</button>' +
            '</form>' +
          '</div>' +

          // Card 2: Join Room + Active Rooms
          '<div class="lr-card">' +
            '<h3 class="fr-sec-title">🔗 เข้าร่วมห้องด้วยโค้ด</h3>' +
            '<form id="lrJoinForm" style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<input id="lrJoinCodeInput" class="lr-input" style="flex:1;min-width:160px;text-transform:uppercase" placeholder="กรอกโค้ดห้อง 6 หลัก เช่น A7K9P2" maxlength="16">' +
              '<button type="submit" id="lrJoinSubmitBtn" class="small primary">เข้าร่วมห้อง</button>' +
            '</form>' +
            '<h3 class="fr-sec-title" style="margin-top:8px">📡 ห้องที่เปิดอยู่ / คำเชิญของคุณ (' + myRooms.length + ')</h3>' +
            (myRooms.length
              ? '<div class="fr-list">' + myRooms.map(function (r) {
                  var count = Array.isArray(r.setlist_snapshot) ? r.setlist_snapshot.length : 0;
                  return '<div class="lr-room-item">' +
                    '<div>' +
                      '<div><strong>' + esc(r.name) + '</strong> <span class="lr-code-badge">' + esc(r.room_code) + '</span></div>' +
                      '<div class="fr-user-sub">' + count + ' เพลงในเซ็ต</div>' +
                    '</div>' +
                    '<div class="fr-actions">' +
                      '<button type="button" class="small primary" data-lr-join-id="' + esc(r.id) + '">▶ เข้าห้อง</button>' +
                      (!service.useCloud()
                        ? '<button type="button" class="small ghost" data-lr-join-member="' + esc(r.id) + '" title="เข้าห้องนี้ในฐานะสมาชิกเพื่อทดสอบซิงก์">🎸 เข้าแบบสมาชิก</button>'
                        : '') +
                    '</div>' +
                  '</div>';
                }).join('') + '</div>'
              : '<div class="lr-empty">ยังไม่มีห้องที่เปิดอยู่ สร้างห้องใหม่ฝั่งซ้ายได้เลย</div>') +
          '</div>' +
        '</div>' +
      '</div>';

      rootEl.innerHTML = html;
      bindLobbyEvents(setlistOpts);
    }

    function bindLobbyEvents(setlistOpts) {
      var refreshBtn = rootEl.querySelector('#lrRefreshBtn');
      if (refreshBtn) refreshBtn.onclick = function () { refreshLobbyData(); };

      rootEl.querySelectorAll('[data-lr-pick-group]').forEach(function (btn) {
        btn.onclick = function () {
          applyBandGroupSelection(btn.dataset.lrPickGroup, false);
          render();
        };
      });

      rootEl.querySelectorAll('[data-lr-friend-cb]').forEach(function (cb) {
        cb.onchange = function () {
          var uid = cb.dataset.lrFriendCb;
          if (cb.checked) selectedFriendIds.add(uid);
          else selectedFriendIds.delete(uid);
          render();
        };
      });

      var createForm = rootEl.querySelector('#lrCreateForm');
      if (createForm) {
        createForm.onsubmit = async function (e) {
          e.preventDefault();
          var nameEl = rootEl.querySelector('#lrRoomName');
          var selEl = rootEl.querySelector('#lrSetlistSelect');
          var chosenId = selEl ? selEl.value : '';
          var chosen = setlistOpts.find(function (o) { return o.id === chosenId; });
          if (!chosen || !chosen.songs || !chosen.songs.length) {
            onToast('กรุณาเพิ่มเพลงลงคลังหรือเซ็ตลิสต์ก่อนสร้างห้อง', true);
            return;
          }
          try {
            var res = await service.createRoom({
              name: nameEl ? nameEl.value.trim() : 'Live Session',
              setlistId: chosenId,
              bandGroupId: preselectedGroupId,
              songs: chosen.songs,
              invitedUserIds: Array.from(selectedFriendIds)
            });
            onToast('สร้างห้อง "' + res.room.name + '" สำเร็จ! โค้ด: ' + res.room.room_code);
            enterRoom(res.room, { forceRole: 'host' });
          } catch (err) {
            onToast('สร้างห้องไม่สำเร็จ: ' + (err.message || err), true);
          }
        };
      }

      var joinForm = rootEl.querySelector('#lrJoinForm');
      if (joinForm) {
        joinForm.onsubmit = async function (e) {
          e.preventDefault();
          var inp = rootEl.querySelector('#lrJoinCodeInput');
          var code = inp ? inp.value.trim() : '';
          if (!code) return;
          try {
            var res = await service.joinRoomByCode(code);
            onToast('เข้าห้อง "' + res.room.name + '" แล้ว 🎸');
            enterRoom(res.room, { forceRole: res.room.host_id === service.getMe().id && service.useCloud() ? 'host' : 'member' });
          } catch (err) {
            onToast(err.message || 'ไม่พบห้องนี้', true);
          }
        };
      }

      rootEl.querySelectorAll('[data-lr-join-id]').forEach(function (btn) {
        btn.onclick = function () {
          var room = myRooms.find(function (r) { return r.id === btn.dataset.lrJoinId; });
          if (room) enterRoom(room);
        };
      });

      rootEl.querySelectorAll('[data-lr-join-member]').forEach(function (btn) {
        btn.onclick = function () {
          var room = myRooms.find(function (r) { return r.id === btn.dataset.lrJoinMember; });
          if (room) enterRoom(room, { forceRole: 'member', displayName: 'สมาชิกวง (Tab)' });
        };
      });
    }

    function renderActiveRoom() {
      var songs = getSnapshotSongs();
      var curIdx = getDisplayedIndex();
      var curShift = getDisplayedShift();
      var curSong = songs[curIdx] || null;
      var origKey = curSong && curSong.key ? curSong.key : 'C';
      var playKey = curSong ? transposeChord(origKey, curShift) : '-';

      var sheetHtml = '';
      if (curSong) {
        var textSource = (curSong.parsedChordSheet && curSong.parsedChordSheet.monospaceText)
          ? curSong.parsedChordSheet.monospaceText
          : (curSong.text || '');

        if (textSource) {
          sheetHtml = '<div class="lr-chord-sheet" id="lrChordSheet">' +
            (renderChordHtml ? renderChordHtml(textSource, curShift) : esc(transposeText(textSource, curShift))) +
          '</div>';
        } else if (curSong.images && curSong.images.length) {
          sheetHtml = '<div style="text-align:center">' +
            curSong.images.map(function (imgUrl) {
              return typeof imgUrl === 'string' && /^(https?:|data:|blob:)/i.test(imgUrl)
                ? '<img class="lr-chord-img" src="' + esc(imgUrl) + '" referrerpolicy="no-referrer" alt="' + esc(curSong.title) + '">'
                : '';
            }).join('') +
          '</div>';
        } else {
          sheetHtml = '<div class="lr-empty">เพลงนี้ยังไม่มีเนื้อคอร์ดหรือรูปภาพ</div>';
        }
      }

      var roleBadge = isHost
        ? '<span class="lr-role-badge host">👑 Host (ควบคุมทั้งห้อง)</span>'
        : '<span class="lr-role-badge member">🎸 สมาชิก' + (localOverride ? ' (ดูอิสระ)' : ' (ซิงก์ตาม Host)') + '</span>';

      var canControl = isHost || localOverride;

      var html = '<div class="lr-shell">' +
        '<div class="lr-stage-top">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<h2 class="lr-title" style="font-size:1.12rem">🎤 ' + esc(activeRoom.name) + '</h2>' +
            '<span class="lr-code-badge" id="lrRoomCodeBadge">' + esc(activeRoom.room_code) + '</span>' +
            roleBadge +
          '</div>' +
          '<div class="fr-actions">' +
            '<button type="button" class="small ghost" id="lrCopyCodeBtn">📋 คัดลอกโค้ด</button>' +
            (isHost
              ? '<button type="button" class="small danger" id="lrCloseRoomBtn">⏹ ปิดห้อง</button>'
              : '<button type="button" class="small ghost" id="lrLeaveRoomBtn">← ออกจากห้อง</button>') +
          '</div>' +
        '</div>' +

        '<div class="lr-online-bar" id="lrOnlineBar"></div>' +

        '<div class="lr-midi-bar">' +
          '<span>🎹 <strong>MIDI Footswitch:</strong> ' +
            (isHost
              ? 'เหยียบเปลี่ยนเพลงเพื่อซิงก์สมาชิกทุกคนในห้องอัตโนมัติ'
              : (localOverride
                ? 'โหมดดูอิสระเฉพาะเครื่องนี้ (ไม่กระทบห้อง)'
                : 'ล็อกตาม Host อัตโนมัติ (เฉพาะ Host เปลี่ยนเพลงทั้งห้อง)')) +
          '</span>' +
          (!isHost
            ? '<div class="fr-actions">' +
                '<button type="button" class="small ghost" id="lrToggleOverrideBtn">' +
                  (localOverride ? '🔗 กลับไปซิงก์ตาม Host' : '🔓 ดูอิสระเฉพาะเครื่องนี้') +
                '</button>' +
              '</div>'
            : '') +
        '</div>' +

        '<div class="lr-stage-body">' +
          // Left: Setlist Queue
          '<aside class="lr-setlist-panel">' +
            '<div class="fr-sec-title">🎼 รายการเพลงในห้อง (' + songs.length + ')</div>' +
            songs.map(function (s, idx) {
              var activeCls = idx === curIdx ? ' active' : '';
              return '<button type="button" class="lr-song-btn' + activeCls + '" data-lr-song-idx="' + idx + '"' + (!canControl ? ' disabled' : '') + '>' +
                '<span>' + (idx + 1) + '. ' + esc(s.title) + '</span>' +
                '<small class="badge dim">' + esc(s.key || '-') + '</small>' +
              '</button>';
            }).join('') +
          '</aside>' +

          // Right: Live Chord Stage
          '<section class="lr-chord-stage">' +
            '<div class="lr-controls-bar">' +
              '<div>' +
                '<h3 id="lrCurrentSongTitle" style="margin:0;font-size:1.2rem">' + esc(curSong ? curSong.title : 'ไม่มีเพลง') + '</h3>' +
                '<div class="fr-user-sub" id="lrCurrentSongArtist">' + esc(curSong ? (curSong.artist || '') : '') + '</div>' +
              '</div>' +
              '<div class="fr-actions">' +
                '<button type="button" class="small" id="lrPrevSongBtn"' + (!canControl || curIdx <= 0 ? ' disabled' : '') + '>⏮ ก่อนหน้า</button>' +
                '<span class="badge dim" id="lrSongCounter">' + (curIdx + 1) + ' / ' + songs.length + '</span>' +
                '<button type="button" class="small primary" id="lrNextSongBtn"' + (!canControl || curIdx >= songs.length - 1 ? ' disabled' : '') + '>ถัดไป ⏭</button>' +
              '</div>' +
            '</div>' +

            '<div class="lr-key-controls">' +
              '<span class="keyPill">คีย์เดิม <b>' + esc(origKey) + '</b></span>' +
              '<span class="keyPill">คีย์ที่เล่น <b id="lrPlayKeyVal">' + esc(playKey) + '</b> <small id="lrShiftVal">(' + (curShift >= 0 ? '+' + curShift : curShift) + ')</small></span>' +
              '<button type="button" class="small" id="lrKeyDownBtn"' + (!canControl ? ' disabled' : '') + '>− ลดคีย์</button>' +
              '<button type="button" class="small ghost" id="lrKeyResetBtn"' + (!canControl ? ' disabled' : '') + '>รีเซ็ต</button>' +
              '<button type="button" class="small primary" id="lrKeyUpBtn"' + (!canControl ? ' disabled' : '') + '>+ เพิ่มคีย์</button>' +
            '</div>' +

            sheetHtml +
          '</section>' +
        '</div>' +
      '</div>';

      rootEl.innerHTML = html;
      renderOnlineBar();
      bindActiveRoomEvents(curIdx, curShift);
    }

    function bindActiveRoomEvents(curIdx, curShift) {
      var copyBtn = rootEl.querySelector('#lrCopyCodeBtn');
      if (copyBtn) {
        copyBtn.onclick = function () {
          var code = activeRoom ? activeRoom.room_code : '';
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).catch(function () {});
          }
          onToast('คัดลอกโค้ดห้อง ' + code + ' แล้ว 📋');
        };
      }

      var closeBtn = rootEl.querySelector('#lrCloseRoomBtn');
      if (closeBtn) {
        closeBtn.onclick = async function () {
          await service.closeRoom(activeRoom);
          onToast('ปิดห้อง Live Room แล้ว');
          await leaveRoom();
        };
      }

      var leaveBtn = rootEl.querySelector('#lrLeaveRoomBtn');
      if (leaveBtn) {
        leaveBtn.onclick = function () { leaveRoom(); };
      }

      var overrideBtn = rootEl.querySelector('#lrToggleOverrideBtn');
      if (overrideBtn) {
        overrideBtn.onclick = function () {
          localOverride = !localOverride;
          if (!localOverride && activeRoom) {
            localSongIndex = activeRoom.current_song_index || 0;
            localKeyShift = normShift(activeRoom.current_key_shift || 0);
            onToast('🔗 กลับไปซิงก์ตาม Host แล้ว');
          } else {
            onToast('🔓 เปิดโหมดดูอิสระเฉพาะหน้าจอคุณแล้ว');
          }
          render();
        };
      }

      rootEl.querySelectorAll('[data-lr-song-idx]').forEach(function (btn) {
        btn.onclick = function () {
          hostSelectSong(Number(btn.dataset.lrSongIdx), { source: 'ui' });
        };
      });

      var prevBtn = rootEl.querySelector('#lrPrevSongBtn');
      if (prevBtn) prevBtn.onclick = function () { hostStepSong(-1, { source: 'ui' }); };

      var nextBtn = rootEl.querySelector('#lrNextSongBtn');
      if (nextBtn) nextBtn.onclick = function () { hostStepSong(1, { source: 'ui' }); };

      var keyDownBtn = rootEl.querySelector('#lrKeyDownBtn');
      if (keyDownBtn) keyDownBtn.onclick = function () { hostChangeKeyShift(curShift - 1); };

      var keyUpBtn = rootEl.querySelector('#lrKeyUpBtn');
      if (keyUpBtn) keyUpBtn.onclick = function () { hostChangeKeyShift(curShift + 1); };

      var keyResetBtn = rootEl.querySelector('#lrKeyResetBtn');
      if (keyResetBtn) keyResetBtn.onclick = function () { hostChangeKeyShift(0); };
    }

    function render() {
      if (!rootEl) return;
      if (activeRoom) {
        renderActiveRoom();
      } else {
        renderLobby();
      }
    }

    function mount(containerEl) {
      rootEl = containerEl;
      render();
    }

    async function openWithBandGroup(groupId) {
      preselectedGroupId = groupId || null;
      await refreshLobbyData();
    }

    async function joinByCodeAndEnter(code, opts) {
      var res = await service.joinRoomByCode(code);
      enterRoom(res.room, opts || {});
      return res.room;
    }

    return {
      mount: mount,
      refresh: refreshLobbyData,
      openWithBandGroup: openWithBandGroup,
      joinByCodeAndEnter: joinByCodeAndEnter,
      handleMidiStep: function (direction) {
        if (!activeRoom) return false;
        return hostStepSong(direction, { source: 'midi' });
      },
      isInActiveRoom: function () { return !!activeRoom; },
      isHost: function () { return isHost; },
      getActiveRoom: function () { return activeRoom; }
    };
  }

  root.MellowLiveRoomUI = {
    createLiveRoomUI: createLiveRoomUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
