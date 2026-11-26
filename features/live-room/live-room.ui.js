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
    var x = Math.trunc(Number(n) || 0);
    if (x > 12) return 12;
    if (x < -12) return -12;
    return x;
  }

  function createLiveRoomUI(options) {
    var service = options.service;
    var friendsService = options.friendsService;
    var getSetlists = typeof options.getSetlists === 'function' ? options.getSetlists : function () { return []; };
    var getSongbook = typeof options.getSongbook === 'function' ? options.getSongbook : function () { return []; };
    var resolveImageUrl = typeof options.resolveImageUrl === 'function' ? options.resolveImageUrl : null;
    var onRefetchSongImage = typeof options.onRefetchSongImage === 'function' ? options.onRefetchSongImage : null;
    var transposeText = typeof options.transposeText === 'function' ? options.transposeText : function (t) { return t; };
    var transposeChord = typeof options.transposeChord === 'function' ? options.transposeChord : function (c) { return c; };
    var renderChordHtml = typeof options.renderChordHtml === 'function' ? options.renderChordHtml : null;
    var onChordClick = typeof options.onChordClick === 'function' ? options.onChordClick : null;
    var onAddSongRequest = typeof options.onAddSongRequest === 'function' ? options.onAddSongRequest : null;
    var onOpenLightbox = typeof options.onOpenLightbox === 'function' ? options.onOpenLightbox : null;
    var onToast = typeof options.onToast === 'function' ? options.onToast : function () {};

    var rootEl = null;
    var activeRoom = null;
    var isHost = false;
    var localOverride = false;
    var localSongIndex = 0;
    var localKeyShift = 0;
    var accidentalMode = 'auto'; // 'auto' | 'sharp' | 'flat'
    var displayMode = 'image'; // 'image' (Image-first default) | 'text'
    var stageWide = false;     // iPad stage toggle: hide sidebar for full-screen chord sheet
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
      var savedMode = '';
      try { savedMode = localStorage.getItem('mellowchords.liveroom.mode.' + room.id) || ''; } catch (_) {}
      displayMode = (room.display_mode === 'text' || room.display_mode === 'image')
        ? room.display_mode
        : ((savedMode === 'text' || savedMode === 'image') ? savedMode : 'image');
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
          var nextMode = (payload.display_mode === 'text' || payload.display_mode === 'image') ? payload.display_mode : null;
          var songChanged = nextIdx !== activeRoom.current_song_index;
          var keyChanged = nextShift !== activeRoom.current_key_shift;
          var modeChanged = nextMode && nextMode !== activeRoom.display_mode;

          activeRoom.current_song_index = nextIdx;
          activeRoom.current_song_id = payload.current_song_id || (songs[nextIdx] && songs[nextIdx].id) || null;
          activeRoom.current_key_shift = nextShift;
          if (nextMode) activeRoom.display_mode = nextMode;

          if (!localOverride) {
            localSongIndex = nextIdx;
            localKeyShift = nextShift;
            if (nextMode) displayMode = nextMode;
            if (songChanged && songs[nextIdx]) {
              onToast('⚡ ซิงก์เพลงจาก Host: ' + songs[nextIdx].title + (payload.source === 'midi' ? ' (🎹 MIDI)' : ''));
            } else if (modeChanged) {
              onToast('⚡ Host เปลี่ยนโหมดแสดงผลเป็น: ' + (nextMode === 'image' ? '🖼️ รูปภาพทั้งหมด' : '📝 รูปแบบ Text'));
            } else if (keyChanged) {
              onToast('⚡ ซิงก์คีย์จาก Host: ' + (nextShift >= 0 ? '+' + nextShift : nextShift));
            }
          }
          render();
        },
        onSetlistSync: function (updatedSnapshot) {
          if (!activeRoom || !Array.isArray(updatedSnapshot)) return;
          var prevLen = getSnapshotSongs().length;
          activeRoom.setlist_snapshot = updatedSnapshot;
          if (updatedSnapshot.length > prevLen) {
            var added = updatedSnapshot[updatedSnapshot.length - 1];
            onToast('⚡ Host เพิ่มเพลงเข้าเซ็ต: ' + (added ? added.title : 'เพลงใหม่'));
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

    async function hostAddSongToRoom(song) {
      if (!activeRoom || !isHost || !song) return;
      var currentSongs = getSnapshotSongs().slice();
      if (currentSongs.some(function (s) { return s.id === song.id; })) {
        onToast('เพลง "' + song.title + '" อยู่ในเซ็ตของห้องนี้แล้ว');
        return;
      }
      currentSongs.push(song);
      var syncedSnapshot = await service.broadcastRoomSetlist(activeRoom, currentSongs);
      activeRoom.setlist_snapshot = syncedSnapshot && syncedSnapshot.length ? syncedSnapshot : currentSongs;
      onToast('➕ เพิ่ม "' + song.title + '" เข้าเซ็ตห้องและซิงก์ทั้งวงแล้ว ✔');
      render();
    }

    async function leaveRoom() {
      service.unsubscribe();
      activeRoom = null;
      isHost = false;
      localOverride = false;
      stageWide = false;
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
                '<label class="lr-label" for="lrDisplayModeSelect">รูปแบบการแสดงคอร์ดในห้อง (Host กำหนดได้)</label>' +
                '<select id="lrDisplayModeSelect" class="lr-select">' +
                  '<option value="image" selected>🖼️ ดึงภาพมาแสดงทั้งหมด (แนะนำ — คมชัด 100%)</option>' +
                  '<option value="text">📝 แสดงรูปแบบ Text (ใช้ข้อความคอร์ดที่มีอยู่)</option>' +
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
          var modeEl = rootEl.querySelector('#lrDisplayModeSelect');
          var chosenId = selEl ? selEl.value : '';
          var chosenMode = (modeEl && modeEl.value === 'text') ? 'text' : 'image';
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
              displayMode: chosenMode,
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
      var Viewer = root.MellowChordTextViewer || null;

      var origKey = (curSong && (curSong.original_key || (curSong.parsedChordSheet && (curSong.parsedChordSheet.original_key || curSong.parsedChordSheet.originalKey)) || curSong.key)) || 'C';
      var playKey = curSong
        ? (Viewer ? Viewer.getTransposedKey(origKey, curShift, accidentalMode) : transposeChord(origKey, curShift))
        : '-';

      var chordProSource = '';
      var validImgs = [];
      if (curSong) {
        chordProSource =
          curSong.chordpro_content ||
          (curSong.parsedChordSheet && (curSong.parsedChordSheet.chordpro_content || curSong.parsedChordSheet.chordPro)) ||
          (curSong.parsedChordSheet && curSong.parsedChordSheet.monospaceText) ||
          curSong.text ||
          '';
        var rawImgs = [];
        function collectImgsFrom(srcObj) {
          if (!srcObj) return;
          if (Array.isArray(srcObj.images)) {
            srcObj.images.forEach(function (u) {
              if (typeof u === 'string' && u.trim()) rawImgs.push(u.trim());
            });
          }
          if (!rawImgs.length && Array.isArray(srcObj.imgUrls)) {
            srcObj.imgUrls.forEach(function (u) {
              if (typeof u === 'string' && u.trim()) rawImgs.push(u.trim());
            });
          }
          if (!rawImgs.length && srcObj.imageUrl && typeof srcObj.imageUrl === 'string') {
            rawImgs.push(srcObj.imageUrl.trim());
          }
          if (!rawImgs.length && srcObj._ctSongId) {
            rawImgs.push('https://chordtabs.in.th/img/nm/' + String(srcObj._ctSongId) + '.png');
          }
          if (!rawImgs.length) {
            var srcJoined = [srcObj.src, srcObj.url, srcObj.sourceUrl].filter(Boolean).join(' ');
            var ctUrlMatch = srcJoined.match(/chordtabs\.in\.th\/(\d+)/i) || srcJoined.match(/[?&]song_id=(\d+)/i);
            if (ctUrlMatch) {
              rawImgs.push('https://chordtabs.in.th/img/nm/' + ctUrlMatch[1] + '.png');
            }
          }
        }
        collectImgsFrom(curSong);
        if (!rawImgs.length) {
          var book = getSongbook() || [];
          var localMatch = book.find(function (b) {
            return b && ((curSong.id && b.id === curSong.id) || (curSong.title && b.title === curSong.title));
          });
          if (localMatch) collectImgsFrom(localMatch);
        }

        var seenImg = new Set();
        validImgs = rawImgs
          .map(function (u) {
            var m = u.match(/^ct-img-(\d+)$/i);
            return m ? ('https://chordtabs.in.th/img/nm/' + m[1] + '.png') : u;
          })
          .filter(function (u) {
            if (!u || seenImg.has(u)) return false;
            seenImg.add(u);
            return true;
          });
      }

      var hasImages = validImgs.length > 0;
      var hasText = !!(chordProSource && chordProSource.trim());
      var showImageNow = displayMode === 'image';

      var sheetHtml = '';
      if (curSong) {
        if (showImageNow) {
          if (hasImages) {
            sheetHtml = '<div class="lr-chord-gallery" id="lrChordGallery">' +
              validImgs.map(function (imgEntry, i) {
                var isDirect = /^(https?:|data:|blob:)/i.test(imgEntry);
                if (isDirect) {
                  return '<img class="lr-chord-img" data-lr-img-idx="' + i + '" src="' + esc(imgEntry) + '" referrerpolicy="no-referrer" alt="' + esc(curSong.title) + '" title="แตะเพื่อขยายดูเต็มจอ">';
                }
                return '<img class="lr-chord-img" data-lr-img-idx="' + i + '" data-lr-img-key="' + esc(imgEntry) + '" alt="' + esc(curSong.title) + ' (กำลังโหลดรูปภาพ...)" title="แตะเพื่อขยายดูเต็มจอ">';
              }).join('') +
            '</div>';
          } else {
            sheetHtml = '<div class="lr-empty">' +
              '<div style="margin-bottom:10px">เพลงนี้ยังไม่มีรูปภาพในคลัง</div>' +
              '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
                (onRefetchSongImage ? '<button type="button" class="small primary" id="lrRefetchImgBtn">🔍 ค้นหาและดึงภาพใหม่</button>' : '') +
                (hasText ? '<button type="button" class="small ghost" id="lrFallbackTextBtn">📝 เปิดดูแบบ Text ชั่วคราว</button>' : '') +
              '</div>' +
            '</div>';
          }
        } else if (hasText) {
          var renderedBody = Viewer
            ? Viewer.renderChordProToHtml(chordProSource, {
                semitones: curShift,
                originalKey: origKey,
                accidentalMode: accidentalMode,
                card: false
              })
            : (renderChordHtml ? renderChordHtml(chordProSource, curShift) : esc(transposeText(chordProSource, curShift)));
          sheetHtml = '<div class="lr-chord-sheet" id="lrChordSheet">' + renderedBody + '</div>';
        } else if (hasImages) {
          sheetHtml = '<div class="lr-empty">' +
            '<div style="margin-bottom:10px">เพลงนี้มีเฉพาะรูปภาพ (ยังไม่มีคอร์ดแบบ Text)</div>' +
            '<button type="button" class="small primary" id="lrFallbackImgBtn">🖼️ เปิดดูรูปภาพทั้งหมด (' + validImgs.length + ' หน้า)</button>' +
          '</div>';
        } else {
          sheetHtml = '<div class="lr-empty">เพลงนี้ยังไม่มีรูปภาพหรือเนื้อคอร์ด</div>';
        }
      }

      var roleBadge = isHost
        ? '<span class="lr-role-badge host">👑 Host (ควบคุมทั้งห้อง)</span>'
        : '<span class="lr-role-badge member">🎸 สมาชิก' + (localOverride ? ' (ดูอิสระ)' : ' (ซิงก์ตาม Host)') + '</span>';

      var canControl = isHost || localOverride;

      var canSwitchMode = isHost || localOverride || (hasImages && hasText);
      var modeSwitchHtml = canSwitchMode
        ? '<div class="lr-mode-switch" role="tablist" aria-label="สลับโหมดแสดงคอร์ด">' +
            '<button type="button" class="small' + (displayMode === 'image' ? ' primary' : ' ghost') + '" id="lrModeImageBtn" title="' + (isHost ? 'ซิงก์ให้ทั้งห้องแสดงรูปภาพทั้งหมด' : 'แสดงรูปภาพทั้งหมด') + '">🖼️ รูปภาพทั้งหมด</button>' +
            '<button type="button" class="small' + (displayMode === 'text' ? ' primary' : ' ghost') + '" id="lrModeTextBtn" title="' + (isHost ? 'ซิงก์ให้ทั้งห้องแสดงรูปแบบ Text' : 'แสดงรูปแบบ Text') + '">📝 รูปแบบ Text</button>' +
          '</div>'
        : '';

      var html = '<div class="lr-shell">' +
        '<div class="lr-stage-top">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<h2 class="lr-title" style="font-size:1.12rem">🎤 ' + esc(activeRoom.name) + '</h2>' +
            '<span class="lr-code-badge" id="lrRoomCodeBadge">' + esc(activeRoom.room_code) + '</span>' +
            roleBadge +
          '</div>' +
          '<div class="fr-actions">' +
            '<button type="button" class="small ghost" id="lrToggleSidebarBtn" title="ซ่อน/แสดงแถบเซ็ตเพลงสำหรับหน้าจอ iPad">' +
              (stageWide ? '📋 แสดงเซ็ต' : '🖥️ ขยายเต็มจอ') +
            '</button>' +
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

        '<div class="lr-stage-body' + (stageWide ? ' wide-stage' : '') + '">' +
          // Left: Setlist Queue
          '<aside class="lr-setlist-panel">' +
            '<div class="lr-setlist-head">' +
              '<span class="fr-sec-title">🎼 เซ็ตเพลง (' + songs.length + ')</span>' +
              (isHost && onAddSongRequest
                ? '<button type="button" class="small primary" id="lrAddSongBtn">➕ เพิ่มเพลง</button>'
                : '') +
            '</div>' +
            '<div class="lr-setlist-list">' +
              songs.map(function (s, idx) {
                var activeCls = idx === curIdx ? ' active' : '';
                return '<button type="button" class="lr-song-btn' + activeCls + '" data-lr-song-idx="' + idx + '"' + (!canControl ? ' disabled' : '') + '>' +
                  '<span class="lr-song-label">' + (idx + 1) + '. ' + esc(s.title) + '</span>' +
                  '<small class="badge dim">' + esc(s.key || '-') + '</small>' +
                '</button>';
              }).join('') +
            '</div>' +
          '</aside>' +

          // Right: Live Chord Stage
          '<section class="lr-chord-stage">' +
            '<div class="lr-controls-bar">' +
              '<div>' +
                '<h3 id="lrCurrentSongTitle" style="margin:0;font-size:1.25rem">' + esc(curSong ? curSong.title : 'ไม่มีเพลง') + '</h3>' +
                '<div class="fr-user-sub" id="lrCurrentSongArtist">' + esc(curSong ? (curSong.artist || '') : '') + '</div>' +
              '</div>' +
              '<div class="lr-nav-controls">' +
                (isHost && onAddSongRequest
                  ? '<button type="button" class="small secondary lr-touch-btn" id="lrQuickSearchBtn">🔍 ค้นหาเพลงต่อไป</button>'
                  : '') +
                '<button type="button" class="small lr-touch-btn" id="lrPrevSongBtn"' + (!canControl || curIdx <= 0 ? ' disabled' : '') + '>⏮ ก่อนหน้า</button>' +
                '<span class="badge dim" id="lrSongCounter">' + (curIdx + 1) + ' / ' + songs.length + '</span>' +
                '<button type="button" class="small primary lr-touch-btn" id="lrNextSongBtn"' + (!canControl || curIdx >= songs.length - 1 ? ' disabled' : '') + '>ถัดไป ⏭</button>' +
              '</div>' +
            '</div>' +

            '<div class="lr-key-controls">' +
              '<span class="keyPill">คีย์เดิม <b>' + esc(origKey) + '</b></span>' +
              '<span class="keyPill">คีย์ที่เล่น <b id="lrPlayKeyVal">' + esc(playKey) + '</b> <small id="lrShiftVal">(' + (curShift >= 0 ? '+' + curShift : curShift) + ')</small></span>' +
              '<button type="button" class="small lr-touch-btn" id="lrKeyDownBtn"' + (!canControl || curShift <= -12 ? ' disabled' : '') + '>− ลดคีย์</button>' +
              '<button type="button" class="small ghost lr-touch-btn" id="lrKeyResetBtn"' + (!canControl ? ' disabled' : '') + '>รีเซ็ต</button>' +
              '<button type="button" class="small primary lr-touch-btn" id="lrKeyUpBtn"' + (!canControl || curShift >= 12 ? ' disabled' : '') + '>+ เพิ่มคีย์</button>' +
              '<span class="ctv-btn-group" aria-label="เครื่องหมาย # / b">' +
                '<button type="button" class="ctv-btn' + (accidentalMode === 'auto' ? ' is-active' : '') + '" data-lr-acc="auto">Auto</button>' +
                '<button type="button" class="ctv-btn' + (accidentalMode === 'sharp' ? ' is-active' : '') + '" data-lr-acc="sharp">♯</button>' +
                '<button type="button" class="ctv-btn' + (accidentalMode === 'flat' ? ' is-active' : '') + '" data-lr-acc="flat">♭</button>' +
              '</span>' +
              modeSwitchHtml +
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
      var toggleSidebarBtn = rootEl.querySelector('#lrToggleSidebarBtn');
      if (toggleSidebarBtn) {
        toggleSidebarBtn.onclick = function () {
          stageWide = !stageWide;
          render();
        };
      }

      async function setRoomDisplayMode(nextMode) {
        displayMode = nextMode === 'text' ? 'text' : 'image';
        render();
        if (isHost && activeRoom) {
          var songs = getSnapshotSongs();
          var idx = activeRoom.current_song_index || 0;
          await service.broadcastRoomState(activeRoom, {
            current_song_index: idx,
            current_song_id: songs[idx] ? songs[idx].id : null,
            current_key_shift: activeRoom.current_key_shift || 0,
            display_mode: displayMode,
            source: 'display_mode'
          });
          onToast('⚡ ซิงก์โหมดแสดงผลทั้งห้องเป็น: ' + (displayMode === 'image' ? '🖼️ รูปภาพทั้งหมด' : '📝 รูปแบบ Text'));
        }
      }

      var modeImageBtn = rootEl.querySelector('#lrModeImageBtn');
      if (modeImageBtn) {
        modeImageBtn.onclick = function () {
          setRoomDisplayMode('image');
        };
      }

      var modeTextBtn = rootEl.querySelector('#lrModeTextBtn');
      if (modeTextBtn) {
        modeTextBtn.onclick = function () {
          setRoomDisplayMode('text');
        };
      }

      var fallbackImgBtn = rootEl.querySelector('#lrFallbackImgBtn');
      if (fallbackImgBtn) {
        fallbackImgBtn.onclick = function () {
          setRoomDisplayMode('image');
        };
      }

      var fallbackTextBtn = rootEl.querySelector('#lrFallbackTextBtn');
      if (fallbackTextBtn) {
        fallbackTextBtn.onclick = function () {
          setRoomDisplayMode('text');
        };
      }

      async function handleRefetchSongImage(btnEl) {
        var songs = getSnapshotSongs();
        var targetSong = songs[curIdx];
        if (!targetSong || !onRefetchSongImage) return;
        if (btnEl) {
          btnEl.disabled = true;
          btnEl.textContent = '⏳ กำลังค้นหาภาพใหม่…';
        }
        try {
          var loaded = await onRefetchSongImage(targetSong);
          if (loaded && Array.isArray(loaded.images) && loaded.images.length) {
            targetSong.images = loaded.images.slice();
            if (loaded._ctSongId) targetSong._ctSongId = loaded._ctSongId;
            if (loaded.src) targetSong.src = loaded.src;
            if (isHost && activeRoom && typeof service.broadcastRoomSetlist === 'function') {
              var synced = await service.broadcastRoomSetlist(activeRoom, songs);
              if (synced && synced.length) activeRoom.setlist_snapshot = synced;
            }
            onToast('ดึงภาพคอร์ด “' + targetSong.title + '” ใหม่สำเร็จ ✔');
            render();
            return;
          }
          onToast('ไม่พบภาพคอร์ดใหม่สำหรับเพลงนี้', true);
        } catch (err) {
          onToast('ค้นหาภาพใหม่ไม่สำเร็จ: ' + ((err && err.message) || err), true);
        }
        if (btnEl && btnEl.isConnected) {
          btnEl.disabled = false;
          btnEl.textContent = '🔍 ค้นหาและดึงภาพใหม่';
        }
      }

      var refetchImgBtn = rootEl.querySelector('#lrRefetchImgBtn');
      if (refetchImgBtn) {
        refetchImgBtn.onclick = function () {
          handleRefetchSongImage(refetchImgBtn);
        };
      }

      function showBrokenImgBox(imgEl) {
        if (!imgEl || !imgEl.isConnected || imgEl.dataset.errShown) return;
        imgEl.dataset.errShown = '1';
        imgEl.hidden = true;
        var box = document.createElement('div');
        box.className = 'sheetImgError';
        box.style.margin = '10px auto';
        box.innerHTML = '<div>ไม่สามารถโหลดภาพคอร์ดได้</div>';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px';
        var retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'small primary';
        retryBtn.textContent = '🔄 ลองโหลดใหม่';
        retryBtn.onclick = function () {
          box.remove();
          imgEl.hidden = false;
          delete imgEl.dataset.errShown;
          delete imgEl.dataset.fallbackTried;
          var orig = imgEl.dataset.origSrc || imgEl.src;
          if (orig) imgEl.src = orig;
        };
        row.appendChild(retryBtn);
        if (onRefetchSongImage) {
          var searchBtn = document.createElement('button');
          searchBtn.type = 'button';
          searchBtn.className = 'small';
          searchBtn.textContent = '🔍 ค้นหาและดึงภาพใหม่';
          searchBtn.onclick = function () {
            handleRefetchSongImage(searchBtn);
          };
          row.appendChild(searchBtn);
        }
        box.appendChild(row);
        imgEl.parentNode.insertBefore(box, imgEl.nextSibling);
      }

      rootEl.querySelectorAll('img[data-lr-img-key]').forEach(function (imgEl) {
        var key = imgEl.dataset.lrImgKey;
        if (!key || !resolveImageUrl) {
          showBrokenImgBox(imgEl);
          return;
        }
        resolveImageUrl(key).then(function (resolvedUrl) {
          if (resolvedUrl && imgEl.isConnected) {
            imgEl.dataset.origSrc = resolvedUrl;
            imgEl.src = resolvedUrl;
          } else if (imgEl.isConnected) {
            showBrokenImgBox(imgEl);
          }
        }).catch(function () {
          if (imgEl.isConnected) showBrokenImgBox(imgEl);
        });
      });

      rootEl.querySelectorAll('[data-lr-acc]').forEach(function (accBtn) {
        accBtn.onclick = function () {
          accidentalMode = accBtn.dataset.lrAcc || 'auto';
          render();
        };
      });

      rootEl.querySelectorAll('#lrChordSheet .ctv-chord-pill').forEach(function (pill) {
        pill.onclick = function () {
          if (onChordClick && pill.dataset.chord) {
            onChordClick(pill.dataset.chord);
          }
        };
      });

      var addSongBtn = rootEl.querySelector('#lrAddSongBtn');
      var quickSearchBtn = rootEl.querySelector('#lrQuickSearchBtn');
      var openRoomPicker = function () {
        if (!onAddSongRequest) return;
        onAddSongRequest({
          room: activeRoom,
          existingSongs: getSnapshotSongs(),
          onAddSong: function (song) { return hostAddSongToRoom(song); }
        });
      };
      if (addSongBtn) addSongBtn.onclick = openRoomPicker;
      if (quickSearchBtn) quickSearchBtn.onclick = openRoomPicker;

      rootEl.querySelectorAll('.lr-chord-img').forEach(function (img) {
        if (img.src && !img.dataset.origSrc) img.dataset.origSrc = img.src;
        img.onerror = function () {
          if (!img.dataset.fallbackTried) {
            img.dataset.fallbackTried = '1';
            if (/^https?:\/\//i.test(img.src) && !img.src.includes('wsrv.nl')) {
              img.src = 'https://wsrv.nl/?url=' + encodeURIComponent(img.src) + '&output=webp&q=85&w=1400&we';
              return;
            }
          }
          showBrokenImgBox(img);
        };
        img.onclick = function () {
          if (onOpenLightbox && img.src) onOpenLightbox(img.src);
        };
      });

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
