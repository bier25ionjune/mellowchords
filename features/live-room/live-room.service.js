/* ==============================================================================
 * Mellow Chords — Real-time Live Room Service
 * Zero-Build Vanilla ES6+ Classic Browser Script (IIFE)
 * Supports Supabase Realtime (Presence + Broadcast + Postgres Changes)
 * and Local BroadcastChannel Cross-Tab Sync Fallback
 * Exposes: window.MellowLiveRoomService
 * ============================================================================== */
(function (root) {
  'use strict';

  var LOCAL_ROOMS_KEY = 'mellowchords.liverooms.local.v1';

  function genRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function genId(prefix) {
    return (prefix || 'rm') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function loadLocalRooms() {
    try {
      var raw = localStorage.getItem(LOCAL_ROOMS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveLocalRooms(rooms) {
    try {
      localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(rooms.slice(0, 30)));
    } catch (_) {}
  }

  function resolveSnapshotImages(song) {
    var out = [];
    var seen = new Set();
    function pushUrl(raw) {
      if (typeof raw !== 'string') return;
      var u = raw.trim();
      if (!u) return;
      var ctMatch = u.match(/^ct-img-(\d+)$/i);
      if (ctMatch) {
        u = 'https://chordtabs.in.th/img/nm/' + ctMatch[1] + '.png';
      }
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    if (Array.isArray(song.images)) {
      song.images.forEach(pushUrl);
    }
    if (!out.length && Array.isArray(song.imgUrls)) {
      song.imgUrls.forEach(pushUrl);
    }
    if (!out.length && song.imageUrl) {
      pushUrl(song.imageUrl);
    }
    if (!out.length && song._ctSongId) {
      pushUrl('https://chordtabs.in.th/img/nm/' + String(song._ctSongId) + '.png');
    }
    return out.slice(0, 12);
  }

  function sanitizeSongSnapshot(songs) {
    if (!Array.isArray(songs)) return [];
    return songs
      .filter(function (s) { return s && s.type !== 'break'; })
      .map(function (s) {
        var cached = (!s.chordpro_content && !s.parsedChordSheet && root.MellowChordParser && typeof root.MellowChordParser.getCachedParsedChord === 'function')
          ? root.MellowChordParser.getCachedParsedChord(s)
          : s.parsedChordSheet;
        var cpContent = s.chordpro_content || (cached && (cached.chordpro_content || cached.chordPro)) || '';
        var origKey = s.original_key || (cached && (cached.original_key || cached.originalKey)) || s.key || '';
        return {
          id: s.id || genId('song'),
          title: s.title || 'ไม่ระบุชื่อเพลง',
          artist: s.artist || '',
          key: origKey,
          original_key: origKey,
          chordpro_content: cpContent,
          source_domain: s.source_domain || (cached && cached.source_domain) || '',
          is_verified: Boolean(s.is_verified || (cached && cached.is_verified)),
          targetKey: s.targetKey || '',
          shift: typeof s.shift === 'number' && !isNaN(s.shift) ? s.shift : 0,
          text: s.text || '',
          images: resolveSnapshotImages(s),
          _ctSongId: s._ctSongId || null,
          parsedChordSheet: cached || s.parsedChordSheet || null
        };
      });
  }

  function createService(deps) {
    var getSupabase = deps && typeof deps.getSupabase === 'function' ? deps.getSupabase : function () { return null; };
    var getCurrentUser = deps && typeof deps.getCurrentUser === 'function' ? deps.getCurrentUser : function () { return null; };
    var isCloudActive = deps && typeof deps.isCloudActive === 'function' ? deps.isCloudActive : function () { return false; };

    var activeChannel = null;
    var activeBroadcast = null;
    var activeRoomId = null;
    var clientTabId = genId('tab');
    var localPresenceMap = new Map();

    function getMe() {
      var u = getCurrentUser();
      if (u && u.id) return u;
      return { id: 'local-me', username: 'นักดนตรี (Local)', email: 'local@mellowchords.local', isCloud: false };
    }

    function useCloud() {
      var sb = getSupabase();
      var u = getCurrentUser();
      return !!(sb && u && u.id && isCloudActive());
    }

    function isMissingTableError(err) {
      if (!err) return false;
      var msg = String(err.message || err.details || err.hint || '');
      return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table/i.test(msg);
    }

    /* ---------------- 1) Create Live Room ---------------- */
    async function createRoom(params) {
      var me = getMe();
      var name = String((params && params.name) || '').trim() || 'Live Session';
      var setlistId = params && params.setlistId ? String(params.setlistId) : null;
      var bandGroupId = params && params.bandGroupId ? String(params.bandGroupId) : null;
      var snapshot = sanitizeSongSnapshot(params && params.songs);
      if (!snapshot.length) {
        throw new Error('กรุณาเลือกเซ็ตลิสต์ที่มีอย่างน้อย 1 เพลง');
      }
      var invitedUserIds = Array.isArray(params && params.invitedUserIds)
        ? Array.from(new Set(params.invitedUserIds.filter(function (id) { return id && id !== me.id; })))
        : [];
      var roomCode = genRoomCode();
      var firstSong = snapshot[0];
      var initShift = typeof firstSong.shift === 'number' ? firstSong.shift : 0;

      var displayMode = (params && params.displayMode === 'text') ? 'text' : 'image';
      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('live_rooms')
            .insert({
              room_code: roomCode,
              name: name,
              host_id: me.id,
              band_group_id: bandGroupId,
              setlist_id: setlistId,
              setlist_snapshot: snapshot,
              current_song_index: 0,
              current_song_id: firstSong.id,
              current_key_shift: initShift,
              is_active: true
            })
            .select()
            .single();

          if (res.error) throw res.error;
          var created = res.data;
          created.display_mode = displayMode;
          try { localStorage.setItem('mellowchords.liveroom.mode.' + created.id, displayMode); } catch (_) {}

          if (invitedUserIds.length) {
            var memberRows = invitedUserIds.map(function (uid) {
              return { room_id: created.id, user_id: uid, role: 'member', status: 'invited' };
            });
            await sb.from('live_room_members').upsert(memberRows, { onConflict: 'room_id,user_id' });
          }

          return { mode: 'cloud', room: created };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var rooms = loadLocalRooms();
      var localRoom = {
        id: genId('room'),
        room_code: roomCode,
        name: name,
        host_id: me.id,
        host_name: me.username || 'Host',
        band_group_id: bandGroupId,
        display_mode: displayMode,
        setlist_id: setlistId,
        setlist_snapshot: snapshot,
        current_song_index: 0,
        current_song_id: firstSong.id,
        current_key_shift: initShift,
        is_active: true,
        invited_user_ids: invitedUserIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      rooms.unshift(localRoom);
      saveLocalRooms(rooms);
      return { mode: 'local', room: localRoom };
    }

    /* ---------------- 2) List Active Rooms / Invitations ---------------- */
    async function listMyRooms() {
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var mRes = await sb
            .from('live_room_members')
            .select('room_id, role, status')
            .eq('user_id', me.id);
          if (mRes.error) throw mRes.error;
          var memberRoomIds = (mRes.data || []).map(function (r) { return r.room_id; });

          var q = sb
            .from('live_rooms')
            .select('*')
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(20);

          if (memberRoomIds.length) {
            q = q.or('host_id.eq.' + me.id + ',id.in.(' + memberRoomIds.join(',') + ')');
          } else {
            q = q.eq('host_id', me.id);
          }

          var rRes = await q;
          if (rRes.error) throw rRes.error;
          return { mode: 'cloud', rooms: rRes.data || [] };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var rooms = loadLocalRooms().filter(function (r) { return r.is_active !== false; });
      return { mode: 'local', rooms: rooms };
    }

    /* ---------------- 3) Find / Join Room by Code or ID ---------------- */
    async function joinRoomByCode(codeOrId) {
      var key = String(codeOrId || '').trim();
      if (!key) throw new Error('กรุณากรอกโค้ดห้อง');
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var upper = key.toUpperCase();
          var res = await sb
            .from('live_rooms')
            .select('*')
            .or('room_code.eq.' + upper + ',id.eq.' + key)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          if (res.error) throw res.error;
          if (!res.data) throw new Error('ไม่พบห้องที่เปิดอยู่ด้วยโค้ดนี้');

          var room = res.data;
          if (room.host_id !== me.id) {
            await sb
              .from('live_room_members')
              .upsert({ room_id: room.id, user_id: me.id, role: 'member', status: 'joined' }, { onConflict: 'room_id,user_id' });
          }
          return { mode: 'cloud', room: room };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var rooms = loadLocalRooms();
      var upperCode = key.toUpperCase();
      var found = rooms.find(function (r) {
        return r.is_active !== false && (String(r.room_code || '').toUpperCase() === upperCode || r.id === key);
      });
      if (!found) throw new Error('ไม่พบห้องที่เปิดอยู่ด้วยโค้ดนี้');
      return { mode: 'local', room: found };
    }

    /* ---------------- 4) Invite More Members (Individual or Band Group) ---------------- */
    async function inviteMembers(roomId, userIds) {
      var me = getMe();
      var cleanIds = Array.from(new Set((userIds || []).filter(function (id) { return id && id !== me.id; })));
      if (!cleanIds.length) return { count: 0 };

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var rows = cleanIds.map(function (uid) {
            return { room_id: roomId, user_id: uid, role: 'member', status: 'invited' };
          });
          var res = await sb.from('live_room_members').upsert(rows, { onConflict: 'room_id,user_id' });
          if (res.error) throw res.error;
          return { mode: 'cloud', count: cleanIds.length };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var rooms = loadLocalRooms();
      var room = rooms.find(function (r) { return r.id === roomId; });
      if (room) {
        var existing = Array.isArray(room.invited_user_ids) ? room.invited_user_ids : [];
        room.invited_user_ids = Array.from(new Set(existing.concat(cleanIds)));
        saveLocalRooms(rooms);
      }
      return { mode: 'local', count: cleanIds.length };
    }

    /* ---------------- 5) Subscribe to Realtime Room Channel ---------------- */
    function unsubscribe() {
      if (activeChannel) {
        try {
          var sb = getSupabase();
          if (sb && typeof sb.removeChannel === 'function') {
            sb.removeChannel(activeChannel);
          } else if (typeof activeChannel.unsubscribe === 'function') {
            activeChannel.unsubscribe();
          }
        } catch (_) {}
        activeChannel = null;
      }
      if (activeBroadcast) {
        try {
          activeBroadcast.postMessage({ type: 'presence_bye', clientTabId: clientTabId });
          activeBroadcast.close();
        } catch (_) {}
        activeBroadcast = null;
      }
      localPresenceMap.clear();
      activeRoomId = null;
    }

    function subscribeToRoom(room, opts) {
      unsubscribe();
      if (!room || !room.id) return;
      activeRoomId = room.id;

      var me = getMe();
      var role = (opts && opts.role) || (room.host_id === me.id ? 'host' : 'member');
      var displayName = (opts && opts.displayName) || me.username || (role === 'host' ? 'Host' : 'สมาชิก');
      var onPresenceChange = opts && typeof opts.onPresenceChange === 'function' ? opts.onPresenceChange : function () {};
      var onStateSync = opts && typeof opts.onStateSync === 'function' ? opts.onStateSync : function () {};
      var onSetlistSync = opts && typeof opts.onSetlistSync === 'function' ? opts.onSetlistSync : function () {};
      var onRoomClosed = opts && typeof opts.onRoomClosed === 'function' ? opts.onRoomClosed : function () {};

      // Cloud Supabase Realtime (Presence + Broadcast + Postgres Changes)
      if (useCloud() && !String(room.id).startsWith('room-')) {
        var sb = getSupabase();
        var channelName = 'live-room:' + room.id;
        var ch = sb.channel(channelName, {
          config: {
            presence: { key: me.id + ':' + clientTabId },
            broadcast: { self: false }
          }
        });

        ch.on('presence', { event: 'sync' }, function () {
          var presenceState = ch.presenceState();
          var online = [];
          var seen = new Set();
          Object.keys(presenceState || {}).forEach(function (k) {
            var arr = presenceState[k];
            if (!Array.isArray(arr)) return;
            arr.forEach(function (entry) {
              var dedupeKey = entry.user_id + ':' + (entry.tab_id || k);
              if (seen.has(dedupeKey)) return;
              seen.add(dedupeKey);
              online.push({
                user_id: entry.user_id,
                username: entry.username || 'สมาชิก',
                role: entry.role || 'member',
                online_at: entry.online_at
              });
            });
          });
          onPresenceChange(online);
        });

        ch.on('broadcast', { event: 'room_state_sync' }, function (msg) {
          if (msg && msg.payload) {
            onStateSync(msg.payload);
          }
        });

        ch.on('broadcast', { event: 'setlist_sync' }, function (msg) {
          if (msg && msg.payload && Array.isArray(msg.payload.setlist_snapshot)) {
            onSetlistSync(msg.payload.setlist_snapshot);
          }
        });

        ch.on('broadcast', { event: 'room_closed' }, function () {
          onRoomClosed();
        });

        ch.on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'live_rooms', filter: 'id=eq.' + room.id },
          function (payload) {
            var row = payload && payload.new;
            if (!row) return;
            if (row.is_active === false) {
              onRoomClosed();
              return;
            }
            if (Array.isArray(row.setlist_snapshot)) {
              onSetlistSync(row.setlist_snapshot);
            }
            onStateSync({
              current_song_index: row.current_song_index,
              current_song_id: row.current_song_id,
              current_key_shift: row.current_key_shift,
              source: 'db'
            });
          }
        );

        ch.subscribe(async function (status) {
          if (status === 'SUBSCRIBED') {
            try {
              await ch.track({
                user_id: me.id,
                tab_id: clientTabId,
                username: displayName,
                role: role,
                online_at: new Date().toISOString()
              });
            } catch (_) {}
          }
        });

        activeChannel = ch;
        return;
      }

      // Local / Offline Cross-Tab Realtime via BroadcastChannel
      var myPresence = {
        clientTabId: clientTabId,
        user_id: role === 'host' ? me.id : (me.id + '-' + clientTabId.slice(-4)),
        username: displayName,
        role: role,
        online_at: new Date().toISOString()
      };
      localPresenceMap.set(clientTabId, myPresence);
      onPresenceChange(Array.from(localPresenceMap.values()));

      if (typeof BroadcastChannel !== 'undefined') {
        var bc = new BroadcastChannel('mellowchords-live-room-' + room.id);
        bc.onmessage = function (ev) {
          var data = ev && ev.data;
          if (!data || data.clientTabId === clientTabId) return;

          if (data.type === 'presence_hello') {
            if (data.member) {
              localPresenceMap.set(data.clientTabId, data.member);
              onPresenceChange(Array.from(localPresenceMap.values()));
            }
            bc.postMessage({ type: 'presence_pong', clientTabId: clientTabId, member: myPresence });
          } else if (data.type === 'presence_pong') {
            if (data.member) {
              localPresenceMap.set(data.clientTabId, data.member);
              onPresenceChange(Array.from(localPresenceMap.values()));
            }
          } else if (data.type === 'presence_bye') {
            localPresenceMap.delete(data.clientTabId);
            onPresenceChange(Array.from(localPresenceMap.values()));
          } else if (data.type === 'room_state_sync' && data.payload) {
            onStateSync(data.payload);
          } else if (data.type === 'setlist_sync' && data.payload && Array.isArray(data.payload.setlist_snapshot)) {
            onSetlistSync(data.payload.setlist_snapshot);
          } else if (data.type === 'room_closed') {
            onRoomClosed();
          }
        };
        bc.postMessage({ type: 'presence_hello', clientTabId: clientTabId, member: myPresence });
        activeBroadcast = bc;
      }
    }

    /* ---------------- 6) Broadcast & Persist Host Room State ---------------- */
    async function broadcastRoomState(room, nextState) {
      if (!room || !room.id) return;
      var payload = {
        current_song_index: Number(nextState.current_song_index) || 0,
        current_song_id: nextState.current_song_id || null,
        current_key_shift: Number(nextState.current_key_shift) || 0,
        display_mode: nextState.display_mode === 'text' ? 'text' : (nextState.display_mode === 'image' ? 'image' : (room.display_mode || 'image')),
        source: nextState.source || 'ui',
        ts: Date.now()
      };
      room.display_mode = payload.display_mode;
      try { localStorage.setItem('mellowchords.liveroom.mode.' + room.id, payload.display_mode); } catch (_) {}

      // 1) Ultra-low-latency Broadcast
      if (activeChannel && typeof activeChannel.send === 'function') {
        try {
          activeChannel.send({
            type: 'broadcast',
            event: 'room_state_sync',
            payload: payload
          });
        } catch (_) {}
      }
      if (activeBroadcast) {
        try {
          activeBroadcast.postMessage({
            type: 'room_state_sync',
            clientTabId: clientTabId,
            payload: payload
          });
        } catch (_) {}
      }

      // 2) Persist authoritative state
      if (useCloud() && !String(room.id).startsWith('room-')) {
        var sb = getSupabase();
        try {
          await sb
            .from('live_rooms')
            .update({
              current_song_index: payload.current_song_index,
              current_song_id: payload.current_song_id,
              current_key_shift: payload.current_key_shift
            })
            .eq('id', room.id);
        } catch (_) {}
      } else {
        var rooms = loadLocalRooms();
        var target = rooms.find(function (r) { return r.id === room.id; });
        if (target) {
          target.current_song_index = payload.current_song_index;
          target.current_song_id = payload.current_song_id;
          target.current_key_shift = payload.current_key_shift;
          target.display_mode = payload.display_mode;
          target.updated_at = new Date().toISOString();
          saveLocalRooms(rooms);
        }
      }
    }

    /* ---------------- 6B) Broadcast & Persist Updated Room Setlist ---------- */
    async function broadcastRoomSetlist(room, rawSongs) {
      if (!room || !room.id) return [];
      var snapshot = sanitizeSongSnapshot(rawSongs);
      var payload = {
        setlist_snapshot: snapshot,
        ts: Date.now()
      };

      if (activeChannel && typeof activeChannel.send === 'function') {
        try {
          activeChannel.send({
            type: 'broadcast',
            event: 'setlist_sync',
            payload: payload
          });
        } catch (_) {}
      }
      if (activeBroadcast) {
        try {
          activeBroadcast.postMessage({
            type: 'setlist_sync',
            clientTabId: clientTabId,
            payload: payload
          });
        } catch (_) {}
      }

      if (useCloud() && !String(room.id).startsWith('room-')) {
        var sb = getSupabase();
        try {
          await sb
            .from('live_rooms')
            .update({ setlist_snapshot: snapshot })
            .eq('id', room.id);
        } catch (_) {}
      } else {
        var rooms = loadLocalRooms();
        var target = rooms.find(function (r) { return r.id === room.id; });
        if (target) {
          target.setlist_snapshot = snapshot;
          target.updated_at = new Date().toISOString();
          saveLocalRooms(rooms);
        }
      }
      return snapshot;
    }

    /* ---------------- 7) Close Room (Host) ---------------- */
    async function closeRoom(room) {
      if (!room || !room.id) return;

      if (activeChannel && typeof activeChannel.send === 'function') {
        try {
          activeChannel.send({ type: 'broadcast', event: 'room_closed', payload: { ts: Date.now() } });
        } catch (_) {}
      }
      if (activeBroadcast) {
        try {
          activeBroadcast.postMessage({ type: 'room_closed', clientTabId: clientTabId });
        } catch (_) {}
      }

      if (useCloud() && !String(room.id).startsWith('room-')) {
        var sb = getSupabase();
        try {
          await sb.from('live_rooms').update({ is_active: false }).eq('id', room.id);
        } catch (_) {}
      } else {
        var rooms = loadLocalRooms();
        var target = rooms.find(function (r) { return r.id === room.id; });
        if (target) {
          target.is_active = false;
          target.updated_at = new Date().toISOString();
          saveLocalRooms(rooms);
        }
      }

      unsubscribe();
    }

    return {
      getMe: getMe,
      useCloud: useCloud,
      createRoom: createRoom,
      listMyRooms: listMyRooms,
      joinRoomByCode: joinRoomByCode,
      inviteMembers: inviteMembers,
      subscribeToRoom: subscribeToRoom,
      broadcastRoomState: broadcastRoomState,
      broadcastRoomSetlist: broadcastRoomSetlist,
      closeRoom: closeRoom,
      unsubscribe: unsubscribe,
      getActiveRoomId: function () { return activeRoomId; }
    };
  }

  root.MellowLiveRoomService = {
    createService: createService
  };
})(typeof window !== 'undefined' ? window : globalThis);
