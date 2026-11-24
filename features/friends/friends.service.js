/* ==============================================================================
 * Mellow Chords — Friends & Band Groups Service
 * Zero-Build Vanilla ES6+ Classic Browser Script (IIFE)
 * Supports Supabase Cloud Mode + Local Offline/Demo Fallback
 * Exposes: window.MellowFriendsService
 * ============================================================================== */
(function (root) {
  'use strict';

  var LOCAL_KEY = 'mellowchords.friends.local.v1';

  var DEMO_USERS = [
    { id: 'local-u-tong', username: 'โต้ง กีตาร์', email: 'tong@mellowchords.local' },
    { id: 'local-u-beer', username: 'เบียร์ เบส', email: 'beer@mellowchords.local' },
    { id: 'local-u-new', username: 'นิว กลอง', email: 'new@mellowchords.local' },
    { id: 'local-u-min', username: 'มิน คีย์บอร์ด', email: 'min@mellowchords.local' },
    { id: 'local-u-pleng', username: 'เพลง นักร้อง', email: 'pleng@mellowchords.local' }
  ];

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function loadLocalState(me) {
    var fallback = {
      users: DEMO_USERS.slice(),
      friendships: [],
      bandGroups: [],
      bandGroupMembers: []
    };
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      if (!Array.isArray(parsed.users) || !parsed.users.length) parsed.users = DEMO_USERS.slice();
      if (!Array.isArray(parsed.friendships)) parsed.friendships = [];
      if (!Array.isArray(parsed.bandGroups)) parsed.bandGroups = [];
      if (!Array.isArray(parsed.bandGroupMembers)) parsed.bandGroupMembers = [];
      // Ensure current local user is present in users map
      if (me && me.id && !parsed.users.some(function (u) { return u.id === me.id; })) {
        parsed.users.unshift({ id: me.id, username: me.username || 'ฉัน', email: me.email || '' });
      }
      return parsed;
    } catch (_) {
      return fallback;
    }
  }

  function saveLocalState(state) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function createService(deps) {
    var getSupabase = deps && typeof deps.getSupabase === 'function' ? deps.getSupabase : function () { return null; };
    var getCurrentUser = deps && typeof deps.getCurrentUser === 'function' ? deps.getCurrentUser : function () { return null; };
    var isCloudActive = deps && typeof deps.isCloudActive === 'function' ? deps.isCloudActive : function () { return false; };

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

    /* ---------------- 1) Search Users ---------------- */
    async function searchUsers(query) {
      var q = String(query || '').trim();
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var req = sb
            .from('profiles')
            .select('id, username, email, status, is_active')
            .neq('id', me.id)
            .eq('status', 'approved')
            .eq('is_active', true)
            .order('username', { ascending: true })
            .limit(30);

          if (q) {
            var safe = q.replace(/[%_,]/g, '');
            req = req.or('username.ilike.%' + safe + '%,email.ilike.%' + safe + '%');
          }

          var res = await req;
          if (res.error) throw res.error;
          return { mode: 'cloud', users: res.data || [] };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var lower = q.toLowerCase();
      var list = state.users.filter(function (u) {
        if (u.id === me.id) return false;
        if (!lower) return true;
        return String(u.username || '').toLowerCase().includes(lower) ||
               String(u.email || '').toLowerCase().includes(lower);
      });
      return { mode: 'local', users: list };
    }

    /* ---------------- 2) Friendships ---------------- */
    async function listFriendships() {
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('friendships')
            .select('id, requester_id, addressee_id, status, created_at, updated_at')
            .or('requester_id.eq.' + me.id + ',addressee_id.eq.' + me.id)
            .order('updated_at', { ascending: false });

          if (res.error) throw res.error;
          var rows = res.data || [];
          var otherIds = Array.from(new Set(rows.map(function (r) {
            return r.requester_id === me.id ? r.addressee_id : r.requester_id;
          }).filter(Boolean)));

          var profileMap = {};
          if (otherIds.length) {
            var pRes = await sb.from('profiles').select('id, username, email').in('id', otherIds);
            if (!pRes.error && pRes.data) {
              pRes.data.forEach(function (p) { profileMap[p.id] = p; });
            }
          }

          return {
            mode: 'cloud',
            items: rows.map(function (r) {
              var isRequester = r.requester_id === me.id;
              var otherId = isRequester ? r.addressee_id : r.requester_id;
              var prof = profileMap[otherId] || { id: otherId, username: 'ผู้ใช้', email: '' };
              return {
                id: r.id,
                status: r.status,
                direction: isRequester ? 'outgoing' : 'incoming',
                otherUser: prof,
                created_at: r.created_at,
                updated_at: r.updated_at
              };
            })
          };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var userMap = {};
      state.users.forEach(function (u) { userMap[u.id] = u; });

      var items = state.friendships
        .filter(function (f) { return f.requester_id === me.id || f.addressee_id === me.id; })
        .map(function (f) {
          var isRequester = f.requester_id === me.id;
          var otherId = isRequester ? f.addressee_id : f.requester_id;
          var prof = userMap[otherId] || { id: otherId, username: 'ผู้ใช้', email: '' };
          return {
            id: f.id,
            status: f.status,
            direction: isRequester ? 'outgoing' : 'incoming',
            otherUser: prof,
            created_at: f.created_at,
            updated_at: f.updated_at
          };
        });
      return { mode: 'local', items: items };
    }

    async function sendFriendRequest(targetUserId) {
      var me = getMe();
      if (!targetUserId || targetUserId === me.id) {
        throw new Error('ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้');
      }

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('friendships')
            .insert({ requester_id: me.id, addressee_id: targetUserId, status: 'pending' })
            .select()
            .single();
          if (res.error) throw res.error;
          return { mode: 'cloud', friendship: res.data };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var dup = state.friendships.find(function (f) {
        return (f.requester_id === me.id && f.addressee_id === targetUserId) ||
               (f.requester_id === targetUserId && f.addressee_id === me.id);
      });
      if (dup) {
        if (dup.status === 'accepted') throw new Error('เป็นเพื่อนกันอยู่แล้ว');
        dup.status = 'pending';
        dup.requester_id = me.id;
        dup.addressee_id = targetUserId;
        dup.updated_at = new Date().toISOString();
        saveLocalState(state);
        return { mode: 'local', friendship: dup };
      }
      var row = {
        id: uid('fr'),
        requester_id: me.id,
        addressee_id: targetUserId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.friendships.unshift(row);
      saveLocalState(state);
      return { mode: 'local', friendship: row };
    }

    async function respondFriendRequest(friendshipId, status) {
      var me = getMe();
      var nextStatus = status === 'accepted' ? 'accepted' : 'declined';

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('friendships')
            .update({ status: nextStatus })
            .eq('id', friendshipId)
            .select()
            .single();
          if (res.error) throw res.error;
          return { mode: 'cloud', friendship: res.data };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var row = state.friendships.find(function (f) { return f.id === friendshipId; });
      if (!row) throw new Error('ไม่พบคำขอเป็นเพื่อนนี้');
      row.status = nextStatus;
      row.updated_at = new Date().toISOString();
      saveLocalState(state);
      return { mode: 'local', friendship: row };
    }

    async function removeFriendship(friendshipId) {
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb.from('friendships').delete().eq('id', friendshipId);
          if (res.error) throw res.error;
          return { mode: 'cloud' };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      state.friendships = state.friendships.filter(function (f) { return f.id !== friendshipId; });
      saveLocalState(state);
      return { mode: 'local' };
    }

    /* ---------------- 3) Band Groups & Members ---------------- */
    async function listBandGroups() {
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var gRes = await sb
            .from('band_groups')
            .select('id, name, description, owner_id, created_at, updated_at')
            .order('created_at', { ascending: false });
          if (gRes.error) throw gRes.error;
          var groups = gRes.data || [];
          var groupIds = groups.map(function (g) { return g.id; });

          var members = [];
          if (groupIds.length) {
            var mRes = await sb
              .from('band_group_members')
              .select('group_id, user_id, role, joined_at')
              .in('group_id', groupIds);
            if (mRes.error) throw mRes.error;
            members = mRes.data || [];
          }

          var allUserIds = Array.from(new Set(
            groups.map(function (g) { return g.owner_id; })
              .concat(members.map(function (m) { return m.user_id; }))
              .filter(Boolean)
          ));
          var profMap = {};
          if (allUserIds.length) {
            var pRes = await sb.from('profiles').select('id, username, email').in('id', allUserIds);
            if (!pRes.error && pRes.data) {
              pRes.data.forEach(function (p) { profMap[p.id] = p; });
            }
          }

          return {
            mode: 'cloud',
            groups: groups.map(function (g) {
              var gMembers = members
                .filter(function (m) { return m.group_id === g.id; })
                .map(function (m) {
                  var p = profMap[m.user_id] || { id: m.user_id, username: 'สมาชิก', email: '' };
                  return {
                    user_id: m.user_id,
                    role: m.role,
                    joined_at: m.joined_at,
                    username: p.username || (p.email ? p.email.split('@')[0] : 'สมาชิก'),
                    email: p.email || ''
                  };
                });
              return {
                id: g.id,
                name: g.name,
                description: g.description || '',
                owner_id: g.owner_id,
                isOwner: g.owner_id === me.id,
                members: gMembers,
                created_at: g.created_at
              };
            })
          };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var uMap = {};
      state.users.forEach(function (u) { uMap[u.id] = u; });
      uMap[me.id] = { id: me.id, username: me.username || 'ฉัน', email: me.email || '' };

      var groupsOut = state.bandGroups.map(function (g) {
        var gMembers = state.bandGroupMembers
          .filter(function (m) { return m.group_id === g.id; })
          .map(function (m) {
            var p = uMap[m.user_id] || { id: m.user_id, username: 'สมาชิก', email: '' };
            return {
              user_id: m.user_id,
              role: m.role,
              joined_at: m.joined_at,
              username: p.username || 'สมาชิก',
              email: p.email || ''
            };
          });
        return {
          id: g.id,
          name: g.name,
          description: g.description || '',
          owner_id: g.owner_id,
          isOwner: g.owner_id === me.id,
          members: gMembers,
          created_at: g.created_at
        };
      });

      return { mode: 'local', groups: groupsOut };
    }

    async function createBandGroup(name, description) {
      var cleanName = String(name || '').trim();
      if (!cleanName) throw new Error('กรุณาระบุชื่อกรุ๊ปวงดนตรี');
      var cleanDesc = String(description || '').trim();
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('band_groups')
            .insert({ name: cleanName, description: cleanDesc, owner_id: me.id })
            .select()
            .single();
          if (res.error) throw res.error;
          return { mode: 'cloud', group: res.data };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var group = {
        id: uid('grp'),
        name: cleanName,
        description: cleanDesc,
        owner_id: me.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.bandGroups.unshift(group);
      state.bandGroupMembers.push({
        group_id: group.id,
        user_id: me.id,
        role: 'owner',
        added_by: me.id,
        joined_at: new Date().toISOString()
      });
      saveLocalState(state);
      return { mode: 'local', group: group };
    }

    async function deleteBandGroup(groupId) {
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb.from('band_groups').delete().eq('id', groupId);
          if (res.error) throw res.error;
          return { mode: 'cloud' };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      state.bandGroups = state.bandGroups.filter(function (g) { return g.id !== groupId; });
      state.bandGroupMembers = state.bandGroupMembers.filter(function (m) { return m.group_id !== groupId; });
      saveLocalState(state);
      return { mode: 'local' };
    }

    async function addMemberToBandGroup(groupId, userId) {
      var me = getMe();
      if (!groupId || !userId) throw new Error('ข้อมูลไม่ครบถ้วน');

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('band_group_members')
            .upsert({ group_id: groupId, user_id: userId, role: 'member', added_by: me.id }, { onConflict: 'group_id,user_id' })
            .select()
            .single();
          if (res.error) throw res.error;
          return { mode: 'cloud', member: res.data };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      var exists = state.bandGroupMembers.some(function (m) {
        return m.group_id === groupId && m.user_id === userId;
      });
      if (!exists) {
        state.bandGroupMembers.push({
          group_id: groupId,
          user_id: userId,
          role: 'member',
          added_by: me.id,
          joined_at: new Date().toISOString()
        });
        saveLocalState(state);
      }
      return { mode: 'local' };
    }

    async function removeMemberFromBandGroup(groupId, userId) {
      var me = getMe();

      if (useCloud()) {
        var sb = getSupabase();
        try {
          var res = await sb
            .from('band_group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', userId);
          if (res.error) throw res.error;
          return { mode: 'cloud' };
        } catch (err) {
          if (!isMissingTableError(err)) throw err;
        }
      }

      var state = loadLocalState(me);
      state.bandGroupMembers = state.bandGroupMembers.filter(function (m) {
        return !(m.group_id === groupId && m.user_id === userId);
      });
      saveLocalState(state);
      return { mode: 'local' };
    }

    return {
      getMe: getMe,
      useCloud: useCloud,
      searchUsers: searchUsers,
      listFriendships: listFriendships,
      sendFriendRequest: sendFriendRequest,
      respondFriendRequest: respondFriendRequest,
      removeFriendship: removeFriendship,
      listBandGroups: listBandGroups,
      createBandGroup: createBandGroup,
      deleteBandGroup: deleteBandGroup,
      addMemberToBandGroup: addMemberToBandGroup,
      removeMemberFromBandGroup: removeMemberFromBandGroup
    };
  }

  root.MellowFriendsService = {
    createService: createService,
    DEMO_USERS: DEMO_USERS
  };
})(typeof window !== 'undefined' ? window : globalThis);
